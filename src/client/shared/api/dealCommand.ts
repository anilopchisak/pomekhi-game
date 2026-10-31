import type { RoomSnapshot } from '../../../shared/protocol.js';

export function dealCommand(room: RoomSnapshot) {
  const requestId = [...crypto.getRandomValues(new Uint8Array(16))].map(value => value.toString(16).padStart(2, '0')).join('');
  return { roomId: room.id, dealVersion: room.dealing.version, dealId: room.dealing.dealId, requestId };
}

export function gameCommand(room: RoomSnapshot) {
  return { roomId: room.id, gameVersion: room.game.version, roundId: room.game.roundId, requestId: dealCommand(room).requestId };
}
