import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/react.tsx", "src/next.ts"],
    format: ["esm"],
    dts: true,
    splitting: false,
    clean: true,
    external: ["react", "next"],
  },
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    splitting: false,
    clean: false,
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
