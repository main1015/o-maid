const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { SECRET_KEY, authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取当前登录用户信息 (携带角色)
router.get('/me', authenticateToken, (req, res) => {
    db.get('SELECT id, username, role, created_at FROM users WHERE id = ?', [req.user.id], (err, user) => {
        if (err || !user) return res.status(404).json({ error: '用户不存在' });
        res.json({ success: true, user: { ...user, role: user.role || 'user' } });
    });
});

// 注册新用户（首个注册账号自动赋予 admin，后续公开注册为 user）
router.post('/register', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    // 检查是否有管理员 Token（管理员在后台添加用户时可以指定 role）
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    let isCallerAdmin = false;
    if (token) {
        try {
            const decoded = jwt.verify(token, SECRET_KEY);
            if (decoded && decoded.role === 'admin') isCallerAdmin = true;
        } catch (e) {}
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        db.get('SELECT COUNT(*) as count FROM users', [], (countErr, row) => {
            if (countErr) return res.status(500).json({ error: '服务器错误' });

            let assignedRole = 'user';
            if (row && row.count === 0) {
                // 系统首个用户自动设定为超级管理员
                assignedRole = 'admin';
            } else if (isCallerAdmin && role && ['admin', 'user'].includes(role)) {
                assignedRole = role;
            }

            db.run('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, hashedPassword, assignedRole], function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE')) {
                        return res.status(400).json({ error: '用户名已存在' });
                    }
                    return res.status(500).json({ error: '服务器错误: ' + err.message });
                }
                res.json({ success: true, userId: this.lastID, role: assignedRole });
            });
        });
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 登录
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
        if (err) return res.status(500).json({ error: '服务器错误' });
        if (!user) return res.status(400).json({ error: '用户名或密码错误' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(400).json({ error: '用户名或密码错误' });

        const userRole = user.role || 'user';
        const token = jwt.sign(
            { id: user.id, username: user.username, role: userRole }, 
            SECRET_KEY, 
            { expiresIn: '7d' }
        );

        res.json({ 
            success: true, 
            token, 
            username: user.username,
            role: userRole,
            user: { id: user.id, username: user.username, role: userRole } 
        });
    });
});

// 删除用户（仅管理员允许）
router.delete('/users/:id', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;

    // 防止管理员自杀式删除自身账号
    if (String(req.user.id) === String(id)) {
        return res.status(400).json({ error: '不能删除当前正在登录的管理员账号' });
    }

    db.serialize(() => {
        // 解除该用户已发布作品的关联（避免外键约束导致孤儿崩溃）
        db.run('UPDATE guides SET authorId = NULL WHERE authorId = ?', [id]);
        db.run('UPDATE hints SET authorId = NULL WHERE authorId = ?', [id]);
        db.run('DELETE FROM users WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ error: '删除用户失败: ' + err.message });
            if (this.changes === 0) return res.status(404).json({ error: '用户不存在' });
            res.json({ success: true, message: '用户已删除' });
        });
    });
});

// 重置用户密码（仅管理员允许）
router.post('/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) {
        return res.status(400).json({ error: '新密码不能为空' });
    }

    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        db.run('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id], function(err) {
            if (err) return res.status(500).json({ error: '重置密码失败' });
            if (this.changes === 0) return res.status(404).json({ error: '用户不存在' });
            res.json({ success: true, message: '密码重置成功' });
        });
    } catch (e) {
        res.status(500).json({ error: '服务器错误' });
    }
});

// 修改用户角色（仅管理员允许）
router.post('/users/:id/role', authenticateToken, requireAdmin, (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '角色必须是 admin 或 user' });
    }

    if (String(req.user.id) === String(id) && role !== 'admin') {
        return res.status(400).json({ error: '无法降级当前正在使用的超级管理员账号' });
    }

    db.run('UPDATE users SET role = ? WHERE id = ?', [role, id], function(err) {
        if (err) return res.status(500).json({ error: '修改角色失败: ' + err.message });
        if (this.changes === 0) return res.status(404).json({ error: '用户不存在' });
        res.json({ success: true, message: '角色修改成功' });
    });
});

module.exports = router;
