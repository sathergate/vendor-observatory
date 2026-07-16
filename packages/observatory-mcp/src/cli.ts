#!/usr/bin/env node

/**
 * CLI entry point for the Vendor Observatory MCP server.
 * Runs over stdio transport — designed to be invoked by Claude Code, Codex CLI, or Cursor.
 *
 * Usage:
 *   OBSERVATORY_URL=https://app.vendorobservatory.com \
 *   OBSERVATORY_API_KEY=obs_sk_... \
 *   npx @vendor-observatory/mcp
 */

import { StdioServerTransport } from "@modelcontextprotocol/server";
import { server } from "./mcp.js";

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Observatory MCP server failed to start:", err);
  process.exit(1);
});
