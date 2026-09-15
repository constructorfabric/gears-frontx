// Every version constant and GTS id/pattern the contract tooling builds,
// in one module. Before this file the same grammar was typed out five
// times by hand - three patterns in ui-component.meta.json, two copies in
// the conformance test - and they had already drifted from each other
// (the metamodel's own `$id` used one segment count, the test's local
// regex another). One module, one place to change a version.
//
// Nothing here reads a file or does I/O: it is pure string construction, so
// both compile.ts (which builds artifacts) and any test (which checks them)
// import the same values instead of each keeping its own copy.

// Fixed vendor.package prefix every kit-owned GTS type shares.
export const VENDOR_PACKAGE = 'frontx.uikit';

// The namespace slot of the component type and of every component instance.
// GTS spells a slot that carries nothing `_` (the spec's own rule for a
// namespace that is not applicable), and inside `uikit` there is no category
// above `component`: a word there would either restate the package or name a
// position in a hierarchy rather than a thing. The spec's own canonical
// well-known instance uses the same spelling on the instance side
// (`gts.x.core.events.topic.v1~x.commerce._.orders.v1.0`), which is why both
// slots here are `_` rather than only the first.
const EMPTY_NAMESPACE = '_';

// The contract major a component carries when its overlay states none - the
// number a compatibility check requires a component to move when its props
// schema stops being backward compatible with what shipped before.
//
// A DEFAULT, not a kit-wide setting, and that distinction is the whole point
// of the constant's name. It used to be read directly by every call site, so
// the one escape hatch the compatibility gate offers - "move the major and
// the narrowing is accepted" - could only be taken by rewriting the
// identifier of every contract, every instance and every reference in the
// kit at once. A gate whose escape hatch costs that much is a gate people
// route around. The major now comes from the component's own overlay
// (`major:`), threaded through the id builders below, so moving one
// component's major moves that component's own identifiers plus every
// reference to it - a reference carries the target's major - rather than
// every identifier in the kit.
export const DEFAULT_CONTRACT_MAJOR = 1;

// Semver of the overlay vocabulary itself (the fields an author may write),
// independent of any component's contract major - typical_uses/dont_use_when
// gaining a new required shape is a metamodel version bump; Button's props
// changing is a contract major bump. A document's `metamodel` field is
// validated as a const equal to this, so a contract compiled against a
// stale metamodel fails loudly instead of silently degrading.
export const METAMODEL_VERSION = '1.0.0';

// GTS type id of ui-component.meta.json, the component type. A CONCRETE
// type: every kit component is a well-known INSTANCE of it, carrying the
// component's whole meaning as ordinary property values, and the type is
// what a validator checks that meaning against. Its own major (v1) is the
// grammar of the type - a different axis from METAMODEL_VERSION above, which
// versions the field vocabulary a contract is compiled against.
//
// Two spellings, because GTS uses two: the URI form is what a JSON Schema
// `$id`/`$ref` has to carry, the bare form is what an id-VALUED field
// holds. gts-ts parses only the bare form (isValidGtsID rejects the URI
// prefix outright), so every reference value - a `dont_use_when`
// recommendation, an accepted component, an instance's own `gts_type` - is
// spelled bare, and only schema keywords carry `gts://`.
export const COMPONENT_TYPE_ID_BARE = `gts.${VENDOR_PACKAGE}.${EMPTY_NAMESPACE}.component.v1~`;
export const COMPONENT_TYPE_ID = `gts://${COMPONENT_TYPE_ID_BARE}`;

