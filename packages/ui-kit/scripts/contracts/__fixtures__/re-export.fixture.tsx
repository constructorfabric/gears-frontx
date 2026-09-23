// Fixture for extract.test.ts: a file that declares nothing and re-exports a
// primitive's component, a hook and a type, the form a directory takes when
// all it ships is the primitive's own provider under the kit's name. Only the
// component is a component; the hook starts lowercase and the type is no value.
export {
  DirectionProvider,
  useDirection,
  type DirectionProviderProps,
} from '@base-ui/react/direction-provider';
