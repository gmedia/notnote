import { describe, expect, it } from 'vitest';
import { COLLAB_PROTOCOL_VERSION, documentKey } from '../src/index';

describe('collaboration contract', () => {
  it('namespaces snapshots by workspace and page', () => {
    expect(documentKey({ workspaceId: 'w1', pageId: 'p1' })).toBe(
      'workspaces/w1/pages/p1/snapshot',
    );
  });

  it('pins the protocol version', () => {
    expect(COLLAB_PROTOCOL_VERSION).toBe(1);
  });
});
