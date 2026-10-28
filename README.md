# 知习 · 中华知识刷题本

基于用户提供的《2026中华知识竞赛·初赛题库.xlsx》的离线刷题软件。无前端依赖，无账号，无服务端；题目、选项及解析作为纯文本呈现。

## 直接使用

打开 `dist/中华知识刷题本.html`，或解压 `dist/中华知识刷题本.zip` 后用电脑浏览器打开 HTML 文件。全部 2,525 题内置，不用联网。

- 题号目录：分页、搜索题号/关键词、点击跳转、按题型筛选。
- 判断 474 题、单选 1,272 题、多选 429 题、填空 350 题；多选必须选全，填空按原答案比对（忽略空格、全半角、书名号）。
- 选择或输入后提交；答对约 1 秒后自动进入下一题，答错留在本题，显示解析并收录错题。
- 「上一道 / 下一道」手动切换，末题答对停留并提示完成；搜索仅作用于目录，跳转后仍可顺序练习。
- 错题订正后保留并标记；手动移出错题不删除历史统计。
- `localStorage` 自动保存当前题号、答题统计及错题；导出/导入 JSON 可备份和迁移。导入会先校验并在确认后替换记录。
- 桌面和手机布局适配，手机目录可展开。手机本地 HTML 能否直接打开取决于系统；若只能静态预览，请使用电脑浏览器或通过静态网站托管。

记录只保存在当前浏览器，清理浏览器数据、换浏览器、移动 HTML 文件可能使原记录不可见，请定期导出。隐私模式或浏览器禁用存储时会显示提示，仍可临时刷题和导出记录。没有云端同步。

手机直接访问需要可达的正常网站地址；云工作区文件路径不是公开下载地址。已准备 `dist/index.html`、`dist/website.zip` 和仅手动触发的 GitHub Pages 发布工作流，但尚未公开发布，具体状态和操作见 [发布说明](docs/PUBLISHING.md)。

## 开发与打包

直接用浏览器打开 `index.html`。也可用 Python 3 启动静态开发服务器：

```sh
cd /workspace/special-waffle
python3 -m http.server 8000 --bind 0.0.0.0
```

不需要 npm 安装依赖。打包只需 Python 3 标准库：

```sh
python3 scripts/build.py
```

重新从原始 Excel 导入（原始文件无需随软件分发）：

```sh
python3 scripts/import_questions.py '/path/to/2026中华知识竞赛·初赛题库.xlsx'
python3 scripts/build.py
```

导入脚本只读取数据，不执行公式、宏或外部链接。第 495 题原表 B 选项为空，已原样保留其余选项及答案 A，界面显示来源提醒；没有擅自修订题库内容。

## 验证

核心测试使用 Node.js 内置测试器（Node 22+，无额外依赖）：

```sh
node --test --test-isolation=none tests/core.test.js
```

浏览器交互测试需要 Python Playwright 和 Chromium；脚本使用本地临时 HTTP 服务：

```sh
python3 tests/browser_smoke.py
python3 tests/browser_smoke.py --target 'dist/中华知识刷题本.html'
```

`CHROMIUM_PATH` 可指定浏览器路径，默认 `/usr/bin/chromium`。测试覆盖自动跳题、错题停留、四种题型、目录导航、持久化、备份导入导出、末题及移动端适配。
