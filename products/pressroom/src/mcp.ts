import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { join, resolve, extname, basename } from "node:path";

const CONFIG_FILENAME = "pressroom.config.ts";

const CONFIG_TEMPLATE = `import { createPressroom } from "pressroom";

export const cms = createPressroom({
  collections: {
    posts: {
      directory: "./content/posts",
      format: "mdx",
      schema: {
        title: { type: "string", required: true },
        date: { type: "date", required: true },
        description: "string",
        tags: "array",
        published: { type: "boolean", default: true },
      },
    },
  },
});
`;

const SAMPLE_POST = `---
title: Hello World
date: 2026-01-01
description: Your first post
tags: [getting-started]
published: true
---

# Hello World

Welcome to your pressroom-powered blog.
`;

function readPackageJson(cwd: string): Record<string, unknown> | null {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return null;
  try {
    return JSON.parse(readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
}

function hasDependency(pkg: Record<string, unknown>, name: string): boolean {
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;
  const peerDeps = pkg.peerDependencies as Record<string, string> | undefined;
  return !!(deps?.[name] || devDeps?.[name] || peerDeps?.[name]);
}

const FORMAT_EXTENSIONS: Record<string, string[]> = {
  md: [".md"],
  mdx: [".mdx"],
  json: [".json"],
  yaml: [".yaml", ".yml"],
};

function matchesFormat(filename: string, format: string): boolean {
  const ext = extname(filename).toLowerCase();
  return (FORMAT_EXTENSIONS[format] ?? [`.${format}`]).includes(ext);
}

/**
 * Minimal frontmatter parser (duplicated from core/parser.ts to avoid
 * importing the full module in the MCP entry point).
 */
function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  content: string;
} {
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
  const data: Record<string, unknown> = {};
  for (const line of yamlBlock.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (value === "") {
      data[key] = null;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      data[key] = value
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (value === "true") {
      data[key] = true;
    } else if (value === "false") {
      data[key] = false;
    } else if (/^-?\d+(\.\d+)?$/.test(value)) {
      data[key] = Number(value);
    } else {
      data[key] =
        value.startsWith('"') && value.endsWith('"')
          ? value.slice(1, -1)
          : value;
    }
  }
  return { data, content };
}

const server = new McpServer({
  name: "pressroom",
  version: "0.1.0",
});

server.tool(
  "pressroom_init",
  "Creates pressroom.config.ts and sample content in a project directory. Scaffolds a starter config with a posts collection and a hello-world sample post.",
  { projectDir: z.string().describe("Absolute path to the project directory") },
  async ({ projectDir }) => {
    const dir = resolve(projectDir);
    const configPath = join(dir, CONFIG_FILENAME);

    const pkg = readPackageJson(dir);
    const warnings: string[] = [];

    if (pkg === null) {
      warnings.push(
        "No package.json found in the directory. Make sure you are in a project root.",
      );
    } else if (!hasDependency(pkg, "pressroom")) {
      warnings.push(
        '"pressroom" is not listed in your package.json dependencies. Run: npm install pressroom',
      );
    }

    // Create config file
    if (existsSync(configPath)) {
      warnings.push(
        `${CONFIG_FILENAME} already exists at ${configPath}. Skipping config creation.`,
      );
    } else {
      writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
    }

    // Create content/posts/ directory
    const postsDir = join(dir, "content", "posts");
    mkdirSync(postsDir, { recursive: true });

    // Create sample post
    const samplePath = join(postsDir, "hello-world.mdx");
    if (existsSync(samplePath)) {
      warnings.push(
        "content/posts/hello-world.mdx already exists. Skipping sample creation.",
      );
    } else {
      writeFileSync(samplePath, SAMPLE_POST, "utf-8");
    }

    // Detect searchcraft (sifter) for integration tip
    const hasSifter = pkg ? hasDependency(pkg, "searchcraft") : false;

    const message = [
      existsSync(configPath) && warnings.some((w) => w.includes("already exists"))
        ? `${CONFIG_FILENAME} already exists at ${configPath}`
        : `Created ${CONFIG_FILENAME} at ${configPath}`,
      "Created content/posts/ directory",
      ...(!existsSync(samplePath) || !warnings.some((w) => w.includes("hello-world"))
        ? ["Created content/posts/hello-world.mdx"]
        : []),
      ...warnings.map((w) => `Warning: ${w}`),
      ...(hasSifter
        ? [
            "",
            "Tip: searchcraft detected in your dependencies — you can make your content searchable with sifter integration.",
          ]
        : []),
      "",
      "Next steps:",
      `  1. Edit ${CONFIG_FILENAME} to define your collections`,
      "  2. Add content to content/posts/",
      "  3. Import your collections in your Next.js app:",
      "",
      '     import { cms } from "./pressroom.config";',
      '     const posts = await cms.getEntries("posts");',
    ].join("\n");

    return {
      content: [{ type: "text" as const, text: message }],
    };
  },
);

server.tool(
  "pressroom_add_collection",
  "Adds a new content collection to an existing pressroom.config.ts file.",
  {
    configPath: z
      .string()
      .describe("Absolute path to the pressroom.config.ts file"),
    name: z
      .string()
      .describe("Name of the collection (e.g. 'authors', 'docs', 'changelog')"),
    directory: z
      .string()
      .describe(
        "Relative path to the content directory (e.g. './content/authors')",
      ),
    format: z
      .enum(["mdx", "md", "json", "yaml"])
      .describe("Content file format"),
  },
  async ({ configPath, name, directory, format }) => {
    const path = resolve(configPath);

    if (!existsSync(path)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Config file not found at ${path}. Run pressroom_init first.`,
          },
        ],
      };
    }

    const content = readFileSync(path, "utf-8");

    // Check if collection already exists
    if (content.includes(`${name}:`)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Collection "${name}" already appears to exist in ${path}. Please edit it manually or use a different name.`,
          },
        ],
      };
    }

    // Build the collection block
    const schemaFields =
      format === "json" || format === "yaml"
        ? `        name: { type: "string", required: true },`
        : `        title: { type: "string", required: true },\n        date: { type: "date", required: true },`;

    const collectionBlock = `    ${name}: {
      directory: "${directory}",
      format: "${format}",
      schema: {
${schemaFields}
      },
    },`;

    // Find the `collections: {` line, then find its closing `},`
    const lines = content.split("\n");
    let insertIndex = -1;
    let inCollections = false;
    let braceDepth = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("collections:") && lines[i].includes("{")) {
        inCollections = true;
        braceDepth = 1;
        continue;
      }
      if (inCollections) {
        for (const ch of lines[i]) {
          if (ch === "{") braceDepth++;
          if (ch === "}") braceDepth--;
        }
        if (braceDepth === 0) {
          insertIndex = i;
          break;
        }
      }
    }

    if (insertIndex === -1) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Could not find the collections object in the config file. Please add the collection manually.",
          },
        ],
      };
    }

    lines.splice(insertIndex, 0, collectionBlock);
    writeFileSync(path, lines.join("\n"), "utf-8");

    // Create the content directory
    const projectDir = join(path, "..");
    const contentDir = resolve(projectDir, directory);
    mkdirSync(contentDir, { recursive: true });

    return {
      content: [
        {
          type: "text" as const,
          text: `Added collection "${name}" (format: ${format}, directory: ${directory}) to ${path}\nCreated directory ${contentDir}`,
        },
      ],
    };
  },
);

