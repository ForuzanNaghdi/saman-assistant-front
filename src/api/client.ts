import {
  createOperationId,
  describeError,
  logger,
  type LogFields,
} from '../lib/logger';
import { toApiError } from './errors';

/**
 * Empty by default so requests are same-origin and flow through the Vite dev
 * proxy. Set VITE_API_BASE_URL only when the API origin allows this one.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

/**
 * Same-origin API traffic goes under this prefix, which the container edge
 * owns. The deployed ingress forwards bare `/chat`, `/ingestion` and `/health`
 * straight to the API, and nothing on that path can add the gateway header — so
 * the browser asks for `/api/...` instead, the ingress hands it to this
 * frontend, and nginx strips the prefix and adds X-Internal-Auth.
 * Keep the value aligned with nginx.conf.template and vite.config.ts.
 */
const API_PREFIX = (import.meta.env.VITE_API_PREFIX || '/api').replace(/\/+$/, '');

/**
 * The trusted gateway writes the verified caller into this header. During local
 * development the browser sends a generated id instead.
 */
export const IDENTITY_HEADER = import.meta.env.VITE_IDENTITY_HEADER || 'X-Authenticated-User';

export function apiUrl(path: string): string {
  // An absolute API origin is used as-is; the prefix belongs to the
  // same-origin edge only.
  return API_BASE ? `${API_BASE}${path}` : `${API_PREFIX}${path}`;
}

export function buildHeaders(userId?: string | null, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (userId) headers.set(IDENTITY_HEADER, userId);
  return headers;
}

/**
 * - `error` (default): foreground request, the failure is reported once here.
 * - `debug`: background polling where the caller reports the final outcome.
 * - `none`: caller owns the report.
 */
export type FailureLogLevel = 'debug' | 'warn' | 'error' | 'none';

function logAt(level: Exclude<FailureLogLevel, 'none'>, event: string, fields: LogFields): void {
  if (level === 'debug') logger.debug(event, fields);
  else if (level === 'warn') logger.warn(event, fields);
  else logger.error(event, fields);
}

function logTransportFailure(
  failureLevel: FailureLogLevel,
  method: string,
  route: string,
  operationId: string,
  durationMs: number,
  error: unknown,
): void {
  const details = describeError(error, false);
  if (details.errorKind === 'abort') {
    logger.debug('api.request_aborted', {
      message: 'درخواست پیش از تکمیل لغو شد.',
      operationId,
      route,
      method,
      durationMs,
      errorKind: 'abort',
      errorCode: 'ABORTED',
    });
    return;
  }
  if (failureLevel === 'none') return;

  logAt(failureLevel, 'api.request_failed', {
    message: 'ارتباط با API برقرار نشد.',
    operationId,
    route,
    method,
    durationMs,
    errorKind: details.errorKind === 'runtime' ? 'network' : details.errorKind,
    errorCode: details.errorKind === 'timeout' ? 'TIMEOUT' : 'NETWORK_ERROR',
  });
}

interface JsonRequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  userId?: string | null;
  body?: unknown;
  signal?: AbortSignal;
  accept?: string;
  operationId?: string;
  failureLevel?: FailureLogLevel;
}

export async function requestJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    userId,
    body,
    signal,
    accept = 'application/json',
    operationId = createOperationId(),
    failureLevel = 'error',
  } = options;
  const headers = buildHeaders(userId, { Accept: accept });

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    headers.set('Content-Type', 'application/json');
    payload = JSON.stringify(body);
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method,
      headers,
      body: payload,
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    logTransportFailure(
      failureLevel,
      method,
      path,
      operationId,
      Date.now() - startedAt,
      error,
    );
    throw error;
  }

  const durationMs = Date.now() - startedAt;

  if (!response.ok) {
    const apiError = await toApiError(response);
    if (failureLevel !== 'none') {
      logAt(failureLevel, 'api.request_failed', {
        message: 'سرور درخواست را ناموفق برگرداند.',
        operationId,
        route: path,
        method,
        durationMs,
        httpStatus: response.status,
        errorCode: apiError.code,
        requestId: apiError.requestId,
        errorKind: 'http',
      });
    }
    throw apiError;
  }

  if (response.status === 204) {
    logger.debug('api.request_succeeded', {
      message: 'درخواست بدون بدنه کامل شد.',
      operationId,
      route: path,
      method,
      durationMs,
      httpStatus: response.status,
      result: 'no_content',
    });
    return null as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    logger.warn('api.response_contract_mismatch', {
      message: 'پاسخ سرور با قرارداد JSON هم‌خوان نبود.',
      operationId,
      route: path,
      method,
      durationMs,
      httpStatus: response.status,
      errorKind: 'contract',
      errorCode: 'CONTRACT_MISMATCH',
    });
    return null as T;
  }

  const parsed = (await response.json()) as T;
  logger.debug('api.request_succeeded', {
    message: 'درخواست کامل شد.',
    operationId,
    route: path,
    method,
    durationMs,
    httpStatus: response.status,
  });
  return parsed;
}

