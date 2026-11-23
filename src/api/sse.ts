import { createOperationId, describeError, logger } from '../lib/logger';
import { isAbortError } from '../lib/async';
import type { DocOut, TurnEvent } from './types';
import { apiUrl, buildHeaders } from './client';
import { toApiError } from './errors';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDoc(value: unknown): DocOut | null {
  if (!isRecord(value)) return null;
  return {
    episode_id: typeof value.episode_id === 'string' ? value.episode_id : '',
    title: typeof value.title === 'string' ? value.title : null,
    document_id: typeof value.document_id === 'string' ? value.document_id : null,
    chunk_id: typeof value.chunk_id === 'string' ? value.chunk_id : null,
    text: typeof value.text === 'string' ? value.text : null,
  };
}

export function parseTurnEvent(event: string, payload: unknown): TurnEvent | null {
  if (!isRecord(payload)) return null;

  switch (event) {
    case 'turn.started':
      if (typeof payload.id !== 'string') return null;
      return {
        type: 'turn.started',
        id: payload.id,
        session_id: typeof payload.session_id === 'string' ? payload.session_id : '',
        created_at: typeof payload.created_at === 'string' ? payload.created_at : '',
      };

    case 'turn.delta':
      return {
        type: 'turn.delta',
        text: typeof payload.text === 'string' ? payload.text : '',
      };

    case 'turn.completed': {
      if (typeof payload.id !== 'string') return null;
      const docs = Array.isArray(payload.retrieved_docs)
        ? payload.retrieved_docs.map(toDoc).filter((doc): doc is DocOut => doc !== null)
        : [];
      return {
        type: 'turn.completed',
        id: payload.id,
        answer: typeof payload.answer === 'string' ? payload.answer : '',
        retrieved_docs: docs,
        finish_reason: typeof payload.finish_reason === 'string' ? payload.finish_reason : '',
      };
    }

    case 'turn.failed': {
      const rawError: Record<string, unknown> = isRecord(payload.error) ? payload.error : {};
      return {
        type: 'turn.failed',
        error: {
          code: typeof rawError.code === 'string' ? rawError.code : 'INTERNAL_ERROR',
          message: typeof rawError.message === 'string' ? rawError.message : '',
          correlation_id:
            typeof rawError.correlation_id === 'string' ? rawError.correlation_id : undefined,
        },
      };
    }

    default:
      return null;
  }
}

interface Boundary {
  index: number;
  length: number;
}

function findBoundary(buffer: string): Boundary | null {
  const lf = buffer.indexOf('\n\n');
  const crlf = buffer.indexOf('\r\n\r\n');
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  if (lf !== -1) return { index: lf, length: 2 };
  return null;
}

export interface SSEParserDiagnostics {
  /** Receives the byte length of a frame whose `data:` payload was not JSON. */
  onMalformedFrame?: (payloadLength: number) => void;
}

function dispatchBlock(
  block: string,
  onEvent: (event: string, payload: unknown) => void,
  diagnostics: SSEParserDiagnostics,
): void {
  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue; // empty line or keep-alive comment

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      dataLines.push(value);
    }
  }

  if (dataLines.length === 0) return;

  const data = dataLines.join('\n');
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    diagnostics.onMalformedFrame?.(data.length);
    return;
  }
  onEvent(event, payload);
}

/**
 * Incremental SSE parser. Handles arbitrary chunk boundaries, LF and CRLF,
 * multi-line `data:` fields, comments and `event:` names.
 */
export function createSSEParser(
  onEvent: (event: string, payload: unknown) => void,
  diagnostics: SSEParserDiagnostics = {},
): (chunk: string) => void {
  let buffer = '';

  return (chunk: string) => {
    buffer += chunk;

    let boundary = findBoundary(buffer);
    while (boundary) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      dispatchBlock(block, onEvent, diagnostics);
      boundary = findBoundary(buffer);
    }
  };
}

