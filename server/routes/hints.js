const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 发布/更新 Hint（受保护，必须登录）
router.post('/', authenticateToken, (req, res) => {
    let authorId = req.user.id;
    if (req.user.role === 'admin' && req.body.authorId) {
        authorId = req.body.authorId;
    }
    const id = req.body.id || `hint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { url, domain, selector, text } = req.body;
    if (!text) {
        return res.status(400).json({ error: '提示内容不能为空' });
    }

    db.run(
        'INSERT OR REPLACE INTO hints (id, url, domain, selector, text, authorId) VALUES (?, ?, ?, ?, ?, ?)',
        [id, url || '', domain || '', selector || '', text, authorId],
        function(err) {
            if (err) return res.status(500).json({ error: '发布失败: ' + err.message });
            res.json({ success: true, id });
        }
    );
});

// 获取所有 Hints（全网大厅浏览 / 管理后台查看，公开免登接口）
router.get('/all', (req, res) => {
    db.all(`
        SELECT h.id, h.url, h.domain, h.selector, h.text, h.downloads, h.created_at, h.authorId, u.username as author 
        FROM hints h 
        LEFT JOIN users u ON h.authorId = u.id 
        ORDER BY h.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        res.json({ success: true, hints: rows });
    });
});

// 获取特定域名的 Hints（插件拉取，公开接口）
router.get('/', (req, res) => {
    const { domain } = req.query;
    if (!domain) {
        return res.status(400).json({ error: '缺少 domain 域名参数' });
    }

    db.all(`
        SELECT h.id, h.url, h.domain, h.selector, h.text, h.downloads, h.created_at, h.authorId, u.username as author 
        FROM hints h 
        LEFT JOIN users u ON h.authorId = u.id 
        WHERE h.domain = ?
        ORDER BY h.created_at DESC
    `, [domain], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        res.json({ success: true, hints: rows });
    });
});

// 获取单条 Hint 详情（公开接口）
router.get('/:id', (req, res) => {
    const { id } = req.params;
    db.get(`
        SELECT h.id, h.url, h.domain, h.selector, h.text, h.downloads, h.created_at, h.authorId, u.username as author 
        FROM hints h 
        LEFT JOIN users u ON h.authorId = u.id 
        WHERE h.id = ?
    `, [id], (err, row) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        if (!row) return res.status(404).json({ error: '未找到该悬停提示' });
        res.json({ success: true, hint: row });
    });
});

// 下载 Hint (增加下载量统计，公开接口)
router.post('/:id/download', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE hints SET downloads = downloads + 1 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: '计数失败' });
        res.json({ success: true });
    });
});

// 删除 Hint（受保护：管理员可删任意数据，普通用户只能删自己创建的提示）
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    db.get('SELECT authorId FROM hints WHERE id = ?', [id], (err, hint) => {
        if (err) return res.status(500).json({ error: '查询提示失败' });
        if (!hint) return res.status(404).json({ error: '提示不存在' });

        // 权限判断：管理员或作者本人
        if (req.user.role !== 'admin' && hint.authorId !== req.user.id) {
            return res.status(403).json({ error: '权限不足：无法删除他人创建的悬停提示' });
        }

        db.run('DELETE FROM hints WHERE id = ?', [id], function(delErr) {
            if (delErr) return res.status(500).json({ error: '删除失败: ' + delErr.message });
            res.json({ success: true, message: '删除成功' });
        });
    });
});

module.exports = router;
