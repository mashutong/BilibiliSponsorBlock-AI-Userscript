# 小电视空降助手 AI 字幕补充脚本

这个 Tampermonkey 脚本与[原版小电视空降助手](https://chromewebstore.google.com/detail/eaoelafamejbnggahofapllmfhlhajdd)配合使用。原版继续处理已有的服务端片段和自身更新；脚本只在当前 BV/CID 没有原始片段时尝试 AI 字幕识别。

## 安装

1. 在 Chrome 安装原版小电视空降助手和 [Tampermonkey](https://www.tampermonkey.net/)。如果浏览器里还启用了带 AI 功能的修改版，请先停用修改版，避免两套跳转逻辑同时运行。
2. 在 `chrome://extensions` 的 Tampermonkey 详情页打开“允许用户脚本”（Chrome 138 及以上）。
3. 在 Tampermonkey 控制面板中从 URL 安装 [`bsb-ai.user.js`](https://raw.githubusercontent.com/mashutong/BilibiliSponsorBlock-AI-Userscript/main/bsb-ai.user.js)。
4. 打开 B 站视频页，点 Tampermonkey 图标，在本脚本菜单中选择“设置 DeepSeek API Key”。设置面板可直接保存、修改或清除 Key；每台设备各设置一次。脚本源码和 GitHub 仓库不包含 Key。

安装后，Tampermonkey 会根据脚本头部的 `@version`、`@updateURL`、`@downloadURL` 检查更新。若还希望新设备自动获得已安装的脚本，可在 Tampermonkey 的 **Script Sync** 中使用浏览器同步、Dropbox 或 WebDAV；脚本更新本身不要求开启 Script Sync。参考 [Tampermonkey 官方同步说明](https://www.tampermonkey.net/faq.php?q=Q105)。

## 运行规则

- 仅在 `www.bilibili.com/video/*` 和 `www.bilibili.com/list/*` 的主页面运行。
- 当前视频开始播放且时长**超过五分钟**后，按 BV/CID 查询原项目服务端。服务端不可用时停止，不把查询失败当作“没有片段”。
- 当前 CID 没有原始片段时，优先读取普通中文字幕，再尝试 AI 中文字幕；字幕文本直接发送到 DeepSeek API 识别明确的商业广告。
- 模型结果经过时间范围、字幕边界和长度校验。识别完成后，播放器已经位于广告区间时立即跳到该区间末尾；随后到达其他广告区间时再跳过。
- 只有所有字幕块都处理成功，才再次查询服务端并尝试把有效片段提交到原项目数据库。提交可能被服务端拒绝，不保证每次都被收录。

DeepSeek Key 保存在本机 Tampermonkey 的脚本存储中，调用 DeepSeek 时作为鉴权请求头发送。脚本会向 B 站请求字幕，向原项目服务端查询及提交 BV/CID、广告时间段和独立生成的提交用户 ID。该 ID 与原版扩展的用户 ID 不互通，因此原版扩展中的贡献统计不会自动合并。脚本不会读取原版扩展的内部存储。

## 开发

此目录是独立可构建的源码。执行 `npm ci && npm run build` 生成 `bsb-ai.user.js`。修改脚本时提高 `package.json` 的版本号，再重新构建并发布生成文件；Tampermonkey 会通过固定下载地址获取新版。源码和生成文件采用 GPL-3.0-only 许可证。
