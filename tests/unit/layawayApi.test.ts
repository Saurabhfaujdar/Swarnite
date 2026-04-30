// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression tests for layawayAPI.byVoucherNo.
 *
 * Background:
 *   Voucher numbers contain a "/" (e.g. "LY/5"). An earlier
 *   implementation embedded the encoded value directly in the URL
 *   path (`/layaway/by-voucher/LY%2F5`). Express decodes %2F back to
 *   "/" before route matching, so the request fell through to the
 *   `/:id` handler with id="by-voucher" and 500'd.
 *
 *   The fix uses a query parameter (`?voucherNo=LY/5`) which axios
 *   serialises safely and the server reads from req.query. These
 *   tests lock in that contract from the client side.
 */

// Mock axios.create so we can capture exactly what the client sends.
// Use vi.hoisted so the mock fn exists before vi.mock runs.
const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));
vi.mock('axios', () => ({
  default: {
    create: () => ({
      get: mockGet,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    }),
    isAxiosError: vi.fn(),
  },
}));

// Stub the auth store / config helpers used by api.ts during import.
vi.mock('../../src/lib/auth', () => ({
  useAuthStore: { getState: () => ({ token: null }) },
}));
vi.mock('../../src/lib/config', () => ({
  getConfig: () => ({ apiUrl: 'http://test/api' }),
}));

import { layawayAPI } from '../../src/lib/api';

describe('layawayAPI.byVoucherNo', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockGet.mockResolvedValue({ data: {} });
  });

  it('issues GET /layaway/by-voucher with voucherNo as a query parameter', async () => {
    await layawayAPI.byVoucherNo('LY/5');

    expect(mockGet).toHaveBeenCalledTimes(1);
    const [url, opts] = mockGet.mock.calls[0];
    expect(url).toBe('/layaway/by-voucher');
    expect(opts).toEqual({ params: { voucherNo: 'LY/5' } });
  });

  it('does NOT inline the slash-bearing voucher number into the URL path', async () => {
    // Guards against regressing to `/layaway/by-voucher/LY%2F5` or
    // `/layaway/by-voucher/LY/5`, both of which break server routing.
    await layawayAPI.byVoucherNo('LY/5');

    const [url] = mockGet.mock.calls[0];
    expect(url).not.toContain('LY');
    expect(url).not.toContain('%2F');
    expect(url.split('/')).toHaveLength(3); // ['', 'layaway', 'by-voucher']
  });

  it('passes the voucher number through axios params (axios handles encoding)', async () => {
    await layawayAPI.byVoucherNo('JGI/2026/001');

    const [, opts] = mockGet.mock.calls[0];
    expect(opts.params.voucherNo).toBe('JGI/2026/001');
  });
});
