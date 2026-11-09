import { NotNoteError } from '@notnote/shared';

export interface SdkOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface NotNoteClient {
  readonly baseUrl: string;
  request<T>(path: string, init?: RequestInit): Promise<T>;
}

export function createClient(options: SdkOptions): NotNoteClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');

  if (!/^https?:\/\//.test(baseUrl)) {
    throw new NotNoteError('invalid_base_url', 'baseUrl must start with http:// or https://');
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  return {
    baseUrl,
    async request<T>(path: string, init: RequestInit = {}): Promise<T> {
      const headers = new Headers(init.headers);
      headers.set('accept', 'application/json');
      if (options.token) {
        headers.set('authorization', `Bearer ${options.token}`);
      }

      const response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
      if (!response.ok) {
        throw new NotNoteError('http_error', `Request failed with status ${response.status}`, {
          cause: response,
        });
      }

      return (await response.json()) as T;
    },
  };
}
