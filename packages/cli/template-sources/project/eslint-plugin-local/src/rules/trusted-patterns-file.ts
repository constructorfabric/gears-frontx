/**
 * @fileoverview Enforce safety guardrails on the MFE trust-kernel file.
 *
 * This rule is scoped to files that concentrate patterns static analyzers
 * flag as unsafe but are safe by construction. Such files are excluded from
 * security scans (e.g., Codacy) — which makes editing them a security-
 * sensitive action. This rule makes that responsibility explicit.
 *
 * Enforced invariants for files this rule applies to:
 *
 *   1. Every exported function MUST have a JSDoc block containing both
 *      `@safety-reviewed` and `@why` tags. The `@why` tag must document
 *      the safety argument — why the scanner-flagged pattern is actually
 *      safe for the inputs this function accepts.
 *
 *   2. No banned tokens at the file level: `fs`, `child_process`,
 *      `process.env`, `eval`. These operations interact with the outside
 *      world in ways the narrow trust argument doesn't cover.
 *
 *   3. Top-level declarations other than `export function`, `import`, and
 *      type aliases are forbidden. In particular, no top-level `let`/`var`
 *      or mutable state — the file must be stateless so the safety argument
 *      for each function stands alone.
 *
 *   4. Imports other than `import type` are forbidden. The trust kernel
 *      must not pull in runtime dependencies that could change its effective
 *      behavior after review.
 *
 * The set of files this rule applies to is configured in the monorepo's
 * `eslint.config.js` via a `files` glob.
 *
 * @author Gears FrontX Team
 */

import type { Rule } from 'eslint';
import type {
  Program,
  ExportNamedDeclaration,
  FunctionDeclaration,
  Identifier,
  MemberExpression,
  ImportDeclaration,
  ImportExpression,
  CallExpression,
  Literal,
} from 'estree';

const BANNED_IDENTIFIERS = new Set(['eval']);
const BANNED_MODULE_NAMES = new Set([
  'fs',
  'node:fs',
  'fs/promises',
  'node:fs/promises',
  'child_process',
  'node:child_process',
]);
const ALLOWED_TOP_LEVEL_NODE_TYPES = new Set([
  'ExportNamedDeclaration',
  'ImportDeclaration',
  'TSTypeAliasDeclaration',
  'TSInterfaceDeclaration',
  'ExpressionStatement', // tolerated only for directive-like string literals (`use strict`)
]);

const REQUIRED_TAGS = ['@safety-reviewed', '@why'];

