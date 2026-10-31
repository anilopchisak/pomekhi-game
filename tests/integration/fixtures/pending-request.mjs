import { Server } from 'node:http';

const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event === 'request' && args[0].url === '/test-pending-stop') {
    // Keep this test-only request unfinished without a production probe route.
    process.send?.({ type: 'test:request-pending' });
    return true;
  }
  return emit.call(this, event, ...args);
};
