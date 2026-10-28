# 手机访问与网站发布

聊天中 `/workspace/...` 是云工作区路径，`sandbox:/workspace/...` 也不能视为已确认可供当前客户端使用的附件下载链接。重命名文件或建议用户换浏览器无法解决链接本身不可达的问题。

`dist/index.html` 是与离线版内容相同的自包含网站入口；`dist/website.zip` 仅含该入口，可用于静态托管。发布后手机通过正常 HTTPS 网址访问，不依赖安卓文件管理器执行本地 HTML。

## 当前状态

- 软件已上传到远端 `main`（应用提交 `c752d8c`），GitHub真实下载地址已返回 HTTP 200，下载 ZIP 与测试版逐字节一致。网站尚未确认上线。
- 用户已在对话中授权将题库公开发布到 `tong-06-Lin/special-waffle`，无需重复征求公开题库的许可。
- 原题库文件无需上传，网站中已经嵌入题目数据。
- 当前环境对 `api.github.com` 的只读请求返回 Forbidden，尚未建立可用的 GitHub 管理 API 访问。原仓库的 HTTPS Git 读取正常。不要把这些结果解释为已有发布权限或要求用户在聊天中发送凭据。
- 已将 `api.github.com` 和 `tong-06-lin.github.io` 保存到环境网络配置草稿；保存草稿不等于运行环境已应用，也不等于网站已部署。平台要求在环境设置中审核保存并发布环境后应用。

## 授权后使用 GitHub Pages

可直接从现有 `main` 分支发布：

1. 打开仓库 Settings → Pages。
2. Source 选 **Deploy from a branch**，Branch 选 **main**，目录选 **/(root)**，保存。根目录的 `index.html` 与其他静态资源已齐备，`.nojekyll` 避免额外模板处理。
3. 等待 GitHub 返回真实部署结果和访问地址，再从公开客户端验证刷题、跳题、错题与保存。不能仅凭设置保存就声称网站已上线。

也可以选择 GitHub Actions：在 Settings → Pages 将来源设为 **GitHub Actions**，再手动运行 **Publish quiz website**。该工作流仅响应手动触发，不会因普通提交而部署。

通过 API 管理时先恢复当前环境对 GitHub 管理接口的访问，并检查现有身份的实际权限。用户已经授权公开发布，不要重复征求相同授权。

刷题记录仍保存在每个浏览器的本地存储中，不会上传到 GitHub。网站和本地文件属于不同存储位置，迁移已有进度需导出后导入。
