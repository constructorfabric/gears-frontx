import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  useApiQuery,
  apiRegistry,
} from '@gears-frontx/react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
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

      {/*
        Card spaces its slots with `gap: var(--card-spacing)` declared on the
        card root, so that rhythm only ever falls between Card's DIRECT
        children — the slots below stay directly under <Card>. A wrapper around
        them (`<Card><form>…slots…</form></Card>`, the shape a form screen
        invites) leaves the card a single child and the gap applies to nothing,
        while the slots' horizontal padding still lands because the kit sets it
        through descendant rules (`.card .cardContent`) — half-correct spacing
        reads as a small visual glitch rather than as the composition mistake
        it is. A form goes inside a slot; README "Styling" carries the shape.
      */}
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
        <CardContent>{statusCardBody}</CardContent>
      </Card>
    </div>
  );
};

HomeScreen.displayName = 'HomeScreen';
