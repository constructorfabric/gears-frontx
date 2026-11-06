/**
 * Shared setup for the URL-command tests (`reflect-command-*.test.ts`): a real
 * `DefaultMfeRegistry` built with a recording `RouterPort` double, real domains
 * composed with the shipped strategies chosen explicitly, and chains dispatched
 * through the registry's actions-chain path. Mounts are held open with
 * controllable deferred promises (gates) inside the MFE lifecycle, never with
 * timers or polling.
 */
import { mountedIn } from './mounted-in';
import { expect, onTestFailed, vi } from 'vitest';
import { DefaultMfeRegistry } from '../../DefaultMfeRegistry';
import type { TypeSystemPlugin } from '../../../type-substrate';
import type { Extension, ExtensionDomain, MfeEntry } from '../../../types';
import { MfeHandler, type MfeEntryLifecycle } from '../../../handler/MfeHandler';
import type { ChildMfeBridge } from '../../../handler/ChildMfeBridge';
import { MfeBridgeFactoryDefault } from '../../../bridge/MfeBridgeFactoryDefault';
import { ExtensionDomainImplementation } from '../../ExtensionDomainImplementation';
import { ExtensionDomainImplementationFactory } from '../../ExtensionDomainImplementationFactory';
import type { DomainContext } from '../../DomainContext';
import { ConcurrentMountStrategy } from '../../ConcurrentMountStrategy';
import { OptionalMountStrategy } from '../../OptionalMountStrategy';
import { ExclusiveMountStrategy } from '../../ExclusiveMountStrategy';
import type { ContainerHooks, MountStrategy } from '../../MountStrategy';
import { ActionHandler } from '../../../mediator/ActionHandler';
import type { DefaultActionsChainsMediator } from '../../../mediator/DefaultActionsChainsMediator';
import type { RouterPort } from '../../../router/RouterPort';

export const ACTION_LOAD_EXT = 'mock.action.v1~load_ext.v1~';
export const ACTION_MOUNT_EXT = 'mock.action.v1~mount_ext.v1~';
export const ACTION_UNMOUNT_EXT = 'mock.action.v1~unmount_ext.v1~';
export const STAGE_INIT = 'mock.stage.v1~init.v1';
export const STAGE_ACTIVATED = 'mock.stage.v1~activated.v1';
export const STAGE_DEACTIVATED = 'mock.stage.v1~deactivated.v1';
export const STAGE_DESTROYED = 'mock.stage.v1~destroyed.v1';
export const ENTRY_ID = 'mock.entry.v1~widget.v1';

export interface MockSchema { $id?: string }

export type Verb = 'push' | 'replace';
export type Command = [domainId: string, extensionIds: string[], verb: Verb];
export type Strategy = 'concurrent' | 'optional' | 'exclusive';

export interface Deferred { promise: Promise<void>; resolve: () => void }

export function createDeferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

/**
 * The history intent value the harness plugin refuses at admission; a stand-in
 * for the closed concrete schemas of the real type-system provider.
 */
export const REJECTED_HISTORY = 'back';

export function createPlugin(options: { rejectHistory?: boolean } = {}): TypeSystemPlugin<MockSchema> {
  const schemas = new Map<string, MockSchema>();
  return {
    name: 'MockPlugin',
    version: '1.0.0',
    registerSchema(schema) { if (schema.$id) schemas.set(schema.$id, schema); },
    getSchema(typeId) { return schemas.get(typeId); },
    register(entity) {
      const history = (entity as { payload?: { history?: unknown } } | undefined)?.payload?.history;
      if (options.rejectHistory && history === REJECTED_HISTORY) {
        throw new Error(`admission refused: history '${REJECTED_HISTORY}'`);
      }
    },
    isTypeOf(typeId, baseTypeId) { return typeId === baseTypeId || typeId.startsWith(baseTypeId); },
    validateInstance() { return { valid: true, errors: [] }; },
    resolveLoadExtActionId: () => ACTION_LOAD_EXT,
    resolveMountExtActionId: () => ACTION_MOUNT_EXT,
    resolveUnmountExtActionId: () => ACTION_UNMOUNT_EXT,
    resolveLifecycleStageInitId: () => STAGE_INIT,
    resolveLifecycleStageActivatedId: () => STAGE_ACTIVATED,
    resolveLifecycleStageDeactivatedId: () => STAGE_DEACTIVATED,
    resolveLifecycleStageDestroyedId: () => STAGE_DESTROYED,
  };
}

