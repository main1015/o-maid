import { Api } from './api.js';
import { Auth } from './auth.js';

// 当前应用状态
const state = {
  currentTab: 'overview',
  guides: [],
  hints: [],
  users: [],
  system: null
};

// 辅助函数：显示通知
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✅' : '⚠️'}</span>
    <span>${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// 辅助函数：HTML 转义
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 辅助函数：格式化时间
function formatTime(timeStr) {
  if (!timeStr) return '-';
  const d = new Date(timeStr);
  if (isNaN(d.getTime())) return timeStr;
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 模态框统一控制
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
}

// 角色权限动态适配
function applyRolePermissions() {
  const isAdmin = Auth.isAdmin();
  
  // 侧边栏菜单控制
  const usersTabNav = document.querySelector('.nav-item[data-tab="users"]');
  const systemTabNav = document.querySelector('.nav-item[data-tab="system"]');

  if (usersTabNav) usersTabNav.style.display = isAdmin ? 'flex' : 'none';
  if (systemTabNav) systemTabNav.style.display = isAdmin ? 'flex' : 'none';
}

// 视图切换
function switchTab(tabId) {
  // 权限防穿透：非管理员试图进入用户管理或系统监控时强制拦截
  if (['users', 'system'].includes(tabId) && !Auth.isAdmin()) {
    showToast('权限不足：仅超级管理员允许访问此模块', 'error');
    tabId = 'overview';
  }

  state.currentTab = tabId;
  
  // 更新侧边栏选中状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabId);
  });

  // 更新内容区域展示
  document.querySelectorAll('.view-section').forEach(view => {
    view.classList.toggle('active', view.id === `view-${tabId}`);
  });

  // 更新顶部标题
  const titles = {
    overview: '平台概览',
    guides: '引导任务管理',
    hints: '悬停提示管理',
    users: '注册用户管理',
    system: '系统监控与 API 文档'
  };
  document.getElementById('header-title').textContent = titles[tabId] || '管理控制台';

  // 触发相应视图数据加载
  loadCurrentTabData();
}

// 加载当前页面数据
async function loadCurrentTabData() {
  switch (state.currentTab) {
    case 'overview':
      await loadOverview();
      break;
    case 'guides':
      await loadGuides();
      break;
    case 'hints':
      await loadHints();
      break;
    case 'users':
      await loadUsers();
      break;
    case 'system':
      await loadSystem();
      break;
  }
}

// 1. 加载平台概览
async function loadOverview() {
  try {
    const res = await Api.getOverview();
    if (res.success) {
      const { stats } = res;
      document.getElementById('stat-users-count').textContent = stats.totalUsers || 0;
      document.getElementById('stat-guides-count').textContent = stats.totalGuides || 0;
      document.getElementById('stat-hints-count').textContent = stats.totalHints || 0;
      document.getElementById('stat-downloads-count').textContent = stats.totalDownloads || 0;

      // 渲染最新动态
      const activityList = document.getElementById('recent-activities-list');
      activityList.innerHTML = '';
      if (!stats.recentActivities || stats.recentActivities.length === 0) {
        activityList.innerHTML = '<li class="empty-state"><div class="empty-icon">📭</div>暂无最新发布活动</li>';
      } else {
        stats.recentActivities.forEach(item => {
          const isGuide = item.type === 'guide';
          const li = document.createElement('li');
          li.className = 'activity-item';
          li.innerHTML = `
            <span class="activity-badge ${isGuide ? 'badge-guide' : 'badge-hint'}">
              ${isGuide ? '任务' : '提示'}
            </span>
            <div class="activity-info">
              <div class="activity-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              <div class="activity-meta">
                <span>作者: ${escapeHtml(item.author || '系统录入')}</span> · 
                <span>域名: ${escapeHtml(item.domain || '-')}</span> · 
                <span>${formatTime(item.created_at)}</span>
              </div>
            </div>
          `;
          activityList.appendChild(li);
        });
      }
    }
  } catch (err) {
    showToast('加载概览数据失败: ' + err.message, 'error');
  }
}

