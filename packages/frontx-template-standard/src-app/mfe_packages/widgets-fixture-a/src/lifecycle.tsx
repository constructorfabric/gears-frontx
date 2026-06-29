/**
 * widgets-fixture-a — leaf widget MFE lifecycle.
 *
 * Each mount produces an isolated module instance under the per-load blob URL
 * chain (ADR-0004), so when this entry is registered as two distinct extension
 * instances (alpha and beta) sharing the same `entry.path`, the parent runtime
 * loads the bundle twice and evaluates this module twice — module-level state
 * (the random hex generated below) is therefore per-mount.
 *
 * The mount routine generates a per-mount random hex value, renders it visibly
 * under `data-testid="widget-a-instance"`, logs it to the console, and
 * registers a `ping` action handler on the bridge so the mediator routes
 * per-instance pings back to the correct handler.
 */
import React from 'react';
import {
  createFrontX,
  effects,
  queryCacheShared,
  mock,
  ActionHandler,
  ThemeAwareReactLifecycle,
  type ChildMfeBridge,
  type JsonObject,
} from '@gears-frontx/react';

const PING_ACTION_TYPE =
  'gts.frontx.mfes.comm.action.v1~frontx.widgets.test.widget_ping.v1~';

const fixtureApp = createFrontX()
  .use(effects())
  .use(queryCacheShared())
  .use(mock())
  .build();

function generateRandomHex(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Per-mount random hex. Each blob-URL-isolated load of this module produces a
// fresh value, which is the empirical witness that distinct extension
// instances backed by the same entry path get distinct module evaluations.
const randomHex = generateRandomHex();

// Per-mount last-ping observation channel surfaced through the DOM. Updated
// by the ping handler when invoked.
let lastPingObserver: ((value: string) => void) | null = null;

class PingHandler extends ActionHandler {
  constructor(private readonly instanceId: string) {
    super();
  }

  handleAction(
    actionTypeId: string,
    _payload: JsonObject | undefined,
  ): Promise<void> {
    console.log(
      `[widget-a ${this.instanceId}] ping ${actionTypeId} randomHex=${randomHex}`,
    );
    if (lastPingObserver) {
      lastPingObserver(randomHex);
    }
    return Promise.resolve();
  }
}

interface WidgetAProps {
  readonly bridge: ChildMfeBridge;
}

function WidgetA({ bridge }: Readonly<WidgetAProps>): React.ReactElement {
  const [lastPing, setLastPing] = React.useState<string | null>(null);
  const instanceId = bridge.instanceId;

  React.useEffect(() => {
    lastPingObserver = setLastPing;
    return () => {
      lastPingObserver = null;
    };
  }, []);

  return (
    <div
      data-testid="widget-a-instance"
      data-instance-id={instanceId}
      data-instance-text={randomHex}
      className="m-2 rounded-lg border-2 border-blue-400 bg-blue-50 p-4 text-blue-900"
    >
      <strong>Widget A instance:</strong>{' '}
      <span data-testid="widget-a-random">{randomHex}</span>
      <p className="mt-1 text-xs opacity-75">instance-id: {instanceId}</p>
      <p
        className="mt-1 text-xs"
        data-testid="widget-a-last-ping"
        data-last-ping={lastPing ?? ''}
      >
        last ping: {lastPing ?? '—'}
      </p>
    </div>
  );
}

class WidgetsFixtureALifecycle extends ThemeAwareReactLifecycle {
  constructor() {
    super(fixtureApp);
  }

  protected renderContent(bridge: ChildMfeBridge): React.ReactNode {
    return <WidgetA bridge={bridge} />;
  }

  override mount(container: Element | ShadowRoot, bridge: ChildMfeBridge): void {
    console.log(
      `[widget-a ${bridge.instanceId}] mount randomHex=${randomHex}`,
    );
    super.mount(container, bridge);
    bridge.registerActionHandler(
      PING_ACTION_TYPE,
      new PingHandler(bridge.instanceId),
    );
  }
}

export default new WidgetsFixtureALifecycle();
