// O-Maid Dashboard - 独立认证与会话管理模块 (auth.js)
// 职责：用户登录/注册交互、Token 持久化、会话状态机与登录遮罩层控制

import { Api } from './api.js';

const STORAGE_KEY_TOKEN = 'o_maid_token';
const STORAGE_KEY_USER = 'o_maid_user';

class AuthManager {
  constructor() {
    this.token = localStorage.getItem(STORAGE_KEY_TOKEN) || null;
    this.currentUser = null;
    try {
      const savedUser = localStorage.getItem(STORAGE_KEY_USER);
      if (savedUser) {
        this.currentUser = JSON.parse(savedUser);
      }
    } catch (e) {
      this.currentUser = null;
    }

    this.listeners = [];
    this.isRegisterMode = false;
  }

  /**
   * 初始化认证模块，绑定 DOM 事件并设置 API 拦截器
   */
  init() {
    // 将 Token 提供者和 401 拦截回调注入到 Api 模块
    Api.setTokenGetter(() => this.token);
    Api.setOnUnauthorized(() => {
      this.handleSessionExpired();
    });

    this.bindDomEvents();

    // 检查初始登录状态
    if (this.token) {
      this.validateSession();
    } else {
      this.showLoginOverlay();
      this.notifyState(false);
    }
  }

  /**
   * 订阅登录状态变更
   * @param {Function} callback (isAuthenticated, user) => void
   */
  onAuthStateChanged(callback) {
    this.listeners.push(callback);
    // 立即执行一次当前状态
    callback(!!this.token && !!this.currentUser, this.currentUser);
  }

  /**
   * 通知所有订阅者
   */
  notifyState(isAuthenticated) {
    this.updateSidebarUserUI();
    this.listeners.forEach(cb => cb(isAuthenticated, this.currentUser));
  }

  /**
   * 解析 JWT Payload 获取用户内置声明
   */
  parseJwt(token) {
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      if (!base64Url) return null;
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  }

