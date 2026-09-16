# O-Maid Backend Server

这是 O-Maid 云端共享版本的轻量级后端服务，内置了**现代化的 Web 可视化管理控制台**。
它基于 Node.js、Express 和 SQLite 构建，提供用户注册、登录、发布和发现云端导览与提示的接口，并为管理员提供了全景看板和数据管理后台。

## 环境要求
- Node.js (v16 或更高版本)
- npm

## 快速启动

1. **Docker 部署（推荐）**：
   在 `server` 目录下，使用 Docker Compose 一键启动服务：
   ```bash
   cd server
   docker-compose up -d
   ```
   *服务默认运行在 8632 端口，数据将持久化在 `server/data/` 目录下。如需修改端口或使用外置 MySQL/PostgreSQL 数据库，请编辑 `docker-compose.yml` 文件。*

2. **一键启动脚本（本地 Node 环境）**：
   在项目根目录下执行启动脚本：
   ```bash
   ./start-server.sh [端口号]
   # 示例：使用默认端口 8632
   ./start-server.sh
   # 示例：指定端口 8080 避免冲突
   ./start-server.sh 8080
   ```

3. **配置数据库与初始化（本地 Node 环境）**：
   - 复制环境配置模板：
     ```bash
     cd server
     cp .env.example .env
     ```
   - 数据库类型可通过 `.env` 中的 `DB_TYPE` 配置：
     - 本地开发：默认 `DB_TYPE=sqlite`，无需额外配置。
     - 线上部署：设置 `DB_TYPE=mysql` 或 `DB_TYPE=postgres` 并配置主机与账号密码。
   - 执行独立的数据库建表与初始数据播种脚本：
     ```bash
     npm run db:init
     # 如需重置清空旧库，可运行：npm run db:init -- --force
     ```
     > 初始化完成后会自动生成初始管理员账号（`admin / admin123`）。

4. **运行全量自动化测试**：
   ```bash
   npm test
   ```
   > 自动化测试套件包含 16 个核心测试用例，覆盖：数据库表完整性、账号认证、普通用户发布待审、多层级可见性隔离（访客/他人/作者）、管理员审核通过与驳回、免审特权以及看板统计，并在测试完成后自动清理测试数据。

5. **手动启动服务（本地 Node 环境）**：
   ```bash
   npm start
   ```

---

## 🖥️ Web 可视化管理控制台

服务启动成功后，直接用浏览器访问服务根地址即可进入 Web 控制台：
- **控制台地址**：`http://localhost:<端口>/`（例如 `http://localhost:8632/`）
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
├── config/                # 统一数据库配置
│   └── database.js        # 多数据库配置与连接池定义
├── scripts/               # 运维与自动化脚本
│   └── init-db.js         # 独立数据库建表与种子数据播种脚本
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
├── database.js            # 数据库实例导出与运行时探活
├── server.js              # 服务端主入口（集成静态托管 + 路由挂载）
├── .env.example           # 数据库与环境变量模板
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
- **说明**: 管理员账号发布直接免审生效（`status: approved`）；普通用户发布或修改需进入待审（`status: pending`）。
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
- **Response**: `{ "success": true, "id": "tour-xxx", "status": "approved" | "pending" }`

#### 审核导览任务 (仅管理员)
- **POST** `/api/guides/:id/audit`
- **Headers**: `Authorization: Bearer <admin-token>`
- **Body**: `{ "status": "approved" | "rejected" | "pending" }`
- **Response**: `{ "success": true, "id": "...", "status": "approved" }`

#### 获取特定域名的导览（插件端拉取）
- **GET** `/api/guides?domain=example.com`
- **说明**: 匿名访客仅拉取已审核通过 (`approved`) 的规则；登录用户可额外获取自己创建的待审核规则。
- **Response**: `{ "success": true, "guides": [...] }`

#### 获取全量导览列表（管理后台 / 广场大厅）
- **GET** `/api/guides/all[?status=pending]`
- **说明**: 匿名仅拉取 `approved`；登录作者可拉取自己全部；管理员可查看全量及按状态筛选。
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

#### 发布/更新悬停提示
- **POST** `/api/hints`
- **Headers**: `Authorization: Bearer <token>`
- **说明**: 管理员账号发布直接免审生效（`status: approved`）；普通用户发布或修改需进入待审（`status: pending`）。
- **Body**:
  ```json
  {
    "id": "hint-xxx",
    "url": "https://example.com/page",
    "domain": "example.com",
    "selector": "#btn-submit",
    "text": "点击此处提交表单"
  }
  ```
- **Response**: `{ "success": true, "id": "hint-xxx", "status": "approved" | "pending" }`

#### 审核悬停提示 (仅管理员)
- **POST** `/api/hints/:id/audit`
- **Headers**: `Authorization: Bearer <admin-token>`
- **Body**: `{ "status": "approved" | "rejected" | "pending" }`
- **Response**: `{ "success": true, "id": "...", "status": "approved" }`

#### 获取特定域名的悬停提示（插件端拉取）
- **GET** `/api/hints?domain=example.com`
- **说明**: 匿名访客仅拉取已审核通过 (`approved`) 的提示；登录用户可额外获取自己创建的待审核提示。
- **Response**: `{ "success": true, "hints": [...] }`

#### 获取全量悬停提示列表（管理后台 / 广场大厅）
- **GET** `/api/hints/all[?status=pending]`
- **说明**: 匿名仅拉取 `approved`；登录作者可拉取自己全部；管理员可查看全量及按状态筛选。
- **Response**: `{ "success": true, "hints": [...] }`

#### 获取单项提示详情
- **GET** `/api/hints/:id`
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
