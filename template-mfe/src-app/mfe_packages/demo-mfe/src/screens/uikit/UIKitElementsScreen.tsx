/**
 * UIKit Elements Screen
 *
 * Showcase of @gears-frontx/ui-kit's published component surface.
 * Features:
 * - CategoryMenu over the kit's categories
 * - One demo per exported kit component
 * - Lazy loading for category components
 * - Scroll-to-element navigation
 * - i18n support for all text
 * - Theme and language reactivity via bridge
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton, Toaster } from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
import { CategoryMenu } from './components/CategoryMenu';
import styles from './UIKitElements.module.css';

// Lazy-loaded category components
const LayoutElements = lazy(() =>
  import('./components/LayoutElements').then((m) => ({ default: m.LayoutElements }))
);
const NavigationElements = lazy(() =>
  import('./components/NavigationElements').then((m) => ({ default: m.NavigationElements }))
);
const FormElements = lazy(() =>
  import('./components/FormElements').then((m) => ({ default: m.FormElements }))
);
const ActionElements = lazy(() =>
  import('./components/ActionElements').then((m) => ({ default: m.ActionElements }))
);
const FeedbackElements = lazy(() =>
  import('./components/FeedbackElements').then((m) => ({ default: m.FeedbackElements }))
);
const DataDisplayElements = lazy(() =>
  import('./components/DataDisplayElements').then((m) => ({ default: m.DataDisplayElements }))
);
const OverlayElements = lazy(() =>
  import('./components/OverlayElements').then((m) => ({ default: m.OverlayElements }))
);

interface UIKitElementsScreenProps {
  bridge: ChildMfeBridge;
}

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * Placeholder for a category still loading.
 *
 * Declared once rather than inline per Suspense boundary: seven identical
 * fallbacks written out is the same tree seven times, and a change to it would
 * have to be made in seven places.
 */
const categoryFallback = (
  <div className={styles.placeholders} role="status" aria-busy="true">
    <Skeleton className={styles.placeholderTitle} />
    <Skeleton className={styles.placeholderBlock} />
  </div>
);

/**
 * UIKit Elements Screen component.
 *
 * Displays a showcase of every component @gears-frontx/ui-kit exports, with:
 * - CategoryMenu navigation
 * - Lazy-loaded category sections
 * - Scroll-to-element functionality
 * - Full i18n support
 * - Theme and language reactivity
 */
export const UIKitElementsScreen: React.FC<UIKitElementsScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  /*
   * Every kit component that portals — Select, DropdownMenu, Tooltip, Dialog,
   * Toaster — defaults to `<body>`, which is outside this shadow root: the
   * adopted component stylesheets and the tokens on this host both stop at the
   * boundary, so a popup left on the default renders unstyled in the light DOM.
   * They all take a `container`, and Base UI accepts a ref, so this one node
   * serves all five without waiting a render for the element to exist.
   */
  const portalContainerRef = useRef<HTMLDivElement>(null);
  const [activeElement, setActiveElement] = useState<string | undefined>();
  const [theme, setTheme] = useState<string>('default');
  const [language, setLanguage] = useState<string>('en');

  // Load translations
  const { t, loading: translationsLoading } = useScreenTranslations(languageModules, bridge);

  // Handle theme subscription; language + direction come from useScreenTranslations
  useEffect(() => {
    // Read initial property values
    const initialTheme = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
    if (initialTheme && typeof initialTheme.value === 'string') {
      setTheme(initialTheme.value);
    }
    const initialLang = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
    if (initialLang && typeof initialLang.value === 'string') {
      setLanguage(initialLang.value);
      const rootNode = containerRef.current?.getRootNode();
      if (rootNode && 'host' in rootNode) {
        const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
        const direction = rtlLanguages.includes(initialLang.value) ? 'rtl' : 'ltr';
        (rootNode.host as HTMLElement).dir = direction;
      }
    }

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

  // Track active element on scroll (intersection observer)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.target.id.startsWith('element-')) {
            setActiveElement(entry.target.id);
          }
        });
      },
      { rootMargin: '-100px 0px -50% 0px' }
    );

    // Query elements from the correct root (shadow DOM or light DOM)
    const root = containerRef.current?.getRootNode();
    let elements: NodeListOf<Element>;

    if (root && root instanceof ShadowRoot) {
      // Inside Shadow DOM: query from shadow root
      elements = root.querySelectorAll('[id^="element-"]');
    } else {
      // Fallback to light DOM for compatibility
      elements = document.querySelectorAll('[id^="element-"]');
    }

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  const kitThemeScope = kitThemeScopeFor(theme);

  if (translationsLoading) {
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
          <Skeleton className={styles.placeholderBlock} />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
      {/* Sidebar Menu */}
      <aside className={styles.sidebar}>
        <CategoryMenu t={t} activeElement={activeElement} containerRef={containerRef} />
      </aside>

      {/* Main Content */}
      <main className={styles.content}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.description}>{t('description')}</p>
        </div>

        <Suspense fallback={categoryFallback}>
          <LayoutElements t={t} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <NavigationElements t={t} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <FormElements t={t} portalContainer={portalContainerRef} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <ActionElements t={t} portalContainer={portalContainerRef} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <FeedbackElements t={t} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <DataDisplayElements t={t} portalContainer={portalContainerRef} />
        </Suspense>

        <Suspense fallback={categoryFallback}>
          <OverlayElements t={t} portalContainer={portalContainerRef} />
        </Suspense>

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
      </main>

      {/*
        Toast container, mounted once for the screen. The shell may run a Toaster
        of its own on the kit's shared manager; this one stays inside the shadow
        root through `container`, and a duplicate viewport on that same manager
        would render every toast twice.
      */}
      <Toaster container={portalContainerRef} />

      <div ref={portalContainerRef} className={styles.portalContainer} />
    </div>
  );
};

UIKitElementsScreen.displayName = 'UIKitElementsScreen';
