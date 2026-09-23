// Fixture for extract.test.ts: cva configs whose `variants` or
// `defaultVariants` block is not written inline. `fillAxes` is one axis set
// shared by two cva calls, the shape avatar.tsx uses for its fallback and its
// count; `sharedDefaults` does the same for the defaults. The walk used to
// read either block only as an inline object literal and drop anything else
// in silence, so both axes reached the contract with no values and no
// default. `Unresolvable` builds its variants in a function call, which no
// walk of initializers can follow, and has to say so.
import { cva, type VariantProps } from 'class-variance-authority';

const fillAxes = {
  tone: {
    neutral: 'tone-neutral',
    accent: 'tone-accent',
  },
  variant: {
    solid: 'variant-solid',
    soft: 'variant-soft',
  },
};

const sharedDefaults = { tone: 'accent' } as const;

const inlineDefaultsVariants = cva('inline-defaults', {
  variants: fillAxes,
  defaultVariants: { tone: 'neutral', variant: 'soft' },
});

const sharedDefaultsVariants = cva('shared-defaults', {
  variants: fillAxes,
  defaultVariants: sharedDefaults,
});

function makeAxes() {
  return fillAxes;
}

const unresolvableVariants = cva('unresolvable', { variants: makeAxes() });

export type InlineDefaultsProps = VariantProps<typeof inlineDefaultsVariants>;

export function InlineDefaults({ tone, variant }: InlineDefaultsProps) {
  return <span className={inlineDefaultsVariants({ tone, variant })} />;
}

export type SharedDefaultsProps = VariantProps<typeof sharedDefaultsVariants>;

export function SharedDefaults({ tone, variant }: SharedDefaultsProps) {
  return <span className={sharedDefaultsVariants({ tone, variant })} />;
}

export type UnresolvableProps = VariantProps<typeof unresolvableVariants>;

export function Unresolvable({ tone }: UnresolvableProps) {
  return <span className={unresolvableVariants({ tone })} />;
}
