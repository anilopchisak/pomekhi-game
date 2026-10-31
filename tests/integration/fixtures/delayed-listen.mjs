import { Server } from 'node:net';

const listen = Server.prototype.listen;
Server.prototype.listen = function (...args) {
  process.send?.({ type: 'test:listen-pending' });
  // A real late bind exercises cancellation after the bootstrap receives a signal.
  setTimeout(() => { listen.apply(this, args); }, 150);
  return this;
};
