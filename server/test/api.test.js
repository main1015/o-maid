/**
 * O-Maid 服务端自动化测试套件
 * 覆盖模块：
 * 1. 数据库与表结构完整性
 * 2. 账号注册、登录与角色权限控制
 * 3. 引导任务 (Guides) 与悬停提示 (Hints) 普通用户发布待审 (Pending) 机制
 * 4. 多层级可见性隔离（访客不可见、其他用户不可见、作者本人可见）
 * 5. 管理员审核工作流（通过 Approved / 驳回 Rejected）及实时全网可见性切换
 * 6. 管理员直接发布免审机制
 */

const http = require('http');
const app = require('../server');
const db = require('../database');

// 颜色输出辅助函数
const colors = {
    green: (text) => `\x1b[32m${text}\x1b[0m`,
    red: (text) => `\x1b[31m${text}\x1b[0m`,
    yellow: (text) => `\x1b[33m${text}\x1b[0m`,
    cyan: (text) => `\x1b[36m${text}\x1b[0m`,
    bold: (text) => `\x1b[1m${text}\x1b[0m`
};

let server;
const TEST_PORT = 8990;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

let adminToken = '';
let userAToken = '';
let userBToken = '';
const createdGuideIds = [];
const createdHintIds = [];

// 简易测试断言工具
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(title, fn) {
    totalTests++;
    process.stdout.write(`  [测试 ${totalTests}] ${title} ... `);
    try {
        await fn();
        passedTests++;
        console.log(colors.green('✔ 通过 (PASSED)'));
    } catch (err) {
        failedTests++;
        console.log(colors.red('✖ 失败 (FAILED)'));
        console.error(`     原因: ${colors.yellow(err.message)}`);
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || '断言失败');
    }
}

