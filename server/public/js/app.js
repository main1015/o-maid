import { Api } from './api.js';
import { Auth } from './auth.js';

// 当前应用状态
const state = {
  currentTab: 'overview',
  guides: [],
  hints: [],
  users: [],
  system: null,
  pagination: {
    guides: { page: 1, pageSize: 10 },
    hints: { page: 1, pageSize: 10 },
    users: { page: 1, pageSize: 10 }
  }
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

// 通用分页渲染组件
function renderPaginationControls({ containerId, total, page, pageSize, onPageChange, onPageSizeChange }) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (total === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  const totalPages = Math.ceil(total / pageSize) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));

  // 计算页码列表 (最长展示7项，智能折叠)
  let pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, total);

  container.innerHTML = `
    <div class="pagination-info">
      <span>${window.i18n.t('page_info', { total: total, start: startItem, end: endItem })}</span>
      <select class="pagination-size-select" title="${window.i18n.t('page_size_title') || '每页显示条数'}">
        <option value="10" ${pageSize === 10 ? 'selected' : ''}>${window.i18n.t('page_size_10')}</option>
        <option value="20" ${pageSize === 20 ? 'selected' : ''}>${window.i18n.t('page_size_20')}</option>
        <option value="50" ${pageSize === 50 ? 'selected' : ''}>${window.i18n.t('page_size_50')}</option>
      </select>
    </div>
    <div class="pagination-controls">
      <button class="page-btn prev-page-btn" ${currentPage <= 1 ? 'disabled' : ''} title="${window.i18n.t('btn_prev_page')}">${window.i18n.t('btn_prev_page')}</button>
      ${pages.map(p => {
        if (p === '...') return `<span class="page-ellipsis">...</span>`;
        return `<button class="page-btn num-page-btn ${p === currentPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
      }).join('')}
      <button class="page-btn next-page-btn" ${currentPage >= totalPages ? 'disabled' : ''} title="${window.i18n.t('btn_next_page')}">${window.i18n.t('btn_next_page')}</button>
    </div>
  `;

  // 绑定事件
  container.querySelector('.pagination-size-select')?.addEventListener('change', (e) => {
    const newSize = parseInt(e.target.value, 10);
    onPageSizeChange(newSize);
  });

  container.querySelector('.prev-page-btn')?.addEventListener('click', () => {
    if (currentPage > 1) onPageChange(currentPage - 1);
  });

  container.querySelector('.next-page-btn')?.addEventListener('click', () => {
    if (currentPage < totalPages) onPageChange(currentPage + 1);
  });

  container.querySelectorAll('.num-page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = parseInt(btn.dataset.page, 10);
      if (p !== currentPage) onPageChange(p);
    });
  });
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
    showToast(window.i18n.t('msg_err_admin_only'), 'error');
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
    overview: window.i18n.t('header_overview'),
    guides: window.i18n.t('header_guides'),
    hints: window.i18n.t('header_hints'),
    users: window.i18n.t('header_users'),
    system: window.i18n.t('header_system')
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
      const pendingCountElem = document.getElementById('stat-pending-count');
      if (pendingCountElem) {
        pendingCountElem.textContent = stats.pendingTotal || 0;
      }
      const pendingGuidesBadge = document.getElementById('stat-pending-guides-badge');
      if (pendingGuidesBadge) {
        pendingGuidesBadge.textContent = stats.pendingGuides || 0;
      }
      const pendingHintsBadge = document.getElementById('stat-pending-hints-badge');
      if (pendingHintsBadge) {
        pendingHintsBadge.textContent = stats.pendingHints || 0;
      }

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
          li.style.cursor = 'pointer';
          li.title = `点击前往查看此${isGuide ? '引导任务' : '悬停提示'}`;
          li.innerHTML = `
            <span class="activity-badge ${isGuide ? 'badge-guide' : 'badge-hint'}">
              ${isGuide ? '任务' : '提示'}
            </span>
            <div class="activity-info">
              <div class="activity-name" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div>
              <div class="activity-meta">
                <span>${window.i18n.t('lbl_author')} ${escapeHtml(item.author || '系统录入')}</span> · 
                <span>${window.i18n.t('lbl_domain')} ${escapeHtml(item.domain || '-')}</span> · 
                <span style="color:var(--text-dim);">${formatTime(item.created_at)}</span>
              </div>
            </div>
          `;
          li.addEventListener('click', () => {
            if (isGuide) {
              switchTab('guides');
              const select = document.getElementById('filter-guides-status');
              const search = document.getElementById('search-guides-input');
              if (select) select.value = '';
              if (search) search.value = '';
              state.pagination.guides.page = 1;
              filterAndRenderGuides();
            } else {
              switchTab('hints');
              const select = document.getElementById('filter-hints-status');
              const search = document.getElementById('search-hints-input');
              if (select) select.value = '';
              if (search) search.value = '';
              state.pagination.hints.page = 1;
              filterAndRenderHints();
            }
          });
          activityList.appendChild(li);
        });
      }
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_load_overview') + err.message, 'error');
  }
}

// 辅助函数：渲染状态徽标
function renderStatusBadge(status) {
  const map = {
    approved: '<span class="status-badge approved">● ' + window.i18n.t('filter_approved') + '</span>',
    pending: '<span class="status-badge pending">⏳ ' + window.i18n.t('filter_pending') + '</span>',
    rejected: '<span class="status-badge rejected">✕ ' + window.i18n.t('filter_rejected') + '</span>'
  };
  return map[status] || map.pending;
}

// 2. 加载引导任务列表
async function loadGuides() {
  try {
    const res = await Api.getGuides();
    if (res.success) {
      state.guides = res.guides || [];
      filterAndRenderGuides();
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_load_guides') + err.message, 'error');
  }
}

function filterAndRenderGuides() {
  const searchVal = (document.getElementById('search-guides-input')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('filter-guides-status')?.value || '';

  const filtered = state.guides.filter(g => {
    const matchSearch = !searchVal || 
      (g.name && g.name.toLowerCase().includes(searchVal)) ||
      (g.domain && g.domain.toLowerCase().includes(searchVal)) ||
      (g.author && g.author.toLowerCase().includes(searchVal));
    const matchStatus = !statusVal || (g.status || 'pending') === statusVal;
    return matchSearch && matchStatus;
  });

  const total = filtered.length;
  const { page, pageSize } = state.pagination.guides;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const validPage = Math.max(1, Math.min(page, totalPages));
  state.pagination.guides.page = validPage;

  const startIndex = (validPage - 1) * pageSize;
  const pagedList = filtered.slice(startIndex, startIndex + pageSize);

  renderGuidesTable(pagedList);

  renderPaginationControls({
    containerId: 'guides-pagination',
    total,
    page: validPage,
    pageSize,
    onPageChange: (newPage) => {
      state.pagination.guides.page = newPage;
      filterAndRenderGuides();
    },
    onPageSizeChange: (newSize) => {
      state.pagination.guides.pageSize = newSize;
      state.pagination.guides.page = 1;
      filterAndRenderGuides();
    }
  });
}

function renderGuidesTable(list) {
  const tbody = document.getElementById('guides-table-body');
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">📂</div>暂无符合条件的引导任务，可点击上方「+ 新建引导任务」录入</td></tr>`;
    return;
  }

  const isAdmin = Auth.isAdmin();
  const currentUserId = Auth.currentUser ? Auth.currentUser.id : null;

  list.forEach(item => {
    const isMyWork = currentUserId && String(item.authorId) === String(currentUserId);
    const canDelete = isAdmin || isMyWork;
    const status = item.status || 'pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td><span class="domain-tag">${escapeHtml(item.domain || '通用')}</span></td>
      <td><span style="font-weight:600; color:var(--accent-primary);">${item.stepCount || (item.steps ? item.steps.length : 0)} 步</span></td>
      <td>
        ${escapeHtml(item.author || '平台')}
        ${isMyWork ? '<span class="author-badge-self">我</span>' : ''}
      </td>
      <td>${renderStatusBadge(status)}</td>
      <td>🔥 ${item.downloads || 0}</td>
      <td style="color:var(--text-dim); font-size:12px;">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          <button class="btn-sm btn-primary-sm view-guide-btn" data-id="${escapeHtml(item.id)}">${window.i18n.t('btn_detail')}</button>
          ${isAdmin && status === 'pending' ? `
            <button class="btn-sm btn-audit-approve audit-guide-btn" data-id="${escapeHtml(item.id)}" data-action="approved">${window.i18n.t('btn_approve')}</button>
            <button class="btn-sm btn-audit-reject audit-guide-btn" data-id="${escapeHtml(item.id)}" data-action="rejected">${window.i18n.t('btn_reject')}</button>
          ` : ''}
          ${isAdmin && status === 'rejected' ? `
            <button class="btn-sm btn-audit-approve audit-guide-btn" data-id="${escapeHtml(item.id)}" data-action="approved">${window.i18n.t('btn_reapprove')}</button>
          ` : ''}
          ${canDelete ? `<button class="btn-sm btn-danger-sm delete-guide-btn" data-id="${escapeHtml(item.id)}" data-name="${escapeHtml(item.name)}">${window.i18n.t('btn_delete')}</button>` : (!isAdmin ? `<span style="color:var(--text-dim); font-size:12px;">${window.i18n.t('label_readonly')}</span>` : '')}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.view-guide-btn').forEach(btn => {
    btn.addEventListener('click', () => openGuideDetailsModal(btn.dataset.id));
  });
  tbody.querySelectorAll('.audit-guide-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentBtn = e.currentTarget;
      const id = currentBtn.dataset.id;
      const action = currentBtn.dataset.action;
      const originalText = currentBtn.textContent;

      currentBtn.disabled = true;
      currentBtn.textContent = '处理中...';

      try {
        const res = await Api.auditGuide(id, action);
        if (res.success) {
          showToast(res.message || window.i18n.t('msg_audit_success'), 'success');
          await loadGuides();
          loadOverview();
        } else {
          showToast(res.error || window.i18n.t('msg_audit_incomplete'), 'error');
        }
      } catch (err) {
        showToast(window.i18n.t('msg_err_audit') + err.message, 'error');
      } finally {
        currentBtn.disabled = false;
        currentBtn.textContent = originalText;
      }
    });
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
      filterAndRenderHints();
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_load_hints') + err.message, 'error');
  }
}