export function registerEntrySchema(plugin: TypeSystemPlugin<MockSchema>, entryId: string = ENTRY_ID): void {
  const entry: MfeEntry & MockSchema = {
    $id: entryId, id: entryId, requiredProperties: [], actions: [], domainActions: [],
  };
  plugin.registerSchema(entry as unknown as MockSchema);
}

/** A one-shot signal; a spent signal is replaced when the next occurrence begins. */
class Signal {
  readonly deferred = createDeferred();
  spent = false;
  fire(): void { this.spent = true; this.deferred.resolve(); }
}

/**
 * A handler whose lifecycle mount/unmount can be held open per extension with
 * a gate, and whose lifecycle mount/unmount can be made to fail.
 * `mountStarted(id)` / `unmountStarted(id)` resolve once that extension's
 * lifecycle mount / unmount has been entered; each `holdMount` / `holdUnmount`
 * and each new lifecycle entry after a spent signal starts a fresh signal.
 */
export class ControlledHandler extends MfeHandler {
  readonly bridgeFactory = new MfeBridgeFactoryDefault();
  private readonly mountGates = new Map<string, Deferred>();
  private readonly unmountGates = new Map<string, Deferred>();
  private readonly mountSignals = new Map<string, Signal>();
  private readonly unmountSignals = new Map<string, Signal>();
  private readonly mountCompletions = new Map<string, Deferred>();
  private readonly failing = new Set<string>();
  private readonly failingUnmount = new Set<string>();
  private readonly mountEntryCounts = new Map<string, number>();
  /** Lifecycle events in the order they happened: `mount-entered:<id>`, `mount-completed:<id>`, `unmount-entered:<id>`. */
  readonly events: string[] = [];

  /** How many times the extension's lifecycle mount has been entered. */
  mountEntries(id: string): number { return this.mountEntryCounts.get(id) ?? 0; }

  /** Close a gate: the extension's next lifecycle mount waits until `releaseMount`. */
  holdMount(id: string): void {
    this.mountGates.set(id, createDeferred());
    this.mountSignals.set(id, new Signal());
  }
  releaseMount(id: string): void { this.mountGates.get(id)?.resolve(); }
  /** Open every gate that is closed. */
  releaseAll(): void {
    for (const gate of this.mountGates.values()) gate.resolve();
    for (const gate of this.unmountGates.values()) gate.resolve();
  }
  /** Close a gate: the extension's next lifecycle unmount waits until `releaseUnmount`. */
  holdUnmount(id: string): void {
    this.unmountGates.set(id, createDeferred());
    this.unmountSignals.set(id, new Signal());
  }
  releaseUnmount(id: string): void { this.unmountGates.get(id)?.resolve(); }
  failMount(id: string): void { this.failing.add(id); }
  failUnmount(id: string): void { this.failingUnmount.add(id); }
  mountStarted(id: string): Promise<void> { return this.signal(this.mountSignals, id).deferred.promise; }
  unmountStarted(id: string): Promise<void> { return this.signal(this.unmountSignals, id).deferred.promise; }

  /** Resolves once that extension's lifecycle mount has run to completion without failing. */
  mountCompleted(id: string): Promise<void> { return this.completion(id).promise; }

  private completion(id: string): Deferred {
    let d = this.mountCompletions.get(id);
    if (!d) { d = createDeferred(); this.mountCompletions.set(id, d); }
    return d;
  }

