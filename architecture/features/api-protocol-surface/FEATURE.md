# Feature: API Protocol Surface


<!-- toc -->

- [1. Feature Context](#1-feature-context)
  - [1.1 Overview](#11-overview)
  - [1.2 Purpose](#12-purpose)
  - [1.3 Actors](#13-actors)
  - [1.4 References](#14-references)
- [2. Actor Flows (CDSL)](#2-actor-flows-cdsl)
  - [Consumer Service-Call Through ApiProtocol](#consumer-service-call-through-apiprotocol)
- [3. Processes / Business Logic (CDSL)](#3-processes--business-logic-cdsl)
  - [Protocol-Separated Request Dispatch and Plugin Short-Circuit](#protocol-separated-request-dispatch-and-plugin-short-circuit)
  - [Realm-Shared Retainer-Counted Fetch Cache](#realm-shared-retainer-counted-fetch-cache)
- [4. States (CDSL)](#4-states-cdsl)
  - [Fetch-Cache Entry State Machine](#fetch-cache-entry-state-machine)
- [5. Definitions of Done](#5-definitions-of-done)
  - [Protocol-Separated Request/Response and Streaming Dispatch](#protocol-separated-requestresponse-and-streaming-dispatch)
  - [Realm-Shared Retainer-Counted Fetch Cache](#realm-shared-retainer-counted-fetch-cache-1)
- [6. Acceptance Criteria](#6-acceptance-criteria)

<!-- /toc -->

- [ ] `p1` - **ID**: `cpt-frontx-featstatus-api-protocol-surface`
## 1. Feature Context

- [ ] `p2` - `cpt-frontx-feature-api-protocol-surface`

### 1.1 Overview

The API Protocol Surface provides the `@cyberfabric/api` package — a protocol-separated, solution-agnostic surface that exposes request/response and streaming communication behind a common abstract `ApiProtocol`, a generic plugin short-circuit mechanism, and a realm-shared retainer-counted fetch cache that lets independently bundled units reuse in-flight and cached results. This surface sits intentionally **below** interface altitude per DESIGN §3.3; it maps to no PRD §7.1 public interface, covers **no PRD `fr`**, and declares **no `interface` ID**.

### 1.2 Purpose

The API Protocol Surface exists to serve composed applications and their microfrontends with protocol-separated, dependency-light request and stream primitives that any consumer can extend through a uniform plugin contract, while sharing in-flight and completed fetch results across independently bundled units running in the same realm — reducing duplicate network work in support of runtime performance targets.

**Requirements**: `cpt-frontx-nfr-runtime-performance`

### 1.3 Actors

No actor — this surface is consumer-invoked and sits below interface altitude (DESIGN §3.3). No actor-facing journey; §2 models the consumer service-call interaction.

### 1.4 References

- **PRD**: [PRD.md](../../PRD.md)
- **Design**: [DESIGN.md](../../DESIGN.md)
- **Dependencies**: None

## 2. Actor Flows (CDSL)

No PRD usecase — this flow describes the consumer-issued service-call interaction (request/response + streaming branch) through `ApiProtocol`, not an actor-facing journey.

### Consumer Service-Call Through ApiProtocol

- [ ] `p1` - **ID**: `cpt-frontx-flow-api-protocol-surface-service-call`

**Success Scenarios**:
- Consumer issues a request/response call through a protocol instance and receives the response data.
- Consumer opens an SSE stream through the streaming protocol and receives events until completion.
- A plugin short-circuits the request chain and the consumer receives the plugin-supplied response without a transport call.

**Error Scenarios**:
- The transport call fails; a plugin in the error chain recovers with a response context or propagates the error.
- The consumer's AbortSignal fires; the cancellation error bypasses the error plugin chain and is returned directly.

**Steps**:
1. [ ] - `p1` - Consumer obtains a protocol instance (request/response or streaming) configured for the service endpoint - `inst-obtain-protocol`
2. [ ] - `p1` - Consumer invokes the protocol with the endpoint descriptor and any request options (including optional AbortSignal) - `inst-invoke-protocol`
3. [ ] - `p1` - **IF** the consumer uses a request/response call - `inst-branch-rr`
   1. [ ] - `p1` - Protocol builds the initial request context from the service base URL, method, URL, headers, body, credentials, and AbortSignal - `inst-build-rr-ctx`
   2. [ ] - `p1` - Protocol collects the ordered plugin list: global plugins from the protocol plugin registry followed by instance plugins - `inst-collect-plugins-rr`
   3. [ ] - `p1` - Protocol executes the plugin request chain in FIFO order, passing the current request context to each plugin's onRequest hook - `inst-run-request-plugins`
   4. [ ] - `p1` - **IF** a plugin returns a value carrying the `shortCircuit` discriminant - `inst-check-short-circuit`
      1. [ ] - `p1` - Protocol exits the request plugin loop and records the short-circuit response - `inst-exit-sc`
      2. [ ] - `p1` - Protocol executes the plugin response chain in LIFO order on the short-circuit response - `inst-sc-response-plugins`
      3. [ ] - `p1` - **RETURN** the short-circuit data to the consumer - `inst-return-sc`
   5. [ ] - `p1` - **ELSE** Protocol forwards the processed request context to the transport layer for the outbound HTTP call - `inst-transport-call`
   6. [ ] - `p1` - Transport returns the response; protocol wraps it in a response context carrying status, headers, and data - `inst-wrap-response`
   7. [ ] - `p1` - Protocol executes the plugin response chain in LIFO order on the response context - `inst-run-response-plugins`
   8. [ ] - `p1` - **RETURN** the processed response data to the consumer - `inst-return-rr`
4. [ ] - `p1` - **ELSE IF** the consumer uses a streaming call - `inst-branch-sse`
   1. [ ] - `p1` - Protocol builds the SSE connection context from the service base URL and stream endpoint - `inst-build-sse-ctx`
   2. [ ] - `p1` - Protocol collects the SSE plugin list and executes the plugin connection chain in FIFO order - `inst-run-sse-plugins`
   3. [ ] - `p1` - **IF** a plugin returns a short-circuit value carrying an EventSource-like object - `inst-sse-short-circuit`
      1. [ ] - `p1` - Protocol uses the plugin-provided EventSource instead of opening a real connection - `inst-use-mock-es`
   4. [ ] - `p1` - **ELSE** Protocol opens a real EventSource connection to the full URL with the configured credentials - `inst-real-es`
   5. [ ] - `p1` - Protocol attaches event handlers (message, error, and done-completion) to the EventSource - `inst-attach-handlers`
   6. [ ] - `p1` - Consumer receives parsed events via the onEvent callback until the stream signals completion or the consumer calls disconnect - `inst-receive-events`
   7. [ ] - `p1` - **RETURN** the connection ID to the consumer for later disconnect - `inst-return-conn-id`

## 3. Processes / Business Logic (CDSL)

### Protocol-Separated Request Dispatch and Plugin Short-Circuit

- [ ] `p2` - **ID**: `cpt-frontx-algo-api-protocol-surface-protocol-dispatch`

**Input**: Request method, URL, body, and options (AbortSignal, query params, credentials override); ordered plugin list for the selected protocol.

**Output**: Response data delivered to the consumer, or an error after plugin error-chain processing.

**Steps**:
1. [ ] - `p1` - Collect the ordered plugin list: global plugins (from the global protocol plugin registry, filtered by excluded classes) followed by per-instance plugins - `inst-collect-plugins`
2. [ ] - `p1` - Build the initial request context: merge service base headers with any retry headers, concatenate base URL with the relative URL, and attach the AbortSignal - `inst-build-context`
3. [ ] - `p1` - **FOR EACH** plugin in FIFO order - `inst-foreach-plugin`
   1. [ ] - `p1` - Invoke the plugin's onRequest hook if present, passing the current request context - `inst-invoke-onrequest`
   2. [ ] - `p1` - **IF** the plugin return value carries the `shortCircuit` discriminant (detected by the type guard) - `inst-detect-sc`
      1. [ ] - `p1` - Exit the request plugin loop; record the short-circuit response for use in the next step - `inst-exit-sc`
   3. [ ] - `p1` - **ELSE** replace the current request context with the plugin-returned context and continue the loop - `inst-update-ctx`
4. [ ] - `p1` - **IF** a short-circuit response was recorded - `inst-have-sc`
   1. [ ] - `p1` - Execute the response plugin chain in LIFO order on the short-circuit response and **RETURN** the final data - `inst-sc-response-chain`
5. [ ] - `p1` - **ELSE** forward the processed request context to the transport layer (the peer-dependency transport) for the outbound call - `inst-forward-transport`
6. [ ] - `p1` - **TRY** - `inst-try-transport`
   1. [ ] - `p1` - Execute the transport call, passing the processed headers, body, params, credentials, and AbortSignal - `inst-transport`
   2. [ ] - `p1` - Wrap the transport response in a response context carrying status, headers, and data - `inst-wrap`
   3. [ ] - `p1` - Execute the response plugin chain in LIFO order and **RETURN** the final response data - `inst-response-chain`
7. [ ] - `p1` - **CATCH** transport or plugin error - `inst-catch-err`
   1. [ ] - `p1` - **IF** the error is a cancellation (the transport reports abort/cancel) - `inst-check-cancel`
      1. [ ] - `p1` - Re-throw the cancellation error without entering the error plugin chain — cancellations are not retryable - `inst-rethrow-cancel`
   2. [ ] - `p1` - **ELSE** build an error context carrying the error, the original request, any available response context, the current retry depth, and a retry function - `inst-build-error-ctx`
   3. [ ] - `p1` - Execute the error plugin chain in LIFO order, passing the error context to each plugin's onError hook - `inst-error-chain`
   4. [ ] - `p1` - **IF** a plugin returns a response context (error recovery) - `inst-error-recovery`
      1. [ ] - `p1` - Execute the response plugin chain on the recovered response and **RETURN** the result - `inst-recovered-response`
   5. [ ] - `p1` - **ELSE** propagate the final error to the consumer - `inst-propagate-err`

### Realm-Shared Retainer-Counted Fetch Cache

- [ ] `p2` - **ID**: `cpt-frontx-algo-api-protocol-surface-shared-cache`

**Input**: Endpoint descriptor (carrying an auto-derived cache key built from base URL, method, and path), request options (AbortSignal, params, staleTime override); the realm global.

**Output**: Response data — served from a CACHED hit, joined to an IN_FLIGHT dedup, or obtained from a new fetch and retained in the cache.

**Steps**:
1. [ ] - `p1` - Inspect the realm global for the well-known symbol `SHARED_FETCH_CACHE_SYMBOL` via peek (does not create or retain) - `inst-peek-cache`
2. [ ] - `p1` - **IF** no cache instance is present on the realm global - `inst-no-cache`
   1. [ ] - `p1` - Execute the request through the protocol directly without shared-cache routing - `inst-direct-fetch`
   2. [ ] - `p1` - **RETURN** the result to the consumer - `inst-direct-return`
3. [ ] - `p1` - **ELSE** derive the preparation key: scope the key to this protocol instance by combining the instance scope ID with the raw URL, initial headers, and params - `inst-derive-prep-key`
4. [ ] - `p1` - Resolve the prepared request through the cache using the preparation key: if already cached or in-flight, reuse the result; otherwise run the plugin request chain and store the outcome - `inst-prepare-via-cache`
5. [ ] - `p1` - Derive the shared cache key from the processed request context: method, full URL (with base URL), resolved headers, params, body, and credentials flag - `inst-derive-shared-key`
6. [ ] - `p1` - Call getOrFetch on the cache with the shared key - `inst-getorfetch`
7. [ ] - `p1` - **IF** the cache contains a fresh CACHED entry for the key (resolvedAt + staleTime is in the future) - `inst-cache-hit`
   1. [ ] - `p1` - **RETURN** the cached data to the consumer without issuing a transport call - `inst-return-cached`
8. [ ] - `p1` - **IF** an IN_FLIGHT entry exists for the same key - `inst-in-flight`
   1. [ ] - `p1` - Attach the consumer to the shared promise by incrementing the activeConsumers counter - `inst-increment-consumers`
   2. [ ] - `p1` - Register the consumer's AbortSignal; **IF** the signal fires, decrement activeConsumers and, **IF** no consumers remain, abort the shared fetch controller - `inst-signal-abort`
   3. [ ] - `p1` - **RETURN** the shared promise result when it resolves - `inst-return-in-flight`
9. [ ] - `p1` - **ELSE** (IDLE) create a new IN_FLIGHT cache entry with a dedicated AbortController; invoke the fetcher (which honours any short-circuit response from the plugin chain) - `inst-start-fetch`
10. [ ] - `p1` - **IF** the fetch resolves successfully and staleTime is greater than zero - `inst-check-staletime`
    1. [ ] - `p1` - Store the resolved data in the entry, record resolvedAt, and transition the entry to CACHED - `inst-store-cached`
11. [ ] - `p1` - **ELSE IF** staleTime is zero - `inst-staletime-zero`
    1. [ ] - `p1` - Remove the entry from the cache immediately after resolution - `inst-remove-after-resolve`
12. [ ] - `p1` - Execute the response plugin chain on the resolved response context and **RETURN** the final data to the consumer - `inst-post-fetch-response-chain`

## 4. States (CDSL)

### Fetch-Cache Entry State Machine

- [ ] `p2` - **ID**: `cpt-frontx-state-api-protocol-surface-fetch-cache-entry`

**States**: IDLE, IN_FLIGHT, CACHED, SHORT_CIRCUITED, RELEASED

**Initial State**: IDLE

**Transitions**:
1. [ ] - `p1` - **FROM** IDLE **TO** IN_FLIGHT **WHEN** a consumer calls getOrFetch for a key with no fresh cache entry and a new cache entry is created with pending set to true - `inst-t-idle-inflight`
2. [ ] - `p1` - **FROM** IN_FLIGHT **TO** CACHED **WHEN** the fetcher resolves successfully and staleTime is greater than zero; data and resolvedAt are recorded and pending is cleared - `inst-t-inflight-cached`
3. [ ] - `p1` - **FROM** IN_FLIGHT **TO** SHORT_CIRCUITED **WHEN** the plugin request chain returns a short-circuit response; the response is stored as the resolved data in the entry - `inst-t-inflight-sc`
4. [ ] - `p1` - **FROM** IN_FLIGHT **TO** IDLE **WHEN** the fetch fails, is invalidated, or staleTime is zero causing the entry to be removed on resolution - `inst-t-inflight-idle`
5. [ ] - `p1` - **FROM** CACHED **TO** IDLE **WHEN** the freshness window elapses (resolvedAt + staleTime ≤ now on next lookup) or an explicit invalidation is applied to the key - `inst-t-cached-idle`
6. [ ] - `p1` - **FROM** SHORT_CIRCUITED **TO** IDLE **WHEN** the entry is invalidated or its freshness window elapses - `inst-t-sc-idle`
7. [ ] - `p1` - **FROM** CACHED **TO** RELEASED **WHEN** the retainer count on the realm global decrements to zero (the last holder calls releaseSharedFetchCache), causing the entire cache to be torn down - `inst-t-cached-released`
8. [ ] - `p1` - **FROM** IN_FLIGHT **TO** RELEASED **WHEN** the retainer count reaches zero while a fetch is still pending; the in-flight AbortController fires and the cache is reset - `inst-t-inflight-released`

## 5. Definitions of Done

### Protocol-Separated Request/Response and Streaming Dispatch

- [ ] `p1` - **ID**: `cpt-frontx-dod-api-protocol-surface-protocol-dispatch`

The system **MUST** implement `ApiProtocol` as an abstract base parameterized by a protocol-specific plugin hook type, with concrete request/response and streaming subclasses that execute independent plugin chains — FIFO for requests, LIFO for responses and errors — where any plugin returning a short-circuit response exits the request chain and bypasses the transport call, and where all solution-specific behavior is supplied exclusively through the generic plugin extension point so the surface ships no application-specific content of its own.

**Implements**:
- `cpt-frontx-flow-api-protocol-surface-service-call`
- `cpt-frontx-algo-api-protocol-surface-protocol-dispatch`

**Constraints**: `cpt-frontx-constraint-api-no-solution-content`

**Touches**:
- Entities: `ApiService`
- Component: `cpt-frontx-component-api-surface`

### Realm-Shared Retainer-Counted Fetch Cache

- [ ] `p1` - **ID**: `cpt-frontx-dod-api-protocol-surface-shared-cache`

The system **MUST** implement a shared fetch cache stored on the realm global via the well-known symbol `SHARED_FETCH_CACHE_SYMBOL`, keyed by auto-derived request identity, that deduplicates concurrent consumers of the same key by attaching them to a single in-flight promise, remains completely bypassed when no retainer is held, and is reclaimable by retainer counting — releasing and clearing all state when the retainer count reaches zero — so that independently bundled units in one realm share in-flight and completed fetches without imposing a runtime library dependency.

**Implements**:
- `cpt-frontx-algo-api-protocol-surface-shared-cache`
- `cpt-frontx-state-api-protocol-surface-fetch-cache-entry`

**Constraints**: `cpt-frontx-constraint-api-no-solution-content`

**Touches**:
- Entities: `ApiService`
- Component: `cpt-frontx-component-api-surface`
- NFR: `cpt-frontx-nfr-runtime-performance`

## 6. Acceptance Criteria

- [ ] `ApiProtocol` abstract base exists parameterized by a protocol-specific plugin hook type, with `RestProtocol` (request/response) and `SseProtocol` (streaming) as concrete subclasses each implementing independent plugin chains.
- [ ] Plugin chains execute FIFO for request hooks and LIFO for response and error hooks; a plugin returning a short-circuit value exits the request chain and the transport call is not made.
- [ ] The short-circuit contract is a discriminated value carrying `shortCircuit`; type guards detect REST and SSE short-circuits correctly; SSE short-circuit supplies a mock EventSource-like object.
- [ ] The realm-shared fetch cache is reached exclusively through the well-known global symbol; separately bundled instances in one realm converge on one cache instance.
- [ ] Concurrent consumers of the same cache key share a single in-flight fetch; when all consumers abort and no retainer holds the cache, the shared fetch is cancelled.
- [ ] `retainSharedFetchCache` increments the retainer count and returns the cache; `releaseSharedFetchCache` decrements the count and tears down the cache when it reaches zero.
- [ ] Cache keys are auto-derived from the processed request identity (method, URL, headers, params, body, credentials); no call site defines a cache key manually.
- [ ] No solution-specific content — concrete endpoints, auth wiring, or application-specific plugins — appears anywhere in `@cyberfabric/api`; the surface ships no application-specific plugin of its own.
- [ ] The transport is declared as a peer dependency; the package carries no runtime `dependencies` on data-fetching or state-management libraries.
