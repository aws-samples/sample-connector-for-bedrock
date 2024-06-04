const { defineConfig } = require('@vue/cli-service');
const path = require("path");

module.exports = defineConfig({
  publicPath: "./",
  outputDir: path.resolve(__dirname, "dist/public"),
  assetsDir: "./assets",
  transpileDependencies: true,
  lintOnSave: false, // no check
  configureWebpack: {
    resolve: {
      fallback: { path: require.resolve("path-browserify") },
      alias: {
        "@": path.resolve(__dirname, 'src-frontend')
      },
      extensions: ['.js', '.vue', '.json']
    },
    entry: {
      app: './src-frontend/main.js'
    },
  },
  chainWebpack: config => {
    config
      .plugin('html')
      .tap((args) =>{
        args[0].title = "Bedrock Connector";
        // args[0].favicon = path.resolve('./src-frontend/public/favicon.png');
        args[0].template = path.resolve('./src-frontend/public/index.html');
        return args
      } )
  },
  devServer: {
    port: 8080,
    // open: true,
    client: {
      overlay: false //Close error overlayer
    },
  }
})
