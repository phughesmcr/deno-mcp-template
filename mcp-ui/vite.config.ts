import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    outDir: path.resolve(root, "../static/mcp-apps"),
    emptyOutDir: false,
    cssMinify: true,
    minify: true,
    rollupOptions: {
      input: path.resolve(root, "fetch-website-info.html"),
    },
  },
});
