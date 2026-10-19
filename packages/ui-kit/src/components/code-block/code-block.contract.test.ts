// Conformance for the eight contracts of the code-block family: CodeBlock
// with its Header, Title, Actions, CopyButton, Content, Line and Footer
// parts. The shared freshness suite covers each (reference resolution,
// mount points, the untyped-prop pairing); see button.contract.test.ts for
// the fuller harness shape.
import { applyContractTestTimeout, assertContractFreshness } from '../../../scripts/contracts/testing';

applyContractTestTimeout();

for (const stem of [
  'code-block',
  'code-block-header',
  'code-block-title',
  'code-block-actions',
  'code-block-copy-button',
  'code-block-content',
  'code-block-line',
  'code-block-footer',
]) {
  assertContractFreshness('code-block', stem);
}
