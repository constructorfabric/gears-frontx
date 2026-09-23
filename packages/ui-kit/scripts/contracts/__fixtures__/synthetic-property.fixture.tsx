// Fixture for extract.test.ts (N4): a mapped type (Record<'a' | 'b',
// string>) synthesizes property symbols with NO declaration at all -
// prop.getDeclarations() returns an empty array, not a real PropertySignature
// to point at. Own-vs-inherited classification and declarationFile both
// depend on having a declaration to compare against the component's own
// source file, so there is genuinely nothing honest to report for `a`/`b`
// beyond "could not read this prop", which is a cannotExtract entry rather
// than a placeholder string passed off as ordinary declarationFile data.
export type SyntheticProps = Record<'a' | 'b', string> & { own: string };

export function SyntheticWidget(props: SyntheticProps) {
  // Read, not spread: the mapped half of this props type is not assignable to
  // a <div>'s attributes, and the extraction reads the TYPE rather than the
  // render body, so the body only has to be real JSX over the props.
  return <div className={props.own} data-a={props.a} data-b={props.b} />;
}
