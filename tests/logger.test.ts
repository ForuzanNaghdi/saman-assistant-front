import { describe, expect, it, vi } from 'vitest';
import {
  createLogger,
  describeError,
  productionConsoleSink,
  sanitizeIdentifier,
  sanitizeRoute,
  sanitizeStack,
  sanitizeText,
  type LogRecord,
} from '../src/lib/logger';

function memorySink() {
  const records: LogRecord[] = [];
  return {
    records,
    sink: (batch: LogRecord[]) => {
      records.push(...batch);
    },
  };
}

function testLogger(overrides: Partial<Parameters<typeof createLogger>[0]> = {}) {
  const memory = memorySink();
  const logger = createLogger({
    level: 'debug',
    environment: 'test',
    release: '1.2.3',
    sink: memory.sink,
    now: () => 1_000_000,
    ...overrides,
  });
  return { logger, records: memory.records };
}

describe('sanitizeText', () => {
  it('removes credentials, tokens, urls, paths, file names, emails and raw ids', () => {
    const raw = [
      'Authorization: Bearer abc.def.ghi',
      'token=supersecret api_key: "k-123" password=hunter2',
      'https://api.example.com/chat?user=42',
      '/Users/foruzan/private/report.pdf',
      'contract.pdf',
      'person@example.com',
      'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
      '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    ].join(' ');

    const cleaned = sanitizeText(raw);

    for (const secret of [
      'abc.def.ghi',
      'supersecret',
      'hunter2',
      'k-123',
      'api.example.com',
      '/Users/foruzan',
      'report.pdf',
      'contract.pdf',
      'person@example.com',
      'a1b2c3d4e5f6',
      '3fa85f64',
    ]) {
      expect(cleaned).not.toContain(secret);
    }
    expect(cleaned).toContain('[redacted]');
  });

  it('removes JWTs', () => {
    const jwt =
      'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    expect(sanitizeText(`failed ${jwt}`)).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('collapses control characters and truncates long text', () => {
    const noisy = sanitizeText(`a\n\nb\tc${'x'.repeat(500)}`);
    expect(noisy).not.toMatch(/[\u0000-\u001f]/);
    expect(noisy.length).toBeLessThanOrEqual(241);
    expect(noisy.endsWith('…')).toBe(true);
  });

  it('returns an empty string for missing values', () => {
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(null)).toBe('');
  });
});

describe('sanitizeRoute', () => {
  it('drops query/hash and templates raw identifiers', () => {
    expect(
      sanitizeRoute(
        'https://host/chat/sessions/3fa85f64-5717-4562-b3fc-2c963f66afa6/turns?limit=5#x',
      ),
    ).toBe('/chat/sessions/:id/turns');
    expect(sanitizeRoute('/ingestion/jobs/12345')).toBe('/ingestion/jobs/:id');
    expect(sanitizeRoute('/ingestion/jobs/abcdefabcdefabcdefabcdef')).toBe(
      '/ingestion/jobs/:id',
    );
    expect(sanitizeRoute('')).toBe('/');
  });
});

describe('sanitizeStack', () => {
  it('keeps at most six sanitized lines', () => {
    const stack = Array.from(
      { length: 20 },
      (_, i) => `    at fn${i} (http://localhost/src/a.ts:1:2)`,
    ).join('\n');
    const cleaned = sanitizeStack(stack);
    expect(cleaned.split(' | ')).toHaveLength(6);
    expect(cleaned).not.toContain('localhost');
  });
});

describe('describeError', () => {
  it('extracts only allowlisted fields and never spreads the error', () => {
    const error = Object.assign(new Error('boom token=abc'), {
      code: 'SESSION_NOT_FOUND',
      status: 404,
      requestId: 'req-123',
      secret: 'do not log',
      body: 'question text',
    });

    const details = describeError(error);

    expect(details.errorCode).toBe('SESSION_NOT_FOUND');
    expect(details.httpStatus).toBe(404);
    expect(details.requestId).toBe('req-123');
    expect(details.errorKind).toBe('http');
    expect(details.message).not.toContain('abc');
    expect(details).not.toHaveProperty('secret');
    expect(details).not.toHaveProperty('body');
    expect(JSON.stringify(details)).not.toContain('question text');
  });

  it('classifies aborts, timeouts, network and parse failures', () => {
    expect(describeError(new DOMException('stop', 'AbortError')).errorKind).toBe('abort');
    expect(describeError(new DOMException('slow', 'TimeoutError')).errorKind).toBe('timeout');
    expect(describeError(new TypeError('Failed to fetch')).errorKind).toBe('network');
    expect(describeError(new SyntaxError('bad json')).errorKind).toBe('parse');
  });

  it('sanitizes a thrown string', () => {
    const details = describeError('password=leak');
    expect(details.errorKind).toBe('unknown');
    expect(details.message).not.toContain('leak');
  });
});

