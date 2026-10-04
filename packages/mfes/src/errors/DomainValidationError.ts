import { MfeError } from './MfeError';

export class DomainValidationError extends MfeError {
  constructor(
    public readonly domainId: string,
    public readonly cause?: Error
  ) {
    const detail = cause?.message ?? 'validation failed';
    super(`Domain validation failed for '${domainId}': ${detail}`, 'DOMAIN_VALIDATION_ERROR');
    this.name = 'DomainValidationError';
  }
}
