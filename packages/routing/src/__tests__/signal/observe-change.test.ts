import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveNavigationHistory } from '../../history/singleton.js';
import { RoutingError } from '../../errors.js';
import { createObserver, expectRoutingError, resetRealm, staticSource, mutableSource } from '../helpers.js';
import type { DomainKey, Transition } from '../../types/index.js';

// FEATURE (route-ownership-signal) §3, Observable Transition Signal
// (cpt-frontx-algo-routing-route-ownership-signal-observe-change).

beforeEach(() => {
  resetRealm();
});

describe('createObserver — initial report', () => {
  it('reports an initial transition synchronously, with every present entry as Added', () => {
    resetRealm('/en?screen=dashboard');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();

    createObserver(
      'screen' as DomainKey,
      staticSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]),
      onTransition,
    );

    expect(onTransition).toHaveBeenCalledTimes(1);
    const transition = onTransition.mock.calls[0][0];
    expect(transition.domainKey).toBe('screen');
    expect(transition.entries).toEqual([
      { extension: 'dashboard', params: [], resolution: { resolved: true, routeOwner: 'DashboardScreen' } },
    ]);
    expect(transition.diff).toEqual({
      added: ['dashboard'],
      removed: [],
      payloadChanged: [],
      reordered: false,
      resolutionChanged: [],
      unresolved: [],
    });
  });

  it('reports an initial transition with an empty entry list when the domain key addresses nothing', () => {
    resetRealm('/en');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();

    createObserver('screen' as DomainKey, staticSource([]), onTransition);

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0].entries).toEqual([]);
    expect(onTransition.mock.calls[0][0].diff.added).toEqual([]);
  });

  it('lists an unresolved entry under both Added and Unresolved at creation', () => {
    resetRealm('/en?screen=unknown-screen');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();

    createObserver('screen' as DomainKey, staticSource([]), onTransition);

    const diff = onTransition.mock.calls[0][0].diff;
    expect(diff.added).toEqual(['unknown-screen']);
    expect(diff.unresolved).toEqual(['unknown-screen']);
  });

  it('observes a navigation performed synchronously from inside its own first callback, exactly once (H2, review round 20)', () => {
    // Before H2, the fan-out subscription was registered only after the
    // initial report ran, so a synchronous re-navigation from inside that
    // very first callback — the deep-link -> mount -> redirect pattern — was
    // never observed: the subscription that would have caught it did not
    // exist yet at the moment the redirect fired.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const receivedScreens: string[] = [];
    let redirected = false;

    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      const current = transition.entries[0]?.extension;
      receivedScreens.push(current ?? '(none)');
      if (!redirected) {
        redirected = true;
        history.push('/en?screen=other');
      }
    });

    // Initial report ('dashboard'), then the resulting redirect's own
    // transition ('other') — delivered exactly once, not zero times and not
    // twice.
    expect(receivedScreens).toEqual(['dashboard', 'other']);
    expect(history.location.search).toBe('screen=other');
  });
});

describe('createObserver — a throwing initial report (D1)', () => {
  it('leaves zero live subscriptions when the very first callback throws, so a later navigation calls nothing', () => {
    // The fan-out subscription is registered before this initial report
    // runs (so a synchronous redirect from a *successful* first callback is
    // still observed — see the "exactly once" test above). If the report
    // itself throws, `createObserver` throws too and never reaches the
    // return statement that would hand the caller a release function — so
    // without an explicit release inside the throw path, that subscription
    // would stay registered forever with nothing able to release it.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const onTransition = vi.fn(() => {
      throw new Error('boom');
    });

    expect(() => createObserver('screen' as DomainKey, staticSource([]), onTransition)).toThrow('boom');
    expect(onTransition).toHaveBeenCalledTimes(1);

    history.push('/en?screen=other');

    expect(onTransition).toHaveBeenCalledTimes(1);
  });

  it('still delivers exactly once, and still allows a redirect from the first callback, when the first callback does not throw', () => {
    // Same scenario as the "exactly once" test above, restated here
    // alongside the throwing case so the two outcomes — release-on-throw
    // versus normal delivery — are visible side by side.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const receivedScreens: string[] = [];
    let redirected = false;

    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      receivedScreens.push(transition.entries[0]?.extension ?? '(none)');
      if (!redirected) {
        redirected = true;
        history.push('/en?screen=other');
      }
    });

    expect(receivedScreens).toEqual(['dashboard', 'other']);
  });
});

