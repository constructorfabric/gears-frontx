import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { buildPlugin } from "./scripts/build-plugin";

export default defineConfig({
  plugins: [react(), ...buildPlugin()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
