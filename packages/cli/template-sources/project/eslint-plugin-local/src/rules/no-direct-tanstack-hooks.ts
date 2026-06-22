/**
 * @fileoverview Prevent direct use of @tanstack/react-query hooks in app code.
 *
 * Gears FrontX wraps TanStack Query behind useApiQuery, useApiInfiniteQuery,
 * useApiSuspenseInfiniteQuery, useApiMutation, useApiStream, and useQueryCache.
 * Direct imports bypass descriptor-based cache keys,
 * the restricted QueryCache interface, and abort/cancellation wiring.
 *
 * @author Gears FrontX Team
 */

import type { Rule } from 'eslint';
import type { ImportDeclaration } from 'estree';

const BANNED_HOOKS = new Set([
  'useQuery',
  'useMutation',
  'useQueryClient',
  'useMutationState',
  'useInfiniteQuery',
  'useSuspenseQuery',
  'useSuspenseInfiniteQuery',
  'useIsFetching',
  'useIsMutating',
  'QueryClientProvider',
]);

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent direct use of @tanstack/react-query hooks. Use Gears FrontX wrappers from @gears-frontx/react instead.',
      category: 'Data Layer',
      recommended: true,
    },
    messages: {
      noDirectHook:
        'QUERY VIOLATION: Do not import {{name}} from @tanstack/react-query. ' +
        'Use {{replacement}} from @gears-frontx/react instead. ' +
        'Gears FrontX wrappers enforce descriptor-based cache keys and prevent raw QueryClient leakage.',
      noDirectType:
        'QUERY VIOLATION: Do not import {{name}} from @tanstack/react-query. ' +
        'Use the equivalent type from @gears-frontx/react (e.g., ApiQueryResult, ApiMutationResult, QueryCache).',
    },
    schema: [],
  },

  create(context: Rule.RuleContext): Rule.RuleListener {
    return {
      ImportDeclaration(node: ImportDeclaration) {
        const source = node.source.value;
        if (source !== '@tanstack/react-query') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== 'ImportSpecifier') continue;

          const imported =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : String(specifier.imported.value);

          if (!BANNED_HOOKS.has(imported)) continue;

          const replacement = getReplacementHint(imported);

          context.report({
            node: specifier,
            messageId: replacement ? 'noDirectHook' : 'noDirectType',
            data: {
              name: imported,
              replacement: replacement ?? '',
            },
          });
        }
      },
    };
  },
};

function getReplacementHint(name: string): string | null {
  switch (name) {
    case 'useQuery':
      return 'useApiQuery';
    case 'useSuspenseQuery':
      return 'useApiSuspenseQuery';
    case 'useMutation':
      return 'useApiMutation';
    case 'useQueryClient':
      return 'useQueryCache';
    case 'QueryClientProvider':
      return 'FrontXProvider (which includes QueryClientProvider)';
    case 'useInfiniteQuery':
      return 'useApiInfiniteQuery';
    case 'useSuspenseInfiniteQuery':
      return 'useApiSuspenseInfiniteQuery';
    case 'useMutationState':
    case 'useIsFetching':
    case 'useIsMutating':
      return 'useQueryCache for cache inspection';
    default:
      return null;
  }
}

export = rule;
