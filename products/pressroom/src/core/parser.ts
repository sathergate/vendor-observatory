/**
 * Zero-dependency content file parsers.
 */

export interface ParsedFrontmatter {
  data: Record<string, unknown>;
  content: string;
}

// ---------------------------------------------------------------------------
// YAML frontmatter parser (basic, zero-dep)
// ---------------------------------------------------------------------------

/**
 * Parse a raw file string that may contain YAML frontmatter delimited by `---`.
 * Returns the parsed data object and the remaining content body.
 */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---")) {
    return { data: {}, content: raw };
  }

  const endIndex = trimmed.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { data: {}, content: raw };
  }

  const yamlBlock = trimmed.slice(4, endIndex).trim();
  const content = trimmed.slice(endIndex + 4).trim();
  const data = parseYaml(yamlBlock);

  return { data, content };
}

/**
 * Minimal YAML parser supporting:
 * - Strings (quoted and unquoted)
 * - Numbers, booleans, null, dates
 * - Arrays (- item)
 * - Nested objects (indent-based)
 */
export function parseYaml(yaml: string): Record<string, unknown> {
  const lines = yaml.split("\n");
  return parseYamlLines(lines, 0).value as Record<string, unknown>;
}

interface ParseResult {
  value: unknown;
  consumed: number;
}

function parseYamlLines(
  lines: string[],
  baseIndent: number,
): { value: Record<string, unknown>; consumed: number } {
  const result: Record<string, unknown> = {};
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments
    if (line.trim() === "" || line.trim().startsWith("#")) {
      i++;
      continue;
    }

    const currentIndent = line.length - line.trimStart().length;
    if (currentIndent < baseIndent) break;
    if (currentIndent > baseIndent) break;

    const trimmedLine = line.trim();

    // key: value
    const colonIdx = trimmedLine.indexOf(":");
    if (colonIdx === -1) {
      i++;
      continue;
    }

    const key = trimmedLine.slice(0, colonIdx).trim();
    const rawValue = trimmedLine.slice(colonIdx + 1).trim();

    if (rawValue === "" || rawValue === "|" || rawValue === ">") {
      // Check if next lines are array items or nested object
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const nextTrimmed = nextLine.trim();
        const nextIndent = nextLine.length - nextLine.trimStart().length;

        if (nextIndent > baseIndent && nextTrimmed.startsWith("- ")) {
          // Array
          const arr: unknown[] = [];
          let j = i + 1;
          while (j < lines.length) {
            const arrLine = lines[j];
            const arrTrimmed = arrLine.trim();
            const arrIndent = arrLine.length - arrLine.trimStart().length;
            if (arrTrimmed === "" || arrTrimmed.startsWith("#")) {
              j++;
              continue;
            }
            if (arrIndent < nextIndent) break;
            if (arrTrimmed.startsWith("- ")) {
              arr.push(parseScalar(arrTrimmed.slice(2).trim()));
            }
            j++;
          }
          result[key] = arr;
          i = j;
          continue;
        } else if (nextIndent > baseIndent) {
          // Nested object
          const nested = parseYamlLines(lines.slice(i + 1), nextIndent);
          result[key] = nested.value;
          i = i + 1 + nested.consumed;
          continue;
        }
      }
      // Multiline string (| or >) — collect indented lines
      if (rawValue === "|" || rawValue === ">") {
        const strParts: string[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const sLine = lines[j];
          const sIndent = sLine.length - sLine.trimStart().length;
          if (sLine.trim() === "") {
            strParts.push("");
            j++;
            continue;
          }
          if (sIndent <= baseIndent) break;
          strParts.push(sLine.trim());
          j++;
        }
        const sep = rawValue === "|" ? "\n" : " ";
        result[key] = strParts.join(sep);
        i = j;
        continue;
      }
      result[key] = null;
      i++;
      continue;
    }

    // Inline array: [a, b, c]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      const inner = rawValue.slice(1, -1);
      result[key] = inner
        .split(",")
        .map((s) => parseScalar(s.trim()))
        .filter((v) => v !== "");
      i++;
      continue;
    }

    result[key] = parseScalar(rawValue);
    i++;
  }

  return { value: result, consumed: i };
}

function parseScalar(value: string): unknown {
  if (value === "" || value === "null" || value === "~") return null;
  if (value === "true") return true;
  if (value === "false") return false;

  // Quoted string
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  // ISO date (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d;
  }

  return value;
}

// ---------------------------------------------------------------------------
// JSON parser
// ---------------------------------------------------------------------------

export function parseJSON(content: string): Record<string, unknown> {
  return JSON.parse(content) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Basic markdown structure parser
// ---------------------------------------------------------------------------

export interface MarkdownStructure {
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  raw: string;
}

export function parseMarkdown(content: string): MarkdownStructure {
  const headings: Array<{ level: number; text: string }> = [];
  const paragraphs: string[] = [];
  const lines = content.split("\n");
  let currentParagraph = "";

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = "";
      }
      headings.push({
        level: headingMatch[1].length,
        text: headingMatch[2],
      });
      continue;
    }

    if (line.trim() === "") {
      if (currentParagraph.trim()) {
        paragraphs.push(currentParagraph.trim());
        currentParagraph = "";
      }
    } else {
      currentParagraph += (currentParagraph ? " " : "") + line.trim();
    }
  }

  if (currentParagraph.trim()) {
    paragraphs.push(currentParagraph.trim());
  }

  return { headings, paragraphs, raw: content };
}
