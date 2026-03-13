/**
 * Structured Logger
 * ─────────────────
 * JSON logger for production, human-readable for development.
 * Import and use instead of console.log.
 */

import { config } from './config';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel = LEVEL_PRIORITY[config.logLevel as LogLevel] ?? LEVEL_PRIORITY.info;

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= currentLevel;
}

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };

  if (config.isDev) {
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    return `[${entry.timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
  }
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('debug')) console.debug(formatMessage('debug', message, meta));
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('info')) console.info(formatMessage('info', message, meta));
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('warn')) console.warn(formatMessage('warn', message, meta));
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (shouldLog('error')) console.error(formatMessage('error', message, meta));
  },
};
