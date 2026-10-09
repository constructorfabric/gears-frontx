import { useDataGridContext } from '../../core/data-grid-context';
import styles from './data-grid-layout-top-default.module.css';

export function DataGridLayoutTopDefault() {
  const context = useDataGridContext();

  const topStartLayoutSlots = context.layout.useLayoutStore((state) =>
    state.slots.get('top-start'),
  );
  const topEndLayoutSlots = context.layout.useLayoutStore((state) => state.slots.get('top-end'));

  const hasTopStartSlots = (topStartLayoutSlots?.length ?? 0) > 0;
  const hasTopEndSlots = (topEndLayoutSlots?.length ?? 0) > 0;

  if (!hasTopStartSlots && !hasTopEndSlots) return null;

  return (
    <div className={styles.dataGridTopDefault}>
      {hasTopStartSlots && (
        <div className={styles.topStartSlots}>
          {topStartLayoutSlots?.map((slot) => (
            <div key={slot.id} className={styles.topStartSlot}>
              <slot.component />
            </div>
          ))}
        </div>
      )}
      {hasTopEndSlots && (
        <div className={styles.topEndSlots}>
          {topEndLayoutSlots?.map((slot) => (
            <div key={slot.id} className={styles.topEndSlot}>
              <slot.component />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
