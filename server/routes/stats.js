const express = require('express');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 概览统计指标（受保护，已登录即可访问）
router.get('/overview', authenticateToken, async (req, res) => {
    try {
        const [
            userCountRow,
            guideStatsRow,
            hintStatsRow,
            pendingGuidesRow,
            pendingHintsRow,
            recentGuides,
            recentHints
        ] = await Promise.all([
            db('users').count('id as count').first(),
            db('guides').count('id as count').sum('downloads as downloads').first(),
            db('hints').count('id as count').sum('downloads as downloads').first(),
            db('guides').where({ status: 'pending' }).count('id as count').first(),
            db('hints').where({ status: 'pending' }).count('id as count').first(),
            db('guides as g')
                .leftJoin('users as u', 'g.authorId', 'u.id')
                .select(
                    db.raw("'guide' as type"),
                    'g.id',
                    'g.name as title',
                    'g.domain',
                    'g.status',
                    'g.created_at',
                    'u.username as author'
                )
                .orderBy('g.created_at', 'desc')
                .limit(8),
            db('hints as h')
                .leftJoin('users as u', 'h.authorId', 'u.id')
                .select(
                    db.raw("'hint' as type"),
                    'h.id',
                    'h.text as title',
                    'h.domain',
                    'h.status',
                    'h.created_at',
                    'u.username as author'
                )
                .orderBy('h.created_at', 'desc')
                .limit(8)
        ]);

        const totalUsers = userCountRow ? Number(userCountRow.count || 0) : 0;
        const totalGuides = guideStatsRow ? Number(guideStatsRow.count || 0) : 0;
        const guideDownloads = guideStatsRow ? Number(guideStatsRow.downloads || 0) : 0;
        const totalHints = hintStatsRow ? Number(hintStatsRow.count || 0) : 0;
        const hintDownloads = hintStatsRow ? Number(hintStatsRow.downloads || 0) : 0;
        const pendingGuides = pendingGuidesRow ? Number(pendingGuidesRow.count || 0) : 0;
        const pendingHints = pendingHintsRow ? Number(pendingHintsRow.count || 0) : 0;

        // 合并最新动态并按时间降序截取前 8 条
        const combinedActivities = [...recentGuides, ...recentHints]
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 8);

        res.json({
            success: true,
            stats: {
                totalUsers,
                totalGuides,
                totalHints,
                pendingGuides,
                pendingHints,
                pendingTotal: pendingGuides + pendingHints,
                totalDownloads: guideDownloads + hintDownloads,
                recentActivities: combinedActivities
            }
        });
    } catch (err) {
        res.status(500).json({ error: '获取概览统计失败: ' + err.message });
    }
});

// 用户列表与发布统计（仅管理员允许）
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const users = await db('users as u')
            .select(
                'u.id',
                'u.username',
                'u.role',
                'u.created_at',
                db('guides').count('id').whereRaw('authorId = u.id').as('guidesCount'),
                db('hints').count('id').whereRaw('authorId = u.id').as('hintsCount')
            )
            .orderBy('u.created_at', 'desc');

        res.json({
            success: true,
            users: users.map(r => ({
                ...r,
                role: r.role || 'user',
                guidesCount: Number(r.guidesCount || 0),
                hintsCount: Number(r.hintsCount || 0)
            }))
        });
    } catch (err) {
        res.status(500).json({ error: '查询用户列表失败: ' + err.message });
    }
});

// 系统与运行状态（仅管理员允许）
router.get('/system', authenticateToken, requireAdmin, (req, res) => {
    const dbTypeMap = {
        sqlite: 'SQLite 3',
        mysql: 'MySQL',
        postgres: 'PostgreSQL'
    };

    res.json({
        success: true,
        system: {
            nodeVersion: process.version,
            platform: process.platform,
            uptimeSeconds: Math.floor(process.uptime()),
            memoryUsage: {
                rss: (process.memoryUsage().rss / 1024 / 1024).toFixed(2) + ' MB',
                heapUsed: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB'
            },
            serverTime: new Date().toISOString(),
            dbType: dbTypeMap[db.dbType] || db.dbType || 'SQLite 3'
        }
    });
});

module.exports = router;
