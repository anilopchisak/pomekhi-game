import { expect, it, vi } from 'vitest';
import { createOrganizerBootstrap } from './organizer-bootstrap.js';

const origin = 'http://127.0.0.1:3000';
const host = '127.0.0.1:3000';
const token = 'a'.repeat(64);

it('allows one redemption from the local organizer origin', () => {
  const redeem = createOrganizerBootstrap(token, origin, 'HOSTCODE')!;
  expect(redeem('https://example.ru.tuna.am', host, token)).toBeUndefined();
  expect(redeem(origin, 'example.ru.tuna.am', token)).toBeUndefined();
  expect(redeem(origin, host, 'b'.repeat(64))).toBeUndefined();
  expect(redeem(origin, host, token)).toBe('HOSTCODE');
  expect(redeem(origin, host, token)).toBeUndefined();
});

it('rejects an expired key and does not enable bootstrap on a LAN address', () => {
  vi.useFakeTimers();
  try {
    const redeem = createOrganizerBootstrap(token, origin, 'HOSTCODE')!;
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(redeem(origin, host, token)).toBeUndefined();
    expect(createOrganizerBootstrap(token, 'http://192.168.0.5:3000', 'HOSTCODE')).toBeUndefined();
  } finally { vi.useRealTimers(); }
});
