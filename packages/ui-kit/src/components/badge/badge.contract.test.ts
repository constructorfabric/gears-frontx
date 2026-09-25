// Conformance for Badge: a single, standalone component export with no
// family, so the shared freshness suite (testing.ts's
// assertContractFreshness) is the whole check - it already covers reference
// resolution, the untyped-prop pairing, mount-point derivation and GTS
// identifier grammar. See button.contract.test.ts for the fuller,
// harness-level conformance shape this suite reuses rather than duplicates.
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

assertContractFreshness('badge');
