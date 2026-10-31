import { Server } from 'node:http';

const emit = Server.prototype.emit;
let failServer;
Server.prototype.emit = function (event, ...args) {
  if (event === 'request' && args[0].url === '/test-server-error') {
    // Hold a real request so the error must use bounded cleanup, not just exit.
    failServer = () => {
      const error = new Error('private-transport-error-details');
      // Exercise the same server error event emitted by a failed native accept.
      emit.call(this, 'error', error);
      emit.call(this, 'error', error);
    };
    process.send?.({ type: 'test:request-pending' });
    return true;
  }
  return emit.call(this, event, ...args);
};

process.on('message', message => {
  if (message !== 'test:server-error') return;
  failServer();
});
// The test IPC listener must not keep a fully stopped server process alive.
process.channel?.unref();
