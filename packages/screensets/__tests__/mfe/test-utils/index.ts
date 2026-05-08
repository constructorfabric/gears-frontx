/**
 * Test Utilities Barrel — re-exports from `__test-utils__/` so tests can
 * import from the local relative path without crossing into `__test-utils__`.
 */

export { MockDomainFactory } from '../../../__test-utils__/mock-domain-factory';
export {
  setupBlobUrlLoaderMocks,
  createRemoteEntrySource,
  createExposeChunkSource,
  createChunkWithRelativeImport,
  TEST_BASE_URL,
} from '../../../__test-utils__/mock-blob-url-loader';
