# Web 控制台鉴权与用户管理体系设计 (RBAC 升级版)

> **文档目的**：针对 O-Maid Cloud Server 的用户登录鉴权与角色权限控制体系进行规范化设计，确立“超级管理员 (admin)”与“普通创作者 (user)”两级权限体系，确保平台数据安全、防止越权操作，保障 Chrome 插件端免登正常运行。

---

## 1. 需求背景与现状分析

在完成首期 JWT 登录鉴权后，系统实现了未登录访问拦截与 Token 签发验证。但目前尚未做用户角色与权限的划分：
- 任何注册成功的用户均具有相同的高级权限，可随意删除其他作者创建的引导规则与提示；
- 任何注册用户均可进入【用户管理】重置他人密码甚至删除其他用户账号；
- 顶栏与侧边栏的身份信息目前无角色区分。

为此，需引入**基于角色的权限控制体系 (RBAC, Role-Based Access Control)**，明确角色职责与操作边界。

---

## 2. 角色定义与权限矩阵 (RBAC)

### 2.1 角色定义

| 角色代码 | 角色名称 | 角色定位与职责 |
| :--- | :--- | :--- |
| **`admin`** | **超级管理员** | 负责平台系统维护与全部内容治理。拥有平台所有功能，包括用户账号管理、全量数据删改、系统健康监控等。 |
| **`user`** | **普通创作者** | 负责个人业务规则编写。仅能创建并管理**属于自己（创建者为本人）**的引导任务与悬停提示，无权涉及系统运维与其他用户数据。 |

### 2.2 角色权限与路由矩阵

| 功能模块 | 接口路由 | 请求方法 | 权限要求 | 行为规范说明 |
| :--- | :--- | :--- | :--- | :--- |
| **用户认证** | `/api/auth/register` | `POST` | **公开 (无需鉴权)** | 开放注册（首个注册用户自动为 `admin`，后续默认为 `user`） |
| | `/api/auth/login` | `POST` | **公开 (无需鉴权)** | 登录换取包含 `id`, `username`, `role` 的 JWT Token |
| | `/api/auth/me` | `GET` | **已登录** (`admin` 或 `user`) | 获取当前登录用户的详细 Profile（含角色） |
| **用户管理** | `/api/stats/users` | `GET` | **仅管理员 (`admin`)** | 仅管理员可查看全平台注册用户列表 |
| | `/api/auth/users/:id` | `DELETE` | **仅管理员 (`admin`)** | 仅管理员可注销/删除用户账号 |
| | `/api/auth/users/:id/reset-password` | `POST` | **仅管理员 (`admin`)** | 仅管理员可重置他人密码 |
| | `/api/auth/users/:id/role` | `POST` | **仅管理员 (`admin`)** | 仅管理员可调整用户角色 (`admin` ↔ `user`) |
| **系统监控** | `/api/stats/system` | `GET` | **仅管理员 (`admin`)** | 仅管理员可查看服务器硬件/Node进程等敏感状态 |
| **引导任务** | `/api/guides/all` | `GET` | **已登录** (`admin` 或 `user`) | 查看任务列表 |
| | `/api/guides` | `POST` | **已登录** (`admin` 或 `user`) | 录入/更新任务，强制绑定 `authorId = req.user.id` |
| | `/api/guides/:id` | `DELETE` | **数据所有者或管理员** | **管理员可删任意数据；普通用户仅能删除本人创建的任务**（越权返回 403） |
| | `/api/guides?domain=...` | `GET` | **公开 (无需鉴权)** | **Chrome 插件专用**，免登按域名拉取规则 |
| **悬停提示** | `/api/hints/all` | `GET` | **已登录** (`admin` 或 `user`) | 查看提示列表 |
| | `/api/hints` | `POST` | **已登录** (`admin` 或 `user`) | 录入/更新提示，强制绑定 `authorId = req.user.id` |
| | `/api/hints/:id` | `DELETE` | **数据所有者或管理员** | **管理员可删任意数据；普通用户仅能删除本人创建的提示**（越权返回 403） |
| | `/api/hints?domain=...` | `GET` | **公开 (无需鉴权)** | **Chrome 插件专用**，免登按域名拉取提示 |
| **数据概览** | `/api/stats/overview` | `GET` | **已登录** (`admin` 或 `user`) | 平台基础概况数据看板 |

