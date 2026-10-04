/**
 * DefaultExtensionMounter - Concrete per-domain mount facade
 *
 * Composes `MountManager` (MFE load/mount/unmount primitives) and an
 * `ExtensionManager` reference (for mount-set bookkeeping) to implement the
 * per-domain `ExtensionMounter` contract.
 *
 * One instance is constructed by the registry per registered domain inside
 * `registerDomain` and exposed to the domain implementation via
 * `DomainContext.mounter`. The React `ExtensionDomainSlot` accesses this
 * instance via `registry.getMounter(domainId)`.
 *
 * @packageDocumentation
 * @internal
 */
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-slot-detach:p2
// @cpt-algo:cpt-frontx-algo-extension-domain-governance-mount-execution:p2

import { ExtensionMounter } from './ExtensionMounter';
import type { MountManager } from './MountManager';
import { ExtensionReleaserProvider } from './ExtensionReleaserProvider';

/**
 * @internal
 */
export class DefaultExtensionMounter extends ExtensionMounter {
  private attachedRoot: Element | null = null;

  // Tracks the per-extension containers so detach can remove them from root.
  private readonly containers = new Map<string, Element>();

  /**
   * The in-flight `mount()` call for an extension currently being mounted,
   * keyed by extension id, together with the container that call was given.
   * A second concurrent `mount()` call for the same extension id AND THE
   * SAME container object awaits the first's promise instead of running the
   * mount pipeline (and appending a second, duplicate container) a second
   * time.
   *
   * `container` is never supplied by an external caller or action payload —
   * every mount strategy creates it internally via `this.hooks.create(extensionId)`
   * before calling `mounter.mount(extensionId, container)`. So a second
   * concurrent call for the same extension id with a DIFFERENT container can
   * only mean a bug in the calling strategy's own internal state management
   * (e.g. it created a container twice for what it thought were two mounts
   * of the same extension). That is not a legitimate case to route around
   * gracefully — see the hard invariant check in `mount()` below.
   */
  private readonly inFlightMountsByExtension = new Map<string, { promise: Promise<void>; container: Element }>();

  /**
   * The settlement promise of an extension currently being unmounted through
   * this mounter, keyed by extension id — populated for the whole duration of
   * `unmount()`, whether that call originates from the domain's explicit
   * `unmount_ext` action handler or from a mount strategy's own eviction or
   * displacement of a sibling. The mount-ext prologue (`MountExtActionHandler`,
   * `cpt-frontx-algo-extension-domain-governance-mount-execution` `inst-me-await-unmount-settle`)
   * consults this map for the extension it is about to mount, before any
   * strategy runs, so a mount request arriving while that same extension is
   * being unmounted waits for the unmount to settle instead of racing it.
   */
  private readonly unmountInFlightByExtension = new Map<string, Promise<void>>();

  /**
   * The SAME releaser `ExtensionReleaserProvider.for(this)` resolves for
   * every caller targeting this mounter — strategies (`ConcurrentMountStrategy.ts`, `OptionalMountStrategy.ts`, `ExclusiveMountStrategy.ts`)
   * resolve it independently through the same provider, so this mounter
   * never owns a releaser of its own distinct from the one they reach.
   * Resolved once, after `super()`, and reused for every `detach()` call.
   */
  private readonly releaser: ReturnType<typeof ExtensionReleaserProvider.for>;

  constructor(
    private readonly domainId: string,
    private readonly mountManager: MountManager,
    private readonly addMountedExtension: (domainId: string, extensionId: string) => void,
    private readonly removeMountedExtension: (domainId: string, extensionId: string) => void,
    private readonly getMountedExtensions: (domainId: string) => readonly string[]
  ) {
    super();
    this.releaser = ExtensionReleaserProvider.for(this);
  }

  attach(root: Element): void {
    this.attachedRoot = root;
  }

