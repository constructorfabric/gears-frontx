// Fixture for extract.test.ts: a component whose props type is a sibling kit
// file's. `loading` and `icon` are declared in sibling-props.base.fixture.tsx,
// not here, and they are still this package's API: the kit wrote them, so
// they are filed with the component's own props rather than left unplaced.
import { ActionBase, type ActionBaseProps } from './sibling-props.base.fixture';

export interface TriggerProps extends ActionBaseProps {
  side?: 'start' | 'end';
}

export function Trigger({ side, ...props }: TriggerProps) {
  return <ActionBase data-side={side} {...props} />;
}
