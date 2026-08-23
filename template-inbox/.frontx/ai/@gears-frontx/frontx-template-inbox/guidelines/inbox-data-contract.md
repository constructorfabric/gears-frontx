# Guideline: The Inbox App's Data

One service backs both screens: `src/api/`. A new screen reads from it. Do not
add a second service, and do not put content anywhere else.

```
src/api/
  InboxApiService.ts   BaseApiService + RestProtocol + RestEndpointProtocol + RestMockPlugin
  RestMockPlugin.ts    the app's own mock plugin, built on @gears-frontx/api primitives
  queries.ts           useApiQuery / useApiMutation over the endpoint descriptors
  registry.ts          registerApiServices() at boot, getInboxApi() everywhere else
  types.ts             the response contracts
  mocks.ts             the mock map, keys prefixed with the /api/inbox baseURL
  dataset.ts           the seeded content, imported by mocks.ts alone
```

## Reading from a component

```ts
const service = getInboxApi();
const contactsQuery = useApiQuery(service.getContacts);
```

`@gears-frontx/api` hands out endpoint *descriptors* - a stable key plus a
`fetch` - and leaves caching to the consumer. `queries.ts` is that consumer: two
hooks that dedupe by descriptor key, so the same endpoint read from two screens
and mounted twice by StrictMode makes one request. Swapping it for a server-
state library is a change to that one file; the screens only ever see
`useApiQuery` and `useApiMutation`.

## The mock plugin belongs to the app

`RestMockPlugin` is `src/api/RestMockPlugin.ts`, not an import from
`@gears-frontx/api`: the ecosystem package publishes the plugin primitives and
leaves the mock to whoever owns the project's data. Pointing the app at a real
backend is deleting the `registerPlugin` call in `InboxApiService` - the
endpoints, the types and every screen stay as they are.

## The endpoint surface

| Endpoint | Returns |
|---|---|
| `GET /api/inbox/me` | the agent identity: name, presence, workspace |
| `GET /api/inbox/channels` | all three channels with id, label, icon name, item count, open count |
| `GET /api/inbox/conversations` | every conversation across all channels |
| `GET /api/inbox/messages` | every message across every conversation |
| `GET /api/inbox/contacts` | all 29 contacts with their full detail payload |
| `POST /api/inbox/messages` | echoes a posted reply or note back with an id and a timestamp |

## Every read returns a whole collection, on purpose

`RestMockPlugin` calls a mock factory with the request body and nothing else.
A path pattern with `:id` matches, but the factory cannot tell which id it
matched, so a per-id endpoint could not answer correctly. Selection therefore
happens client-side, in the screen, over a collection it already holds - which
is also how the product behaves: its search filters live and its counters
recompute without a round trip.

A new screen follows the same rule. If it needs a slice nobody fetches today,
add a collection endpoint and select from it; do not add a parameterised one.

## Rules for content

- **No fixture files.** Mock data is application code registered per service
  through `RestMockPlugin`, which is what keeps swapping it for a real backend a
  one-line change rather than a build-time choice.
- **No content baked into markup.** A subject, a name, a snippet or a count in
  JSX is content that cannot be changed without editing a screen. It belongs in
  `dataset.ts`.
- **Dates are offsets, resolved at load.** `dataset.ts` measures every instant
  back from a load-time anchor, so a conversation still reads "1h" and "4d" on
  any run day. Relative and absolute strings are formatted at render from those
  instants by `shared/format.ts`. The one exception is a message's own
  timestamp, which is calendar text the transcript prints verbatim.
- **Derive what can be derived.** Initials, the email domain column, the
  qualification checklist, the filter counts and the activity timeline are all
  computed from the record. A stored copy would be a second thing to keep in
  step, and the one that drifts is the one on screen.
- **Suggested replies are content, not a model call.** A conversation's
  `suggestedReplies` are authored in `dataset.ts` alongside its transcript, so
  each chip reads as the next thing that thread's agent would say. An empty
  array is the way to say a thread gets none - every spam and every snoozed
  conversation carries one - and the chip row disappears rather than emptying.
- **Writes.** Posting a reply or a note is the only change the service
  persists. Everything the details panel moves - assignee, team inbox,
  priority, status, tags, spam - is applied over the fetched conversation in
  screen state, because a real backend would own those. Keep that split: adding
  a write endpoint means adding it to the service and its mock map, not
  pretending in a component.