describe('createObserver — subscribing before the initial report', () => {
  it('observes a registration made from inside its own initial report', () => {
    // The registration-source subscription must exist before the initial
    // report runs, exactly like the fan-out subscription above: a route
    // owner that registers itself synchronously from inside the very first
    // report it receives is the cold-mount flow this signal exists for, and
    // that registration must land on a source that is already listening.
    resetRealm('/en?screen=app');
    const source = mutableSource([]);
    const reportedResolutions: boolean[] = [];
    let calls = 0;

    createObserver('screen' as DomainKey, source, (transition) => {
      calls += 1;
      reportedResolutions.push(transition.entries[0]?.resolution.resolved ?? false);
      if (calls === 1) {
        source.set([{ extension: 'app', routeOwner: 'AppScreen' }]);
      }
    });

    expect(reportedResolutions).toEqual([false, true]);
  });

  it('releases both the fan-out and registration-source subscriptions when the first report throws', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([]);
    const onTransition = vi.fn(() => {
      throw new Error('boom');
    });

    expect(() => createObserver('screen' as DomainKey, source, onTransition)).toThrow('boom');
    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(source.sourceReleaseCallCount).toBe(1);

    history.push('/en?screen=other');
    source.set([{ extension: 'other', routeOwner: 'OtherScreen' }]);

    expect(onTransition).toHaveBeenCalledTimes(1);
  });
});

describe('createObserver — input validation', () => {
  it('throws invalid-domain-key synchronously for a malformed domain key', () => {
    const error = expectRoutingError(() => createObserver('a.b' as DomainKey, staticSource([]), vi.fn()));
    expect(error.code).toBe('invalid-domain-key');
  });

  it('throws invalid-extension-token synchronously naming a malformed registered extension', () => {
    const error = expectRoutingError(() =>
      createObserver('screen' as DomainKey, staticSource([{ extension: 'Bad', routeOwner: 'x' }]), vi.fn()),
    );
    expect(error.code).toBe('invalid-extension-token');
  });

  it('never calls onTransition when creation itself throws', () => {
    const onTransition = vi.fn();
    expect(() => createObserver('a.b' as DomainKey, staticSource([]), onTransition)).toThrow();
    expect(onTransition).not.toHaveBeenCalled();
  });
});

describe('createObserver — reacting to navigation', () => {
  it('reports Added for an entry newly present after navigation', () => {
    const adapter = resetRealm('/en');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver(
      'screen' as DomainKey,
      staticSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]),
      onTransition,
    );
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard');

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0].diff.added).toEqual(['dashboard']);
  });

  it('reports Removed for an entry no longer present after navigation', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en');

    expect(onTransition.mock.calls[0][0].diff.removed).toEqual(['dashboard']);
  });

  it('reports Payload-changed for an entry whose params differ, never as Added/Removed', () => {
    const adapter = resetRealm('/en?screen=dashboard;orientation=left');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard;orientation=right');

    const diff = onTransition.mock.calls[0][0].diff;
    expect(diff.payloadChanged).toEqual(['dashboard']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('reports Reordered:true when two persisting tokens swap relative order, with no payload change', () => {
    const adapter = resetRealm('/en?widgets=line-a;range=7d&widgets=line-b;range=30d');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('widgets' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push(
      '/en?widgets=line-b;range=30d&widgets=line-a;range=7d',
    );

    const diff = onTransition.mock.calls[0][0].diff;
    expect(diff.reordered).toBe(true);
    expect(diff.payloadChanged).toEqual([]);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
  });

  it('reports no transition at all when nothing about this domain key changed', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard');

    expect(onTransition).not.toHaveBeenCalled();
  });

  it('reports no transition when only a foreign domain key or the hash changed', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en?screen=dashboard&modal=create-contact#section');

    expect(onTransition).not.toHaveBeenCalled();
  });
});

