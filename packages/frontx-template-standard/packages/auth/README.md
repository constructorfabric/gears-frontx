# @gears-frontx/auth

Headless authentication contract for Gears FrontX.

This package only defines types and the `AuthProvider` contract. It does not ship UI, routing, or network interception logic.

## AuthProvider

Minimal required surface:

- `getSession()`
- `checkAuth()`
- `logout()`

Optional surface:

- `login()`, `handleCallback()`, `refresh()`
- `getIdentity()`, `getPermissions()`, `canAccess()`

## Gears FrontX Integration

Use the framework `auth()` plugin to bind your `AuthProvider` into `@gears-frontx/api` REST requests (bearer tokens and cookie-session).

```ts
import { createGears FrontX } from '@gears-frontx/framework';
import { auth } from '@gears-frontx/framework';
import type { AuthProvider } from '@gears-frontx/auth';

const provider: AuthProvider = {
  async getSession() {
    return { kind: 'cookie' };
  },
  async checkAuth() {
    return { authenticated: true };
  },
  async logout() {
    return { type: 'none' };
  },
};

const app = createGears FrontX()
  .use(auth({ provider }))
  .build();
```

## Local Development (Using A Local Gears FrontX Checkout)

If you are testing changes made locally in the Gears FrontX monorepo, you can install the packages into a separate consumer app via `file:` dependencies.

1. Build packages in the Gears FrontX repo first (exports point to `dist/`):

```bash
cd /path/to/frontx
npm run build:packages:sdk
npm run build:packages:framework
```

2. Point your consumer app dependencies to the local folders:

```json
{
  "dependencies": {
    "@gears-frontx/auth": "file:/path/to/frontx/packages/auth",
    "@gears-frontx/api": "file:/path/to/frontx/packages/api",
    "@gears-frontx/framework": "file:/path/to/frontx/packages/framework"
  }
}
```

If you use pnpm, prefer `link:` for symlinks:

```json
{
  "dependencies": {
    "@gears-frontx/auth": "link:/path/to/frontx/packages/auth",
    "@gears-frontx/api": "link:/path/to/frontx/packages/api",
    "@gears-frontx/framework": "link:/path/to/frontx/packages/framework"
  }
}
```

Note: `@gears-frontx/api` expects `axios` as a peer dependency. Install it in your consumer app:

```bash
pnpm add axios
# or: npm i axios
```

## Manual Node.js Tests

This repo includes manual Node.js scripts for bearer attach, refresh+retry, and abort semantics:

- `scripts/manual-auth-tests/README.md`

Cookie-session is tested as a browser/manual scenario (recommended for UI apps).
