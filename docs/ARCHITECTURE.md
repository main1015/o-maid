# O-Maid Chrome 扩展 - 代码结构说明

## 📁 项目结构

```
o-maid/
├── manifest.json           # Chrome 扩展配置文件
├── background.js           # 后台服务工作者（入口）
├── content.js              # 内容脚本（入口）
├── popup.html              # 弹出窗口 HTML
├── popup.js                # 弹出窗口脚本
├── rules.json              # 默认规则配置
│
├── modules/                # 功能模块目录
│   ├── communication.js    # 通信模块 - 与 background 的通信
│   ├── element-selector.js # 元素选择模块 - 元素选择和高亮
│   ├── hover-hints.js      # 悬停提示模块 - 悬停提示功能
│   ├── tour-manager.js     # 任务管理模块 - 引导任务管理
│   ├── ui-manager.js       # UI 管理模块 - 面板 UI 管理
│   ├── storage-api.js      # 存储 API 模块 - 数据存储操作
│   ├── utils.js            # 工具函数模块 - 通用工具函数
│   ├── dom-modifier.js     # DOM 修改模块（预留）
│   └── highlighter.js      # 高亮模块（预留）
│
└── vendor/                 # 第三方库
    ├── intro.min.js        # Intro.js 库
    └── introjs.min.css     # Intro.js 样式
```

## 🧩 模块说明

### 1. **communication.js** - 通信模块
**职责**: 处理与 background 脚本的所有通信
- `connectPort()` - 建立与 background 的连接
- `registerMessageHandler()` - 注册消息处理器
- `postPortMessage()` - 发送消息到 background
- `sendMessage()` - 发送消息并等待响应
- `getDataForTab()` - 获取当前标签页数据
- `addTour()`, `updateTour()`, `deleteTour()` - 任务 CRUD
- `addHoverHint()`, `updateHoverHint()`, `deleteHoverHint()` - 提示 CRUD

### 2. **element-selector.js** - 元素选择模块
**职责**: 处理页面元素的选择和高亮
- `startSelectionMode()` - 开始选择模式
- `stopSelectionMode()` - 停止选择模式
- `highlightElementForSelection()` - 高亮鼠标悬停的元素
- `selectElementForAction()` - 选择元素执行操作
- `handleElementSelection()` - 处理元素选择结果

### 3. **hover-hints.js** - 悬停提示模块
**职责**: 管理页面上的悬停提示功能
- `createHoverTooltip()` - 创建悬停提示元素
- `initHoverHints()` - 初始化悬停提示
- `getHoverTooltip()` - 获取悬停提示元素

### 4. **tour-manager.js** - 任务管理模块
**职责**: 处理引导任务的启动、导航和完成
- `startTour()` - 开始引导任务
- `checkAndStartAutoTour()` - 检查并自动启动任务

### 5. **ui-manager.js** - UI 管理模块
**职责**: 管理所有面板相关的 UI 逻辑和用户交互
- `createUIPanel()` - 创建 UI 面板
- `switchToView()` - 切换视图
- `showPanel()`, `hidePanel()`, `togglePanel()` - 面板显示控制
- 内部函数处理列表渲染、表单保存等

### 6. **storage-api.js** - 存储 API 模块
**职责**: 封装所有数据存储相关的操作（用于 background.js）
- `getDataForTab()` - 获取标签页数据
- `markTourAsCompleted()` - 标记任务完成
- `addTour()`, `updateTour()`, `deleteTour()` - 任务 CRUD
- `addHoverHint()`, `updateHoverHint()`, `deleteHoverHint()` - 提示 CRUD
- `loadDefaultRules()` - 加载默认规则
- `migrateOldData()` - 迁移旧版本数据

### 7. **utils.js** - 工具函数模块
**职责**: 提供通用的工具函数
- `areUrlsMatching()` - 比较两个 URL 是否匹配
- `generateSelector()` - 为元素生成唯一的 CSS 选择器
- `generateUniqueId()` - 生成唯一 ID

## 🔄 数据流

```
用户操作
   ↓
UI Manager (ui-manager.js)
   ↓
Communication (communication.js)
   ↓
Background (background.js)
   ↓
Storage API (storage-api.js)
   ↓
Chrome Storage
```

## 📝 主要改进

1. **模块化**: 代码按功能拆分到独立模块，职责清晰
2. **可维护性**: 每个模块专注于单一功能，易于理解和修改
3. **可扩展性**: 新功能可以作为新模块添加，不影响现有代码
4. **可测试性**: 独立模块更容易进行单元测试
5. **代码复用**: 通用功能（如 utils）可在多处复用

## 🚀 使用方式

### 开发
1. 修改相应模块的代码
2. 在 Chrome 扩展管理页面重新加载扩展

### 添加新功能
1. 在 `modules/` 目录下创建新模块
2. 在主文件（`content.js` 或 `background.js`）中导入并使用
3. 如需暴露给其他模块，导出相应函数

## 📌 注意事项

- 所有模块使用 ES6 模块语法（`import`/`export`）
- `manifest.json` 中已配置支持模块类型
- `web_accessible_resources` 允许模块文件被访问
- 保持模块间的低耦合，通过明确的接口通信
