// @cpt-dod:cpt-frontx-dod-api-communication-base-service:p1

// @cpt-begin:cpt-frontx-dod-api-communication-base-service:p1:inst-reset-accounts-mock-state
export function createResetAccountsMockState<TMockUser>(
  createDefaultAccountsMockUser: () => TMockUser,
  replaceCurrentAccountsMockUser: (nextUser: TMockUser) => void,
): () => void {
  return (): void => {
    replaceCurrentAccountsMockUser(createDefaultAccountsMockUser());
  };
}
// @cpt-end:cpt-frontx-dod-api-communication-base-service:p1:inst-reset-accounts-mock-state
