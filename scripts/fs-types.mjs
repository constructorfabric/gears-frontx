/**
 * Directory-entry shape as returned by `fs.readdirSync`/`fs.promises.readdir`
 * with `{ withFileTypes: true }` — narrowed to the methods this repo's
 * scripts actually read off `fs.Dirent`, so unit tests can inject a
 * plain-object fake directory listing instead of constructing real `Dirent`
 * instances.
 *
 * Shared between `check-test-dependency-versions.mjs` and
 * `test-runner/discovery.mjs` so the two consumers cannot drift apart.
 *
 * @typedef {{ name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }} DirEntryLike
 */

export {};
