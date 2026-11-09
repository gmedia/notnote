import { APP_NAME } from '@notnote/shared';

export const API_VERSION = 'v1' as const;

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: string;
  readonly version: string;
}

export function health(): HealthResponse {
  return {
    status: 'ok',
    service: `${APP_NAME.toLowerCase()}-api`,
    version: API_VERSION,
  };
}
