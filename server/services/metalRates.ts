/**
 * Metal Rate auto-refresh service
 * ───────────────────────────────
 * Pulls live precious-metal spot prices from GoldAPI.io once per day and
 * upserts a `MetalRate` row per (company, metalType, purity) for "today".
 *
 * Free plan: 100 requests / month. We make at most 2 calls per day
 * (XAU/INR + XAG/INR) → ~60 req/month, well inside the quota.
 *
 * Configuration (server/config.ts):
 *   GOLD_API_KEY              required to enable auto-fetch
 *   METAL_RATE_MARKUP_PERCENT optional retail markup applied on top of spot
 *   METAL_RATE_AUTO_REFRESH   defaults true when GOLD_API_KEY is set
 *   METAL_RATE_REFRESH_HOUR   hour-of-day (0-23) for the daily run
 *
 * The fetched rate is the international spot value converted to per-gram
 * for the matching karat. It does NOT include import duty / GST / jeweller
 * premium — the cashier should still review before saving any voucher.
 */

import { prisma } from '../prisma';
import { config } from '../config';
import { logger } from '../logger';

interface GoldApiResponse {
  metal: string;
  currency: string;
  price: number;            // per troy ounce in `currency`
  price_gram_24k?: number;  // present for XAU
  price_gram_22k?: number;
  price_gram_21k?: number;
  price_gram_20k?: number;
  price_gram_18k?: number;
  price_gram_16k?: number;
  price_gram_14k?: number;
  price_gram_10k?: number;
  // For XAG the response only has `price` (per oz). 1 troy oz = 31.1035 g.
}

const TROY_OUNCE_GRAMS = 31.1034768;

/** Map our purity codes → GoldAPI per-gram field name (gold only). */
const GOLD_PURITY_TO_FIELD: Record<string, keyof GoldApiResponse> = {
  '999': 'price_gram_24k',
  '916': 'price_gram_22k',
  '875': 'price_gram_21k',
  '750': 'price_gram_18k',
  '585': 'price_gram_14k',
};

async function fetchGoldApi(metal: 'XAU' | 'XAG'): Promise<GoldApiResponse> {
  const url = `${config.goldApiUrl}/${metal}/INR`;
  const res = await fetch(url, {
    headers: {
      'x-access-token': config.goldApiKey,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GoldAPI ${metal}/INR ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as GoldApiResponse;
}

/** Truncate to UTC midnight so the unique (companyId, metalTypeId, purityCode, date) holds for the day. */
function startOfToday(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function applyMarkup(rate: number): number {
  const mult = 1 + (config.metalRateMarkupPercent || 0) / 100;
  return Math.round(rate * mult * 100) / 100;
}

/**
 * Refresh today's metal rates for every company in the database.
 * Returns a summary; does NOT throw — failures are logged so the cron stays alive.
 */
export async function refreshMetalRates(opts: { force?: boolean } = {}): Promise<{
  ok: boolean;
  inserted: number;
  skipped: number;
  error?: string;
}> {
  if (!config.goldApiKey) {
    return { ok: false, inserted: 0, skipped: 0, error: 'GOLD_API_KEY not configured' };
  }

  const today = startOfToday();
  let inserted = 0;
  let skipped = 0;

  try {
    const companies = await prisma.company.findMany({ select: { id: true } });
    if (companies.length === 0) {
      return { ok: true, inserted: 0, skipped: 0 };
    }

    const goldType = await prisma.metalType.findFirst({ where: { name: 'Gold' } });
    const silverType = await prisma.metalType.findFirst({ where: { name: 'Silver' } });

    let goldData: GoldApiResponse | null = null;
    let silverData: GoldApiResponse | null = null;

    if (goldType) {
      try { goldData = await fetchGoldApi('XAU'); }
      catch (err) { logger.error('metalRates: gold fetch failed', { err: String(err) }); }
    }
    if (silverType) {
      try { silverData = await fetchGoldApi('XAG'); }
      catch (err) { logger.error('metalRates: silver fetch failed', { err: String(err) }); }
    }

    if (!goldData && !silverData) {
      return { ok: false, inserted: 0, skipped: 0, error: 'all upstream fetches failed' };
    }

    const purities = await prisma.purity.findMany({ where: { isActive: true } });

    for (const company of companies) {
      // Gold
      if (goldData && goldType) {
        for (const purity of purities) {
          const field = GOLD_PURITY_TO_FIELD[purity.code];
          if (!field) continue;
          const raw = goldData[field] as number | undefined;
          if (!raw || raw <= 0) continue;
          const rate = applyMarkup(raw);
          const result = await upsertRate(company.id, goldType.id, purity.code, today, rate, opts.force);
          if (result === 'inserted') inserted++; else skipped++;
        }
      }
      // Silver — derive per-gram from spot/oz, scale by purity %
      if (silverData && silverType) {
        const silverPerGramPure = silverData.price / TROY_OUNCE_GRAMS;
        for (const purity of purities) {
          if (!purity.code.startsWith('S')) continue;
          const rate = applyMarkup(silverPerGramPure * (Number(purity.percentage) / 100));
          if (rate <= 0) continue;
          const result = await upsertRate(company.id, silverType.id, purity.code, today, rate, opts.force);
          if (result === 'inserted') inserted++; else skipped++;
        }
      }
    }

    logger.info('metalRates: refresh complete', { inserted, skipped, markup: config.metalRateMarkupPercent });
    return { ok: true, inserted, skipped };
  } catch (err: any) {
    logger.error('metalRates: refresh failed', { err: err?.message, stack: err?.stack });
    return { ok: false, inserted, skipped, error: err?.message || 'unknown' };
  }
}

async function upsertRate(
  companyId: number,
  metalTypeId: number,
  purityCode: string,
  date: Date,
  rate: number,
  force: boolean | undefined,
): Promise<'inserted' | 'skipped'> {
  const existing = await prisma.metalRate.findUnique({
    where: {
      companyId_metalTypeId_purityCode_date: { companyId, metalTypeId, purityCode, date },
    },
  });
  if (existing && !force) return 'skipped';
  if (existing && force) {
    await prisma.metalRate.update({ where: { id: existing.id }, data: { rate, isActive: true } });
    return 'inserted';
  }
  await prisma.metalRate.create({
    data: { companyId, metalTypeId, purityCode, date, rate, isActive: true },
  });
  return 'inserted';
}

let dailyTimer: NodeJS.Timeout | null = null;

/**
 * Schedule a daily fetch at config.metalRateRefreshHour (server local time).
 * Also runs an immediate fetch on startup if today's rates are missing.
 * Idempotent — safe to call once at boot.
 */
export function startMetalRateScheduler(): void {
  if (!config.metalRateAutoRefresh) {
    logger.info('metalRates: auto-refresh disabled');
    return;
  }
  if (dailyTimer) return; // already scheduled

  // Initial run on startup (skips if today's rate already exists).
  void refreshMetalRates().then((r) => {
    if (!r.ok && r.error) logger.warn('metalRates: initial refresh did not complete', { error: r.error });
  });

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(config.metalRateRefreshHour, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const delay = next.getTime() - now.getTime();
    dailyTimer = setTimeout(async () => {
      await refreshMetalRates();
      scheduleNext();
    }, delay);
    // Don't keep the event loop alive just for this timer.
    if (typeof dailyTimer.unref === 'function') dailyTimer.unref();
    logger.info('metalRates: next refresh scheduled', { at: next.toISOString() });
  };

  scheduleNext();
}

export function stopMetalRateScheduler(): void {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
}
