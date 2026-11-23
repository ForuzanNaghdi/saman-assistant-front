import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createOperationId, logger } from '../lib/logger';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  failed: boolean;
}

/**
 * Catches render-phase failures so a broken tree still leaves a report and a
 * usable screen. The report keeps only an operation id and a sanitized stack;
 * React's component stack is passed through the same sanitizer.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('ui.render_failed', {
      message: 'نمایش صفحه با خطای پیش‌بینی‌نشده متوقف شد.',
      operationId: createOperationId(),
      errorCode: 'RENDER_ERROR',
      errorKind: 'runtime',
      result: 'crashed',
      stack: `${error.name}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`,
    });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="app app-fatal" role="alert">
        <main className="chat">
          <h1>نمایش این صفحه ممکن نشد.</h1>
          <p>
            خطا به‌صورت خودکار ثبت شد. با بارگذاری دوبارهٔ صفحه ادامه دهید؛ اگر
            تکرار شد، کمی بعد دوباره تلاش کنید.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            بارگذاری دوباره
          </button>
        </main>
      </div>
    );
  }
}
