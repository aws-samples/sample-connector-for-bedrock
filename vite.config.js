import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue2";
import path from "path";
import vueJsx from "@vitejs/plugin-vue2-jsx";

// https://vite.dev/config/
export default defineConfig({
  base: "/manager/",
  plugins: [vueJsx(), vue()],
  server: {
    port: 8080,
  },
  build: {
    sourcemap: false,
    outDir: path.resolve(__dirname, "dist/frontend"),
    rollupOptions: {
      // input: path.resolve(__dirname, "src-frontend/index.html"), // 指定入口 HTML 文件

      output: {
        entryFileNames: "js/[name]-[hash].js",
        chunkFileNames: "js/[name]-[hash].js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "css/[name]-[hash][extname]";
          }
          if (
            assetInfo.name &&
            /\.(png|jpe?g|gif|svg|webp|avif|ico)$/.test(assetInfo.name)
          ) {
            return "img/[name]-[hash][extname]";
          }
          if (
            assetInfo.name &&
            /\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name)
          ) {
            return "fonts/[name]-[hash][extname]";
          }
          return "assets/[name]-[hash][extname]";
        },
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("vue")) return "vue";
            if (id.includes("kui-vue")) return "ui-lib";
            if (id.includes("dayjs")) return "dayjs";
            if (id.includes("vue-router") || id.includes("vuex"))
              return "vue-vendor";
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src-frontend"),
    },
    extensions: [".js", ".ts", ".jsx", ".tsx", ".json", ".vue"],
  },
});
