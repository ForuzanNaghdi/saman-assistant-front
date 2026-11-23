import { useEffect, useRef, useState } from 'react';
import { getReadiness } from '../api/health';
import { describeError, logger } from '../lib/logger';

export type ServiceState = 'checking' | 'ready' | 'not_ready' | 'unreachable';

export function useServiceStatus(intervalMs = 30_000): ServiceState {
  const [state, setState] = useState<ServiceState>('checking');
  const stateRef = useRef<ServiceState>('checking');
  const sinceRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelled = false;

    /** Health is only logged when it changes, so polling stays quiet. */
    function apply(next: ServiceState, error?: unknown): void {
      if (cancelled) return;
      const previous = stateRef.current;
      if (previous === next) return;

      stateRef.current = next;
      setState(next);
      const durationMs = Date.now() - sinceRef.current;
      sinceRef.current = Date.now();

      if (next === 'ready') {
        const recovered = previous !== 'checking';
        logger.info(recovered ? 'health.recovered' : 'health.ready', {
          message: recovered
            ? 'سرویس دوباره در دسترس شد.'
            : 'سرویس آمادهٔ پاسخ‌دهی است.',
          route: '/health/ready',
          method: 'GET',
          result: 'ready',
          durationMs,
        });
        return;
      }

      if (next === 'not_ready') {
        logger.warn('health.not_ready', {
          message: 'سرویس در وضعیت آماده نیست.',
          route: '/health/ready',
          method: 'GET',
          result: 'not_ready',
          durationMs,
          errorCode: 'SERVICE_NOT_READY',
          errorKind: 'runtime',
        });
        return;
      }

      const details = describeError(error, false);
      logger.warn('health.unreachable', {
        message: 'سرویس سلامت در دسترس نبود.',
        route: '/health/ready',
        method: 'GET',
        result: 'unreachable',
        durationMs,
        errorCode: details.errorCode ?? 'UNREACHABLE',
        errorKind: details.errorKind,
        stack: details.stack,
      });
    }

    async function check(): Promise<void> {
      try {
        const health = await getReadiness();
        apply(health.status === 'ready' ? 'ready' : 'not_ready');
      } catch (error) {
        apply('unreachable', error);
      }
    }

    void check();
    const timer = window.setInterval(() => {
      void check();
    }, intervalMs);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return state;
}