describe('createObserver — Resolution-changed', () => {
  it('reports Resolution-changed alone when a registration change flips an entry between resolved and unresolved', () => {
    resetRealm('/en?widgets=chart-old;range=90d');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    const source = mutableSource([{ extension: 'chart-old', routeOwner: 'ChartOld' }]);
    createObserver('widgets' as DomainKey, source, onTransition);
    onTransition.mockClear();

    source.set([]);

    expect(onTransition).toHaveBeenCalledTimes(1);
    const diff = onTransition.mock.calls[0][0].diff;
    expect(diff.resolutionChanged).toEqual(['chart-old']);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.payloadChanged).toEqual([]);
    expect(diff.reordered).toBe(false);
  });

  it('re-resolves against the current entries when the registered-extensions source changes, without a navigation', () => {
    resetRealm('/en?screen=dashboard');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    const source = mutableSource([]);
    createObserver('screen' as DomainKey, source, onTransition);
    onTransition.mockClear();

    source.set([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0].entries[0].resolution).toEqual({
      resolved: true,
      routeOwner: 'DashboardScreen',
    });
  });

  it('throws invalid-extension-token when the source\'s changed set now declares a malformed token', () => {
    resetRealm('/en?screen=dashboard');
    const source = mutableSource([]);
    createObserver('screen' as DomainKey, source, vi.fn());

    expect(() => source.set([{ extension: 'Bad', routeOwner: 'x' }])).toThrow(RoutingError);
  });
});

describe('createObserver — a throwing consumer callback (M1, review round 20)', () => {
  it('does not advance the baseline when the callback throws, so the next navigation still diffs against the pre-throw state', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    let callCount = 0;
    const reported: { added: readonly string[]; removed: readonly string[] }[] = [];
    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      callCount += 1;
      // Skip the synchronous initial report (call 1) — only the two
      // navigation-triggered transitions below matter to this assertion.
      if (callCount > 1) {
        reported.push({ added: transition.diff.added, removed: transition.diff.removed });
      }
      if (callCount === 2) {
        throw new Error('boom');
      }
    });

    const history = resolveNavigationHistory(() => adapter);
    // The fan-out isolates a subscriber's own thrown error (FanOutDispatcher),
    // so this second transition (dashboard -> settings) reaches `onTransition`
    // and throws, but `history.push` itself never throws. The baseline stays
    // at 'dashboard' — the callback never finished processing 'settings'.
    history.push('/en?screen=settings');
    // Third transition: other. Because the baseline never advanced past
    // 'dashboard' (M1: the callback that would have advanced it to
    // 'settings' threw first), this diff is computed against 'dashboard'
    // again, not against 'settings' — 'dashboard' is reported removed a
    // second time, and 'settings' (never confirmed processed) is not
    // reported removed at all.
    history.push('/en?screen=other');

    expect(reported).toEqual([
      { added: ['settings'], removed: ['dashboard'] },
      { added: ['other'], removed: ['dashboard'] },
    ]);
  });

  it('re-delivers the identical transition when navigation later returns to the state the throwing callback never finished processing', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    let callCount = 0;
    const reported: { added: readonly string[]; removed: readonly string[] }[] = [];
    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      callCount += 1;
      if (callCount === 1) {
        return; // skip the synchronous initial report
      }
      reported.push({ added: transition.diff.added, removed: transition.diff.removed });
      if (callCount === 2) {
        throw new Error('boom');
      }
    });

    const history = resolveNavigationHistory(() => adapter);
    history.push('/en?screen=settings'); // dashboard -> settings: reported, then throws; baseline stays 'dashboard'
    history.push('/en?screen=dashboard'); // settings -> dashboard: diffs against the still-frozen 'dashboard' baseline -> empty, no report
    history.push('/en?screen=settings'); // dashboard -> settings again: baseline never moved past 'dashboard', so this is the identical diff as the very first delivery

    expect(reported).toEqual([
      { added: ['settings'], removed: ['dashboard'] },
      { added: ['settings'], removed: ['dashboard'] },
    ]);
  });
});

