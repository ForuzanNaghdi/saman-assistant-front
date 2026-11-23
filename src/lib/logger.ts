import { newId } from './ids';

/*
 * Structured logging for the assistant UI.
 *
 * Design rules (see docs/observability.md):
 * - Only allowlisted fields leave this module; anything derived from free
 *   text or an Error object is scrubbed first.
 * - Logging must never break the app: every sink and formatter runs inside a
 *   guard, a failing sink is dropped, and the HTTP sink disables itself after
 *   repeated failures instead of retrying in a loop.
 * - Repeated failures are collapsed per event/route/code within a time window,
 *   and the whole pipeline has a per-minute ceiling.
 * - A destination is optional. Without VITE_LOG_ENDPOINT the app keeps a small
 *   in-memory ring buffer (support/debug) and, in development only, prints to
 *   the console. Console output alone is not a production destination.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ErrorKind =
  | 'network'
  | 'timeout'
  | 'abort'
  | 'http'
  | 'contract'
  | 'parse'
  | 'runtime'
  | 'unknown';

export interface LogFields {
  message: string;
  operationId?: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
  errorKind?: ErrorKind;
  route?: string;
  method?: string;
  attempt?: number;
  stage?: string;
  result?: string;
  count?: number;
  bytes?: number;
  chunks?: number;
  deltaCount?: number;
  firstEventMs?: number;
  firstDeltaMs?: number;
  resource?: string;
  stack?: string;
}

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  event: string;
  message: string;
  environment: string;
  release: string;
  operationId: string;
  requestId?: string;
  correlationId?: string;
  durationMs?: number;
  errorCode?: string;
  httpStatus?: number;
  errorKind?: ErrorKind;
  route?: string;
  method?: string;
  attempt?: number;
  stage?: string;
  result?: string;
  count?: number;
  bytes?: number;
  chunks?: number;
  deltaCount?: number;
  firstEventMs?: number;
  firstDeltaMs?: number;
  resource?: string;
  suppressed?: number;
  stack?: string;
}

export type LogSink = (records: LogRecord[]) => void | Promise<void>;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const DEFAULT_MESSAGE = 'رخداد ثبت شد.';
const MAX_MESSAGE_LENGTH = 240;
const MAX_STACK_LINES = 6;
const MAX_STACK_LINE_LENGTH = 180;
const REDACTED = '[redacted]';

function readEnv(key: string): string | undefined {
  try {
    const env = import.meta.env as unknown as Record<string, string | boolean | undefined>;
    const value = env[key];
    return typeof value === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

function isDevelopment(): boolean {
  try {
    return import.meta.env.DEV === true;
  } catch {
    return false;
  }
}

function isLogLevel(value: string | undefined): value is LogLevel {
  return value === 'debug' || value === 'info' || value === 'warn' || value === 'error';
}

export function resolveEnvironment(): string {
  return readEnv('VITE_ENVIRONMENT') ?? readEnv('MODE') ?? 'development';
}

export function resolveRelease(): string {
  try {
    if (typeof __APP_RELEASE__ === 'string' && __APP_RELEASE__) return __APP_RELEASE__;
  } catch {
    // The define is absent outside a Vite build (tests, SSR).
  }
  return readEnv('VITE_RELEASE') ?? 'unknown';
}

function resolveLevel(): LogLevel {
  const configured = readEnv('VITE_LOG_LEVEL')?.toLowerCase();
  if (isLogLevel(configured)) return configured;
  return isDevelopment() ? 'debug' : 'info';
}

/** Random id that ties the log records of one client operation together. */
export function createOperationId(): string {
  return newId();
}

/**
 * Keeps only characters that are safe for identifiers. Use this for backend
 * request ids and correlation ids: they are allowed to leave the app but must
 * not carry free text.
 */
export function sanitizeIdentifier(value: unknown, maxLength = 80): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, maxLength);
}

/**
 * Scrubs a free-text value before it reaches a sink. It removes credentials,
 * URLs (query strings included), file paths and file names, raw ids and email
 * addresses, then collapses whitespace and truncates.
 */
