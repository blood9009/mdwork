export interface MermaidCompatibilityCase {
  id: string;
  title: string;
  source: string;
  fence?: string;
}

/**
 * Native Mermaid programs used by both browser rendering tests and the example
 * gallery. Keep the full diagram declaration in each program: shorthand fences
 * are tested separately by diagramSyntax.test.ts.
 */
export const mermaidCompatibilityCases: MermaidCompatibilityCase[] = [
  {
    id: 'flowchart',
    title: '流程图 / Flowchart',
    source: `flowchart TD
  Start([开始]) --> Input[填写资料]
  Input --> Valid{验证通过？}
  Valid -->|否| Input
  Valid -->|是| Done([完成])`,
  },
  {
    id: 'graph',
    title: '传统 Graph 声明',
    source: `graph LR
  subgraph Editor[编辑器]
    A[Markdown] --> B[AST]
  end
  subgraph Preview[预览]
    C[HTML] --> D[SVG 图表]
  end
  B --> C`,
  },
  {
    id: 'flowchart-elk',
    title: 'ELK 流程图布局',
    source: `flowchart-elk TD
  A[输入] --> B{有效？}
  B -->|是| C[渲染]
  B -->|否| D[显示错误]
  C --> E[导出]`,
  },
  {
    id: 'sequence',
    title: '时序图 / Sequence',
    source: `sequenceDiagram
  autonumber
  actor User as 用户
  participant App as MDWork
  participant API as 本地服务
  User->>App: 保存文档
  activate App
  App->>API: 写入临时文件
  API-->>App: 写入成功
  App-->>User: 更新保存状态
  deactivate App
  Note over User,API: 仅展示静态调用关系`,
  },
  {
    id: 'class',
    title: '类图 / Class',
    source: `classDiagram
  namespace Editor {
    class Document {
      +String path
      +String content
      +save()
    }
  }
  class Preview {
    +render(html)
  }
  Document --> Preview : 更新`,
  },
  {
    id: 'class-v2',
    title: 'ClassDiagram-v2 兼容声明',
    source: `classDiagram-v2
  class Animal {
    +String name
    +move()
  }
  class Duck {
    +swim()
  }
  Animal <|-- Duck`,
  },
  {
    id: 'state',
    title: '状态图 / State v2',
    source: `stateDiagram-v2
  [*] --> Editing
  state Editing {
    [*] --> Dirty
    Dirty --> Saved: 保存
    Saved --> Dirty: 修改
  }
  Editing --> Exported: 导出 PDF
  Exported --> [*]`,
  },
  {
    id: 'state-legacy',
    title: '传统 State 声明',
    source: `stateDiagram
  [*] --> Idle
  Idle --> Loading: open
  Loading --> Ready: loaded
  Ready --> Idle: close`,
  },
  {
    id: 'er',
    title: '实体关系图 / ER',
    source: `erDiagram
  DOCUMENT ||--o{ TAB : opens
  DOCUMENT {
    string path PK
    string title
  }
  TAB {
    int id PK
    string documentPath FK
    boolean dirty
  }`,
  },
  {
    id: 'journey',
    title: '用户旅程图 / Journey',
    source: `journey
  title 文档编写旅程
  section 编写
    新建文档: 5: 用户
    输入 Markdown: 5: 用户, 编辑器
  section 发布
    检查预览: 4: 用户
    导出 PDF: 5: 用户`,
  },
  {
    id: 'gantt',
    title: '甘特图 / Gantt',
    source: `gantt
  title MDWork 迭代计划
  dateFormat YYYY-MM-DD
  axisFormat %m-%d
  section 编辑器
  多标签页: done, tabs, 2026-10-27, 2d
  大文件优化: active, large, after tabs, 3d
  section 发布
  兼容验证: verify, after large, 2d`,
  },
  {
    id: 'requirement',
    title: '需求图 / Requirement',
    source: `requirementDiagram
  requirement large_file {
    id: 1
    text: Large files remain editable.
    risk: high
    verifymethod: test
  }
  element editor {
    type: component
    docref: editor.md
  }
  editor - satisfies -> large_file`,
  },
  {
    id: 'gitgraph',
    title: 'Git 图 / GitGraph',
    source: `gitGraph
  commit id: "初始化"
  branch feature
  checkout feature
  commit id: "图表"
  commit id: "教程"
  checkout main
  merge feature id: "发布"`,
  },
  {
    id: 'pie',
    title: '饼图 / Pie',
    source: `pie showData
  title 文档内容构成
  "正文" : 55
  "代码" : 25
  "图表" : 20`,
  },
  {
    id: 'quadrant',
    title: '象限图 / Quadrant',
    source: `quadrantChart
  title 功能优先级
  x-axis 低价值 --> 高价值
  y-axis 低投入 --> 高投入
  quadrant-1 重点规划
  quadrant-2 优先实施
  quadrant-3 暂缓
  quadrant-4 快速完成
  多标签页: [0.85, 0.45]
  大文件优化: [0.9, 0.8]
  隐藏字符: [0.65, 0.2]`,
  },
  {
    id: 'xychart',
    title: 'XY 图表',
    source: `xychart-beta
  title "月度输出"
  x-axis [Jan, Feb, Mar, Apr]
  y-axis "篇数" 0 --> 100
  bar [20, 40, 70, 90]
  line [10, 30, 50, 70]`,
  },
  {
    id: 'xychart-legacy',
    title: 'XY 图表兼容声明',
    source: `xychart
  x-axis [A, B, C]
  y-axis 0 --> 10
  line [2, 5, 8]`,
  },
  {
    id: 'timeline',
    title: '时间线 / Timeline',
    source: `timeline
  title MDWork 发展时间线
  2026 第一季度 : Markdown 内核 : 实时预览
  2026 第二季度 : PDF 导出 : VS Code 扩展
  2026 第三季度 : 图表兼容 : 多文档编辑`,
  },
  {
    id: 'mindmap',
    title: '思维导图 / Mindmap',
    source: `mindmap
  root((MDWork))
    编辑[Monaco 编辑器]
      隐藏字符
      大文件
    预览(实时预览)
      图表{{静态 SVG}}
    结构))思维导图((
    导出)PDF(
      静态内容
        :::important`,
  },
  {
    id: 'mindmap-horizontal',
    title: '横向思维导图（MDWork 扩展）',
    fence: 'mindmap LR',
    source: `root((MDWork))
  编辑[Monaco]
    多标签
    大文件
  预览(实时预览)
  导出{{PDF}}`,
  },
  {
    id: 'mindmap-vertical',
    title: '纵向思维导图（MDWork 扩展）',
    fence: 'mindmap TD',
    source: `root((MDWork))
  编辑[Monaco]
    隐藏字符
    多标签
  图表(静态 SVG)
    流程图
    时序图
  导出{{PDF}}`,
  },
  {
    id: 'kanban',
    title: '看板 / Kanban',
    source: `kanban
  todo[待办]
    docs[编写图表教程]
  doing[进行中]
    test[真实 SVG 验证]
  done[完成]
    map[思维导图支持]`,
  },
  {
    id: 'c4-context',
    title: 'C4 系统上下文图',
    source: `C4Context
  title MDWork 系统上下文
  Person(user, "用户", "编写和发布 Markdown 文档")
  System(mdwork, "MDWork", "编辑、预览并导出文档")
  System_Ext(filesystem, "本地文件系统", "保存 Markdown、图片和 PDF")
  Rel(user, mdwork, "使用")
  Rel(mdwork, filesystem, "读写")`,
  },
  {
    id: 'c4-container',
    title: 'C4 容器图',
    source: `C4Container
  title MDWork 容器图
  Person(user, "用户")
  System_Boundary(app, "MDWork") {
    Container(renderer, "渲染进程", "React", "编辑器和实时预览")
    Container(main, "主进程", "Electron", "文件和 PDF 服务")
  }
  ContainerDb(storage, "本地存储", "文件系统", "Markdown 与 PDF")
  Rel(user, renderer, "操作")
  Rel(renderer, main, "IPC")
  Rel(main, storage, "读写")`,
  },
  {
    id: 'c4-component',
    title: 'C4 组件图',
    source: `C4Component
  title 渲染进程组件
  Container_Boundary(renderer, "渲染进程") {
    Component(editor, "Monaco 编辑器", "组件", "接收用户输入")
    Component(parser, "Markdown 内核", "TypeScript", "生成 AST 与 HTML")
    Component(preview, "安全预览", "React", "展示 HTML 与 SVG")
  }
  Rel(editor, parser, "文本")
  Rel(parser, preview, "安全 HTML")`,
  },
  {
    id: 'c4-dynamic',
    title: 'C4 动态图',
    source: `C4Dynamic
  title 保存文档调用关系
  Person(user, "用户")
  Container(editor, "编辑器", "Monaco", "提供文档内容")
  Container(fileService, "文件服务", "Electron", "原子写入")
  Rel(user, editor, "1. 保存")
  Rel(editor, fileService, "2. 提交内容")
  Rel(fileService, editor, "3. 返回路径")`,
  },
  {
    id: 'c4-deployment',
    title: 'C4 部署图',
    source: `C4Deployment
  title MDWork 部署图
  Deployment_Node(desktop, "用户电脑", "macOS / Windows") {
    Deployment_Node(runtime, "Electron 运行时", "桌面进程") {
      Container(app, "MDWork", "桌面应用", "本地编辑与导出")
    }
    Deployment_Node(storage, "文件系统", "本地磁盘") {
      ContainerDb(files, "文档文件", "Markdown / PDF", "用户数据")
    }
  }
  Rel(app, files, "读写")`,
  },
  {
    id: 'sankey',
    title: '桑基图 / Sankey',
    source: `sankey-beta
  Markdown,Preview,60
  Markdown,PDF,25
  Markdown,Share,15
  Preview,Revision,20`,
  },
  {
    id: 'sankey-legacy',
    title: 'Sankey 兼容声明',
    source: `sankey
  A,B,10
  A,C,5
  B,D,4`,
  },
  {
    id: 'packet',
    title: '数据包图 / Packet',
    source: `packet-beta
  title "TCP 数据包"
  0-15: "源端口"
  16-31: "目标端口"
  32-63: "序列号"
  64-79: "窗口"
  80-95: "校验和"`,
  },
  {
    id: 'packet-legacy',
    title: 'Packet 兼容声明',
    source: `packet
  0-7: "Type"
  8-15: "Code"
  16-31: "Checksum"`,
  },
  {
    id: 'block',
    title: '块图 / Block',
    source: `block-beta
  columns 3
  Editor["编辑器"] Preview["预览"] Export["导出"]
  Workspace["MDWork 工作区"]:3`,
  },
  {
    id: 'block-legacy',
    title: 'Block 兼容声明',
    source: `block
  columns 2
  A["输入"] B["输出"]
  C["处理"]:2`,
  },
  {
    id: 'architecture',
    title: '架构图 / Architecture',
    source: `architecture-beta
  group api(cloud)[API]
  service db(database)[Database] in api
  service disk(disk)[Storage] in api
  service server(server)[Server] in api
  db:L -- R:server
  disk:T -- B:server`,
  },
  {
    id: 'radar',
    title: '雷达图 / Radar',
    source: `radar-beta
  title "产品能力"
  axis edit["编辑"], preview["预览"], diagram["图表"], export["导出"]
  curve current["当前版本"]{4, 5, 5, 4}
  curve target["目标版本"]{5, 5, 5, 5}
  max 5
  min 0
  graticule polygon
  showLegend true`,
  },
  {
    id: 'swimlane',
    title: '泳道图 / Swimlane',
    source: `swimlane-beta
  subgraph Sales
    lead[Qualify lead]
  end
  subgraph Delivery
    ship[Ship order]
  end
  lead --> ship`,
  },
  {
    id: 'treeview',
    title: '树状视图 / TreeView',
    source: `treeView-beta
index.js`,
  },
  {
    id: 'eventmodeling',
    title: '事件建模 / Event Modeling',
    source: `eventmodeling
  tf 01 ui UI
  tf 02 cmd RunAction
  tf 03 evt ActionExecuted`,
  },
  {
    id: 'ishikawa',
    title: '石川图 / Ishikawa',
    source: `ishikawa-beta
Problem
Cause A
Cause B`,
  },
  {
    id: 'venn',
    title: '韦恩图 / Venn',
    source: `venn-beta
set A
set B
union A,B`,
  },
  {
    id: 'treemap',
    title: '矩形树图 / Treemap',
    source: `treemap-beta
"Category A"
  "Item A1": 10
  "Item A2": 20
"Category B"
  "Item B1": 15`,
  },
  {
    id: 'wardley',
    title: 'Wardley 地图',
    source: `wardley-beta
component A [0.5, 0.5]
component B [0.8, 0.2]
A -> B`,
  },
  {
    id: 'cynefin',
    title: 'Cynefin 框架图',
    source: `cynefin-beta
  complex`,
  },
  {
    id: 'railroad',
    title: '铁路图 / Railroad IR',
    source: `railroad-beta
rule = terminal("hello") ;`,
  },
  {
    id: 'railroad-ebnf',
    title: '铁路图 / EBNF',
    source: `railroad-ebnf-beta
rule = "terminal" ;`,
  },
  {
    id: 'railroad-abnf',
    title: '铁路图 / ABNF',
    source: `railroad-abnf-beta
rule = "hello" ;`,
  },
  {
    id: 'railroad-peg',
    title: '铁路图 / PEG',
    source: `railroad-peg-beta
rule <- "hello" ;`,
  },
  {
    id: 'info',
    title: '信息图 / Info',
    source: `info
  showInfo`,
  },
];
