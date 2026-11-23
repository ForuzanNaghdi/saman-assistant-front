import { createRoot } from 'react-dom/client';
import { Root } from './Root';
import { ErrorBoundary } from './components/ErrorBoundary';
import { createOperationId, describeError, logger } from './lib/logger';
import './styles.css';
import './theme.css';
import './auth.css';

// Global safety nets: errors that escape React and rejected promises nobody
// awaited are reported once. Deliberate aborts never reach these handlers.
window.addEventListener('error', (event) => {
  if (!(event.error instanceof Error)) return;
  const details = describeError(event.error, false);
  logger.error('app.uncaught_error', {
    message: 'خطای پیش‌بینی‌نشده در برنامه رخ داد.',
    operationId: createOperationId(),
    errorCode: 'UNCAUGHT_ERROR',
    errorKind: details.errorKind,
    result: 'uncaught',
    stack: details.stack,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  const details = describeError(event.reason, false);
  logger.error('app.unhandled_rejection', {
    message: 'یک Promise رد‌شده مدیریت نشده بود.',
    operationId: createOperationId(),
    errorCode: 'UNHANDLED_REJECTION',
    errorKind: details.errorKind,
    result: 'uncaught',
    stack: details.stack,
  });
});

const container = document.getElementById('root');

if (!container) {
  logger.error('app.boot_failed', {
    message: 'ریشهٔ برنامه در صفحه پیدا نشد.',
    operationId: createOperationId(),
    errorCode: 'MISSING_ROOT',
    errorKind: 'contract',
    result: 'failed',
  });
  throw new Error('ریشهٔ برنامه (#root) در index.html پیدا نشد.');
}

// No StrictMode: the boot effect opens a session and a stream, and the double
// invocation it performs in development would duplicate both requests.
createRoot(container).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>,
);