describe('createObserver — a reentrant trigger deferred to its own round', () => {
  it('axis A: a navigation triggered synchronously from a registered-extensions-source report does not clobber the baseline', () => {
    // A report delivered on the registration-source path, whose own consumer navigates
    // synchronously. Before the round guard, the nested `push`'s own
    // resolve ran immediately, inside the outer (source-triggered) round;
    // the outer round then overwrote that correct baseline with the stale
    // value it had captured before the callback ran, permanently.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let callCount = 0;
    const reported: { added: readonly string[]; removed: readonly string[] }[] = [];

    createObserver('screen' as DomainKey, source, (transition) => {
      callCount += 1;
      if (callCount === 1) {
        return; // skip the synchronous initial report — only a report
        // actually delivered on the source axis (call 2, below) is this
        // axis's own trigger; the initial report is a different code path.
      }
      reported.push({ added: transition.diff.added, removed: transition.diff.removed });
      if (callCount === 2) {
        // Reentrant, from inside a report triggered by the source axis —
        // this is the nested call the round guard must defer rather than
        // run inside the frame already in progress.
        history.push('/en?screen=other');
      }
    });

    // Deregistering `dashboard` flips its own resolution status without
    // moving the URL — a report on the registration-source axis (call 2)
    // with a non-empty diff (Resolution-changed), the trigger this axis
    // needs.
    source.set([]);

    // The baseline must now correctly read 'other' — a genuine, later
    // navigation back to 'dashboard' must still be reported.
    // Under the bug, the outer round's stale commit left the baseline
    // already claiming 'dashboard', so this exact transition would diff
    // empty and report nothing at all.
    history.push('/en?screen=dashboard');

    expect(reported.at(-1)).toEqual({ added: ['dashboard'], removed: ['other'] });
    expect(history.location.search).toBe('screen=dashboard');
  });

  it('axis D: a registered-extensions-source mutation triggered synchronously from a fan-out report does not clobber the baseline', () => {
    // A fan-out report whose own consumer mutates
    // the registered-extensions source synchronously (a nested onChange
    // report, not a nested navigation) — the loss the fan-out's own
    // history-to-history deferral does not reach, since neither nesting
    // here is a second navigation.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let callCount = 0;
    const reported: { resolutionChanged: readonly string[] }[] = [];

    createObserver('screen' as DomainKey, source, (transition) => {
      callCount += 1;
      if (callCount === 1) {
        return; // skip the synchronous initial report
      }
      reported.push({ resolutionChanged: transition.diff.resolutionChanged });
      if (callCount === 2) {
        // Reentrant, from inside a fan-out report — registers `other` so
        // this same transition's own token newly resolves.
        source.set([{ extension: 'other', routeOwner: 'OtherScreen' }]);
      }
    });

    // Navigates to an entry the current registrations do not resolve,
    // triggering the fan-out report above (call 2) with a non-empty diff.
    history.push('/en?screen=other');

    // A later, genuine deregistration must still be
    // reported. Under the bug, the outer (fan-out) round's stale commit
    // left the baseline already claiming 'other' unresolved — identical to
    // what this deregistration would produce — so it would diff empty and
    // report nothing.
    source.set([]);

    expect(reported.at(-1)).toEqual({ resolutionChanged: ['other'] });
  });

  it('an asynchronous reentrant navigation (via go, settling on a microtask) still reports correctly — stays working', async () => {
    // Not a reproduction: the outer round has already fully returned and
    // committed its own baseline by the time `go`'s own popstate fires, so
    // this was never nested inside another round in the first place — this
    // test only pins that the round guard introduces no regression here.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    history.push('/en?screen=settings');
    history.push('/en?screen=other');

    const reported: string[] = [];
    let wentBack = false;
    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      reported.push(transition.entries[0]?.extension ?? '(none)');
      if (!wentBack) {
        wentBack = true;
        history.go(-1);
      }
    });

    // The initial report only — `go`'s own popstate has not fired yet.
    expect(reported).toEqual(['other']);

    await new Promise<void>((resolve) => queueMicrotask(resolve));

    expect(reported).toEqual(['other', 'settings']);
    expect(history.location.search).toBe('screen=settings');

    // A further genuine navigation still reports normally.
    history.push('/en?screen=dashboard');
    expect(reported).toEqual(['other', 'settings', 'dashboard']);
  });

  it('a throwing registration-source report still reports the navigation it queued, in its own later round', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let callCount = 0;
    const reported: { added: readonly string[]; removed: readonly string[] }[] = [];

    createObserver('screen' as DomainKey, source, (transition) => {
      callCount += 1;
      if (callCount === 1) {
        return; // initial report
      }
      reported.push({ added: transition.diff.added, removed: transition.diff.removed });
      if (callCount === 2) {
        history.push('/en?screen=other'); // deferred to its own later round
        throw new Error('boom');
      }
    });

    // Deregistering 'dashboard' triggers a report on the registration-source
    // axis (call 2), whose callback navigates and then throws. The drained
    // round for that navigation must still deliver 'other' — the queue this
    // axis has none of its own must not cost it the round the fan-out's own
    // queue already carries through an identical throw.
    source.set([]);

    expect(reported).toEqual([
      { added: [], removed: [] },
      { added: ['other'], removed: ['dashboard'] },
    ]);
    expect(history.location.search).toBe('screen=other');
  });

  it('a throwing fan-out report still reports the navigation it queued, in its own later round', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    let callCount = 0;
    const reportedScreens: string[] = [];

    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      callCount += 1;
      reportedScreens.push(transition.entries[0]?.extension ?? '(none)');
      if (callCount === 2) {
        history.push('/en?screen=nested'); // deferred to its own later round
        throw new Error('boom');
      }
    });

    history.push('/en?screen=settings');

    expect(reportedScreens).toEqual(['dashboard', 'settings', 'nested']);
    expect(history.location.search).toBe('screen=nested');
  });

  it('a throw with no nested navigation leaves no phantom round for the next trigger', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = staticSource([]);
    const getRegistrationsSpy = vi.spyOn(source, 'getRegistrations');
    let callCount = 0;

    createObserver('screen' as DomainKey, source, () => {
      callCount += 1;
      if (callCount === 2) {
        throw new Error('boom');
      }
    });
    getRegistrationsSpy.mockClear(); // drop the call the initial report itself made

    history.push('/en?screen=settings'); // one round; its own callback throws, queuing nothing
    const roundsAfterThrow = getRegistrationsSpy.mock.calls.length;

    history.push('/en?screen=other'); // exactly one further round, never a leaked extra one

    expect(roundsAfterThrow).toBe(1);
    expect(getRegistrationsSpy.mock.calls.length - roundsAfterThrow).toBe(1);
  });

  it('two consecutive, non-nested navigations each report exactly once', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const onTransition = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    history.push('/en?screen=settings');
    history.push('/en?screen=other');

    expect(onTransition).toHaveBeenCalledTimes(2);
  });
});