export interface StreamTurnOptions {
  sessionId: string;
  question: string;
  userId: string;
  signal?: AbortSignal;
  /** Correlates the stream summary with the caller's polling/failure records. */
  operationId?: string;
  onEvent: (event: TurnEvent) => void;
}

/** Sessions that currently have an open stream request. */
const inFlightSessions = new Set<string>();

/**
 * POST /chat/sessions/{id}/turns/stream — EventSource cannot send a POST body
 * or custom headers, so the stream is read from fetch directly.
 *
 * Exactly one stream per session is allowed: a second call while the first is
 * still open is ignored and recorded instead of issuing another POST.
 */
export async function streamTurn(options: StreamTurnOptions): Promise<void> {
  if (inFlightSessions.has(options.sessionId)) {
    logger.warn('sse.stream_duplicate', {
      message: 'درخواست استریم تکراری برای همین گفتگو نادیده گرفته شد.',
      operationId: options.operationId ?? createOperationId(),
      route: '/chat/sessions/:id/turns/stream',
      method: 'POST',
      result: 'ignored',
      errorCode: 'STREAM_ALREADY_RUNNING',
      errorKind: 'contract',
    });
    return;
  }

  inFlightSessions.add(options.sessionId);
  try {
    await runStreamTurn(options);
  } finally {
    inFlightSessions.delete(options.sessionId);
  }
}

