const express = require('express');
const db = require('../database');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 发布/更新 Guide（受保护，必须登录）
router.post('/', authenticateToken, async (req, res) => {
    try {
        let authorId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        // 超级管理员允许指派特定作者
        if (isAdmin && req.body.authorId) {
            authorId = req.body.authorId;
        }

        const { name, startUrl, domain, steps } = req.body;
        if (!name) {
            return res.status(400).json({ error: '任务名称不能为空' });
        }
        const stepsStr = typeof steps === 'string' ? steps : JSON.stringify(steps || []);

        // 审核状态判定：管理员免审直接 approved，普通用户需审核 pending
        const targetStatus = isAdmin ? 'approved' : 'pending';

        // 若请求体携带现有 id，先校验是否存在且属于当前作者，防止他人越权覆盖
        if (req.body.id) {
            const existing = await db('guides').where({ id: req.body.id }).first();
            if (existing) {
                if (!isAdmin && existing.authorId !== req.user.id) {
                    return res.status(403).json({ error: '权限不足：您不是该规则的原作者，无法覆写云端原版规则' });
                }
                await db('guides').where({ id: req.body.id }).update({
                    name,
                    startUrl: startUrl || '',
                    domain: domain || '',
                    steps: stepsStr,
                    authorId: existing.authorId,
                    // 普通用户再次修改已有内容时重新置为 pending 待审；管理员修改则保留原有状态或直接设为 approved
                    status: isAdmin ? (req.body.status || existing.status || 'approved') : 'pending'
                });
                return res.json({ 
                    success: true, 
                    id: req.body.id,
                    status: targetStatus,
                    message: isAdmin ? '发布成功' : '已提交修改，需等待管理员审核通过后公开可见'
                });
            }
        }

        const id = req.body.id || `tour_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db('guides').insert({
            id,
            name,
            startUrl: startUrl || '',
            domain: domain || '',
            steps: stepsStr,
            authorId,
            downloads: 0,
            status: targetStatus
        });

        res.json({ 
            success: true, 
            id, 
            status: targetStatus,
            message: isAdmin ? '发布成功' : '已提交成功，需等待管理员审核通过后公开可见'
        });
    } catch (err) {
        res.status(500).json({ error: '发布失败: ' + err.message });
    }
});

// 管理员审核 Guide（受保护，仅管理员允许）
router.post('/:id/audit', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: '审核状态无效，支持: approved, rejected, pending' });
    }

    try {
        const guide = await db('guides').where({ id }).first();
        if (!guide) {
            return res.status(404).json({ error: '未找到该引导任务' });
        }

        await db('guides').where({ id }).update({ status });
        res.json({
            success: true,
            id,
            status,
            message: status === 'approved' ? '审核通过，已全网公开' : (status === 'rejected' ? '已驳回该任务' : '已重置为待审核')
        });
    } catch (err) {
        res.status(500).json({ error: '审核操作失败: ' + err.message });
    }
});

// 获取所有 Guides（全网大厅浏览 / 管理后台查看，支持可选鉴权过滤）
router.get('/all', optionalAuth, async (req, res) => {
    const { status } = req.query;
    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        let query = db('guides as g')
            .leftJoin('users as u', 'g.authorId', 'u.id')
            .select(
                'g.id',
                'g.name',
                'g.startUrl',
                'g.domain',
                'g.steps',
                'g.downloads',
                'g.status',
                'g.created_at',
                'g.authorId',
                'u.username as author'
            )
            .orderBy('g.created_at', 'desc');

        // 可见性规则过滤
        if (isAdmin) {
            // 管理员可看全部，并支持 query 参数过滤指定状态
            if (status && ['approved', 'rejected', 'pending'].includes(status)) {
                query = query.where('g.status', status);
            }
        } else if (user) {
            // 普通登录用户：可看所有已审核通过的内容 + 自己创建的所有内容（含待审核/驳回）
            query = query.where((qb) => {
                qb.where('g.status', 'approved').orWhere('g.authorId', user.id);
            });
            if (status) {
                query = query.andWhere('g.status', status);
            }
        } else {
            // 匿名访客：仅可见已审核通过的内容
            query = query.where('g.status', 'approved');
        }

        const rows = await query;

        const guides = rows.map(r => {
            let parsedSteps = [];
            try {
                parsedSteps = typeof r.steps === 'string' ? JSON.parse(r.steps || '[]') : (r.steps || []);
            } catch (e) {}
            return {
                ...r,
                status: r.status || 'pending',
                steps: parsedSteps,
                stepCount: parsedSteps.length
            };
        });

        res.json({ success: true, guides });
    } catch (err) {
        res.status(500).json({ error: '查询失败: ' + err.message });
    }
});

// 获取特定域名的 Guides（插件拉取，支持可选鉴权隔离）
router.get('/', optionalAuth, async (req, res) => {
    const { domain } = req.query;
    if (!domain) {
        return res.status(400).json({ error: '缺少 domain 域名参数' });
    }

    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        let query = db('guides as g')
            .leftJoin('users as u', 'g.authorId', 'u.id')
            .select(
                'g.id',
                'g.name',
                'g.startUrl',
                'g.domain',
                'g.steps',
                'g.downloads',
                'g.status',
                'g.created_at',
                'g.authorId',
                'u.username as author'
            )
            .where('g.domain', domain)
            .orderBy('g.downloads', 'desc')
            .orderBy('g.created_at', 'desc');

        if (isAdmin) {
            // 管理员可见该域名全部
        } else if (user) {
            // 普通登录用户：可使用该域名已审核规则 + 自己正在审核的规则
            query = query.andWhere((qb) => {
                qb.where('g.status', 'approved').orWhere('g.authorId', user.id);
            });
        } else {
            // 匿名插件用户：仅拉取已审核通过的公开规则
            query = query.andWhere('g.status', 'approved');
        }

        const rows = await query;

        const guides = rows.map(r => {
            let parsedSteps = [];
            try {
                parsedSteps = typeof r.steps === 'string' ? JSON.parse(r.steps || '[]') : (r.steps || []);
            } catch (e) {}
            return {
                ...r,
                status: r.status || 'approved',
                steps: parsedSteps
            };
        });

        res.json({ success: true, guides });
    } catch (err) {
        res.status(500).json({ error: '查询失败: ' + err.message });
    }
});

// 获取单条 Guide 详情（支持可选鉴权权限隔离）
router.get('/:id', optionalAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        const row = await db('guides as g')
            .leftJoin('users as u', 'g.authorId', 'u.id')
            .select(
                'g.id',
                'g.name',
                'g.startUrl',
                'g.domain',
                'g.steps',
                'g.downloads',
                'g.status',
                'g.created_at',
                'g.authorId',
                'u.username as author'
            )
            .where('g.id', id)
            .first();

        if (!row) return res.status(404).json({ error: '未找到该引导任务' });

        const status = row.status || 'approved';
        // 若不是已发布状态，只允许管理员或作者本人查阅
        if (status !== 'approved') {
            const isAuthor = user && user.id === row.authorId;
            if (!isAdmin && !isAuthor) {
                return res.status(403).json({ error: '权限不足：该引导任务正在审核中或未通过审核' });
            }
        }

        try {
            row.steps = typeof row.steps === 'string' ? JSON.parse(row.steps || '[]') : (row.steps || []);
        } catch (e) {
            row.steps = [];
        }

        res.json({ success: true, guide: { ...row, status } });
    } catch (err) {
        res.status(500).json({ error: '查询失败: ' + err.message });
    }
});

// 下载 Guide (增加下载量统计，公开接口)
router.post('/:id/download', async (req, res) => {
    const { id } = req.params;
    try {
        await db('guides').where({ id }).increment('downloads', 1);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: '更新下载量失败: ' + err.message });
    }
});

// 删除 Guide（受保护：管理员可删任意数据，普通用户只能删自己创建的任务）
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const guide = await db('guides').where({ id }).first();
        if (!guide) return res.status(404).json({ error: '任务不存在' });

        // 权限判断：管理员或作者本人
        if (req.user.role !== 'admin' && guide.authorId !== req.user.id) {
            return res.status(403).json({ error: '权限不足：无法删除他人创建的引导任务' });
        }

        await db('guides').where({ id }).del();
        res.json({ success: true, message: '删除成功' });
    } catch (err) {
        res.status(500).json({ error: '删除失败: ' + err.message });
    }
});

module.exports = router;