// 2. 加载引导任务列表
async function loadGuides() {
  try {
    const res = await Api.getGuides();
    if (res.success) {
      state.guides = res.guides || [];
      renderGuidesTable(state.guides);
    }
  } catch (err) {
    showToast('加载引导列表失败: ' + err.message, 'error');
  }
}

function renderGuidesTable(list) {
  const tbody = document.getElementById('guides-table-body');
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">📂</div>暂无符合条件的引导任务，可点击上方「+ 新建引导任务」录入</td></tr>`;
    return;
  }

  const isAdmin = Auth.isAdmin();
  const currentUserId = Auth.currentUser ? Auth.currentUser.id : null;

  list.forEach(item => {
    const isMyWork = currentUserId && String(item.authorId) === String(currentUserId);
    const canDelete = isAdmin || isMyWork;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><span class="domain-tag">${escapeHtml(item.domain || '通用')}</span></td>
      <td><span style="font-weight:600; color:var(--accent-primary);">${item.stepCount || (item.steps ? item.steps.length : 0)} 步</span></td>
      <td>
        ${escapeHtml(item.author || '平台')}
        ${isMyWork ? '<span class="author-badge-self">我</span>' : ''}
      </td>
      <td>🔥 ${item.downloads || 0}</td>
      <td style="color:var(--text-dim); font-size:12px;">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn-sm btn-primary-sm view-guide-btn" data-id="${escapeHtml(item.id)}">详情</button>
          ${canDelete ? `<button class="btn-sm btn-danger-sm delete-guide-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">删除</button>` : '<span style="color:var(--text-dim); font-size:12px;">只读</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.view-guide-btn').forEach(btn => {
    btn.addEventListener('click', () => openGuideDetailsModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.delete-guide-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteGuide(btn.dataset.id, btn.dataset.name));
  });
}

// 3. 加载悬停提示列表
async function loadHints() {
  try {
    const res = await Api.getHints();
    if (res.success) {
      state.hints = res.hints || [];
      renderHintsTable(state.hints);
    }
  } catch (err) {
    showToast('加载提示列表失败: ' + err.message, 'error');
  }
}

function renderHintsTable(list) {
  const tbody = document.getElementById('hints-table-body');
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state"><div class="empty-icon">💬</div>暂无符合条件的悬停提示，可点击上方「+ 新建悬停提示」录入</td></tr>`;
    return;
  }

  const isAdmin = Auth.isAdmin();
  const currentUserId = Auth.currentUser ? Auth.currentUser.id : null;

  list.forEach(item => {
    const isMyWork = currentUserId && String(item.authorId) === String(currentUserId);
    const canDelete = isAdmin || isMyWork;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="max-width:240px;" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</td>
      <td><span class="domain-tag">${escapeHtml(item.domain || '-')}</span></td>
      <td><code class="selector-tag" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</code></td>
      <td>
        ${escapeHtml(item.author || '平台')}
        ${isMyWork ? '<span class="author-badge-self">我</span>' : ''}
      </td>
      <td>🔥 ${item.downloads || 0}</td>
      <td style="color:var(--text-dim); font-size:12px;">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          ${canDelete ? `<button class="btn-sm btn-danger-sm delete-hint-btn" data-id="${escapeHtml(item.id)}">删除</button>` : '<span style="color:var(--text-dim); font-size:12px;">只读</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.delete-hint-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteHint(btn.dataset.id));
  });
}

// 4. 加载用户列表
async function loadUsers() {
  try {
    const res = await Api.getUsers();
    if (res.success) {
      state.users = res.users || [];
      renderUsersTable(state.users);
      updateAuthorSelectOptions();
    }
  } catch (err) {
    showToast('加载用户列表失败: ' + err.message, 'error');
  }
}

function renderUsersTable(list) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">👥</div>暂无注册用户，可点击右上角「+ 注册新用户」快速创建</td></tr>`;
    return;
  }

  list.forEach(item => {
    const isSelf = Auth.currentUser && String(Auth.currentUser.id) === String(item.id);
    const isItemAdmin = item.role === 'admin';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${item.id}</td>
      <td>
        <strong>${escapeHtml(item.username)}</strong>
        <span class="header-user-role ${isItemAdmin ? 'role-admin' : 'role-creator'}" style="margin-left:8px; font-size:10px;">
          ${isItemAdmin ? '管理员' : '创作者'}
        </span>
      </td>
      <td><span class="badge-guide activity-badge">${item.guidesCount || 0} 个</span></td>
      <td><span class="badge-hint activity-badge">${item.hintsCount || 0} 个</span></td>
      <td style="color:var(--text-dim);">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          ${isSelf ? '' : `<button class="btn-sm toggle-role-btn" data-id="${item.id}" data-role="${isItemAdmin ? 'user' : 'admin'}" style="background:rgba(255,255,255,0.08); border:1px solid var(--border-color); color:var(--text-main); font-size:11px;">${isItemAdmin ? '降为创作者' : '升为管理员'}</button>`}
          <button class="btn-sm btn-primary-sm reset-pwd-btn" data-id="${item.id}" data-name="${escapeHtml(item.username)}">修改密码</button>
          ${isSelf ? 
            `<button class="btn-sm" style="opacity:0.4; cursor:not-allowed;" title="不能删除当前正在使用的账号" disabled>本人</button>` : 
            `<button class="btn-sm btn-danger-sm delete-user-btn" data-id="${item.id}" data-name="${escapeHtml(item.username)}">删除</button>`}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 绑定角色切换事件
  tbody.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetRole = btn.dataset.role;
      const roleName = targetRole === 'admin' ? '超级管理员' : '普通创作者';
      if (confirm(`确定要将该用户角色调整为「${roleName}」吗？`)) {
        try {
          const res = await Api.updateUserRole(btn.dataset.id, targetRole);
          if (res.success) {
            showToast('用户角色已成功更新！');
            await loadUsers();
          } else {
            showToast(res.error || '角色修改失败', 'error');
          }
        } catch (e) {
          showToast('修改异常: ' + e.message, 'error');
        }
      }
    });
  });

  // 绑定事件
  tbody.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => confirmDeleteUser(btn.dataset.id, btn.dataset.name));
  });
  tbody.querySelectorAll('.reset-pwd-btn').forEach(btn => {
    btn.addEventListener('click', () => openResetPasswordModal(btn.dataset.id, btn.dataset.name));
  });
}

