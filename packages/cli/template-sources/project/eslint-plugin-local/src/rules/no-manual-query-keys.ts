/**
 * @fileoverview Prevent hardcoded array literals as query cache keys.
 *
 * Gears FrontX derives cache keys automatically from endpoint descriptors.
 * Passing raw arrays to QueryCache methods (get, set, invalidate, etc.)
 * decouples the call site from the service definition and breaks when
 * service paths change.
 *
 * Allowed: queryCache.get(service.getCurrentUser)
 * Banned:  queryCache.get(['accounts', 'GET', '/user/current'])
 *
 * invalidateMany({ queryKey: [...] }) is exempt — prefix-based invalidation
 * requires a partial key array by design.
 *
 * @author Gears FrontX Team
 */

import type { Rule } from 'eslint';
import type { CallExpression, MemberExpression, Identifier } from 'estree';

/** QueryCache methods that accept a descriptor-or-key as first argument */
const CACHE_METHODS = new Set(['get', 'getState', 'set', 'cancel', 'invalidate', 'remove']);

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prevent hardcoded array literals as query cache keys. Use endpoint descriptors from the service instead.',
      category: 'Data Layer',
      recommended: true,
    },
    messages: {
      noManualKey:
        'QUERY VIOLATION: Do not pass hardcoded array keys to queryCache.{{method}}(). ' +
        'Use an endpoint descriptor instead: queryCache.{{method}}(service.endpoint). ' +
        'Descriptor-based keys stay in sync with service definitions automatically.',
    },
    schema: [],
  },

  create(context: Rule.RuleContext): Rule.RuleListener {
    return {
      CallExpression(node: CallExpression) {
        // Match: queryCache.get([...]), queryCache.set([...], ...), etc.
        if (node.callee.type !== 'MemberExpression') return;

        const callee = node.callee as MemberExpression;
        if (callee.property.type !== 'Identifier') return;

        const method = (callee.property as Identifier).name;
        if (!CACHE_METHODS.has(method)) return;

        // Check the first argument is an array literal
        const firstArg = node.arguments[0];
        if (firstArg?.type !== 'ArrayExpression') return;

        // Heuristic: only flag if the callee object looks like "queryCache" or
        // a destructured variable ending in "Cache" / "cache"
        const objectName = getObjectName(callee.object);
        if (objectName && !/cache/i.test(objectName)) return;

        context.report({
          node: firstArg,
          messageId: 'noManualKey',
          data: { method },
        });
      },
    };
  },
};

function getObjectName(node: CallExpression['callee']): string | null {
  if (node.type === 'Identifier') return node.name;
  return null;
}

export = rule;