  private signal(signals: Map<string, Signal>, id: string): Signal {
    let current = signals.get(id);
    if (!current) { current = new Signal(); signals.set(id, current); }
    return current;
  }

  private enter(signals: Map<string, Signal>, id: string): void {
    let current = signals.get(id);
    if (!current || current.spent) { current = new Signal(); signals.set(id, current); }
    current.fire();
  }

  async load(_entry: MfeEntry, extensionId: string): Promise<MfeEntryLifecycle<ChildMfeBridge>> {
    return {
      mount: async () => {
        this.mountEntryCounts.set(extensionId, this.mountEntries(extensionId) + 1);
        this.events.push(`mount-entered:${extensionId}`);
        this.enter(this.mountSignals, extensionId);
        await this.mountGates.get(extensionId)?.promise;
        if (this.failing.has(extensionId)) throw new Error(`lifecycle mount of '${extensionId}' failed`);
        this.events.push(`mount-completed:${extensionId}`);
        this.completion(extensionId).resolve();
      },
      unmount: async () => {
        this.events.push(`unmount-entered:${extensionId}`);
        this.enter(this.unmountSignals, extensionId);
        await this.unmountGates.get(extensionId)?.promise;
        if (this.failingUnmount.has(extensionId)) throw new Error(`lifecycle unmount of '${extensionId}' failed`);
      },
    };
  }
}

class TestHooks implements ContainerHooks {
  create(): Element { return document.createElement('div'); }
  destroy(): void { /* no-op */ }
}

export function makeExtension(id: string, domain: string): Extension {
  return { id, domain, entry: ENTRY_ID, route: id } as Extension;
}

/** An Exclusive domain declares no `unmount_ext`; the other strategies declare it. */
export function makeDomain(id: string, declaresUnmount: boolean): ExtensionDomain {
  return {
    id,
    actions: declaresUnmount
      ? [ACTION_LOAD_EXT, ACTION_MOUNT_EXT, ACTION_UNMOUNT_EXT]
      : [ACTION_LOAD_EXT, ACTION_MOUNT_EXT],
    extensionsActions: [],
    sharedProperties: [],
    defaultActionTimeout: 5000,
    lifecycleStages: [],
    extensionsLifecycleStages: [],
    extensionsTypeId: '',
    route: id,
  } as unknown as ExtensionDomain;
}

class DomainImpl extends ExtensionDomainImplementation {
  constructor(
    ctx: DomainContext,
    private readonly strategy: MountStrategy,
    registerUnmount: boolean,
    unmountActions: string[]
  ) {
    super();
    ctx.registerHandler(ACTION_MOUNT_EXT, ActionHandler.fromFunction((_t, p) => this.strategy.mount(p as { subject: string })));
    if (registerUnmount) {
      ctx.registerHandler(ACTION_UNMOUNT_EXT, ActionHandler.fromFunction((_t, p) => {
        unmountActions.push((p as { subject: string }).subject);
        return this.strategy.unmount!(p as { subject: string });
      }));
    }
  }
  protected getMountStrategies(): MountStrategy[] { return [this.strategy]; }
}

export function domainFactory(
  strategy: Strategy,
  registerUnmount = strategy !== 'exclusive',
  unmountActions: string[] = []
): ExtensionDomainImplementationFactory {
  return new (class extends ExtensionDomainImplementationFactory {
    build(ctx: DomainContext): DomainImpl {
      const hooks = new TestHooks();
      const s: MountStrategy =
        strategy === 'concurrent' ? new ConcurrentMountStrategy(ctx.mounter, hooks)
        : strategy === 'optional' ? new OptionalMountStrategy(ctx.mounter, hooks)
        : new ExclusiveMountStrategy(ctx.mounter, hooks);
      return new DomainImpl(ctx, s, registerUnmount, unmountActions);
    }
  })();
}

