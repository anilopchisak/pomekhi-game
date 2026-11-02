import { expect, it } from 'vitest';
import { invitationUrl } from './invitation.js';

it('builds a public invitation without deriving it from local panel origin', () => {
  expect(invitationUrl(' https://house.example/ ', 'ABCDEF')).toBe('https://house.example/?room=ABCDEF');
});
it.each(['http://house.example', 'https://user:secret@house.example', 'https://house.example/path', 'https://house.example/?token=x', 'https://house.example/#secret', 'bad'])('rejects a misleading public address %s', address => {
  expect(() => invitationUrl(address, 'ABCDEF')).toThrow();
});

it.each(['http://192.168.43.20:3000', 'http://10.0.0.2:3000', 'http://172.16.2.3:3000'])('allows a deliberately selected private LAN address %s', address => {
  expect(invitationUrl(address, 'ABCDEF', true)).toBe(`${address}/?room=ABCDEF`);
  expect(() => invitationUrl(address, 'ABCDEF')).toThrow();
});
it.each(['http://10.example.org', 'http://192.168.example.org', 'http://example.org', 'http://8.8.8.8', 'http://172.32.0.1', 'http://192.168.1.1:3000/path', 'http://user:secret@10.0.0.1'])('rejects an unsafe local invitation %s', address => {
  expect(() => invitationUrl(address, 'ABCDEF', true)).toThrow();
});
