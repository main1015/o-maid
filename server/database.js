const knex = require('knex');
const { knexConfig, dbType } = require('./config/database');

// 初始化统一 Knex 实例
const db = knex(knexConfig);

/**
 * 轻量健康检查：仅在服务启动时探测连接与表存在性
 * 恪守原则：纯探测，绝不在此处自动建表或修改数据！
 */
async function checkDatabaseHealth() {
    try {
        const hasUsers = await db.schema.hasTable('users');
        if (!hasUsers) {
            console.warn(`\n⚠️  [警告] 检测到数据库尚未初始化（未找到 users 表）！`);
            console.warn(`👉 请先在 server 目录下执行初始化脚本: npm run db:init\n`);
        }
    } catch (err) {
        console.error(`\n❌ [错误] 数据库连接失败: ${err.message}`);
        console.error(`👉 请检查 .env 中的数据库连接配置，或确认目标数据库服务是否正常启动。\n`);
    }
}

// 导出 knex 实例和健康检查函数
db.checkDatabaseHealth = checkDatabaseHealth;
db.dbType = dbType;

module.exports = db;
