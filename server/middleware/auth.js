const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.SECRET_KEY || 'o-maid-secret-key-dev';

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

const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    }
    return res.status(403).json({ error: '权限不足：仅管理员允许执行此操作' });
};

module.exports = {
    SECRET_KEY,
    authenticateToken,
    requireAdmin
};
