import { timingSafeEqual } from 'node:crypto';

export function createOrganizerBootstrap(token: string | undefined, origin: string, code: string) {
  const address = new URL(origin);
  if (!token || !/^[a-f0-9]{64}$/.test(token) || !['127.0.0.1', '[::1]', 'localhost'].includes(address.hostname)) return;
  const expected = Buffer.from(token, 'hex');
  const expires = Date.now() + 5 * 60 * 1000;
  let used = false;
  return (requestOrigin: string | undefined, host: string | undefined, key: string | undefined) => {
    if (used || Date.now() >= expires || requestOrigin !== address.origin || host !== address.host ||
      !key || !/^[a-f0-9]{64}$/.test(key) || !timingSafeEqual(expected, Buffer.from(key, 'hex'))) return;
    used = true;
    return code;
  };
}
