# O-Maid 项目目录结构详解

本文档详细说明了 O-Maid Chrome 扩展的目录结构和各文件的功能职责。

## 📁 目录结构总览

```text
o-maid/
├── extension/                    # Chrome 扩展目录 (前端)
│   ├── 📄 manifest.json          # Chrome 扩展配置文件（必需）
│   ├── 🚀 background.js          # 后台服务工作者（Service Worker）
│   ├── 🎯 content.js             # 内容脚本入口文件
│   ├── 🖼️  popup.html             # 弹出窗口 HTML 结构
│   ├── 🎨 popup.js               # 弹出窗口交互逻辑
│   ├── 📋 rules.json             # 默认规则配置文件
│   ├── 📦 modules/               # 功能模块目录（核心业务逻辑）
│   │   ├── 📡 communication.js   
│   │   ├── 🎯 element-selector.js
│   │   ├── 💡 hover-hints.js     
│   │   ├── 🗺️  tour-manager.js   
│   │   ├── 🎨 ui-manager.js      
│   │   ├── 💾 storage-api.js     
│   │   ├── ☁️  cloud-api.js       # 云端通信模块
│   │   └── 🔨 utils.js           
│   └── 📚 vendor/                # 第三方库目录
├── server/                       # 后端服务目录 (Monorepo 后端)
│   ├── 🐳 Dockerfile             # Docker 镜像构建文件
│   ├── 🐳 docker-compose.yml     # Docker 容器编排配置文件
│   ├── 📄 .dockerignore          # Docker 构建忽略规则
│   ├── 📁 public/                # [NEW] Web 可视化管理控制台前端
│   │   ├── 📄 index.html         # 控制台单页主结构
│   │   ├── 📁 css/               # 控制台样式 (深色玻璃拟态)
│   │   └── 📁 js/                # 控制台前端通信与交互逻辑
│   ├── 📁 routes/                # [NEW] 模块化路由
│   │   ├── 📄 auth.js            # 认证路由
│   │   ├── 📄 guides.js          # 引导任务路由
│   │   ├── 📄 hints.js           # 悬停提示路由
│   │   └── 📄 stats.js           # 统计与监控路由
│   ├── 📁 middleware/            # [NEW] 中间件 (JWT 鉴权)
│   ├── 📄 package.json
│   ├── 🚀 server.js              # Express 核心入口 (静态托管 + 路由挂载)
│   ├── 💾 database.js            # SQLite 数据库配置
│   └── 📖 README.md              # 后端启动说明与 API
├── 🚀 start-server.sh            # 一键启动后端脚本 (支持指定端口)
└── 📖 docs/                      # 文档目录
    ├── PROJECT_STRUCTURE.md      # 本文档 - 详细的目录结构说明
    ├── ARCHITECTURE.md           # 架构设计文档 - 模块化架构说明
    ├── REQUIREMENTS.md           # 多人版与管理控制台需求文档
    └── QUICK_REFERENCE.md        # 快速参考指南
```

---

## 📄 extension/ 目录文件详解

### manifest.json
**类型**: Chrome 扩展配置文件（必需）  
**作用**: 插件的"身份证"，定义所有核心配置

**关键配置项**:
```json
{
  "manifest_version": 3,           // 使用 Manifest V3
  "name": "页面元素助手",           // 插件名称
  "version": "1.0",                // 版本号
  "permissions": [                 // 权限声明
    "activeTab",                   // 访问当前活动标签页
    "scripting",                   // 执行脚本
    "storage"                      // 使用本地存储
  ],
  "background": {                  // 后台脚本配置
    "service_worker": "background.js",
    "type": "module"               // 支持 ES 模块
  },
  "action": {                      // 工具栏图标配置
    "default_popup": "popup.html"
  },
  "content_scripts": [{            // 内容脚本配置
    "matches": ["<all_urls>"],     // 匹配所有网站
    "js": ["vendor/intro.min.js", "content.js"],
    "css": ["vendor/introjs.min.css"],
    "all_frames": true             // 支持 iframe
  }],
  "web_accessible_resources": [{   // 可访问资源
    "resources": ["modules/*.js"],
    "matches": ["<all_urls>"]
  }]
}
```

