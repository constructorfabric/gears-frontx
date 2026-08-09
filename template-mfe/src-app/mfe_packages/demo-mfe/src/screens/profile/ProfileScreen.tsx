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
import { Button, Card, CardContent, CardFooter, CardHeader, CardTitle, Skeleton } from '@gears-frontx/ui-kit';
import { useScreenTranslations } from '../../shared/useScreenTranslations';
import { kitThemeScopeFor } from '../../shared/kitThemeScope';
import { AccountsApiService, type UpdateProfileVariables } from '../../api/AccountsApiService';
import type { GetCurrentUserResponse } from '../../api/types';
import { ProfileDetailsCard, type ProfileFormValues } from './components/ProfileDetailsCard';
import { applyOptimisticProfileUpdate } from './profileOptimisticUpdate';
import styles from './ProfileScreen.module.css';

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

  const kitThemeScope = kitThemeScopeFor(theme);

  // Show skeleton loader while translations are loading
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
        </div>
        <Card>
          <CardContent>
            <div className={styles.placeholders}>
              <Skeleton className={styles.placeholderAvatar} />
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLineShort} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // LOADING STATE: Show skeleton placeholders
  if (isLoading) {
    return (
      <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.description}>{t('loading')}</p>
        </div>
        <Card>
          <CardContent>
            <div className={styles.placeholders} role="status" aria-busy="true">
              <Skeleton className={styles.placeholderAvatar} />
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLine} />
              <Skeleton className={styles.placeholderLineShort} />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ERROR STATE: Show error message + Retry button
  if (isError) {
    return (
      <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t('title')}</h1>
        </div>
        <Card>
          <CardContent>
            <p className={styles.error}>
              {t('error_prefix')}
              {error?.message ?? 'Unknown error'}
            </p>
          </CardContent>
          <CardFooter>
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
    <div ref={containerRef} className={styles.screen} data-theme={kitThemeScope}>
      <div className={styles.intro}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.description}>{t('welcome')}</p>
      </div>

      <div className={styles.column}>
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
      </div>
    </div>
  );
};
// @cpt-end:implement-endpoint-descriptors:p4:inst-demo-profile-screen
// @cpt-end:request-cancellation:p2:inst-profile-screen

ProfileScreen.displayName = 'ProfileScreen';
