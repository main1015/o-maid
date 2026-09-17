const express = require('express');
const db = require('../database');
const { authenticateToken, optionalAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 发布/更新 Hint（受保护，必须登录）
router.post('/', authenticateToken, async (req, res) => {
    try {
        let authorId = req.user.id;
        const isAdmin = req.user.role === 'admin';

        if (isAdmin && req.body.authorId) {
            authorId = req.body.authorId;
        }

        const { url, domain, selector, text } = req.body;
        if (!text) {
            return res.status(400).json({ error: req.t('errHintContentRequired') });
        }

        // 审核状态判定：管理员免审直接 approved，普通用户需审核 pending
        const targetStatus = isAdmin ? 'approved' : 'pending';

        // 若请求体携带现有 id，先校验是否存在且属于当前作者，防止他人越权覆盖
        if (req.body.id) {
            const existing = await db('hints').where({ id: req.body.id }).first();
            if (existing) {
                if (!isAdmin && existing.authorId !== req.user.id) {
                    return res.status(403).json({ error: req.t('errNotOriginalAuthorHint') });
                }
                await db('hints').where({ id: req.body.id }).update({
                    url: url || '',
                    domain: domain || '',
                    selector: selector || '',
                    text,
                    authorId: existing.authorId,
                    status: isAdmin ? (req.body.status || existing.status || 'approved') : 'pending'
                });
                return res.json({ 
                    success: true, 
                    id: req.body.id,
                    status: targetStatus,
                    message: isAdmin ? req.t('msgPublishSuccess') : req.t('msgPublishPending')
                });
            }
        }

        const id = req.body.id || `hint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await db('hints').insert({
            id,
            url: url || '',
            domain: domain || '',
            selector: selector || '',
            text,
            authorId,
            downloads: 0,
            status: targetStatus
        });

        res.json({ 
            success: true, 
            id, 
            status: targetStatus,
            message: isAdmin ? req.t('msgPublishSuccess') : req.t('msgSubmitSuccess')
        });
    } catch (err) {
        res.status(500).json({ error: req.t('errPublishFailed') + err.message });
    }
});

// 管理员审核 Hint（受保护，仅管理员允许）
router.post('/:id/audit', authenticateToken, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['approved', 'rejected', 'pending'].includes(status)) {
        return res.status(400).json({ error: req.t('errInvalidStatus') });
    }

    try {
        const hint = await db('hints').where({ id }).first();
        if (!hint) {
            return res.status(404).json({ error: req.t('errHintNotFound') });
        }

        await db('hints').where({ id }).update({ status });
        res.json({
            success: true,
            id,
            status,
            message: status === 'approved' ? req.t('msgAuditApproved') : (status === 'rejected' ? req.t('msgAuditRejectedHint') : req.t('msgAuditReset'))
        });
    } catch (err) {
        res.status(500).json({ error: req.t('errAuditFailed') + err.message });
    }
});

// 获取所有 Hints（全网大厅浏览 / 管理后台查看，支持可选鉴权过滤）
router.get('/all', optionalAuth, async (req, res) => {
    const { status } = req.query;
    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        let query = db('hints as h')
            .leftJoin('users as u', 'h.authorId', 'u.id')
            .select(
                'h.id',
                'h.url',
                'h.domain',
                'h.selector',
                'h.text',
                'h.downloads',
                'h.status',
                'h.created_at',
                'h.authorId',
                'u.username as author'
            )
            .orderBy('h.created_at', 'desc');

        // 可见性规则过滤
        if (isAdmin) {
            if (status && ['approved', 'rejected', 'pending'].includes(status)) {
                query = query.where('h.status', status);
            }
        } else if (user) {
            query = query.where((qb) => {
                qb.where('h.status', 'approved').orWhere('h.authorId', user.id);
            });
            if (status) {
                query = query.andWhere('h.status', status);
            }
        } else {
            query = query.where('h.status', 'approved');
        }

        const rows = await query;
        res.json({ 
            success: true, 
            hints: rows.map(r => ({ ...r, status: r.status || 'pending' })) 
        });
    } catch (err) {
        res.status(500).json({ error: req.t('errQueryFailed') + err.message });
    }
});

// 获取特定域名的 Hints（插件拉取，支持可选鉴权隔离）
router.get('/', optionalAuth, async (req, res) => {
    const { domain } = req.query;
    if (!domain) {
        return res.status(400).json({ error: req.t('errMissingDomain') });
    }

    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        let query = db('hints as h')
            .leftJoin('users as u', 'h.authorId', 'u.id')
            .select(
                'h.id',
                'h.url',
                'h.domain',
                'h.selector',
                'h.text',
                'h.downloads',
                'h.status',
                'h.created_at',
                'h.authorId',
                'u.username as author'
            )
            .where('h.domain', domain)
            .orderBy('h.created_at', 'desc');

        if (isAdmin) {
            // 管理员可见该域名全部
        } else if (user) {
            query = query.andWhere((qb) => {
                qb.where('h.status', 'approved').orWhere('h.authorId', user.id);
            });
        } else {
            query = query.andWhere('h.status', 'approved');
        }

        const rows = await query;
        res.json({ 
            success: true, 
            hints: rows.map(r => ({ ...r, status: r.status || 'approved' })) 
        });
    } catch (err) {
        res.status(500).json({ error: req.t('errQueryFailed') + err.message });
    }
});

// 获取单条 Hint 详情（支持可选鉴权隔离）
router.get('/:id', optionalAuth, async (req, res) => {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.role === 'admin';

    try {
        const row = await db('hints as h')
            .leftJoin('users as u', 'h.authorId', 'u.id')
            .select(
                'h.id',
                'h.url',
                'h.domain',
                'h.selector',
                'h.text',
                'h.downloads',
                'h.status',
                'h.created_at',
                'h.authorId',
                'u.username as author'
            )
            .where('h.id', id)
            .first();

        if (!row) return res.status(404).json({ error: req.t('errHintNotFound') });

        const status = row.status || 'approved';
        if (status !== 'approved') {
            const isAuthor = user && user.id === row.authorId;
            if (!isAdmin && !isAuthor) {
                return res.status(403).json({ error: req.t('errNotApprovedHint') });
            }
        }

        res.json({ success: true, hint: { ...row, status } });
    } catch (err) {
        res.status(500).json({ error: req.t('errQueryFailed') + err.message });
    }
});

// 下载 Hint (增加下载量统计，公开接口)
router.post('/:id/download', async (req, res) => {
    const { id } = req.params;
    try {
        await db('hints').where({ id }).increment('downloads', 1);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: req.t('errCountFailed') + err.message });
    }
});

// 删除 Hint（受保护：管理员可删任意数据，普通用户只能删自己创建的提示）
router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    try {
        const hint = await db('hints').where({ id }).first();
        if (!hint) return res.status(404).json({ error: req.t('errHintNotFound') });

        // 权限判断：管理员或作者本人
        if (req.user.role !== 'admin' && hint.authorId !== req.user.id) {
            return res.status(403).json({ error: req.t('errDeleteNotAuthorHint') });
        }

        await db('hints').where({ id }).del();
        res.json({ success: true, message: req.t('msgDeleteSuccess') });
    } catch (err) {
        res.status(500).json({ error: req.t('errDeleteFailed') + err.message });
    }
});

module.exports = router;
