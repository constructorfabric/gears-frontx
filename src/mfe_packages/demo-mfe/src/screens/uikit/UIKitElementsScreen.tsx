/**
 * UIKit Elements Screen
 *
 * Comprehensive showcase of all UIKit components available in FrontX.
 * Features:
 * - CategoryMenu with 9 categories
 * - 56 element demos using real UIKit components
 * - Lazy loading for category components
 * - Scroll-to-element navigation
 * - i18n support for all text
 * - Theme and language reactivity via bridge
 */

import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_LANGUAGE, FRONTX_SHARED_PROPERTY_THEME } from '@gears-frontx/react';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { CategoryMenu } from './components/CategoryMenu';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { Toaster } from '../../components/ui/sonner';
import { TooltipProvider } from '../../components/ui/tooltip';

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
const MediaElements = lazy(() =>
  import('./components/MediaElements').then((m) => ({ default: m.MediaElements }))
);
const DisclosureElements = lazy(() =>
  import('./components/DisclosureElements').then((m) => ({ default: m.DisclosureElements }))
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
 * UIKit Elements Screen component.
 *
 * Displays a comprehensive showcase of all UIKit components with:
 * - CategoryMenu navigation
 * - Lazy-loaded category sections
 * - Scroll-to-element functionality
 * - Full i18n support
 * - Theme and language reactivity
 */
export const UIKitElementsScreen: React.FC<UIKitElementsScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
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

  if (translationsLoading) {
    return (
      <div ref={containerRef} className="p-8 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div ref={containerRef} className="flex gap-6 p-8">
        {/* Sidebar Menu */}
        <aside className="w-64 flex-shrink-0">
          <CategoryMenu t={t} activeElement={activeElement} containerRef={containerRef} />
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 space-y-12">
          <div>
            <h1 className="text-4xl font-bold mb-2">{t('title')}</h1>
            <p className="text-lg text-muted-foreground">{t('description')}</p>
          </div>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <LayoutElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <NavigationElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <FormElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <ActionElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <FeedbackElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <DataDisplayElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <OverlayElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <MediaElements t={t} />
          </Suspense>

          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <DisclosureElements t={t} />
          </Suspense>

          <Card>
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
        </main>

        {/* Toast container (rendered once at screen level) */}
        <Toaster />
      </div>
    </TooltipProvider>
  );
};

UIKitElementsScreen.displayName = 'UIKitElementsScreen';