function filterAndRenderHints() {
  const searchVal = (document.getElementById('search-hints-input')?.value || '').toLowerCase().trim();
  const statusVal = document.getElementById('filter-hints-status')?.value || '';

  const filtered = state.hints.filter(h => {
    const matchSearch = !searchVal || 
      (h.text && h.text.toLowerCase().includes(searchVal)) ||
      (h.domain && h.domain.toLowerCase().includes(searchVal)) ||
      (h.selector && h.selector.toLowerCase().includes(searchVal));
    const matchStatus = !statusVal || (h.status || 'pending') === statusVal;
    return matchSearch && matchStatus;
  });

  const total = filtered.length;
  const { page, pageSize } = state.pagination.hints;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const validPage = Math.max(1, Math.min(page, totalPages));
  state.pagination.hints.page = validPage;

  const startIndex = (validPage - 1) * pageSize;
  const pagedList = filtered.slice(startIndex, startIndex + pageSize);

  renderHintsTable(pagedList);

  renderPaginationControls({
    containerId: 'hints-pagination',
    total,
    page: validPage,
    pageSize,
    onPageChange: (newPage) => {
      state.pagination.hints.page = newPage;
      filterAndRenderHints();
    },
    onPageSizeChange: (newSize) => {
      state.pagination.hints.pageSize = newSize;
      state.pagination.hints.page = 1;
      filterAndRenderHints();
    }
  });
}

