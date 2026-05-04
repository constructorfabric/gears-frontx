/**
 * Test Utilities Barrel
 *
 * Centralized exports for all test utilities.
 */

// @cpt-dod:cpt-frontx-dod-mfe-registry-handler-injection:p1

// @cpt-begin:cpt-frontx-dod-mfe-registry-handler-injection:p1:inst-screensets-test-utils-barrel
export { MockDomainFactory } from './mock-domain-factory';
export {
  setupBlobUrlLoaderMocks,
  createRemoteEntrySource,
  createMinifiedRemoteEntrySource,
  createExposeChunkSource,
  createChunkWithRelativeImport,
  TEST_BASE_URL,
} from './mock-blob-url-loader';
export { TestDoubleMfeHandler, makeMfeHandlerDouble } from './mfe-handler-test-double';
export { createMinimalMfeRegistryStub } from './minimal-screensets-registry-stub';
export {
  readFederationSharedScope,
  writeFederationSharedScope,
  clearFederationSharedScope,
} from './federation-shared-scope';
export { createMockTypeSystemPlugin } from './mock-type-system-plugin';
// @cpt-end:cpt-frontx-dod-mfe-registry-handler-injection:p1:inst-screensets-test-utils-barrel
