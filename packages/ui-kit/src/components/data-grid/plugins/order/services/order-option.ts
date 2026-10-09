import type { DataGridOrderOption } from '../order-types';

export function createDataGridOrderOption(config: DataGridOrderOption): DataGridOrderOption {
  return {
    id: config.id,
    label: config.label,
    type: config.type,
  };
}
