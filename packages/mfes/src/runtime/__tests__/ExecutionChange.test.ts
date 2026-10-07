import { describe, it, expect } from 'vitest';
import { executionChange } from '../ExecutionChange';

describe('executionChange', () => {
  it('lists what entered and what left the mount set', () => {
    expect(executionChange(['a'], ['b'])).toEqual({ mounted: ['b'], unmounted: ['a'] });
  });

  it('lists nothing when the set is unchanged', () => {
    expect(executionChange(['a', 'b'], ['b', 'a'])).toEqual({ mounted: [], unmounted: [] });
  });

  it('lists nothing for an extension that is in neither set', () => {
    expect(executionChange([], [])).toEqual({ mounted: [], unmounted: [] });
  });

  it('with onlySubject, considers only that extension: a mount of it', () => {
    expect(executionChange(['x'], ['x', 'a', 'y'], 'a')).toEqual({ mounted: ['a'], unmounted: [] });
  });

  it('with onlySubject, considers only that extension: an unmount of it', () => {
    expect(executionChange(['a', 'x'], ['y'], 'a')).toEqual({ mounted: [], unmounted: ['a'] });
  });

  it('with onlySubject, ignores changes to other extensions', () => {
    expect(executionChange(['x'], ['y'], 'a')).toEqual({ mounted: [], unmounted: [] });
  });
});
