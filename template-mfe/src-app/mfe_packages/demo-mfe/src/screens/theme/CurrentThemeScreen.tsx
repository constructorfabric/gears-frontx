import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE } from '@gears-frontx/react';
import { useScreenTranslations } from '../../shared/useScreenTranslations';

/*
 * This screen renders the SHELL's theme, so it paints from the shell's Tailwind
 * colour utilities and takes no component from @gears-frontx/ui-kit. That is
 * also why `lifecycle-theme` does not extend KitThemedLifecycle: the kit's
 * tokens re-declare `--background`, `--primary` and their neighbours as
 * complete colours, and the utilities below read the same names as HSL
 * triplets. Anchoring kit tokens on this shadow host would blank every swatch
 * the screen exists to display.
 *
 * `card` and `placeholder` below stand in for the kit's Card and Skeleton for
 * that reason; they are the shell's own utility classes, not a second component
 * library.
 */
const CARD_CLASS = 'rounded-lg border border-border bg-card text-card-foreground shadow-sm';
const PLACEHOLDER_CLASS = 'animate-pulse rounded-md bg-muted';

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
 * Runs inside Shadow DOM with isolated styles.
 *
 * Subscribes to theme and language domain properties to demonstrate
 * host-MFE communication via bridge.
 */
export const CurrentThemeScreen: React.FC<CurrentThemeScreenProps> = ({ bridge }) => {
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
      <div ref={containerRef} className="p-8" role="status" aria-busy="true">
        <div className={`${PLACEHOLDER_CLASS} h-8 w-64 mb-4`} />
        <div className={`${PLACEHOLDER_CLASS} h-4 w-96 mb-6`} />
        <div className={CARD_CLASS}>
          <div className="p-6">
            <div className={`${PLACEHOLDER_CLASS} h-6 w-48 mb-4`} />
            <div className="space-y-3">
              <div className={`${PLACEHOLDER_CLASS} h-4 w-full`} />
              <div className={`${PLACEHOLDER_CLASS} h-4 w-full`} />
            </div>
          </div>
        </div>
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
        <div className={CARD_CLASS}>
          <div className="p-6">
            <h2 className="text-xl font-semibold mb-3">
              {t('theme_information')}
            </h2>
            <dl className="grid gap-2">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('current_theme_label')}:</dt>
                <dd className="text-foreground font-mono text-lg">{theme}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Color Swatches */}
        <div className={CARD_CLASS}>
          <div className="p-6">
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
          </div>
        </div>

        {/* CSS Variables Reference */}
        <div className={CARD_CLASS}>
          <div className="p-6">
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
          </div>
        </div>

        {/* Bridge Info Card */}
        <div className={CARD_CLASS}>
          <div className="p-6">
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
          </div>
        </div>
      </div>
    </div>
  );
};

CurrentThemeScreen.displayName = 'CurrentThemeScreen';