  /**
   * 校验已有会话有效性
   */
  async validateSession() {
    try {
      const res = await Api.getMe();
      if (res.success && res.user) {
        const payload = this.parseJwt(this.token);
        const resolvedRole = res.user.role || (payload && payload.role) || 'user';
        this.currentUser = { ...res.user, role: resolvedRole };
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.currentUser));
        this.hideLoginOverlay();
        this.notifyState(true);
      } else {
        this.handleSessionExpired();
      }
    } catch (err) {
      console.warn('验证登录态异常，需重新登录:', err);
      const payload = this.parseJwt(this.token);
      if (payload && payload.username) {
        const resolvedRole = payload.role || 'user';
        this.currentUser = { id: payload.id, username: payload.username, role: resolvedRole };
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.currentUser));
        this.hideLoginOverlay();
        this.notifyState(true);
        return;
      }
      this.handleSessionExpired();
    }
  }

  /**
   * 处理会话过期或未授权状态
   */
  handleSessionExpired() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    this.showLoginOverlay(window.i18n.t('auth_exp_title'));
    this.notifyState(false);
  }

  /**
   * 执行用户登录
   */
  async login(username, password) {
    this.setLoading(true);
    this.clearError();
    try {
      const res = await Api.login(username, password);
      if (res.success && res.token) {
        this.token = res.token;
        const payload = this.parseJwt(this.token);
        const resolvedRole = (res.user && res.user.role) || (payload && payload.role) || 'user';
        this.currentUser = {
          id: (res.user && res.user.id) || (payload && payload.id) || null,
          username: (res.user && res.user.username) || username,
          role: resolvedRole
        };

        localStorage.setItem(STORAGE_KEY_TOKEN, this.token);
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(this.currentUser));
        this.hideLoginOverlay();
        this.notifyState(true);
        return { success: true };
      } else {
        const msg = res.error || window.i18n.t('auth_err_log');
        this.showError(msg);
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = err.message || window.i18n.t('auth_err_net');
      this.showError(msg);
      return { success: false, error: msg };
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * 执行新用户注册
   */
  async register(username, password) {
    this.setLoading(true);
    this.clearError();
    try {
      const regRes = await Api.register(username, password);
      if (regRes.success) {
        // 注册成功后直接自动登录
        return await this.login(username, password);
      } else {
        const msg = regRes.error || window.i18n.t('auth_err_reg');
        this.showError(msg);
        return { success: false, error: msg };
      }
    } catch (err) {
      const msg = err.message || window.i18n.t('auth_err_net');
      this.showError(msg);
      return { success: false, error: msg };
    } finally {
      this.setLoading(false);
    }
  }

  /**
   * 登出
   */
  logout() {
    this.token = null;
    this.currentUser = null;
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    localStorage.removeItem(STORAGE_KEY_USER);
    this.showLoginOverlay();
    this.notifyState(false);
  }

  /**
   * 绑定登录/注册弹窗交互与事件
   */
  bindDomEvents() {
    const overlay = document.getElementById('login-overlay');
    if (!overlay) return;

    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('auth-toggle-mode-btn');
    const logoutBtn = document.getElementById('btn-logout');

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleMode();
      });
    }

    if (authForm) {
      authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('auth-username');
        const passwordInput = document.getElementById('auth-password');
        const username = usernameInput ? usernameInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value.trim() : '';

        if (!username || !password) {
          this.showError(window.i18n.t('auth_err_empty'));
          return;
        }

        if (this.isRegisterMode) {
          await this.register(username, password);
        } else {
          await this.login(username, password);
        }
      });
    }

    // 绑定侧边栏与顶栏退出按钮
    const handleLogoutClick = () => {
      this.logout();
    };

    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogoutClick);
    }

    const headerLogoutBtn = document.getElementById('btn-header-logout');
    if (headerLogoutBtn) {
      headerLogoutBtn.addEventListener('click', handleLogoutClick);
    }
  }

  /**
   * 切换登录与注册模式
   */
  toggleMode() {
    this.isRegisterMode = !this.isRegisterMode;
    this.clearError();

    const titleEl = document.getElementById('auth-modal-title');
    const subtitleEl = document.getElementById('auth-modal-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const toggleBtn = document.getElementById('auth-toggle-mode-btn');

    if (this.isRegisterMode) {
      if (titleEl) titleEl.textContent = window.i18n.t('auth_reg_title');
      if (subtitleEl) subtitleEl.textContent = window.i18n.t('auth_reg_sub');
      if (submitBtn) submitBtn.textContent = window.i18n.t('auth_reg_btn');
      if (toggleBtn) toggleBtn.textContent = window.i18n.t('auth_reg_toggle');
    } else {
      if (titleEl) titleEl.textContent = window.i18n.t('auth_log_title');
      if (subtitleEl) subtitleEl.textContent = window.i18n.t('auth_log_sub');
      if (submitBtn) submitBtn.textContent = window.i18n.t('auth_log_btn');
      if (toggleBtn) toggleBtn.textContent = window.i18n.t('auth_log_toggle');
    }
  }

  showLoginOverlay(tipMessage = '') {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
      document.documentElement.classList.add('needs-login');
      overlay.classList.remove('hidden');
      if (tipMessage) {
        this.showError(tipMessage);
      }
    }
  }

  hideLoginOverlay() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) {
      document.documentElement.classList.remove('needs-login');
      overlay.classList.add('hidden');
      this.clearError();
      const form = document.getElementById('auth-form');
      if (form) form.reset();
    }
  }

  showError(msg) {
    const errBox = document.getElementById('auth-error-msg');
    if (errBox) {
      errBox.textContent = msg;
      errBox.classList.remove('hidden');
    }
  }

  clearError() {
    const errBox = document.getElementById('auth-error-msg');
    if (errBox) {
      errBox.textContent = '';
      errBox.classList.add('hidden');
    }
  }

  setLoading(isLoading) {
    const submitBtn = document.getElementById('auth-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = isLoading;
      submitBtn.dataset.originalText = submitBtn.dataset.originalText || submitBtn.textContent;
      if (isLoading) {
        submitBtn.textContent = window.i18n.t('auth_btn_loading');
      } else {
        submitBtn.textContent = this.isRegisterMode ? window.i18n.t('auth_reg_btn') : window.i18n.t('auth_log_btn');
      }
    }
  }

  /**
   * 判断当前登录用户是否为超级管理员
   */
  isAdmin() {
    return !!(this.currentUser && this.currentUser.role === 'admin');
  }

  /**
   * 获取当前用户角色代码 ('admin' | 'user')
   */
  getRole() {
    return this.currentUser ? (this.currentUser.role || 'user') : null;
  }

  /**
   * 刷新顶栏和侧边栏的当前用户信息展示
   */
  updateSidebarUserUI() {
    // 1. 侧边栏用户卡片
    const sidebarUserCard = document.getElementById('sidebar-user-card');
    const sidebarNameEl = document.getElementById('sidebar-username');
    const sidebarRoleEl = document.getElementById('sidebar-user-role');
    
    // 2. 顶部状态栏用户卡片
    const headerUserCard = document.getElementById('header-user-card');
    const headerNameEl = document.getElementById('header-username');
    const headerRoleEl = document.getElementById('header-user-role');

    if (this.currentUser && this.currentUser.username) {
      const uname = this.currentUser.username;
      const isAdmin = this.isAdmin();
      const roleText = isAdmin ? window.i18n.t('role_admin') : window.i18n.t('role_creator');
      const roleClass = isAdmin ? 'role-admin' : 'role-creator';

      if (sidebarUserCard && sidebarNameEl) {
        sidebarUserCard.classList.remove('hidden');
        sidebarNameEl.textContent = uname;
        if (sidebarRoleEl) {
          sidebarRoleEl.textContent = roleText;
          sidebarRoleEl.className = `user-role ${roleClass}`;
        }
      }

      if (headerUserCard && headerNameEl) {
        headerUserCard.classList.remove('hidden');
        headerNameEl.textContent = uname;
        if (headerRoleEl) {
          headerRoleEl.textContent = roleText;
          headerRoleEl.className = `header-user-role ${roleClass}`;
        }
      }
    } else {
      if (sidebarUserCard && sidebarNameEl) {
        sidebarUserCard.classList.add('hidden');
        sidebarNameEl.textContent = '';
      }

      if (headerUserCard && headerNameEl) {
        headerUserCard.classList.add('hidden');
        headerNameEl.textContent = '-';
      }
    }
  }
}

export const Auth = new AuthManager();
