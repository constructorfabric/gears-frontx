// Conformance for Text: a single, standalone component export with no
// family, so the shared freshness suite is the whole check (see
// status-dot.contract.test.ts).
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

assertContractFreshness('text');