export interface ReflectRouter {
  router: RouterPort;
  /** Every `reflect` call received, in order. */
  calls: Command[];
  /** Every release notification received, in order: `releaseExtension:<id>` / `releaseDomain:<id>`. */
  released: string[];
  /** Resolves once at least `count` calls have been recorded (no polling: resolved by the call itself). */
  whenCalls(count: number): Promise<void>;
  /** Forget recorded calls. */
  reset(): void;
}

/**
 * A router double recording `reflect` calls and release notifications; every
 * other member is a no-op. A failing test prints the commands received.
 */
export function createReflectRouter(onReflect?: (command: Command) => void): ReflectRouter {
  const calls: Command[] = [];
  const released: string[] = [];
  onTestFailed(() => {
    console.error(`reflect commands received: ${JSON.stringify(calls)}`);
  });
  let waiters: Array<{ count: number; resolve: () => void }> = [];
  const router = {
    connect: () => {},
    startDomain: () => {},
    stopDomain: () => {},
    registerDomain: () => {},
    registerExtension: () => {},
    releaseDomain: (domainId: string) => { released.push(`releaseDomain:${domainId}`); },
    releaseExtension: (extensionId: string) => { released.push(`releaseExtension:${extensionId}`); },
    assignOccupantValue: () => undefined,
    supplyNavigation: () => {},
    reflect: vi.fn((domainId: string, extensionIds: string[], verb: Verb) => {
      const command: Command = [domainId, [...extensionIds], verb];
      calls.push(command);
      onReflect?.(command);
      waiters = waiters.filter((w) => {
        if (calls.length >= w.count) { w.resolve(); return false; }
        return true;
      });
    }),
  } as unknown as RouterPort;
  return {
    router,
    calls,
    released,
    whenCalls(count) {
      if (calls.length >= count) return Promise.resolve();
      const d = createDeferred();
      waiters.push({ count, resolve: d.resolve });
      return d.promise;
    },
    reset() { calls.length = 0; },
  };
}

export interface Fixture {
  registry: DefaultMfeRegistry;
  handler: ControlledHandler;
  rr: ReflectRouter;
  domainId: string;
  /** The subject of every `unmount_ext` action that reached the domain's handler. */
  unmountActions: string[];
}

export interface SetupOptions {
  router?: RouterPort | null;
  rr?: ReflectRouter;
  plugin?: TypeSystemPlugin<MockSchema>;
  /** Further entry types with their own handlers, registered beside the default one. */
  extraEntries?: Array<{ entryId: string; handler: MfeHandler }>;
}

/** A registry with one domain of the strategy, extensions registered and the slot attached. */
export async function setup(
  strategy: Strategy,
  domainId: string,
  extensionIds: string[],
  options: SetupOptions = {}
): Promise<Fixture> {
  const rr = options.rr ?? createReflectRouter();
  const plugin = options.plugin ?? createPlugin();
  registerEntrySchema(plugin);
  const handler = new ControlledHandler(ENTRY_ID);
  const extra = options.extraEntries ?? [];
  for (const { entryId } of extra) registerEntrySchema(plugin, entryId);
  const router = options.router === null ? undefined : (options.router ?? rr.router);
  const registry = new DefaultMfeRegistry({
    typeSystem: plugin,
    mfeHandlers: [handler, ...extra.map((e) => e.handler)],
    router,
  });
  const unmountActions: string[] = [];
  registry.registerDomain(
    makeDomain(domainId, strategy !== 'exclusive'),
    domainFactory(strategy, strategy !== 'exclusive', unmountActions)
  );
  for (const id of extensionIds) {
    await registry.registerExtension(makeExtension(id, domainId));
  }
  registry.getMounter(domainId).attach(document.createElement('div'));
  return { registry, handler, rr, domainId, unmountActions };
}