// Strips the `gts://` prefix off an id that carries it. One helper rather
// than the four hand-rolled copies this repeated across check.ts,
// testing.ts and each component's own contract test.
export function bareGtsId(id: string): string {
  return id.replace(/^gts:\/\//, '');
}

// Contract major of the overlay vocabulary - the small GTS types the
// meaning block is built out of (one per concept: dont_use_when_rule,
// accepted_content, attestation, family_membership, ...). Versioned on its
// own axis: a component's props changing is that component's contract major,
// the vocabulary of a `don't` rule changing is this.
export const VOCABULARY_MAJOR = 1;

// GTS type id of one vocabulary type, from its snake_case token
// (`dont_use_when_rule` -> gts://gts.frontx.uikit.vocabulary.dont_use_when_rule.v1~).
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-vocabulary-type
export function vocabularyTypeId(token: string): string {
  return `gts://gts.${VENDOR_PACKAGE}.vocabulary.${token}.v${VOCABULARY_MAJOR}~`;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-vocabulary-type

// The x-gts-ref target every component reference declares: any instance of
// the component type. Written as a trailing-`*` prefix pattern, the one
// wildcard shape gts-ts implements (XGtsRefValidator's validateGtsPattern
// matches by prefix) and the same shape the ecosystem's own schemas use
// (packages/gts-plugin's `gts.frontx.mfes.ext.domain.v1~*`). A component IS
// an instance of that type, so a reference to a component resolves to one.
export const COMPONENT_REF_TARGET = `${COMPONENT_TYPE_ID_BARE}*`;

// The token a host element contributes to its surface type's id and file
// name. GTS tokens are snake_case and kit element kinds are HTML tag names,
// so a hyphenated custom element (`<my-custom-element>`) is the one shape
// that needs normalizing - without it the element namespace would be the
// single place a hyphen leaked into an id grammar that is snake_case
// everywhere else.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-element
export function domElementToken(elementKind: string): string {
  return `dom_${elementKind.replace(/-/g, '_')}`;
}

// GTS type id of a host element's surface - one id per HOST ELEMENT, shared
// by every component that renders that element. Independently versioned from
// any component's contract. A function, not a constant, because the id has to
// be parameterized the same way the hand-written file name is.
//
// Two spellings for the same reason the component type has two: the bare form
// is what an id-VALUED field holds - a contract names its host element's
// surface as a value, so the value is bare - and the URI form is what the
// surface file's own `$id` carries.
export function elementTypeRef(elementToken: string): string {
  return `gts.${VENDOR_PACKAGE}.element.${elementToken}.v1~`;
}

export function elementTypeId(elementToken: string): string {
  return `gts://${elementTypeRef(elementToken)}`;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-element

// The x-gts-ref target a host-element reference declares: any type in the
// element namespace. Written as a trailing-`*` prefix pattern for the same
// reason COMPONENT_REF_TARGET is - the one wildcard shape gts-ts implements.
export const ELEMENT_REF_TARGET = `gts.${VENDOR_PACKAGE}.element.*`;

// GTS tokens are snake_case; kit directories are kebab-case
// (navigation-menu -> navigation_menu).
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-token
export function gtsToken(component: string): string {
  return component.replace(/-/g, '_');
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-token

// What a reference to a component holds, and what the component's own
// document is identified by: the component type, then the component's own
// instance segment - without the trailing `~` a TYPE id carries but an
// INSTANCE id does not. There is no second identifier for "the component":
// the document that says everything about it IS the instance, and its props
// surface is a part of that document rather than a thing to point at.
// @cpt-algo:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2
// @cpt-dod:cpt-frontx-ui-kit-dod-component-contracts-identifiers:p2
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-instance
export function componentRef(component: string, major: number): string {
  return `${COMPONENT_TYPE_ID_BARE}${componentInstanceSegment(gtsToken(component), major)}`;
}

function componentInstanceSegment(token: string, major: number): string {
  return `${VENDOR_PACKAGE}.${EMPTY_NAMESPACE}.${token}.v${major}`;
}

// The text an overlay would have to carry to name this component at ANY
// major - the whole reference up to the version number. Exported rather than
// re-derived at each call site because it is read by a check that cannot ask
// the question structurally (an overlay that will not parse, see
// deriveMountPoints) and by the test that covers that check: a needle each
// of them spelled by hand drifted silently the moment the grammar moved, and
// a needle a test rebuilds from the same expression it asserts on cannot
// catch the drift either. Carries the full prefix, so it matches a component
// instance and nothing else - the component TYPE's own id is not one of its
// prefixes.
export function componentRefPrefix(component: string): string {
  return `${COMPONENT_TYPE_ID_BARE}${VENDOR_PACKAGE}.${EMPTY_NAMESPACE}.${gtsToken(component)}.v`;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-instance

// GTS type id of the props surface a component's document carries - a
// STANDALONE type with no parent: there is nothing above a component's props
// for it to derive from, and the chain that used to be there said only that
// a near-empty anchor existed. `props` is a real category rather than a
// position in a hierarchy: not every type here is a props surface.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-props-schema
export function propsTypeRef(component: string, major: number): string {
  return `gts.${VENDOR_PACKAGE}.props.${gtsToken(component)}.v${major}~`;
}

// The same id in the URI form a JSON Schema `$id` has to carry.
export function propsSchemaId(component: string, major: number): string {
  return `gts://${propsTypeRef(component, major)}`;
}

// The props type id belonging to a component reference, by grammar alone -
// what the lift stamps onto a props surface read out of a document, where
// the component name and major are already in the document's own identifier
// and nothing else has to be passed alongside it.
export function propsSchemaIdFor(ref: string): string {
  const match = componentRefParts.exec(bareGtsId(ref));
  if (match === null) {
    throw new Error(`propsSchemaIdFor: "${ref}" is not a component reference, so it names no props type`);
  }
  return `gts://gts.${VENDOR_PACKAGE}.props.${match[1]}.v${match[2]}~`;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-props-schema

// Escapes every character special in a RegExp source, so a literal id
// (which itself is full of dots) can be dropped into a pattern string
// without its dots matching "any character".
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns

// The segment shared by every place a component reference is spelled: the
// vendor.package prefix, the empty namespace slot, the snake_case name, a
// version. The id patterns below all chain onto this rather than restating it.
// `captureName` wraps the name token in a capture group - the conformance
// test needs the matched name back (to turn a dont_use_when recommendation
// into a directory it can check exists); the component type's own pattern
// fields do not, so they get the non-capturing default.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns
function componentSegmentPattern(captureName = false): string {
  const name = captureName ? '([a-z_][a-z0-9_]*)' : '[a-z_][a-z0-9_]*';
  return `${escapeRegExp(VENDOR_PACKAGE)}\\.${EMPTY_NAMESPACE}\\.${name}\\.v\\d+`;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns

// Grammar of a component reference - a dont_use_when recommendation's
// component, an accepted component, a family member, a mount point's
// container, and a component document's own `$id`, which are all the same
// thing (componentRef above) and therefore the same pattern. Carried next to
// `x-gts-ref` rather than replaced by it: gts-ts strips x-gts-ref before
// validating (GtsStore.normalizeSchema), so the pattern is what actually
// rejects a malformed id.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns
export function componentRefPattern(captureName = false): string {
  return `^${escapeRegExp(COMPONENT_TYPE_ID_BARE)}${componentSegmentPattern(captureName)}$`;
}

// The same grammar with the name AND the major captured, for the one reader
// that needs both (propsSchemaIdFor above).
const componentRefParts = new RegExp(
  `^${escapeRegExp(COMPONENT_TYPE_ID_BARE)}${escapeRegExp(VENDOR_PACKAGE)}\\.${EMPTY_NAMESPACE}\\.([a-z_][a-z0-9_]*)\\.v(\\d+)$`,
);

// Grammar of a vocabulary type id (vocabularyTypeId above).
export function vocabularyTypeIdPattern(): string {
  return `^gts://gts\\.${escapeRegExp(VENDOR_PACKAGE)}\\.vocabulary\\.[a-z_][a-z0-9_]*\\.v\\d+~$`;
}

// Grammar of a host-element surface type id (elementTypeId above): the
// vendor package, `element`, an element token, a version. The token has no
// fixed shape of its own to reuse - it is `dom_<tag>` for whatever tags the
// kit renders - but every GTS token is snake_case, so the grammar is the same
// `[a-z_][a-z0-9_]*` charset every component name already uses.
// Existed only as a hand-checked equality
// (`surfaceSchema.$id === ELEMENT_TYPE_ID`) in each component's own
// test until now - a hyphenated tag (`<my-custom-element>` before
// domElementToken normalizes it) would pass that equality check just as
// easily as it would fail this pattern, which is the whole point of asserting
// the grammar directly instead.
//
// Two patterns off one grammar, matching the two spellings above: the bare one
// is what a host-element reference VALUE is checked against, the URI one what
// a surface file's own `$id` is.
// `captureToken` wraps the element token in a capture group, the way
// componentSegmentPattern does for a component name: reading the token back out
// of a reference is how a surface FILE is located, and the token is that file's
// own name, so nothing has to reverse domElementToken.
function elementGrammar(captureToken = false): string {
  const token = captureToken ? '([a-z_][a-z0-9_]*)' : '[a-z_][a-z0-9_]*';
  return `gts\\.${escapeRegExp(VENDOR_PACKAGE)}\\.element\\.${token}\\.v\\d+~`;
}

export function elementTypeRefPattern(): string {
  return `^${elementGrammar()}$`;
}

export function elementTypeIdPattern(): string {
  return `^gts://${elementGrammar()}$`;
}

// The element token a host-element reference carries, or undefined when the
// string is not one. Accepts either spelling - a reference VALUE is bare, a
// schema `$id` carries `gts://` - because both name the same type.
export function elementRefToken(id: string): string | undefined {
  const match = new RegExp(`^${elementGrammar(true)}$`).exec(bareGtsId(id));
  return match?.[1];
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-identifiers:p2:inst-id-patterns
