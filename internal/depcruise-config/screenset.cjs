/**
 * FrontX Dependency Cruiser Screenset Configuration (L4)
 * Rules for user code (screensets, components, etc.)
 *
 * This includes ALL existing screenset isolation rules and flux architecture rules.
 *
 * CRITICAL: This layer includes ALL protections from the existing .dependency-cruiser.cjs
 * to ensure NO existing rules are lost during the SDK migration.
 */

const base = require('./base.cjs');

module.exports = {
  forbidden: [
    ...base.forbidden,

    // ============ SCREENSET ISOLATION RULES ============
    {
      name: 'no-cross-screenset-imports',
      severity: 'error',
      from: { path: '^src/screensets/([^/]+)/' },
      to: {
        path: '^src/screensets/[^/]+/',
        pathNot: ['^src/screensets/$1/', '^src/screensets/screensetRegistry\\.tsx$'],
      },
      comment: 'Screensets must not import from other screensets (vertical slice isolation). Each screenset is self-contained.',
    },
    {
      name: 'no-circular-screenset-deps',
      severity: 'warn',
      from: { path: '^src/screensets/([^/]+)/' },
      to: {
        path: '^src/screensets/$1/',
        circular: true,
      },
      comment: 'Avoid circular dependencies within screenset modules. May indicate tight coupling.',
    },

    // ============ FLUX ARCHITECTURE RULES ============
    {
      name: 'flux-no-actions-in-effects-folder',
      severity: 'error',
      from: { path: '/effects/' },
      to: { path: '/actions/' },
      comment: 'FLUX VIOLATION: Effects folder cannot import from actions folder (circular flow risk).',
    },
    {
      name: 'flux-no-effects-in-actions-folder',
      severity: 'error',
      from: { path: '/actions/' },
      to: { path: '/effects/' },
      comment: 'FLUX VIOLATION: Actions folder cannot import from effects folder. Use event bus.',
    },
  ],
  options: base.options,
};
