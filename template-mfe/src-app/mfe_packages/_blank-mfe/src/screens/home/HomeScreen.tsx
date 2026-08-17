import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  useApiQuery,
  apiRegistry,
} from '@gears-frontx/react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { _BlankApiService } from '../../api/_BlankApiService';

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

function readBridgeProperty(bridge: ChildMfeBridge, property: string, fallback: string): string {
  const current = bridge.getProperty(property);
  return current && typeof current.value === 'string' ? current.value : fallback;
}

/**
 * Props for the HomeScreen component.
 */
interface HomeScreenProps {
  bridge: ChildMfeBridge;
}

/**
 * Home Screen for the Blank MFE template.
 *
 * This is a template component that demonstrates:
 * - Shadow DOM isolation
 * - Bridge communication with the host
 * - Theme property subscription
 * - Language property subscription
 * - MFE-local i18n with dynamic translation loading
 * - UIKit components for consistent styling
 *
 * To use this template:
 * 1. Copy the entire _blank-mfe directory to a new name
 * 2. Update all placeholder IDs in mfe.json
 * 3. Update package.json name and port
 * 4. Update vite.config.ts name
 * 5. Customize this component for your use case
 * 6. Add/modify translation files as needed
 */
export const HomeScreen: React.FC<HomeScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Initial value read directly from the bridge's lazy useState initializer (runs once,
  // synchronously, during the first render) instead of via setState in a mount effect —
  // this avoids an extra render and the set-state-in-effect anti-pattern. The effect
  // below only subscribes for subsequent property changes.
  const [theme, setTheme] = useState<string>(() =>
    readBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default')
  );
  const [language, setLanguage] = useState<string>(() =>
    readBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en')
  );
  // The lazy initializers above run only on mount; if the host swaps the bridge
  // instance, re-read its current properties during render ("adjusting state
  // during render") — the subscription effect only delivers future changes.
  const [prevBridge, setPrevBridge] = useState(bridge);
  if (prevBridge !== bridge) {
    setPrevBridge(bridge);
    setTheme(readBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_THEME, 'default'));
    setLanguage(readBridgeProperty(bridge, FRONTX_SHARED_PROPERTY_LANGUAGE, 'en'));
  }

  const service = apiRegistry.getService(_BlankApiService);
  const { t, loading } = useScreenTranslations(languageModules, bridge);
  const {
    data: statusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
    error: statusError,
  } = useApiQuery(service.getStatus);

  useEffect(() => {
    // Subscribe to theme domain property
    const themeUnsubscribe = bridge.subscribeToProperty(
      FRONTX_SHARED_PROPERTY_THEME,
      (property) => {
        if (typeof property.value === 'string') {
          setTheme(property.value);
        }
      }
    );

    // Subscribe to language domain property
    const languageUnsubscribe = bridge.subscribeToProperty(
      FRONTX_SHARED_PROPERTY_LANGUAGE,
      (property) => {
        if (typeof property.value === 'string') {
          setLanguage(property.value);
        }
      }
    );

    return () => {
      themeUnsubscribe();
      languageUnsubscribe();
    };
  }, [bridge]);

  // Keep the Shadow DOM host's text direction in sync with the active language.
  // An effect keyed by `language` (rather than logic inside the subscription
  // callback) also covers the initial language, which never fires a callback.
  useEffect(() => {
    const rootNode = containerRef.current?.getRootNode();
    if (rootNode && 'host' in rootNode) {
      (rootNode.host as HTMLElement).dir = RTL_LANGUAGES.includes(language) ? 'rtl' : 'ltr';
    }
  }, [language]);

  /*
   * The `data-testid` attributes below are verification API, not decoration.
   * A screen renders inside a shadow root, so selectors issued from outside it
   * cannot reach these nodes; browser verification runs an eval inside the root
   * and addresses controls by testid. Accessibility-snapshot refs are ephemeral
   * and have to be re-learned after every navigation, which these ids replace.
   * `screen-root` is present in every branch, so a run has one node to wait for
   * before deciding which state the screen settled into. Every screen copied
   * from this scaffold inherits the contract: keep a `screen-<control>` testid
   * on each interactive control and on the status region, and rename the id
   * with the control rather than dropping it.
   */

  // Show skeleton while translations are loading
  if (loading) {
    return (
      <div ref={containerRef} className="p-8" data-testid="screen-root">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3" data-testid="screen-loading">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  let statusCardBody: React.ReactNode;
  if (isStatusLoading) {
    statusCardBody = (
      <div className="space-y-3" data-testid="screen-status-loading">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  } else if (isStatusError) {
    statusCardBody = (
      <p className="text-sm text-destructive" data-testid="screen-status-error">
        {statusError?.message}
      </p>
    );
  } else {
    statusCardBody = (
      <pre
        className="overflow-x-auto rounded-md bg-muted p-4 text-xs text-muted-foreground"
        data-testid="screen-status-payload"
      >
        {JSON.stringify(statusData, null, 2)}
      </pre>
    );
  }

  return (
    <div ref={containerRef} className="p-8" data-testid="screen-root">
      <h1 className="text-3xl font-bold mb-4" data-testid="screen-title">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mb-6">
        {t('description')}
      </p>

      <div className="space-y-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-3">
              {t('bridge_info')}
            </h2>
            <dl className="grid gap-2">
              <div>
                <dt className="font-medium">{t('domain_id')}</dt>
                <dd className="font-mono text-sm text-muted-foreground" data-testid="screen-domain-id">
                  {bridge.extDomainId}
                </dd>
              </div>
              <div>
                <dt className="font-medium">{t('instance_id')}</dt>
                <dd className="font-mono text-sm text-muted-foreground" data-testid="screen-instance-id">
                  {bridge.extensionId}
                </dd>
              </div>
              <div>
                <dt className="font-medium">{t('current_theme')}</dt>
                <dd className="font-mono text-sm text-muted-foreground" data-testid="screen-theme">
                  {theme}
                </dd>
              </div>
              <div>
                <dt className="font-medium">{t('current_language')}</dt>
                <dd className="font-mono text-sm text-muted-foreground" data-testid="screen-language">
                  {language}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6" data-testid="screen-status">
            {statusCardBody}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

HomeScreen.displayName = 'HomeScreen';
