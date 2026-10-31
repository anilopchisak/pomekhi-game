import { describe, expect, it } from 'vitest';
import { getServerConfig } from './config.js';

describe('server startup configuration', () => {
  it('binds to loopback with the documented default port', () => {
    expect(getServerConfig({})).toEqual({ host: '127.0.0.1', port: 3000 });
  });
  it.each(['', '-1', '65536', '3.5', '3000x', 'NaN'])('rejects invalid PORT=%j before listening', value => {
    expect(() => getServerConfig({ PORT: value })).toThrow('PORT');
  });
  it('allows port zero for isolated operating-system assigned test ports', () => {
    expect(getServerConfig({ PORT: '0' }).port).toBe(0);
  });
});
