export const APP_ID = 'pomekhi';

export interface HealthResponse {
  app: typeof APP_ID;
  status: 'ok';
  stage: 'foundation';
}

export interface ServerToClientEvents {
  'server:ready': (health: HealthResponse) => void;
}

export type ClientToServerEvents = Record<never, never>;
