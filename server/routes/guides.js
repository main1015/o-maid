const express = require('express');
const db = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 发布/更新 Guide（受保护，必须登录）
router.post('/', authenticateToken, (req, res) => {
    let authorId = req.user.id;
    // 超级管理员允许指派特定作者
    if (req.user.role === 'admin' && req.body.authorId) {
        authorId = req.body.authorId;
    }
    const id = req.body.id || `tour_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { name, startUrl, domain, steps } = req.body;
    if (!name) {
        return res.status(400).json({ error: '任务名称不能为空' });
    }
    const stepsStr = JSON.stringify(steps || []);

    db.run(
        'INSERT OR REPLACE INTO guides (id, name, startUrl, domain, steps, authorId) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name, startUrl || '', domain || '', stepsStr, authorId],
        function(err) {
            if (err) return res.status(500).json({ error: '发布失败: ' + err.message });
            res.json({ success: true, id });
        }
    );
});

// 获取所有 Guides（全网大厅浏览 / 管理后台查看，公开免登接口）
router.get('/all', (req, res) => {
    db.all(`
        SELECT g.id, g.name, g.startUrl, g.domain, g.steps, g.downloads, g.created_at, g.authorId, u.username as author 
        FROM guides g 
        LEFT JOIN users u ON g.authorId = u.id 
        ORDER BY g.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });

        const guides = rows.map(r => {
            let parsedSteps = [];
            try {
                parsedSteps = JSON.parse(r.steps || '[]');
            } catch (e) {}
            return {
                ...r,
                steps: parsedSteps,
                stepCount: parsedSteps.length
            };
        });
        res.json({ success: true, guides });
    });
});

// 获取特定域名的 Guides（插件拉取，公开接口）
router.get('/', (req, res) => {
    const { domain } = req.query;
    if (!domain) {
        return res.status(400).json({ error: '缺少 domain 域名参数' });
    }

    db.all(`
        SELECT g.id, g.name, g.startUrl, g.domain, g.steps, g.downloads, g.created_at, g.authorId, u.username as author 
        FROM guides g 
        LEFT JOIN users u ON g.authorId = u.id 
        WHERE g.domain = ?
        ORDER BY g.downloads DESC, g.created_at DESC
    `, [domain], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });

        const guides = rows.map(r => {
            let parsedSteps = [];
            try {
                parsedSteps = JSON.parse(r.steps || '[]');
            } catch (e) {}
            return {
                ...r,
                steps: parsedSteps
            };
        });
        res.json({ success: true, guides });
    });
});

// 获取单条 Guide 详情（公开接口）
router.get('/:id', (req, res) => {
    const { id } = req.params;
    db.get(`
        SELECT g.id, g.name, g.startUrl, g.domain, g.steps, g.downloads, g.created_at, g.authorId, u.username as author 
        FROM guides g 
        LEFT JOIN users u ON g.authorId = u.id 
        WHERE g.id = ?
    `, [id], (err, row) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        if (!row) return res.status(404).json({ error: '未找到该引导任务' });

        try {
            row.steps = JSON.parse(row.steps || '[]');
        } catch (e) {
            row.steps = [];
        }
        res.json({ success: true, guide: row });
    });
});

// 下载 Guide (增加下载量统计，公开接口)
router.post('/:id/download', (req, res) => {
    const { id } = req.params;
    db.run('UPDATE guides SET downloads = downloads + 1 WHERE id = ?', [id], (err) => {
        if (err) return res.status(500).json({ error: '更新下载量失败' });
        res.json({ success: true });
    });
});

// 删除 Guide（受保护：管理员可删任意数据，普通用户只能删自己创建的任务）
router.delete('/:id', authenticateToken, (req, res) => {
    const { id } = req.params;

    db.get('SELECT authorId FROM guides WHERE id = ?', [id], (err, guide) => {
        if (err) return res.status(500).json({ error: '查询任务失败' });
        if (!guide) return res.status(404).json({ error: '任务不存在' });

        // 权限判断：管理员或作者本人
        if (req.user.role !== 'admin' && guide.authorId !== req.user.id) {
            return res.status(403).json({ error: '权限不足：无法删除他人创建的引导任务' });
        }

        db.run('DELETE FROM guides WHERE id = ?', [id], function(delErr) {
            if (delErr) return res.status(500).json({ error: '删除失败: ' + delErr.message });
            res.json({ success: true, message: '删除成功' });
        });
    });
});

module.exports = router;