function getLeadingCommentText(
  context: Rule.RuleContext,
  node: Rule.Node,
): string {
  const comments = context.getSourceCode().getCommentsBefore(node);
  return comments.map((c) => c.value).join('\n');
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce safety guardrails on files that concentrate scanner-flagged but safe-by-construction patterns (trust kernel).',
      category: 'Security',
      recommended: true,
    },
    messages: {
      missingTag:
        'TRUST KERNEL VIOLATION: Exported function `{{name}}` is missing required JSDoc tag `{{tag}}`. ' +
        'Every export must document its safety argument with both `@safety-reviewed <date>` and `@why <explanation>` tags.',
      nonFunctionExport:
        'TRUST KERNEL VIOLATION: Only `export function` declarations are allowed in this file. ' +
        'Non-function exports (classes, variables, types) cannot carry a safety argument.',
      bannedIdentifier:
        'TRUST KERNEL VIOLATION: `{{name}}` is not allowed in the trust kernel file. ' +
        'Operations like `eval` interact with code outside the narrow trust argument.',
      bannedImport:
        'TRUST KERNEL VIOLATION: Module `{{module}}` is not allowed in the trust kernel file. ' +
        'File system, process, and subprocess APIs break the isolation this file depends on.',
      nonTypeImport:
        'TRUST KERNEL VIOLATION: Only `import type` is allowed in this file. ' +
        'Runtime imports could change the file\'s effective behavior after review.',
      disallowedTopLevel:
        'TRUST KERNEL VIOLATION: Top-level `{{kind}}` is not allowed. ' +
        'The trust kernel must contain only exported functions, imports, and types — no module-level state.',
    },
    schema: [],
  },

  create(context: Rule.RuleContext): Rule.RuleListener {
    return {
      Program(node: Program) {
        for (const stmt of node.body) {
          if (!ALLOWED_TOP_LEVEL_NODE_TYPES.has(stmt.type)) {
            context.report({
              node: stmt,
              messageId: 'disallowedTopLevel',
              data: { kind: stmt.type },
            });
            continue;
          }
          // ExpressionStatement is allowlisted ONLY for directive prologues
          // (e.g. `'use strict'`). A bare side-effect call like `doSomething()`
          // is also an ExpressionStatement but has no `directive` field.
          if (
            stmt.type === 'ExpressionStatement' &&
            !(
              'directive' in stmt &&
              typeof (stmt as { directive?: unknown }).directive === 'string'
            )
          ) {
            context.report({
              node: stmt,
              messageId: 'disallowedTopLevel',
              data: { kind: stmt.type },
            });
          }
        }
      },

      ImportDeclaration(node: ImportDeclaration) {
        const source = String(node.source.value);
        if (BANNED_MODULE_NAMES.has(source)) {
          context.report({
            node,
            messageId: 'bannedImport',
            data: { module: source },
          });
          return;
        }
        // Require type-only imports. Allow when the declaration itself is
        // type-only OR when every specifier is type-only. A side-effect
        // import (`import './setup'`) has zero specifiers — `.every()`
        // returns true on the empty array, so we must reject it explicitly.
        const isTypeOnlyDecl =
          (node as ImportDeclaration & { importKind?: string }).importKind ===
          'type';
        const hasSpecifiers = node.specifiers.length > 0;
        const allSpecifiersTypeOnly = node.specifiers.every(
          (spec) => (spec as { importKind?: string }).importKind === 'type',
        );
        if (!isTypeOnlyDecl && (!hasSpecifiers || !allSpecifiersTypeOnly)) {
          context.report({
            node,
            messageId: 'nonTypeImport',
          });
        }
      },

      Identifier(node: Identifier) {
        if (!BANNED_IDENTIFIERS.has(node.name)) return;
        // Skip property names in member expressions (e.g., `foo.eval`)
        const parent = (node as Rule.Node).parent;
        if (
          parent?.type === 'MemberExpression' &&
          (parent as MemberExpression).property === node &&
          !(parent as MemberExpression).computed
        ) {
          return;
        }
        context.report({
          node,
          messageId: 'bannedIdentifier',
          data: { name: node.name },
        });
      },

      MemberExpression(node: MemberExpression) {
        // Enforce the documented `process.env` ban. The `Identifier` visitor
        // alone cannot distinguish `process.env` from unrelated `process`
        // identifiers, so we match the full shape here.
        if (node.computed) return;
        const object = node.object;
        const property = node.property;
        if (
          object.type === 'Identifier' &&
          (object as Identifier).name === 'process' &&
          property.type === 'Identifier' &&
          (property as Identifier).name === 'env'
        ) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: 'bannedIdentifier',
            data: { name: 'process.env' },
          });
        }
      },

      // Dynamic imports: `await import('node:fs')` must be blocked too.
      ImportExpression(node: ImportExpression) {
        const source = node.source;
        if (source.type !== 'Literal') return;
        const value = (source as Literal).value;
        if (typeof value === 'string' && BANNED_MODULE_NAMES.has(value)) {
          context.report({
            node: node as unknown as Rule.Node,
            messageId: 'bannedImport',
            data: { module: value },
          });
        }
      },

      // `require('child_process')` must be blocked too.
      CallExpression(node: CallExpression) {
        if (
          node.callee.type !== 'Identifier' ||
          (node.callee as Identifier).name !== 'require'
        ) {
          return;
        }
        const [firstArg] = node.arguments;
        if (
          firstArg?.type === 'Literal' &&
          typeof (firstArg as Literal).value === 'string' &&
          BANNED_MODULE_NAMES.has((firstArg as Literal).value as string)
        ) {
          context.report({
            node: firstArg as unknown as Rule.Node,
            messageId: 'bannedImport',
            data: { module: (firstArg as Literal).value as string },
          });
        }
      },

      ExportNamedDeclaration(node: ExportNamedDeclaration) {
        const decl = node.declaration;
        if (!decl) return;
        if (decl.type !== 'FunctionDeclaration') {
          context.report({
            node,
            messageId: 'nonFunctionExport',
          });
          return;
        }
        const fnDecl = decl as FunctionDeclaration;
        const fnName = fnDecl.id?.name ?? '<anonymous>';
        const leadingText = getLeadingCommentText(context, node as Rule.Node);
        for (const tag of REQUIRED_TAGS) {
          if (!leadingText.includes(tag)) {
            context.report({
              node,
              messageId: 'missingTag',
              data: { name: fnName, tag },
            });
          }
        }
      },
    };
  },
};

export = rule;
