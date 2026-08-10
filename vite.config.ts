import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Config recomendada pela doc oficial do Tauri v2 para projetos React+Vite.
// https://v2.tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],

  // Tauri espera um dev server rodando em porta fixa (bate com devUrl no tauri.conf.json)
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1", // mesma escolha que você já tinha, boa pro WebKitGTK
    watch: {
      // não recompilar o frontend quando o Rust mudar
      ignored: ["**/src-tauri/**"],
    },
  },
});
