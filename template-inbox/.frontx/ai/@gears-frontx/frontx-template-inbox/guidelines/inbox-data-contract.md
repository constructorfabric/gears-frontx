# Guideline: The Inbox App's Data

`src/api/` holds the app's data, and nothing else does. One service per
domain: `InboxApiService` backs the chat screen and the contacts directory,
which share one dataset (a contact is a conversation's contact, a thread
header and a table row at once); `MailApiService` backs the mail screen with
its own, unrelated dataset; `DashboardApiService` backs the dashboard with a
third, unrelated dataset of its own (it still reads `InboxApiService.getContacts`
directly for row 4's activity table, rather than duplicating contact identities
- see below). A new screen reads from whichever service already owns its
domain - only add a new sibling service when the domain genuinely does not
overlap with any of the three, the way mail did not overlap with chat and
contacts. Do not put content anywhere else.

```
src/api/
  InboxApiService.ts      BaseApiService + RestProtocol + RestEndpointProtocol + RestMockPlugin
  MailApiService.ts       the mail domain's sibling service, same primitives, its own baseURL
  DashboardApiService.ts  the dashboard domain's sibling service, same primitives, one endpoint
  RestMockPlugin.ts       the app's own mock plugin, built on @gears-frontx/api primitives - shared by every service
  queries.ts               useApiQuery / useApiMutation over the endpoint descriptors - shared by every service
  registry.ts               registerApiServices() at boot, getInboxApi() / getMailApi() / getDashboardApi() everywhere else
  types.ts                  the inbox/contacts response contracts
  mailTypes.ts               the mail response contracts
  dashboardTypes.ts          the dashboard response contract
  mocks.ts                   the inbox/contacts mock map, keys prefixed with the /api/inbox baseURL
  mailMocks.ts                the mail mock map, keys prefixed with the /api/mail baseURL
  dashboardMocks.ts           the dashboard mock map, keys prefixed with the /api/dashboard baseURL
  dataset.ts                   the inbox/contacts seeded content, imported by mocks.ts alone
  mailDataset.ts                the mail seeded content, imported by mailMocks.ts alone
  dashboardDataset.ts           the dashboard seeded content, imported by dashboardMocks.ts alone
```

## Reading from a component

```ts
const service = getInboxApi();
const contactsQuery = useApiQuery(service.getContacts);
```

The mail screen reads the same way, off its own service:

```ts
const service = getMailApi();
const mailsQuery = useApiQuery(service.getMails);
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
leaves the mock to whoever owns the project's data. It is shared, not
per-service: both `InboxApiService` and `MailApiService` construct their own
instance of it over their own mock map. Pointing either service at a real
backend is deleting its own `registerPlugin` call - the endpoints, the types
and every screen stay as they are.

## The endpoint surface

| Endpoint | Returns |
|---|---|
| `GET /api/inbox/me` | the agent identity: name, presence, workspace |
| `GET /api/inbox/channels` | all three channels with id, label, icon name, item count, open count |
| `GET /api/inbox/conversations` | every conversation across all channels |
| `GET /api/inbox/messages` | every message across every conversation |
| `GET /api/inbox/contacts` | all 29 contacts with their full detail payload |
| `POST /api/inbox/messages` | echoes a posted reply or note back with an id and a timestamp |

`MailApiService` answers the mail screen the same read-only-collections way,
off its own baseURL:

| Endpoint | Returns |
|---|---|
| `GET /api/mail/mailboxes` | the five mailboxes (Inbox, Drafts, Sent, Archive, Trash - no Spam) with id and label |
| `GET /api/mail/mails` | every mail across every mailbox |
| `GET /api/mail/messages` | every earlier message behind a mail's "N earlier messages" toggle |

Sending a reply in the mail screen has no endpoint: it clears the composer's
draft rather than posting anywhere, by design (see `inbox-scope-inventory`).
Adding a real send is adding a `POST /api/mail/...` mutation to
`MailApiService` and its mock map, the same way `postMessage` was added to
`InboxApiService`.

`DashboardApiService` answers the dashboard with a single collection rather
than one endpoint per section, because the dashboard is one coherent view, not
a set of independently-browsable lists the way mailboxes/mails/messages are:

| Endpoint | Returns |
|---|---|
| `GET /api/dashboard/overview` | KPI cards, the resolved-per-day series, the new-contacts series, the summary trend, workload metrics, the top-agents ranking and the recent-activity rows, all together |

Splitting this into several endpoints is the right move only once some part of
the dashboard genuinely needs to load or refresh independently of the rest -
see `InboxApiService`'s own doc comment for the same call made the other way.

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
- **A mail's history is a separate collection, like a conversation's
  messages.** `Mail.body` is the newest message only, and `mailDataset.ts`'s
  `mailMessages` holds only the earlier ones, oldest first, keyed by `mailId`.
  Most mails have none, which is what keeps the reading pane's history toggle
  off their pane entirely - the same "empty is meaningful" rule
  `suggestedReplies` follows above.
