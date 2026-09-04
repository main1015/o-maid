# O-Maid 功能设计与完善过程

本文档记录了 "O-Maid" 浏览器插件的核心功能设计、数据结构、计划实现步骤以及未来的扩展方向。

## 1. 核心功能规划

为了实现一个强大且灵活的页面引导功能，我们将提示系统分为两种主要类型：

### 1.1. 单个提示 (Single Hint)

-   **触发方式**: 当用户的鼠标悬停在页面中的特定元素上时触发。
-   **行为**: 显示一个简短的提示信息（Tooltip/Popover），当鼠标移开后自动消失。
-   **特点**:
    -   轻量、无干扰。
    -   各个提示之间相互独立，没有关联。
    -   用于对特定UI功能点的解释说明。

### 1.2. 关联提示 / 引导 (Guided Tour)

-   **触发方式**:
    1.  **自动触发**: 用户访问某个特定URL时，自动开启引导流程。
    2.  **手动触发**: 用户从插件的侧边栏或弹窗中，主动点击某个引导任务来启动。
-   **行为**: 按照预设的步骤（第一步、第二步...）顺序进行，一步步指引用户操作。
-   **特点**:
    -   具有明确的步骤和顺序。
    -   支持跨URL，引导流程可以在多个页面之间跳转和延续。
    -   需要记录用户当前的进度（例如，进行到第几步）。
    -   适用于新手入门、核心功能介绍、复杂操作流程教学等场景。


## 2. 项目结构

本项目采用模块化架构设计，代码按功能拆分到不同的模块中。

### 快速了解

```text
o-maid/
├── extension/            # Chrome 扩展文件目录 (前端)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html/js
│   ├── sidepanel.html/js
│   ├── rules.json
│   ├── modules/
│   ├── styles/
│   └── vendor/
├── server/               # 后端服务目录 (Node.js + SQLite)
│   ├── server.js
│   ├── database.js
│   └── package.json
└── docs/                 # 文档目录
```

**📖 详细说明**: 查看 [docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md) 了解完整的目录结构和各文件功能详解。

**🏗️ 架构文档**: 查看 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) 了解模块化架构设计。

**🚀 快速参考**: 查看 [docs/QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md) 快速定位功能和修改代码。


## 3. 数据结构设计

为了支持上述功能并为未来API集成做好准备，我们设计了以下JSON数据结构。初期这些数据将存储在 `chrome.storage.local` 中。

```json
{
  "guides": [
    {
      "id": "guide-001",
      "name": "新手入门引导",
      "trigger": "auto",
      "startUrl": "https://example.com/welcome",
      "steps": [
        {
          "step": 1,
          "url": "https://example.com/welcome",
          "element": "#welcome-button",
          "title": "第一步：欢迎使用",
          "content": "点击这个按钮，开始我们的探索之旅。",
          "position": "bottom"
        },
        {
          "step": 2,
          "url": "https://example.com/dashboard",
          "element": ".dashboard-feature",
          "title": "第二步：了解仪表盘",
          "content": "这里是您的主控制面板，展示了所有核心数据。",
          "position": "right"
        }
      ]
    }
  ],
  "singleHints": [
    {
      "id": "hint-001",
      "url": "https://example.com/dashboard",
      "element": ".help-icon",
      "content": "这是一个帮助图标，悬停以查看该功能的详细说明。",
      "trigger": "hover"
    }
  ]
}
```

## 4. 功能实现步骤

我们将按照以下步骤来逐步完成开发：

1.  **数据结构初始化**:
    -   在 `rules.json` 或一个专门的模块中定义默认的引导和提示规则。
    -   编写脚本在插件安装时，将这些默认规则加载到 `chrome.storage.local`。

2.  **存储层封装**:
    -   创建一组函数，用于安全地读取和更新 `chrome.storage.local` 中的规则数据。

3.  **内容脚本 (`content.js`) 核心逻辑**:
    -   **页面加载**: 脚本注入后，从`storage`中获取规则，检查当前URL是否匹配任何`auto`类型的引导或`singleHints`。
    -   **引导启动**: 如果匹配，使用 `intro.js` (或类似库) 来启动引导流程。
    -   **悬停提示**: 为所有匹配的`singleHints`元素绑定 `mouseover` 和 `mouseout` 事件，以显示和隐藏提示。
    -   **通信**: 监听从背景脚本 (`background.js`) 发来的消息，例如手动开始/停止一个引导。

4.  **背景脚本 (`background.js`) 状态管理**:
    -   **状态跟踪**: 记录当前正在进行的引导任务ID和用户所在的步骤。
    -   **URL监听**: 监听 `chrome.tabs.onUpdated` 事件，当用户在引导过程中跳转页面时，检查新URL是否与引导的下一步匹配。如果匹配，则通知 `content.js` 显示下一步提示。
    -   **消息中继**: 作为 `popup.js` 和 `content.js` 之间的桥梁，传递控制命令。

5.  **用户界面 (`popup.js` & `popup.html`)**:
    -   **列表展示**: 读取`storage`中的所有`manual`类型的引导，并将其列表展示给用户。
    -   **控制按钮**: 为每个引导任务添加"开始"按钮，点击后向 `background.js` 发送消息以启动引导。
    -   (可选) 提供一个"停止当前引导"的全局功能。

## 5. 未来规划

-   **后端API集成**:
    -   设计RESTful API用于从服务器获取和保存引导规则。
    -   创建`saveToBackend(data)`和`loadFromBackend()`等占位函数，初期可以模拟异步请求，后期替换为真实的 `fetch` 调用。
    -   数据结构保持与前端一致，方便序列化和传输。
-   **可视化编辑器**:
    -   在插件的某个页面中，提供一个图形化界面，让用户可以"录制"或"编辑"引导步骤，而无需手动编写JSON。

---

## 📚 相关文档

- **[docs/PROJECT_STRUCTURE.md](./docs/PROJECT_STRUCTURE.md)** - 详细的项目目录结构说明
- **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - 模块化架构设计文档
- **[docs/QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md)** - 快速参考指南
- **[docs/record/REFACTOR_SUMMARY.md](./docs/record/REFACTOR_SUMMARY.md)** - 重构总结
- **[docs/record/重构完成.md](./docs/record/重构完成.md)** - 重构完成说明（中文）
