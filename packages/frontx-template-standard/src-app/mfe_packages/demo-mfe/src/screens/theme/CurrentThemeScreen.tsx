import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { Card, CardContent } from '../../components/ui/card';
import { Skeleton } from '../../components/ui/skeleton';
import { useScreenTranslations } from '../../shared/useScreenTranslations';

/**
 * Props for the CurrentThemeScreen component.
 */
interface CurrentThemeScreenProps {
  bridge: ChildMfeBridge;
}

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * Current Theme Screen for the MFE remote.
 *
 * Displays the current theme value and demonstrates CSS variable consumption.
 * Shows colored swatches for background, foreground, primary, secondary, muted, accent,
 * destructive using the CSS custom properties.
 *
 * Receives a ChildMfeBridge for communication with the host application.
 * Demonstrates bridge usage by displaying domainId, instanceId, theme, and language.
 *
 * Uses local UI components (Card) for consistent styling.
 * Runs inside Shadow DOM with isolated styles.
 *
 * Subscribes to theme and language domain properties to demonstrate
 * host-MFE communication via bridge.
 */
export const CurrentThemeScreen: React.FC<CurrentThemeScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string>('default');
  const [language, setLanguage] = useState<string>('en');

  // Load translations using the shared hook
  const { t, loading } = useScreenTranslations(languageModules, bridge);

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

    // Cleanup subscriptions on unmount
    return () => {
      themeUnsubscribe();
      languageUnsubscribe();
    };
  }, [bridge]);

  // Color swatches data (names will be translated)
  const colorSwatches = [
    { nameKey: 'color_background', class: 'bg-background text-foreground' },
    { nameKey: 'color_foreground', class: 'bg-foreground text-background' },
    { nameKey: 'color_primary', class: 'bg-primary text-primary-foreground' },
    { nameKey: 'color_secondary', class: 'bg-secondary text-secondary-foreground' },
    { nameKey: 'color_muted', class: 'bg-muted text-muted-foreground' },
    { nameKey: 'color_accent', class: 'bg-accent text-accent-foreground' },
    { nameKey: 'color_destructive', class: 'bg-destructive text-destructive-foreground' },
  ];

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
        {t('description')}
      </p>

      <div className="max-w-4xl space-y-4">
        {/* Theme Info Card */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-3">
              {t('theme_information')}
            </h2>
            <dl className="grid gap-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('current_theme_label')}:</dt>
                <dd className="text-foreground font-mono text-lg">{theme}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Color Swatches */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-3">
              {t('theme_color_swatches')}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {colorSwatches.map((swatch) => (
                <div
                  key={swatch.nameKey}
                  className={`${swatch.class} border border-border rounded-md p-4`}
                >
                  <div className="font-medium">{t(swatch.nameKey)}</div>
                  <div className="text-sm font-mono">{swatch.class}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* CSS Variables Reference */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-3">
              {t('css_custom_properties')}
            </h2>
            <div className="grid grid-cols-2 gap-2 text-sm font-mono">
              <div>--background</div>
              <div>--foreground</div>
              <div>--primary</div>
              <div>--primary-foreground</div>
              <div>--secondary</div>
              <div>--secondary-foreground</div>
              <div>--muted</div>
              <div>--muted-foreground</div>
              <div>--accent</div>
              <div>--accent-foreground</div>
              <div>--destructive</div>
              <div>--destructive-foreground</div>
            </div>
          </CardContent>
        </Card>

        {/* Bridge Info Card */}
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
      </div>
    </div>
  );
};

CurrentThemeScreen.displayName = 'CurrentThemeScreen';
