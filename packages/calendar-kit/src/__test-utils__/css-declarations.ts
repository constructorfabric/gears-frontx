const splitSelectors = (value: string): string[] => {
  const selectors: string[] = [];

  let current = "";
  let parentheses = 0;
  let brackets = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;

  for (const character of value) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }

    if (character === "\\") {
      current += character;
      escaped = true;
      continue;
    }

    if (quote !== undefined) {
      current += character;

      if (character === quote) {
        quote = undefined;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      current += character;
      quote = character;
      continue;
    }

    if (character === "(") {
      parentheses += 1;
    } else if (character === ")" && parentheses > 0) {
      parentheses -= 1;
    } else if (character === "[") {
      brackets += 1;
    } else if (character === "]" && brackets > 0) {
      brackets -= 1;
    } else if (character === "," && parentheses === 0 && brackets === 0) {
      selectors.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  selectors.push(current.trim());

  return selectors;
};

/* Declarations for one literal `selector` in a `?raw` CSS module; `composes` lines are skipped. */
export const declarations = (
  css: string,
  selector: string
): Map<string, string> => {
  const requestedSelector = selector.trim();
  const requestedSelectors = splitSelectors(requestedSelector);
  let best: Map<string, string> | undefined;
  let bestPriority = 0;
  let searchFrom = 0;

  while (searchFrom < css.length) {
    const start = css.indexOf("{", searchFrom);

    if (start === -1) {
      break;
    }

    const previousRuleEnd = css.lastIndexOf("}", start);
    const rawPrelude = css.slice(previousRuleEnd + 1, start);
    const lastCommentEnd = rawPrelude.lastIndexOf("*/");

    const prelude =
      lastCommentEnd === -1 ? rawPrelude : rawPrelude.slice(lastCommentEnd + 2);

    const selectors = splitSelectors(prelude);
    const groupedExactMatch =
      selectors.length === requestedSelectors.length &&
      selectors.every((item, index) => item === requestedSelectors[index]);

    const exactMatch =
      requestedSelectors.length === 1
        ? selectors.includes(requestedSelector)
        : groupedExactMatch;

    const suffixMatch =
      requestedSelectors.length === 1 &&
      selectors.some((item) => item.endsWith(` ${requestedSelector}`));

    if (exactMatch || suffixMatch) {
      let priority = 1;

      if (exactMatch) {
        priority = selectors.length === 1 ? 3 : 2;
      }

      if (priority > bestPriority) {
        const end = css.indexOf("}", start);
        const body = css.slice(start, end);
        const found = new Map<string, string>();

        for (const rawLine of body.slice(1).split(";")) {
          const commentEnd = rawLine.lastIndexOf("*/");

          const line =
            commentEnd === -1 ? rawLine : rawLine.slice(commentEnd + 2);

          const separator = line.indexOf(":");
          const property = line.slice(0, separator).trim();

          if (separator > 0 && !line.trim().startsWith("composes")) {
            const value = line
              .slice(separator + 1)
              .replaceAll(/\s*\n\s*/gu, " ")
              .trim()
              .replaceAll("( ", "(")
              .replaceAll(" )", ")");
            found.set(property, value);
          }
        }

        best = found;
        bestPriority = priority;
      }
    }

    searchFrom = css.indexOf("}", start) + 1;

    if (searchFrom === 0) {
      break;
    }
  }

  if (best !== undefined) {
    return best;
  }

  throw new Error(`No rule for ${selector}`);
};
