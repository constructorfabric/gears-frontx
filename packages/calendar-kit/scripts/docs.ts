/** Fills `<!-- generated:props|messages|example ARG -->` regions; `--check` reports stale files. */

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "..");

const REGION =
  /<!-- generated:(?<kind>props|messages|example) (?<arg>\S+) -->\n[\s\S]*?<!-- \/generated -->/gu;

// Props a component inherits instead of declaring: text from the localization module, the
// viewer zone from the context module.
const CONTEXT_SOURCES: ReadonlySet<string> = new Set([
  path.join("src", "i18n", "calendar-context.tsx"),
  path.join("src", "i18n", "calendar-localization.ts"),
]);

const I18N_GUIDE = path.join("src", "docs", "i18n.md");

const MAX_TYPE_LENGTH = 90;

const PRINT_WIDTH = 80;

interface PropRow {
  readonly name: string;
  readonly type: string;
  readonly required: boolean;
  readonly description: string;
  readonly fromContext: boolean;
}

interface DocsProgram {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
}

const hasFlag = (flags: number, flag: number): boolean =>
  (flags & flag) !== 0;

// tsconfig.tools has no Array#toSorted.
const sorted = <T>(
  values: readonly T[],
  compare?: (left: T, right: T) => number
): T[] =>
  [...values].sort(compare);

const readFile = (file: string): string | undefined => ts.sys.readFile(file);

const createDocsProgram = (): DocsProgram => {
  const config = ts.readConfigFile(path.join(ROOT, "tsconfig.json"), readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, ROOT);
  const program = ts.createProgram(parsed.fileNames, {
    ...parsed.options,
    noEmit: true,
  });

  return { checker: program.getTypeChecker(), program };
};

const findExportedSymbol = (
  { checker, program }: DocsProgram,
  name: string
): ts.Symbol => {
  const entry = program.getSourceFile(path.join(ROOT, "src", "index.ts"));
  const moduleSymbol = entry && checker.getSymbolAtLocation(entry);
  const exported =
    moduleSymbol &&
    checker
      .getExportsOfModule(moduleSymbol)
      .find((symbol) => symbol.name === name);

  if (exported === undefined) {
    throw new Error(`${name} is not exported from src/index.ts`);
  }

  return hasFlag(exported.flags, ts.SymbolFlags.Alias)
    ? checker.getAliasedSymbol(exported)
    : exported;
};

const escapeCell = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll(/\s+/gu, " ");

const formatType = (text: string): string => {
  const cleaned = text.replaceAll(/import\("[^"]+"\)\./gu, "");

  return cleaned.length > MAX_TYPE_LENGTH
    ? `${cleaned.slice(0, MAX_TYPE_LENGTH - 1)}…`
    : cleaned;
};

const describeSymbol = (symbol: ts.Symbol, checker: ts.TypeChecker): string =>
  ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();

const toPropRow = ({ checker }: DocsProgram, property: ts.Symbol): PropRow => {
  const declaration = property.valueDeclaration ?? property.declarations?.[0];

  const propertyType =
    declaration === undefined
      ? checker.getDeclaredTypeOfSymbol(property)
      : checker.getTypeOfSymbolAtLocation(property, declaration);

  const required = !hasFlag(property.flags, ts.SymbolFlags.Optional);
  const typeText = checker.typeToString(
    required ? propertyType : checker.getNonNullableType(propertyType),
    undefined,
    ts.TypeFormatFlags.NoTruncation
  );

  const source =
    declaration === undefined
      ? ""
      : path.relative(ROOT, declaration.getSourceFile().fileName);

  return {
    description: describeSymbol(property, checker),
    fromContext: CONTEXT_SOURCES.has(source),
    name: property.name,
    required,
    type: formatType(typeText),
  };
};

const byRequiredThenName = (left: PropRow, right: PropRow): number => {
  if (left.required !== right.required) {
    return left.required ? -1 : 1;
  }

  return left.name.localeCompare(right.name);
};

const tableCells = (row: string): readonly string[] =>
  row
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());

// The package no longer ships a markdown formatter, so the generator emits the
// aligned table itself. A table too wide for the print width stays single-spaced,
// which is also how the previous formatter left it.
const formatTable = (lines: readonly string[]): readonly string[] => {
  const rows = lines.map(tableCells);
  const widths = (rows[0] ?? []).map((_, column) =>
    Math.max(3, ...rows.map((row) => (row[column] ?? "").length))
  );
  const paddedWidth =
    widths.reduce((total, width) => total + width, 0) + 3 * widths.length + 1;

  if (paddedWidth > PRINT_WIDTH) {
    return lines;
  }

  return rows.map((row, index) =>
    `| ${row
      .map((cell, column) =>
        index === 1
          ? "-".repeat(widths[column] ?? 0)
          : cell.padEnd(widths[column] ?? 0)
      )
      .join(" | ")} |`
  );
};

