# O-Maid Backend Server

这是 O-Maid 云端共享版本的轻量级后端服务，内置了**现代化的 Web 可视化管理控制台**。
它基于 Node.js、Express 和 SQLite 构建，提供用户注册、登录、发布和发现云端导览与提示的接口，并为管理员提供了全景看板和数据管理后台。

## 环境要求
- Node.js (v16 或更高版本)
- npm

## 快速启动

1. **一键启动（推荐）**：
   在项目根目录下执行启动脚本：
   ```bash
   ./start-server.sh [端口号]
   # 示例：使用默认端口 3000
   ./start-server.sh
   # 示例：指定端口 8080 避免冲突
   ./start-server.sh 8080
   ```

2. **手动启动**：
   ```bash
   cd server
   npm install
   PORT=8080 npm start
   ```

3. **数据库文件**：
   第一次启动时，会在当前目录下自动生成一个 `data.db`（SQLite 数据库文件），请勿将其提交到 Git（已在根目录的 `.gitignore` 中被忽略）。

---

## 🖥️ Web 可视化管理控制台

服务启动成功后，直接用浏览器访问服务根地址即可进入 Web 控制台：
- **控制台地址**：`http://localhost:<端口>/`（例如 `http://localhost:3000/`）
- **功能特性**：
  - **平台概览**：实时统计用户总数、任务数、提示数、累计下载量，并展示最新发布动态流。
  - **引导任务管理**：全量检索所有云端任务，支持查看步骤详情模态框，以及一键删除不合规任务。
  - **悬停提示管理**：全量检索悬停提示、选择器规则与生效网址，支持管理与删除。
  - **用户列表**：查看已注册用户列表及其发布作品统计。
  - **系统监控与 API**：实时查看 Node.js 运行时状态、堆内存消耗、系统运行时间与 RESTful 接口调试指南。

---

## 📁 目录结构

```text
server/
├── public/                # Web 控制台静态资源前端
│   ├── index.html         # 控制台单页主结构
│   ├── css/
│   │   └── dashboard.css  # 现代深色系与玻璃拟态设计系统
│   └── js/
│       ├── api.js         # 前端 API 交互封装
│       └── app.js         # 控制台交互逻辑与数据动态渲染
├── routes/                # 模块化路由
│   ├── auth.js            # 账号注册与登录接口
│   ├── guides.js          # 引导任务增删改查接口
│   ├── hints.js           # 悬停提示增删改查接口
│   └── stats.js           # 仪表盘统计与系统监控接口
├── middleware/            # 中间件
│   └── auth.js            # JWT 身份鉴权中间件
├── database.js            # SQLite 数据库模型与初始化
├── server.js              # 服务端主入口（集成静态托管 + 路由挂载）
├── package.json
└── README.md
```

---

## 📡 API 接口文档

### 1. 鉴权接口

#### 注册账号
- **POST** `/api/auth/register`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "userId": 1 }`

#### 登录账号
- **POST** `/api/auth/login`
- **Body**: `{ "username": "xxx", "password": "xxx" }`
- **Response**: `{ "success": true, "token": "jwt-token-string", "username": "xxx" }`

#### 删除用户账号
- **DELETE** `/api/auth/users/:id`
- **Response**: `{ "success": true, "message": "用户已删除" }`

#### 重置用户密码
- **POST** `/api/auth/users/:id/reset-password`
- **Body**: `{ "newPassword": "xxx" }`
- **Response**: `{ "success": true, "message": "密码重置成功" }`

---

### 2. 云端导览 (Guides)

#### 发布/更新导览
- **POST** `/api/guides`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "id": "tour-xxx",
    "name": "新手引导",
    "startUrl": "https://example.com",
    "domain": "example.com",
    "steps": [...]
  }
  ```
- **Response**: `{ "success": true }`

#### 获取特定域名的导览（插件端拉取）
- **GET** `/api/guides?domain=example.com`
- **Response**: `{ "success": true, "guides": [...] }`

#### 获取全量导览列表（管理后台）
- **GET** `/api/guides/all`
- **Response**: `{ "success": true, "guides": [...] }`

#### 获取单项导览详情
- **GET** `/api/guides/:id`
- **Response**: `{ "success": true, "guide": { ... } }`

#### 下载导览（下载计数 +1）
- **POST** `/api/guides/:id/download`
- **Response**: `{ "success": true }`

#### 删除指定导览
- **DELETE** `/api/guides/:id`
- **Response**: `{ "success": true, "message": "删除成功" }`

---

### 3. 悬停提示 (Hints)

#### 发布/更新提示
- **POST** `/api/hints`
- **Headers**: `Authorization: Bearer <token>`
- **Body**:
  ```json
  {
    "id": "hint-xxx",
    "url": "https://example.com/page",
    "domain": "example.com",
    "selector": "#submit-btn",
    "text": "这是一个按钮"
  }
  ```
- **Response**: `{ "success": true }`

#### 获取特定域名的提示（插件端拉取）
- **GET** `/api/hints?domain=example.com`
- **Response**: `{ "success": true, "hints": [...] }`

#### 获取全量提示列表（管理后台）
- **GET** `/api/hints/all`
- **Response**: `{ "success": true, "hints": [...] }`

#### 删除指定提示
- **DELETE** `/api/hints/:id`
- **Response**: `{ "success": true, "message": "删除成功" }`

---

### 4. 统计与监控接口 (Stats)

#### 平台数据概览统计
- **GET** `/api/stats/overview`
- **Response**:
  ```json
  {
    "success": true,
    "stats": {
      "totalUsers": 12,
      "totalGuides": 34,
      "totalHints": 56,
      "totalDownloads": 128,
      "recentActivities": [...]
    }
  }
  ```

#### 用户列表及发布统计
- **GET** `/api/stats/users`
- **Response**: `{ "success": true, "users": [...] }`

#### 系统运行时监控信息
- **GET** `/api/stats/system`
- **Response**:
  ```json
  {
    "success": true,
    "system": {
      "nodeVersion": "v20.x",
      "platform": "linux",
      "uptimeSeconds": 3600,
      "memoryUsage": { "heapUsed": "18.2 MB" },
      "serverTime": "2026-09-03T11:00:00.000Z"
    }
  }
  ```
