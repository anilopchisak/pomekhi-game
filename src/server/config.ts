export interface ServerConfig {
  host: string;
  port: number;
}

export function getServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const rawPort = env.PORT ?? '3000';
  if (!/^\d+$/.test(rawPort)) {
    throw new Error('PORT must be an integer from 0 to 65535.');
  }
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error('PORT must be an integer from 0 to 65535.');
  }
  const host = env.HOST?.trim() || '127.0.0.1';
  return { host, port };
}

export function getServerOrigin({ host, port }: ServerConfig): string {
  const connectHost = host === '0.0.0.0' ? '127.0.0.1' : host === '::' ? '::1' : host;
  return `http://${connectHost.includes(':') ? `[${connectHost}]` : connectHost}:${port}`;
}
