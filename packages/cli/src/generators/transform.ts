// @cpt-algo:cpt-hai3-algo-cli-tooling-apply-migration:p2
import fs from 'fs-extra';
import { toPascalCase, toScreamingSnake, toCamelCase, escapeRegExp } from './utils.js';

/**
 * ID transformation map entry
 */
export interface IdTransformation {
  /** Original constant name (e.g., CHAT_SCREENSET_ID) */
  originalConstName: string;
  /** New constant name (e.g., CHAT_COPY_SCREENSET_ID) */
  newConstName: string;
  /** Original string value (e.g., 'chat') */
  originalValue: string;
  /** New string value (e.g., 'chatCopy') */
  newValue: string;
}

/**
 * Parse ids.ts file to extract ID constants
 * Uses simple regex parsing (sufficient for our controlled format)
 */
export async function parseIdsFile(
  idsFilePath: string
): Promise<IdTransformation[]> {
  const content = await fs.readFile(idsFilePath, 'utf-8');
  const transformations: IdTransformation[] = [];

  // Match: export const SOME_ID = 'value';
  const regex = /export\s+const\s+(\w+)\s*=\s*['"]([^'"]+)['"]/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    transformations.push({
      originalConstName: match[1],
      newConstName: match[1], // Will be updated later
      originalValue: match[2],
      newValue: match[2], // Will be updated later
    });
  }

  return transformations;
}

/**
 * Derive the suffix used when copying a screenset
 * e.g., 'chat' -> 'chatCopy' gives suffix 'Copy'
 * e.g., 'demo' -> 'demoV2' gives suffix 'V2'
 */
export function deriveCopySuffix(
  sourceScreensetId: string,
  targetScreensetId: string
): string {
  // If target starts with source, the suffix is the remainder
  if (targetScreensetId.startsWith(sourceScreensetId)) {
    return targetScreensetId.slice(sourceScreensetId.length);
  }
  // Otherwise, use PascalCase of target as suffix (fallback)
  return toPascalCase(targetScreensetId);
}

/**
 * Generate ID transformation map for screenset copy
 */
export function generateTransformationMap(
  sourceScreensetId: string,
  targetScreensetId: string,
  originalIds: IdTransformation[]
): IdTransformation[] {
  const sourceScreaming = toScreamingSnake(sourceScreensetId);
  const targetScreaming = toScreamingSnake(targetScreensetId);
  const suffix = deriveCopySuffix(sourceScreensetId, targetScreensetId);

  return originalIds.map((id) => {
    // Transform constant name: CHAT_SCREENSET_ID -> CHAT_COPY_SCREENSET_ID
    const newConstName = id.originalConstName.replace(
      new RegExp(`^${sourceScreaming}`, 'i'),
      targetScreaming
    );

    // Transform value: 'chat' -> 'chatCopy'
    let newValue = id.originalValue;
    if (id.originalValue === sourceScreensetId) {
      newValue = targetScreensetId;
    } else if (id.originalValue.startsWith(sourceScreensetId)) {
      // Handle cases like 'chat/threads' -> 'chatCopy/threads'
      newValue = id.originalValue.replace(sourceScreensetId, targetScreensetId);
    } else if (id.originalConstName.endsWith('_SCREEN_ID')) {
      // Screen IDs that don't contain the screenset ID need special handling
      // Add suffix to ensure unique routes
      // e.g., 'helloworld' -> 'helloworldCopy' (when copying demo to demoCopy)
      newValue = `${id.originalValue}${suffix}`;
    }

    return {
      originalConstName: id.originalConstName,
      newConstName,
      originalValue: id.originalValue,
      newValue,
    };
  });
}

/**
 * Transform file content using transformation map
 *
 * IMPORTANT: To avoid double-replacement when target contains source (e.g., chat -> chatCopy),
 * we use a two-pass approach with placeholders for certain transformations.
 */
