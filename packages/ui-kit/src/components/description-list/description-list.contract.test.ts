// Conformance for the four contracts of the description-list family:
// DescriptionList with its Item, Term and Details parts. The shared
// freshness suite covers each; see button.contract.test.ts for the fuller
// harness shape.
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

for (const stem of [
  'description-list',
  'description-list-item',
  'description-list-term',
  'description-list-details',
]) {
  assertContractFreshness('description-list', stem);
}
