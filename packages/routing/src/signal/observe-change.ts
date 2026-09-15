/**
 * Observable Transition Signal — `cpt-frontx-algo-routing-route-ownership-signal-observe-change`.
 * Observer Release — `cpt-frontx-algo-routing-route-ownership-signal-release`.
 *
 * The two algorithms share this module because release closes over exactly
 * the subscriptions this file's own observer registers at creation — the
 * identical relationship `fanout-dispatch.ts` already has between `subscribe`
 * and the release function it returns.
 *
 * FEATURE (route-ownership-signal) §3, "Observable Transition Signal" /
 * "Observer Release".
 */
import { RoutingError } from '../errors.js';
import { isValidDomainKey, validateName } from '../grammar/name.js';
import { parseGrammar } from '../grammar/parse.js';
import type {
  CreateObserver,
  DomainKey,
  ExtensionToken,
  NavigationHistory,
  RegisteredExtensionsSource,
  ReleaseFunction,
  ResolvedEntry,
  TransitionDiff,
} from '../types/index.js';
import { resolveEntries } from './entry-resolution.js';

/**
 * Validates every extension token a registered-extensions source currently
 * declares — the identical check FEATURE §3 (Observable Transition Signal)
 * runs both at creation (step 1.1) and on every subsequent
 * registered-extensions-source change (step 3.1).
 */
function validateRegistrations<TRouteOwner>(source: RegisteredExtensionsSource<TRouteOwner>): void {
  for (const registration of source.getRegistrations()) {
    if (!validateName(registration.extension)) {
      throw RoutingError.invalidExtensionToken(registration.extension);
    }
  }
}

function validateDomainKeyAndRegistrations<TRouteOwner>(
  domainKey: string,
  source: RegisteredExtensionsSource<TRouteOwner>,
): asserts domainKey is DomainKey {
  if (!isValidDomainKey(domainKey)) {
    throw RoutingError.invalidDomainKey(domainKey);
  }
  validateRegistrations(source);
}

function resolveCurrentEntries<TRouteOwner>(
  history: NavigationHistory,
  domainKey: DomainKey,
  source: RegisteredExtensionsSource<TRouteOwner>,
): readonly ResolvedEntry<TRouteOwner>[] {
  const location = history.location;
  const parsed = parseGrammar({
    shellSubroute: location.path,
    search: location.search,
    hash: location.hash,
  });
  return resolveEntries(domainKey, parsed.entries, source);
}

function paramsEqual(
  a: ResolvedEntry['params'],
  b: ResolvedEntry['params'],
): boolean {
  return a.length === b.length && a.every((p, i) => p.name === b[i].name && p.value === b[i].value);
}

/**
 * Computes the diff between a newly resolved ordered list and the
 * previously reported one — FEATURE §3, Observable Transition Signal,
 * step 2.2.
 */
function computeDiff<TRouteOwner>(
  previous: readonly ResolvedEntry<TRouteOwner>[],
  current: readonly ResolvedEntry<TRouteOwner>[],
): TransitionDiff {
  const previousByExtension = new Map(previous.map((entry) => [entry.extension, entry]));
  const currentByExtension = new Map(current.map((entry) => [entry.extension, entry]));

  const added: ExtensionToken[] = [];
  const payloadChanged: ExtensionToken[] = [];
  const resolutionChanged: ExtensionToken[] = [];

  for (const entry of current) {
    const before = previousByExtension.get(entry.extension);
    if (before === undefined) {
      added.push(entry.extension);
      continue;
    }
    if (!paramsEqual(before.params, entry.params)) {
      payloadChanged.push(entry.extension);
    } else if (before.resolution.resolved !== entry.resolution.resolved) {
      resolutionChanged.push(entry.extension);
    }
  }

  const removed: ExtensionToken[] = [];
  for (const entry of previous) {
    if (!currentByExtension.has(entry.extension)) {
      removed.push(entry.extension);
    }
  }

  const previousCommonOrder = previous
    .filter((entry) => currentByExtension.has(entry.extension))
    .map((entry) => entry.extension);
  const currentCommonOrder = current
    .filter((entry) => previousByExtension.has(entry.extension))
    .map((entry) => entry.extension);
  const reordered =
    previousCommonOrder.length !== currentCommonOrder.length ||
    previousCommonOrder.some((token, index) => token !== currentCommonOrder[index]);

  const unresolved = current.filter((entry) => !entry.resolution.resolved).map((entry) => entry.extension);

  return { added, removed, payloadChanged, reordered, resolutionChanged, unresolved };
}

