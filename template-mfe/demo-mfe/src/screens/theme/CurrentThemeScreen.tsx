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

const RTL_LANGUAGES = ['ar', 'he', 'fa', 'ur'];

function readBridgeProperty(bridge: ChildMfeBridge, property: string, fallback: string): string {
  const current = bridge.getProperty(property);
  return current && typeof current.value === 'string' ? current.value : fallback;
}

/**
 * Current Theme Screen for the MFE remote.
 *
 * Displays the current theme value and demonstrates CSS variable consumption.
 * Shows colored swatches for background, foreground, primary, secondary, muted, accent,
 * destructive using the CSS custom properties.
 *
 * Receives a ChildMfeBridge for communication with the host application.
 * Demonstrates bridge usage by displaying extDomainId, extensionId, theme, and language.
 *
 * Runs inside Shadow DOM with isolated styles.
 *
 * Subscribes to theme and language domain properties to demonstrate
 * host-MFE communication via bridge.
 */
export const CurrentThemeScreen: React.FC<CurrentThemeScreenProps> = ({ bridge }) => {
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

    // Cleanup subscriptions on unmount
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
                <dd className="font-mono text-sm text-muted-foreground">{bridge.extDomainId}</dd>
              </div>
              <div>
                <dt className="font-medium">{t('instance_id')}</dt>
                <dd className="font-mono text-sm text-muted-foreground">{bridge.extensionId}</dd>
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
