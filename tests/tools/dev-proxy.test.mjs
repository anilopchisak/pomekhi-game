import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../../vite.config.ts';

afterEach(() => { vi.unstubAllEnvs(); });

describe('development proxy configuration', () => {
  it.each([
    ['127.0.0.1', '127.0.0.1'],
    ['192.0.2.1', '192.0.2.1'],
    ['::1', '[::1]'],
    ['0.0.0.0', '127.0.0.1'],
    ['::', '[::1]'],
  ])('routes API and socket traffic for HOST=%s', (host, authority) => {
    vi.stubEnv('HOST', host);
    vi.stubEnv('PORT', '4567');
    const config = viteConfig({ command: 'serve', mode: 'development' });
    const target = `http://${authority}:4567`;
    expect(config.server.proxy['/api']).toBe(target);
    expect(config.server.proxy['/socket.io']).toEqual({ target, ws: true });
  });
});
