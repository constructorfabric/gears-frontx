import { createContext, useContext } from 'react';
import type { DataGridMessages, DataGridMessagesOverride } from '../../messages';
import { messages } from '../../messages';

/*
 * The strings the grid renders, as context: `DataGrid` provides what its `messages` prop merged
 * over the English defaults, and the components read that instead of importing `messages`
 * directly, so one prop reaches every string. The context falls back to the defaults itself, so a
 * component the grid does not wrap (the standalone Tree) renders the kit's own strings.
 */
const DataGridMessagesContext = createContext<DataGridMessages>(messages);

export const DataGridMessagesProvider = DataGridMessagesContext.Provider;

export function useDataGridMessages(): DataGridMessages {
  return useContext(DataGridMessagesContext);
}

/*
 * Merges the prop over the defaults into a new object, group by group: an entry the prop omits
 * keeps its default, and a function entry replaces the default function whole. The defaults are
 * shared by every grid on the page, so they are never mutated.
 */
export function resolveDataGridMessages(
  override: DataGridMessagesOverride | undefined,
): DataGridMessages {
  if (override === undefined) {
    return messages;
  }

  return mergeGroup(messages, override) as DataGridMessages;
}

function mergeGroup(base: object, override: object): object {
  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const defaultValue = (base as Record<string, unknown>)[key];
    const bothPlainObjects =
      value !== null &&
      typeof value === 'object' &&
      defaultValue !== null &&
      typeof defaultValue === 'object';

    merged[key] = bothPlainObjects ? mergeGroup(defaultValue, value) : value;
  }

  return merged;
}
