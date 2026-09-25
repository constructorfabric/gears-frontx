// Contract extraction: the machine-owned half of a component contract.
//
// Reads a component's .tsx through a real ts.Program + TypeChecker (the
// package's own tsconfig.src.json compiler options, so module resolution and
// JSX match the build) instead of pattern-matching syntax. Syntax matching
// missed whatever it did not anticipate - a `type Props = ...` alias instead
// of `interface Props`, a second exported component in the same file, a cva
// config in a sibling module - and missed it silently, which is a worse
// defect than a loud failure: `cannotExtract` exists so a fact the extractor
// could not read shows up in the compiled contract instead of vanishing.
//
// Every property the checker resolves on the component's first parameter is
// filed by WHERE ITS DECLARATION LIVES, into one of three sets:
//
//   - this package's own source                  -> ownProps
//   - a library the component wraps (a primitive
//     library's part, or a third-party library
//     whose component the kit re-exposes)       -> apiProps
//   - React's DOM attribute types               -> forwardedProps
//
// The middle set is the one that matters most to a reader. A prop declared in
// a Base UI part's own props type - Accordion root's `multiple`, Button's
// `render`/`nativeButton` - is not something the kit merely forwards to an
// element: it IS this component's API, wearing the primitive library's
// declaration site as an accident of how the kit wraps that primitive. Filing
// it as forwarded DOM surface is what buried nine accordion-root props in a
// 233-entry generated file nobody read. React's own DOM attributes really are
// forwarded surface, and they are the same surface for every component that
// renders the same host element, which is why they are declared once per
// element kind by hand (see compile.ts's loadElementSurface) instead of
// re-derived per component.
//
// This is what a text-only extractor structurally cannot see: `Omit<X,
// 'className'>` only removes `className` from X's shape, so every other field
// X declares - including ones the component's own source never mentions - is
// still part of the checker-resolved props type.
//
// A property declared in none of the three places is filed nowhere and named
// in `unclassifiedProps`: the compiler refuses such a component rather than
// guessing which side of the API/forwarded line the prop falls on (see the
// coupling note below).
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

export interface ExtractedProp {
  name: string;
  optional: boolean;
  // checker.typeToString with NoTruncation - the real resolved type, not a
  // guess from the source text (an alias, a generic, an imported type all
  // print in full instead of "unknown"), and with no module specifier in it
  // (see printTypeText).
  typeText: string;
  // What JSON Schema can state about that type, or undefined when it can
  // state nothing. Derived by the checker here rather than by matching the
  // printed text downstream: the text is what a reader sees, not what the
  // type is.
  //
  // Required, and allowed to be undefined, rather than optional: `typeText`
  // and this are two views of one type, and a prop built by hand with only
  // the first is a prop whose text and schema can disagree in silence.
  expressed: ExpressedType | undefined;
  // Where the checker found this property declared, normalized to a
  // node_modules-relative or kit-relative path - never an absolute
  // filesystem path, which would make a committed contract machine-specific.
  declarationFile: string;
  // The JSDoc @default tag's text, when the declaring symbol carries one -
  // Base UI annotates several forwarded props this way (nativeButton,
  // focusableWhenDisabled) and it is worth keeping next to the fact it
  // documents rather than discarding it at extraction time.
  jsDocDefault?: string;
  // Set only on a prop that some branches of a union props type declare and
  // others do not: the branches that declare it, by name. Absent for a prop
  // every branch declares, which is every prop of a props type that is not a
  // union. See propsOfEveryBranch.
  branches?: string[];
}

export type PropDefault = string | number | boolean | null;

export interface ComponentExtraction {
  // The exported identifier (PascalCase) - compileContract matches this
  // against the directory name in PascalCase to pick one extraction out of
  // a file that may export several components.
  name: string;
  axes: Record<string, string[]>;
  // The subset of `axes` whose variant map is keyed by `true`/`false`, which
  // class-variance-authority types as a boolean prop rather than as the
  // string union its keys look like. Named alongside `axes` rather than
  // encoded into the values, so the values stay what the cva config actually
  // wrote and the compiler decides how to express them.
  booleanAxes: string[];
  defaults: Record<string, string>;
  // The defaults the component writes for itself, in the destructured props
  // parameter of its own body (`{ variant = 'outline' }`), by prop name. They
  // are the value a caller who passes nothing actually gets, so where one
  // names a variant axis too it is the default the contract states, over the
  // variant declaration's. Literals only (string, number, boolean, null); a
  // computed default is noted in `cannotExtract` and left out.
  propDefaults: Record<string, PropDefault>;
  // Declared in this package's own source: the component's own file, or a
  // sibling kit file whose props type it reuses.
  ownProps: ExtractedProp[];
  // Declared by a library this component wraps - a primitive library's own
  // props type for the part, or a third-party component the kit re-exposes -
  // this component's API, reached through the wrapping rather than typed out
  // again in the kit's source. Compiled into the
  // contract's own `properties` next to ownProps, not into the forwarded
  // surface.
  apiProps: ExtractedProp[];
  // Declared in React's DOM attribute types: the surface every component
  // rendering the same host element forwards, declared once per element kind
  // by hand rather than re-derived here.
  forwardedProps: ExtractedProp[];
  // Declared somewhere none of the three above covers - a package no list in
  // classifyDeclarationSite names. Named rather than filed: which side of the
  // API/forwarded line such a prop belongs on is a question about that
  // library's conventions, and the compiler refuses the component instead of
  // guessing (see the module comment).
  unclassifiedProps: ExtractedProp[];
  // The host element this component renders (`button`, `div`, `table`, ...),
  // resolved through Omit/Pick and the element argument of
  // BaseUIComponentProps / ComponentProps / the render hook's props helper,
  // followed through a `typeof` component to that component's own props
  // type - undefined when the props type has no such anchor (a
  // from-scratch interface with no DOM/Base UI heritage, e.g. DataTable's).
  // It decides WHICH hand-written element surface the contract names,
  // so a component with forwarded DOM props and no resolvable element kind
  // is refused rather than compiled without them.
  elementKind?: string;
  // Whether the component is written with a body of the kit's own - a
  // function, an arrow or a function expression - rather than as an alias or
  // a re-export of a callable declared elsewhere. Not a reading of what the
  // body renders: a body may return null first, a fragment, a component or
  // one of two elements, and none of that says where its props go. Used only
  // to check an overlay's host-element statement, which a bodied component
  // answers with its own props type instead.
  hasBody: boolean;
  // Whether the props type admits names it does not list - a string index
  // signature, or a template-literal key such as `on${string}` - on any
  // branch. Such a type accepts a name no listed prop matches, so no pattern
  // family of the element surface can be closed for it.
  admitsUnlistedProps: boolean;
  // Human-readable labels for the VariantProps<typeof X> heritage this
  // component's own Props type declares - where its cva axes come from,
  // kept for readers of the compiled contract, not consumed by the compiler.
  // The non-variant heritage carries no label of its own: which element a
  // component forwards to is stated once, as the host-element surface the
  // contract names, and a second prose copy of it was one fact in two places.
  variantSourceLabels: string[];
  cannotExtract: string[];
}

// The JSON Schema a prop's type supports, as much of it as the type really
// carries. `items` is nested rather than flattened because an array's
// element type is a type in its own right and answers the same question
// recursively.
export interface ExpressedSchema {
  type?: string;
  enum?: string[];
  items?: ExpressedSchema;
}

export interface ExpressedType {
  // Never empty: a derivation with nothing to say returns undefined instead,
  // because `{}` in a props contract reads as "anything goes".
  schema: ExpressedSchema;
  // Whether the schema states the WHOLE type. False for an array whose
  // element shape JSON Schema cannot pin down (`ColumnDef<...>[]`): the
  // value is checkably an array, and everything else about it is checked by
  // tsc alone. What a partly-stated type still owes a reader is the prose
  // naming it - see compile.ts's describeUnexpressedType.
  complete: boolean;
}

const EXPRESSION_DEPTH_LIMIT = 6;

// Whether the type constrains nothing at all. `any` and `unknown` accept
// every value, so an array of them is fully stated by `type: "array"` with
// no `items` - the absence is the constraint, not a gap in it.
function constrainsNothing(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0;
}

// A type parameter stands for whatever the CALLER instantiates it with, so
// the only thing true of every instantiation is its constraint. Its default
// is not: `<Value = unknown>` binds nobody who writes `<Accordion<string>>`,
// and a schema derived from a default would reject values the component
// accepts.
//
// A parameter the caller already bound never reaches here - `Chosen` with no
// type argument is `string[]` by the time the checker hands it over, which
// is where instantiating a default belongs. What reaches here is a parameter
// still open at the component's own boundary, so whatever comes back is a
// bound on the type and never the whole of it.
function constraintOfTypeParameter(type: ts.Type, checker: ts.TypeChecker): ts.Type | undefined {
  if ((type.flags & ts.TypeFlags.TypeParameter) === 0) return undefined;
  const constraint = checker.getBaseConstraintOfType(type);
  // A parameter constrained by itself (`<T extends T>`) would recurse
  // forever; one with no constraint says nothing at all.
  return constraint === undefined || constraint === type ? undefined : constraint;
}

// The JSON Schema keyword for a type that maps onto exactly one, or
// undefined when none does. Object shapes are deliberately absent: a plain
// object with known keys IS expressible in principle, but the object types
// that reach a kit prop are React's and the primitive libraries' own
// (CSSProperties, ColumnDef), and inlining a foreign package's whole field
// list into a committed contract would make the artifact a copy of that
// package's internals rather than a statement about this component.
function jsonTypeOf(type: ts.Type): string | undefined {
  if (type.flags & (ts.TypeFlags.String | ts.TypeFlags.StringLiteral)) return 'string';
  if (type.flags & (ts.TypeFlags.Number | ts.TypeFlags.NumberLiteral)) return 'number';
  if (type.flags & (ts.TypeFlags.Boolean | ts.TypeFlags.BooleanLiteral)) return 'boolean';
  if (type.flags & ts.TypeFlags.Null) return 'null';
  return undefined;
}

// What JSON Schema can state about one checker-resolved type, derived from
// the type itself rather than from its printed name.
//
// The defect this replaced was a claim, not a gap: a prop whose printed type
// did not spell `boolean`, `string`, `number` or a literal union was
// annotated "Not expressible in JSON Schema", and the accordion root's
// `value`/`defaultValue` - `AccordionValue<Value>`, which is `Value[]` -
// were told to a reader that way. The name an alias prints under says
// nothing about whether a shape is expressible; only the resolved type does.
//
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-untyped-props:p1:inst-up-express
export function expressType(type: ts.Type, checker: ts.TypeChecker, depth = 0): ExpressedType | undefined {
  if (depth > EXPRESSION_DEPTH_LIMIT) return undefined;

  const constraint = constraintOfTypeParameter(type, checker);
  if (constraint) {
    const bound = expressType(constraint, checker, depth + 1);
    // A bound, never the whole type: the caller may pick something narrower.
    return bound === undefined ? undefined : { schema: bound.schema, complete: false };
  }

  if (type.isUnion()) return expressUnion(type, checker, depth);

  if (checker.isTupleType(type)) {
    // Checkably an array; its positional shape is not something this
    // compiler states, so the prose still names the full type.
    return { schema: { type: 'array' }, complete: false };
  }
  if (checker.isArrayType(type)) return expressArray(type as ts.TypeReference, checker, depth);

  const jsonType = jsonTypeOf(type);
  if (jsonType === undefined) return undefined;
  if (type.isStringLiteral()) return { schema: { type: 'string', enum: [type.value] }, complete: true };
  // A single boolean or number literal narrows further than its JSON type
  // does, so the type alone does not state the whole of it.
  const literal = (type.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.NumberLiteral)) !== 0;
  return { schema: { type: jsonType }, complete: !literal };
}

function expressArray(type: ts.TypeReference, checker: ts.TypeChecker, depth: number): ExpressedType {
  const element = checker.getTypeArguments(type)[0];
  if (element === undefined || constrainsNothing(element)) return { schema: { type: 'array' }, complete: true };
  const expressed = expressType(element, checker, depth + 1);
  // `items` is added only for an element the schema states in full: a
  // partial `items` would be a constraint on the element that the element
  // does not actually have.
  if (expressed?.complete !== true) return { schema: { type: 'array' }, complete: false };
  return { schema: { type: 'array', items: expressed.schema }, complete: true };
}

function expressUnion(type: ts.UnionType, checker: ts.TypeChecker, depth: number): ExpressedType | undefined {
  // Optionality is carried by the contract's `required` list, so a `|
  // undefined` member is not part of the shape a present value must have.
  const members = type.types.filter((member) => (member.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)) === 0);
  if (members.length === 0) return undefined;

  const jsonTypes = new Set<string>();
  const enumValues: string[] = [];
  let everyMemberIsAStringLiteral = true;
  let complete = true;

  for (const member of members) {
    const expressed = expressType(member, checker, depth + 1);
    if (expressed?.schema.type === undefined) {
      // A function, an object, an intersection - and with it the whole
      // union, because a `type` covering only the members that ARE
      // expressible would REJECT a value the unexpressible one allows.
      // `Record<string, any> | Array<any>` is not `type: "array"`.
      return undefined;
    }
    jsonTypes.add(expressed.schema.type);
    if (expressed.schema.enum !== undefined && expressed.schema.type === 'string') enumValues.push(...expressed.schema.enum);
    else everyMemberIsAStringLiteral = false;
    if (!expressed.complete) complete = false;
  }

  // One JSON type or nothing: a value that may be a string OR null needs
  // `type` as a list, a shape neither this compiler nor the compatibility
  // comparison beside it is written for, so such a union is left to prose.
  if (jsonTypes.size !== 1) return undefined;
  const [jsonType] = jsonTypes;
  if (everyMemberIsAStringLiteral && enumValues.length > 0) {
    // Sorted for the reason the prop lists are (see extractFromSource): the
    // checker hands a union's members over in the order of its internal type
    // ids, which follows what the program happened to bind first, so the
    // same union read in two programs came back in two orders and a
    // committed enum could move with no change behind it.
    return { schema: { type: 'string', enum: [...enumValues].sort() }, complete };
  }
  // `boolean` reaches here as the `false | true` union TypeScript models it
  // as; both members are literals, and together they are the whole type.
  const wholeBoolean = jsonType === 'boolean' && members.length === 2;
  return { schema: { type: jsonType }, complete: complete || wholeBoolean };
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-untyped-props:p1:inst-up-express

interface LiteralEntry {
  name: string;
  initializer: ts.Expression;
}

// Reads the literal (identifier- or string-keyed) members of an object
// literal; anything else - a spread, a computed key, a method - is not
// something a plain walk can attribute a value to, so it is named in
// `cannotExtract` instead of silently skipped.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function literalKeys(objLiteral: ts.ObjectLiteralExpression, where: string, cannotExtract: string[]): LiteralEntry[] {
  const keys: LiteralEntry[] = [];
  for (const prop of objLiteral.properties) {
    if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
      keys.push({ name: prop.name.text, initializer: prop.initializer });
    } else {
      cannotExtract.push(`${where}: non-literal member (${ts.SyntaxKind[prop.kind]})`);
    }
  }
  return keys;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

function lastEntityName(name: ts.EntityName): string {
  return ts.isQualifiedName(name) ? name.right.text : name.text;
}

