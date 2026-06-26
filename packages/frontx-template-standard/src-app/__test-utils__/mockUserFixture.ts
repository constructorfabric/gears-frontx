// @cpt-dod:cpt-frontx-dod-api-communication-base-service:p1

// @cpt-begin:cpt-frontx-dod-api-communication-base-service:p1:inst-mock-user-fixture
type MockUserFixture<TRole extends string> = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: TRole;
  language: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  extra: {
    department: string;
  };
};

export const createMockUserFixture = <TRole extends string>(
  adminRole: TRole,
): MockUserFixture<TRole> => ({
  id: 'mock-user-001',
  email: 'demo@frontx.dev',
  firstName: 'Demo',
  lastName: 'User',
  role: adminRole,
  language: 'en',
  avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
  createdAt: new Date('2024-01-01T00:00:00Z').toISOString(),
  updatedAt: new Date('2024-12-01T00:00:00Z').toISOString(),
  extra: {
    department: 'Engineering',
  },
});
// @cpt-end:cpt-frontx-dod-api-communication-base-service:p1:inst-mock-user-fixture