// 填充作者下拉框选项
function updateAuthorSelectOptions() {
  const isAdmin = Auth.isAdmin();
  const guideAuthorGroup = document.getElementById('new-guide-author')?.closest('.form-group');
  const hintAuthorGroup = document.getElementById('new-hint-author')?.closest('.form-group');

  if (!isAdmin) {
    // 普通创作者：隐藏作者下拉选择（强制本人发布）
    if (guideAuthorGroup) guideAuthorGroup.style.display = 'none';
    if (hintAuthorGroup) hintAuthorGroup.style.display = 'none';
    return;
  }

  // 管理员：展示并支持指派作者
  if (guideAuthorGroup) guideAuthorGroup.style.display = 'block';
  if (hintAuthorGroup) hintAuthorGroup.style.display = 'block';

  const selects = [
    document.getElementById('new-guide-author'),
    document.getElementById('new-hint-author')
  ];

  selects.forEach(select => {
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- 当前登录账号 (默认) --</option>';
    state.users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.username} (${u.role === 'admin' ? '管理员' : '创作者'})`;
      select.appendChild(opt);
    });
    select.value = currentVal;
  });
}

// 5. 加载系统信息
async function loadSystem() {
  try {
    const res = await Api.getSystemInfo();
    if (res.success) {
      const { system } = res;
      document.getElementById('sys-node-version').textContent = system.nodeVersion;
      document.getElementById('sys-platform').textContent = system.platform;
      document.getElementById('sys-uptime').textContent = `${Math.floor(system.uptimeSeconds / 60)} 分钟`;
      document.getElementById('sys-memory').textContent = system.memoryUsage.heapUsed;
      document.getElementById('sys-time').textContent = formatTime(system.serverTime);
    }
  } catch (err) {
    showToast('获取系统信息失败: ' + err.message, 'error');
  }
}

// 引导步骤详情查看
async function openGuideDetailsModal(id) {
  const modal = document.getElementById('guide-modal');
  const content = document.getElementById('modal-step-list');
  content.innerHTML = '<div style="padding:20px; text-align:center;">正在拉取任务步骤...</div>';
  openModal('guide-modal');

  try {
    const res = await Api.getGuide(id);
    if (res.success && res.guide) {
      const { guide } = res;
      document.getElementById('modal-guide-title').textContent = guide.name;
      content.innerHTML = '';

      if (!guide.steps || guide.steps.length === 0) {
        content.innerHTML = '<div class="empty-state">该引导任务未包含任何步骤</div>';
        return;
      }

      guide.steps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'step-card';
        div.innerHTML = `
          <div class="step-index">第 ${index + 1} 步</div>
          <div class="step-desc">${escapeHtml(step.text || '无提示文本')}</div>
          <div><code class="selector-tag" style="max-width:100%;">${escapeHtml(step.selector || '无目标选择器')}</code></div>
        `;
        content.appendChild(div);
      });
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state" style="color:var(--accent-danger)">加载详情失败: ${err.message}</div>`;
  }
}

