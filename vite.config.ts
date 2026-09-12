import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: { outDir: "dist" },
  test: { include: ["tests/**/*.test.ts"], setupFiles: ["tests/setup.ts"] },
} as any);
