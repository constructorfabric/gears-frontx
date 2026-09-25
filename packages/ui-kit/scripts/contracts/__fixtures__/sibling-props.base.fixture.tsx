// Fixture for extract.test.ts: the props type a sibling kit component
// declares, imported by sibling-props.fixture.tsx the way a trigger reuses the
// kit button's props. Not a component file of its own for the test's purposes.
import type { ComponentProps } from 'react';

export interface ActionBaseProps extends ComponentProps<'button'> {
  loading?: boolean;
  icon?: string;
}

export function ActionBase({ loading, icon, ...props }: ActionBaseProps) {
  return <button aria-busy={loading} data-icon={icon} {...props} />;
}
