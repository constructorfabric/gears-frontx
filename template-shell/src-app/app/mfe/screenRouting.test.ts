import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Extension, ScreenExtension } from '@gears-frontx/react';
import { resolveScreenFromPath } from './screenRouting';

const screen = (id: string, route: string, order?: number): ScreenExtension => ({
  id,
  domain: 'screen-domain',
  entry: `${id}.entry`,
  presentation: { label: id, route, order },
});

const tasks = screen('ext.tasks', '/tasks', 20);
const login = screen('ext.login', '/login', 10);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveScreenFromPath', () => {
  it('returns the screen whose route matches the path', () => {
    expect(resolveScreenFromPath('/tasks', [login, tasks])).toBe(tasks);
  });

  it('ignores a trailing slash on either side of the comparison', () => {
    expect(resolveScreenFromPath('/tasks/', [login, tasks])).toBe(tasks);
    expect(resolveScreenFromPath('/tasks', [login, screen('ext.tasks', '/tasks/', 20)])?.presentation.route)
      .toBe('/tasks/');
  });

  it('falls back to the lowest-order screen at the root path', () => {
    expect(resolveScreenFromPath('/', [tasks, login])).toBe(login);
  });

  it('mounts the same fallback for a path no screen claims', () => {
    expect(resolveScreenFromPath('/nowhere', [tasks, login])).toBe(login);
  });

  it('lets a screen claim the root path itself', () => {
    const home = screen('ext.home', '/', 50);
    expect(resolveScreenFromPath('/', [home, tasks])).toBe(home);
  });

  it('treats a screen without an order as ordered after every screen that has one', () => {
    const unordered = screen('ext.unordered', '/unordered');
    expect(resolveScreenFromPath('/', [unordered, tasks])).toBe(tasks);
  });

  it('mounts the first of two screens claiming one route and names both in a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const duplicate = screen('ext.tasks-copy', '/tasks', 30);

    expect(resolveScreenFromPath('/tasks', [duplicate, tasks])).toBe(tasks);

    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0][0];
    expect(message).toContain('ext.tasks');
    expect(message).toContain('ext.tasks-copy');
  });

  it('returns null when no screen extension is registered', () => {
    expect(resolveScreenFromPath('/tasks', [])).toBeNull();
  });

  it('skips an extension that carries no presentation instead of throwing', () => {
    // The registry hands back the base `Extension` shape; a manifest that
    // slipped past schema validation must not break navigation for the rest.
    const malformed: Extension = { id: 'ext.malformed', domain: 'screen-domain', entry: 'e' };
    expect(resolveScreenFromPath('/tasks', [malformed, tasks])).toBe(tasks);
    expect(resolveScreenFromPath('/nowhere', [malformed])).toBeNull();
  });
});