**在此项目中的作用**:
- 定义插件基本信息（名称、版本、描述）
- 声明所需权限（操作标签页、执行脚本、使用存储）
- 指定后台服务工作者（background.js）
- 配置弹出窗口（popup.html）
- 定义内容脚本注入规则（注入到所有网站）
- 允许模块文件被动态加载

---

### background.js
**类型**: 后台服务工作者（Service Worker）  
**作用**: 插件的"大脑"，在后台持续运行，处理核心逻辑

**主要职责**:
1. **数据管理**
   - 管理引导任务（`guided_tours`）
   - 管理悬停提示（`hover_hints`）
   - 管理任务完成状态（`tour_completions`）
   - 所有数据保存在 `chrome.storage.local`

2. **状态管理**
   - 跟踪多页面引导任务的当前状态（`activeTours`）
   - 记录用户在引导中的进度
   - 在页面跳转时恢复引导状态

3. **事件监听**
   - `onInstalled`: 插件安装时初始化数据
   - `onUpdated`: 标签页更新时恢复引导任务
   - `onConnect`: 管理与内容脚本的长连接

4. **消息中枢**
   - 接收来自 `content.js` 和 `popup.js` 的消息
   - 处理 CRUD 操作请求
   - 广播数据更新通知

**关键函数**:
- `broadcastToTab()`: 向标签页的所有 frame 广播消息
- `handleMessage()`: 异步消息处理器
- 使用 `storage-api.js` 模块处理所有数据操作

---

### content.js
**类型**: 内容脚本入口文件  
**作用**: 注入到网页中的脚本，可以直接访问和操作页面 DOM

**主要职责**:
1. **模块协调**
   - 动态导入所有功能模块
   - 协调各模块间的交互
   - 作为功能的入口点

2. **初始化**
   - 建立与 background 的连接
   - 注册消息处理器
   - 处理页面数据加载

3. **功能执行**
   - 初始化悬停提示
   - 检查并启动自动任务
   - 处理任务恢复

4. **消息处理**
   - 监听 `togglePanel`: 切换面板显示
   - 监听 `uiElementSelected`: 处理元素选择
   - 监听 `resumeTour`: 恢复引导任务

**特点**:
- 使用动态 `import()` 加载模块（支持 Chrome 扩展环境）
- 轻量级入口文件（约 100 行）
- 所有业务逻辑在模块中实现

---

### popup.html & popup.js
**类型**: 弹出窗口界面和逻辑  
**作用**: 点击浏览器工具栏插件图标后显示的界面

**popup.html**:
- 提供简洁的标题
- 显示"显示/隐藏面板"按钮
- 基础样式定义

**popup.js**:
- 监听按钮点击事件
- 向当前标签页的 `content.js` 发送 `togglePanel` 消息
- 自动关闭弹窗（`window.close()`）

**用户交互流程**:
```
用户点击图标 → popup.html 显示 
→ 用户点击按钮 → popup.js 发送消息 
→ content.js 接收消息 → 切换面板显示
```

---

### rules.json
**类型**: 默认规则配置文件  
**作用**: 存储插件的默认引导任务和悬停提示

**数据结构**:
```json
{
  "guides": [                      // 引导任务列表
    {
      "id": "guide-001",
      "name": "新手入门引导",
      "trigger": "auto",           // auto: 自动触发, manual: 手动触发
      "steps": [...]
    }
  ],
  "singleHints": [                 // 悬停提示列表
    {
      "id": "hint-001",
      "url": "https://example.com",
      "element": ".help-icon",
      "content": "提示内容"
    }
  ]
}
```

**使用场景**:
- 插件首次安装时加载默认规则
- 提供示例数据供用户参考
- 可以通过 UI 面板修改和扩展

---

## 📦 modules/ 目录详解

模块目录包含所有核心业务逻辑，采用 ES6 模块化设计。

### communication.js
**职责**: 通信管理  
**功能**:
- 建立与 background 的连接（`connectPort()`）
- 注册和处理消息（`registerMessageHandler()`）
- 发送消息到 background（`sendMessage()`, `postPortMessage()`）
- 封装所有 API 调用（CRUD 操作）

