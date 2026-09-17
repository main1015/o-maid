const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { SECRET_KEY, authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取当前登录用户信息 (携带角色)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const user = await db('users')
            .select('id', 'username', 'role', 'created_at')
            .where({ id: req.user.id })
            .first();

        if (!user) return res.status(404).json({ error: req.t('errUserNotFound') });
        res.json({ success: true, user: { ...user, role: user.role || 'user' } });
    } catch (err) {
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
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
        const countRow = await db('users').count('id as count').first();
        const totalUsers = countRow ? Number(countRow.count) : 0;

        let assignedRole = 'user';
        if (totalUsers === 0) {
            // 系统首个用户自动设定为超级管理员
            assignedRole = 'admin';
        } else if (isCallerAdmin && role && ['admin', 'user'].includes(role)) {
            assignedRole = role;
        }

        const insertResult = await db('users')
            .insert({
                username,
                password: hashedPassword,
                role: assignedRole
            });

        const userId = Array.isArray(insertResult) ? insertResult[0] : insertResult;
        res.json({
            success: true,
            userId: typeof userId === 'object' && userId ? userId.id : userId,
            role: assignedRole
        });
    } catch (err) {
        const msg = String(err.message || '');
        if (msg.includes('UNIQUE') || msg.includes('duplicate') || msg.includes('ER_DUP_ENTRY')) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
});

// 登录
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    try {
        const user = await db('users').where({ username }).first();
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
    } catch (err) {
        res.status(500).json({ error: '服务器错误: ' + err.message });
    }
});

// 删除用户（仅管理员允许）
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;

    // 防止管理员自杀式删除自身账号
    if (String(req.user.id) === String(id)) {
        return res.status(400).json({ error: '不能删除当前正在登录的管理员账号' });
    }

    try {
        await db.transaction(async (trx) => {
            // 解除该用户已发布作品的关联（避免外键约束导致孤儿崩溃）
            await trx('guides').where({ authorId: id }).update({ authorId: null });
            await trx('hints').where({ authorId: id }).update({ authorId: null });
            const deletedCount = await trx('users').where({ id }).del();

            if (deletedCount === 0) {
                return res.status(404).json({ error: req.t('errUserNotFound') });
            }
            res.json({ success: true, message: '用户已删除' });
        });
    } catch (err) {
        res.status(500).json({ error: '删除用户失败: ' + err.message });
    }
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
        const updatedCount = await db('users').where({ id }).update({ password: hashedPassword });
        if (updatedCount === 0) return res.status(404).json({ error: req.t('errUserNotFound') });
        res.json({ success: true, message: '密码重置成功' });
    } catch (err) {
        res.status(500).json({ error: '重置密码失败: ' + err.message });
    }
});

// 修改用户角色（仅管理员允许）
router.post('/users/:id/role', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '角色必须是 admin 或 user' });
    }

    if (String(req.user.id) === String(id) && role !== 'admin') {
        return res.status(400).json({ error: '无法降级当前正在使用的超级管理员账号' });
    }

    try {
        const updatedCount = await db('users').where({ id }).update({ role });
        if (updatedCount === 0) return res.status(404).json({ error: req.t('errUserNotFound') });
        res.json({ success: true, message: '角色修改成功' });
    } catch (err) {
        res.status(500).json({ error: '修改角色失败: ' + err.message });
    }
});

module.exports = router;