describe('createObserver — a throw from a drained round', () => {
  it('on the fan-out axis: a drained round whose own consumer mutates the registered-extensions source and then throws still reports the state it queued, in its own later round', () => {
    // Three rounds deep, not two: the outer round (triggered by the push
    // below) queues a round without throwing; that queued round is what
    // runs *drained*, and it is that drained round's own consumer — not the
    // outer round's — that mutates the source again and throws. Losing the
    // state this drained round queued is the failure this test pins:
    // draining used to share one `try`/`catch` around the whole loop, so a
    // throw from any iteration abandoned every round still behind it in
    // `pendingRounds`. Both nested triggers here mutate the
    // registered-extensions source rather than navigate again, deliberately:
    // a nested `push` would be absorbed by the navigation substrate's own
    // fan-out queue (`FanOutDispatcher`) before ever reaching this
    // observer's own `pendingRounds` a second time, which would not exercise
    // this fix at all.
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let callCount = 0;
    const reportedOwners: string[] = [];

    createObserver('screen' as DomainKey, source, (transition) => {
      callCount += 1;
      const resolution = transition.entries[0]?.resolution;
      reportedOwners.push(resolution?.resolved === true ? resolution.routeOwner : 'unresolved');
      if (callCount === 2) {
        // Nested from the outer (push-triggered) round — deferred, becomes
        // the drained round below.
        source.set([{ extension: 'settings', routeOwner: 'FromDrainedRoundOne' }]);
      } else if (callCount === 3) {
        // Nested from inside the drained round itself — deferred again, and
        // this round then throws.
        source.set([{ extension: 'settings', routeOwner: 'FromDrainedRoundTwo' }]);
        throw new Error('boom');
      }
    });

    history.push('/en?screen=settings'); // triggers the outer round (call 2)

    expect(reportedOwners).toEqual(['DashboardScreen', 'unresolved', 'FromDrainedRoundOne', 'FromDrainedRoundTwo']);
  });

  it('on the registration-source axis: a drained round whose own consumer navigates and then throws still reports the state it queued, in its own later round', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let callCount = 0;
    const reportedScreens: string[] = [];

    createObserver('screen' as DomainKey, source, (transition) => {
      callCount += 1;
      reportedScreens.push(transition.entries[0]?.extension ?? '(none)');
      if (callCount === 2) {
        history.push('/en?screen=other'); // deferred — becomes the drained round below
      } else if (callCount === 3) {
        history.push('/en?screen=nested'); // deferred from inside the drained round itself
        throw new Error('boom');
      }
    });

    source.set([]); // deregisters 'dashboard' — triggers the outer round (call 2) on this axis

    expect(reportedScreens).toEqual(['dashboard', 'dashboard', 'other', 'nested']);
    expect(history.location.search).toBe('screen=nested');
  });

  it('a later, unrelated navigation reports exactly once once the drained rounds above have settled — no phantom round, no abandoned queue', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    let callCount = 0;
    const reportedScreens: string[] = [];

    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      callCount += 1;
      reportedScreens.push(transition.entries[0]?.extension ?? '(none)');
      if (callCount === 2) {
        history.push('/en?screen=other');
      } else if (callCount === 3) {
        history.push('/en?screen=nested');
        throw new Error('boom');
      }
    });

    history.push('/en?screen=settings');
    expect(reportedScreens).toEqual(['dashboard', 'settings', 'other', 'nested']);

    reportedScreens.length = 0;
    history.push('/en?screen=unrelated');

    // Not zero (the queue was not left disabled) and not two (no leftover
    // round fires alongside this one) — exactly the one report this
    // navigation is actually owed.
    expect(reportedScreens).toEqual(['unrelated']);
  });

  it('replaying the exact URL a drained round settled on reports nothing — its own baseline matches that state', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    let callCount = 0;
    const reportedScreens: string[] = [];

    createObserver('screen' as DomainKey, staticSource([]), (transition) => {
      callCount += 1;
      reportedScreens.push(transition.entries[0]?.extension ?? '(none)');
      if (callCount === 2) {
        history.push('/en?screen=other');
      } else if (callCount === 3) {
        history.push('/en?screen=nested');
        throw new Error('boom');
      }
    });

    history.push('/en?screen=settings');
    expect(reportedScreens).toEqual(['dashboard', 'settings', 'other', 'nested']);

    reportedScreens.length = 0;
    history.push('/en?screen=nested'); // replays the state the last drained round settled on

    expect(reportedScreens).toEqual([]);
  });

  it('a drained round whose own consumer throws with nothing further queued still leaves that state unrecorded, and does not stop a second observer sharing the same source', () => {
    const adapter = resetRealm('/en?screen=dashboard');
    const history = resolveNavigationHistory(() => adapter);
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);

    let firstCallCount = 0;
    const firstReported: string[] = [];
    createObserver('screen' as DomainKey, source, (transition) => {
      firstCallCount += 1;
      firstReported.push(transition.entries[0]?.extension ?? '(none)');
      if (firstCallCount === 2) {
        history.push('/en?screen=other'); // deferred — becomes the drained round below
      } else if (firstCallCount === 3) {
        throw new Error('boom'); // the drained round's own consumer throws; nothing further queued
      }
    });

    const secondObserverCalls = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, source, secondObserverCalls);
    secondObserverCalls.mockClear();

    expect(() => source.set([])).not.toThrow();

    // The first observer's drained round threw before it could record its
    // own commit, so its baseline still reads the pre-'other' state — the
    // next navigation back to the identical 'other' state it never finished
    // processing must still diff as a change and get reported again, not be
    // silently absorbed as if it had already been seen.
    firstReported.length = 0;
    history.push('/en?screen=other');
    expect(firstReported).toEqual(['other']);

    // The second observer shares the identical source and the identical
    // navigation substrate, but not the first observer's own round-guard
    // state: its own report of 'other' (from the nested push above) was
    // never touched by the first observer's throw.
    expect(secondObserverCalls.mock.calls.at(-1)?.[0]?.entries[0]?.extension).toBe('other');
  });
});

