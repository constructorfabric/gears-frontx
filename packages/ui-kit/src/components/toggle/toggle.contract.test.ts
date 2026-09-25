// Conformance: the compiled contract may never disagree with the code.
//
// applyContractTestTimeout/assertContractFreshness (see button.contract.test.ts
// for the fuller pattern) are the shared minimum every described directory
// carries; Toggle is a single, standalone component with no family and no
// mount point of its own to assert beyond what the shared suite already
// checks kit-wide.
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

// Freshness: the committed toggle.contract.json must equal a fresh compile.
assertContractFreshness('toggle');
