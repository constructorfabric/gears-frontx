/**
 * Joins the class names a component conditionally applies. The kit merges its
 * own variant classes internally, so nothing here needs to resolve conflicts -
 * a filter and a join is the whole job, and pulling a class-name library in
 * for it would be a dependency this package does not otherwise have.
 */
export const cx = (...values: Array<string | false | null | undefined>): string =>
  values.filter((value): value is string => typeof value === 'string' && value !== '').join(' ');
