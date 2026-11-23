import { apiUrl } from './client';
import type { HealthResponse } from './types';

/**
 * `/health/ready` answers 200 with `{status:"ready"}` or 503 with
 * `{status:"not_ready"}`, so the body is parsed before the status is checked.
 */
export async function getReadiness(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(apiUrl('/health/ready'), {
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });

  let payload: HealthResponse | null = null;
  try {
    payload = (await response.json()) as HealthResponse;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload.status !== 'string') {
    throw new Error(`Readiness check failed with HTTP ${response.status}`);
  }
  return payload;
}
