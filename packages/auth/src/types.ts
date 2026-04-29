// ---------------------------------------------------------------------------
// Session types
// ---------------------------------------------------------------------------

/** Bearer token session — Authorization header transport */
export interface BearerAuthSession {
  kind: 'bearer';
  /** Access token (required for bearer) */
  token: string;
  /** Refresh token (if applicable) */
  refreshToken?: string;
  /** Expiry as Unix ms */
  expiresAt?: number;
}

/** Cookie session — withCredentials transport */
export interface CookieAuthSession {
  kind: 'cookie';
  /** CSRF token (if server requires it) */
  csrfToken?: string;
  /** Expiry as Unix ms */
  expiresAt?: number;
}

/** Custom session — provider-defined, no standard transport */
export interface CustomAuthSession {
  kind: 'custom';
  /** Provider-specific data */
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Discriminated union of session types.
 * Narrow by `session.kind` to access kind-specific fields.
 */
export type AuthSession = BearerAuthSession | CookieAuthSession | CustomAuthSession;

// ---------------------------------------------------------------------------
// Context (carries cancellation signal into every provider call)
// ---------------------------------------------------------------------------

export interface AuthContext {
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

/** Scalar-keyed record attached to an access query. */
export type AccessRecord = Record<string, string | number | boolean | null>;

export interface AccessQuery<TRecord extends AccessRecord = AccessRecord> {
  action: string;
  resource: string;
  record?: TRecord;
}

export type AccessDecision = 'allow' | 'deny';

/** JSON-compatible primitives for provider-agnostic evaluation payload passthrough. */
export type AccessJsonPrimitive = string | number | boolean | null;

export interface AccessJsonObject {
  readonly [key: string]: AccessJsonValue;
}

export type AccessJsonArray = ReadonlyArray<AccessJsonValue>;

/** Recursive JSON-compatible value for extensible constraints/meta fields. */
export type AccessJsonValue =
  | AccessJsonPrimitive
  | AccessJsonArray
  | AccessJsonObject;

/** Common reason hints used by framework fallbacks and common providers. */
export type KnownAccessReason =
  | 'allowed'
  | 'denied'
  | 'unauthenticated'
  | 'policy_not_found'
  | 'transport_error'
  | 'timeout'
  | 'aborted'
  | 'unsupported'
  | 'malformed'
  | 'provider_error';

/** Provider-defined reason string (framework-known values + custom PDP reason codes). */
export type AccessReason = KnownAccessReason | (string & {});

/** Provider-defined constraint entry (typed passthrough object). */
export type AccessConstraint = Readonly<Record<string, AccessJsonValue>>;

/** Provider-defined evaluation metadata (typed passthrough object). */
export type AccessMeta = Readonly<Record<string, AccessJsonValue>>;

/** Full evaluation result. evaluateAccess() resolves to this; canAccess() maps to decision only. */
export interface AccessEvaluation {
  decision: AccessDecision;
  constraints?: ReadonlyArray<AccessConstraint>;
  reason?: AccessReason;
  meta?: AccessMeta;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface AuthLoginInput {
  /** e.g. 'password' | 'oauth' | 'saml' | 'magic-link' */
  type: string;
  payload: Record<string, string | number | boolean | null>;
}

export interface AuthCallbackInput {
  /** Raw query params or hash fragment from the redirect URI */
  params: Record<string, string>;
  /** CSRF / PKCE state token */
  state?: string;
}

// ---------------------------------------------------------------------------
// Results & transitions
// ---------------------------------------------------------------------------

export interface AuthCheckResult {
  authenticated: boolean;
  session?: AuthSession;
}

/** Redirect transition — requires redirectUrl */
export interface AuthTransitionRedirect {
  type: 'redirect';
  /** Plain URL / path — no router semantics */
  redirectUrl: string;
}

/** No-op transition — login/logout completed without navigation */
export interface AuthTransitionNone {
  type: 'none';
}

/**
 * Discriminated union of auth transition results.
 * Narrow by `transition.type` to access type-specific fields.
 */
export type AuthTransition = AuthTransitionRedirect | AuthTransitionNone;

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export interface AuthPermissions {
  roles?: string[];
  permissions?: string[];
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Subject identity derived from OIDC ID token / userinfo (UX hint only). */
export interface AuthIdentity {
  /** Subject identifier (sub claim). */
  sub: string;
  /**
   * Raw claims from ID token / userinfo endpoint.
   *
   * OIDC permits arrays (e.g. `groups: string[]`, `aud: string[]`) and nested
   * JSON objects (e.g. `address`). Carry the full `AccessJsonValue` union so
   * common provider shapes (Keycloak `realm_access.roles`, Auth0 `permissions`,
   * etc.) round-trip without adapter workarounds.
   */
  claims?: Readonly<Record<string, AccessJsonValue>>;
}

// ---------------------------------------------------------------------------
// Transport adapter (interfaces only — for future @cyberfabric/api binding)
// ---------------------------------------------------------------------------

export interface AuthTransportRequest {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface AuthTransportResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface AuthTransportAdapter {
  request(req: AuthTransportRequest): Promise<AuthTransportResponse>;
}

export interface AuthTransportErrorEvent {
  request: AuthTransportRequest;
  error: Error;
  status?: number;
}

// ---------------------------------------------------------------------------
// Capabilities (optional metadata)
// ---------------------------------------------------------------------------

/** Advisory capability hints declared by the provider (advisory only; runtime probes methods). */
export interface AuthCapabilities {
  canLogin?: boolean;
  canRefresh?: boolean;
  canLogout?: boolean;
  canCallback?: boolean;
  supportsPermissions?: boolean;
  supportsCanAccess?: boolean;
  supportsGetIdentity?: boolean;
  supportsCanAccessMany?: boolean;
  supportsEvaluateAccess?: boolean;
  supportsEvaluateMany?: boolean;
}

/** Resolved capability flags built by the framework at provider-attach time (method presence probe). */
export interface AuthCapabilitiesResolved {
  readonly hasGetIdentity: boolean;
  readonly hasGetPermissions: boolean;
  readonly hasCanAccess: boolean;
  readonly hasCanAccessMany: boolean;
  readonly hasEvaluateAccess: boolean;
  readonly hasEvaluateMany: boolean;
  readonly hasRefresh: boolean;
  readonly hasSubscribe: boolean;
}

// ---------------------------------------------------------------------------
// State subscription
// ---------------------------------------------------------------------------

export type AuthState = 'authenticated' | 'unauthenticated' | 'loading' | 'error';

export interface AuthStateEvent {
  state: AuthState;
  session?: AuthSession;
  error?: Error;
}

export type AuthStateListener = (event: AuthStateEvent) => void;
export type AuthUnsubscribe = () => void;

// ---------------------------------------------------------------------------
// AuthProvider contract
// ---------------------------------------------------------------------------

export interface AuthProvider {
  // --- Required ---
  getSession(ctx?: AuthContext): Promise<AuthSession | null>;
  checkAuth(ctx?: AuthContext): Promise<AuthCheckResult>;
  logout(ctx?: AuthContext): Promise<AuthTransition>;

  // --- Optional lifecycle ---
  login?(input: AuthLoginInput, ctx?: AuthContext): Promise<AuthTransition>;
  handleCallback?(input: AuthCallbackInput, ctx?: AuthContext): Promise<AuthTransition>;
  refresh?(ctx?: AuthContext): Promise<AuthSession | null>;
  destroy?(): void | Promise<void>;

  // --- Optional identity & permissions ---
  getIdentity?(ctx?: AuthContext): Promise<AuthIdentity | null>;
  getPermissions?(ctx?: AuthContext): Promise<AuthPermissions>;

  // --- Optional access control ---
  canAccess?<TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ): Promise<AccessDecision>;
  canAccessMany?(queries: ReadonlyArray<AccessQuery>, ctx?: AuthContext): Promise<ReadonlyArray<AccessDecision>>;
  evaluateAccess?<TRecord extends AccessRecord = AccessRecord>(
    query: AccessQuery<TRecord>,
    ctx?: AuthContext,
  ): Promise<AccessEvaluation>;
  evaluateMany?(queries: ReadonlyArray<AccessQuery>, ctx?: AuthContext): Promise<ReadonlyArray<AccessEvaluation>>;

  // --- Optional events ---
  onTransportError?(event: AuthTransportErrorEvent): void;
  subscribe?(listener: AuthStateListener): AuthUnsubscribe;

  // --- Optional metadata ---
  capabilities?: AuthCapabilities;
}
