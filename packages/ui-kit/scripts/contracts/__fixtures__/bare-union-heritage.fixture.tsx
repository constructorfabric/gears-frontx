// Fixture for extract.test.ts (N2): a bare union type directly in heritage
// position (an intersection member, not wrapped in a name the walk can
// resolve). A union of props types is walked branch by branch, the way its
// props are read, so nothing in it is left unread.
export interface RedProps {
  tone: 'red';
}

export interface BlueProps {
  tone: 'blue';
}

export type SwatchProps = (RedProps | BlueProps) & {
  label: string;
};

export function Swatch({ label }: SwatchProps) {
  return <span>{label}</span>;
}
