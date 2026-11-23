/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** Same-origin prefix the container edge strips before proxying (default `/api`). */
  readonly VITE_API_PREFIX?: string;
  readonly VITE_PROXY_TARGET?: string;
  readonly VITE_IDENTITY_HEADER?: string;
  /** Same-origin collector route, for example `/observability/logs`. */
  readonly VITE_LOG_ENDPOINT?: string;
  readonly VITE_LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error';
  readonly VITE_ENVIRONMENT?: string;
  readonly VITE_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected by vite.config.ts; identifies the build in every log record. */
declare const __APP_RELEASE__: string;