**导出函数**:
- `connectPort()`: 建立连接
- `sendMessage()`: 发送消息并等待响应
- `getDataForTab()`: 获取标签页数据
- `addTour()`, `updateTour()`, `deleteTour()`: 任务 CRUD
- `addHoverHint()`, `updateHoverHint()`, `deleteHoverHint()`: 提示 CRUD

**依赖**: 无（基础模块）

---

### element-selector.js
**职责**: 元素选择和高亮  
**功能**:
- 启动/停止元素选择模式
- 高亮鼠标悬停的元素
- 处理元素点击选择
- 生成元素的 CSS 选择器

**导出函数**:
- `startSelectionMode()`: 开始选择模式
- `stopSelectionMode()`: 停止选择模式
- `highlightElementForSelection()`: 高亮元素
- `selectElementForAction()`: 选择元素
- `handleElementSelection()`: 处理选择结果

**依赖**: `utils.js`, `communication.js`

---

### hover-hints.js
**职责**: 悬停提示功能  
**功能**:
- 创建悬停提示 DOM 元素
- 初始化页面上的所有提示
- 管理提示的显示和隐藏

**导出函数**:
- `createHoverTooltip()`: 创建提示元素
- `initHoverHints()`: 初始化提示
- `getHoverTooltip()`: 获取提示元素

**依赖**: `utils.js`

---

### tour-manager.js
**职责**: 引导任务管理  
**功能**:
- 启动引导任务（使用 Intro.js）
- 处理多页面任务导航
- 检查并自动启动任务
- 管理任务完成状态

**导出函数**:
- `startTour()`: 开始引导任务
- `checkAndStartAutoTour()`: 检查并自动启动

**依赖**: `utils.js`, `communication.js`, `intro.js`（全局）

---

### ui-manager.js
**职责**: UI 面板管理  
**功能**:
- 创建和管理侧边栏面板
- 视图切换（查看、添加、编辑）
- 渲染任务和提示列表
- 处理用户交互（保存、删除等）

**导出函数**:
- `createUIPanel()`: 创建面板
- `switchToView()`: 切换视图
- `showPanel()`, `hidePanel()`, `togglePanel()`: 面板控制
- `getCurrentView()`: 获取当前视图

**依赖**: `utils.js`, `communication.js`, `element-selector.js`, `tour-manager.js`, `hover-hints.js`

**视图类型**:
- `view`: 主列表视图
- `add-choice`: 添加选择视图
- `edit-hint`: 提示编辑视图
- `edit-tour`: 任务编辑视图

---

### storage-api.js
**职责**: 数据存储 API（仅用于 background.js）  
**功能**:
- 封装所有 Chrome Storage 操作
- 处理数据的 CRUD
- 数据迁移和初始化

**导出函数**:
- `getDataForTab()`: 获取数据
- `markTourAsCompleted()`: 标记完成
- `addTour()`, `updateTour()`, `deleteTour()`: 任务 CRUD
- `addHoverHint()`, `updateHoverHint()`, `deleteHoverHint()`: 提示 CRUD
- `loadDefaultRules()`: 加载默认规则
- `migrateOldData()`: 迁移旧数据

**依赖**: 无（仅在 background.js 中使用）

---

### utils.js
**职责**: 通用工具函数  
**功能**:
- URL 匹配比较
- CSS 选择器生成
- 唯一 ID 生成

**导出函数**:
- `areUrlsMatching()`: 比较 URL 是否匹配
- `generateSelector()`: 生成元素的 CSS 选择器
- `generateUniqueId()`: 生成唯一 ID

**依赖**: 无（基础工具模块）

---

### dom-modifier.js & highlighter.js
**状态**: 预留模块  
**用途**: 
- `dom-modifier.js`: 用于修改页面 DOM 元素
- `highlighter.js`: 用于高亮页面元素

**当前**: 包含示例代码，可根据需要扩展

---

## 📚 vendor/ 目录详解

### intro.min.js
**类型**: 第三方库  
**作用**: Intro.js 核心库，用于创建分步引导教程

