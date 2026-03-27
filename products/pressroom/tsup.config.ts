import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/react.tsx", "src/next.ts", "src/cli.ts"],
  format: ["esm"],
  dts: true,
  splitting: true,
  clean: true,
  external: ["react", "next"],
  outDir: "dist",
  banner: ({ entryPoint }) =>
    entryPoint === "src/cli.ts"
      ? { js: "#!/usr/bin/env node" }
      : {},
});
