/* eslint-disable @typescript-eslint/no-var-requires */
const path = require("path");
const webpack = require("webpack");

const version = require("./package.json").version;
const downloadUrl = "https://raw.githubusercontent.com/mashutong/BilibiliSponsorBlock-AI-Userscript/main/bsb-ai.user.js";
const metadata = [
    "// ==UserScript==",
    "// @name         小电视空降助手 AI 字幕补充",
    "// @namespace    https://github.com/mashutong/BilibiliSponsorBlock-AI-Userscript",
    `// @version      ${version}`,
    "// @description 仅在原版服务端无片段时，分析五分钟以上的 B 站视频字幕并跳过广告",
    "// @match        https://www.bilibili.com/video/*",
    "// @match        https://www.bilibili.com/list/*",
    "// @run-at       document-idle",
    "// @noframes",
    "// @grant        unsafeWindow",
    "// @grant        GM_xmlhttpRequest",
    "// @grant        GM_getValue",
    "// @grant        GM_setValue",
    "// @grant        GM_deleteValue",
    "// @grant        GM_registerMenuCommand",
    "// @connect      api.bilibili.com",
    "// @connect      subtitle.bilibili.com",
    "// @connect      hdslb.com",
    "// @connect      www.bsbsb.top",
    "// @connect      www.bsbsb.xyz",
    "// @connect      api.deepseek.com",
    `// @updateURL    ${downloadUrl}`,
    `// @downloadURL  ${downloadUrl}`,
    "// @license      GPL-3.0-only",
    "// ==/UserScript==",
].join("\n");

module.exports = {
    mode: "production",
    target: "web",
    entry: path.join(__dirname, "src/index.ts"),
    output: {
        path: __dirname,
        filename: "bsb-ai.user.js",
        iife: true,
        clean: false,
    },
    devtool: false,
    optimization: { minimize: false },
    module: {
        rules: [{
            test: /\.ts$/,
            loader: "ts-loader",
            exclude: /node_modules/,
            options: { transpileOnly: true, configFile: path.join(__dirname, "tsconfig.json") },
        }],
    },
    resolve: { extensions: [".ts", ".js"] },
    plugins: [new webpack.BannerPlugin({ banner: metadata, raw: true, entryOnly: true })],
};
