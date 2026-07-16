#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const HELP_TEXT = `
pressroom - Type-safe content collections for Next.js

Usage:
  pressroom <command> [options]

Commands:
  init     Scaffold a new pressroom project in the current directory
  build    Validate and build content collections

Options:
  --help   Show this help message
`;

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

function detectSifter(cwd: string): boolean {
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    return "searchcraft" in (allDeps ?? {});
  } catch {
    return false;
  }
}

function init() {
  const cwd = process.cwd();

  // Create pressroom.config.ts
  const configPath = join(cwd, "pressroom.config.ts");
  if (existsSync(configPath)) {
    console.log("pressroom.config.ts already exists, skipping.");
  } else {
    writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
    console.log("Created pressroom.config.ts");
  }

  // Create content/posts/ directory
  const postsDir = join(cwd, "content", "posts");
  mkdirSync(postsDir, { recursive: true });
  console.log("Created content/posts/");

  // Create sample post
  const samplePath = join(postsDir, "hello-world.mdx");
  if (existsSync(samplePath)) {
    console.log("content/posts/hello-world.mdx already exists, skipping.");
  } else {
    writeFileSync(samplePath, SAMPLE_POST, "utf-8");
    console.log("Created content/posts/hello-world.mdx");
  }

  // Detect sifter
  const hasSifter = detectSifter(cwd);
  if (hasSifter) {
    console.log(
      "\n// Tip: sifter detected in your dependencies — you can make your content searchable with sifter integration.",
    );
  }

  console.log(`
Done! Your pressroom project is ready.

Next steps:
  1. Edit pressroom.config.ts to define your collections
  2. Add content to content/posts/
  3. Import your collections in your Next.js app:

     import { cms } from "./pressroom.config";
     const posts = await cms.collections.posts.getAll();
`);
}

function build() {
  console.log(`pressroom build

To build and validate your content collections:

  1. Ensure pressroom.config.ts exists in your project root
  2. Run your Next.js build — pressroom validates content at build time
  3. Type errors in your content schema will surface as TypeScript errors

For production builds:
  next build    # pressroom validates content during the Next.js build step
`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP_TEXT.trim());
    process.exit(0);
  }

  switch (command) {
    case "init":
      init();
      break;
    case "build":
      build();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.log(HELP_TEXT.trim());
      process.exit(1);
  }
}

main();