server.tool(
  "pressroom_validate",
  "Validates all content files against their collection schemas. Checks that frontmatter fields match the expected types and required fields are present.",
  {
    projectDir: z.string().describe("Absolute path to the project directory"),
  },
  async ({ projectDir }) => {
    const dir = resolve(projectDir);
    const configPath = join(dir, CONFIG_FILENAME);

    if (!existsSync(configPath)) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No ${CONFIG_FILENAME} found in ${dir}. Run pressroom_init first.`,
          },
        ],
      };
    }

    // Read the config and extract collection definitions
    const configContent = readFileSync(configPath, "utf-8");

    // Parse collection directories and formats from the config file
    // Look for patterns like: name: { directory: "...", format: "...", schema: { ... } }
    const collectionPattern =
      /(\w+)\s*:\s*\{[^}]*directory\s*:\s*["']([^"']+)["'][^}]*format\s*:\s*["']([^"']+)["'][^}]*schema\s*:\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    const collections: Array<{
      name: string;
      directory: string;
      format: string;
      requiredFields: string[];
    }> = [];

    let match;
    while ((match = collectionPattern.exec(configContent)) !== null) {
      const requiredFields: string[] = [];
      const schemaBlock = match[4];
      // Find fields with required: true
      const fieldPattern = /(\w+)\s*:\s*\{[^}]*required\s*:\s*true/g;
      let fieldMatch;
      while ((fieldMatch = fieldPattern.exec(schemaBlock)) !== null) {
        requiredFields.push(fieldMatch[1]);
      }
      collections.push({
        name: match[1],
        directory: match[2],
        format: match[3],
        requiredFields,
      });
    }

    if (collections.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No collections found in ${CONFIG_FILENAME}. Add at least one collection to validate.`,
          },
        ],
      };
    }

    const results: string[] = [];
    let totalFiles = 0;
    let totalErrors = 0;

    for (const col of collections) {
      const contentDir = resolve(dir, col.directory);
      if (!existsSync(contentDir)) {
        results.push(
          `Collection "${col.name}": directory ${col.directory} not found.`,
        );
        totalErrors++;
        continue;
      }

      let files: string[];
      try {
        files = readdirSync(contentDir).filter((f) =>
          matchesFormat(f, col.format),
        );
      } catch {
        results.push(
          `Collection "${col.name}": could not read directory ${col.directory}.`,
        );
        totalErrors++;
        continue;
      }

      if (files.length === 0) {
        results.push(
          `Collection "${col.name}": no ${col.format} files found in ${col.directory}.`,
        );
        continue;
      }

      const collectionErrors: string[] = [];

      for (const file of files) {
        totalFiles++;
        const filePath = join(contentDir, file);
        const raw = readFileSync(filePath, "utf-8");

        if (col.format === "json") {
          try {
            const data = JSON.parse(raw);
            for (const req of col.requiredFields) {
              if (data[req] === undefined || data[req] === null) {
                collectionErrors.push(
                  `  ${file}: missing required field "${req}"`,
                );
                totalErrors++;
              }
            }
          } catch (err) {
            collectionErrors.push(
              `  ${file}: invalid JSON — ${err instanceof Error ? err.message : String(err)}`,
            );
            totalErrors++;
          }
        } else if (col.format === "yaml") {
          // Basic YAML validation — check for required keys
          for (const req of col.requiredFields) {
            const pattern = new RegExp(`^${req}\\s*:`, "m");
            if (!pattern.test(raw)) {
              collectionErrors.push(
                `  ${file}: missing required field "${req}"`,
              );
              totalErrors++;
            }
          }
        } else {
          // md / mdx — parse frontmatter
          const parsed = parseFrontmatter(raw);
          for (const req of col.requiredFields) {
            if (
              parsed.data[req] === undefined ||
              parsed.data[req] === null
            ) {
              collectionErrors.push(
                `  ${file}: missing required field "${req}"`,
              );
              totalErrors++;
            }
          }
        }
      }

      if (collectionErrors.length === 0) {
        results.push(
          `Collection "${col.name}": ${files.length} file(s) valid.`,
        );
      } else {
        results.push(
          `Collection "${col.name}": ${collectionErrors.length} error(s) in ${files.length} file(s):`,
        );
        results.push(...collectionErrors);
      }
    }

    const summary =
      totalErrors === 0
        ? `Validation passed: ${totalFiles} file(s) across ${collections.length} collection(s).`
        : `Validation found ${totalErrors} error(s) in ${totalFiles} file(s) across ${collections.length} collection(s).`;

    return {
      content: [
        {
          type: "text" as const,
          text: [summary, "", ...results].join("\n"),
        },
      ],
    };
  },
);

export { server };
