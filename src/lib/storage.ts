import { logger } from './logger';

// Storage failures repeat on every render; report each key/operation once.
const reported = new Set<string>();

function report(event: string, key: string): void {
  const id = `${event}:${key}`;
  if (reported.has(id)) return;
  reported.add(id);
  logger.warn(event, {
    message: 'دسترسی به حافظهٔ محلی مرورگر ممکن نبود.',
    resource: key,
    errorKind: 'runtime',
    errorCode: 'STORAGE_UNAVAILABLE',
  });
}

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    report('storage.read_failed', key);
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode, quota). The UI still works;
    // identity and the active session simply do not survive a reload.
    report('storage.write_failed', key);
  }
}

export function removeStorage(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    report('storage.remove_failed', key);
  }
}
