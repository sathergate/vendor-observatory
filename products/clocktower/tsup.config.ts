import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/next.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: ["next"],
  outDir: "dist",
  target: "es2022",
  splitting: true,
  sourcemap: true,
});
