import { describe, expect, it } from 'vitest';
import { API_VERSION, health } from '../src/index';

describe('api contract', () => {
  it('exposes a versioned health payload', () => {
    expect(health()).toEqual({
      status: 'ok',
      service: 'notnote-api',
      version: API_VERSION,
    });
  });
});
