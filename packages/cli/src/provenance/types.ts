// @cpt-dod:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1

// @cpt-begin:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1:inst-accept-provenance-inputs
export interface ProvenanceRecord {
  templateIdentity: string;
  scaffoldedFromVersion: string;
  sourceSpec: string;
  /**
   * Canonical string encoding of the ownership boundary this template
   * occupied within the composed project (cpt-frontx-contract-project-
   * provenance). Current writers use lossless JSON for every resolved
   * boundary, including an empty owns-nothing boundary; `.` is retained only
   * as the legacy/omitted-field sentinel. Optional at the input boundary so
   * older callers that have not yet resolved a boundary can omit it.
   */
  occupiedOwnershipBoundary?: string;
}
// @cpt-end:cpt-frontx-dod-composed-provenance-provenance-at-scaffold:p1:inst-accept-provenance-inputs

// Injected write function for provenance — same shape as WriteFileFn for symmetry
export type ProvenanceWriteFn = (path: string, content: string) => Promise<void>;
