// Fixture for extract.test.ts: a component exported as a direct alias of a
// primitive, with no function body anywhere to read. Fifteen exports in the
// kit are written this way (`export const Dialog = DialogPrimitive.Root`),
// and every one of them is the ROOT of its directory - the first thing a
// consumer writes. `AliasedRoot` names the same primitive through a local
// const, so recognising it proves the check reads the initializer's type
// rather than the member expression's shape.
//
// `FormatPrice` is the counterexample the rule has to keep out: an alias of a
// callable that is not a component. Its return type is a `string`, which is a
// ReactNode - so a rule that asked only "is the return renderable" would file
// a number formatter as a component of this kit.
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';

export const Root = DialogPrimitive.Root;

const LocalRoot = DialogPrimitive.Root;
export const AliasedRoot = LocalRoot;

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' });
export const FormatPrice = currency.format;