/** Registers a one-off domain-scoped probe action resolving when its handler runs. */
function wireProbe(registry: DefaultMfeRegistry, domainId: string, actionType: string): Promise<void> {
  const deferred = createDeferred();
  const mediator = (registry as unknown as { mediator: DefaultActionsChainsMediator }).mediator;
  mediator.registerHandler(domainId, actionType, ActionHandler.fromFunction(async () => { deferred.resolve(); }));
  return deferred.promise;
}

/** Registers a domain that holds no extension and stays registered, to host probe actions. */
export function addProbeDomain(registry: DefaultMfeRegistry, probeDomainId: string): void {
  registry.registerDomain(makeDomain(probeDomainId, false), domainFactory('exclusive', false));
}

let tagCounter = 0;

/**
 * Dispatches one chain with `next` and `fallback` probes and returns a promise
 * of which one ran. The chain is handed to the registry synchronously before
 * this function returns.
 */
export function dispatch(
  registry: DefaultMfeRegistry,
  domainId: string,
  type: typeof ACTION_MOUNT_EXT | typeof ACTION_UNMOUNT_EXT,
  payload: { subject: string; history?: 'push' | 'replace' | 'none' },
  extra: { timeout?: number; probeDomainId?: string } = {}
): Promise<'next' | 'fallback'> {
  const tag = `probe-${++tagCounter}`;
  const probeDomainId = extra.probeDomainId ?? domainId;
  const next = wireProbe(registry, probeDomainId, `${tag}-next`).then(() => 'next' as const);
  const fallback = wireProbe(registry, probeDomainId, `${tag}-fallback`).then(() => 'fallback' as const);
  registry.executeActionsChain({
    action: { type, target: domainId, payload, ...(extra.timeout === undefined ? {} : { timeout: extra.timeout }) },
    next: { action: { type: `${tag}-next`, target: probeDomainId, payload: {} } },
    fallback: { action: { type: `${tag}-fallback`, target: probeDomainId, payload: {} } },
  });
  return Promise.race([next, fallback]);
}

/** Mounts `id` to completion, waits for both its commands, then forgets the recorded commands. */
export async function mountSettled(f: Fixture, id: string): Promise<void> {
  const before = f.rr.calls.length;
  await dispatch(f.registry, f.domainId, ACTION_MOUNT_EXT, { subject: id });
  await f.rr.whenCalls(before + 2);
  f.rr.reset();
}

/** An asymmetric matcher standing for one command whose projection the FEATURE leaves to the order of two settlements. */
export interface CommandMatcher { asymmetricMatch(actual: unknown): boolean }

/** Matches one `replace` command on `domainId` naming any of the given projections. */
export function replaceNamingOneOf(domainId: string, projections: string[][]): CommandMatcher {
  return {
    asymmetricMatch(actual) {
      const [domain, ids, verb] = actual as Command;
      return domain === domainId && verb === 'replace'
        && projections.some((p) => p.length === ids.length && p.every((id, i) => id === ids[i]));
    },
  };
}

/** A subject no domain admits; a `none` mount of it is refused and issues only its settle command. */
export const BARRIER_SUBJECT = 'barrier-ghost';

/**
 * Asserts the COMPLETE list of commands the domain has received. It waits for
 * the `expected` total, then dispatches a trailing `none` request on the same
 * domain that is refused at once and therefore issues exactly one settle
 * command, after every earlier request's own settlement; that command, naming
 * the domain's mount set, must be the last one, so a late extra command from
 * an earlier request shows up as a mismatch.
 */
export async function expectCommands(f: Fixture, expected: Array<Command | CommandMatcher>): Promise<void> {
  await f.rr.whenCalls(expected.length);
  const outcome = await dispatch(f.registry, f.domainId, ACTION_MOUNT_EXT, { subject: BARRIER_SUBJECT, history: 'none' });
  expect(outcome).toBe('fallback');
  await f.rr.whenCalls(expected.length + 1);
  expect(f.rr.calls).toEqual([
    ...expected,
    [f.domainId, [...mountedIn(f.registry, f.domainId)], 'replace'],
  ]);
}