async function runStreamTurn({
  sessionId,
  question,
  userId,
  signal,
  operationId = createOperationId(),
  onEvent,
}: StreamTurnOptions): Promise<void> {
  const route = `/chat/sessions/${sessionId}/turns/stream`;
  const startedAt = Date.now();
  const elapsed = (): number => Date.now() - startedAt;

  logger.info('sse.stream_started', {
    message: 'درخواست استریم ارسال شد.',
    operationId,
    route,
    method: 'POST',
    result: 'started',
  });

  let response: Response;
  try {
    response = await fetch(apiUrl(route), {
      method: 'POST',
      headers: buildHeaders(userId, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
      body: JSON.stringify({ question }),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    const details = describeError(error, false);
    if (isAbortError(error) || details.errorKind === 'abort') {
      logger.debug('sse.stream_aborted', {
        message: 'استریم پیش از تکمیل لغو شد.',
        operationId,
        route,
        method: 'POST',
        durationMs: elapsed(),
        errorKind: 'abort',
        errorCode: 'ABORTED',
      });
    } else {
      logger.error('sse.stream_failed', {
        message: 'اتصال استریم برقرار نشد.',
        operationId,
        route,
        method: 'POST',
        durationMs: elapsed(),
        errorKind: details.errorKind === 'runtime' ? 'network' : details.errorKind,
        errorCode: details.errorKind === 'timeout' ? 'TIMEOUT' : 'NETWORK_ERROR',
      });
    }
    throw error;
  }

  if (!response.ok) {
    const apiError = await toApiError(response);
    logger.error('sse.stream_failed', {
      message: 'سرور استریم را ناموفق برگرداند.',
      operationId,
      route,
      method: 'POST',
      durationMs: elapsed(),
      httpStatus: response.status,
      errorCode: apiError.code,
      requestId: apiError.requestId,
      errorKind: 'http',
    });
    throw apiError;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    logger.warn('sse.contract_mismatch', {
      message: 'پاسخ استریم با قرارداد text/event-stream هم‌خوان نبود.',
      operationId,
      route,
      method: 'POST',
      durationMs: elapsed(),
      httpStatus: response.status,
      errorKind: 'contract',
      errorCode: 'CONTRACT_MISMATCH',
    });
  }

  if (!response.body) {
    logger.error('sse.stream_failed', {
      message: 'بدنهٔ پاسخ استریم در دسترس نبود.',
      operationId,
      route,
      method: 'POST',
      durationMs: elapsed(),
      httpStatus: response.status,
      errorKind: 'contract',
      errorCode: 'EMPTY_STREAM',
    });
    throw new Error('پاسخ استریم از سرور دریافت نشد.');
  }

  let firstEventMs: number | undefined;
  let firstDeltaMs: number | undefined;
  let deltaCount = 0;
  let bytes = 0;
  let chunks = 0;
  let malformedFrames = 0;
  let invalidEvents = 0;
  let terminal = false;
  let failed = false;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSSEParser(
    (event, payload) => {
      const parsed = parseTurnEvent(event, payload);
      if (!parsed) {
        invalidEvents += 1;
        return;
      }

      if (firstEventMs === undefined) firstEventMs = elapsed();

      if (parsed.type === 'turn.delta') {
        deltaCount += 1;
        if (firstDeltaMs === undefined) firstDeltaMs = elapsed();
      } else if (parsed.type === 'turn.completed') {
        terminal = true;
      } else if (parsed.type === 'turn.failed') {
        terminal = true;
        failed = true;
        logger.error('sse.turn_failed', {
          message: 'سرور اعلام کرد که پرسش ناموفق بود.',
          operationId,
          route,
          method: 'POST',
          durationMs: elapsed(),
          errorCode: parsed.error.code,
          correlationId: parsed.error.correlation_id,
          errorKind: 'runtime',
        });
      }

      onEvent(parsed);
    },
    {
      onMalformedFrame: () => {
        malformedFrames += 1;
      },
    },
  );

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks += 1;
      bytes += value?.byteLength ?? 0;
      parser(decoder.decode(value, { stream: true }));
    }
    parser(decoder.decode());
  } catch (error) {
    const details = describeError(error, false);
    if (isAbortError(error) || details.errorKind === 'abort') {
      logger.debug('sse.stream_aborted', {
        message: 'خواندن استریم لغو شد.',
        operationId,
        route,
        method: 'POST',
        durationMs: elapsed(),
        deltaCount,
        chunks,
        bytes,
        errorKind: 'abort',
        errorCode: 'ABORTED',
      });
    } else {
      logger.error('sse.stream_failed', {
        message: 'خواندن استریم قطع شد.',
        operationId,
        route,
        method: 'POST',
        durationMs: elapsed(),
        deltaCount,
        chunks,
        bytes,
        errorKind: details.errorKind === 'runtime' ? 'network' : details.errorKind,
        errorCode: 'STREAM_READ_FAILED',
      });
    }
    throw error;
  }

  if (malformedFrames > 0) {
    logger.warn('sse.frames_malformed', {
      message: 'برخی فریم‌های استریم JSON معتبر نبودند.',
      operationId,
      route,
      method: 'POST',
      durationMs: elapsed(),
      count: malformedFrames,
      errorKind: 'parse',
      errorCode: 'PARSE_ERROR',
    });
  }

  if (invalidEvents > 0) {
    logger.warn('sse.events_invalid', {
      message: 'برخی رخدادهای استریم با قرارداد هم‌خوان نبودند.',
      operationId,
      route,
      method: 'POST',
      durationMs: elapsed(),
      count: invalidEvents,
      errorKind: 'contract',
      errorCode: 'CONTRACT_MISMATCH',
    });
  }

  const summary = {
    operationId,
    route,
    method: 'POST',
    durationMs: elapsed(),
    deltaCount,
    chunks,
    bytes,
    firstEventMs,
    firstDeltaMs,
  };

  if (terminal && !failed) {
    logger.info('sse.stream_completed', {
      ...summary,
      message: 'استریم کامل شد.',
      result: 'completed',
    });
  } else if (!terminal) {
    logger.warn('sse.stream_incomplete', {
      ...summary,
      message: 'استریم بدون رویداد نهایی تمام شد.',
      result: 'incomplete',
      errorCode: 'STREAM_INCOMPLETE',
      errorKind: 'contract',
    });
  }
}
