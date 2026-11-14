import { VisuallyHidden } from '../../../../visually-hidden/public.js';
import { useDataGridMessages } from '../../../services/core/data-grid-messages-context';

// The column shows only toggles, so its header shows nothing either, but an unnamed column header
// leaves every toggle cell under a column a screen reader cannot announce.
export function DataGridRowDetailHeader() {
  const messages = useDataGridMessages();
  return <VisuallyHidden>{messages.rowDetail.column}</VisuallyHidden>;
}