function diffIsEmpty(diff: TransitionDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.payloadChanged.length === 0 &&
    !diff.reordered &&
    diff.resolutionChanged.length === 0
  );
}

// @cpt-algo:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2
// @cpt-algo:cpt-frontx-algo-routing-route-ownership-signal-release:p2
// @cpt-flow:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1
// @cpt-dod:cpt-frontx-dod-routing-route-ownership-signal-resolution-and-observation:p1
// @cpt-dod:cpt-frontx-dod-routing-route-ownership-signal-release:p1
/**
 * Builds a `CreateObserver` function bound to `history` (F1 of the review
 * scope this factory closed) rather than resolving the realm-shared
 * singleton internally — the identical seam `./url-back-projection.js`'s
 * `createBackProjectEntries` adds for the same reason. Not exported
 * directly; `createRouteSignal` (`./route-signal.js`) is this package's own
 * public construction path for a `history`-bound instance.
 */
export function createObserverBoundTo(history: NavigationHistory): CreateObserver {
  return (domainKey, source, onTransition) => {
  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-create
  // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-create-observer
  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-initial-resolve
  // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-resolve-entries-at-creation
  validateDomainKeyAndRegistrations(domainKey, source);

  // This observer's own initial state, recorded here as part of step 1.1
  // (H2, review round 20: the FEATURE's own former standalone "record"
  // step is now folded into this one, since subscribing before reporting —
  // below — needs this baseline set no later than this point) —
  // `reresolveAndReport` (below) reads and overwrites this same binding on
  // every later navigation.
  let previous = resolveCurrentEntries(history, domainKey, source);
  // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-resolve-entries-at-creation
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-initial-resolve

  // Own round guard, mirroring `FanOutDispatcher`'s own reentrancy discipline
  // (`../history/fanout-dispatch.js`, `dispatch`): a re-entrant call — a
  // consumer navigating synchronously from inside `onTransition` below, on
  // either trigger axis this function serves (the fan-out subscription just
  // below, or the registered-extensions-source subscription further down) —
  // is deferred to its own later round instead of running inside the round
  // already in progress. Without this, a nested round's own
  // `previous = current` commit (`inst-record-navigation-state` below) is
  // clobbered the instant the outer frame resumes and performs its own,
  // by-then-stale commit: the baseline permanently disagrees with
  // `history.location`, and the next genuine navigation back to that exact
  // state diffs empty against it and reports nothing — forever.
  // `FanOutDispatcher` only defers a history-to-history nesting; this
  // observer borrows nothing from it for the other nesting shapes a report
  // delivered from the registered-extensions-source axis, or a fan-out
  // report whose own consumer mutates that same source synchronously — so
  // it needs this same discipline of its own, applied uniformly to every
  // trigger rather than only to the fan-out one.
  let reporting = false;
  let pendingRounds = 0;
  function reresolveAndReport(): void {
    if (reporting) {
      pendingRounds += 1;
      return;
    }
    reporting = true;
    try {
      reresolveAndReportRound();
    } finally {
      // Drained in `finally`, not appended after the round above: a round
      // that throws must not cost the round it deferred its own delivery —
      // a consumer that navigates and then throws still queued a genuine,
      // later transition, and the registration-source axis has no queue of
      // its own (unlike the fan-out's `FanOutDispatcher`) to carry it
      // through a throw the way that axis's own delivery already does. The
      // two trigger axes must not disagree about whether a queued round
      // survives the round that queued it.
      try {
        // A round triggered while this one was still running queued itself
        // above instead of interleaving with it; drain it now as its own,
        // later round — never folded into the round that deferred it. Each
        // drained round gets its own `try`/`catch`, not one shared around
        // the whole `while`: without it, a throw from one drained round
        // would exit the loop before the rounds still behind it in
        // `pendingRounds` ever ran, discarding a transition a *later*
        // consumer queued rather than the one whose callback actually
        // threw. Swallowed rather than surfaced anywhere, matching this
        // observer's own two trigger axes, which already swallow an
        // outer round's throw the identical way — the fan-out axis through
        // `FanOutDispatcher`'s own per-subscriber `catch`
        // (`../history/fanout-dispatch.js`, `inst-isolate-error`), the
        // registration-source axis through the local `catch` a few lines
        // below this function. This package has no reporting channel of
        // its own for a consumer callback's throw; the one `reportError`
        // channel in the ecosystem lives one layer up, in
        // `@gears-frontx/routing-tanstack`'s provider adapter
        // (`history-adaptation.ts`), which wraps `history.subscribe`
        // itself rather than anything in this file — reaching for it here
        // would report a drained round's throw while its sibling axes stay
        // silent about theirs, the exact kind of one-sided rule this file
        // keeps closing.
        while (pendingRounds > 0) {
          pendingRounds -= 1;
          try {
            reresolveAndReportRound();
          } catch {
            // Empty on purpose: isolating the error IS not re-throwing it.
          }
        }
      } finally {
        // Reset unconditionally, whether or not draining above itself threw:
        // a stale positive count would otherwise survive into the next
        // trigger and run an extra, unrequested round then.
        pendingRounds = 0;
        reporting = false;
      }
    }
  }

  /** FEATURE §3, Observable Transition Signal, steps 2.1-2.5 — shared by a
   * fan-out navigation and a registered-extensions-source change alike
   * (step 3.2: "exactly as if a navigation had occurred"). Always reached
   * through `reresolveAndReport` above, never called directly — that
   * wrapper is what keeps a re-entrant trigger from ever running one of
   * these rounds nested inside another one already in progress. */
  function reresolveAndReportRound(): void {
    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-resolve-current
    // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-resolve-entries
    const current = resolveCurrentEntries(history, domainKey, source);
    // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-resolve-entries
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-resolve-current

    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-compute-diff
    const diff = computeDiff(previous, current);
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-compute-diff

    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-if-diff-empty
    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-no-report-unchanged
    // The "no call" branch this instruction names has no code of its own —
    // co-located with the enclosing `if`/`else`, whose `else` arm below is
    // the real code this pair wraps.
    if (diffIsEmpty(diff)) {
      // Nothing about this domain key's own entries changed — no call, and
      // the baseline advances immediately: there is no consumer callback
      // here that could throw and leave it stale.
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-record-navigation-state
      previous = current;
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-record-navigation-state
    } else {
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-else-diff-nonempty
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-report-transition
      // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-report-transition
      onTransition({ domainKey, entries: current, diff });
      // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-report-transition
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-report-transition
      // No `try`/`finally` here (M1, review round 20): the baseline advances
      // only once `onTransition` above returns without throwing — deliberately
      // reached *after* the call, not wrapped around it, so a consumer whose
      // own callback throws leaves `previous` exactly where it was. The next
      // navigation to the identical state then re-computes the identical,
      // non-empty diff against that same unmoved baseline and delivers it
      // again, instead of the baseline silently advancing past a transition
      // the consumer never actually finished processing and producing an
      // empty diff — and therefore no report at all — forever after (FEATURE
      // §3, Observable Transition Signal, step 2.5, amended). A subscriber
      // whose own callback throws is still isolated from every other
      // subscriber: this function itself runs inside the fan-out's own
      // per-callback `try`/`catch` (`cpt-frontx-algo-routing-navigation-substrate-fanout-dispatch`),
      // which is what stops this throw from reaching the remaining callbacks
      // in the same round, not anything in this function.
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-record-navigation-state
      previous = current;
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-record-navigation-state
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-else-diff-nonempty
    }
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-no-report-unchanged
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-if-diff-empty
  }

  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-subscribe-fanout
  // Subscribed *before* the initial report below (H2, review round 20 —
  // previously this ran after): a consumer that navigates synchronously
  // from inside its own first callback must have that navigation observed
  // by this same subscription, not missed because it did not exist yet.
  // `previous` is already set (immediately above) by the time this
  // subscription can fire, so a reentrant dispatch triggered from within the
  // initial report has a correct baseline to diff against.
  const unsubscribeFanout = history.subscribe(() => {
    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-navigation
    // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-notify-navigation
    reresolveAndReport();
    // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-notify-navigation
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-navigation
  });
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-subscribe-fanout

  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-if-source-has-notification
  // Subscribed here, before the initial report below, for the identical
  // reason the fan-out subscription immediately above already is: a route
  // owner that registers itself synchronously from inside its own first
  // report needs this same subscription to already exist so that
  // registration is observed instead of landing on a source with no
  // listener yet — the baseline would otherwise keep reporting the
  // pre-registration state, permanently, until some later, unrelated
  // change happened to re-diff it. Released on the identical throw path as
  // the fan-out subscription, in the same `catch` below, so a failed
  // construction ends with neither subscription outliving it.
  let unsubscribeSource: ReleaseFunction | undefined;
  if (source.onChange !== undefined) {
    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-subscribe-extensions-source
    unsubscribeSource = source.onChange(() => {
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-extensions-source-changes
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-validate-extensions-source-change
      // Deliberately outside the isolating `try`/`catch` below: this is the
      // observer's own input-validation failure, not a consumer callback's
      // — FEATURE §3 step 3.1 requires it to THROW, the identical
      // contract observer creation already makes, so it must still reach
      // whichever code triggered this source's own change notification.
      validateRegistrations(source);
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-validate-extensions-source-change
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-reresolve-on-source-change
      // Isolated the same way `FanOutDispatcher` isolates a subscriber's own
      // throw (`../history/fanout-dispatch.js`, `inst-isolate-error`): this
      // registered-extensions source may have more than one observer's own
      // onChange subscription registered against it, and a throw from one
      // observer's own `onTransition` consumer callback — surfacing here,
      // through `reresolveAndReport` — must not reach the source's own
      // change-notification emitter and stop it from notifying whichever
      // other listeners it has, exactly as a fan-out subscriber's own throw
      // never stops delivery to the fan-out's remaining subscribers. The
      // observer's own baseline still does not advance past a transition
      // the callback never finished processing (`inst-record-navigation-state`).
      try {
        reresolveAndReport();
      } catch {
        // Empty on purpose: isolating the error IS not re-throwing it.
      }
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-reresolve-on-source-change
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-extensions-source-changes
    });
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-subscribe-extensions-source
  }
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-if-source-has-notification

  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-initial-report
  // @cpt-begin:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-report-initial-transition
  // Both subscriptions above already exist by the time this call runs. If
  // this first callback throws, `createObserver` throws too and never
  // returns a release handle to the caller — so both subscriptions would
  // otherwise stay registered forever with nothing able to release either
  // of them, and keep firing this observer's callback on every later
  // navigation or registration change. Releasing both here, before
  // propagating the throw, keeps a failed construction as inert as a
  // construction that never subscribed at all.
  try {
    onTransition({
      domainKey,
      entries: previous,
      diff: {
        added: previous.map((entry) => entry.extension),
        removed: [],
        payloadChanged: [],
        reordered: false,
        resolutionChanged: [],
        unresolved: previous.filter((entry) => !entry.resolution.resolved).map((entry) => entry.extension),
      },
    });
  } catch (error) {
    unsubscribeFanout();
    if (unsubscribeSource !== undefined) {
      unsubscribeSource();
    }
    throw error;
  }
  // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-report-initial-transition
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-initial-report
  // @cpt-end:cpt-frontx-flow-routing-route-ownership-signal-deep-link-cold-mount:p1:inst-create-observer

  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-when-release-called
  let released = false;
  const release: ReleaseFunction = () => {
    if (released) {
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-if-called-again
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-release-idempotent
      return;
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-release-idempotent
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-if-called-again
    }
    released = true;

    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-unsubscribe-fanout
    unsubscribeFanout();
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-unsubscribe-fanout

    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-if-subscribed-extensions-source
    if (unsubscribeSource !== undefined) {
      // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-unsubscribe-extensions-source
      unsubscribeSource();
      // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-unsubscribe-extensions-source
    }
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-if-subscribed-extensions-source
    // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-return-release-done
    return;
    // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-return-release-done
  };
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-release:p2:inst-when-release-called

  // @cpt-begin:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-return-release
  return release;
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-return-release
  // @cpt-end:cpt-frontx-algo-routing-route-ownership-signal-observe-change:p2:inst-when-create
  };
}
