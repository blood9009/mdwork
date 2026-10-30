# MDWork

MDWork 是一款本地 Markdown 编写与预览软件，桌面版支持 macOS 和 Windows，并提供可离线安装的 VS Code 预览扩展。项目使用 Electron、React、Monaco Editor 和自研 Markdown 块级/行内 AST 解析与 HTML 渲染内核。

## 下载与文档

> 下载链接指向 [GitHub Release 1.0.0.1](https://github.com/blood9009/mdwork/releases/tag/1.0.0.1) 中的实际构建产物；源码压缩包不包含二进制安装文件。
> 发布标签与附件版本为 `1.0.0.1`；应用和 VS Code 扩展内部使用符合 SemVer 的 `1.0.1`。

- [macOS 通用版 DMG（Apple Silicon + Intel）](https://github.com/blood9009/mdwork/releases/download/1.0.0.1/MDWork-1.0.0.1-macos-universal.dmg)
- [macOS Apple Silicon（arm64）DMG](https://github.com/blood9009/mdwork/releases/download/1.0.0.1/MDWork-1.0.0.1-macos-arm64.dmg)
- [Windows x64 便携版 ZIP](https://github.com/blood9009/mdwork/releases/download/1.0.0.1/MDWork-1.0.0.1-win.zip)
- [VS Code 扩展（VSIX）](https://github.com/blood9009/mdwork/releases/download/1.0.0.1/MDWork-vscode-1.0.0.1.vsix)
- [发布文件 SHA-256 校验值](https://github.com/blood9009/mdwork/releases/download/1.0.0.1/SHA256SUMS.txt)
- [中文详细语法与操作手册](docs/user-guide.zh-CN.md)
- [English Syntax and User Guide](docs/user-guide.en-US.md)
- [Mermaid 与图表详细教程](docs/mermaid-guide.zh-CN.md)
- [48 个 Mermaid 可运行示例](docs/examples/mermaid-gallery.md)

macOS 通用版同时包含 arm64 和 x86_64，可用于 Apple Silicon 与 Intel Mac；也保留独立 arm64 包。应用未经过 Apple 公证。Windows 当前提供解压后运行 `MDWork.exe` 的便携版，不提供 Setup EXE。发布包未配置平台代码签名时，操作系统可能显示安全提示。只安装来源可信且校验值一致的文件。

## 已实现功能

- Monaco 编辑、Markdown 语法高亮、50:50 实时预览、25%–75% 分栏调整。
- 多文件标签、独立未保存状态，以及最多横向 4 栏、纵向 3 栏的 12 个编辑分栏。
- 可切换空格、Tab 等空白符号和控制字符显示。
- 大文件保留 Monaco 增量编辑，Markdown 解析移入 Web Worker；超过 1,000,000 字符默认暂停实时预览并可手动刷新。
- 编辑 / 分栏 / 预览三种视图，编辑器到预览的源行滚动联动。
- 自研 Markdown 解析器：常用 CommonMark、GFM 表格、任务列表、删除线。
- MDWork 紧凑标题：数字和大小写字母自动分层连续编号，`*` 为无序节点。
- 图片左浮动、右浮动、居中、受限制宽度和 `::clear` 结束环绕。
- highlight.js 代码高亮。
- Mermaid 11.17.2 内置图型静态预览及 PDF 导出，提供 48 个真实 SVG/PDF 渲染案例、常用围栏简写，以及原生、`LR` 横向和 `TD` 纵向思维导图。
- 可编辑 `layers` 分层架构图：层标题、网格条目、分组、层间箭头和分组连线，支持预览及 PDF 导出。
- 本地文件打开、保存、另存为、原子写入、未保存提醒和可选自动保存。
- 将一个或多个 Markdown / 文本文件拖入桌面窗口，分别作为标签打开。
- 本地图片选择导入到文档旁 `assets`，重名不覆盖。
- URL 图片嵌入或纯链接插入，HTTP/HTTPS/Mailto 外链跳转。
- 当前文档目录内文件 / 文件夹链接，以及 `#标题`、`#text=文字`、`#line=行号` 本文定位。
- macOS / Windows 系统字体枚举，编辑器、正文和代码字体独立设置。
- A4 / Letter、横纵向、页边距、主题、目录和页码等 PDF 设置。
- DOMPurify 与 PDF 导出端二次 HTML 清理。
- VS Code `.vsix` 实时预览扩展，复用同一 Markdown 内核。

## 图片环绕速览

```markdown
![right|40%|图片说明](assets/photo.png)

这些文字会显示在图片左侧。左浮动使用 `left`，居中使用 `center`。

::clear

后续正文恢复到图片下方。
```

宽度支持 `1%`–`100%` 或 `1px`–`2000px`。左 / 右浮动默认宽度为 40%，居中默认 60%；`center` 不产生文字环绕。普通 `![alt](src)` 行为不变。

## 图表语法速览

基础流程图使用处理节点、判断节点、条件分支和回退连线：

```flowchart TD
  Start([开始注册]) --> Input[填写用户名和密码]
  Input --> Valid{验证通过？}
  Valid -->|否| Input
  Valid -->|是| Done([完成注册])
```

跨职能流程图使用 `subgraph` 表示角色泳道，角色之间可以直接连线：

```flowchart LR
  subgraph Sales[销售]
    Start([开始]) --> Submit[提交订单]
  end
  subgraph Delivery[实现]
    Review{审核订单}
  end
  subgraph Contract[合同]
    Ship[安排装运]
  end
  Submit --> Review
  Review -->|通过| Ship
  Review -->|驳回| Submit
```

时序图可使用 `sequence` 简写，围栏内无需重复 `sequenceDiagram`：

```sequence
  actor User as 用户
  participant Web as 前端页面
  participant API as 微服务后台
  User->>Web: 用户操作下单
  Web->>API: 请求下单
  activate API
  API->>API: 保存订单
  API-->>Web: 返回跳转 URL
  deactivate API
```

跨职能图表达角色及流程关系，布局由 Mermaid 自动计算，不复刻 ProcessOn 的固定泳道网格或原图像素样式。上述图表也可以放入标准 `mermaid` 围栏，此时需按 Mermaid 语法自行写出 `flowchart` 或 `sequenceDiagram` 声明。

思维导图保留原生 `mermaid` + `mindmap` 写法；需要明确方向时，可使用 MDWork 的 `mindmap LR` 或 `mindmap TD` 围栏，围栏内直接编写单根缩进树。完整图型清单、简写对照、静态安全边界和错误排查见 [Mermaid 与图表详细教程](docs/mermaid-guide.zh-CN.md)。

分层架构图使用 `layers` 围栏，适合固定层数和网格布局：

```layers
layer 第二层
color yellow
columns 2
group 前端
item 页面展示
end
group 后端
item 接口服务
end
link 前端 -> 后端 | 请求
link 后端 -> 前端 | 响应
```

`layer` 开始新层，`title` 设置可选层标题，`columns 1..4` 设置层或分组列数，`group` / `end` 定义分组，`item` 添加条目，`span` 设置前一条目跨列，`link` 支持 `->`、`<-` 和 `<>`。完整四层可编辑版本见 [四层架构图示例](docs/examples/layers-architecture.md)。

## 桌面版开发

要求 Node.js 22 或更高版本。

```bash
npm install
npm run dev
```

开发命令同时启动 Vite、主进程 TypeScript 监听编译和 Electron。`scripts/launch-electron.mjs` 会移除 VS Code 可能注入的 `ELECTRON_RUN_AS_NODE`，避免 Electron 被强制切换为 Node.js 模式。

## 验证与构建

```bash
npm test
npm run typecheck
npm run build
npm run test:mermaid       # 真实 Electron 中的 48 个 SVG/PDF 图表案例
npm run examples:generate  # 从同一案例矩阵生成教程示例库
npm start
```

### 一键本地发布

在 macOS 发布机上执行：

```bash
npm run release
```

该命令依次运行单元测试、类型检查和生产构建，生成 macOS Universal DMG、macOS arm64 DMG、Windows x64 便携 ZIP、VS Code VSIX，并重建 `release/SHA256SUMS.txt`。脚本会下载所需官方 Electron 架构包，先核对官方 SHA-256 再解压；合并 Universal App 后检查 arm64 / x86_64 架构切片并重新签名。

可只构建指定目标：

```bash
npm run release -- --mac-universal
npm run release -- --mac-arm64
npm run release -- --win
npm run release -- --vscode
```

可用 `MDWORK_SIGN_IDENTITY` 指定 macOS 签名身份，用 `MDWORK_ELECTRON_CACHE` 指定 Electron 下载缓存目录。脚本只在本地生成发布文件，不上传、不推送 Git，也不执行 Apple 公证。完整参数见 `npm run release -- --help`。

### 单独构建



```bash
# 在 Apple Silicon macOS 上构建 arm64 DMG
npm run dist:mac

# 在 Windows x64 发布环境中构建便携 ZIP
npm run dist:win

# 构建 VS Code VSIX（首次需安装扩展打包工具）
npm install --prefix vscode-mdwork --ignore-scripts
npm run dist:vscode
```

`npm run dist` 使用 electron-builder 的当前平台默认目标。Apple 签名 / 公证和 Windows 代码签名证书须在发布环境中配置。

## 目录结构

```text
electron/             Electron 主进程、预加载脚本与系统服务
shared/               主进程和渲染进程共享的 IPC 类型
src/
  components/         编辑器、预览、分栏和对话框
  editor/             Monaco 配置
  markdown/           自研解析器、AST、HTML 渲染和安全清理
  styles/             应用与 Markdown 样式
vscode-mdwork/        VS Code 扩展清单、宿主与 Webview 入口
scripts/              Electron 启动、VS Code 打包和一键发布脚本
tests/                Markdown、图片和资源测试
docs/                 实施方案与中英文用户手册
release/              本地生成的安装包和 VSIX（不提交源码仓库）
```

## 安全边界

桌面渲染进程不启用 Node.js，只通过 contextBridge 暴露最小 IPC API。保存路径来自系统文件对话框或用户明确打开的文档。本地图片限制在当前文档目录内；导入图片来自系统文件选择框。外部链接仅允许 HTTP、HTTPS 和 Mailto。Mermaid 使用严格安全模式，SVG 独立清理；PDF 在隔离的隐藏 BrowserWindow 中生成。VS Code Webview 使用 CSP、资源目录限制和消息协议白名单。
