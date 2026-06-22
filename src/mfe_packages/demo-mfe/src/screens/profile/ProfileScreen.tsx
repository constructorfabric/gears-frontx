// @cpt-FEATURE:request-cancellation:p2
// @cpt-FEATURE:implement-endpoint-descriptors:p4

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { ChildMfeBridge } from '@gears-frontx/react';
import {
  FRONTX_SHARED_PROPERTY_THEME,
  FRONTX_SHARED_PROPERTY_LANGUAGE,
  useApiQuery,
  useApiMutation,
  apiRegistry,
} from '@gears-frontx/react';
import { Card, CardContent, CardFooter } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Skeleton } from '../../components/ui/skeleton';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { AccountsApiService, type UpdateProfileVariables } from '../../api/AccountsApiService';
import type { GetCurrentUserResponse } from '../../api/types';
import { ProfileDetailsCard, type ProfileFormValues } from './components/ProfileDetailsCard';
import { applyOptimisticProfileUpdate } from './profileOptimisticUpdate';

type UpdateProfileContext = {
  snapshot: GetCurrentUserResponse | undefined;
};

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
 * Displays user profile information backed by TanStack Query:
 * - Loading state (skeleton placeholders)
 * - Error state (error message + Retry button)
 * - Data state (full user profile display + editable profile form)
 *
 * The edit flow demonstrates the full optimistic-update pattern:
 *   onMutate  -> snapshot + optimistic set via queryCache
 *   onError   -> rollback via queryCache.set with snapshot
 *   onSettled -> invalidate to refetch authoritative state
 */
// @cpt-begin:request-cancellation:p2:inst-profile-screen
// @cpt-begin:implement-endpoint-descriptors:p4:inst-demo-profile-screen
export const ProfileScreen: React.FC<ProfileScreenProps> = ({ bridge }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string>('default');
  const [language, setLanguage] = useState<string>('en');

  const service = apiRegistry.getService(AccountsApiService);

  // Load translations using the shared hook
  const { t, loading: translationsLoading } = useScreenTranslations(languageModules, bridge);

  // TanStack Query — declarative fetch with automatic AbortSignal threading
  const { data, isLoading, isError, error, refetch } = useApiQuery(
    service.getCurrentUser
  );

  // Mutation: update profile name fields with optimistic update + rollback
  const {
    mutateAsync: updateProfile,
    isPending: isUpdating,
    error: updateError,
  } = useApiMutation<GetCurrentUserResponse, Error, UpdateProfileVariables, UpdateProfileContext>({
    endpoint: service.updateProfile,

    onMutate: async (variables, { queryCache }) => {
      // Cancel any in-flight refetch so it doesn't overwrite the optimistic value.
      await queryCache.cancel(service.getCurrentUser);

      const snapshot = queryCache.get<GetCurrentUserResponse>(service.getCurrentUser);

      queryCache.set<GetCurrentUserResponse>(service.getCurrentUser, (old) => {
        return applyOptimisticProfileUpdate(old, variables);
      });

      return { snapshot };
    },

    onError: (_error, _variables, context, { queryCache }) => {
      if (context?.snapshot !== undefined) {
        queryCache.set(service.getCurrentUser, context.snapshot);
      }
    },

    onSettled: async (_data, _error, _variables, _context, { queryCache }) => {
      await queryCache.invalidate(service.getCurrentUser);
    },
  });

  const handleProfileSave = useCallback(
    async (values: ProfileFormValues) => {
      await updateProfile(values);
    },
    [updateProfile]
  );

  // Subscribe to theme and language domain properties
  useEffect(() => {
    const initialTheme = bridge.getProperty(FRONTX_SHARED_PROPERTY_THEME);
    if (initialTheme && typeof initialTheme.value === 'string') {
      setTheme(initialTheme.value);
    }
    const initialLang = bridge.getProperty(FRONTX_SHARED_PROPERTY_LANGUAGE);
    if (initialLang && typeof initialLang.value === 'string') {
      setLanguage(initialLang.value);
    }

    const themeUnsubscribe = bridge.subscribeToProperty(FRONTX_SHARED_PROPERTY_THEME, (property) => {
      if (typeof property.value === 'string') {
        setTheme(property.value);
      }
    });

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
  if (isLoading) {
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
  if (isError) {
    return (
      <div ref={containerRef} className="p-8">
        <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
        <Card>
          <CardContent className="p-6">
            <p className="text-red-600 mb-4">
              {t('error_prefix')}
              {error?.message ?? 'Unknown error'}
            </p>
          </CardContent>
          <CardFooter className="p-6 pt-0">
            <Button onClick={() => { refetch(); }}>{t('retry')}</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // DATA STATE: Display full user profile
  const userData = data?.user;

  if (!userData) {
    return null;
  }

  return (
    <div ref={containerRef} className="p-8">
      <h1 className="text-3xl font-bold mb-4">{t('title')}</h1>
      <p className="text-muted-foreground mb-6">{t('welcome')}</p>

      <div className="max-w-2xl space-y-4">
        <ProfileDetailsCard
          user={userData}
          isSaving={isUpdating}
          saveErrorMessage={updateError?.message}
          t={t}
          onRefresh={() => { refetch(); }}
          onSubmit={handleProfileSave}
        />

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
// @cpt-end:implement-endpoint-descriptors:p4:inst-demo-profile-screen
// @cpt-end:request-cancellation:p2:inst-profile-screen

ProfileScreen.displayName = 'ProfileScreen';
