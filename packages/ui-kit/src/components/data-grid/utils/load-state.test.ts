import { describe, expect, it } from 'vitest';
import { createLoadStateManager } from './load-state';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createLoadStateManager', () => {
  it('follows a promise: loading while it is pending, then loaded or error', async () => {
    const manager = createLoadStateManager();
    const state = () => manager.useLoadState.getState().loadState;

    const ok = deferred<string>();
    const followed = manager.loadPromise(ok.promise);
    expect(state()).toBe('loading');
    ok.resolve('rows');
    await expect(followed).resolves.toBe('rows');
    expect(state()).toBe('loaded');

    const failing = deferred<string>();
    const failed = manager.loadPromise(failing.promise);
    failing.reject(new Error('backend down'));
    await expect(failed).rejects.toThrow('backend down');
    expect(state()).toBe('error');
  });

  // A promise that was cut off must not come back later and write over what the state has become.
  describe('reset', () => {
    it('goes back to idle, and the outcome of the promise it detached no longer writes', async () => {
      const manager = createLoadStateManager();
      const state = () => manager.useLoadState.getState().loadState;

      const cutOff = deferred<string>();
      const followed = manager.loadPromise(cutOff.promise);
      manager.reset();
      expect(state()).toBe('blank');
      cutOff.resolve('rows');

      await expect(followed).resolves.toBe('rows');
      expect(state()).toBe('blank');
    });

    it('still rethrows the failure of a promise it detached, without writing it', async () => {
      const manager = createLoadStateManager();
      const cutOff = deferred<string>();
      const followed = manager.loadPromise(cutOff.promise);
      manager.reset();
      cutOff.reject(new Error('late failure'));

      await expect(followed).rejects.toThrow('late failure');
      expect(manager.useLoadState.getState().loadState).toBe('blank');
    });

    it('leaves a later promise in charge of the state, whichever settles first', async () => {
      const manager = createLoadStateManager();
      const state = () => manager.useLoadState.getState().loadState;

      const first = deferred<string>();
      const firstFollowed = manager.loadPromise(first.promise);
      manager.reset();
      const second = deferred<string>();
      const secondFollowed = manager.loadPromise(second.promise);

      first.resolve('stale');
      await firstFollowed;
      expect(state()).toBe('loading');

      second.resolve('rows');
      await secondFollowed;
      expect(state()).toBe('loaded');
    });
  });
});