// 统一封装请求
async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (options.token) {
        headers['Authorization'] = `Bearer ${options.token}`;
    }
    const res = await fetch(`${BASE_URL}${path}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
}

async function runAllTests() {
    console.log(colors.bold(`\n======================================================`));
    console.log(colors.bold(`🧪 正在启动 O-Maid 自动化功能与权限测试套件`));
    console.log(colors.bold(`======================================================\n`));

    // 启动独立测试服务
    server = app.listen(TEST_PORT);

    try {
        // ==========================================
        // 模块 1：数据库表结构完整性检查
        // ==========================================
        console.log(colors.cyan(`▶ 模块 1: 数据库表结构与字段完整性`));

        await test('数据库包含 users, guides, hints 三张核心表', async () => {
            const hasUsers = await db.schema.hasTable('users');
            const hasGuides = await db.schema.hasTable('guides');
            const hasHints = await db.schema.hasTable('hints');
            assert(hasUsers && hasGuides && hasHints, '核心表不全');
        });

        await test('guides 与 hints 表均包含 status 审核字段', async () => {
            const guideStatusCol = await db.schema.hasColumn('guides', 'status');
            const hintStatusCol = await db.schema.hasColumn('hints', 'status');
            assert(guideStatusCol && hintStatusCol, '缺失 status 字段');
        });

        // ==========================================
        // 模块 2：账号认证与权限校验
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 2: 账号认证与角色权限控制`));

        await test('管理员 admin 成功登录并获取有效 Token', async () => {
            const res = await request('/auth/login', {
                method: 'POST',
                body: { username: 'admin', password: 'admin123' }
            });
            assert(res.status === 200, `登录失败，状态码: ${res.status}`);
            assert(res.data.success && res.data.token, '未返回有效 Token');
            assert(res.data.role === 'admin', '身份不是 admin');
            adminToken = res.data.token;
        });

        await test('注册并登录普通测试用户 UserA 与 UserB', async () => {
            const randA = Math.floor(Math.random() * 100000);
            const randB = Math.floor(Math.random() * 100000);

            // UserA
            const regA = await request('/auth/register', {
                method: 'POST',
                body: { username: `test_user_a_${randA}`, password: 'password123' }
            });
            assert(regA.status === 200 && regA.data.success, 'UserA 注册失败');
            const logA = await request('/auth/login', {
                method: 'POST',
                body: { username: `test_user_a_${randA}`, password: 'password123' }
            });
            userAToken = logA.data.token;

            // UserB
            const regB = await request('/auth/register', {
                method: 'POST',
                body: { username: `test_user_b_${randB}`, password: 'password123' }
            });
            assert(regB.status === 200 && regB.data.success, 'UserB 注册失败');
            const logB = await request('/auth/login', {
                method: 'POST',
                body: { username: `test_user_b_${randB}`, password: 'password123' }
            });
            userBToken = logB.data.token;

            assert(userAToken && userBToken, 'Token 缺失');
        });

        // ==========================================
        // 模块 3：普通用户发布进入待审核 (Pending)
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 3: UGC 审核机制（普通用户发布自动进入 pending）`));

        let guideAId = '';
        let hintAId = '';

        await test('普通用户 UserA 发布引导任务，自动赋予 pending 状态', async () => {
            const res = await request('/guides', {
                method: 'POST',
                token: userAToken,
                body: {
                    name: 'OA协同审批指引 (UserA创作)',
                    startUrl: 'https://test-oa.internal/start',
                    domain: 'test-oa.internal',
                    steps: [{ title: '点击审批', selector: '#approve-btn' }]
                }
            });
            assert(res.status === 200 && res.data.success, '发布接口失败');
            assert(res.data.status === 'pending', `状态应为 pending，实际为: ${res.data.status}`);
            guideAId = res.data.id;
            createdGuideIds.push(guideAId);
        });

        await test('普通用户 UserA 发布悬停提示，自动赋予 pending 状态', async () => {
            const res = await request('/hints', {
                method: 'POST',
                token: userAToken,
                body: {
                    url: 'https://test-oa.internal/page',
                    domain: 'test-oa.internal',
                    selector: '#submit-btn',
                    text: '提交前请仔细核对报销金额'
                }
            });
            assert(res.status === 200 && res.data.success, '发布提示失败');
            assert(res.data.status === 'pending', `状态应为 pending，实际为: ${res.data.status}`);
            hintAId = res.data.id;
            createdHintIds.push(hintAId);
        });

        // ==========================================
        // 模块 4：多层级可见性隔离
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 4: 多层级可见性隔离检验`));

        await test('匿名访客无法在全网大厅查看到待审任务 (GET /api/guides/all)', async () => {
            const res = await request('/guides/all');
            const found = res.data.guides.some(g => g.id === guideAId);
            assert(!found, '匿名访客不应看到 pending 引导任务');
        });

        await test('匿名访客无法通过插件拉取到待审任务 (GET /api/guides?domain=...)', async () => {
            const res = await request('/guides?domain=test-oa.internal');
            const found = res.data.guides.some(g => g.id === guideAId);
            assert(!found, '插件匿名拉取不应包含 pending 任务');
        });

        await test('普通用户 UserB 无法在全网大厅查看到他人待审任务', async () => {
            const res = await request('/guides/all', { token: userBToken });
            const found = res.data.guides.some(g => g.id === guideAId);
            assert(!found, '其他普通用户不应看到他人未审核的任务');
        });

        await test('原作者 UserA 登录后可以正常查看到自己的待审任务并带有 pending 状态', async () => {
            const res = await request('/guides/all', { token: userAToken });
            const item = res.data.guides.find(g => g.id === guideAId);
            assert(item != null, '原作者应该能看到自己待审核的任务');
            assert(item.status === 'pending', `状态应为 pending，实际为: ${item.status}`);
        });

        await test('匿名访客直接访问单项详情返回 403 权限拦截 (GET /api/guides/:id)', async () => {
            const res = await request(`/guides/${guideAId}`);
            assert(res.status === 403, `应返回 403，实际返回: ${res.status}`);
        });

        // ==========================================
        // 模块 5：管理员审核流程与状态切换
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 5: 管理员审核工作流 (Audit Workflow)`));

        await test('普通用户尝试调用审核接口被 403 严格拒绝', async () => {
            const res = await request(`/guides/${guideAId}/audit`, {
                method: 'POST',
                token: userBToken,
                body: { status: 'approved' }
            });
            assert(res.status === 403, `非管理员调用审核应报 403，实际返回: ${res.status}`);
        });

        await test('管理员审核通过 (Approved)，全网即刻公开生效', async () => {
            const auditRes = await request(`/guides/${guideAId}/audit`, {
                method: 'POST',
                token: adminToken,
                body: { status: 'approved' }
            });
            assert(auditRes.status === 200 && auditRes.data.success, '管理员审核操作失败');
            assert(auditRes.data.status === 'approved', '返回状态应为 approved');

            // 匿名访客再次拉取插件和广场，验证已公开可见！
            const anonRes = await request('/guides/all');
            const found = anonRes.data.guides.some(g => g.id === guideAId);
            assert(found, '审核通过后匿名访客应立即全网可见');

            const domainRes = await request('/guides?domain=test-oa.internal');
            const foundDomain = domainRes.data.guides.some(g => g.id === guideAId);
            assert(foundDomain, '插件端按域名拉取也应即刻生效');
        });

        await test('管理员将任务驳回 (Rejected)，全网重新隐蔽隔离', async () => {
            const auditRes = await request(`/guides/${guideAId}/audit`, {
                method: 'POST',
                token: adminToken,
                body: { status: 'rejected' }
            });
            assert(auditRes.status === 200 && auditRes.data.success, '驳回操作失败');

            const anonRes = await request('/guides/all');
            const found = anonRes.data.guides.some(g => g.id === guideAId);
            assert(!found, '驳回后匿名访客不应可见');
        });

        // ==========================================
        // 模块 6：管理员直接发布免审
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 6: 超级管理员免审特权`));

        let adminGuideId = '';
        await test('超级管理员直接发布任务，状态直接为 approved（免审立即生效）', async () => {
            const res = await request('/guides', {
                method: 'POST',
                token: adminToken,
                body: {
                    name: '管理员官方指南 (免审)',
                    startUrl: 'https://example.com/admin-doc',
                    domain: 'example.com',
                    steps: [{ title: '阅读文档', selector: '#doc' }]
                }
            });
            assert(res.status === 200 && res.data.success, '发布失败');
            assert(res.data.status === 'approved', `管理员发布应直接为 approved，实际: ${res.data.status}`);
            adminGuideId = res.data.id;
            createdGuideIds.push(adminGuideId);

            // 匿名访客立即可以拉取
            const anonRes = await request('/guides/all');
            const found = anonRes.data.guides.some(g => g.id === adminGuideId);
            assert(found, '管理员发布的内容应即刻全网可见');
        });

        // ==========================================
        // 模块 7：统计看板数据准确性
        // ==========================================
        console.log(colors.cyan(`\n▶ 模块 7: 仪表盘指标统计与监控`));

        await test('概览接口正确统计待审核总量 pendingTotal', async () => {
            const res = await request('/stats/overview', { token: adminToken });
            assert(res.status === 200 && res.data.success, '概览接口调用失败');
            const { stats } = res.data;
            assert(typeof stats.pendingTotal === 'number', '缺失 pendingTotal 字段');
            assert(stats.totalUsers >= 3, '用户统计数量异常');
        });

    } finally {
        // 清理所有测试数据
        console.log(colors.cyan(`\n🧹 正在清理本次测试产生的临时数据...`));
        for (const id of createdGuideIds) {
            await db('guides').where({ id }).del();
        }
        for (const id of createdHintIds) {
            await db('hints').where({ id }).del();
        }
        await db('users').where('username', 'like', 'test_user_%').del();
        console.log(colors.green(`✔ 测试数据已安全清理完毕`));

        server.close();
    }

    // 总结汇报
    console.log(colors.bold(`\n======================================================`));
    console.log(colors.bold(`📊 测试结果统计汇总:`));
    console.log(`   总计执行测试: ${totalTests}`);
    console.log(`   ${colors.green(`✔ 成功通过:   ${passedTests}`)}`);
    console.log(`   ${failedTests === 0 ? colors.green(`✖ 失败用例:   ${failedTests}`) : colors.red(`✖ 失败用例:   ${failedTests}`)}`);
    console.log(colors.bold(`======================================================\n`));

    if (failedTests > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runAllTests();
