import React, {
  createContext,
  useContext,
  type ReactNode,
  type ReactElement,
} from "react";
import type { Pressroom, ContentEntry, CollectionSchema } from "./core/types.js";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const PressroomContext = createContext<Pressroom | null>(null);

export interface PressroomProviderProps {
  pressroom: Pressroom;
  children: ReactNode;
}

/** Provide the Pressroom instance to the component tree. */
export function PressroomProvider({ pressroom, children }: PressroomProviderProps): ReactElement {
  return (
    <PressroomContext.Provider value={pressroom}>{children}</PressroomContext.Provider>
  );
}

/** Access the Pressroom instance from context. */
export function usePressroom(): Pressroom {
  const ctx = useContext(PressroomContext);
  if (!ctx) {
    throw new Error("[pressroom] usePressroom must be used within a <PressroomProvider>.");
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// <Markdown /> renderer
// ---------------------------------------------------------------------------

export interface MarkdownProps {
  content: string;
  className?: string;
}

interface InlineToken {
  type: "text" | "bold" | "italic" | "code" | "link" | "image";
  text: string;
  href?: string;
  alt?: string;
}

function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  // Regex order matters: images before links, bold before italic
  const pattern =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]*)\]\(([^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      // Image: ![alt](src)
      tokens.push({ type: "image", text: match[1] ?? "", href: match[2], alt: match[1] });
    } else if (match[3] !== undefined) {
      // Link: [text](href)
      tokens.push({ type: "link", text: match[3], href: match[4] });
    } else if (match[5] !== undefined) {
      tokens.push({ type: "bold", text: match[5] });
    } else if (match[6] !== undefined) {
      tokens.push({ type: "italic", text: match[6] });
    } else if (match[7] !== undefined) {
      tokens.push({ type: "code", text: match[7] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", text: text.slice(lastIndex) });
  }

  return tokens;
}

function renderInline(tokens: InlineToken[]): ReactNode[] {
  return tokens.map((token, i) => {
    switch (token.type) {
      case "bold":
        return <strong key={i}>{token.text}</strong>;
      case "italic":
        return <em key={i}>{token.text}</em>;
      case "code":
        return <code key={i}>{token.text}</code>;
      case "link":
        return (
          <a key={i} href={token.href}>
            {token.text}
          </a>
        );
      case "image":
        return <img key={i} src={token.href} alt={token.alt ?? ""} />;
      default:
        return <React.Fragment key={i}>{token.text}</React.Fragment>;
    }
  });
}

/**
 * Render a markdown string to React elements.
 * Supports headings, paragraphs, bold, italic, inline code, links, images,
 * code blocks (fenced), and unordered/ordered lists.
 */
export function Markdown({ content, className }: MarkdownProps): ReactElement {
  const lines = content.split("\n");
  const elements: ReactElement[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Fenced code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={key++}>
          <code className={lang ? `language-${lang}` : undefined}>
            {codeLines.join("\n")}
          </code>
        </pre>,
      );
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const HeadingTag = `h${level}` as keyof React.JSX.IntrinsicElements;
      elements.push(
        React.createElement(HeadingTag, { key: key++ }, ...renderInline(parseInline(headingMatch[2]))),
      );
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*+]\s+/)) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+/)) {
        const itemText = lines[i].replace(/^\s*[-*+]\s+/, "");
        items.push(<li key={items.length}>{renderInline(parseInline(itemText))}</li>);
        i++;
      }
      elements.push(<ul key={key++}>{items}</ul>);
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: ReactNode[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(<li key={items.length}>{renderInline(parseInline(itemText))}</li>);
        i++;
      }
      elements.push(<ol key={key++}>{items}</ol>);
      continue;
    }

    // Paragraph (collect consecutive non-blank, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].match(/^#{1,6}\s/) &&
      !lines[i].trim().startsWith("```") &&
      !lines[i].match(/^\s*[-*+]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      elements.push(
        <p key={key++}>{renderInline(parseInline(paraLines.join(" ")))}</p>,
      );
    }
  }

  return <div className={className}>{elements}</div>;
}

// ---------------------------------------------------------------------------
// <ContentList />
// ---------------------------------------------------------------------------

export interface ContentListProps<S extends CollectionSchema = CollectionSchema> {
  entries: ContentEntry<S>[];
  renderItem: (entry: ContentEntry<S>, index: number) => ReactNode;
  className?: string;
}

/** Render a list of content entries. */
export function ContentList<S extends CollectionSchema = CollectionSchema>({
  entries,
  renderItem,
  className,
}: ContentListProps<S>): ReactElement {
  return <div className={className}>{entries.map((entry, i) => renderItem(entry, i))}</div>;
}
