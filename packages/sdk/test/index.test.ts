import { describe, expect, it } from 'vitest';
import { createClient } from '../src/index';

describe('sdk client', () => {
  it('normalizes a trailing slash', () => {
    expect(createClient({ baseUrl: 'https://notnote.example/' }).baseUrl).toBe(
      'https://notnote.example',
    );
  });

  it('rejects a relative base url', () => {
    expect(() => createClient({ baseUrl: '/api' })).toThrow(/http/);
  });

  it('attaches the bearer token', async () => {
    let authorization: string | null = null;
    const client = createClient({
      baseUrl: 'https://notnote.example',
      token: 'test-token',
      fetchImpl: async (_input, init) => {
        authorization = new Headers(init?.headers).get('authorization');
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    await expect(client.request('/v1/health')).resolves.toEqual({ ok: true });
    expect(authorization).toBe('Bearer test-token');
  });
});