// @cpt-begin:cpt-hai3-algo-cli-tooling-apply-migration:p2:inst-apply-transforms
export function transformContent(
  content: string,
  sourceScreensetId: string,
  targetScreensetId: string,
  transformations: IdTransformation[]
): string {
  let result = content;

  const sourcePascal = toPascalCase(sourceScreensetId);
  const targetPascal = toPascalCase(targetScreensetId);
  const sourceCamel = toCamelCase(sourceScreensetId);
  const targetCamel = toCamelCase(targetScreensetId);

  // Use unique placeholders to avoid double-replacement
  const PLACEHOLDER_PREFIX = '___FRONTX_TRANSFORM___';
  const placeholders = {
    targetCamel: `${PLACEHOLDER_PREFIX}CAMEL${PLACEHOLDER_PREFIX}`,
    targetPascal: `${PLACEHOLDER_PREFIX}PASCAL${PLACEHOLDER_PREFIX}`,
    targetScreensetId: `${PLACEHOLDER_PREFIX}ID${PLACEHOLDER_PREFIX}`,
  };

  // Transform ID constant names (SCREAMING_SNAKE_CASE already handled)
  for (const t of transformations) {
    if (t.originalConstName !== t.newConstName) {
      result = result.replace(
        new RegExp(`\\b${t.originalConstName}\\b`, 'g'),
        t.newConstName
      );
    }
  }

  // Transform string literal values from ids.ts (e.g., 'helloworld' -> 'demoCopyHelloworld')
  // This handles screen IDs and other IDs that have different values in source vs target
  for (const t of transformations) {
    if (t.originalValue !== t.newValue) {
      // Match the value in string literals (single, double, or template quotes)
      // Use word boundaries or string delimiters to avoid partial matches
      result = result.replace(
        new RegExp(`(['"\`])${escapeRegExp(t.originalValue)}\\1`, 'g'),
        `$1${t.newValue}$1`
      );
    }
  }

  // Transform import paths with screenset ID (e.g., ./screens/chat/ -> ./screens/chatCopy/)
  // Use placeholder to prevent double-replacement
  result = result.replace(
    new RegExp(`(import[^'"]+['"]\\.[^'"]*/)${sourceCamel}(/|['"])`, 'g'),
    `$1${placeholders.targetCamel}$2`
  );
  result = result.replace(
    new RegExp(`(import[^'"]+['"]\\.[^'"]*)/${sourceCamel}([A-Z])`, 'g'),
    `$1/${placeholders.targetCamel}$2`
  );

  // Transform dynamic import paths (e.g., import('./screens/chat/ChatScreen'))
  result = result.replace(
    new RegExp(`(import\\(['"]\\.[^'"]*/)${sourceCamel}(/|['"])`, 'g'),
    `$1${placeholders.targetCamel}$2`
  );
  result = result.replace(
    new RegExp(`(import\\(['"]\\.[^'"]*)/${sourceCamel}([A-Z])`, 'g'),
    `$1/${placeholders.targetCamel}$2`
  );

  // Transform PascalCase names (e.g., ChatScreenset -> ChatCopyScreenset)
  result = result.replace(
    new RegExp(`\\b${sourcePascal}(?=[A-Z]|Screenset|Screen|Events|Slice|State|Actions|Api)`, 'g'),
    placeholders.targetPascal
  );

  // Transform camelCase file references in imports (e.g., chatActions -> chatCopyActions)
  result = result.replace(
    new RegExp(`/${sourceCamel}(Actions|Events|Slice|Screen)`, 'g'),
    `/${placeholders.targetCamel}$1`
  );

  // Transform camelCase names (e.g., chatScreenset -> chatCopyScreenset)
  result = result.replace(
    new RegExp(`\\b${sourceCamel}(?=Screenset|Screen|Events|Slice|State)`, 'g'),
    placeholders.targetCamel
  );

  // Transform string literals with screenset ID (careful not to double-transform)
  // Only transform standalone screenset IDs, not compound ones
  result = result.replace(
    new RegExp(`(['"\`])${sourceScreensetId}\\1`, 'g'),
    `$1${placeholders.targetScreensetId}$1`
  );

  // Transform translation key paths containing screenset/screen IDs
  // e.g., 'menu_items.chat.label' -> 'menu_items.chatCopy.label'
  // Pattern: .sourceId. or .sourceId} or .sourceId: within template literals
  for (const t of transformations) {
    if (t.originalValue !== t.newValue) {
      // Match .originalValue. or .originalValue} or .originalValue: or .originalValue`
      result = result.replace(
        new RegExp(`\\.${escapeRegExp(t.originalValue)}([.}\`:]|$)`, 'g'),
        `.${t.newValue}$1`
      );
    }
  }

  // Replace all placeholders with actual values
  result = result.replace(new RegExp(placeholders.targetCamel, 'g'), targetCamel);
  result = result.replace(new RegExp(placeholders.targetPascal, 'g'), targetPascal);
  result = result.replace(new RegExp(placeholders.targetScreensetId, 'g'), targetScreensetId);

  return result;
}
// @cpt-end:cpt-hai3-algo-cli-tooling-apply-migration:p2:inst-apply-transforms

/**
 * Rename file or directory based on screenset ID transformation
 * Handles both files (ChatScreen.tsx) and directories (chat, Chat)
 */
export function transformFileName(
  fileName: string,
  sourceScreensetId: string,
  targetScreensetId: string
): string {
  const sourcePascal = toPascalCase(sourceScreensetId);
  const targetPascal = toPascalCase(targetScreensetId);
  const sourceCamel = toCamelCase(sourceScreensetId);
  const targetCamel = toCamelCase(targetScreensetId);

  // Exact match for directory names (e.g., 'chat' -> 'chatCopy')
  if (fileName === sourceCamel) {
    return targetCamel;
  }
  if (fileName === sourcePascal) {
    return targetPascal;
  }

  return fileName
    .replace(new RegExp(`^${sourcePascal}`, 'g'), targetPascal)
    .replace(new RegExp(`^${sourceCamel}`, 'g'), targetCamel)
    .replace(new RegExp(`${sourcePascal}(?=Screenset|Screen|Events|Slice)`, 'g'), targetPascal)
    .replace(new RegExp(`${sourceCamel}(?=Screenset|Screen|Events|Slice)`, 'g'), targetCamel);
}
