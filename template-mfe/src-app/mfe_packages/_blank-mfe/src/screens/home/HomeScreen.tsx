import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  useApiQuery,
  apiRegistry,
} from '@gears-frontx/react';
import { Card, CardContent, Skeleton } from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { _BlankApiService } from '../../api/_BlankApiService';
import styles from './HomeScreen.module.css';

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

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
 * - Components from @gears-frontx/ui-kit, styled from its design tokens
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
  const [theme, setTheme] = useState<string>('default');
  const [language, setLanguage] = useState<string>('en');

  // @cpt-begin:implement-endpoint-descriptors:p4:inst-blank-home-query
  const service = apiRegistry.getService(_BlankApiService);
  const { t, loading } = useScreenTranslations(languageModules, bridge);
  const {
    data: statusData,
    isLoading: isStatusLoading,
    isError: isStatusError,
    error: statusError,
  } = useApiQuery(service.getStatus);
  // @cpt-end:implement-endpoint-descriptors:p4:inst-blank-home-query

  useEffect(() => {
    // Read initial property values
    const initialTheme = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
    if (initialTheme && typeof initialTheme.value === 'string') {
      setTheme(initialTheme.value);
    }
    const initialLang = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
    if (initialLang && typeof initialLang.value === 'string') {
      setLanguage(initialLang.value);
    }

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
          const rootNode = containerRef.current?.getRootNode();
          if (rootNode && 'host' in rootNode) {
            const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
            const direction = rtlLanguages.includes(property.value) ? 'rtl' : 'ltr';
            (rootNode.host as HTMLElement).dir = direction;
          }
        }
      }
    );

    return () => {
      themeUnsubscribe();
      languageUnsubscribe();
    };
  }, [bridge]);

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

  let statusCardBody: React.ReactNode;
  if (isStatusLoading) {
    statusCardBody = (
      <div role="status" aria-busy="true" className={styles.placeholders}>
        <Skeleton className={styles.placeholderLine} />
        <Skeleton className={styles.placeholderLineShort} />
        <Skeleton className={styles.placeholderBlock} />
      </div>
    );
  } else if (isStatusError) {
    statusCardBody = <p className={styles.error}>{statusError?.message}</p>;
  } else {
    statusCardBody = (
      <pre className={styles.payload}>{JSON.stringify(statusData, null, 2)}</pre>
    );
  }

  return (
    <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('description')}</p>
      </div>

      <Card>
        <CardContent>
          <h2 className={styles.sectionTitle}>{t('bridge_info')}</h2>
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
        <CardContent>{statusCardBody}</CardContent>
      </Card>
    </div>
  );
};

HomeScreen.displayName = 'HomeScreen';

/**
 * Map a host theme identifier onto the token scope `@gears-frontx/ui-kit`
 * understands.
 *
 * The kit scopes its tokens with `data-theme="light" | "dark"`. Host theme
 * identifiers are the host's own vocabulary, and only `dark` happens to name
 * the same thing; every other identifier resolves to the light scope rather
 * than to no scope at all, because an element carrying neither value inherits
 * whatever the kit's `prefers-color-scheme` fallback resolved on the shadow
 * host — which is how a screen ends up dark inside a light shell.
 *
 * This is a bridge, not the answer: making kit-built screens track every host
 * theme means unifying the two token grammars, a decision above this template.
 *
 * @param hostTheme - Value of the host's shared theme property
 */
function kitThemeScopeFor(hostTheme: string): 'light' | 'dark' {
  return hostTheme === 'dark' ? 'dark' : 'light';
}
