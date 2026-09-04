const express = require('express');
const cors = require('cors');
const path = require('path');

// 导入路由模块
const authRoutes = require('./routes/auth');
const guidesRoutes = require('./routes/guides');
const hintsRoutes = require('./routes/hints');
const statsRoutes = require('./routes/stats');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件配置
app.use(cors());
app.use(express.json());

// 静态资源目录（托管管理控制台前端）
app.use(express.static(path.join(__dirname, 'public')));

// 挂载 API 路由
app.use('/api/auth', authRoutes);
app.use('/api/guides', guidesRoutes);
app.use('/api/hints', hintsRoutes);
app.use('/api/stats', statsRoutes);

// 单页应用兜底路由（非 API 请求默认提供控制台界面）
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API 404 错误兜底（保证所有未匹配的 API 返回 JSON 而非 HTML）
app.use('/api', (req, res) => {
    res.status(404).json({ error: `接口不存在: ${req.method} ${req.originalUrl}` });
});

// 启动服务
app.listen(PORT, () => {
    console.log(`==============================================`);
    console.log(`🚀 O-Maid 云端服务已就绪`);
    console.log(`📡 API 服务地址:  http://localhost:${PORT}/api`);
    console.log(`🖥️  Web 控制台:    http://localhost:${PORT}/`);
    console.log(`==============================================`);
});

module.exports = app;
