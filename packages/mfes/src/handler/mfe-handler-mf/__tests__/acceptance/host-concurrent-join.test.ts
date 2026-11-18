/**
 * Acceptance: a microfrontend load that starts while a host's
 * `SharedUnitFetcher` fetches are in flight joins the host's in-flight
 * entry for each list item whose content identity the host published, and
 * issues no request of its own for it (`inst-host-concurrent-join`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubbedDynamicModuleOps } from '../helpers/blob-module-stub';

const blobModuleStub = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock('../../mf-dynamic-module-ops', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../mf-dynamic-module-ops')>();
  return {
    ...actual,
    DynamicModuleOps: stubbedDynamicModuleOps(
      actual.DynamicModuleOps,
      blobModuleStub,
    ),
  };
});

import { newHandler } from '../helpers/registered-manifest';
import {
  buildEntry,
  buildManifest,
  ENTRY_BASE_ID,
  PUBLIC_PATH,
  sharedDep,
  sha256Hex,
} from '../helpers/manifest-builder';
import { stubSuccessfulImport } from '../helpers/blob-module-stub';
import { controlledFetch, issuedAll, settleTurn } from '../helpers/controlled-fetch';
import { resetRealmSharedDepTextCache } from '../helpers/realm-cache';
import { SharedUnitFetcher } from '../../SharedUnitFetcher';

beforeEach(() => {
  resetRealmSharedDepTextCache();
  stubSuccessfulImport(blobModuleStub);
});
afterEach(() => {
  resetRealmSharedDepTextCache();
  blobModuleStub.current = undefined;
  vi.restoreAllMocks();
});

const ENTRY_TEXT =
  'import { r } from "react";\nexport default { mount() { return r; }, unmount() {} };\n';
const LIST_URL = `${PUBLIC_PATH}shared/react.list.json`;
const ENTRY_URL = `${PUBLIC_PATH}assets/lifecycle.js`;

interface Unit {
  text: string;
  /** The URL the microfrontend's list names it at. */
  url: string;
  /** The URL a host holds the same content at. */
  hostUrl: string;
}

const unit = (name: string): Unit => ({
  text: `export const ${name} = 1;\n`,
  url: `${PUBLIC_PATH}shared/${name}/index.abc.js`,
  hostUrl: `https://host.test/shared/${name}/index.abc.js`,
});

function listOf(units: Record<string, Unit>): string {
  return JSON.stringify({
    items: Object.entries(units).map(([name, u]) => ({
      location: `shared/${name}/index.abc.js`,
      contentHash: sha256Hex(u.text),
      answers: [name],
      imports: [],
    })),
  });
}

let loads = 0;
function startLoad(list: string) {
  return newHandler(ENTRY_BASE_ID, { retries: 0 }).load(
    buildEntry(
      buildManifest([sharedDep('react')], {
        entryLists: {
          './lifecycle': {
            location: 'shared/react.list.json',
            contentHash: sha256Hex(list),
          },
        },
      }),
    ),
    `ext-host-join-${(loads += 1)}`,
  );
}

const settleAll = async (): Promise<void> => {
  for (let i = 0; i < 20; i += 1) await settleTurn();
};

describe('acceptance: host fill in flight, microfrontend load joins', () => {
  it('a load whose list names the content identity a host fetch has in flight issues no request for it', async () => {
    const net = controlledFetch();
    const react = unit('react');
    const host = new SharedUnitFetcher(async (url) => (await fetch(url)).text(), 'host');

    // The host's fetch is in flight and stays so while the load runs.
    const hostText = host.fetch(react.hostUrl, sha256Hex(react.text));
    await issuedAll(net, [react.hostUrl]);

    const list = listOf({ react });
    const loading = startLoad(list);
    await issuedAll(net, [ENTRY_URL, LIST_URL]);
    net.ok(LIST_URL, list);
    net.ok(ENTRY_URL, ENTRY_TEXT);
    await settleAll();

    // The list arrived and named the item the host has in flight: the
    // load waits on the host's fetch rather than issuing its own.
    expect(net.count(react.url)).toBe(0);

    net.ok(react.hostUrl, react.text);
    await loading;
    await expect(hostText).resolves.toBe(react.text);
    expect(net.count(react.url)).toBe(0);
    expect(net.count(react.hostUrl)).toBe(1);
  });

  it('joins the host fetch of each list item', async () => {
    const net = controlledFetch();
    const units = { react: unit('react'), dom: unit('dom') };
    const host = new SharedUnitFetcher(async (url) => (await fetch(url)).text(), 'host');
    const hostTexts = Object.values(units).map((u) =>
      host.fetch(u.hostUrl, sha256Hex(u.text)),
    );
    await issuedAll(net, Object.values(units).map((u) => u.hostUrl));

    const list = listOf(units);
    const loading = startLoad(list);
    await issuedAll(net, [ENTRY_URL, LIST_URL]);
    net.ok(LIST_URL, list);
    net.ok(ENTRY_URL, ENTRY_TEXT);
    await settleAll();
    for (const u of Object.values(units)) expect(net.count(u.url)).toBe(0);

    for (const u of Object.values(units)) net.ok(u.hostUrl, u.text);
    await loading;
    await expect(Promise.all(hostTexts)).resolves.toEqual(
      Object.values(units).map((u) => u.text),
    );
    for (const u of Object.values(units)) {
      expect(net.count(u.url)).toBe(0);
      expect(net.count(u.hostUrl)).toBe(1);
    }
  });

  it('control: with no host fetch the load fetches the item itself', async () => {
    const net = controlledFetch();
    const react = unit('react');
    const list = listOf({ react });
    const loading = startLoad(list);
    await issuedAll(net, [ENTRY_URL, LIST_URL]);
    net.ok(LIST_URL, list);
    await issuedAll(net, [react.url]);
    net.ok(ENTRY_URL, ENTRY_TEXT);
    net.ok(react.url, react.text);
    await loading;
    expect(net.count(react.url)).toBe(1);
  });
});
