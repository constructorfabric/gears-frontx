# Manual Auth Tests (Node.js)

These scripts are for manual verification of FrontX `auth()` integration without any UI.

They run against a public test backend (DummyJSON) to validate:

- bearer token attachment via `Authorization: Bearer ...`
- refresh + retry on `401`
- request cancellation via `AbortSignal` (axios cancellation bypasses plugin `onError`)

Cookie-session is intentionally NOT covered here because Node.js fetch/axios do not manage browser cookies the same way.
Test cookie-session in a real browser against your own backend (see below).

## Run From This Repo

From the monorepo root:

```bash
npm run build:packages:sdk
npm run build:packages:framework

node scripts/manual-auth-tests/bearer-attach.mjs
node scripts/manual-auth-tests/refresh-retry.mjs
node scripts/manual-auth-tests/abort.mjs
```

## Cookie-Session (Browser/Manual)

1. Implement a backend with:
- `POST /login` -> sets `Set-Cookie: session=...` and returns `csrfToken` (if you enforce CSRF)
- `GET /protected` -> requires cookie (and optionally CSRF header)

2. In your app, configure auth plugin:

```ts
use(auth({
  provider,
  frontxApi: {
    allowedCookieOrigins: ['http://localhost:4010'],
    csrfHeaderName: 'x-csrf-token',
  },
}))
```

3. Ensure `provider.getSession()` returns `{ kind: 'cookie', csrfToken }`.

Expected: requests to the allowlisted origin are sent with `withCredentials: true` and include the CSRF header.

## Use In An External App With Local FrontX Changes

If you changed FrontX locally and want to test in a separate consumer app, you have two common options.

Note: `@gears-frontx/api` has a peer dependency on `axios`. Install it in your consumer app:

```bash
pnpm add axios
# or: npm i axios
```

### Option A: `file:` dependencies (recommended for local work)

1. Build the FrontX packages in the FrontX repo (because package exports point to `dist/`):

```bash
cd /path/to/frontx
npm run build:packages:sdk
npm run build:packages:framework
```

2. In your consumer app `package.json`, depend on the local package folders:

```json
{
  "dependencies": {
    "@gears-frontx/auth": "file:/path/to/frontx/packages/auth",
    "@gears-frontx/api": "file:/path/to/frontx/packages/api",
    "@gears-frontx/framework": "file:/path/to/frontx/packages/framework"
  }
}
```

3. Install:

```bash
cd /path/to/consumer-app
npm i
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

### Option B: `npm pack` tarballs

1. Build packages in FrontX repo.
2. Pack tarballs:

```bash
cd /path/to/frontx/packages/auth && npm pack
cd /path/to/frontx/packages/api && npm pack
cd /path/to/frontx/packages/framework && npm pack
```

3. Install the generated `*.tgz` files in your consumer app:

```bash
cd /path/to/consumer-app
npm i /path/to/frontx/packages/auth/gears-frontx-auth-*.tgz
npm i /path/to/frontx/packages/api/gears-frontx-api-*.tgz
npm i /path/to/frontx/packages/framework/gears-frontx-framework-*.tgz
```
