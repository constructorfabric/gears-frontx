import React, { useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import { FRONTX_SHARED_PROPERTY_THEME, FRONTX_SHARED_PROPERTY_LANGUAGE, useAppSelector } from '@gears-frontx/react';
import { Card, CardContent, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { fetchUser } from '../../actions/profileActions';
import type { ApiUser } from '../../api/types';

/**
 * Props for the ProfileScreen component.
 */
interface ProfileScreenProps {
  bridge: ChildMfeBridge;
}

// Stable reference for translation modules (hoisted to module level to prevent re-render loops)
const languageModules = import.meta.glob('./i18n/*.json') as Record<
  string,
  () => Promise<{ default: Record<string, string> }>
>;

/**
 * Profile Screen for the MFE remote.
 *
 * Displays user profile information with full state management:
 * - Loading state (skeleton placeholders)
 * - Error state (error message + Retry button)
 * - No-data state (message + Load User button)
 * - Data state (full user profile display)
 *
 * Uses local UI components and i18n for all text.
 * State is backed by the MFE-local Redux store (via useAppSelector).
 * Data fetching is triggered via the flux actions/events/effects pattern.
 */
export const ProfileScreen: React.FC<ProfileScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string>('default');
  const [language, setLanguage] = useState<string>('en');

  // Load translations using the shared hook
  const { t, loading: translationsLoading } = useScreenTranslations(languageModules, bridge);

  // Store-backed state (replaces useState for userData/loading/error)
  const user = useAppSelector((state) => state['demo/profile'].user);
  const loading = useAppSelector((state) => state['demo/profile'].loading);
  const error = useAppSelector((state) => state['demo/profile'].error);

  // Subscribe to theme and language domain properties
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

  // Fetch user data on mount via flux action
  useEffect(() => {
    fetchUser();
  }, []);

  // Show skeleton loader while translations are loading
  if (translationsLoading) {
    return (
      <div ref={containerRef} className="p-8">
        <Skeleton className="h-8 w-64 mb-4" />
        <Skeleton className="h-4 w-48 mb-6" />
        <Card>
          <CardContent className="space-y-4 p-6">
            <Skeleton className="h-20 w-20 rounded-full mb-4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // LOADING STATE: Show skeleton placeholders
  if (loading) {
    return (
      <div ref={containerRef} className="p-8">
        <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
        <p className="text-muted-foreground mb-6">{t('loading')}</p>
        <Card>
          <CardContent className="space-y-4 p-6">
            {/* Avatar skeleton */}
            <Skeleton className="h-20 w-20 rounded-full mb-4" />
            {/* Text skeletons */}
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-3/6" />
            <Skeleton className="h-4 w-4/6" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // ERROR STATE: Show error message + Retry button
  if (error) {
    return (
      <div ref={containerRef} className="p-8">
        <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600 mb-4">
              {t('error_prefix')}
              {error}
            </p>
          </CardContent>
          <CardFooter className="p-6 pt-0">
            <Button onClick={fetchUser}>{t('retry')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // NO-DATA STATE: Show message + Load User button
  if (!user) {
    return (
      <div ref={containerRef} className="p-8">
        <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
        <p className="text-muted-foreground mb-6">{t('welcome')}</p>
        <Card>
          <CardContent className="p-6">
            <p className="text-muted-foreground mb-4">{t('no_user_data')}</p>
          </CardContent>
          <CardFooter className="p-6 pt-0">
            <Button onClick={fetchUser}>{t('load_user')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // DATA STATE: Display full user profile
  const userData: ApiUser = user;

  return (
    <div ref={containerRef} className="p-8">
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">{t('welcome')}</p>

      <div className="max-w-2xl space-y-4">
        {/* Profile Card */}
        <Card>
          <CardContent className="p-6">
            {/* Avatar */}
            <div className="mb-6">
              {userData.avatarUrl && (
                <img
                  src={userData.avatarUrl}
                  alt={`${userData.firstName} ${userData.lastName}`}
                  className="w-20 h-20 rounded-full"
                />
              )}
            </div>

            {/* User name and email */}
            <div className="mb-6">
              <h2 className="text-2xl font-semibold mb-2">
                {userData.firstName} {userData.lastName}
              </h2>
              <p className="text-foreground font-mono text-sm">{userData.email}</p>
            </div>

            {/* Labeled fields */}
            <dl className="grid gap-3">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('role_label')}</dt>
                <dd className="text-foreground">{userData.role}</dd>
              </div>
              {userData.extra?.department !== undefined && (
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">{t('department_label')}</dt>
                  <dd className="text-foreground">{String(userData.extra.department)}</dd>
                </div>
              )}
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('id_label')}</dt>
                <dd className="text-foreground font-mono text-sm">{userData.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('created_label')}</dt>
                <dd className="text-foreground text-sm">
                  {new Date(userData.createdAt).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">{t('last_updated_label')}</dt>
                <dd className="text-foreground text-sm">
                  {new Date(userData.updatedAt).toLocaleString()}
                </dd>
              </div>
            </dl>
          </CardContent>
          <CardFooter className="p-6 pt-0">
            <Button onClick={fetchUser}>{t('refresh')}</Button>
          </CardFooter>
        </Card>

        {/* Bridge Info Card (for debugging) */}
        <Card>
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-3">{t('bridge_info')}</h2>
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

ProfileScreen.displayName = 'ProfileScreen';
