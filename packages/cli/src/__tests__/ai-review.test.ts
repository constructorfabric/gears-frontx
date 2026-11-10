import { describe, expect, it } from 'vitest';
import { createAiReview } from '../operations/ai-review';

describe('createAiReview', () => {
  it('binds arbitrary candidate bytes and destination identity without exposing bytes', () => {
    const bytes = new Uint8Array([0, 255, 10]);
    const destination = { path: '/project/.frontx/ai/demo', identity: { verified: true, device: 1, inode: 2 } };
    const first = createAiReview(destination, [
      { path: 'nested/prompt.bin', bytes },
    ]);
    const changed = createAiReview(destination, [
      { path: 'nested/prompt.bin', bytes: new Uint8Array([0, 255, 11]) },
    ]);
    const moved = createAiReview({ ...destination, path: '/other/.frontx/ai/demo' }, [
      { path: 'nested/prompt.bin', bytes },
    ]);

    expect(first.digest).not.toBe(changed.digest);
    expect(first.digest).not.toBe(moved.digest);
    expect(first.digest).not.toBe(createAiReview({ ...destination, identity: { verified: true, device: 1, inode: 3 } }, [
      { path: 'nested/prompt.bin', bytes },
    ]).digest);
    expect(createAiReview({ path: destination.path, identity: { device: 1, verified: true, inode: 2 } }, [
      { path: 'nested/prompt.bin', bytes },
    ]).digest).toBe(first.digest);
    expect(first.files[0]).toMatchObject({ path: 'nested/prompt.bin', length: 3 });
    expect(JSON.stringify(first)).not.toContain('255');
  });

  it('orders independently of locale and rejects invalid, colliding, or unknown inputs', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    const a = [{ path: 'z.txt', bytes: new Uint8Array() }, { path: 'É.txt', bytes: new Uint8Array() }, { path: 'A!.txt', bytes: new Uint8Array() }];
    expect(createAiReview(dest, a).digest).toBe(createAiReview(dest, [...a].reverse()).digest);
    expect(() => createAiReview(dest, [{ path: 'A', bytes: new Uint8Array() }, { path: 'a', bytes: new Uint8Array() }])).toThrow(/collide/);
    expect(() => createAiReview(dest, [{ path: 'é', bytes: new Uint8Array() }, { path: 'e\u0301', bytes: new Uint8Array() }])).toThrow(/collide/);
    expect(() => createAiReview(dest, [{ path: 'ς.txt', bytes: new Uint8Array() }, { path: 'σ.txt', bytes: new Uint8Array() }])).toThrow(/collide/);
    expect(() => createAiReview(dest, [{ path: '../escape', bytes: new Uint8Array() }])).toThrow(/Invalid/);
    expect(() => createAiReview({ path: '/ai/x', identity: undefined }, [])).toThrow(/known identity/);
    expect(() => createAiReview(dest, [{ path: 'node', bytes: new Uint8Array() }, { path: 'node/child', bytes: new Uint8Array() }])).toThrow(/conflicts/);
    expect(() => createAiReview(dest, [{ path: 'x', bytes: new Uint8Array() }])).not.toThrow();
  });

  it('rejects portable aliases between nested directories and file ancestry in each tree', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    const byte = new Uint8Array();
    expect(() => createAiReview(dest, [], [], ['Nested/Branch', 'nested/branch'])).toThrow(/directories collide/);
    expect(() => createAiReview(dest, [], [], ['É/Child', 'e\u0301/child'])).toThrow(/directories collide/);
    expect(() => createAiReview(dest, [], [{ path: 'nested/branch', bytes: byte }], [], ['Nested/Branch'])).toThrow(/directory conflicts/);
    expect(() => createAiReview(dest, [{ path: 'nested/branch/file', bytes: byte }], [], ['Nested/Branch'])).not.toThrow();
    expect(() => createAiReview(dest, [], [], ['nested', 'nested/branch'])).not.toThrow();
  });

  it('reviews replacements and local-only files and retains the exact candidate byte snapshot', () => {
    const source = new Uint8Array([1, 2]);
    const result = createAiReview({ path: '/ai/x', identity: { verified: 'caller-checked' } },
      [{ path: 'prompt.bin', bytes: source }, { path: 'new.txt', bytes: new Uint8Array([3]) }],
      [{ path: 'prompt.bin', bytes: new Uint8Array([0]) }, { path: 'local.txt', bytes: new Uint8Array([4]) }]);
    source[0] = 9;
    expect([...result.candidateSnapshot[0]!.bytes]).toEqual([1, 2]);
    const approvedDigest = result.digest;
    result.candidateSnapshot[0]!.bytes[0] = 99;
    expect([...result.candidateSnapshot[0]!.bytes]).toEqual([1, 2]);
    expect(result.digest).toBe(approvedDigest);
    expect(result.changes).toEqual([
      { path: 'local.txt', kind: 'local-only' },
      { path: 'new.txt', kind: 'add' },
      { path: 'prompt.bin', kind: 'replace' },
    ]);
    expect(result.digest).toBe(createAiReview({ path: '/ai/x', identity: { verified: 'caller-checked' } },
      result.candidateSnapshot, [{ path: 'prompt.bin', bytes: new Uint8Array([0]) }, { path: 'local.txt', bytes: new Uint8Array([4]) }]).digest);
    expect(() => createAiReview({ path: '/ai/x', identity: { verified: true } }, [], [{ path: 'a', bytes: new Uint8Array() }, { path: 'A', bytes: new Uint8Array() }])).toThrow(/collide/);
  });

  it('matches candidate and destination paths by portable identity while retaining display spelling', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    expect(createAiReview(dest, [{ path: 'Prompt.txt', bytes: new Uint8Array([1]) }], [{ path: 'prompt.txt', bytes: new Uint8Array([1]) }]).changes)
      .toEqual([{ path: 'Prompt.txt', kind: 'unchanged' }]);
    expect(createAiReview(dest, [{ path: 'É.txt', bytes: new Uint8Array([1]) }], [{ path: 'e\u0301.TXT', bytes: new Uint8Array([2]) }]).changes)
      .toEqual([{ path: 'É.txt', kind: 'replace' }]);
  });

  it('rejects ancestor conflicts between candidate and existing trees in either direction', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    const bytes = new Uint8Array();
    expect(() => createAiReview(dest, [{ path: 'Node', bytes }], [{ path: 'node/child', bytes }])).toThrow(/conflicts/);
    expect(() => createAiReview(dest, [{ path: 'NODE/child', bytes }], [{ path: 'node', bytes }])).toThrow(/conflicts/);
    expect(() => createAiReview(dest, [{ path: 'Node', bytes }], [{ path: 'node', bytes }])).not.toThrow();
  });

  it('rejects portable cross-tree file-directory conflicts and presents directory changes', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    const bytes = new Uint8Array();
    expect(() => createAiReview(dest, [{ path: 'É', bytes }], [], [], ['e\u0301'])).toThrow(/conflicts/);
    expect(() => createAiReview(dest, [], [{ path: 'A', bytes }], ['a'], [])).toThrow(/conflicts/);
    expect(() => createAiReview(dest, [{ path: 'dir/file', bytes }], [], ['dir'], [])).not.toThrow();
    const review = createAiReview(dest, [], [], ['new/empty'], ['old/empty']);
    expect(review.changes).toEqual([
      { path: 'new/empty', kind: 'add-directory' },
      { path: 'old/empty', kind: 'local-only-directory' },
    ]);
    expect(review.digest).not.toBe(createAiReview(dest, [], [], [], ['old/empty']).digest);
  });

  it('locks approved execution metadata against caller tampering', () => {
    const review = createAiReview({ path: '/ai/x', identity: { device: 1 } }, [{ path: 'file', bytes: new Uint8Array([1]) }]);
    expect(() => { review.destination.path = '/other'; }).toThrow();
    expect(() => { review.directories.push('outside'); }).toThrow();
    expect(() => { review.files[0]!.path = '../escape'; }).toThrow();
    expect(review.digest).toBe(createAiReview({ path: '/ai/x', identity: { device: 1 } }, [{ path: 'file', bytes: new Uint8Array([1]) }]).digest);
  });

  it('deeply freezes the captured destination identity', () => {
    const identity = { volume: { id: 'v1' }, ancestry: [{ inode: 1 }] };
    const review = createAiReview({ path: '/ai/x', identity }, []);
    expect(() => { (review.destination.identity as { volume: { id: string } }).volume.id = 'changed'; }).toThrow();
    expect(() => { (review.destination.identity as { ancestry: { inode: number }[] }).ancestry[0]!.inode = 2; }).toThrow();
    expect(identity.volume.id).toBe('v1');
  });

  it('checks the portable file and directory conflict matrix while allowing siblings', () => {
    const dest = { path: '/ai/x', identity: { verified: true } };
    const bytes = new Uint8Array();
    const invalid = [
      { files: [{ path: 'Node', bytes }], dirs: ['node/child'] },
      { files: [{ path: 'É', bytes }], dirs: ['e\u0301/child'] },
    ];
    for (const scenario of invalid) {
      expect(() => createAiReview(dest, scenario.files, [], scenario.dirs, [])).toThrow(/conflicts/);
      expect(() => createAiReview(dest, [], scenario.files, [], scenario.dirs)).toThrow(/conflicts/);
    }
    expect(() => createAiReview(dest, [{ path: 'node-a', bytes }], [], ['node-b/child'])).not.toThrow();
    expect(() => createAiReview(dest, [{ path: 'node/child', bytes }], [], ['node'])).not.toThrow();
  });
});