  async detach(): Promise<void> {
    // Mass-unmount every currently-mounted extension so the registry and
    // any framework slice stay consistent. Routed through `this.releaser`
    // — not `unmount()` or `mountManager.unmountExtension` directly — so a
    // mount request racing this detach observes each extension's unmount as
    // in flight (`getUnmountInFlight`) and waits for it instead of racing
    // it, AND a strategy's own explicit release of the same extension
    // racing this detach still runs the destroy that strategy registered
    // at mount time, through the shared releaser, exactly once.
    //
    // The root is cleared FIRST, synchronously, before the mount set is
    // even read — so a mount whose own lifecycle mount settles while this
    // loop is still unmounting an earlier occupant never finds a root to
    // append its container under; it observes the root as already detached
    // and rolls itself back instead of becoming an orphan occupant.
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-clear-root-first
    this.attachedRoot = null;
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-clear-root-first

    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-no-report
    // Resource cleanup, not an occupancy action: `this.releaser.release`
    // below runs the ordinary physical-unmount path, which dispatches no
    // `unmount_ext` action and therefore reaches no domain handler for a
    // router to report through (`cpt-frontx-algo-extension-domain-governance-mount-execution`
    // only reports executions that reach the handler via `mount_ext`/`unmount_ext`).
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-no-report
    const mounted = Array.from(this.getMountedExtensions(this.domainId));
    const failures: unknown[] = [];
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-each-occupant
    for (const extId of mounted) {
      try {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-unmount-occupant
        await this.releaser.release(extId);
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-unmount-occupant
      } catch (error) {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-continue-on-failure
        failures.push(error);
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-continue-on-failure
      }
    }
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-each-occupant

    if (failures.length === 1) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-single-failure
      throw failures[0];
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-single-failure
    }
    if (failures.length > 1) {
      // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-aggregate-failure
      // Reached via `globalThis` — not the bare `AggregateError` identifier
      // — because this package's own `lib` target predates it; the runtime
      // host (browser or Node) still provides the constructor.
      const { AggregateError: AggregateErrorCtor } = globalThis as unknown as {
        AggregateError: new (errors: Iterable<unknown>, message?: string) => Error;
      };
      throw new AggregateErrorCtor(
        failures,
        `ExtensionMounter.detach: ${failures.length} extensions in domain '${this.domainId}' failed to unmount.`
      );
      // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-aggregate-failure
    }
    // @cpt-begin:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-return
    return;
    // @cpt-end:cpt-frontx-algo-extension-domain-governance-slot-detach:p2:inst-sd-return
  }

  async mount(extensionId: string, container: Element): Promise<void> {
    if (!this.attachedRoot) {
      throw new Error(
        `ExtensionMounter.mount: no root attached for domain '${this.domainId}'. ` +
        'Call attach(element) before mounting extensions.'
      );
    }

    const inFlight = this.inFlightMountsByExtension.get(extensionId);
    if (inFlight) {
      if (inFlight.container !== container) {
        // Impossible in correct code: no caller of `mount()` ever supplies a
        // container from outside this mounter's own strategy — it is always
        // freshly created via `hooks.create(extensionId)` immediately before
        // this call. Two different containers for the same extension id
        // while a mount is in flight means the calling strategy's own state
        // tracking is broken (e.g. it invoked `mount()` twice for what it
        // believed were two distinct mounts of the same extension). This is
        // a hard internal-invariant violation, not a race to handle
        // gracefully — no cleanup of the mismatched container is performed.
        throw new Error(
          `ExtensionMounter.mount: internal invariant violated for extension ` +
          `'${extensionId}' in domain '${this.domainId}' — a mount is already ` +
          'in flight for this extension with a DIFFERENT container. This ' +
          'indicates a bug in the calling mount strategy, not a legitimate ' +
          'concurrent-mount scenario.'
        );
      }
      return inFlight.promise;
    }

    const mountWork = (async (): Promise<void> => {
      await this.mountManager.mountExtension(extensionId, container);

      // Append the container under the attached root and record it.
      // Capture the root after the await completes and check it explicitly,
      // since a concurrent detach() call could have cleared it during the await.
      const root = this.attachedRoot;
      if (!root) {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-mount-root-detached
        const error = new Error(
          `ExtensionMounter.mount: domain '${this.domainId}' root was detached ` +
          `during mounting of extension '${extensionId}'. The domain's root element ` +
          'must remain attached for the entire duration of the mount operation.'
        );
        try {
          await this.mountManager.unmountExtension(extensionId);
        } catch (compensationError) {
          (error as Error & { cause?: unknown }).cause = compensationError;
        }
        throw error;
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-mount-root-detached
      }

      try {
        root.appendChild(container);
        this.containers.set(extensionId, container);

        this.addMountedExtension(this.domainId, extensionId);
      } catch (error) {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-mount-rollback
        container.parentNode?.removeChild(container);
        this.containers.delete(extensionId);
        this.removeMountedExtension(this.domainId, extensionId);
        try {
          await this.mountManager.unmountExtension(extensionId);
        } catch {
          // The original error stays primary.
        }
        throw error;
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-mount-rollback
      }
    })();

    this.inFlightMountsByExtension.set(extensionId, { promise: mountWork, container });
    try {
      await mountWork;
    } finally {
      this.inFlightMountsByExtension.delete(extensionId);
    }
  }

  // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-await-unmount-settle
  /**
   * @param extensionId - ID of the extension being unmounted.
   */
  async unmount(extensionId: string): Promise<void> {
    // Coalesce a second concurrent unmount request for the SAME extension:
    // join the already-tracked settlement rather than running a second
    // physical unmount and racing the first for the same map entry (each
    // call's cleanup would otherwise delete whichever entry the map holds
    // at that moment, including the other call's).
    const inFlight = this.unmountInFlightByExtension.get(extensionId);
    if (inFlight) {
      return inFlight;
    }

    // A placeholder settlement is published in `unmountInFlightByExtension`
    // BEFORE `mountManager.unmountExtension` is ever invoked — not after —
    // so a call that re-enters `unmount` for the SAME extension id
    // synchronously (from that call's own synchronous prefix, e.g. a
    // `deactivated` hook or the lifecycle `unmount` itself dispatching a
    // fresh mount before its first `await`) finds this entry already in
    // flight and joins it instead of racing an untracked physical unmount.
    let settlePlaceholder!: () => void;
    let rejectPlaceholder!: (error: unknown) => void;
    const placeholder = new Promise<void>((resolve, reject) => {
      settlePlaceholder = resolve;
      rejectPlaceholder = reject;
    });
    this.unmountInFlightByExtension.set(extensionId, placeholder);

    const unmountWork = (async (): Promise<void> => {
      try {
        await this.mountManager.unmountExtension(extensionId);
      } finally {
        // @cpt-begin:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-removed
        // Remove the container from its parent regardless of whether the
        // attached root has since been cleared (e.g. by a concurrent
        // detach()) — the container's own parent is the source of truth,
        // not `this.attachedRoot`.
        const container = this.containers.get(extensionId);
        container?.parentNode?.removeChild(container);
        this.containers.delete(extensionId);

        this.removeMountedExtension(this.domainId, extensionId);
        // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-um-failure-container-removed
      }
    })();

    unmountWork.then(settlePlaceholder, rejectPlaceholder);

    try {
      await placeholder;
    } finally {
      // Identity-checked cleanup: remove this call's own entry only, never a
      // later call's, so a settling earlier call can never delete a
      // still-in-flight later one's tracking.
      if (this.unmountInFlightByExtension.get(extensionId) === placeholder) {
        this.unmountInFlightByExtension.delete(extensionId);
      }
    }
  }
  // @cpt-end:cpt-frontx-algo-extension-domain-governance-mount-execution:p2:inst-me-await-unmount-settle

  /**
   * The settlement promise of an unmount currently in flight for
   * `extensionId` through this mounter, or `undefined` if none is in
   * progress. Consulted by the mount-ext prologue — never by a strategy —
   * so the check runs strategy-agnostically, above every strategy's own
   * mount body.
   */
  getUnmountInFlight(extensionId: string): Promise<void> | undefined {
    return this.unmountInFlightByExtension.get(extensionId);
  }
}
