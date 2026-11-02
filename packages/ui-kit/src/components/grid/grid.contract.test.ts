import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

for (const stem of ['grid', 'grid-item']) assertContractFreshness('grid', stem);