describe('sanitizeIdentifier', () => {
  it('keeps identifier characters and drops everything else', () => {
    expect(sanitizeIdentifier('a b\tc<script>')).toBe('abcscript');
    expect(sanitizeIdentifier('req-123:abc.def')).toBe('req-123:abc.def');
    expect(sanitizeIdentifier('x'.repeat(200))).toHaveLength(80);
    expect(sanitizeIdentifier(42)).toBe('');
  });
});

describe('StructuredLogger', () => {
  it('stamps every record with environment, release and an operation id', () => {
    const { logger, records } = testLogger();
    logger.info('api.request_succeeded', { message: 'ok', operationId: 'op-1' });

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record.environment).toBe('test');
    expect(record.release).toBe('1.2.3');
    expect(record.operationId).toBe('op-1');
    expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('never writes free text or secrets into the message', () => {
    const { logger, records } = testLogger();
    logger.error('upload.failed', {
      message: 'failed for report.pdf token=abc /Users/x/y',
    });

    expect(records).toHaveLength(1);
    expect(records[0].message).not.toContain('report.pdf');
    expect(records[0].message).not.toContain('token=abc');
    expect(records[0].message).not.toContain('/Users/x/y');
  });

  it('drops debug records when the level is info', () => {
    const { logger, records } = testLogger({ level: 'info' });
    logger.debug('a.debug', { message: 'debug' });
    logger.info('a.info', { message: 'info' });

    expect(records.map((record) => record.event)).toEqual(['a.info']);
  });

  it('collapses repeated failures and reports the suppressed count next window', () => {
    let clock = 1_000_000;
    const { logger, records } = testLogger({
      now: () => clock,
      dedupeWindowMs: 1000,
      maxEventsPerMinute: 100,
    });

    for (let i = 0; i < 5; i += 1) {
      logger.error('api.request_failed', {
        message: 'same',
        route: '/a/:id',
        errorCode: 'E',
        httpStatus: 500,
      });
    }
    expect(records).toHaveLength(1);
    expect(records[0].suppressed).toBeUndefined();

    clock += 1001;
    logger.error('api.request_failed', {
      message: 'same',
      route: '/a/:id',
      errorCode: 'E',
      httpStatus: 500,
    });
    expect(records).toHaveLength(2);
    expect(records[1].suppressed).toBe(4);
  });

  it('caps the number of records per minute', () => {
    const { logger, records } = testLogger({ maxEventsPerMinute: 2 });
    logger.info('a', { message: 'a' });
    logger.info('b', { message: 'b' });
    logger.info('c', { message: 'c' });

    expect(records).toHaveLength(2);
  });

  it('never throws when the sink throws synchronously', () => {
    const logger = createLogger({
      level: 'error',
      environment: 'test',
      release: '1.2.3',
      sink: () => {
        throw new Error('collector down');
      },
    });

    expect(() => logger.error('a.failed', { message: 'boom' })).not.toThrow();
  });

  it('swallows an async sink rejection', async () => {
    const logger = createLogger({
      level: 'error',
      environment: 'test',
      release: '1.2.3',
      sink: () => Promise.reject(new Error('collector down')),
    });

    expect(() => logger.error('a.failed', { message: 'boom' })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('keeps the recent ring buffer bounded', () => {
    const { logger } = testLogger({
      level: 'info',
      maxBuffer: 3,
      maxEventsPerMinute: 100,
    });
    logger.info('a', { message: 'a' });
    logger.info('b', { message: 'b' });
    logger.info('c', { message: 'c' });
    logger.info('d', { message: 'd' });

    expect(logger.getRecentLogs().map((record) => record.event)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });
});

describe('productionConsoleSink', () => {
  function record(level: LogRecord['level']): LogRecord {
    return {
      timestamp: '2026-01-01T00:00:00.000Z',
      level,
      event: 'test.event',
      message: 'رخداد ثبت شد.',
      environment: 'production',
      release: '1.0.0',
      operationId: 'op-1',
    };
  }

  it('prints warnings and errors but keeps info and debug out of the console', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    productionConsoleSink([record('debug'), record('info'), record('warn'), record('error')]);

    expect(log).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
  });
});
