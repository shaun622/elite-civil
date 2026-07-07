import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Short commit for the build: Cloudflare Pages env, else local git, else dev. */
function shortSha(): string {
  const cf = process.env.CF_PAGES_COMMIT_SHA;
  if (cf) return cf.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

const appVersion = `${new Date().toISOString().slice(0, 10)}·${shortSha()}`;

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