---

## 3. 数据库与数据模型设计

### 3.1 `users` 表结构升级
在 SQLite `users` 表中增加 `role` 字段：
```sql
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';
```

字段说明：
- `role`: 角色字符串，枚举值包括 `'admin'` 与 `'user'`，默认值为 `'user'`。

### 3.2 首次部署与管理员初始化规则
- 当注册新用户时，若数据库内用户总数为 0，则自动赋予该首位注册用户 `role = 'admin'`。
- 数据库初始化脚本在升级老数据时，默认将现有 `id = 1` 的初始用户置为 `role = 'admin'`，其余老用户置为 `role = 'user'`。

---

## 4. 后端设计方案 (Node.js API)

### 4.1 中间件设计
在 `server/middleware/auth.js` 中扩充权限拦截器：
1. **`authenticateToken`**：
   - 校验 JWT Token 签名有效性，将解出的 `{ id, username, role }` 挂载到 `req.user`。
2. **`requireAdmin`**：
   - 检查 `req.user.role === 'admin'`；若不是，立即返回 `403 Forbidden`（`{ error: '权限不足：仅系统管理员允许执行此操作' }`）。

### 4.2 数据所有权防越权校验 (Row-Level Security)
在任务删除接口中执行所有权判断：
- `DELETE /api/guides/:id`：
  ```javascript
  // 1. 查询该条指南的 authorId
  // 2. 判断：if (req.user.role !== 'admin' && guide.authorId !== req.user.id) -> return res.status(403).json({ error: '无权删除他人创建的引导任务' });
  // 3. 执行删除
  ```
- `DELETE /api/hints/:id`：
  ```javascript
  // 同理校验 authorId 或 admin 权限
  ```

---

## 5. 前端控制台设计 (Web Console)

### 5.1 模块分层与职责（严格保持结构与功能分明）
- `public/js/auth.js`：
  - 维护当前用户的完整信息（包含 `user.role`）。
  - 提供 `isAdmin()` 便捷判断方法。
  - 向顶栏和侧边栏准确渲染当前用户的角色标签（绿色“管理员” / 蓝色“创作者”）。
- `public/js/app.js`：
  - **侧边栏菜单权限过滤**：普通用户登录后，自动隐藏侧边栏的【用户管理】（`data-tab="users"`）和【系统与 API】（`data-tab="system"`）菜单项。
  - **路由防穿透拦截**：普通用户若试图通过切换 Tab 查看敏感 Tab，自动提示“当前角色无权访问”并回退至“平台概览”。
  - **列表操作按钮动态控制**：
    - 引导任务列表与悬停提示列表中，对于非当前用户创建的数据：
      - 管理员显示红色的【删除】按钮；
      - 普通用户则隐藏【删除】按钮（或显示为置灰禁用状态），避免视觉误导。

---

## 6. 开发实施计划 (Implementation Steps)

1. **步骤 1：数据库表结构升级与管理员初始化**
   - 在 `server/database.js` 增加兼容迁移逻辑，给 `users` 表添加 `role` 字段，并确保首个注册用户/初始用户为 `admin`。
2. **步骤 2：后端鉴权与授权中间件升级**
   - 在 `server/middleware/auth.js` 中新增 `requireAdmin` 中间件，并在 JWT 签名中包含 `role`。
   - 在 `server/routes/auth.js`、`server/routes/stats.js` 中为用户管理和系统监控接口挂载 `requireAdmin`。
   - 在 `server/routes/guides.js` 和 `server/routes/hints.js` 的 `DELETE` 路由中增加行级所有权校验（本人或管理员）。
3. **步骤 3：前端认证模块增强 (`auth.js`)**
   - 增加 `role` 状态管理与 `isAdmin()` 辅助函数，顶栏与侧边栏渲染对应的角色微标（管理员 / 创作者）。
4. **步骤 4：前端控制台视图与操作权限控制 (`app.js` & `dashboard.css`)**
   - 根据角色动态显示/隐藏侧边栏【用户管理】与【系统监控】Tab。
   - 列表项根据作者归属动态控制【删除】按钮的显示与禁用状态。
5. **步骤 5：角色权限全流程自动化测试与验证**
   - 编写多角色（Admin 与 User）自动化测试用例，验证越权拦截、删除权限隔离及插件免登读取正常。
