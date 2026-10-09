import type { DataGridItem } from '../../../data-grid-types';
import { useTableService } from '../table-context';
import type { ExtraColumnPosition } from '../table-types';
import { DataGridExtraHeaderCell } from './data-grid-extra-header-cell';

interface DataGridExtraHeaderColumnsProps {
  position: ExtraColumnPosition;
  isGroupRow?: boolean;
  className?: string;
}

export function DataGridExtraHeaderColumns<TItem extends DataGridItem>({
  position,
  isGroupRow,
  className,
}: DataGridExtraHeaderColumnsProps) {
  const tableService = useTableService<TItem>();
  const hasGroups = tableService.useHasGroups();
  const extraColumns = tableService.useExtraColumns(position);

  // When groups exist, extra columns should only render on the group row
  const shouldRender = !hasGroups || isGroupRow;

  return (
    <>
      {extraColumns.map((extra) => (
        <DataGridExtraHeaderCell<TItem>
          key={extra.id}
          column={extra}
          rowspan={shouldRender && hasGroups ? 2 : undefined}
          className={className}
        >
          {shouldRender && extra.header ? <extra.header /> : null}
        </DataGridExtraHeaderCell>
      ))}
    </>
  );
}