const renderProps = (docs: DocsProgram, name: string, file: string): string => {
  const symbol = findExportedSymbol(docs, name);
  const rows = sorted(
    docs.checker
      .getPropertiesOfType(docs.checker.getDeclaredTypeOfSymbol(symbol))
      .map((property) => toPropRow(docs, property)),
    byRequiredThenName
  );
  const own = rows.filter((row) => !row.fromContext);
  const shared = rows.filter((row) => row.fromContext);

  const lines = [
    ...formatTable([
      "| Prop | Type | Required | Description |",
      "| --- | --- | --- | --- |",
      ...own.map(
        (row) =>
          `| \`${row.name}\` | \`${escapeCell(row.type)}\` | ${row.required ? "yes" : ""} | ${escapeCell(row.description)} |`
      ),
    ]),
  ];

  if (shared.length > 0) {
    const names = shared.map((row) => `\`${row.name}\``).join(", ");

    lines.push(
      "",
      `Also accepts the shared props ${names}; see [Internationalization](${path.relative(path.dirname(file), I18N_GUIDE)}#per-component-overrides).`
    );
  }

  return lines.join("\n");
};

const TRANSLATIONS_PATH = path.join(ROOT, "src", "i18n", "en.json");

const PLACEHOLDER = /\{\{(?<name>\w+)\}\}/gu;

const readCatalogue = (file: string): Readonly<Record<string, string>> => {
  const raw: unknown = JSON.parse(fs.readFileSync(file, "utf-8"));

  if (typeof raw !== "object" || raw === null) {
    throw new Error(`${path.relative(ROOT, file)} must contain an object`);
  }

  return Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
};

const renderMessages = (prefix: string): string => {
  const translations = readCatalogue(TRANSLATIONS_PATH);
  const ids = Object.keys(translations)
    .filter((id) => id === prefix || id.startsWith(`${prefix}.`))
    .toSorted((left, right) => left.localeCompare(right));

  if (ids.length === 0) {
    throw new Error(`No built-in translation starts with ${prefix}`);
  }

  return formatTable([
    "| Translation ID | English | Values |",
    "| --- | --- | --- |",
    ...ids.map((id) => {
      const template = translations[id] ?? "";
      const values = [...template.matchAll(PLACEHOLDER)]
        .map((match) => `\`${match.groups?.name ?? ""}\``)
        .join(", ");

      return `| \`${id}\` | ${escapeCell(template)} | ${values} |`;
    }),
  ]).join("\n");
};

const renderExample = (file: string): string => {
  const source = fs.readFileSync(path.join(ROOT, file), "utf-8").trimEnd();
  const language = path.extname(file).slice(1);

  return `\`\`\`${language}\n// ${file}\n${source}\n\`\`\``;
};

const renderRegion = (
  docs: DocsProgram,
  file: string,
  kind: string,
  arg: string
): string => {
  if (kind === "props") {
    return renderProps(docs, arg, file);
  }

  if (kind === "messages") {
    return renderMessages(arg);
  }

  return renderExample(arg);
};

export const markdownFiles = (): readonly string[] =>
  sorted([
    ...fs.globSync("src/**/*.md", { cwd: ROOT }),
    ...fs.globSync("docs/**/*.md", { cwd: ROOT }),
    "README.md",
    "llms.txt",
  ]);

// Markdown needs a blank line between an HTML comment and an adjacent table or
// fenced block; a trailing paragraph sits against the comment.
const needsTrailingBlankLine = (content: string): boolean =>
  /^(?:\||```)/u.test(content.split("\n").at(-1) ?? "");

const regenerate = (
  docs: DocsProgram,
  file: string,
  markdown: string
): string =>
  markdown.replaceAll(REGION, (_region, kind: string, arg: string) => {
    const content = renderRegion(docs, file, kind, arg);
    const gap = needsTrailingBlankLine(content) ? "\n\n" : "\n";

    return `<!-- generated:${kind} ${arg} -->\n\n${content}${gap}<!-- /generated -->`;
  });

export const generateDocs = async (
  mode: "write" | "check"
): Promise<readonly string[]> => {
  const docs = createDocsProgram();
  const results = markdownFiles().map((file) => {
    const absolute = path.join(ROOT, file);
    const current = fs.readFileSync(absolute, "utf-8");
    const next = regenerate(docs, file, current);

    return { absolute, changed: next !== current, file, next };
  });
  const stale = results.filter((result) => result.changed);

  if (mode === "write") {
    for (const { absolute, next } of stale) {
      fs.writeFileSync(absolute, next);
    }
  }

  return stale.map((result) => result.file);
};

if (import.meta.main) {
  const check = process.argv.includes("--check");
  const stale = await generateDocs(check ? "check" : "write");

  if (check && stale.length > 0) {
    console.error(
      `Generated docs are stale; run \`npm run docs\`:\n${stale.join("\n")}`
    );
    process.exitCode = 1;
  } else if (stale.length > 0) {
    console.log(`Updated:\n${stale.join("\n")}`);
  }
}
