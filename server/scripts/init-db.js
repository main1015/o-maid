/**
 * 数据库独立初始化脚本
 * 用途：用于全新安装或迁移时，单独创建表结构与初始种子数据
 * 运行方式：npm run db:init 或 node scripts/init-db.js [--force]
 */

const knex = require('knex');
const bcrypt = require('bcrypt');
const { knexConfig, dbType } = require('../config/database');

const db = knex(knexConfig);

async function initDatabase() {
    const isForce = process.argv.includes('--force');
    console.log(`==============================================`);
    console.log(`🚀 开始初始化数据库...`);
    console.log(`📡 数据库类型: ${dbType}`);
    if (dbType === 'sqlite') {
        console.log(`📁 数据文件路径: ${knexConfig.connection.filename}`);
    } else {
        console.log(`🌐 目标服务器: ${knexConfig.connection.host}:${knexConfig.connection.port}/${knexConfig.connection.database}`);
    }
    console.log(`==============================================\n`);

    try {
        if (isForce) {
            console.log(`⚠️  检测到 --force 参数，正在清理旧表结构...`);
            await db.schema.dropTableIfExists('hints');
            await db.schema.dropTableIfExists('guides');
            await db.schema.dropTableIfExists('users');
            console.log(`✅ 旧表结构清理完毕\n`);
        }

        // 1. 创建 users 表
        const hasUsersTable = await db.schema.hasTable('users');
        if (!hasUsersTable) {
            console.log(`📦 正在创建 users 表...`);
            await db.schema.createTable('users', (table) => {
                table.increments('id').primary();
                table.string('username', 100).notNullable().unique();
                table.string('password', 255).notNullable();
                table.string('role', 50).defaultTo('user');
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log(`✅ users 表创建成功`);
        } else {
            console.log(`ℹ️  users 表已存在，跳过创建`);
        }

        // 2. 创建 guides 表
        const hasGuidesTable = await db.schema.hasTable('guides');
        if (!hasGuidesTable) {
            console.log(`📦 正在创建 guides 表...`);
            await db.schema.createTable('guides', (table) => {
                table.string('id', 120).primary();
                table.string('name', 255).notNullable();
                table.text('startUrl').nullable();
                table.string('domain', 255).nullable();
                table.text('steps').nullable();
                table.integer('authorId').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
                table.integer('downloads').defaultTo(0);
                table.string('status', 20).defaultTo('pending');
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log(`✅ guides 表创建成功`);
        } else {
            console.log(`ℹ️  guides 表已存在，检查字段...`);
            const hasStatusCol = await db.schema.hasColumn('guides', 'status');
            if (!hasStatusCol) {
                console.log(`🔄 为 guides 表补充 status 字段...`);
                await db.schema.table('guides', (table) => {
                    table.string('status', 20).defaultTo('pending');
                });
                // 将存量历史数据全部设为 approved 已通过
                await db('guides').update({ status: 'approved' });
                console.log(`✅ guides 表 status 补充完成，存量数据已设为 approved`);
            }
        }

        // 3. 创建 hints 表
        const hasHintsTable = await db.schema.hasTable('hints');
        if (!hasHintsTable) {
            console.log(`📦 正在创建 hints 表...`);
            await db.schema.createTable('hints', (table) => {
                table.string('id', 120).primary();
                table.text('url').nullable();
                table.string('domain', 255).nullable();
                table.text('selector').nullable();
                table.text('text').notNullable();
                table.integer('authorId').unsigned().nullable().references('id').inTable('users').onDelete('SET NULL');
                table.integer('downloads').defaultTo(0);
                table.string('status', 20).defaultTo('pending');
                table.timestamp('created_at').defaultTo(db.fn.now());
            });
            console.log(`✅ hints 表创建成功`);
        } else {
            console.log(`ℹ️  hints 表已存在，检查字段...`);
            const hasStatusCol = await db.schema.hasColumn('hints', 'status');
            if (!hasStatusCol) {
                console.log(`🔄 为 hints 表补充 status 字段...`);
                await db.schema.table('hints', (table) => {
                    table.string('status', 20).defaultTo('pending');
                });
                // 将存量历史数据全部设为 approved 已通过
                await db('hints').update({ status: 'approved' });
                console.log(`✅ hints 表 status 补充完成，存量数据已设为 approved`);
            }
        }

        // 4. 播种初始种子数据 (Seed)
        console.log(`\n🌱 检查初始管理员数据...`);
        const adminUser = await db('users').where({ role: 'admin' }).first();
        if (!adminUser) {
            const defaultUsername = 'admin';
            const defaultPassword = 'admin123';
            const hashedPassword = await bcrypt.hash(defaultPassword, 10);

            // 检查 admin 用户名是否被占
            const existingUser = await db('users').where({ username: defaultUsername }).first();
            if (existingUser) {
                await db('users').where({ id: existingUser.id }).update({ role: 'admin' });
                console.log(`✅ 已将已有用户 "${defaultUsername}" 升级为超级管理员`);
            } else {
                await db('users').insert({
                    username: defaultUsername,
                    password: hashedPassword,
                    role: 'admin'
                });
                console.log(`🎉 初始超级管理员创建成功:`);
                console.log(`   - 用户名: ${defaultUsername}`);
                console.log(`   - 密  码: ${defaultPassword}`);
                console.log(`   - 角  色: admin`);
            }
        } else {
            console.log(`ℹ️  系统中已存在超级管理员账号 ("${adminUser.username}")，无需重复初始化`);
        }

        console.log(`\n==============================================`);
        console.log(`🎉 数据库初始化全部顺利完成！`);
        console.log(`==============================================`);
    } catch (err) {
        console.error(`\n❌ 数据库初始化失败:`, err);
        process.exitCode = 1;
    } finally {
        await db.destroy();
    }
}

initDatabase();
