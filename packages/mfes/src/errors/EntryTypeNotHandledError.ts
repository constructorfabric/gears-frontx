import { MfeError } from './MfeError';

export class EntryTypeNotHandledError extends MfeError {
  constructor(
    public readonly entryTypeId: string,
    public readonly registeredHandlerBaseTypeIds: string[]
  ) {
    const handlerList = registeredHandlerBaseTypeIds.length > 0
      ? registeredHandlerBaseTypeIds.join(', ')
      : '(none)';
    super(
      `No registered handler can handle entry type '${entryTypeId}'. ` +
      `Registered handler base type IDs: ${handlerList}`,
      'ENTRY_TYPE_NOT_HANDLED'
    );
    this.name = 'EntryTypeNotHandledError';
  }
}
