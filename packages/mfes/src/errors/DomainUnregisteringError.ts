import { MfeError } from './MfeError';

/**
 * Thrown by `registerExtension` when the named domain is in the middle of
 * `unregisterDomain` — closed to new registrations from the start of its
 * teardown so a registration racing the final drain pass can never be
 * admitted against a domain state that is then removed
 * (`cpt-frontx-algo-mfe-registry-domain-unregister-closes-admission`
 * `inst-algo-du-reject-registration`).
 */
export class DomainUnregisteringError extends MfeError {
  constructor(
    public readonly domainId: string,
    public readonly extensionId: string
  ) {
    super(
      `Cannot register extension '${extensionId}': domain '${domainId}' is being unregistered.`,
      'DOMAIN_UNREGISTERING_ERROR'
    );
    this.name = 'DomainUnregisteringError';
  }
}
