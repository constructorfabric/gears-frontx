import { MfeError } from './MfeError';

export class ExtensionTypeError extends MfeError {
  constructor(
    public readonly extensionTypeId: string,
    public readonly requiredBaseTypeId: string
  ) {
    super(
      `Extension type '${extensionTypeId}' does not derive from required base type '${requiredBaseTypeId}'`,
      'EXTENSION_TYPE_ERROR'
    );
    this.name = 'ExtensionTypeError';
  }
}
