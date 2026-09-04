const express = require('express');
const os = require('os');
const db = require('../database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 概览统计指标（受保护，已登录即可访问）
router.get('/overview', authenticateToken, (req, res) => {
    const stats = {
        totalUsers: 0,
        totalGuides: 0,
        totalHints: 0,
        totalDownloads: 0,
        recentActivities: []
    };

    db.serialize(() => {
        db.get('SELECT COUNT(*) as count FROM users', [], (err, row) => {
            if (!err && row) stats.totalUsers = row.count;
        });

        db.get('SELECT COUNT(*) as count, COALESCE(SUM(downloads), 0) as downloads FROM guides', [], (err, row) => {
            if (!err && row) {
                stats.totalGuides = row.count;
                stats.totalDownloads = (stats.totalDownloads || 0) + row.downloads;
            }
        });

        db.get('SELECT COUNT(*) as count, COALESCE(SUM(downloads), 0) as downloads FROM hints', [], (err, row) => {
            if (!err && row) {
                stats.totalHints = row.count;
                stats.totalDownloads = (stats.totalDownloads || 0) + row.downloads;
            }
        });

        // 获取最新发布的5条动态
        db.all(`
            SELECT 'guide' as type, g.id, g.name as title, g.domain, g.created_at, u.username as author
            FROM guides g
            LEFT JOIN users u ON g.authorId = u.id
            UNION ALL
            SELECT 'hint' as type, h.id, h.text as title, h.domain, h.created_at, u.username as author
            FROM hints h
            LEFT JOIN users u ON h.authorId = u.id
            ORDER BY created_at DESC
            LIMIT 8
        `, [], (err, rows) => {
            if (!err && rows) {
                stats.recentActivities = rows;
            }
            res.json({ success: true, stats });
        });
    });
});

// 用户列表与发布统计（仅管理员允许）
router.get('/users', authenticateToken, requireAdmin, (req, res) => {
    db.all(`
        SELECT 
            u.id, 
            u.username, 
            u.role,
            u.created_at,
            (SELECT COUNT(*) FROM guides WHERE authorId = u.id) as guidesCount,
            (SELECT COUNT(*) FROM hints WHERE authorId = u.id) as hintsCount
        FROM users u
        ORDER BY u.created_at DESC
    `, [], (err, rows) => {
        if (err) return res.status(500).json({ error: '查询失败' });
        res.json({ success: true, users: rows.map(r => ({ ...r, role: r.role || 'user' })) });
    });
});

// 系统与运行状态（仅管理员允许）
router.get('/system', authenticateToken, requireAdmin, (req, res) => {
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
            dbType: 'SQLite 3'
        }
    });
});

module.exports = router;