function renderHintsTable(list) {
  const tbody = document.getElementById('hints-table-body');
  tbody.innerHTML = '';
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state"><div class="empty-icon">💬</div>暂无符合条件的悬停提示，可点击上方「+ 新建悬停提示」录入</td></tr>`;
    return;
  }

  const isAdmin = Auth.isAdmin();
  const currentUserId = Auth.currentUser ? Auth.currentUser.id : null;

  list.forEach(item => {
    const isMyWork = currentUserId && String(item.authorId) === String(currentUserId);
    const canDelete = isAdmin || isMyWork;
    const status = item.status || 'pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="max-width:240px;" title="${escapeHtml(item.text)}">${escapeHtml(item.text)}</td>
      <td><span class="domain-tag">${escapeHtml(item.domain || '-')}</span></td>
      <td><code class="selector-tag" title="${escapeHtml(item.selector)}">${escapeHtml(item.selector)}</code></td>
      <td>
        ${escapeHtml(item.author || '平台')}
        ${isMyWork ? '<span class="author-badge-self">我</span>' : ''}
      </td>
      <td>${renderStatusBadge(status)}</td>
      <td>🔥 ${item.downloads || 0}</td>
      <td style="color:var(--text-dim); font-size:12px;">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          ${isAdmin && status === 'pending' ? `
            <button class="btn-sm btn-audit-approve audit-hint-btn" data-id="${escapeHtml(item.id)}" data-action="approved">${window.i18n.t('btn_approve')}</button>
            <button class="btn-sm btn-audit-reject audit-hint-btn" data-id="${escapeHtml(item.id)}" data-action="rejected">${window.i18n.t('btn_reject')}</button>
          ` : ''}
          ${isAdmin && status === 'rejected' ? `
            <button class="btn-sm btn-audit-approve audit-hint-btn" data-id="${escapeHtml(item.id)}" data-action="approved">${window.i18n.t('btn_reapprove')}</button>
          ` : ''}
          ${canDelete ? `<button class="btn-sm btn-danger-sm delete-hint-btn" data-id="${escapeHtml(item.id)}">${window.i18n.t('btn_delete')}</button>` : (!isAdmin ? `<span style="color:var(--text-dim); font-size:12px;">${window.i18n.t('label_readonly')}</span>` : '')}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('.audit-hint-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentBtn = e.currentTarget;
      const id = currentBtn.dataset.id;
      const action = currentBtn.dataset.action;
      const originalText = currentBtn.textContent;

      currentBtn.disabled = true;
      currentBtn.textContent = '处理中...';

      try {
        const res = await Api.auditHint(id, action);
        if (res.success) {
          showToast(res.message || window.i18n.t('msg_audit_success'), 'success');
          await loadHints();
          loadOverview();
        } else {
          showToast(res.error || window.i18n.t('msg_audit_incomplete'), 'error');
        }
      } catch (err) {
        showToast(window.i18n.t('msg_err_audit') + err.message, 'error');
      } finally {
        currentBtn.disabled = false;
        currentBtn.textContent = originalText;
      }
    });
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
    showToast(window.i18n.t('msg_err_load_users') + err.message, 'error');
  }
}

