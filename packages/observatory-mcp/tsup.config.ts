import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    mcp: "src/mcp.ts",
    cli: "src/cli.ts",
    client: "src/client.ts",
  },
  format: ["esm"],
  dts: false, // Disabled: MCP SDK v2 alpha has type compat issues with zod/v4 StandardSchemaWithJSON
  clean: true,
  target: "node22",
  // Shebang is added via source file (cli.ts has #!/usr/bin/env node)
});
