# 开发说明

## 环境

推荐在 Windows 上使用 Node.js 22.12 或更新版本。便携版用户不需要 Node.js。

```powershell
npm.cmd ci
npm.cmd start
```

依赖版本固定在 `package-lock.json`。首次安装 / 运行需要下载 Electron；默认桌面运行不连接远程服务。

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm.cmd start` | 启动源码桌面版 |
| `npm.cmd run preview` | 本机浏览器预览，地址 `http://127.0.0.1:4173` |
| `npm.cmd run check` | JavaScript 语法检查 |
| `npm.cmd test` | 数据模型、文件恢复和自启动单元测试 |
| `npm.cmd start -- --smoke-test` | 桌面功能验证，使用独立测试数据 |
| `npm.cmd start -- --smoke-test --autostart` | 验证登录启动时保持隐藏，然后验证界面功能 |
| `npm.cmd run icons` | 使用 Windows System.Drawing 生成 PNG 与多尺寸 ICO |
| `npm.cmd run package` | 不携带个人待办的 Windows x64 便携版 |
| `npm.cmd run package:local` | 复制当前源码版待办的个人便携版 |

桌面验证覆盖卡片操作、提醒去重、托盘后台提醒、主题色、重新加载持久化和紧凑窗口布局。测试截图和结果在 `artifacts/` 中。

自启动单元测试使用替代系统 API；桌面验证只读取启动状态，明确禁止修改系统启动项。隐藏启动验证不等于实际重启系统验证。验证模式不弹出真实系统通知，可通过设置中的「发送测试」另行确认。

## 模块

- `src/model.mjs`：任务状态、校验、提醒时间和操作规则。
- `src/app.mjs`：界面与事件；桌面模式通过受限桥接调用主进程，浏览器模式使用本地存储。
- `src/styles.css`：极简布局和全局主题色。
- `electron/main.cjs`：窗口、托盘、提醒调度和系统通知。
- `electron/preload.cjs`：仅公开应用所需能力，不直接开放 Node.js。
- `electron/store.cjs`：文件保存、有效备份和异常恢复。
- `electron/startup.cjs`：Windows 登录启动开关和实际状态读取。
- `electron/smoke.cjs`：独立桌面集成验证。
- `scripts/package.mjs`：Windows 便携版和自定义程序图标。

Renderer 启用上下文隔离与沙箱，关闭 Node.js 集成，限制页面导航。预览服务仅监听 `127.0.0.1` 并提供界面文件白名单，不提供个人数据目录。

## 浏览器预览

浏览器数据与桌面数据相互独立。页面关闭后停止提醒，后台标签页也可能被浏览器暂停。浏览器预览不支持 Windows 自启动和托盘。清除浏览器数据前请导出备份。

## 打包与发布

1. 运行语法检查和测试。
2. 运行 `npm.cmd run package`，生成干净的 `dist/Daynote-win32-x64/`。
3. 可执行 `Daynote.exe --smoke-test --autostart` 进行便携版集成验证；它使用独立数据。
4. 发布时仅压缩程序文件及使用说明，不包含 `data/`、`.runtime/`、`.runtime-smoke/`、`artifacts/`。

打包脚本拒绝覆盖已有输出目录。需要再次打包时先导出数据，再将旧输出目录移动到另一个明确的位置；不要直接删除含个人待办的程序目录。

`package:local` 会带入个人任务，不能用作公开发行。仓库也不提交依赖、Electron 下载缓存、临时工具、真实运行数据和压缩包。

## 本地目录

下列目录按需生成，不属于源码：`node_modules/`、`data/`、`.runtime/`、`.runtime-smoke/`、`.npm-cache/`、`.electron-cache/`、`.package-tmp/`、`dist/`、`artifacts/`。

历史规划保存在 [项目计划](PROJECT_PLAN.md)。以 README 和实际代码作为当前功能依据。
