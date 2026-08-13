import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_ACTION_MOUNT_EXT, FRONTX_SCREEN_DOMAIN, FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { Card, CardContent } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { THEME_EXTENSION_ID, PROFILE_EXTENSION_ID, DEMO_ACTION_REFRESH_PROFILE } from '../../shared/extension-ids';
import { ButtonVariant } from '../../components/types';

/**
 * Props for the HelloWorldScreen component.
 */
interface HelloWorldScreenProps {
  bridge: ChildMfeBridge;
}

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
 * Hello World Screen for the MFE remote.
 *
 * Demonstrates MFE capabilities including:
 * - Shadow DOM isolation
 * - Bridge communication
 * - Theme property subscription
 * - Language property subscription
 * - MFE-local i18n with dynamic translation loading
 * - Cross-screen navigation via actions chains
 *
 * Uses local UI components (Card, Button) for consistent styling.
 * Runs inside Shadow DOM with isolated styles.
 */
export const HelloWorldScreen: React.FC<HelloWorldScreenProps> = ({ bridge }) => {
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

  // Load translations using the shared hook
  const { t, loading } = useScreenTranslations(languageModules, bridge);

  useEffect(() => {
    // Subscribe to theme domain property
    const themeUnsubscribe = bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (property) => {
      if (typeof property.value === 'string') {
        setTheme(property.value);
      }
    });

    // Subscribe to language domain property
    const languageUnsubscribe = bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_LANGUAGE, (property) => {
      if (typeof property.value === 'string') {
        setLanguage(property.value);
      }
    });

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

  // Navigate to Theme Screen
  const handleGoToTheme = useCallback(async () => {
    await bridge.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: THEME_EXTENSION_ID },
      },
    });
  }, [bridge]);

  // @cpt-begin:child-bridge-action-handler:p3:inst-3
  // Mount Profile then — on success — send a refresh action to the now-mounted
  // Profile extension. The chained `next` step targets the extension ID directly
  // so the mediator routes it to Profile's registered ActionHandler rather than
  // through the domain's lifecycle action pipeline.
  const handleOpenProfileAndRefresh = useCallback(async () => {
    await bridge.executeActionsChain({
      action: {
        type: FRONTX_ACTION_MOUNT_EXT,
        target: FRONTX_SCREEN_DOMAIN,
        payload: { subject: PROFILE_EXTENSION_ID },
      },
      next: {
        action: {
          type: DEMO_ACTION_REFRESH_PROFILE,
          target: PROFILE_EXTENSION_ID,
        },
      },
    });
  }, [bridge]);
  // @cpt-end:child-bridge-action-handler:p3:inst-3

  // Show skeleton while translations are loading
  if (loading) {
    return (
      <div ref={containerRef} className="p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-96 mb-6" />
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-6 w-48 mb-4" />
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-8">
      <h1 className="text-3xl font-bold mb-4">
        {t('title')}
      </h1>
      <p className="text-muted-foreground mb-6">
        {t('welcome')}
      </p>

      <Card className="mb-6">
        <CardContent className="p-6">
          <p className="text-muted-foreground leading-relaxed">
            {t('description')}
          </p>
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-3">
            {t('bridge_info')}
          </h2>
          <dl className="grid gap-2">
            <div>
              <dt className="font-medium">{t('domain_id')}</dt>
              <dd className="font-mono text-sm text-muted-foreground">{bridge.domainId}</dd>
            </div>
            <div>
              <dt className="font-medium">{t('instance_id')}</dt>
              <dd className="font-mono text-sm text-muted-foreground">{bridge.instanceId}</dd>
            </div>
            <div>
              <dt className="font-medium">{t('current_theme')}</dt>
              <dd className="font-mono text-sm text-muted-foreground">{theme}</dd>
            </div>
            <div>
              <dt className="font-medium">{t('current_language')}</dt>
              <dd className="font-mono text-sm text-muted-foreground">{language}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h2 className="text-xl font-semibold mb-3">
            {t('navigation_title')}
          </h2>
          <p className="text-muted-foreground mb-4">
            {t('navigation_description')}
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={handleGoToTheme}>
              {t('go_to_theme')}
            </Button>
            <Button onClick={handleOpenProfileAndRefresh} variant={ButtonVariant.Outline}>
              {t('open_profile_refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

HelloWorldScreen.displayName = 'HelloWorldScreen';