function renderUsersTable(list) {
  const tbody = document.getElementById('users-table-body');
  tbody.innerHTML = '';
  if (!list || list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state"><div class="empty-icon">👥</div>暂无注册用户，可点击右上角「+ 注册新用户」快速创建</td></tr>`;
    renderPaginationControls({ containerId: 'users-pagination', total: 0 });
    return;
  }

  const total = list.length;
  const { page, pageSize } = state.pagination.users;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const validPage = Math.max(1, Math.min(page, totalPages));
  state.pagination.users.page = validPage;

  const startIndex = (validPage - 1) * pageSize;
  const pagedList = list.slice(startIndex, startIndex + pageSize);

  pagedList.forEach(item => {
    const isSelf = Auth.currentUser && String(Auth.currentUser.id) === String(item.id);
    const isItemAdmin = item.role === 'admin';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${item.id}</td>
      <td>
        <strong>${escapeHtml(item.username)}</strong>
        <span class="header-user-role ${isItemAdmin ? 'role-admin' : 'role-creator'}" style="margin-left:8px; font-size:10px;">
          ${isItemAdmin ? window.i18n.t('label_admin') : window.i18n.t('role_creator')}
        </span>
      </td>
      <td><span class="badge-guide activity-badge">${item.guidesCount || 0} 个</span></td>
      <td><span class="badge-hint activity-badge">${item.hintsCount || 0} 个</span></td>
      <td style="color:var(--text-dim);">${formatTime(item.created_at)}</td>
      <td>
        <div class="action-btn-group">
          ${isSelf ? '' : `<button class="btn-sm toggle-role-btn" data-id="${item.id}" data-role="${isItemAdmin ? 'user' : 'admin'}" style="background:rgba(255,255,255,0.08); border:1px solid var(--border-color); color:var(--text-main); font-size:11px;">${isItemAdmin ? window.i18n.t('btn_demote_user') : window.i18n.t('btn_promote_admin')}</button>`}
          <button class="btn-sm btn-primary-sm reset-pwd-btn" data-id="${item.id}" data-name="${escapeHtml(item.username)}">${window.i18n.t('btn_change_pwd')}</button>
          ${isSelf ? 
            `<button class="btn-sm" style="opacity:0.4; cursor:not-allowed;" title="${window.i18n.t('msg_self_delete')}" disabled>${window.i18n.t('label_self')}</button>` : 
            `<button class="btn-sm btn-danger-sm delete-user-btn" data-id="${item.id}" data-name="${escapeHtml(item.username)}">${window.i18n.t('btn_delete')}</button>`}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // 绑定角色切换事件
  tbody.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const targetRole = btn.dataset.role;
      const roleName = targetRole === 'admin' ? window.i18n.t('role_admin_full') : window.i18n.t('role_creator_full');
      if (confirm(window.i18n.t('confirm_role_change', { role: roleName }) || `确定要将该用户角色调整为「${roleName}」吗？`)) {
        try {
          const res = await Api.updateUserRole(btn.dataset.id, targetRole);
          if (res.success) {
            showToast(window.i18n.t('msg_role_success') || '用户角色已成功更新！');
            await loadUsers();
          } else {
            showToast(res.error || window.i18n.t('msg_role_fail'), 'error');
          }
        } catch (e) {
          showToast(window.i18n.t('msg_err_modify') + e.message, 'error');
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

  renderPaginationControls({
    containerId: 'users-pagination',
    total,
    page: validPage,
    pageSize,
    onPageChange: (newPage) => {
      state.pagination.users.page = newPage;
      renderUsersTable(state.users);
    },
    onPageSizeChange: (newSize) => {
      state.pagination.users.pageSize = newSize;
      state.pagination.users.page = 1;
      renderUsersTable(state.users);
    }
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
      opt.textContent = `${u.username} (${u.role === 'admin' ? window.i18n.t('label_admin') : window.i18n.t('role_creator')})`;
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
    showToast(window.i18n.t('msg_err_load_sys') + err.message, 'error');
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
  if (confirm(window.i18n.t('confirm_delete', { type: window.i18n.t('type_guide'), name: name }) || `确定要从云端删除引导任务「${name}」吗？`)) {
    try {
      const res = await Api.deleteGuide(id);
      if (res.success) {
        showToast(window.i18n.t('msg_del_success') || '任务已成功删除');
        await loadGuides();
      } else {
        showToast(res.error || window.i18n.t('msg_del_fail'), 'error');
      }
    } catch (err) {
      showToast(window.i18n.t('msg_err_del_req') + err.message, 'error');
    }
  }
}

async function confirmDeleteHint(id) {
  if (confirm(window.i18n.t('confirm_delete', { type: window.i18n.t('type_hint'), name: id }) || `确定要从云端删除该条提示规则吗？`)) {
    try {
      const res = await Api.deleteHint(id);
      if (res.success) {
        showToast(window.i18n.t('msg_del_success') || '提示已成功删除');
        await loadHints();
      } else {
        showToast(res.error || window.i18n.t('msg_del_fail'), 'error');
      }
    } catch (err) {
      showToast(window.i18n.t('msg_err_del_req') + err.message, 'error');
    }
  }
}

// 删除用户确认
async function confirmDeleteUser(id, name) {
  if (confirm(window.i18n.t('confirm_delete', { type: window.i18n.t('type_user'), name: name }) || `确定要删除 用户「${name}」吗？此操作不可恢复！`)) {
    try {
      const res = await Api.deleteUser(id);
      if (res.success) {
        showToast(window.i18n.t('msg_del_success') || `用户「${name}」已删除`);
        await loadUsers();
        await loadOverview();
      } else {
        showToast(res.error || window.i18n.t('msg_del_fail'), 'error');
      }
    } catch (err) {
      showToast(window.i18n.t('msg_err_del_req') + err.message, 'error');
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
  if (!newPassword) return showToast(window.i18n.t('msg_req_new_pwd'), 'error');

  try {
    const res = await Api.resetUserPassword(currentResetUserId, newPassword);
    if (res.success) {
      showToast(window.i18n.t('msg_pwd_changed'));
      closeModal('reset-password-modal');
    } else {
      showToast(res.error || window.i18n.t('msg_err_reset'), 'error');
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_reset_req') + err.message, 'error');
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

  if (!name) return showToast(window.i18n.t('msg_req_task_name'), 'error');
  if (!domain) return showToast(window.i18n.t('msg_req_domain_guide'), 'error');

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
      showToast(window.i18n.t('msg_guide_add_success'));
      closeModal('create-guide-modal');
      // 清空表单
      document.getElementById('new-guide-name').value = '';
      document.getElementById('new-guide-domain').value = '';
      document.getElementById('new-guide-url').value = '';
      document.getElementById('new-guide-steps-container').innerHTML = '';
      await loadGuides();
      await loadOverview();
    } else {
      showToast(res.error || window.i18n.t('msg_err_add'), 'error');
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_submit') + err.message, 'error');
  }
}

// 提交创建悬停提示
async function submitCreateHint() {
  const text = document.getElementById('new-hint-text').value.trim();
  const domain = document.getElementById('new-hint-domain').value.trim();
  const url = document.getElementById('new-hint-url').value.trim();
  const selector = document.getElementById('new-hint-selector').value.trim();
  const authorId = document.getElementById('new-hint-author').value || null;

  if (!text) return showToast(window.i18n.t('msg_req_hint_text'), 'error');
  if (!domain) return showToast(window.i18n.t('msg_req_domain'), 'error');
  if (!selector) return showToast(window.i18n.t('msg_req_css'), 'error');

  try {
    const res = await Api.createHint({
      text,
      domain,
      url,
      selector,
      authorId
    });

    if (res.success) {
      showToast(window.i18n.t('msg_hint_add_success'));
      closeModal('create-hint-modal');
      document.getElementById('new-hint-text').value = '';
      document.getElementById('new-hint-domain').value = '';
      document.getElementById('new-hint-url').value = '';
      document.getElementById('new-hint-selector').value = '';
      await loadHints();
      await loadOverview();
    } else {
      showToast(res.error || window.i18n.t('msg_err_add'), 'error');
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_submit') + err.message, 'error');
  }
}

// 提交注册新用户
async function submitCreateUser() {
  const username = document.getElementById('new-user-name').value.trim();
  const password = document.getElementById('new-user-password').value.trim();
  const role = document.getElementById('new-user-role')?.value || 'user';

  if (!username) return showToast(window.i18n.t('msg_req_username'), 'error');
  if (!password) return showToast(window.i18n.t('msg_req_init_pwd'), 'error');

  try {
    const res = await Api.createUser(username, password, role);
    if (res.success) {
      showToast(window.i18n.t('msg_user_reg_success', { username: username }) || `用户「${username}」注册成功！`);
      closeModal('create-user-modal');
      document.getElementById('new-user-name').value = '';
      document.getElementById('new-user-password').value = '';
      await loadUsers();
      await loadOverview();
    } else {
      showToast(res.error || window.i18n.t('msg_err_register'), 'error');
    }
  } catch (err) {
    showToast(window.i18n.t('msg_err_register_req') + err.message, 'error');
  }
}

// 搜索与状态过滤监听绑定
function initSearchListeners() {
  const guideSearch = document.getElementById('search-guides-input');
  const guideFilter = document.getElementById('filter-guides-status');
  if (guideSearch) guideSearch.addEventListener('input', () => {
    state.pagination.guides.page = 1;
    filterAndRenderGuides();
  });
  if (guideFilter) guideFilter.addEventListener('change', () => {
    state.pagination.guides.page = 1;
    filterAndRenderGuides();
  });

  const hintSearch = document.getElementById('search-hints-input');
  const hintFilter = document.getElementById('filter-hints-status');
  if (hintSearch) hintSearch.addEventListener('input', () => {
    state.pagination.hints.page = 1;
    filterAndRenderHints();
  });
  if (hintFilter) hintFilter.addEventListener('change', () => {
    state.pagination.hints.page = 1;
    filterAndRenderHints();
  });
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
  await window.i18n.init();

  // 导航项点击切换
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchTab(item.dataset.tab));
  });

  // 概览核心指标卡片 - 点击快速直达各管理模块 (自动重置为全部展示)
  document.getElementById('stat-card-users')?.addEventListener('click', () => {
    switchTab('users');
    state.pagination.users.page = 1;
    renderUsersTable(state.users);
  });

  document.getElementById('stat-card-guides')?.addEventListener('click', () => {
    switchTab('guides');
    const select = document.getElementById('filter-guides-status');
    const search = document.getElementById('search-guides-input');
    if (select) select.value = '';
    if (search) search.value = '';
    state.pagination.guides.page = 1;
    filterAndRenderGuides();
  });

  document.getElementById('stat-card-hints')?.addEventListener('click', () => {
    switchTab('hints');
    const select = document.getElementById('filter-hints-status');
    const search = document.getElementById('search-hints-input');
    if (select) select.value = '';
    if (search) search.value = '';
    state.pagination.hints.page = 1;
    filterAndRenderHints();
  });

  // 待审核卡片 - 直达待审引导任务
  document.getElementById('btn-jump-pending-guides')?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab('guides');
    const select = document.getElementById('filter-guides-status');
    if (select) {
      select.value = 'pending';
      filterAndRenderGuides();
    }
  });

  // 待审核卡片 - 直达待审悬停提示
  document.getElementById('btn-jump-pending-hints')?.addEventListener('click', (e) => {
    e.stopPropagation();
    switchTab('hints');
    const select = document.getElementById('filter-hints-status');
    if (select) {
      select.value = 'pending';
      filterAndRenderHints();
    }
  });

  // 待审核卡片主体 - 智能跳转到有待审核内容的模块
  document.getElementById('stat-card-pending')?.addEventListener('click', () => {
    const guidesCount = parseInt(document.getElementById('stat-pending-guides-badge')?.textContent || '0', 10);
    const hintsCount = parseInt(document.getElementById('stat-pending-hints-badge')?.textContent || '0', 10);

    // 若只有悬停提示有待审核，自动跳到悬停提示；否则跳到引导任务
    if (hintsCount > 0 && guidesCount === 0) {
      switchTab('hints');
      const select = document.getElementById('filter-hints-status');
      if (select) {
        select.value = 'pending';
        filterAndRenderHints();
      }
    } else {
      switchTab('guides');
      const select = document.getElementById('filter-guides-status');
      if (select) {
        select.value = 'pending';
        filterAndRenderGuides();
      }
    }
  });

  // 手动刷新按钮
  document.getElementById('manual-refresh-btn').addEventListener('click', () => {
    loadCurrentTabData();
    showToast(window.i18n.t('msg_data_refreshed'));
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