// 删除确认
async function confirmDeleteGuide(id, name) {
  if (confirm(`确定要从云端删除引导任务「${name}」吗？`)) {
    try {
      const res = await Api.deleteGuide(id);
      if (res.success) {
        showToast('任务已成功删除');
        await loadGuides();
      } else {
        showToast(res.error || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除请求异常: ' + err.message, 'error');
    }
  }
}

async function confirmDeleteHint(id) {
  if (confirm(`确定要从云端删除该条提示规则吗？`)) {
    try {
      const res = await Api.deleteHint(id);
      if (res.success) {
        showToast('提示已成功删除');
        await loadHints();
      } else {
        showToast(res.error || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除请求异常: ' + err.message, 'error');
    }
  }
}

// 删除用户确认
async function confirmDeleteUser(id, name) {
  if (confirm(`确定要彻底删除用户账号「${name}」吗？删除后该用户将无法登录。`)) {
    try {
      const res = await Api.deleteUser(id);
      if (res.success) {
        showToast(`用户「${name}」已删除`);
        await loadUsers();
        await loadOverview();
      } else {
        showToast(res.error || '删除失败', 'error');
      }
    } catch (err) {
      showToast('删除请求异常: ' + err.message, 'error');
    }
  }
}

// 打开重置密码弹窗
let currentResetUserId = null;
function openResetPasswordModal(id, username) {
  currentResetUserId = id;
  document.getElementById('reset-pwd-username').textContent = username;
  document.getElementById('reset-pwd-input').value = '';
  openModal('reset-password-modal');
}

// 提交重置密码
async function submitResetPassword() {
  if (!currentResetUserId) return;
  const newPassword = document.getElementById('reset-pwd-input').value.trim();
  if (!newPassword) return showToast('请输入新密码', 'error');

  try {
    const res = await Api.resetUserPassword(currentResetUserId, newPassword);
    if (res.success) {
      showToast('密码已成功修改！');
      closeModal('reset-password-modal');
    } else {
      showToast(res.error || '重置失败', 'error');
    }
  } catch (err) {
    showToast('重置密码异常: ' + err.message, 'error');
  }
}

// --- 录入表单交互 ---

// 1. 新建引导任务：添加步骤项
function addGuideStepInput(stepText = '', stepSelector = '') {
  const container = document.getElementById('new-guide-steps-container');
  const index = container.children.length + 1;
  const div = document.createElement('div');
  div.className = 'step-input-row';
  div.style.cssText = 'background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:10px; display:flex; flex-direction:column; gap:8px; position:relative;';
  div.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center;">
      <span style="font-size:12px; font-weight:600; color:var(--accent-primary);">第 ${index} 步</span>
      <button type="button" class="remove-step-btn" style="background:transparent; border:none; color:var(--text-dim); cursor:pointer; font-size:16px;">&times;</button>
    </div>
    <input type="text" class="step-text-input form-input" placeholder="步骤说明，如：点击此处进行登录" value="${escapeHtml(stepText)}">
    <input type="text" class="step-selector-input form-input" placeholder="CSS 选择器，如：#login-btn 或 .header-nav a" value="${escapeHtml(stepSelector)}">
  `;
  container.appendChild(div);

  div.querySelector('.remove-step-btn').addEventListener('click', () => {
    div.remove();
    // 重新排序序号
    Array.from(container.children).forEach((child, i) => {
      child.querySelector('span').textContent = `第 ${i + 1} 步`;
    });
  });
}

// 提交创建引导任务
async function submitCreateGuide() {
  const name = document.getElementById('new-guide-name').value.trim();
  const domain = document.getElementById('new-guide-domain').value.trim();
  const startUrl = document.getElementById('new-guide-url').value.trim();
  const authorId = document.getElementById('new-guide-author').value || null;

  if (!name) return showToast('请输入任务名称', 'error');
  if (!domain) return showToast('请输入目标域名（如 github.com）', 'error');

  const stepRows = document.querySelectorAll('#new-guide-steps-container .step-input-row');
  const steps = [];
  stepRows.forEach(row => {
    const text = row.querySelector('.step-text-input').value.trim();
    const selector = row.querySelector('.step-selector-input').value.trim();
    if (text || selector) {
      steps.push({ text, selector });
    }
  });

  try {
    const res = await Api.createGuide({
      name,
      domain,
      startUrl,
      authorId,
      steps
    });

    if (res.success) {
      showToast('引导任务录入成功！');
      closeModal('create-guide-modal');
      // 清空表单
      document.getElementById('new-guide-name').value = '';
      document.getElementById('new-guide-domain').value = '';
      document.getElementById('new-guide-url').value = '';
      document.getElementById('new-guide-steps-container').innerHTML = '';
      await loadGuides();
      await loadOverview();
    } else {
      showToast(res.error || '录入失败', 'error');
    }
  } catch (err) {
    showToast('提交异常: ' + err.message, 'error');
  }
}

// 提交创建悬停提示
async function submitCreateHint() {
  const text = document.getElementById('new-hint-text').value.trim();
  const domain = document.getElementById('new-hint-domain').value.trim();
  const url = document.getElementById('new-hint-url').value.trim();
  const selector = document.getElementById('new-hint-selector').value.trim();
  const authorId = document.getElementById('new-hint-author').value || null;

  if (!text) return showToast('请输入提示内容', 'error');
  if (!domain) return showToast('请输入目标域名', 'error');
  if (!selector) return showToast('请输入目标元素 CSS 选择器', 'error');

  try {
    const res = await Api.createHint({
      text,
      domain,
      url,
      selector,
      authorId
    });

    if (res.success) {
      showToast('悬停提示录入成功！');
      closeModal('create-hint-modal');
      document.getElementById('new-hint-text').value = '';
      document.getElementById('new-hint-domain').value = '';
      document.getElementById('new-hint-url').value = '';
      document.getElementById('new-hint-selector').value = '';
      await loadHints();
      await loadOverview();
    } else {
      showToast(res.error || '录入失败', 'error');
    }
  } catch (err) {
    showToast('提交异常: ' + err.message, 'error');
  }
}

// 提交注册新用户
async function submitCreateUser() {
  const username = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-password').value.trim();
  const role = document.getElementById('new-user-role')?.value || 'user';

  if (!username) return showToast('请输入用户名', 'error');
  if (!password) return showToast('请输入初始密码', 'error');

  try {
    const res = await Api.createUser(username, password, role);
    if (res.success) {
      showToast(`用户「${username}」注册成功！`);
      closeModal('create-user-modal');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-password').value = '';
      await loadUsers();
      await loadOverview();
    } else {
      showToast(res.error || '注册失败', 'error');
    }
  } catch (err) {
    showToast('注册请求异常: ' + err.message, 'error');
  }
}

// 搜索过滤绑定
function initSearchListeners() {
  const guideSearch = document.getElementById('search-guides-input');
  if (guideSearch) {
    guideSearch.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      const filtered = state.guides.filter(g => 
        (g.name && g.name.toLowerCase().includes(val)) ||
        (g.domain && g.domain.toLowerCase().includes(val)) ||
        (g.author && g.author.toLowerCase().includes(val))
      );
      renderGuidesTable(filtered);
    });
  }

  const hintSearch = document.getElementById('search-hints-input');
  if (hintSearch) {
    hintSearch.addEventListener('input', (e) => {
      const val = e.target.value.toLowerCase().trim();
      const filtered = state.hints.filter(h => 
        (h.text && h.text.toLowerCase().includes(val)) ||
        (h.domain && h.domain.toLowerCase().includes(val)) ||
        (h.selector && h.selector.toLowerCase().includes(val))
      );
      renderHintsTable(filtered);
    });
  }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
  // 导航项点击切换
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // 手动刷新按钮
  document.getElementById('manual-refresh-btn').addEventListener('click', () => {
    loadCurrentTabData();
    showToast('数据已刷新');
  });

  // 通用关闭模态框绑定
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  });

  // 1. 新建引导模态框触发与步骤增减
  document.getElementById('open-create-guide-modal-btn')?.addEventListener('click', () => {
    updateAuthorSelectOptions();
    // 默认加一步
    const container = document.getElementById('new-guide-steps-container');
    if (container.children.length === 0) {
      addGuideStepInput('欢迎步骤', '#header');
    }
    openModal('create-guide-modal');
  });
  document.getElementById('add-guide-step-btn')?.addEventListener('click', () => addGuideStepInput());
  document.getElementById('submit-create-guide-btn')?.addEventListener('click', submitCreateGuide);

  // 2. 新建悬停提示模态框触发
  document.getElementById('open-create-hint-modal-btn')?.addEventListener('click', () => {
    updateAuthorSelectOptions();
    openModal('create-hint-modal');
  });
  document.getElementById('submit-create-hint-btn')?.addEventListener('click', submitCreateHint);

  // 3. 注册新用户模态框触发
  document.getElementById('open-create-user-modal-btn')?.addEventListener('click', () => {
    openModal('create-user-modal');
  });
  document.getElementById('submit-create-user-btn')?.addEventListener('click', submitCreateUser);

  // 4. 重置密码提交触发
  document.getElementById('submit-reset-password-btn')?.addEventListener('click', submitResetPassword);

  // 搜索监听
  initSearchListeners();

  // 初始化鉴权模块
  Auth.init();

  // 订阅登录认证状态变更
  Auth.onAuthStateChanged((isAuthenticated, currentUser) => {
    applyRolePermissions();

    if (isAuthenticated) {
      // 权限自愈：如果当前停留在敏感管理员页面但角色为普通用户，自动回退到概览
      if (['users', 'system'].includes(state.currentTab) && !Auth.isAdmin()) {
        state.currentTab = 'overview';
      }

      // 仅管理员预加载全量用户列表以供管理与作者展示
      if (Auth.isAdmin()) {
        loadUsers();
      }

      switchTab(state.currentTab || 'overview');
    } else {
      // 未登录或注销状态，重置清空敏感业务数据
      state.guides = [];
      state.hints = [];
      state.users = [];
      state.system = null;
    }
  });
});
