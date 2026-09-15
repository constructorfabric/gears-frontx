# @gears-frontx/routing

FrontX's navigation library: one browser navigation history and one URL grammar shared by a
composed application and every independently bundled microfrontend it contains, plus a signal
naming which extension(s) own a given extension domain's entries. Framework-agnostic and
engine-agnostic by constraint — no dependency on any concrete router engine or UI framework; a
separately published engine-provider package binds this substrate to one.

Every extension domain, at any depth, is addressed through the same entry grammar. The model task
(ADR-0003 example 7.1) reads in the address bar as one line:

```
/en?screen=dashboard;orientation=left&sheet=tenant-details;tenantId=456
   &sheet=user-contacts;contactId=123;view=active&widgets=line-a;range=7d
   &widgets=line-b;range=30d&widgets=pie;metric=revenue
```

See `architecture/` for the requirements (PRD), structure and constraints (DESIGN), the decisions
behind the grammar (ADR), and the behavior each FEATURE specifies.

## Domain keys and extension tokens: what you supply

A **domain key** names one addressable location in the URL, and an **extension token** names one
occupant registered at that location — both are values *you* declare and hand to this package, not
values it invents or looks up for you:

- Both must satisfy this package's own lexical rule: lowercase letters, digits, and hyphens, always
  starting with a letter. This package validates that rule at the point you declare a value and
  rejects a bad one immediately, rather than letting it reach the URL and fail later.
- This package never reads another package's manifest, registry, or configuration. It has no
  built-in notion of a "microfrontend" or a "registration" of its own — those are concepts your own
  application defines. Everything this package resolves against (which extensions exist for a
  domain, which one owns a given entry) comes from a plain list of tokens you construct and pass in
  yourself, never from a source this package goes and reads on its own.
- In a composed deployment — a host assembling several independently built microfrontends — the
  extension token for a given occupant typically comes from that microfrontend's own registration:
  whatever identity it already uses to describe its own route, normalized into a value that
  satisfies the lexical rule above. Deriving that value correctly, and keeping it unique among the
  other occupants of the same domain, is your own responsibility; this package only validates and
  routes on the value once you give it one.

## License

Apache-2.0. `LICENSE` and `NOTICE` ship inside the package.