**功能**:
- 提供分步引导 API
- 管理引导流程
- 处理用户交互（下一步、上一步、完成）

**文档**: https://introjs.com/docs

---

### introjs.min.css
**类型**: 样式文件  
**作用**: Intro.js 的默认样式

**包含**:
- 引导遮罩层样式
- 提示框样式
- 按钮样式
- 动画效果

---

## 📖 文档目录

### ARCHITECTURE.md
详细的架构设计文档，包含模块说明、数据流、设计决策等。

### QUICK_REFERENCE.md
快速参考指南，帮助快速定位功能和修改代码。

### REFACTOR_SUMMARY.md
重构总结文档，记录重构前后的对比和改进。

### 重构完成.md
重构完成说明（中文版），包含使用指南和注意事项。

---

## 🖥️ server/ 目录文件详解 (后端与 Web 控制台)

### Docker 部署相关
- **Dockerfile**: 基于 Node.js 18 (Alpine) 构建的轻量级镜像，在服务启动前自动执行数据库初始化，确保即插即用。
- **docker-compose.yml**: 官方推荐的免环境部署方式，默认配置端口映射，并将 SQLite 数据文件挂载到 `./data` 目录以实现持久化。
- **.dockerignore**: 排除源码中的 `node_modules` 及本地数据库文件，优化镜像体积。

### server.js
**作用**: 后端核心入口。负责加载 Express 中间件、挂载 `/api/*` 模块化路由，并将 `server/public` 托管为静态 Web 控制台前端。

### public/ (Web 可视化控制台)
**作用**: 为用户与管理员提供开箱即用的 Web 界面。
- **index.html**: 控制台 SPA 骨架，包含概览看板、任务管理、提示管理、用户列表与系统监控视图。
- **css/dashboard.css**: 深色高质感设计系统，支持玻璃拟态与平滑微动效。
- **js/api.js**: 统一封装客户端与 Express 接口的 Fetch 请求。
- **js/app.js**: 负责视图切换、数据过滤检索、模态框弹出与删除确认。

### routes/ (模块化路由目录)
- **auth.js**: 处理用户注册 (`/register`) 与登录鉴权 (`/login`)。
- **guides.js**: 处理引导任务的发布、基于域名的拉取、全量查询 (`/all`)、单条详情与安全删除 (`DELETE /:id`)。
- **hints.js**: 处理悬停提示的发布、基于域名的拉取、全量查询 (`/all`) 与安全删除 (`DELETE /:id`)。
- **stats.js**: 汇总平台核心指标 (`/overview`)、用户列表 (`/users`) 及 Node 运行状态 (`/system`)。

### middleware/auth.js
**作用**: 基于 JWT 的请求鉴权中间件，用于校验修改或发布云端规则的操作者身份。

---

## 🔄 模块依赖关系图

```
content.js (入口)
  ├─→ communication.js
  ├─→ ui-manager.js
  │     ├─→ utils.js
  │     ├─→ communication.js
  │     ├─→ element-selector.js
  │     ├─→ tour-manager.js
  │     └─→ hover-hints.js
  ├─→ element-selector.js
  │     ├─→ utils.js
  │     └─→ communication.js
  ├─→ hover-hints.js
  │     └─→ utils.js
  └─→ tour-manager.js
        ├─→ utils.js
        └─→ communication.js

background.js (入口)
  └─→ storage-api.js
```

---

## 💡 设计原则

1. **单一职责**: 每个模块只负责一个功能领域
2. **低耦合**: 模块间通过明确的接口通信
3. **高内聚**: 相关功能集中在同一模块
4. **可扩展**: 易于添加新功能模块
5. **可测试**: 模块独立，便于单元测试

---

## 📝 命名规范

- **文件名**: 小写 + 连字符（`element-selector.js`）
- **函数名**: 驼峰命名（`startSelectionMode()`）
- **常量名**: 全大写 + 下划线（`MAX_WIDTH`）
- **模块导出**: 使用 `export` 关键字
- **模块导入**: 使用动态 `import()`

---

更新时间: 2025-12-18  
维护者: O-Maid Team