describe('createObserver — registered-extensions-source axis isolation', () => {
  it('one observer\'s own throwing callback does not stop the source from notifying its other listeners', () => {
    // Unlike the navigation substrate's own fan-out
    // (`FanOutDispatcher`), the registered-extensions-source axis had no
    // per-callback isolation of its own — a throw from one observer's
    // `onTransition` propagated straight into the source's own emitter
    // (`mutableSource`'s own `set`, deliberately un-isolated — see
    // `helpers.ts`) and stopped it from reaching any listener registered
    // after the throwing one.
    resetRealm('/en?screen=dashboard');
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    let firstObserverCalls = 0;

    createObserver('screen' as DomainKey, source, () => {
      firstObserverCalls += 1;
      if (firstObserverCalls > 1) {
        throw new Error('boom'); // skip the synchronous initial report
      }
    });
    const secondObserverCalls = vi.fn<(transition: Transition<string>) => void>();
    createObserver('screen' as DomainKey, source, secondObserverCalls);
    secondObserverCalls.mockClear();

    expect(() => source.set([])).not.toThrow();
    expect(secondObserverCalls).toHaveBeenCalledTimes(1);
    expect(secondObserverCalls.mock.calls[0][0].diff.resolutionChanged).toEqual(['dashboard']);
  });

  it('the observer\'s own input-validation throw (an invalid registered extension) is not isolated — it still reaches the source\'s own emitter', () => {
    // Deliberate asymmetry (FEATURE §3, step 3.1 vs. step 3.2): this is the
    // observer's own synchronous validation failure, not a consumer
    // callback's, and it must still propagate like any other validation
    // throw in this package.
    resetRealm('/en?screen=dashboard');
    const source = mutableSource([{ extension: 'dashboard', routeOwner: 'DashboardScreen' }]);
    createObserver('screen' as DomainKey, source, vi.fn());

    expect(() => source.set([{ extension: 'Bad', routeOwner: 'x' }])).toThrow(RoutingError);
  });
});

