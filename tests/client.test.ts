import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * apiUrl() is the only place the browser builds an API URL. Same-origin calls
 * must carry the edge prefix, because the deployed ingress sends bare /chat to
 * the API where no layer can add the gateway header (see docs/deployment.md).
 */
async function loadApiUrl(): Promise<(path: string) => string> {
  vi.resetModules();
  const module = await import('../src/api/client');
  return module.apiUrl;
}

describe('apiUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('prefixes same-origin API paths with the edge prefix', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_PREFIX', '');

    const apiUrl = await loadApiUrl();

    expect(apiUrl('/chat/sessions')).toBe('/api/chat/sessions');
    expect(apiUrl('/health/ready')).toBe('/api/health/ready');
  });

  it('honours a custom edge prefix and trims trailing slashes', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    vi.stubEnv('VITE_API_PREFIX', '/edge/');

    const apiUrl = await loadApiUrl();

    expect(apiUrl('/chat/sessions')).toBe('/edge/chat/sessions');
  });

  it('uses an absolute API origin as-is, without the edge prefix', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.com/');
    vi.stubEnv('VITE_API_PREFIX', '');

    const apiUrl = await loadApiUrl();

    expect(apiUrl('/chat/sessions')).toBe('https://api.example.com/chat/sessions');
  });
});
