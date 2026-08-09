import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_ACTION_MOUNT_EXT, FRONTX_SCREEN_DOMAIN, FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { THEME_EXTENSION_ID, PROFILE_EXTENSION_ID, DEMO_ACTION_REFRESH_PROFILE } from '../../shared/extension-ids';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
import styles from './HelloWorldScreen.module.css';

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
 * Uses @gears-frontx/ui-kit components, styled from its design tokens.
 * Runs inside Shadow DOM with isolated styles.
 */
export const HelloWorldScreen: React.FC<HelloWorldScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  /*
   * The bridge's current values are read here, in lazy useState initializers,
   * rather than at the top of the effect below. A setState called synchronously
   * in an effect body re-renders the screen before paint, which is why
   * `react-hooks/set-state-in-effect` rejects it; the effect only has to
   * SUBSCRIBE. Reading during the first render is equivalent because the
   * lifecycle hands one bridge to the screen for the whole mounted life of the
   * root, so there is no later bridge whose values this would miss.
   */
  const [theme, setTheme] = useState<string>(() => {
    const initialTheme = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
    return initialTheme && typeof initialTheme.value === 'string' ? initialTheme.value : 'default';
  });
  const [language, setLanguage] = useState<string>(() => {
    const initialLang = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
    return initialLang && typeof initialLang.value === 'string' ? initialLang.value : 'en';
  });

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
        const rootNode = containerRef.current?.getRootNode();
        if (rootNode && 'host' in rootNode) {
          const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
          const direction = rtlLanguages.includes(property.value) ? 'rtl' : 'ltr';
          (rootNode.host as HTMLElement).dir = direction;
        }
      }
    });

    return () => {
      themeUnsubscribe();
      languageUnsubscribe();
    };
  }, [bridge]);

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

  const kitThemeScope = kitThemeScopeFor(theme);

  // Show skeleton while translations are loading
  if (loading) {
    return (
      // A Skeleton carries no loading semantics of its own; the region announces them.
      <div
        ref={containerRef}
        className={styles.screen}
        data-theme={kitThemeScope}
        role="status"
        aria-busy="true"
      >
        <div className={styles.placeholders}>
          <Skeleton className={styles.placeholderTitle} />
          <Skeleton className={styles.placeholderLine} />
        </div>
        <Card>
          <CardContent>
            <div className={styles.placeholders}>
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLineShort} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('welcome')}</p>
      </div>

      <Card>
        <CardContent>
          <p className={styles.prose}>{t('description')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className={styles.sectionTitle}>{t('bridge_info')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <dl className={styles.definitions}>
            <div>
              <dt className={styles.term}>{t('domain_id')}</dt>
              <dd className={styles.value}>{bridge.domainId}</dd>
            </div>
            <div>
              <dt className={styles.term}>{t('instance_id')}</dt>
              <dd className={styles.value}>{bridge.instanceId}</dd>
            </div>
            <div>
              <dt className={styles.term}>{t('current_theme')}</dt>
              <dd className={styles.value}>{theme}</dd>
            </div>
            <div>
              <dt className={styles.term}>{t('current_language')}</dt>
              <dd className={styles.value}>{language}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className={styles.sectionTitle}>{t('navigation_title')}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className={styles.prose}>{t('navigation_description')}</p>
        </CardContent>
        <CardFooter>
          <div className={styles.actions}>
            <Button onClick={handleGoToTheme}>{t('go_to_theme')}</Button>
            <Button onClick={handleOpenProfileAndRefresh} variant="outline">
              {t('open_profile_refresh')}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};

HelloWorldScreen.displayName = 'HelloWorldScreen';
