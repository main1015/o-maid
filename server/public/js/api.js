// O-Maid Dashboard API 通信模块 (api.js)
// 职责：统一封装 fetch 请求、自动挂载 Token 鉴权头、拦截 401/403 异常

let tokenGetter = null;
let onUnauthorizedHandler = null;

export const Api = {
  /**
   * 注册 Token 获取器
   */
  setTokenGetter(fn) {
    tokenGetter = fn;
  },

  /**
   * 注册未授权拦截回调
   */
  setOnUnauthorized(fn) {
    onUnauthorizedHandler = fn;
  },

  /**
   * 底层统一 HTTP 请求方法
   */
  async _request(url, options = {}) {
    const headers = { ...(options.headers || {}) };

    // 如果未显式设置 Content-Type 且包含非 FormData 的 body，则默认 application/json
    if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // 动态注入 Authorization 头
    if (tokenGetter) {
      const token = tokenGetter();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    try {
      const res = await fetch(url, {
        ...options,
        headers
      });

      // 401 未授权或 403 权限过期拦截
      if (res.status === 401 || res.status === 403) {
        if (onUnauthorizedHandler) {
          onUnauthorizedHandler(res.status);
        }
      }

      const data = await res.json();
      return data;
    } catch (err) {
      console.error(`API 请求失败 [${url}]:`, err);
      throw err;
    }
  },

  // 认证相关接口
  async login(username, password) {
    return await this._request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async register(username, password) {
    return await this._request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async getMe() {
    return await this._request('/api/auth/me');
  },

  // 获取总览统计
  async getOverview() {
    return await this._request('/api/stats/overview');
  },

  // 获取所有引导任务
  async getGuides() {
    return await this._request('/api/guides/all');
  },

  // 获取引导详情
  async getGuide(id) {
    return await this._request(`/api/guides/${id}`);
  },

  // 创建引导任务
  async createGuide(data) {
    return await this._request('/api/guides', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // 删除引导任务
  async deleteGuide(id) {
    return await this._request(`/api/guides/${id}`, {
      method: 'DELETE'
    });
  },

  // 获取所有悬停提示
  async getHints() {
    return await this._request('/api/hints/all');
  },

  // 创建悬停提示
  async createHint(data) {
    return await this._request('/api/hints', {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },

  // 删除提示
  async deleteHint(id) {
    return await this._request(`/api/hints/${id}`, {
      method: 'DELETE'
    });
  },

  // 获取用户列表
  async getUsers() {
    return await this._request('/api/stats/users');
  },

  // 注册/新建用户 (管理后台添加用户，支持指定角色)
  async createUser(username, password, role = 'user') {
    return await this._request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
  },

  // 修改用户角色 (仅超级管理员)
  async updateUserRole(id, role) {
    return await this._request(`/api/auth/users/${id}/role`, {
      method: 'POST',
      body: JSON.stringify({ role })
    });
  },

  // 删除用户
  async deleteUser(id) {
    return await this._request(`/api/auth/users/${id}`, {
      method: 'DELETE'
    });
  },

  // 重置用户密码
  async resetUserPassword(id, newPassword) {
    return await this._request(`/api/auth/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword })
    });
  },

  // 获取系统与运行时信息
  async getSystemInfo() {
    return await this._request('/api/stats/system');
  }
};
