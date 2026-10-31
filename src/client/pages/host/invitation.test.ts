import { expect, it } from 'vitest';
import { invitationUrl } from './invitation.js';

it('builds a public invitation without deriving it from local panel origin', () => {
  expect(invitationUrl(' https://house.example/ ', 'ABCDEF')).toBe('https://house.example/?room=ABCDEF');
});
it.each(['http://house.example', 'https://user:secret@house.example', 'https://house.example/path', 'https://house.example/?token=x', 'https://house.example/#secret', 'bad'])('rejects a misleading public address %s', address => {
  expect(() => invitationUrl(address, 'ABCDEF')).toThrow();
});