export function sanitizeText(value: unknown, maxLength = MAX_MESSAGE_LENGTH): string {
  if (value === null || value === undefined) return '';

  let text = typeof value === 'string' ? value : String(value);
  text = text.replace(/[\u0000-\u001f\u007f]+/g, ' ');
  text = text.replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`);
  text = text.replace(
    /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
    REDACTED,
  );
  text = text.replace(
    /\b(token|api[-_]?key|apikey|secret|password|passwd|authorization|cookie)\b\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1=[redacted]',
  );
  text = text.replace(/\b[0-9a-f]{32,}\b/gi, REDACTED);
  text = text.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
    '[redacted-id]',
  );
  text = text.replace(
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
    '[redacted-email]',
  );
  text = text.replace(/https?:\/\/[^\s"'<>]+/gi, '[url]');
  text = text.replace(
    /(?:[A-Za-z]:\\|\/(?:Users|home|var|tmp|opt|etc)\/|~\/)[^\s"'<>]+/g,
    '[path]',
  );
  text = text.replace(
    /[^\s/\\]+\.(?:pdf|docx?|txt|png|jpe?g|zip|csv|xlsx?|json|env)\b/gi,
    '[file]',
  );
  text = text.replace(/\s+/g, ' ').trim();

  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

export function sanitizeStack(stack: unknown): string {
  if (typeof stack !== 'string' || !stack.trim()) return '';
  return stack
    .split(/\r?\n/)
    .slice(0, MAX_STACK_LINES)
    .map((line) => sanitizeText(line, MAX_STACK_LINE_LENGTH))
    .join(' | ')
    .slice(0, MAX_STACK_LINES * (MAX_STACK_LINE_LENGTH + 3));
}

/**
 * Turns a URL or path into a stable route template: no query string, no raw
 * session/turn ids, bounded length. `/chat/sessions/<uuid>/turns` becomes
 * `/chat/sessions/:id/turns`.
 */
export function sanitizeRoute(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '/';

  let path = raw.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return '/';
    }
  }

  const query = path.indexOf('?');
  if (query !== -1) path = path.slice(0, query);
  const hash = path.indexOf('#');
  if (hash !== -1) path = path.slice(0, hash);

  path = path.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/:id',
  );
  path = path.replace(/\/\d+/g, '/:id');
  path = path.replace(/\/[A-Za-z0-9._~%-]{24,}/g, '/:id');
  path = path.replace(/\/{2,}/g, '/');

  return path.slice(0, 120) || '/';
}

export interface ErrorDetails {
  message: string;
  errorKind: ErrorKind;
  errorCode?: string;
  httpStatus?: number;
  requestId?: string;
  stack?: string;
}

function kindForError(name: string, message: string, status: number | undefined): ErrorKind {
  if (name === 'AbortError') return 'abort';
  if (name === 'TimeoutError') return 'timeout';
  if (status !== undefined) return 'http';
  if (name === 'TypeError' && /fetch|network|load failed/i.test(message)) return 'network';
  if (name === 'SyntaxError') return 'parse';
  return 'runtime';
}

/**
 * Extracts only allowlisted fields from an unknown error. Never spread the
 * error object: arbitrary properties (request bodies, ids, user content) must
 * not reach a sink.
 */
export function describeError(error: unknown, includeMessage = true): ErrorDetails {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      name?: unknown;
      message?: unknown;
      code?: unknown;
      status?: unknown;
      requestId?: unknown;
      stack?: unknown;
    };
    const name = typeof candidate.name === 'string' ? candidate.name : '';
    const rawMessage = typeof candidate.message === 'string' ? candidate.message : '';
    const status =
      typeof candidate.status === 'number' && Number.isFinite(candidate.status)
        ? Math.trunc(candidate.status)
        : undefined;
    const errorKind = kindForError(name, rawMessage, status);

    const details: ErrorDetails = {
      message: includeMessage ? sanitizeText(rawMessage) : '',
      errorKind,
    };
    if (typeof candidate.code === 'string' && candidate.code) {
      details.errorCode = sanitizeIdentifier(candidate.code, 64);
    }
    if (status !== undefined) details.httpStatus = status;
    if (typeof candidate.requestId === 'string' && candidate.requestId) {
      details.requestId = sanitizeIdentifier(candidate.requestId);
    }
    if (typeof candidate.stack === 'string' && candidate.stack) {
      details.stack = sanitizeStack(candidate.stack);
    }
    return details;
  }

  if (typeof error === 'string') {
    return { message: includeMessage ? sanitizeText(error) : '', errorKind: 'unknown' };
  }
  return { message: '', errorKind: 'unknown' };
}

function sanitizeEventName(event: string): string {
  const cleaned = String(event)
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .slice(0, 64);
  return cleaned || 'unknown';
}

function safeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : undefined;
}

function safeStatus(value: unknown): number | undefined {
  const status = safeNumber(value);
  return status !== undefined && status >= 100 && status <= 599 ? status : undefined;
}

function safeMethod(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const method = value.toUpperCase();
  return /^[A-Z]{3,7}$/.test(method) ? method : undefined;
}

function isPromiseLike(value: unknown): value is Promise<void> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Promise<void>).then === 'function'
  );
}

/** Development-only console destination. */
export const consoleSink: LogSink = (records) => {
  for (const record of records) {
    switch (record.level) {
      case 'error':
        console.error(`[saman] ${record.event}`, record);
        break;
      case 'warn':
        console.warn(`[saman] ${record.event}`, record);
        break;
      default:
        console.log(`[saman] ${record.event}`, record);
        break;
    }
  }
};

/**
 * Accepts only same-origin endpoints. Keeping the browser away from arbitrary
 * hosts prevents the endpoint from becoming a data-exfiltration channel.
 */
function isAllowedEndpoint(endpoint: string): boolean {
  if (endpoint.startsWith('/')) return true;
  try {
    if (typeof window === 'undefined') return false;
    return new URL(endpoint).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Batched HTTP sink. A failed request is dropped (never retried in a loop);
 * after three consecutive failures the sink pauses for a minute so a broken
 * collector cannot affect the app or flood the network.
 */
export function createHttpSink(endpoint: string): LogSink {
  let queue: LogRecord[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let failures = 0;
  let disabledUntil = 0;

  async function send(batch: LogRecord[]): Promise<void> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ records: batch }),
        cache: 'no-store',
        credentials: 'omit',
        keepalive: true,
      });
      if (!response.ok) throw new Error(`Log sink rejected the batch (${response.status})`);
      failures = 0;
    } catch {
      failures += 1;
      if (failures >= 3) {
        disabledUntil = Date.now() + 60_000;
        failures = 0;
      }
    }
  }

  function flush(): void {
    timer = null;
    if (queue.length === 0) return;
    if (Date.now() < disabledUntil) {
      queue = [];
      return;
    }
    const batch = queue;
    queue = [];
    void send(batch);
  }

  return (records) => {
    if (Date.now() < disabledUntil) return;
    queue.push(...records);
    if (queue.length > 100) queue = queue.slice(queue.length - 100);
    if (timer === null) timer = setTimeout(flush, 1500);
  };
}

/**
 * A production build without a collector would otherwise report failures
 * nowhere: the record stays in the in-memory buffer and nobody can read it.
 * Warnings and errors therefore still reach the browser console, which is what
 * support opens first when a deployed page misbehaves.
 */
export const productionConsoleSink: LogSink = (records) =>
  consoleSink(records.filter((record) => LEVEL_ORDER[record.level] >= LEVEL_ORDER.warn));

function defaultSink(): LogSink {
  const endpoint = readEnv('VITE_LOG_ENDPOINT')?.trim();
  if (endpoint && isAllowedEndpoint(endpoint)) return createHttpSink(endpoint);
  return isDevelopment() ? consoleSink : productionConsoleSink;
}

export interface LoggerConfig {
  level: LogLevel;
  environment: string;
  release: string;
  sink: LogSink;
  now?: () => number;
  dedupeWindowMs?: number;
  maxEventsPerMinute?: number;
  maxDedupeKeys?: number;
  maxBuffer?: number;
}

interface ResolvedConfig {
  level: LogLevel;
  environment: string;
  release: string;
  sink: LogSink;
  now: () => number;
  dedupeWindowMs: number;
  maxEventsPerMinute: number;
  maxDedupeKeys: number;
  maxBuffer: number;
}

interface DedupeEntry {
  windowStart: number;
  count: number;
}

export class StructuredLogger {
  private readonly config: ResolvedConfig;
  private readonly dedupe = new Map<string, DedupeEntry>();
  private readonly buffer: LogRecord[] = [];
  private rateWindowStart = 0;
  private rateCount = 0;

  constructor(config: LoggerConfig) {
    this.config = {
      dedupeWindowMs: 60_000,
      maxEventsPerMinute: 60,
      maxDedupeKeys: 200,
      maxBuffer: 200,
      ...config,
      // `now` is optional on the public config but always resolved internally.
      now: config.now ?? (() => Date.now()),
    };
  }

  debug(event: string, fields: LogFields): void {
    this.write('debug', event, fields);
  }

  info(event: string, fields: LogFields): void {
    this.write('info', event, fields);
  }

  warn(event: string, fields: LogFields): void {
    this.write('warn', event, fields);
  }

  error(event: string, fields: LogFields): void {
    this.write('error', event, fields);
  }

  /** Sanitized records kept for support/debugging; no free text. */
  getRecentLogs(): LogRecord[] {
    return this.buffer.slice();
  }

  private write(level: LogLevel, event: string, fields: LogFields): void {
    try {
      if (LEVEL_ORDER[level] < LEVEL_ORDER[this.config.level]) return;

      const name = sanitizeEventName(event);
      const nowMs = this.config.now();
      const key = [
        level,
        name,
        fields.route ?? '',
        fields.errorCode ?? '',
        fields.httpStatus ?? '',
        fields.message,
      ].join('|');

      const existing = this.dedupe.get(key);
      let suppressed = 0;
      if (existing && nowMs - existing.windowStart < this.config.dedupeWindowMs) {
        existing.count += 1;
        return;
      }
      if (existing) suppressed = existing.count;

      this.dedupe.delete(key);
      this.dedupe.set(key, { windowStart: nowMs, count: 0 });
      if (this.dedupe.size > this.config.maxDedupeKeys) {
        const oldest = this.dedupe.keys().next().value;
        if (typeof oldest === 'string') this.dedupe.delete(oldest);
      }

      if (nowMs - this.rateWindowStart >= 60_000) {
        this.rateWindowStart = nowMs;
        this.rateCount = 0;
      }
      if (this.rateCount >= this.config.maxEventsPerMinute) return;
      this.rateCount += 1;

      const record = this.build(level, name, fields, nowMs, suppressed);
      this.buffer.push(record);
      if (this.buffer.length > this.config.maxBuffer) this.buffer.shift();

      const result = this.config.sink([record]);
      if (isPromiseLike(result)) {
        void result.catch(() => {
          // A broken sink must never surface as an app error.
        });
      }
    } catch {
      // Logging is best-effort by design.
    }
  }

  private build(
    level: LogLevel,
    event: string,
    fields: LogFields,
    nowMs: number,
    suppressed: number,
  ): LogRecord {
    const record: LogRecord = {
      timestamp: new Date(nowMs).toISOString(),
      level,
      event,
      message: sanitizeText(fields.message) || DEFAULT_MESSAGE,
      environment: this.config.environment,
      release: this.config.release,
      operationId: sanitizeIdentifier(fields.operationId) || createOperationId(),
    };

    const requestId = sanitizeIdentifier(fields.requestId);
    if (requestId) record.requestId = requestId;
    const correlationId = sanitizeIdentifier(fields.correlationId);
    if (correlationId) record.correlationId = correlationId;

    const durationMs = safeNumber(fields.durationMs);
    if (durationMs !== undefined) record.durationMs = durationMs;
    const httpStatus = safeStatus(fields.httpStatus);
    if (httpStatus !== undefined) record.httpStatus = httpStatus;
    const errorCode = sanitizeIdentifier(fields.errorCode, 64);
    if (errorCode) record.errorCode = errorCode;
    if (fields.errorKind) record.errorKind = fields.errorKind;
    if (fields.route) record.route = sanitizeRoute(fields.route);
    const method = safeMethod(fields.method);
    if (method) record.method = method;

    const attempt = safeNumber(fields.attempt);
    if (attempt !== undefined) record.attempt = attempt;
    const count = safeNumber(fields.count);
    if (count !== undefined) record.count = count;
    const bytes = safeNumber(fields.bytes);
    if (bytes !== undefined) record.bytes = bytes;
    const chunks = safeNumber(fields.chunks);
    if (chunks !== undefined) record.chunks = chunks;
    const deltaCount = safeNumber(fields.deltaCount);
    if (deltaCount !== undefined) record.deltaCount = deltaCount;
    const firstEventMs = safeNumber(fields.firstEventMs);
    if (firstEventMs !== undefined) record.firstEventMs = firstEventMs;
    const firstDeltaMs = safeNumber(fields.firstDeltaMs);
    if (firstDeltaMs !== undefined) record.firstDeltaMs = firstDeltaMs;
    if (fields.stage) record.stage = sanitizeIdentifier(fields.stage, 40);
    if (fields.result) record.result = sanitizeIdentifier(fields.result, 40);
    if (fields.resource) record.resource = sanitizeIdentifier(fields.resource, 60);
    if (level === 'error') {
      const stack = sanitizeStack(fields.stack);
      if (stack) record.stack = stack;
    }
    if (suppressed > 0) record.suppressed = suppressed;

    return record;
  }
}

export function createLogger(config: LoggerConfig): StructuredLogger {
  return new StructuredLogger(config);
}

/** Shared instance used by every module. */
export const logger: StructuredLogger = createLogger({
  level: resolveLevel(),
  environment: resolveEnvironment(),
  release: resolveRelease(),
  sink: defaultSink(),
  now: () => Date.now(),
});
