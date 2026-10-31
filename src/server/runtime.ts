import { createAppServer } from './app.js';
import type { AppServerOptions } from './app.js';
import { getServerOrigin } from './config.js';
import type { ServerConfig } from './config.js';

export interface ListeningServer {
  port: number;
  origin: string;
}

export interface ServerRuntimeOptions extends AppServerOptions {
  config: ServerConfig;
}

function cancelledStart() {
  const error = new Error('Server startup was cancelled. Create a new runtime to start again.');
  error.name = 'AbortError';
  return error;
}

export function createServerRuntime(options: ServerRuntimeOptions) {
  const { config, ...appOptions } = options;
  const app = createAppServer(appOptions);
  const controller = new AbortController();
  let state: 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' = 'idle';
  let starting: Promise<ListeningServer> | undefined;
  let stopping: Promise<void> | undefined;
  let pendingListen = false;

  function stop(): Promise<void> {
    if (stopping) return stopping;
    state = 'stopping';
    if (pendingListen) controller.abort();
    stopping = app.close().finally(() => { state = 'stopped'; });
    return stopping;
  }

  function start(): Promise<ListeningServer> {
    if (state === 'stopping' || state === 'stopped') return Promise.reject(cancelledStart());
    if (starting) return starting;
    state = 'starting';
    starting = new Promise<ListeningServer>((resolve, reject) => {
      function cleanup() {
        pendingListen = false;
        app.server.off('listening', onListening);
        app.server.off('error', onError);
        controller.signal.removeEventListener('abort', onAbort);
      }
      function onError(error: Error) { cleanup(); reject(error); }
      function onAbort() { cleanup(); reject(cancelledStart()); }
      function onListening() {
        cleanup();
        if (state !== 'starting') { reject(cancelledStart()); return; }
        const address = app.server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('The server did not report a TCP listening address.'));
          return;
        }
        state = 'running';
        resolve({ port: address.port, origin: getServerOrigin({ host: config.host, port: address.port }) });
      }
      app.server.once('error', onError);
      app.server.once('listening', onListening);
      controller.signal.addEventListener('abort', onAbort, { once: true });
      pendingListen = true;
      try { app.server.listen({ ...config, signal: controller.signal }); }
      catch (error) { onError(error as Error); }
    }).catch(async error => {
      try { await stop(); }
      catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Server startup and cleanup failed.', { cause: cleanupError }); }
      throw error;
    });
    return starting;
  }

  return { start, stop };
}