describe('createObserver — inert and stale domain keys', () => {
  it('a domain key no entry currently addresses is inert, not an error; it resolves correctly once an entry under it later appears', () => {
    const adapter = resetRealm('/en');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();

    createObserver('screen.tenants.tabs' as DomainKey, staticSource([]), onTransition);
    expect(onTransition.mock.calls[0][0].entries).toEqual([]);
    onTransition.mockClear();

    resolveNavigationHistory(() => adapter).push('/en?screen.tenants.tabs=contacts');

    expect(onTransition.mock.calls[0][0].diff.added).toEqual(['contacts']);
  });

  it('a nested observer whose enclosing entry changed its own extension resolves an empty list under its now-stale key, as ordinary operation', () => {
    const adapter = resetRealm('/en?screen=tenants;tenantId=ABC&screen.tenants.tabs=contacts');
    const onTransition = vi.fn<(transition: Transition<string>) => void>();

    createObserver('screen.tenants.tabs' as DomainKey, staticSource([]), onTransition);
    onTransition.mockClear();

    // The enclosing `screen` entry switches from `tenants` to `settings` —
    // the nested observer's own key (`screen.tenants.tabs`) is now stale,
    // but it keeps running until its own enclosing consumer releases it.
    resolveNavigationHistory(() => adapter).push('/en?screen=settings');

    expect(onTransition).toHaveBeenCalledTimes(1);
    expect(onTransition.mock.calls[0][0].entries).toEqual([]);
    expect(onTransition.mock.calls[0][0].diff.removed).toEqual(['contacts']);
  });
});