function calleeName(expr: ts.LeftHandSideExpression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

// True for a call whose resolved callee really is class-variance-authority's
// `cva` export - checked by symbol identity (declaration file + real name),
// not by the text at the call site, so an aliased import
// (`import { cva as makeVariants }`) or a member call
// (`cvaNs.cva(...)`) resolve the same as a plain `cva(...)`.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function isCvaCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (!symbol) return false;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (resolved.getName() !== 'cva') return false;
  return (resolved.getDeclarations() ?? []).some((decl) =>
    /[\\/]class-variance-authority[\\/]/.test(decl.getSourceFile().fileName),
  );
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

// Follows an expression to the cva(...) call it ultimately names - straight
// through a `const x = cva(...)` variable, through re-exports, and through
// one variable pointing at another (`const buttonVariants = baseVariants;`).
// Bounded depth and a visited set turn a self-referential or cyclic alias
// into "not found" instead of a stack overflow.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function traceToCvaCall(
  expr: ts.Expression | undefined,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
  depth: number,
): ts.CallExpression | undefined {
  if (expr === undefined || depth > 8) return undefined;
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return traceToCvaCall(expr.expression, checker, visited, depth + 1);
  }
  if (ts.isCallExpression(expr)) {
    return isCvaCall(expr, checker) ? expr : undefined;
  }
  if (ts.isIdentifier(expr)) {
    const symbol = checker.getSymbolAtLocation(expr);
    return symbol ? traceSymbolToCvaCall(symbol, checker, visited, depth + 1) : undefined;
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function traceSymbolToCvaCall(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
  depth: number,
): ts.CallExpression | undefined {
  if (depth > 8) return undefined;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (visited.has(resolved)) return undefined;
  visited.add(resolved);
  for (const decl of resolved.getDeclarations() ?? []) {
    if (ts.isVariableDeclaration(decl) && decl.initializer) {
      const found = traceToCvaCall(decl.initializer, checker, visited, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

// Same identifier-following as traceToCvaCall, aimed at cva's own second
// argument: `cva(base, config)` where `config` is a variable instead of an
// inline object literal.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function traceToObjectLiteral(
  expr: ts.Expression | undefined,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
  depth: number,
): ts.ObjectLiteralExpression | undefined {
  if (expr === undefined || depth > 8) return undefined;
  if (ts.isObjectLiteralExpression(expr)) return expr;
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) {
    return traceToObjectLiteral(expr.expression, checker, visited, depth + 1);
  }
  if (ts.isIdentifier(expr)) {
    const symbol = checker.getSymbolAtLocation(expr);
    if (!symbol) return undefined;
    const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
    if (visited.has(resolved)) return undefined;
    visited.add(resolved);
    for (const decl of resolved.getDeclarations() ?? []) {
      if (ts.isVariableDeclaration(decl) && decl.initializer) {
        const found = traceToObjectLiteral(decl.initializer, checker, visited, depth + 1);
        if (found) return found;
      }
    }
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

// A cva axis whose variant map is keyed by `true`/`false` is a BOOLEAN
// variant: class-variance-authority indexes it by those two keys and
// `VariantProps` types the resulting prop as `boolean`, not as the string
// union the keys look like. Compiled as a string enum, the contract stated a
// prop that only accepts the strings "true" and "false" - a shape no caller
// can satisfy, since `fullWidth` takes a boolean.
//
// The whole rule is "every key is `true` or `false`, and there is at least
// one": either single-key form is common in real cva configs (a variant that
// only styles one branch), and cva resolves `StringToBoolean<'false'>` to
// `boolean` exactly as it resolves the `'true'` key, so a `false`-only map is
// a boolean prop for the same reason a `true`-only one is. Anything else is
// an ordinary string axis, including a map that merely happens to contain
// `true` alongside other keys.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis
export function isBooleanAxis(values: string[]): boolean {
  if (values.length === 0 || values.length > 2) return false;
  return values.every((value) => value === 'true' || value === 'false');
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis

// Resolves every `VariantProps<typeof X>` heritage entry found on a
// component's props type into the cva axes/defaults it names. A heritage
// entry that cannot be traced to a real cva(...) call - the defect F16
// documents, a cva moved to a sibling file or masked behind an alias the old
// syntax-only walk never saw - is recorded with a `cva:` prefix so
// compileContract can fail the build on it instead of shipping a contract
// that silently lost its variant axes.
function extractVariants(
  variantSources: ts.EntityName[],
  checker: ts.TypeChecker,
  cannotExtract: string[],
  axisFilters: ReadonlyMap<ts.EntityName, KeyFilter> = new Map(),
): { axes: Record<string, string[]>; booleanAxes: string[]; defaults: Record<string, string> } {
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
  const axes: Record<string, string[]> = {};
  const booleanAxes = new Set<string>();
  const defaults: Record<string, string> = {};
  // Which VariantProps<typeof X> heritage entry (by label) an axis/default
  // name first came from - N1: two heritage entries declaring the same axis
  // name is a real conflict, not "the later one wins"; recorded per-name so
  // the second occurrence names both sources instead of silently
  // overwriting the first one's values.
  const axisSourceLabel: Record<string, string> = {};
  const defaultSourceLabel: Record<string, string> = {};

  for (const entityName of variantSources) {
    const label = lastEntityName(entityName);
    const filter = axisFilters.get(entityName);
    const symbol = checker.getSymbolAtLocation(entityName);
    const call = symbol ? traceSymbolToCvaCall(symbol, checker, new Set(), 0) : undefined;
    if (!call) {
      cannotExtract.push(
        `cva: cannot resolve a cva(...) call for "${label}" (VariantProps<typeof ${label}> is declared, but no ` +
          `traceable cva call was found from its declaration - variant axes would be silently lost)`,
      );
      continue;
    }
    if (call.arguments.length < 2) {
      cannotExtract.push(`cva: "${label}"'s cva(...) call has fewer than 2 arguments`);
      continue;
    }
    const config = traceToObjectLiteral(call.arguments[1], checker, new Set(), 0);
    if (!config) {
      cannotExtract.push(`cva: "${label}"'s cva(...) second argument is not a resolvable object literal`);
      continue;
    }
    for (const { name, initializer: written } of literalKeys(config, 'cva config', cannotExtract)) {
      if (name !== 'variants' && name !== 'defaultVariants') continue;
      // Either block may be a shared const rather than an inline literal
      // (`variants: fillAxes`, one axis set for two cva calls), so it is
      // followed to its initializer the way the config itself is. One that
      // cannot be followed refuses the compile: read as absent, its axes or
      // its defaults vanish from the contract without a word.
      const initializer = traceToObjectLiteral(written, checker, new Set(), 0);
      if (initializer === undefined) {
        cannotExtract.push(`cva: "${label}"'s ${name} is not a resolvable object literal - it would be silently lost`);
        continue;
      }
      if (name === 'variants') {
        for (const axis of literalKeys(initializer, 'variants', cannotExtract)) {
          // Removed on the way here (Omit) or not kept (Pick): the component
          // does not take this axis from this declaration.
          if (!keyAllowed(filter, axis.name)) continue;
          if (!ts.isObjectLiteralExpression(axis.initializer)) {
            cannotExtract.push(`axis "${axis.name}": value map is not an object literal`);
            continue;
          }
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axis-conflict
          if (axis.name in axes) {
            // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axis-conflict-note
            cannotExtract.push(
              `cva: axis "${axis.name}" is declared by both "${axisSourceLabel[axis.name]}" and "${label}" - ` +
                `duplicate VariantProps heritage entries would otherwise silently overwrite one axis with the other`,
            );
            // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axis-conflict-note
            continue;
          }
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axis-conflict
          const values = literalKeys(axis.initializer, `axis "${axis.name}"`, cannotExtract).map((v) => v.name);
          axes[axis.name] = values;
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis
          if (isBooleanAxis(values)) booleanAxes.add(axis.name);
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis
          axisSourceLabel[axis.name] = label;
        }
      }
      if (name === 'defaultVariants') {
        for (const def of literalKeys(initializer, 'defaultVariants', cannotExtract)) {
          if (!keyAllowed(filter, def.name)) continue;
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis
          // A boolean axis's default is written as a boolean, not as the
          // string key it indexes the variant map by (`fullWidth: false`, not
          // `fullWidth: 'false'`), so the two literal kinds are read as one
          // default and the boolean is stored in the text form the axis's own
          // keys already use.
          const defaultText = ts.isStringLiteral(def.initializer)
            ? def.initializer.text
            : def.initializer.kind === ts.SyntaxKind.TrueKeyword
              ? 'true'
              : def.initializer.kind === ts.SyntaxKind.FalseKeyword
                ? 'false'
                : undefined;
          if (defaultText === undefined) {
            // Prefixed `cva:` so the compiler REFUSES the contract: a default
            // this walk cannot read is a default the contract would ship
            // without, and a variant whose documented default silently
            // vanished is the same class of silent loss as an axis that
            // vanished - which the same prefix already fails the build on.
            cannotExtract.push(
              `cva: default for "${def.name}" is neither a string nor a boolean literal - the axis's own default ` +
                `would be lost from the compiled contract`,
            );
            continue;
          }
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-boolean-axis
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-default-conflict
          if (def.name in defaults) {
            // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-default-conflict-note
            cannotExtract.push(
              `cva: default "${def.name}" is declared by both "${defaultSourceLabel[def.name]}" and "${label}" - ` +
                `duplicate VariantProps heritage entries would otherwise silently overwrite one default with the other`,
            );
            // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-default-conflict-note
            continue;
          }
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-default-conflict
          defaults[def.name] = defaultText;
          defaultSourceLabel[def.name] = label;
        }
      }
    }
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes

  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
  return { axes, booleanAxes: [...booleanAxes].sort(), defaults };
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
}

interface PropsTypeWalkResult {
  kind: string | undefined;
  variantSources: ts.EntityName[];
  // The keys an Omit or a Pick on the path to a variant source removed or
  // kept, for the sources reached through one. An axis the path removes is
  // not an axis of this component.
  axisFilters: Map<ts.EntityName, KeyFilter>;
  // Threaded alongside kind/variantSources rather than returned separately:
  // a heritage node this walk cannot classify (a mapped type, a conditional
  // type, a generic wrapper resolving to neither an interface nor a type alias)
  // is exactly as much a fact as a resolved kind or variant source, and
  // belongs on the same result so extractComponent merges it into the
  // component's cannotExtract list the same way.
  cannotExtract: string[];
}

// The prop names an Omit removes or a Pick keeps on the way down a props
// type, accumulated: Omit adds to what is removed, Pick narrows what is kept.
interface KeyFilter {
  readonly omitted: ReadonlySet<string>;
  readonly picked?: ReadonlySet<string>;
  // A helper on the path whose key set this walk could not list (a type
  // parameter): what it removes or keeps is unknown, so no axis below
  // it can be told apart from one it removed. The text of that key argument.
  readonly unreadable?: string;
  // Union branches reaching one declaration through different filters: a
  // key is kept when any of them keeps it.
  readonly anyOf?: readonly KeyFilter[];
}

const NO_KEY_FILTER: KeyFilter = { omitted: new Set() };

function narrowFilter(filter: KeyFilter, kind: 'omit' | 'pick', keys: readonly string[]): KeyFilter {
  if (kind === 'omit') return { ...filter, omitted: new Set([...filter.omitted, ...keys]) };
  const picked = filter.picked === undefined ? new Set(keys) : new Set(keys.filter((key) => filter.picked!.has(key)));
  return { ...filter, picked };
}

// A filter's content as text, to tell two filters apart whatever order
// their keys were added in.
function filterKey(filter: KeyFilter): string {
  return JSON.stringify([
    [...filter.omitted].sort(),
    filter.picked === undefined ? null : [...filter.picked].sort(),
    filter.unreadable ?? null,
    filter.anyOf === undefined ? null : filter.anyOf.map(filterKey).sort(),
  ]);
}

// The filters of several union branches reaching one variant declaration,
// merged so a key is kept exactly when some branch keeps it: a caller may
// pass the props of any branch, so an axis one branch keeps is an axis of
// the union. The result does not depend on the branches' order.
function mergeBranchFilters(filters: readonly KeyFilter[]): KeyFilter {
  const distinct = [...new Map(filters.map((one) => [filterKey(one), one])).entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, one]) => one);
  if (distinct.length === 1) return distinct[0];
  if (distinct.some((one) => one === NO_KEY_FILTER || filterKey(one) === filterKey(NO_KEY_FILTER))) return NO_KEY_FILTER;
  return { omitted: new Set(), anyOf: distinct };
}

function unreadableFilter(filter: KeyFilter, keyText: string): KeyFilter {
  return { ...filter, unreadable: filter.unreadable ?? keyText };
}

function keyAllowed(filter: KeyFilter | undefined, key: string): boolean {
  if (filter === undefined) return true;
  if (filter.omitted.has(key) || (filter.picked !== undefined && !filter.picked.has(key))) return false;
  return filter.anyOf === undefined || filter.anyOf.some((one) => keyAllowed(one, key));
}

// The same keys read off an instantiated helper's key argument: a string
// literal type or a union of them.
function literalKeysOfType(type: ts.Type): string[] | undefined {
  // `never` (`Omit<X, never>`, `keyof {}`) names no key: it removes nothing.
  if (type.flags & ts.TypeFlags.Never) return [];
  const members = type.isUnion() ? type.types : [type];
  const keys: string[] = [];
  for (const member of members) {
    if (!member.isStringLiteral()) return undefined;
    keys.push(member.value);
  }
  return keys;
}

// The keys a helper's key argument names, where it names them as string
// literals (`'size'`, `'size' | 'type'`); undefined for any other node, whose
// keys the caller then asks the checker for.
function literalKeysOf(node: ts.TypeNode): string[] | undefined {
  const members = ts.isUnionTypeNode(node) ? node.types : [node];
  const keys: string[] = [];
  for (const member of members) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) return undefined;
    keys.push(member.literal.text);
  }
  return keys;
}

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function typeRefParts(
  node: ts.TypeNode,
): { name: string; args: readonly ts.TypeNode[] | undefined; location: ts.Node } | undefined {
  if (ts.isTypeReferenceNode(node)) {
    return { name: lastEntityName(node.typeName), args: node.typeArguments, location: node.typeName };
  }
  if (ts.isExpressionWithTypeArguments(node)) {
    const name = calleeName(node.expression);
    if (name === undefined) return undefined;
    return { name, args: node.typeArguments, location: node.expression };
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// The heritage shapes walkPropsType/resolveTopLevelMembers special-case, one
// per kind below and each recognised under every name it answers to (Omit
// and Pick; ComponentProps and ComponentPropsWithRef; the render hook's
// `useRender.ComponentProps` and the `UseRenderComponentProps` it aliases),
// resolved by what they actually declare (isCvaCall's own technique,
// generalized to every heritage shape rather than just cva()): the
// checker-resolved symbol's real name and the file that declares it, never
// the identifier text at the use site. An `import { ComponentProps as CP }
// from 'react'` reads the same as the unaliased form; a locally-declared
// type that merely happens to be NAMED `Omit` or `ComponentProps` reads as
// neither, and falls through to the generic named-reference unwrap below
// instead of being silently (mis)treated as React's or TypeScript's own
// utility type - exactly the M1 defect (F-class silent loss reintroduced
// through import aliasing, not file relocation).
type HeritageShape =
  | { readonly kind: 'omit-pick'; readonly helper: 'Omit' | 'Pick' }
  | { readonly kind: 'variant-props' }
  | { readonly kind: 'component-props' }
  | { readonly kind: 'base-ui-component-props' }
  // The props helper of the primitive library's render hook - the kit's own
  // polymorphism mechanism. It is `ComponentPropsWithRef<ElementType>` plus
  // the `render` prop, so its first type argument is the host element the
  // same way the other two element helpers' is. Recognised here rather than
  // unwrapped: unwrapped, the walk reaches `ComponentPropsWithRef` holding
  // the helper's own unbound `ElementType`, and the tag the kit wrote at the
  // use site is gone. The second primitive library's helper has the same
  // shape and reads the same way.
  | { readonly kind: 'use-render-component-props' }
  // React's own attribute interfaces (`HTMLAttributes<HTMLDivElement>`,
  // `ButtonHTMLAttributes<HTMLButtonElement>`) and `DetailedHTMLProps<A, E>`,
  // which is how a third-party library the kit wraps names the element its
  // component renders: by DOM interface rather than by tag. `argument` is
  // which type argument carries the interface.
  | { readonly kind: 'dom-attributes'; readonly argument: number };

// The shapes whose first type argument names the host element as a tag.
function namesHostElement(shape: HeritageShape | undefined): boolean {
  return (
    shape?.kind === 'component-props' ||
    shape?.kind === 'base-ui-component-props' ||
    shape?.kind === 'use-render-component-props'
  );
}

// The tag a DOM interface stands for, where it stands for exactly one. An
// interface several tags share (HTMLElement, HTMLHeadingElement,
// HTMLTableCellElement) is absent on purpose: which of them a component
// renders is not in its type, and a guess would name the wrong surface.
const DOM_INTERFACE_TAGS: Readonly<Record<string, string>> = {
  HTMLAnchorElement: 'a',
  HTMLButtonElement: 'button',
  HTMLDivElement: 'div',
  HTMLFieldSetElement: 'fieldset',
  HTMLFormElement: 'form',
  HTMLHRElement: 'hr',
  HTMLImageElement: 'img',
  HTMLInputElement: 'input',
  HTMLLIElement: 'li',
  HTMLLabelElement: 'label',
  HTMLLegendElement: 'legend',
  HTMLOListElement: 'ol',
  HTMLOptGroupElement: 'optgroup',
  HTMLOptionElement: 'option',
  HTMLParagraphElement: 'p',
  HTMLSelectElement: 'select',
  HTMLSpanElement: 'span',
  HTMLTableCaptionElement: 'caption',
  HTMLTableElement: 'table',
  HTMLTableRowElement: 'tr',
  HTMLTextAreaElement: 'textarea',
  HTMLUListElement: 'ul',
  SVGSVGElement: 'svg',
};

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function declaredUnder(declarations: readonly ts.Declaration[], pattern: RegExp): boolean {
  return declarations.some((decl) => pattern.test(decl.getSourceFile().fileName));
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function classifyHeritageReference(location: ts.Node, checker: ts.TypeChecker): HeritageShape | undefined {
  const symbol = checker.getSymbolAtLocation(location);
  return symbol ? classifyHeritageSymbol(symbol, checker) : undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// The same classification asked of a symbol directly, for a caller that holds
// a resolved type rather than a node at a use site (see walkResolvedType).
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function classifyHeritageSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): HeritageShape | undefined {
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const name = resolved.getName();
  const declarations = resolved.getDeclarations() ?? [];

  if ((name === 'Omit' || name === 'Pick') && declaredUnder(declarations, /[\\/]node_modules[\\/]typescript[\\/]lib[\\/]/)) {
    return { kind: 'omit-pick', helper: name };
  }
  if (name === 'VariantProps' && declaredUnder(declarations, /[\\/]node_modules[\\/]class-variance-authority[\\/]/)) {
    return { kind: 'variant-props' };
  }
  if (
    (name === 'ComponentProps' || name === 'ComponentPropsWithRef') &&
    declaredUnder(declarations, /[\\/]node_modules[\\/]@types[\\/]react[\\/]/)
  ) {
    return { kind: 'component-props' };
  }
  if (name === 'BaseUIComponentProps' && declaredUnder(declarations, /[\\/]node_modules[\\/]@base-ui[\\/]react[\\/]/)) {
    return { kind: 'base-ui-component-props' };
  }
  if (
    (name === 'ComponentProps' || name === 'UseRenderComponentProps') &&
    declaredUnder(declarations, /[\\/]node_modules[\\/]@base-ui[\\/]react[\\/]use-render[\\/]/)
  ) {
    return { kind: 'use-render-component-props' };
  }
  if (name === 'UseRenderComponentProps' && declaredUnder(declarations, /[\\/]node_modules[\\/]@shadcn[\\/]react[\\/]/)) {
    return { kind: 'use-render-component-props' };
  }
  if (/^[A-Za-z]*HTMLAttributes$/.test(name) && declaredUnder(declarations, /[\\/]node_modules[\\/]@types[\\/]react[\\/]/)) {
    return { kind: 'dom-attributes', argument: 0 };
  }
  if (name === 'DetailedHTMLProps' && declaredUnder(declarations, /[\\/]node_modules[\\/]@types[\\/]react[\\/]/)) {
    return { kind: 'dom-attributes', argument: 1 };
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// Walks a props type's composition graph - Omit/Pick, intersections, and
// named interfaces/aliases followed to their own heritage - looking for two
// things at once: the element kind a BaseUIComponentProps<'tag', ...>,
// ComponentProps<'tag'> or useRender.ComponentProps<'tag'> generic argument
// names, and every VariantProps<typeof
// X> entity along the way. One walk instead of two because both anchors live
// on the same graph and a component's real heritage is rarely more than two
// or three levels deep, so re-walking it twice would mostly repeat itself.
function walkPropsType(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
  result: PropsTypeWalkResult,
  visited: Set<ts.Symbol>,
  depth: number,
  filter: KeyFilter = NO_KEY_FILTER,
): void {
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  if (depth > 12) return;
  if (ts.isIntersectionTypeNode(node)) {
    for (const member of node.types) walkPropsType(member, checker, result, visited, depth + 1, filter);
    return;
  }
  if (ts.isParenthesizedTypeNode(node)) {
    walkPropsType(node.type, checker, result, visited, depth + 1, filter);
    return;
  }
  // A union of props types is walked branch by branch, the way its props are
  // read (propsOfEveryBranch): each branch is a props type in its own right.
  // Branches naming different host elements are a note rather than a guess
  // passed off as the answer; the first branch's element is kept.
  if (ts.isUnionTypeNode(node)) {
    const kinds: string[] = [];
    // Every branch's filter for each variant declaration, by its text: two
    // branches may reach the same declaration through different Omit/Pick
    // helpers, and which one is walked first must not decide the axes.
    const branchFilters = new Map<string, { source: ts.EntityName; filters: KeyFilter[] }>();
    for (const member of node.types.filter((type) => !isNullishTypeNode(type))) {
      const branch: PropsTypeWalkResult = { kind: undefined, variantSources: [], axisFilters: new Map(), cannotExtract: [] };
      walkPropsType(member, checker, branch, new Set(visited), depth + 1, filter);
      if (branch.kind !== undefined && !kinds.includes(branch.kind)) kinds.push(branch.kind);
      for (const source of branch.variantSources) {
        const known = branchFilters.get(source.getText());
        const sourceFilter = branch.axisFilters.get(source) ?? NO_KEY_FILTER;
        if (known === undefined) branchFilters.set(source.getText(), { source, filters: [sourceFilter] });
        else known.filters.push(sourceFilter);
      }
      result.cannotExtract.push(...branch.cannotExtract);
    }
    for (const [text, { source, filters }] of branchFilters) {
      if (!result.variantSources.some((known) => known.getText() === text)) result.variantSources.push(source);
      const merged = mergeBranchFilters(filters);
      if (merged !== NO_KEY_FILTER) result.axisFilters.set(source, merged);
      if (new Set(filters.map(filterKey)).size > 1) {
        result.cannotExtract.push(
          `heritage: the branches of "${node.getText()}" reach "${text}" through different Omit/Pick filters - the ` +
            `contract states every axis any branch keeps`,
        );
      }
    }
    if (result.kind === undefined) result.kind = kinds[0];
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    if (kinds.length > 1) {
      result.cannotExtract.push(
        `heritage: the branches of "${node.getText()}" render different host elements (${kinds.join(', ')}) - the ` +
          `contract names the first`,
      );
    }
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    return;
  }
  // An inline object type literal - `{ tone: ... }` in `ComponentProps<'div'>
  // & { tone: ... }` - is a legitimate terminal: its own members are already
  // reachable through checker.getPropertiesOfType at the top level, so there
  // is nothing more for THIS walk (kind/variant discovery) to resolve here.
  // Not an error, unlike the node kinds below it has no typeRefParts either.
  if (ts.isTypeLiteralNode(node)) return;
  // `Parameters<typeof X>[0]` is the props type of X spelled another way, so
  // it continues the walk exactly where `ComponentProps<typeof X>` would.
  const parametersQuery = ts.isIndexedAccessTypeNode(node) ? firstParameterQuery(node, checker) : undefined;
  if (parametersQuery !== undefined) {
    walkQueriedComponentProps(parametersQuery, node, checker, result, visited, depth, filter);
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage

  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const parts = typeRefParts(node);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!parts) {
    // A node kind this walk does not understand at all - a mapped type, a
    // conditional type - in heritage position. Recorded rather than passed
    // over, since whatever this node declares (a DOM/Base UI anchor, a cva
    // axis) is exactly the kind of fact this walk exists to surface.
    result.cannotExtract.push(
      `heritage: "${node.getText()}" is a ${ts.SyntaxKind[node.kind]}, not a shape this walk can classify - cannot extract`,
    );
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const { args, location } = parts;
  const shape = classifyHeritageReference(location, checker);

  if (shape?.kind === 'omit-pick' && args && args.length > 0) {
    // What the helper removes (Omit) or keeps (Pick) is not an axis of this
    // component, whatever a variant declaration further down says: an axis
    // removed and redeclared is the component's own prop.
    // Read off the node, and through the checker where the node names the
    // keys another way (`type Keys = 'variant'`); only a key set neither can
    // list - a type parameter, say - is unreadable.
    const keys = args.length > 1 ? (literalKeysOf(args[1]) ?? literalKeysOfType(checker.getTypeFromTypeNode(args[1]))) : undefined;
    const narrowed =
      keys !== undefined
        ? narrowFilter(filter, shape.helper === 'Pick' ? 'pick' : 'omit', keys)
        : args.length > 1
          ? unreadableFilter(filter, args[1].getText())
          : filter;
    walkPropsType(args[0], checker, result, visited, depth + 1, narrowed);
    return;
  }
  if (shape?.kind === 'variant-props' && args && args.length > 0 && ts.isTypeQueryNode(args[0])) {
    result.variantSources.push(args[0].exprName);
    if (filter !== NO_KEY_FILTER) result.axisFilters.set(args[0].exprName, filter);
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    if (filter.unreadable !== undefined) {
      // Prefixed `cva:` so the compile is refused: with the key set unknown,
      // an axis the path removed would be stated as the component's, the
      // same loss the axis rules exist to prevent, in the other direction.
      result.cannotExtract.push(
        `cva: "${args[0].getText()}" is reached through an Omit or Pick whose keys (${filter.unreadable}) are not ` +
          `string literals - which of its axes the component takes cannot be read`,
      );
    }
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    return;
  }
  if (namesHostElement(shape) && args?.length) {
    readHostElementArgument(node, args[0], checker, result, visited, depth, filter);
    return;
  }
  if (shape?.kind === 'dom-attributes' && args !== undefined && args.length > shape.argument) {
    const argument = args[shape.argument];
    const interfaceName = ts.isTypeReferenceNode(argument) ? lastEntityName(argument.typeName) : argument.getText();
    readDomInterface(node, interfaceName, result);
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage

  // A named reference this loop does not special-case - resolve it and
  // recurse into its own declaration's heritage (interface `extends` list,
  // or a type alias's underlying type), which is how `ButtonPrimitive.Props`
  // eventually reaches Base UI's `BaseUIComponentProps<'button', ...>`. A
  // reference that resolves to no symbol at all, or to a declaration kind
  // this loop cannot unwrap (a class, an enum - anything but an interface or
  // type alias), is exactly as unclassifiable as the node-kind case above
  // and gets the same treatment: named, not silently dropped.
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const symbol = checker.getSymbolAtLocation(location);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!symbol) {
    result.cannotExtract.push(`heritage: "${node.getText()}" has no resolvable symbol - cannot extract`);
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (visited.has(resolved)) return;
  visited.add(resolved);
  let unwrapped = false;
  for (const decl of resolved.getDeclarations() ?? []) {
    if (ts.isInterfaceDeclaration(decl)) {
      unwrapped = true;
      for (const clause of decl.heritageClauses ?? []) {
        for (const member of clause.types) walkPropsType(member, checker, result, visited, depth + 1, filter);
      }
    } else if (ts.isTypeAliasDeclaration(decl)) {
      unwrapped = true;
      walkPropsType(decl.type, checker, result, visited, depth + 1, filter);
    }
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!unwrapped) {
    result.cannotExtract.push(
      `heritage: "${node.getText()}" resolves to a declaration this walk cannot unwrap (not an interface or type alias) - cannot extract`,
    );
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
}

// The element argument of a helper that names the host element. A string
// literal is the tag itself. A type query (`ComponentProps<typeof Trigger>`)
// names a component instead of a tag, and that component's own props type is
// where the tag is written, so the walk continues there. Anything else - a
// type parameter, a union of tags, an attributes interface - is recorded
// rather than dropped: the walk stopping here with nothing said is how a
// component came to forward a whole DOM surface with no element to name it.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function readHostElementArgument(
  node: ts.TypeNode,
  first: ts.TypeNode,
  checker: ts.TypeChecker,
  result: PropsTypeWalkResult,
  visited: Set<ts.Symbol>,
  depth: number,
  filter: KeyFilter = NO_KEY_FILTER,
): void {
  if (ts.isLiteralTypeNode(first) && ts.isStringLiteral(first.literal)) {
    if (result.kind === undefined) result.kind = first.literal.text;
    return;
  }
  if (ts.isTypeQueryNode(first)) {
    walkQueriedComponentProps(first, node, checker, result, visited, depth, filter);
    return;
  }
  const tags = literalTagsOf(first);
  const chosen = tags === undefined ? undefined : documentedDefaultTag(node, tags);
  if (tags !== undefined && chosen !== undefined) {
    if (result.kind === undefined) result.kind = chosen;
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    result.cannotExtract.push(
      `heritage: "${node.getText()}" admits ${tags.length} host elements (${tags.join(', ')}); the contract names ` +
        `"${chosen}", the element the declaring file documents the component as rendering - a caller may render another`,
    );
    return;
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  result.cannotExtract.push(
    `heritage: "${node.getText()}" names its host element with "${first.getText()}", a ${
      ts.SyntaxKind[first.kind]
    } rather than a string literal - the host element cannot be read from it`,
  );
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
}

// `null` and `undefined` in a union of props types: no props of their own,
// and nothing for the walk to read or to note.
function isNullishTypeNode(node: ts.TypeNode): boolean {
  if (node.kind === ts.SyntaxKind.UndefinedKeyword) return true;
  return ts.isLiteralTypeNode(node) && node.literal.kind === ts.SyntaxKind.NullKeyword;
}

// A union written entirely of string literals, as the tags it names, or
// undefined for anything else.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function literalTagsOf(node: ts.TypeNode): string[] | undefined {
  if (!ts.isUnionTypeNode(node)) return undefined;
  const tags: string[] = [];
  for (const member of node.types) {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal)) return undefined;
    tags.push(member.literal.text);
  }
  return tags;
}

// The one tag among several that a primitive part documents itself as
// rendering. A part whose props admit a family of tags (a title typed
// `'h1' | ... | 'h6'`) still renders one of them when the caller picks none,
// and its own documentation says which in a fixed phrase: "Renders an `<h2>`
// element." Read from the JSDoc of the component the props type belongs to -
// the value declared in the same primitive-library file whose type names that
// props type - rather than from the file at large or guessed from the union,
// and only when exactly one documented tag is in the union: two, or none, and
// there is no default to name.
function documentedDefaultTag(node: ts.TypeNode, tags: readonly string[]): string | undefined {
  const source = node.getSourceFile();
  const site = classifyDeclarationSite(relativeDeclarationFile(source.fileName, kitRoot));
  if (site !== 'primitive-library') return undefined;
  let owner: ts.Node | undefined = node.parent;
  while (owner !== undefined && !ts.isInterfaceDeclaration(owner) && !ts.isTypeAliasDeclaration(owner)) owner = owner.parent;
  if (owner === undefined) return undefined;
  const propsName = owner.name.text;
  const namesProps = new RegExp(`\\b${propsName}\\b`);
  const documented = new Set<string>();
  for (const statement of source.statements) {
    const typed = ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((decl) => decl.type?.getText() ?? '').join(' ')
      : ts.isFunctionDeclaration(statement)
        ? statement.parameters.map((parameter) => parameter.type?.getText() ?? '').join(' ')
        : '';
    if (!namesProps.test(typed)) continue;
    for (const doc of ts.getJSDocCommentsAndTags(statement)) {
      for (const match of doc.getText().matchAll(/Renders an? `<([a-z][a-z0-9-]*)>` element/g)) {
        if (tags.includes(match[1])) documented.add(match[1]);
      }
    }
  }
  return documented.size === 1 ? [...documented][0] : undefined;
}

// The host element a DOM interface names, or a note when the interface names
// none this walk can map (see DOM_INTERFACE_TAGS).
function readDomInterface(node: ts.TypeNode, interfaceName: string, result: PropsTypeWalkResult): void {
  const tag = DOM_INTERFACE_TAGS[interfaceName];
  if (tag !== undefined) {
    if (result.kind === undefined) result.kind = tag;
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  result.cannotExtract.push(
    `heritage: "${node.getText()}" names its host element by the DOM interface "${interfaceName}", which stands for no ` +
      `single tag - the host element cannot be read from it`,
  );
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
}

// The type query inside `Parameters<typeof X>[0]`, when that is what the node
// is - TypeScript's own `Parameters`, by symbol, indexed at the first
// parameter. Any other indexed access answers undefined and is left to the
// walk's ordinary "cannot classify" note.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function firstParameterQuery(node: ts.IndexedAccessTypeNode, checker: ts.TypeChecker): ts.TypeQueryNode | undefined {
  const index = node.indexType;
  if (!ts.isLiteralTypeNode(index) || !ts.isNumericLiteral(index.literal) || index.literal.text !== '0') return undefined;
  const object = node.objectType;
  if (!ts.isTypeReferenceNode(object)) return undefined;
  const query = object.typeArguments?.length === 1 ? object.typeArguments[0] : undefined;
  if (query === undefined || !ts.isTypeQueryNode(query)) return undefined;
  const symbol = checker.getSymbolAtLocation(object.typeName);
  if (!symbol) return undefined;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (resolved.getName() !== 'Parameters') return undefined;
  return declaredUnder(resolved.getDeclarations() ?? [], /[\\/]node_modules[\\/]typescript[\\/]lib[\\/]/) ? query : undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// The props type of the component a type query names: its first parameter,
// read off the call signature the checker resolves for it. Walked from the
// parameter's own type annotation where that annotation IS the type the
// signature takes - a component written in the kit, whose `LabelProps` the
// checker would otherwise hand over already expanded past the
// `ComponentProps<'label'>` it was written as, tag and all. A primitive part
// is declared as `ForwardRefExoticComponent<Props & ...>`, whose parameter is
// annotated with React's own unbound `P`, so there only the instantiated type
// carries the part's props and the walk continues on the type.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function walkQueriedComponentProps(
  query: ts.TypeQueryNode,
  node: ts.TypeNode,
  checker: ts.TypeChecker,
  result: PropsTypeWalkResult,
  visited: Set<ts.Symbol>,
  depth: number,
  filter: KeyFilter = NO_KEY_FILTER,
): void {
  const candidates = checker
    .getTypeAtLocation(query)
    .getCallSignatures()
    .filter((signature) => signature.getParameters()[0] !== undefined);
  // An overloaded component has one props type per overload, and TypeScript's
  // own inference (`ComponentProps`, `Parameters`) reads the LAST one, so
  // that is the one walked; the others are named rather than passed over, for
  // the same reason every other shape this walk skips is.
  const signature = candidates[candidates.length - 1];
  if (signature !== undefined) {
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    if (candidates.length > 1) {
      result.cannotExtract.push(
        `heritage: "${node.getText()}" queries "${query.exprName.getText()}", which has ${candidates.length} overloads ` +
          `taking a props parameter - only the last, the one TypeScript infers from, was walked`,
      );
    }
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    const parameter = signature.getParameters()[0];
    const propsType = checker.getTypeOfSymbolAtLocation(parameter, query);
    const declaration = parameter.valueDeclaration;
    const annotation = declaration && ts.isParameter(declaration) ? declaration.type : undefined;
    if (annotation !== undefined && checker.getTypeFromTypeNode(annotation) === propsType) {
      walkPropsType(annotation, checker, result, visited, depth + 1, filter);
    } else {
      walkResolvedType(propsType, node, checker, result, visited, depth + 1, filter);
    }
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  result.cannotExtract.push(
    `heritage: "${node.getText()}" queries "${query.exprName.getText()}", which has no call signature taking a props ` +
      `parameter - cannot extract`,
  );
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
}

// walkPropsType's walk over a resolved type rather than a node, for the one
// place a node does not exist: the props type behind a type query. An
// instantiated helper is recognised by the alias it was written through
// (`Omit<X, 'ref'>` keeps `Omit` and its arguments), and a named type hands
// the walk back to its own declaration's nodes, so the two walks classify
// every shape by one rule.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function walkResolvedType(
  type: ts.Type,
  node: ts.TypeNode,
  checker: ts.TypeChecker,
  result: PropsTypeWalkResult,
  visited: Set<ts.Symbol>,
  depth: number,
  filter: KeyFilter = NO_KEY_FILTER,
): void {
  if (depth > 12) return;
  if (type.isIntersection()) {
    for (const member of type.types) walkResolvedType(member, node, checker, result, visited, depth + 1, filter);
    return;
  }
  const alias = type.aliasSymbol;
  let shape = alias ? classifyHeritageSymbol(alias, checker) : undefined;
  let typeArguments: readonly ts.Type[] = type.aliasTypeArguments ?? [];
  // A generic INTERFACE instantiated (`ButtonHTMLAttributes<HTMLButtonElement>`)
  // carries no alias: the interface is the type's own symbol, and its
  // arguments are the reference's.
  const reference = (type.flags & ts.TypeFlags.Object) !== 0 && ((type as ts.ObjectType).objectFlags & ts.ObjectFlags.Reference) !== 0;
  if (shape === undefined && reference && type.getSymbol() !== undefined) {
    shape = classifyHeritageSymbol(type.getSymbol()!, checker);
    if (shape !== undefined) typeArguments = checker.getTypeArguments(type as ts.TypeReference);
  }
  if (shape?.kind === 'omit-pick' && typeArguments.length > 0) {
    // The instantiated helper's key argument is the same keys as types, and
    // narrows what later axes may be taken exactly as walkPropsType's does.
    // Defensive: an instantiated Omit or Pick reaching here holds its keys as
    // resolved literal types, so an unreadable set would take a type argument
    // still open at this point, which a component's own props type does not
    // leave. Kept so that such a set refuses rather than keeps every axis.
    const keys = typeArguments.length > 1 ? literalKeysOfType(typeArguments[1]) : undefined;
    const narrowed =
      keys !== undefined
        ? narrowFilter(filter, shape.helper === 'Pick' ? 'pick' : 'omit', keys)
        : typeArguments.length > 1
          ? unreadableFilter(filter, stripModuleSpecifiers(checker.typeToString(typeArguments[1])))
          : filter;
    walkResolvedType(typeArguments[0], node, checker, result, visited, depth + 1, narrowed);
    return;
  }
  if (namesHostElement(shape) && typeArguments.length > 0) {
    const first = typeArguments[0];
    if (first.isStringLiteral()) {
      if (result.kind === undefined) result.kind = first.value;
      return;
    }
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    result.cannotExtract.push(
      `heritage: "${node.getText()}" reaches a props helper naming its host element with "${stripModuleSpecifiers(checker.typeToString(first))}" rather than a string literal - the host element cannot be read from it`,
    );
    return;
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  }
  if (shape?.kind === 'dom-attributes' && typeArguments.length > shape.argument) {
    const argument = typeArguments[shape.argument];
    readDomInterface(node, argument.getSymbol()?.getName() ?? stripModuleSpecifiers(checker.typeToString(argument)), result);
    return;
  }
  if (shape?.kind === 'variant-props') {
    // Prefixed `cva:` so the compiler refuses: an instantiated VariantProps
    // no longer holds the `typeof X` it was written with, so its axes cannot
    // be traced to a cva call, and a contract compiled without them would
    // ship a component whose variants silently vanished.
    result.cannotExtract.push(
      `cva: "${node.getText()}" reaches VariantProps through a type query, where its cva(...) call cannot be traced - ` +
        `variant axes would be silently lost`,
    );
    return;
  }
  const symbol = alias ?? type.getSymbol();
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!symbol) {
    result.cannotExtract.push(
      `heritage: "${node.getText()}" reaches "${stripModuleSpecifiers(checker.typeToString(type))}", which has no declaration to walk - cannot extract`,
    );
    return;
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (visited.has(resolved)) return;
  visited.add(resolved);
  let unwrapped = false;
  for (const decl of resolved.getDeclarations() ?? []) {
    if (ts.isInterfaceDeclaration(decl)) {
      unwrapped = true;
      for (const clause of decl.heritageClauses ?? []) {
        for (const member of clause.types) walkPropsType(member, checker, result, visited, depth + 1, filter);
      }
    } else if (ts.isTypeAliasDeclaration(decl)) {
      unwrapped = true;
      walkPropsType(decl.type, checker, result, visited, depth + 1, filter);
    } else if (ts.isTypeLiteralNode(decl)) {
      // An anonymous object type: a terminal, for the reason an inline one
      // is in walkPropsType - its members reach the extraction through the
      // checker's own property list.
      unwrapped = true;
    }
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!unwrapped) {
    result.cannotExtract.push(
      `heritage: "${node.getText()}" reaches "${stripModuleSpecifiers(checker.typeToString(type))}", whose declaration this walk cannot unwrap ` +
        `(not an interface or type alias) - cannot extract`,
    );
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
}

// Unwraps a props type node down to the constituents that actually carry
// meaning for a reader: an intersection's members, and a plain named
// reference (`ButtonProps`, `AlertProps`, ...) followed into whatever ITS
// interface `extends` or type alias underlying type is. Stops at the same
// shapes walkPropsType stops at (classifyHeritageReference, resolved by
// symbol - not a hand-kept name list, so the two functions can never
// disagree about where "the component's own heritage" ends and "a
// well-known type helper's internals" begins) - one for kind/variant
// resolution, this one for the read-only labels x-uikit.variant_sources
// carries. A node this walk genuinely cannot classify
// (see walkPropsType's matching branches) is named in `cannotExtract`
// instead of silently becoming an opaque label (N2/M1): the label-only
// consumer downstream still gets a leaf back so it has something to render,
// and the fact that the walk gave up on it is recorded beside it.
function resolveTopLevelMembers(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
  visited: Set<ts.Symbol>,
  depth: number,
  cannotExtract: string[],
): ts.TypeNode[] {
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  if (depth > 12) return [node];
  if (ts.isIntersectionTypeNode(node)) {
    return node.types.flatMap((member) => resolveTopLevelMembers(member, checker, visited, depth + 1, cannotExtract));
  }
  if (ts.isParenthesizedTypeNode(node)) {
    return resolveTopLevelMembers(node.type, checker, visited, depth + 1, cannotExtract);
  }
  if (ts.isUnionTypeNode(node)) {
    return node.types
      .filter((member) => !isNullishTypeNode(member))
      .flatMap((member) => resolveTopLevelMembers(member, checker, visited, depth + 1, cannotExtract));
  }
  if (ts.isTypeLiteralNode(node)) return [node];
  // A leaf here for the reason a recognised helper is: walkPropsType reads
  // what `Parameters<typeof X>[0]` names, and a label has nothing to add.
  if (ts.isIndexedAccessTypeNode(node) && firstParameterQuery(node, checker) !== undefined) return [node];

  const parts = typeRefParts(node);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!parts) {
    cannotExtract.push(
      `heritage: "${node.getText()}" is a ${ts.SyntaxKind[node.kind]}, not a shape this walk can classify - cannot extract`,
    );
    return [node];
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  if (classifyHeritageReference(parts.location, checker)) return [node];

  const symbol = checker.getSymbolAtLocation(parts.location);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!symbol) {
    cannotExtract.push(`heritage: "${node.getText()}" has no resolvable symbol - cannot extract`);
    return [node];
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (visited.has(resolved)) return [node];
  visited.add(resolved);

  const members: ts.TypeNode[] = [];
  let unwrapped = false;
  for (const decl of resolved.getDeclarations() ?? []) {
    if (ts.isInterfaceDeclaration(decl)) {
      unwrapped = true;
      for (const clause of decl.heritageClauses ?? []) {
        for (const member of clause.types) members.push(...resolveTopLevelMembers(member, checker, visited, depth + 1, cannotExtract));
      }
    } else if (ts.isTypeAliasDeclaration(decl)) {
      unwrapped = true;
      members.push(...resolveTopLevelMembers(decl.type, checker, visited, depth + 1, cannotExtract));
    }
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  if (!unwrapped) {
    cannotExtract.push(
      `heritage: "${node.getText()}" resolves to a declaration this walk cannot unwrap (not an interface or type alias) - cannot extract`,
    );
  }
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
  // A named reference with no heritage of its own (an inline object type
  // literal, an interface/type alias declaring no `extends`) is itself the
  // leaf - legitimate, not an error; `unwrapped` above already distinguishes
  // that case from a genuinely opaque one.
  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
  return members.length > 0 ? members : [node];
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// x-uikit.variant_sources: where this component's own cva axes come from,
// read off the VariantProps<typeof X> entries of its props type's heritage.
// The walk covers the whole heritage rather than the variant entries alone
// because a node it cannot classify is a fact worth recording either way
// (resolveTopLevelMembers writes it into `cannotExtract`), and because the
// non-variant entries are what the walk has to step over to find the variant
// ones.
function variantSourceLabelsOf(
  node: ts.TypeNode,
  checker: ts.TypeChecker,
  cannotExtract: string[],
): string[] {
  const members = resolveTopLevelMembers(node, checker, new Set(), 0, cannotExtract);
  const labels: string[] = [];
  for (const member of members) {
    const parts = typeRefParts(member);
    const shape = parts && classifyHeritageReference(parts.location, checker);
    // Once each: two branches of a union may name the same variant source.
    if (shape?.kind === 'variant-props' && !labels.includes(member.getText())) labels.push(member.getText());
  }
  return labels;
}

// Where a prop's declaration lives decides which of the three sets it is
// filed into (see the module comment), checked against the already-relativized
// declaration path rather than against a symbol, because the question is
// genuinely about the FILE: the same helper type (BaseUIComponentProps)
// contributes `render` and `style`, and React's own DOM attribute interfaces
// contribute everything else, and no symbol name separates them.
//
// A declaration in this package's own source is the component's own API and
// never reaches this function (see isPackageSource). What does:
//
//   - the primitive libraries the kit builds its parts on - Base UI, and a
//     second primitive library whose parts are laid out the same way (an
//     element-parameterised props helper, and each part's own API);
//   - the third-party libraries the kit wraps and re-exposes a component of
//     (a chart library, a date picker, a command menu, resizable panels).
//
// Both kinds are the API of whatever the kit wraps, which is the middle set.
// A prop from any other package is filed nowhere and the component is
// refused: which side of the API/forwarded line it falls on is a question
// about that package that this list has not answered. Adding a library is one
// more prefix here, plus a heritage shape for its props helper when it has
// one - a decision about that library, not a config toggle.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-file-class
const PRIMITIVE_LIBRARY_PREFIXES = ['@base-ui/react/', '@shadcn/react/'];
const WRAPPED_LIBRARY_PREFIXES = ['recharts/', 'react-day-picker/', 'cmdk/', 'react-resizable-panels/'];
const REACT_DOM_TYPES_PREFIX = '@types/react/';

export type PropDeclarationSite = 'primitive-library' | 'wrapped-library' | 'react-dom' | 'elsewhere';

export function classifyDeclarationSite(declarationFile: string): PropDeclarationSite {
  if (PRIMITIVE_LIBRARY_PREFIXES.some((prefix) => declarationFile.startsWith(prefix))) return 'primitive-library';
  if (WRAPPED_LIBRARY_PREFIXES.some((prefix) => declarationFile.startsWith(prefix))) return 'wrapped-library';
  if (declarationFile.startsWith(REACT_DOM_TYPES_PREFIX)) return 'react-dom';
  return 'elsewhere';
}

// Whether a declaration lives in this package's own source rather than in a
// dependency. The component's own file is the common case; a sibling kit
// file is the other one (a trigger reusing the kit button's props type), and
// its props are the kit's API for the same reason the component's own are:
// the kit wrote them, so a consumer reads them as the kit's, not as a
// primitive's forwarded surface.
function isPackageSource(fileName: string): boolean {
  const path = fileName.split('\\').join('/');
  return path.startsWith(`${kitRoot.split('\\').join('/')}/`) && !path.includes('/node_modules/');
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-file-class

function jsDocDefault(symbol: ts.Symbol): string | undefined {
  const tag = symbol.getJsDocTags().find((t) => t.name === 'default');
  if (!tag || !tag.text) return undefined;
  return tag.text.map((part) => part.text).join('');
}

// Normalizes a declaration's source file to something safe to commit: the
// package-relative path under node_modules for a third-party type, or the
// kit-relative path for another file in this package. An absolute
// filesystem path would make the compiled contract different on every
// machine that regenerates it.
function relativeDeclarationFile(absolutePath: string, kitRoot: string): string {
  const marker = '/node_modules/';
  const idx = absolutePath.lastIndexOf(marker);
  if (idx !== -1) return absolutePath.slice(idx + marker.length);
  return relative(kitRoot, absolutePath).split('\\').join('/');
}

// A prop's type as a reader should see it: the checker's own printed type,
// with no module specifier anywhere in it.
//
// TypeScript's printer qualifies a type it cannot name in the current scope
// with `import("<absolute path>")`, which puts two things a consumer has no
// use for into a COMMITTED artifact: the machine's own filesystem path, and
// a foreign package's internal file layout (`@base-ui/react/accordion/index`
// is not how anything imports that type). `CSSProperties` and `ButtonState`
// are what the type is called; the file it happens to live in is not part of
// the answer.
//
// UseAliasDefinedOutsideCurrentScope is what stops the qualifier being
// emitted in the first place - the printer keeps the alias name instead of
// expanding to the import form. The strip below is the guarantee rather than
// the mechanism: a shape the flag does not cover still must not carry a path
// into a committed file, and check.ts refuses a contract whose prose
// contains one.
//
// A type PARAMETER is left standing as itself (`Value`, `TData`). It is not
// a leak: it is the component's own public generic, and substituting its
// default would print `AccordionValue<unknown>` - false for the caller who
// writes `<Accordion<string>>`, which is most of them.
const TYPE_PRINT_FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

export function stripModuleSpecifiers(typeText: string): string {
  return typeText.replace(/import\("[^"]*"\)\./g, '');
}

function printTypeText(type: ts.Type, location: ts.Node, checker: ts.TypeChecker): string {
  return stripModuleSpecifiers(checker.typeToString(type, location, TYPE_PRINT_FLAGS));
}

// True for a call whose resolved callee really is React's own `forwardRef`
// or `memo` export - checked by symbol identity the same way isCvaCall
// checks cva, so an aliased import resolves the same as the plain form.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function isReactWrapperCall(call: ts.CallExpression, checker: ts.TypeChecker, wrapperName: 'forwardRef' | 'memo'): boolean {
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (!symbol) return false;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (resolved.getName() !== wrapperName) return false;
  return declaredUnder(resolved.getDeclarations() ?? [], /[\\/]node_modules[\\/]@types[\\/]react[\\/]/);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// Unwraps `forwardRef(...)`/`memo(...)` call wrappers around a component
// function, straight through nesting (`memo(forwardRef((props, ref) =>
// ...))`) - M8: the initializer becomes a CallExpression instead of a
// function value, which an arrow/function-expression-only check would read
// as "not component-shaped", undercounting check.ts's own enrollment report
// by miscounting a real, unwrapped component as one of the exports it
// intentionally skips. `forwardRef`'s render function and
// `memo`'s wrapped component are both their call's first argument - the
// only argument shape either wrapper accepts there.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function unwrapComponentInitializer(expr: ts.Expression | undefined, checker: ts.TypeChecker, depth = 0): ts.Expression | undefined {
  if (expr === undefined || depth > 4 || !ts.isCallExpression(expr)) return expr;
  if (isReactWrapperCall(expr, checker, 'forwardRef') || isReactWrapperCall(expr, checker, 'memo')) {
    return unwrapComponentInitializer(expr.arguments[0], checker, depth + 1);
  }
  return expr;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// React's own ReactElement, taken from the program's copy of @types/react by
// symbol rather than by the name at any use site - the same technique
// classifyHeritageReference uses, for the same reason: a locally declared
// type named ReactElement is not React's, and React's stays React's under
// any import alias. A program with no React in its closure answers undefined,
// which reads as "nothing here can be a component", the honest answer for a
// file that cannot render.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function resolveReactElementType(program: ts.Program, checker: ts.TypeChecker): ts.Type | undefined {
  for (const file of program.getSourceFiles()) {
    if (!/[\\/]node_modules[\\/]@types[\\/]react[\\/]index\.d\.ts$/.test(file.fileName)) continue;
    const moduleSymbol = checker.getSymbolAtLocation(file);
    if (!moduleSymbol) continue;
    const exported = checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.getName() === 'ReactElement');
    if (exported) return checker.getDeclaredTypeOfSymbol(exported);
  }
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// Whether a call signature's return type can be a React element. ReactNode is
// the wrong question to ask here even though every component returns one:
// `string` is a ReactNode, so a formatter would answer yes. The test is
// therefore against ReactElement in both directions - either every value the
// signature returns is an element (`JSX.Element`), or an element is one of
// the values it admits (`ReactNode`, `ReactNode | Promise<ReactNode>`, which
// is what React's own FC returns). `any` and `unknown` admit an element too,
// and admit everything else with it, so they are refused rather than read as
// a description of anything.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function returnsReactElement(returnType: ts.Type, checker: ts.TypeChecker, reactElement: ts.Type): boolean {
  if (returnType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
  return checker.isTypeAssignableTo(returnType, reactElement) || checker.isTypeAssignableTo(reactElement, returnType);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// The forms an exported declaration can take and still be this kit's idea of
// a component. Two of them have a function body that renders; the third has
// no body at all and is recognised by its type, so the two are kept apart
// here rather than collapsed into "has a body or not" - an ambient
// `declare function Widget()` also has no body, and is not a component.
type ComponentShape =
  // A body containing JSX, or returning the primitive library's useRender.
  | { readonly form: 'body' }
  // An alias of a component-typed callable: the signature is the aliased
  // callable's own, and the props parameter below is read from it.
  | { readonly form: 'alias'; readonly signature: ts.Signature };

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function renderingShape(body: ts.Node, checker: ts.TypeChecker): ComponentShape | undefined {
  return containsJsx(body) || returnsUseRender(body, checker) ? { form: 'body' } : undefined;
}

// An alias carries no body to read, so the question is asked of its TYPE:
// does what it names return a React element. The rule is deliberately
// confined to a body-less initializer that is a name or a member of one
// (`DialogPrimitive.Root`, `Root`), the shape a re-export takes. Anything
// with a body keeps going through the render test above, so an exported
// helper that happens to return a ReactNode is not swept in by its type.
function aliasShape(
  initializer: ts.Expression,
  checker: ts.TypeChecker,
  reactElement: ts.Type | undefined,
): ComponentShape | undefined {
  if (reactElement === undefined) return undefined;
  if (!ts.isPropertyAccessExpression(initializer) && !ts.isIdentifier(initializer)) return undefined;
  const signature = checker
    .getTypeAtLocation(initializer)
    .getCallSignatures()
    .find((candidate) => returnsReactElement(candidate.getReturnType(), checker, reactElement));
  return signature ? { form: 'alias', signature } : undefined;
}

// A statement the candidate walk reads a component from: a function, one
// declarator of a variable statement, or one name of a re-export.
type CandidateDeclaration = ts.FunctionDeclaration | ts.VariableDeclaration | ts.ExportSpecifier;

// `export { X } from 'somewhere'`, values rather than types: the form a
// directory takes when all it ships is a primitive's own component under the
// kit's name, with nothing declared locally to read. A local export list
// (`export { X }` with no module) is not a candidate form: no kit file writes
// one, and its names would be read from the local declarations it lists.
function isValueReExport(
  statement: ts.Statement,
): statement is ts.ExportDeclaration & { exportClause: ts.NamedExports; moduleSpecifier: ts.Expression } {
  return (
    ts.isExportDeclaration(statement) &&
    !statement.isTypeOnly &&
    statement.moduleSpecifier !== undefined &&
    statement.exportClause !== undefined &&
    ts.isNamedExports(statement.exportClause)
  );
}

// A re-exported name is an alias with no initializer at all, so the alias
// rule applies to the symbol it re-exports: a component when that symbol's
// type has a call signature returning a React element.
function reExportShape(
  specifier: ts.ExportSpecifier,
  checker: ts.TypeChecker,
  reactElement: ts.Type | undefined,
): ComponentShape | undefined {
  if (reactElement === undefined || !/^[A-Z]/.test(specifier.name.text)) return undefined;
  const local = checker.getSymbolAtLocation(specifier.name);
  if (local === undefined) return undefined;
  const target = local.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(local) : local;
  const signature = checker
    .getTypeOfSymbolAtLocation(target, specifier)
    .getCallSignatures()
    .find((candidate) => returnsReactElement(candidate.getReturnType(), checker, reactElement));
  return signature ? { form: 'alias', signature } : undefined;
}

function componentShape(
  node: CandidateDeclaration,
  checker: ts.TypeChecker,
  reactElement: ts.Type | undefined,
): ComponentShape | undefined {
  if (ts.isExportSpecifier(node)) return reExportShape(node, checker, reactElement);
  if (ts.isFunctionDeclaration(node)) {
    if (!node.name || !/^[A-Z]/.test(node.name.text) || !node.body) return undefined;
    return renderingShape(node.body, checker);
  }
  if (!ts.isIdentifier(node.name) || !/^[A-Z]/.test(node.name.text)) return undefined;
  const inner = unwrapComponentInitializer(node.initializer, checker);
  if (inner === undefined) return undefined;
  if (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) return renderingShape(inner.body, checker);
  return aliasShape(inner, checker, reactElement);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// True for a call whose resolved callee really is the primitive library's
// `useRender` hook - checked by symbol identity the same way isCvaCall checks
// cva, so an aliased import resolves the same as the plain form.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function isUseRenderCall(call: ts.CallExpression, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(call.expression);
  if (!symbol) return false;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  if (resolved.getName() !== 'useRender') return false;
  return declaredUnder(resolved.getDeclarations() ?? [], /[\\/]node_modules[\\/]@base-ui[\\/]react[\\/]/);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// A component that renders through `useRender` has no JSX node in its body at
// all: the hook returns the element. It is the kit's polymorphism mechanism
// (badge.tsx's own header calls it that), so asking for JSX alone read eight
// files' main component as not a component - the enrollment report printed
// "0 of 0 exports" for a directory with something to describe, the guard's
// completeness rule could never be met there, and the target resolver
// answered "no exported component named Badge". Only a RETURNED call counts,
// and only this function's own returns: a nested callback's return is that
// callback's, not the component's.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function returnsUseRender(body: ts.Node, checker: ts.TypeChecker): boolean {
  const isHookCall = (expr: ts.Expression | undefined): boolean =>
    expr !== undefined && ts.isCallExpression(expr) && isUseRenderCall(expr, checker);
  // An arrow function's concise body IS its return.
  if (!ts.isBlock(body)) return ts.isExpression(body) && isHookCall(body);
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) return;
    if (ts.isReturnStatement(node) && isHookCall(node.expression)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return found;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function containsJsx(node: ts.Node): boolean {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) return true;
  let found = false;
  ts.forEachChild(node, (child) => {
    if (found) return;
    if (containsJsx(child)) found = true;
  });
  return found;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// The props parameter, wherever the shape that was accepted keeps it: on the
// declaration itself for a body, and on the aliased callable's own signature
// for an alias - declared in whatever file declares that callable, which is
// where the checker reads its type from either way. A signature whose
// parameter has no declaration to point at (a synthetic one) answers
// undefined, the same as a component written with no parameter at all.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function firstParameter(
  node: CandidateDeclaration,
  shape: ComponentShape,
  checker: ts.TypeChecker,
): ts.ParameterDeclaration | undefined {
  if (shape.form === 'alias') {
    const declaration = shape.signature.getParameters()[0]?.valueDeclaration;
    return declaration && ts.isParameter(declaration) ? declaration : undefined;
  }
  if (ts.isFunctionDeclaration(node)) return node.parameters[0];
  if (ts.isExportSpecifier(node)) return undefined;
  const inner = unwrapComponentInitializer(node.initializer, checker);
  if (inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner))) return inner.parameters[0];
  return undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// The body of a component written with one - a function declaration's, or an
// arrow's or function expression's under the wrappers unwrapComponentInitializer
// sees through - and undefined for an alias or a re-export, which have none.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function componentBody(node: CandidateDeclaration, checker: ts.TypeChecker): ts.Node | undefined {
  if (ts.isFunctionDeclaration(node)) return node.body;
  if (ts.isExportSpecifier(node)) return undefined;
  const inner = unwrapComponentInitializer(node.initializer, checker);
  return inner && (ts.isArrowFunction(inner) || ts.isFunctionExpression(inner)) ? inner.body : undefined;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
function isNodeExported(node: ts.Node): boolean {
  const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return (modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
}

const kitRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// One parsed tsconfig.src.json for every extraction in the process - the
// compiler options that decide module resolution and JSX must match what
// actually ships, and re-reading/re-parsing the config file per component
// would be wasted work across a kit-wide run (see T4's enrollment report).
let cachedCompilerOptions: ts.CompilerOptions | undefined;
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-program
function loadCompilerOptions(): ts.CompilerOptions {
  if (cachedCompilerOptions) return cachedCompilerOptions;
  const configPath = resolve(kitRoot, 'tsconfig.src.json');
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(`extract: failed to read ${configPath}: ${ts.flattenDiagnosticMessageText(configFile.error.messageText, ' ')}`);
  }
  const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, dirname(configPath));
  cachedCompilerOptions = parsed.options;
  return cachedCompilerOptions;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-program
}

// A ts.Program is not a parse of one file: it is the parse, bind and module
// resolution of that file AND its whole transitive closure - React, Base UI,
// the DOM lib, every .d.ts they reach - and the kit's components share almost
// all of that closure. The enrollment report built two programs per directory,
// 126 for 63 components, and spent nearly all of its runtime re-reading the
// same declaration files. Measured over those 63 entry files: 126 programs
// 33.5s, 63 programs 16.0s, one program over all 63 roots 0.73s.
//
// One shared program is NOT, however, a free substitution for the per-file
// programs, and this is the reason the split below exists. What
// checker.typeToString prints is program-global rather than file-local: the
// ORDER of a union's members follows internal type ids and so follows the
// order the program bound its files - `"none" | "off" | ...` became `"off" |
// "none" | ...`. That order lands in a compiled contract, in the prose a
// property whose type no schema shape states in full carries. Sharing a
// program for extraction would therefore make a component's committed
// artifacts depend on which OTHER components happened to be in the same run
// - the exact machine-independence the sort in `extractComponent` (N3) and
// the module-specifier strip above already exist to protect. Measured, not
// assumed: the freshness comparison reports those descriptions as
// differences.
//
// So the split is by what the answer is USED for, not by what is convenient:
// extraction that produces artifacts keeps its own per-file program, and only
// the two questions whose answers are counted rather than written - which
// exports are components, and what every export is called - are allowed to
// share, or to skip a program altogether.

// One extraction per tsxPath for the life of the process - resolveTargetExtraction
// and compileContract each resolve a directory's extraction independently
// (compileContract calls resolveTargetExtraction, and callers routinely call
// resolveTargetExtraction again directly), so a single freshness check for one
// component builds this
// same ts.createProgram several times over for the same source file. That
// program build is several seconds on a CI-class runner, so the redundant
// builds are what pushed the contract test suites past vitest's default
// timeout. Caching by tsxPath is safe here because nothing in this process
// edits the component source between calls - a fresh process (a fresh test
// run, or `contracts:compile` invoked again) starts with an empty cache.
const extractionCache = new Map<string, ComponentExtraction[]>();

// Every prop a props type admits, read branch by branch when it is a union
// of object types. The checker's own property list for a union is the props
// EVERY branch declares - right for what a value of the union is guaranteed
// to carry, wrong for what a caller may pass: a date picker typed
// `SingleProps | RangeProps` takes `numberOfMonths` on the range branch, and
// read off the union alone that prop never reached the schema or the
// near-miss check. So the props of each branch are added too, each named with
// the branches that declare it; a prop every branch declares is returned
// once, as the union's own symbol, with no branch list.
//
// The symbol returned for a branch-only prop is the first declaring branch's.
// Its type is read from that branch alone, which is exact when the branches
// agree about it and narrower than the union when they do not - so where two
// branches type it differently, the schema states nothing and the printed
// types of every declaring branch are what a reader gets (see
// extractFromSource).
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props
interface BranchedProp {
  symbol: ts.Symbol;
  branches?: string[];
  // Every declaring branch's own symbol, the first one being `symbol`.
  declaringSymbols?: ts.Symbol[];
}

function propsOfEveryBranch(type: ts.Type, checker: ts.TypeChecker): BranchedProp[] {
  // Read without `null` and `undefined`: an optional props parameter
  // (`props?: A | B`) admits them, and they have no props of their own, so
  // read with them every prop would look like one no branch shares.
  const nonNullable = checker.getNonNullableType(type);
  const props: BranchedProp[] = checker.getPropertiesOfType(nonNullable).map((symbol) => ({ symbol }));
  if (!nonNullable.isUnion()) return props;
  const common = new Set(props.map(({ symbol }) => symbol.getName()));
  const branchOnly = new Map<string, BranchedProp & { branches: string[]; declaringSymbols: ts.Symbol[] }>();
  // In label order rather than the checker's, which follows internal type
  // ids and so what the program bound first - the reason prop lists are
  // sorted too.
  const labelled = nonNullable.types
    .map((branch) => ({ branch, label: branchLabel(branch, nonNullable.types, checker) }))
    .sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  for (const { branch, label } of labelled) {
    for (const symbol of checker.getPropertiesOfType(branch)) {
      const name = symbol.getName();
      if (common.has(name)) continue;
      const known = branchOnly.get(name);
      if (known === undefined) {
        branchOnly.set(name, { symbol, branches: [label], declaringSymbols: [symbol] });
      } else {
        known.branches.push(label);
        known.declaringSymbols.push(symbol);
      }
    }
  }
  return [...props, ...branchOnly.values()];
}

// How one branch of a union props type is named to a reader: its own alias
// or interface name, or - for an intersection, which is what a union inside
// an intersection normalizes into - the members that are not shared by every
// branch, since the shared ones say nothing about which branch this is.
function branchLabel(branch: ts.Type, branches: readonly ts.Type[], checker: ts.TypeChecker): string {
  const own = branch.aliasSymbol?.getName() ?? branch.getSymbol()?.getName();
  if (own !== undefined && own !== '__type') return own;
  if (branch.isIntersection()) {
    const distinct = branch.types.filter((member) => !branches.every((other) => other.isIntersection() && other.types.includes(member)));
    const names = distinct.map((member) => member.aliasSymbol?.getName() ?? member.getSymbol()?.getName()).filter(
      (name): name is string => name !== undefined && name !== '__type',
    );
    if (names.length > 0) return names.join(' & ');
  }
  return stripModuleSpecifiers(checker.typeToString(branch, undefined, TYPE_PRINT_FLAGS));
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props

// The literal defaults a component's body writes into its destructured props
// parameter, by the prop name each binding reads (`{ tone: t = 'info' }` is
// `tone`). A default that is not a literal - a call, a constant, a template
// with a substitution - says nothing a schema can hold, so it is named in
// `cannotExtract` rather than evaluated or dropped in silence.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
function destructuredDefaults(param: ts.ParameterDeclaration, cannotExtract: string[]): Record<string, PropDefault> {
  const defaults: Record<string, PropDefault> = {};
  if (!ts.isObjectBindingPattern(param.name)) return defaults;
  for (const element of param.name.elements) {
    if (element.dotDotDotToken !== undefined || element.initializer === undefined) continue;
    const key = element.propertyName ?? element.name;
    const name = ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
    if (name === undefined) continue;
    const value = literalValue(element.initializer);
    if (value === undefined) {
      cannotExtract.push(
        `default: prop "${name}" defaults to "${element.initializer.getText()}", which is not a literal - the body ` +
          `gives no single literal default for it`,
      );
      continue;
    }
    defaults[name] = value.value;
  }
  return defaults;
}

// The two other ways a body gives a prop its default, read only where the
// source leaves no doubt that the literal is what a caller who passes nothing
// gets, and the caller's own value what one who passes it gets:
//
//   - a destructured binding with no initializer that the body reads only as
//     `binding ?? <literal>` - every read, so no path sees the raw value;
//   - a literal attribute on the element the body returns, written before the
//     spread of the rest binding (or of the whole props parameter), for a prop
//     that is not destructured and so reaches the element only through that
//     spread - and not written again after it, which would override the caller.
//
// A read of the same shape that falls short - a `??` whose right side is not
// a literal, a binding read raw somewhere as well, an attribute on an element
// that is not the one returned - is noted rather than stated.
function bodyDefaults(
  param: ts.ParameterDeclaration,
  body: ts.Node,
  checker: ts.TypeChecker,
  propNames: ReadonlySet<string>,
  cannotExtract: string[],
): Record<string, PropDefault> {
  const defaults: Record<string, PropDefault> = {};
  // A parameter taken whole (`props`) and spread whole: every prop arrives
  // through it, as through a rest binding, and none is destructured.
  if (ts.isIdentifier(param.name)) {
    const whole = checker.getSymbolAtLocation(param.name);
    return whole === undefined ? defaults : attributesBeforeRest(body, whole, new Set(), propNames, checker, cannotExtract);
  }
  if (!ts.isObjectBindingPattern(param.name)) return defaults;
  const destructured = new Set<string>();
  let rest: ts.Symbol | undefined;
  for (const element of param.name.elements) {
    if (element.dotDotDotToken !== undefined) {
      if (ts.isIdentifier(element.name)) rest = checker.getSymbolAtLocation(element.name);
      continue;
    }
    const key = element.propertyName ?? element.name;
    const name = ts.isIdentifier(key) || ts.isStringLiteral(key) ? key.text : undefined;
    if (name === undefined) continue;
    destructured.add(name);
    if (element.initializer !== undefined || !ts.isIdentifier(element.name)) continue;
    // A default only for a prop the contract states, as for an attribute:
    // one coalesced for a forwarded attribute belongs to the element's
    // surface, which states no defaults.
    if (!propNames.has(name)) continue;
    const binding = checker.getSymbolAtLocation(element.name);
    if (binding === undefined) continue;
    const coalesced = coalescedDefault(binding, element.name, body, checker);
    if (coalesced === undefined) continue;
    if (coalesced.kind === 'literal') defaults[name] = coalesced.value;
    else cannotExtract.push(`default: prop "${name}" ${coalesced.why} - the body gives no single literal default for it`);
  }
  if (rest !== undefined) {
    for (const [name, value] of Object.entries(attributesBeforeRest(body, rest, destructured, propNames, checker, cannotExtract))) {
      defaults[name] = value;
    }
  }
  return defaults;
}

type KitFunction = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression;

// The function a value names, found through the value and never through its
// type: an import and a `const X = Y` chain are followed, and nothing else - a
// cast, a conditional, a `let`, a call such as a higher-order component or
// forwardRef, or an object member names a value whose type may say one
// component while another renders.
function namedFunction(expr: ts.Node, checker: ts.TypeChecker, depth = 0): KitFunction | undefined {
  const node = ts.isPropertyAccessExpression(expr) ? expr.name : expr;
  if (!ts.isIdentifier(node)) return undefined;
  return functionOfSymbol(checker.getSymbolAtLocation(node), checker, depth);
}

function functionOfSymbol(symbol: ts.Symbol | undefined, checker: ts.TypeChecker, depth: number): KitFunction | undefined {
  if (symbol === undefined || depth > 4) return undefined;
  const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const declaration = resolved.valueDeclaration;
  if (declaration === undefined) return undefined;
  if (ts.isFunctionDeclaration(declaration)) return declaration;
  if (!ts.isVariableDeclaration(declaration) || !(ts.getCombinedNodeFlags(declaration) & ts.NodeFlags.Const)) return undefined;
  const initializer = declaration.initializer;
  if (initializer === undefined) return undefined;
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) return initializer;
  return ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer)
    ? namedFunction(initializer, checker, depth + 1)
    : undefined;
}

// The body of a kit component: a function written in this package with a
// body that renders. An ambient declaration, a library's function or a helper
// that renders nothing answers undefined.
function kitComponentBody(fn: KitFunction | undefined, checker: ts.TypeChecker): ts.Node | undefined {
  if (fn === undefined || fn.body === undefined) return undefined;
  if (!isPackageSource(fn.getSourceFile().fileName)) return undefined;
  return renderingShape(fn.body, checker) ? fn.body : undefined;
}

// The kit component a body-less export names as a value: `export const X = Y`
// with `X` a const, or `export { Y as X } from '...'`.
function aliasedKitFunction(candidate: CandidateDeclaration, checker: ts.TypeChecker): KitFunction | undefined {
  if (ts.isExportSpecifier(candidate)) return functionOfSymbol(checker.getSymbolAtLocation(candidate.name), checker, 0);
  if (!ts.isVariableDeclaration(candidate) || !(ts.getCombinedNodeFlags(candidate) & ts.NodeFlags.Const)) return undefined;
  const initializer = candidate.initializer;
  return initializer !== undefined && (ts.isIdentifier(initializer) || ts.isPropertyAccessExpression(initializer))
    ? namedFunction(initializer, checker)
    : undefined;
}

// An alias's body: the aliased kit component's, when the value the alias
// names is that component and the alias's props parameter is its own.
function aliasedBody(
  candidate: CandidateDeclaration,
  param: ts.ParameterDeclaration | undefined,
  checker: ts.TypeChecker,
): ts.Node | undefined {
  const fn = aliasedKitFunction(candidate, checker);
  return fn !== undefined && param !== undefined && fn.parameters[0] === param ? kitComponentBody(fn, checker) : undefined;
}

// Whether a props type accepts a literal for one prop, in every branch that
// declares it.
function acceptsLiteral(paramType: ts.Type, name: string, value: PropDefault, location: ts.Node, checker: ts.TypeChecker): boolean {
  const nonNullable = checker.getNonNullableType(paramType);
  const declaring = (nonNullable.isUnion() ? nonNullable.types : [nonNullable])
    .map((branch) => branch.getProperty(name))
    .filter((prop): prop is ts.Symbol => prop !== undefined);
  if (declaring.length === 0) return false;
  const literal =
    value === null
      ? checker.getNullType()
      : typeof value === 'string'
        ? checker.getStringLiteralType(value)
        : typeof value === 'number'
          ? checker.getNumberLiteralType(value)
          : value
            ? checker.getTrueType()
            : checker.getFalseType();
  return declaring.every((prop) => checker.isTypeAssignableTo(literal, checker.getTypeOfSymbolAtLocation(prop, location)));
}

// The defaults a wrapper takes from the one kit component it renders. When
// the body returns that one element and passes it the props through a single
// spread of the rest binding (or of the whole props parameter), a prop the
// wrapper neither destructures, nor writes on the element, nor uses through
// that binding elsewhere reaches the inner component exactly as the caller
// gave it - absent when the caller passes nothing - so the value the inner
// body's binding takes for it is the wrapper's default too. Inner components
// are followed at most four levels down. Any other shape - another spread, a
// return beside it, a library or intrinsic element, a kit component reached
// through anything but an import or a const chain, the binding used as a
// whole beyond its spread - takes nothing. The inner body's notes stay with
// its own contract; the wrapper records one note for a prop it passes through
// whose default the inner contract notes rather than states, one for an
// inner default its own type for the prop does not accept, and one when the
// inner body leaves defaults unread without naming the props.
function inheritedDefaults(
  param: ts.ParameterDeclaration,
  body: ts.Node,
  checker: ts.TypeChecker,
  propNames: ReadonlySet<string>,
  own: ReadonlySet<string>,
  notes: string[],
  depth: number,
): Record<string, PropDefault> {
  const inherited: Record<string, PropDefault> = {};
  if (depth >= 4) return inherited;
  const { elements, ambiguous } = returnedElements(body);
  if (ambiguous || elements.length !== 1) return inherited;
  const element = elements[0];
  const destructured = new Set<string>();
  let spreadSymbol: ts.Symbol | undefined;
  if (ts.isIdentifier(param.name)) spreadSymbol = checker.getSymbolAtLocation(param.name);
  else if (ts.isObjectBindingPattern(param.name)) {
    for (const bindingElement of param.name.elements) {
      if (bindingElement.dotDotDotToken !== undefined) {
        if (ts.isIdentifier(bindingElement.name)) spreadSymbol = checker.getSymbolAtLocation(bindingElement.name);
        continue;
      }
      const key = bindingElement.propertyName ?? bindingElement.name;
      // A computed key leaves unread which props the rest still carries.
      if (!ts.isIdentifier(key) && !ts.isStringLiteral(key)) return inherited;
      destructured.add(key.text);
    }
  }
  if (spreadSymbol === undefined) return inherited;
  const attributes = attributesOf(element);
  const spreads = attributes.filter(ts.isJsxSpreadAttribute);
  const spread = spreads[0];
  if (
    spreads.length !== 1 ||
    !ts.isIdentifier(spread.expression) ||
    checker.getSymbolAtLocation(spread.expression) !== spreadSymbol
  ) {
    return inherited;
  }
  const written = new Set<string>();
  for (const attribute of attributes) {
    if (ts.isJsxAttribute(attribute)) written.add(attribute.name.getText());
  }
  if (ts.isJsxElement(element) && element.children.length > 0) written.add('children');
  const touched = otherUses(body, spreadSymbol, spread, checker);
  if (touched === 'all') return inherited;
  const tag = (ts.isJsxElement(element) ? element.openingElement : element).tagName;
  if (ts.isIdentifier(tag) && !/^[A-Z]/.test(tag.text)) return inherited;
  const innerFunction = namedFunction(tag, checker);
  const innerBody = kitComponentBody(innerFunction, checker);
  const innerParam = innerFunction?.parameters[0];
  if (innerBody === undefined || innerParam === undefined) return inherited;
  const innerType = checker.getNonNullableType(checker.getTypeAtLocation(innerParam));
  const innerNames = new Set(
    (innerType.isUnion() ? innerType.types : [innerType]).flatMap((branch) =>
      checker.getPropertiesOfType(branch).map((prop) => prop.getName()),
    ),
  );
  // The inner component's notes belong to its own contract; they are read
  // here only for the props they leave without a stated default.
  const scratch: string[] = [];
  const innerDefaults = destructuredDefaults(innerParam, scratch);
  for (const [name, value] of Object.entries(bodyDefaults(innerParam, innerBody, checker, innerNames, scratch))) {
    if (!Object.prototype.hasOwnProperty.call(innerDefaults, name)) innerDefaults[name] = value;
  }
  const innerOwn = new Set(Object.keys(innerDefaults));
  for (const [name, value] of Object.entries(
    inheritedDefaults(innerParam, innerBody, checker, innerNames, innerOwn, scratch, depth + 1),
  )) {
    if (!Object.prototype.hasOwnProperty.call(innerDefaults, name)) innerDefaults[name] = value;
  }
  const noted = new Set(
    scratch.map((note) => /^default: prop "([^"]+)"/.exec(note)?.[1]).filter((name): name is string => name !== undefined),
  );
  const passesThrough = (name: string): boolean =>
    propNames.has(name) && !own.has(name) && !destructured.has(name) && !written.has(name) && !touched.has(name);
  const paramType = checker.getTypeAtLocation(param);
  const innerName = tag.getText();
  for (const [name, value] of Object.entries(innerDefaults)) {
    if (!passesThrough(name)) continue;
    if (!acceptsLiteral(paramType, name, value, param, checker)) {
      notes.push(
        `default: prop "${name}" reaches ${innerName} untouched, whose default ${JSON.stringify(value)} this ` +
          `component's own type for the prop does not accept - not stated`,
      );
      continue;
    }
    inherited[name] = value;
  }
  for (const name of [...noted].sort()) {
    if (Object.prototype.hasOwnProperty.call(innerDefaults, name) || !passesThrough(name)) continue;
    notes.push(
      `default: prop "${name}" reaches ${innerName} untouched, whose contract notes its default rather than stating ` +
        `one - the body gives no single literal default for it`,
    );
  }
  // A note naming no prop - the rest spread on an element that is not the
  // one returned, under a conditional, or followed by another spread - says
  // the inner body leaves defaults unread without saying which, so any prop
  // passed through may have one this wrapper cannot state.
  const unread = scratch.some((note) => note.startsWith('default: ') && !note.startsWith('default: prop "'));
  if (unread && [...propNames].some(passesThrough)) {
    notes.push(
      `default: ${innerName}'s body leaves some defaults unread, so props reaching it untouched may have defaults ` +
        `not stated here`,
    );
  }
  return inherited;
}

type CoalescedDefault = { kind: 'literal'; value: PropDefault } | { kind: 'unsure'; why: string };

// How the body reads one destructured binding: undefined when it never reads
// it through `??`, the literal when every read is `binding ?? <that literal>`.
function coalescedDefault(
  binding: ts.Symbol,
  declaration: ts.Identifier,
  body: ts.Node,
  checker: ts.TypeChecker,
): CoalescedDefault | undefined {
  const values: PropDefault[] = [];
  let raw = false;
  let reassigned: string | undefined;
  let coalescingAssignment = false;
  let unreadable: string | undefined;
  let conditional: string | undefined;
  const visit = (node: ts.Node): void => {
    // A shorthand property (`cva({ variant })`) reads the binding too, but
    // the checker's symbol at that name is the property's, not the binding's.
    const symbol =
      ts.isIdentifier(node) && ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : ts.isIdentifier(node)
          ? checker.getSymbolAtLocation(node)
          : undefined;
    if (ts.isIdentifier(node) && node !== declaration && symbol === binding) {
      const parent = node.parent;
      const operator = ts.isBinaryExpression(parent) && parent.left === node ? parent.operatorToken.kind : undefined;
      if (
        operator !== undefined &&
        operator >= ts.SyntaxKind.FirstAssignment &&
        operator <= ts.SyntaxKind.LastAssignment
      ) {
        // `variant = ...`, `variant ??= 'solid'`: the body gives the binding a
        // value of its own, which a read of the parameter no longer shows. A
        // `??=` is itself a default written for the binding.
        reassigned = parent.getText();
        if (operator === ts.SyntaxKind.QuestionQuestionEqualsToken) coalescingAssignment = true;
      } else if (operator === ts.SyntaxKind.QuestionQuestionToken && ts.isBinaryExpression(parent)) {
        const value = literalValue(parent.right);
        if (value === undefined) unreadable = parent.right.getText();
        else values.push(value.value);
        conditional ??= conditionOver(parent, body);
      } else {
        raw = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  // Noted only where a default was read or written at all: a binding the
  // body reassigns and never coalesces (`if (size === undefined) size = 2`)
  // has no default to doubt, while `size ??= 2` writes one.
  if (reassigned !== undefined && (values.length > 0 || unreadable !== undefined || coalescingAssignment)) {
    return { kind: 'unsure', why: `is reassigned in the body (\`${reassigned}\`), so no read of the parameter is its default` };
  }
  if (reassigned !== undefined) return undefined;
  // Only literal fallbacks make a default. A computed one alone (`?? other`,
  // `?? defaultValue`) is a fallback chain or a controlled-value lookup, not a
  // default, so it records nothing; beside a literal one it leaves no single
  // default, which is noted.
  if (values.length === 0) return undefined;
  // A coalescing read on one branch of a condition (`compact ? 'sm' : (size
  // ?? 'md')`) is what renders only on that branch: on another the caller
  // who passes nothing gets something else.
  if (conditional !== undefined) {
    return {
      kind: 'unsure',
      why: `is read through \`??\` under a condition (\`${conditional}\`), so the literal is not what every caller who passes nothing gets`,
    };
  }
  if (unreadable !== undefined) {
    return { kind: 'unsure', why: `is read through \`??\` with a literal and with \`?? ${unreadable}\`, so no one literal is its default` };
  }
  if (raw) return { kind: 'unsure', why: 'is read through `??` and also as its own value, so no one literal is its default' };
  const distinct = [...new Set(values.map((value) => JSON.stringify(value)))];
  if (distinct.length > 1) return { kind: 'unsure', why: `is read through \`??\` with ${distinct.length} different literals` };
  return { kind: 'literal', value: values[0] };
}

// The condition a read sits under inside the body, as its text: a ternary's
// branch, the right side of `&&`, `||` or `??`, an `if`'s branch or a switch
// case. Undefined when every path through the body reaches the read.
function conditionOver(read: ts.Node, body: ts.Node): string | undefined {
  let child = read;
  for (let node = read.parent; node !== undefined && child !== body; child = node, node = node.parent) {
    if (ts.isConditionalExpression(node) && child !== node.condition) return node.condition.getText();
    if (
      ts.isBinaryExpression(node) &&
      child === node.right &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      return node.left.getText();
    }
    if (ts.isIfStatement(node) && child !== node.expression) return node.expression.getText();
    if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return ts.isCaseClause(node) ? `case ${node.expression.getText()}` : 'default';
    if (node === body) break;
  }
  return undefined;
}

// The literal attributes written before the rest spread on the element the
// body returns, for props the rest carries. The element must be the one
// every return renders, so its attributes are what the component renders.
function attributesBeforeRest(
  body: ts.Node,
  rest: ts.Symbol,
  destructured: ReadonlySet<string>,
  propNames: ReadonlySet<string>,
  checker: ts.TypeChecker,
  cannotExtract: string[],
): Record<string, PropDefault> {
  const defaults: Record<string, PropDefault> = {};
  const { elements: returned, ambiguous } = returnedElements(body);
  const spreadsRest = (attribute: ts.JsxAttributeLike): boolean =>
    ts.isJsxSpreadAttribute(attribute) &&
    ts.isIdentifier(attribute.expression) &&
    checker.getSymbolAtLocation(attribute.expression) === rest;
  // An attribute that could be a default: one naming a prop the contract
  // states, the rest carries, and that is written before the rest spread.
  const candidateBeforeRest = (element: ts.JsxElement | ts.JsxSelfClosingElement): boolean => {
    const attributes = attributesOf(element);
    const restAt = attributes.findIndex(spreadsRest);
    return attributes
      .slice(0, Math.max(restAt, 0))
      .some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          ts.isIdentifier(attribute.name) &&
          propNames.has(attribute.name.text) &&
          !destructured.has(attribute.name.text),
      );
  };
  // Every element in the body's own markup that spreads the rest after a
  // candidate attribute - under a conditional, an `as` expression, a nested
  // element - not only those returned outright, so one the walk cannot state
  // is still noted.
  const spreading = elementsIn(body).filter(candidateBeforeRest);
  const onlyReturned = returned.length === 1 && !ambiguous ? returned[0] : undefined;
  if (onlyReturned === undefined || spreading.some((element) => element !== onlyReturned)) {
    if (spreading.length > 0) {
      cannotExtract.push(
        'default: the rest props are spread on an element that is not the one element the body returns - under a ' +
          'conditional, beside another return, or nested inside it - so literal attributes written before the spread ' +
          'are not stated as defaults',
      );
    }
    return defaults;
  }
  const attributes = attributesOf(onlyReturned);
  const restAt = attributes.findIndex(spreadsRest);
  if (restAt === -1) {
    // The rest spread under a conditional (`{...(off ? {} : props)}`): what
    // reaches the element depends on the condition, so nothing before it is
    // a default, and a candidate there is noted.
    const conditional = attributes.findIndex((attribute) => ts.isJsxSpreadAttribute(attribute) && mentions(attribute, rest, checker));
    const candidates = attributes
      .slice(0, Math.max(conditional, 0))
      .some(
        (attribute) =>
          ts.isJsxAttribute(attribute) &&
          ts.isIdentifier(attribute.name) &&
          propNames.has(attribute.name.text) &&
          !destructured.has(attribute.name.text),
      );
    if (conditional !== -1 && candidates) {
      cannotExtract.push(
        'default: the rest props are spread conditionally on the returned element - literal attributes written before ' +
          'that spread are not stated as defaults',
      );
    }
    return defaults;
  }
  // Another spread after the rest may carry any of the names written before
  // it, and then it, not the caller, decides the value.
  if (attributes.slice(restAt + 1).some(ts.isJsxSpreadAttribute)) {
    if (candidateBeforeRest(onlyReturned)) {
      cannotExtract.push(
        'default: another spread follows the rest spread on the returned element - literal attributes written before ' +
          'the rest are not stated as defaults',
      );
    }
    return defaults;
  }
  const touched = otherUses(body, rest, attributes[restAt], checker);
  for (const [index, attribute] of attributes.slice(0, restAt).entries()) {
    if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
    const name = attribute.name.text;
    // Not a prop of the component (removed with Omit, say): the rest cannot
    // carry it, so the attribute is the element's own and no default.
    if (destructured.has(name) || !propNames.has(name)) continue;
    // Another spread between the attribute and the rest spread may carry the
    // same name (`size="sm" {...ctx.itemProps} {...rest}`), and then it, not
    // the literal, is what a caller who passes nothing gets.
    if (attributes.slice(index + 1, restAt).some(ts.isJsxSpreadAttribute)) {
      cannotExtract.push(
        `default: prop "${name}" is written before the rest spread with another spread between them, which may carry ` +
          `it - the literal attribute is not stated as its default`,
      );
      continue;
    }
    // The body reads or writes the prop through the rest (or the whole props
    // object) somewhere else, or hands the object to something that can: the
    // value the element receives, or what the component does with it, is not
    // settled by the attribute alone.
    if (touched === 'all' || touched.has(name)) {
      cannotExtract.push(
        `default: prop "${name}" is also read or written through the rest binding in the body - the literal attribute ` +
          `before the spread is not stated as its default`,
      );
      continue;
    }
    const writtenAgain = attributes
      .slice(restAt + 1)
      .some((later) => ts.isJsxAttribute(later) && ts.isIdentifier(later.name) && later.name.text === name);
    if (writtenAgain) continue;
    const initializer = attribute.initializer;
    const expression =
      initializer === undefined
        ? undefined
        : ts.isStringLiteral(initializer)
          ? initializer
          : ts.isJsxExpression(initializer)
            ? initializer.expression
            : undefined;
    const value = initializer === undefined ? { value: true } : expression === undefined ? undefined : literalValue(expression);
    if (value === undefined) {
      cannotExtract.push(
        `default: prop "${name}" is written before the rest spread as "${initializer?.getText() ?? ''}", which is not a ` +
          `literal - the body gives no single literal default for it`,
      );
      continue;
    }
    defaults[name] = value.value;
  }
  return defaults;
}

// The JSX elements the body's own returns render as their outermost element
// (a concise arrow body counts as a return), and whether every return is one.
// Only a return that renders nothing - none at all, `null`, `undefined`,
// `false` - may sit beside the element without casting doubt on it: a
// fragment, a call, an identifier, a conditional or an `as` expression renders
// something this walk does not read, and on that path the literal attribute
// is not what a caller gets.
function returnedElements(body: ts.Node): { elements: (ts.JsxElement | ts.JsxSelfClosingElement)[]; ambiguous: boolean } {
  const expressions: (ts.Expression | undefined)[] = [];
  if (!ts.isBlock(body)) expressions.push(ts.isExpression(body) ? body : undefined);
  else {
    const visit = (node: ts.Node): void => {
      // Every nested function-like body - an arrow, a method, an accessor or a
      // class member - and every class returns for itself, not for the component.
      if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
      if (ts.isReturnStatement(node)) expressions.push(node.expression);
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(body, visit);
  }
  const elements: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
  let ambiguous = false;
  for (const expression of expressions) {
    let inner = expression;
    while (inner !== undefined && ts.isParenthesizedExpression(inner)) inner = inner.expression;
    if (inner !== undefined && (ts.isJsxElement(inner) || ts.isJsxSelfClosingElement(inner))) elements.push(inner);
    else if (!rendersNothing(inner)) ambiguous = true;
  }
  return { elements, ambiguous };
}

function rendersNothing(expr: ts.Expression | undefined): boolean {
  if (expr === undefined) return true;
  if (expr.kind === ts.SyntaxKind.NullKeyword || expr.kind === ts.SyntaxKind.FalseKeyword) return true;
  return ts.isIdentifier(expr) && expr.text === 'undefined';
}

// The symbol an identifier refers to as a value. A shorthand property
// (`useThing({ rest })`) refers to the binding it copies, while the
// checker's symbol at that name is the new property's.
function symbolOfReference(node: ts.Identifier, checker: ts.TypeChecker): ts.Symbol | undefined {
  return ts.isShorthandPropertyAssignment(node.parent) && node.parent.name === node
    ? checker.getShorthandAssignmentValueSymbol(node.parent)
    : checker.getSymbolAtLocation(node);
}

// Whether a node mentions a symbol anywhere inside it.
function mentions(node: ts.Node, symbol: ts.Symbol, checker: ts.TypeChecker): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (found) return;
    if (ts.isIdentifier(child) && symbolOfReference(child, checker) === symbol) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return found;
}

// Every use of the rest (or whole props) binding other than its spread onto
// the returned element: the prop names read or written through it
// (`rest.variant`, `rest['variant']`), or `all` when the body uses the object
// itself - reassigns it, hands it to a call, copies it, or reads it in a way
// that names no single prop - since then any prop it carries may be read or
// changed. Nested functions count: a closure over the object is a use of it.
function otherUses(body: ts.Node, rest: ts.Symbol, spread: ts.JsxAttributeLike, checker: ts.TypeChecker): Set<string> | 'all' {
  const names = new Set<string>();
  let all = false;
  const visit = (node: ts.Node): void => {
    if (all || node === spread) return;
    if (ts.isIdentifier(node) && symbolOfReference(node, checker) === rest && !ts.isBindingElement(node.parent) && !ts.isParameter(node.parent)) {
      const parent = node.parent;
      if (ts.isPropertyAccessExpression(parent) && parent.expression === node) names.add(parent.name.text);
      else if (
        ts.isElementAccessExpression(parent) &&
        parent.expression === node &&
        (ts.isStringLiteral(parent.argumentExpression) || ts.isNoSubstitutionTemplateLiteral(parent.argumentExpression))
      ) {
        names.add(parent.argumentExpression.text);
      } else all = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return all ? 'all' : names;
}

// Every JSX element in the body's own markup, outside nested function-like
// bodies and classes, which render for themselves.
function elementsIn(body: ts.Node): (ts.JsxElement | ts.JsxSelfClosingElement)[] {
  const elements: (ts.JsxElement | ts.JsxSelfClosingElement)[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return;
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) elements.push(node);
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  if (ts.isJsxElement(body) || ts.isJsxSelfClosingElement(body)) elements.unshift(body);
  return elements;
}

function attributesOf(element: ts.JsxElement | ts.JsxSelfClosingElement): readonly ts.JsxAttributeLike[] {
  return (ts.isJsxElement(element) ? element.openingElement : element).attributes.properties;
}

function literalValue(expr: ts.Expression): { value: PropDefault } | undefined {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { value: expr.text };
  if (ts.isNumericLiteral(expr)) return { value: Number(expr.text) };
  if (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expr.operand)) {
    return { value: -Number(expr.operand.text) };
  }
  if (expr.kind === ts.SyntaxKind.TrueKeyword) return { value: true };
  if (expr.kind === ts.SyntaxKind.FalseKeyword) return { value: false };
  if (expr.kind === ts.SyntaxKind.NullKeyword) return { value: null };
  return undefined;
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes

// Whether a props type may accept a name it does not list. A string-like
// index key does - a string, or a template literal such as `on${string}`; a
// number or symbol index admits no attribute name. So does any part of the
// type that is not fully known where the component is written: a type
// parameter (`props: P`), or one met in an intersection (`Base & P`), may be
// instantiated with any subtype, handlers included, as may an indexed access
// or a conditional type over one.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
function admitsUnlistedNames(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.flags & ts.TypeFlags.Instantiable) return true;
  if (type.isUnionOrIntersection()) return type.types.some((member) => admitsUnlistedNames(member, checker));
  return checker
    .getIndexInfosOfType(type)
    .some((info) => (info.keyType.flags & (ts.TypeFlags.String | ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringMapping)) !== 0);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
}

// The walk itself, over one already-resolved source file. Split from the
// program building below so the same walk can serve a per-file program (the
// artifact path) and a shared one (the counting path) without either being a
// copy of the other.
function extractFromSource(source: ts.SourceFile, program: ts.Program): ComponentExtraction[] {
  const checker = program.getTypeChecker();
  // Resolved once per walk rather than per export: it is a property of the
  // program, and the loop below asks it of every body-less initializer.
  const reactElement = resolveReactElementType(program, checker);
  const extractions: ComponentExtraction[] = [];

  for (const statement of source.statements) {
    // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
    const candidates: CandidateDeclaration[] = [];
    if (ts.isFunctionDeclaration(statement) && isNodeExported(statement)) {
      candidates.push(statement);
    } else if (ts.isVariableStatement(statement) && isNodeExported(statement)) {
      for (const decl of statement.declarationList.declarations) candidates.push(decl);
    } else if (isValueReExport(statement)) {
      for (const specifier of statement.exportClause.elements) {
        if (!specifier.isTypeOnly) candidates.push(specifier);
      }
    }
    // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates

    for (const candidate of candidates) {
      // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
      const shape = componentShape(candidate, checker, reactElement);
      if (!shape) continue;
      const name = ts.isFunctionDeclaration(candidate) ? candidate.name!.text : (candidate.name as ts.Identifier).text;
      // A re-export's name is the one it is exported under (`export { X as Y }`
      // is Y), which `name` above already is for an export specifier.
      // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates

      const cannotExtract: string[] = [];
      const param = firstParameter(candidate, shape, checker);
      const ownProps: ExtractedProp[] = [];
      const apiProps: ExtractedProp[] = [];
      const forwardedProps: ExtractedProp[] = [];
      const unclassifiedProps: ExtractedProp[] = [];
      let elementKind: string | undefined;
      let variantSourceLabels: string[] = [];
      let axes: Record<string, string[]> = {};
      let booleanAxes: string[] = [];
      let defaults: Record<string, string> = {};
      let propDefaults: Record<string, PropDefault> = {};
      // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates
      const candidateBody = componentBody(candidate, checker);
      const hasBody = candidateBody !== undefined;
      // The body the defaults are read from: the component's own, or, for an
      // alias, the body of the kit component it names as a value.
      const defaultsBody = shape.form === 'body' ? candidateBody : aliasedBody(candidate, param, checker);
      let admitsUnlistedProps = false;
      // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-candidates

      if (param) {
        // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
        // An alias's parameter is declared generically where the callable
        // type is (`FC<P>`'s `props: P`), so what it takes is the parameter
        // as the alias instantiates it, not as it is written there.
        const declaredType = checker.getTypeAtLocation(param);
        const instantiated =
          shape.form === 'alias' ? checker.getTypeOfSymbolAtLocation(shape.signature.getParameters()[0], param) : declaredType;
        const paramType = instantiated;
        const nonNullable = checker.getNonNullableType(paramType);
        admitsUnlistedProps = admitsUnlistedNames(nonNullable, checker);
        const walk: PropsTypeWalkResult = { kind: undefined, variantSources: [], axisFilters: new Map(), cannotExtract: [] };
        if (param.type && instantiated !== declaredType) {
          walkResolvedType(instantiated, param.type, checker, walk, new Set(), 0);
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
        } else if (param.type) {
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
          walkPropsType(param.type, checker, walk, new Set(), 0);
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
          variantSourceLabels = variantSourceLabelsOf(param.type, checker, cannotExtract);
        }
        // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
        elementKind = walk.kind;
        // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-heritage
        // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot
        cannotExtract.push(...walk.cannotExtract);
        // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-cannot

        // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
        const variantsResult = extractVariants(walk.variantSources, checker, cannotExtract, walk.axisFilters);
        axes = variantsResult.axes;
        booleanAxes = variantsResult.booleanAxes;
        defaults = variantsResult.defaults;
        // An alias of a kit component reads the defaults of the body it
        // aliases, as that component's own contract does; an alias of a
        // library's callable has no body of the kit's and reads none.
        if (defaultsBody !== undefined) propDefaults = destructuredDefaults(param, cannotExtract);
        // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
        // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props
        const axisNames = new Set(Object.keys(axes));

        for (const { symbol: prop, branches, declaringSymbols } of propsOfEveryBranch(paramType, checker)) {
          const propName = prop.getName();
          if (axisNames.has(propName)) continue;

          const declarations = prop.getDeclarations() ?? [];
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-undeclared-prop
          if (declarations.length === 0) {
            // A synthetic/computed property symbol (e.g. one instantiated
            // from a mapped type like `Record<'a' | 'b', string>`) carries
            // no declaration to point at - N4: own-vs-inherited classification
            // and declarationFile both depend on having one, so there is
            // nothing honest to report beyond "this prop could not be read",
            // rather than a placeholder declaration site passed off as data.
            cannotExtract.push(`prop "${propName}": no declaration found (a synthetic/computed property symbol) - cannot extract`);
            continue;
          }
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-undeclared-prop
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props
          // The component's own file first, so the declaration site reported
          // is the nearest one; any other file of this package next.
          const ownDeclaration =
            declarations.find((d) => d.getSourceFile().fileName === source.fileName) ??
            declarations.find((d) => isPackageSource(d.getSourceFile().fileName));
          // Then a wrapped library's own declaration: a library that restates
          // a React attribute in an intersection (`id`, `className` beside
          // `HTMLAttributes`) declares it as part of its component's API, and
          // taking whichever declaration the checker lists first filed it by
          // the order of the intersection instead.
          const declaration =
            ownDeclaration ??
            declarations.find((d) => {
              const site = classifyDeclarationSite(relativeDeclarationFile(d.getSourceFile().fileName, kitRoot));
              return site === 'primitive-library' || site === 'wrapped-library';
            }) ??
            declarations[0];
          const propType = checker.getTypeOfSymbolAtLocation(prop, param);
          // Printed without `undefined`, which every branch-only prop admits
          // and the joined text states once.
          const branchTexts = [
            ...new Set(
              (declaringSymbols ?? [prop]).map((symbol) =>
                printTypeText(checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, param)), param, checker),
              ),
            ),
          ];
          const extracted: ExtractedProp = {
            name: propName,
            // A prop only some branches declare is absent from the others, so
            // a caller may always leave it out.
            optional: branches !== undefined || (prop.flags & ts.SymbolFlags.Optional) !== 0,
            typeText: branches !== undefined ? `${branchTexts.join(' | ')} | undefined` : printTypeText(propType, param, checker),
            expressed: branchTexts.length > 1 ? undefined : expressType(propType, checker),
            declarationFile: relativeDeclarationFile(declaration.getSourceFile().fileName, kitRoot),
            jsDocDefault: jsDocDefault(prop),
            ...(branches === undefined ? {} : { branches }),
          };
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-props
          // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-file-class
          if (ownDeclaration) {
            ownProps.push(extracted);
          } else {
            switch (classifyDeclarationSite(extracted.declarationFile)) {
              case 'primitive-library':
              case 'wrapped-library':
                apiProps.push(extracted);
                break;
              case 'react-dom':
                forwardedProps.push(extracted);
                break;
              default:
                unclassifiedProps.push(extracted);
            }
          }
          // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-file-class
        }
      }

      // The defaults the body gives props other than by a destructured
      // default, read once the props are known: an attribute the returned
      // element carries is a default only for a prop the contract states - an
      // axis, a declared prop, a wrapped library's. A forwarded attribute
      // belongs to the element's surface, which states no defaults, so an
      // attribute written for one (`aria-label={label}`) is neither stated
      // nor noted.
      // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes
      if (param && defaultsBody !== undefined) {
        const propNames = new Set([...Object.keys(axes), ...[...ownProps, ...apiProps].map((prop) => prop.name)]);
        for (const [name, value] of Object.entries(bodyDefaults(param, defaultsBody, checker, propNames, cannotExtract))) {
          if (!Object.prototype.hasOwnProperty.call(propDefaults, name)) propDefaults[name] = value;
        }
        const own = new Set(Object.keys(propDefaults));
        for (const [name, value] of Object.entries(
          inheritedDefaults(param, defaultsBody, checker, propNames, own, cannotExtract, 0),
        )) {
          if (!Object.prototype.hasOwnProperty.call(propDefaults, name)) propDefaults[name] = value;
        }
      }
      // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-axes

      // Sorted by name before returning - N3: `checker.getPropertiesOfType`'s
      // iteration order is an undocumented TypeScript-internal detail (its
      // own symbol-table/intersection-merge order), not a fact about the
      // component. Left unsorted, a routine `typescript` version bump could
      // reorder a committed contract with no real prop change behind the
      // diff, or make a fresh compile on a different TypeScript patch
      // version disagree byte-for-byte with the commit that produced it -
      // exactly the machine-independence the rest of this file (absolute
      // path stripping, import(...) path normalization) already goes out of
      // its way to guarantee.
      // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-return
      const byName = (a: ExtractedProp, b: ExtractedProp): number => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
      for (const list of [ownProps, apiProps, forwardedProps, unclassifiedProps]) list.sort(byName);

      extractions.push({
        name,
        axes,
        booleanAxes,
        defaults,
        propDefaults,
        ownProps,
        apiProps,
        forwardedProps,
        unclassifiedProps,
        elementKind,
        hasBody,
        admitsUnlistedProps,
        variantSourceLabels,
        cannotExtract,
      });
      // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-return
    }
  }

  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-return
  return extractions;
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-return
}

// The extraction a contract is compiled from: its own program, over that file
// alone, so the result depends on the file and nothing else.
// @cpt-algo:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1
// @cpt-dod:cpt-frontx-ui-kit-dod-component-contracts-extraction:p1
export function extractComponent(tsxPath: string): ComponentExtraction[] {
  const cached = extractionCache.get(tsxPath);
  if (cached) return cached;

  // @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-program
  const program = ts.createProgram({ rootNames: [tsxPath], options: loadCompilerOptions() });
  const source = program.getSourceFile(tsxPath);
  if (!source) {
    throw new Error(`extract: ${tsxPath} was not found by the TypeScript program`);
  }
  const extractions = extractFromSource(source, program);
  // @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-program

  extractionCache.set(tsxPath, extractions);
  return extractions;
}

// Which exports of each given file are React components, for every file in
// one program instead of one program per file. Names only, and deliberately
// so: a name is not one of the things a shared program can move (see the
// note above the split), while the type text next to it is - so this answers
// the enrollment report's "n of m exports" and the guard's "does this directory
// describe every component it exports", and nothing that gets written down.
// It keeps its own cache for the same reason: an extraction taken from here
// must never reach compileContract through the artifact cache.
// @cpt-begin:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-shared-program
const componentNameCache = new Map<string, string[]>();

export function listComponentExportNames(tsxPaths: string[]): Map<string, string[]> {
  const wanted = tsxPaths.map((path) => resolve(path));
  const missing = wanted.filter((path) => !componentNameCache.has(path));
  if (missing.length > 0) {
    const program = ts.createProgram({ rootNames: missing, options: loadCompilerOptions() });
    for (const path of missing) {
      const source = program.getSourceFile(path);
      // A file the walk cannot read reports no components rather than
      // failing the whole batch - the enrollment report it feeds is never
      // supposed to fail a build, and one unreadable directory must not
      // take the other 62 down with it.
      let names: string[] = [];
      try {
        if (source) names = extractFromSource(source, program).map((extraction) => extraction.name);
      } catch {
        names = [];
      }
      componentNameCache.set(path, names);
    }
  }
  return new Map(wanted.map((path) => [path, componentNameCache.get(path) ?? []]));
}
// @cpt-end:cpt-frontx-ui-kit-algo-component-contracts-extraction:p1:inst-ex-shared-program

// Every top-level exported declaration name in a file, component or not -
// used only by check.ts's enrollment report (T6: data-table.tsx exports
// DataTable/DataTableSortButton alongside four non-component helpers/types -
// dataTableColumnHelper, dataTableFeatures, dataTableSelectionColumn,
// DataTableSelectionColumnLabels). extractComponent already excludes these
// correctly (componentShape requires an uppercase function/const that takes
// one of the three component forms - a body with JSX, a body returning the
// primitive library's useRender, or an alias of a component-typed callable;
// an interface or type alias is not even a value
// declaration), so the enrollment report's "N of M" count was never wrong - what was
// missing is a way to SHOW which exports were excluded and why, rather than
// leaving a reader to wonder if 2 of 6 exports means four are undescribed
// gaps or four were never components at all.
export function listExportedDeclarationNames(tsxPath: string): string[] {
  // Parsed, not compiled: every answer below is read off the syntax tree, so
  // building a program - and with it React, Base UI and the whole DOM lib -
  // to reach `source.statements` was 63 programs' worth of module resolution
  // spent on a question no checker was ever asked.
  const text = ts.sys.readFile(tsxPath);
  if (text === undefined) return [];
  const source = ts.createSourceFile(tsxPath, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const names: string[] = [];
  for (const statement of source.statements) {
    if (!isNodeExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      names.push(statement.name.text);
    } else if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name) names.push(statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) names.push(decl.name.text);
      }
    }
  }
  // A re-export carries no export modifier: `export` is the statement itself.
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.exportClause === undefined) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const specifier of statement.exportClause.elements) names.push(specifier.name.text);
  }
  return names;
}
