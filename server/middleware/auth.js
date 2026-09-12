const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY || 'o-maid-secret-key-dev';

// 严格鉴权：必须携带有效 Token，否则返回 401/403
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.status(401).json({ error: '未提供 Token' });

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token 无效或已过期' });
        req.user = user;
        next();
    });
};

// 可选鉴权：若提供有效 Token 则挂载 req.user，未提供或无效则 req.user 为 null，不中断流程
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        req.user = null;
        return next();
    }

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (!err && user) {
            req.user = user;
        } else {
            req.user = null;
        }
        next();
    });
};

// 管理员权限检查
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ error: '权限不足：仅管理员允许执行此操作' });
};

module.exports = {
    SECRET_KEY,
    authenticateToken,
    optionalAuth,
    requireAdmin
};
