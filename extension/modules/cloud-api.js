// extension/modules/cloud-api.js
// 使用 chrome.storage.local 实现真正跨网页、跨域名的持久化共享

let cloudState = {
    token: '',
    username: '',
    apiBase: 'http://localhost:3000/api'
};

// 初始化加载全局存储
function initCloudStorage() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['o-maid-token', 'o-maid-username', 'o-maid-api-base'], (res) => {
            if (res['o-maid-token']) cloudState.token = res['o-maid-token'];
            if (res['o-maid-username']) cloudState.username = res['o-maid-username'];
            if (res['o-maid-api-base']) cloudState.apiBase = res['o-maid-api-base'];
            // 通知当前页面 UI 刷新状态
            window.dispatchEvent(new CustomEvent('o-maid-auth-changed'));
        });

        // 跨标签页监听：任何一个网页登录/注销，其他所有网页实时联动
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local') {
                if (changes['o-maid-token']) cloudState.token = changes['o-maid-token'].newValue || '';
                if (changes['o-maid-username']) cloudState.username = changes['o-maid-username'].newValue || '';
                if (changes['o-maid-api-base']) cloudState.apiBase = changes['o-maid-api-base'].newValue || 'http://localhost:3000/api';
                window.dispatchEvent(new CustomEvent('o-maid-auth-changed'));
            }
        });
    } else {
        cloudState.token = localStorage.getItem('o-maid-token') || '';
        cloudState.username = localStorage.getItem('o-maid-username') || '';
        cloudState.apiBase = localStorage.getItem('o-maid-api-base') || 'http://localhost:3000/api';
    }
}

initCloudStorage();

function saveCloudState(updates) {
    if (updates.token !== undefined) cloudState.token = updates.token;
    if (updates.username !== undefined) cloudState.username = updates.username;
    if (updates.apiBase !== undefined) cloudState.apiBase = updates.apiBase;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const payload = {};
        if (updates.token !== undefined) payload['o-maid-token'] = updates.token;
        if (updates.username !== undefined) payload['o-maid-username'] = updates.username;
        if (updates.apiBase !== undefined) payload['o-maid-api-base'] = updates.apiBase;
        chrome.storage.local.set(payload);
    } else {
        if (updates.token !== undefined) localStorage.setItem('o-maid-token', updates.token);
        if (updates.username !== undefined) localStorage.setItem('o-maid-username', updates.username);
        if (updates.apiBase !== undefined) localStorage.setItem('o-maid-api-base', updates.apiBase);
    }
}

export function getApiBase() {
    return cloudState.apiBase || 'http://localhost:3000/api';
}

export function setApiBase(url) {
    saveCloudState({ apiBase: url });
}

export function getUsername() {
    return cloudState.username || '';
}

export function getToken() {
    return cloudState.token || '';
}

export async function login(username, password) {
    try {
        const res = await fetch(`${getApiBase()}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
            const resolvedUsername = (data.user && data.user.username) || data.username || username;
            saveCloudState({
                token: data.token,
                username: resolvedUsername
            });
        }
        return data;
    } catch (err) {
        return {
            success: false,
            error: `无法连接服务器 (${getApiBase()})，请确认后端已启动且端口一致！`
        };
    }
}

export async function register(username, password) {
    try {
        const res = await fetch(`${getApiBase()}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        return await res.json();
    } catch (err) {
        return {
            success: false,
            error: `无法连接服务器 (${getApiBase()})，请确认后端已启动且端口一致！`
        };
    }
}

export function logout() {
    saveCloudState({
        token: '',
        username: ''
    });
}

function getAuthHeaders() {
    const token = getToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
    };
}

export async function fetchCloudGuides(domain) {
    const res = await fetch(`${getApiBase()}/guides?domain=${encodeURIComponent(domain)}`);
    return await res.json();
}

export async function fetchAllCloudGuides() {
    const res = await fetch(`${getApiBase()}/guides/all`, {
        headers: getAuthHeaders()
    });
    return await res.json();
}

export async function fetchCloudHints(domain) {
    const res = await fetch(`${getApiBase()}/hints?domain=${encodeURIComponent(domain)}`, {
        headers: getAuthHeaders()
    });
    return await res.json();
}

export async function fetchAllCloudHints() {
    const res = await fetch(`${getApiBase()}/hints/all`, {
        headers: getAuthHeaders()
    });
    return await res.json();
}

export async function publishGuide(guide) {
    const res = await fetch(`${getApiBase()}/guides`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(guide)
    });
    return await res.json();
}

export async function publishHint(hint) {
    const res = await fetch(`${getApiBase()}/hints`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(hint)
    });
    return await res.json();
}

export async function downloadGuide(id) {
    const res = await fetch(`${getApiBase()}/guides/${id}/download`, { method: 'POST' });
    return await res.json();
}

export async function downloadHint(id) {
    const res = await fetch(`${getApiBase()}/hints/${id}/download`, { method: 'POST' });
    return await res.json();
}

/**
 * 获取单条云端引导详情
 * @param {string} id - 云端 Guide ID
 */
export async function fetchGuideDetails(id) {
    const res = await fetch(`${getApiBase()}/guides/${encodeURIComponent(id)}`, {
        headers: getAuthHeaders()
    });
    return await res.json();
}

/**
 * 获取单条云端悬停提示详情
 * @param {string} id - 云端 Hint ID
 */
export async function fetchHintDetails(id) {
    const res = await fetch(`${getApiBase()}/hints/${encodeURIComponent(id)}`, {
        headers: getAuthHeaders()
    });
    return await res.json();
}

/**
 * 比对并获取本地已同步规则的云端最新快照
 * @param {Array} tours - 本地引导任务列表
 * @param {Array} hints - 本地悬停提示列表
 */
export async function syncCloudRules(tours = [], hints = []) {
    const syncedTours = [];
    const syncedHints = [];
    const conflicts = [];
    let updatedCount = 0;

    const targetTours = tours.filter(t => t.cloudId);
    const targetHints = hints.filter(h => h.cloudId);

    if (targetTours.length === 0 && targetHints.length === 0) {
        return { success: true, updatedCount: 0, updatedTours: [], updatedHints: [], conflicts: [] };
    }

    // 优先批量获取全部全网数据做匹配，减少单条请求开销
    const cloudGuidesMap = new Map();
    const cloudHintsMap = new Map();

    try {
        const [guidesRes, hintsRes] = await Promise.allSettled([
            fetchAllCloudGuides(),
            fetchAllCloudHints()
        ]);
        if (guidesRes.status === 'fulfilled' && guidesRes.value?.success && Array.isArray(guidesRes.value?.guides)) {
            guidesRes.value.guides.forEach(g => cloudGuidesMap.set(String(g.id), g));
        }
        if (hintsRes.status === 'fulfilled' && hintsRes.value?.success && Array.isArray(hintsRes.value?.hints)) {
            hintsRes.value.hints.forEach(h => cloudHintsMap.set(String(h.id), h));
        }
    } catch (e) {
        console.warn('O-Maid: 批量拉取云端规则异常，将自动降级单条精准拉取', e);
    }

    // 处理 Guides
    for (const t of targetTours) {
        let cloudItem = cloudGuidesMap.get(String(t.cloudId));
        if (!cloudItem) {
            try {
                const singleRes = await fetchGuideDetails(t.cloudId);
                if (singleRes && singleRes.success && singleRes.guide) {
                    cloudItem = singleRes.guide;
                }
            } catch (e) {}
        }

        if (cloudItem) {
            const stepsDiffer = JSON.stringify(t.steps || []) !== JSON.stringify(cloudItem.steps || []);
            const nameDiffer = t.name !== cloudItem.name;
            const isContentDifferent = stepsDiffer || nameDiffer;

            // 核心冲突判定：本地已有修改且云端内容与本地当前内容不一致
            if (t.isLocallyModified && isContentDifferent) {
                conflicts.push({
                    type: 'tour',
                    id: t.id,
                    cloudId: t.cloudId,
                    name: t.name,
                    author: cloudItem.author || t.author,
                    localItem: t,
                    cloudItem: cloudItem
                });
            } else {
                // 无冲突静默更新
                updatedCount++;
                syncedTours.push({
                    ...t,
                    name: cloudItem.name || t.name,
                    steps: (Array.isArray(cloudItem.steps) && cloudItem.steps.length > 0) ? cloudItem.steps : t.steps,
                    author: cloudItem.author || t.author,
                    downloads: (cloudItem.downloads !== undefined) ? cloudItem.downloads : t.downloads,
                    isSynced: true
                });
            }
        }
    }

    // 处理 Hints
    for (const h of targetHints) {
        let cloudItem = cloudHintsMap.get(String(h.cloudId));
        if (!cloudItem) {
            try {
                const singleRes = await fetchHintDetails(h.cloudId);
                if (singleRes && singleRes.success && singleRes.hint) {
                    cloudItem = singleRes.hint;
                }
            } catch (e) {}
        }

        if (cloudItem) {
            const isContentDifferent = (h.text !== cloudItem.text) || (h.selector !== cloudItem.selector);

            // 核心冲突判定：本地已有修改且云端内容与本地当前内容不一致
            if (h.isLocallyModified && isContentDifferent) {
                conflicts.push({
                    type: 'hint',
                    id: h.id,
                    cloudId: h.cloudId,
                    name: h.text ? (h.text.length > 15 ? h.text.slice(0, 15) + '...' : h.text) : '悬停提示',
                    author: cloudItem.author || h.author,
                    localItem: h,
                    cloudItem: cloudItem
                });
            } else {
                // 无冲突静默更新
                updatedCount++;
                syncedHints.push({
                    ...h,
                    text: cloudItem.text || h.text,
                    selector: cloudItem.selector || h.selector,
                    author: cloudItem.author || h.author,
                    downloads: (cloudItem.downloads !== undefined) ? cloudItem.downloads : h.downloads,
                    isSynced: true
                });
            }
        }
    }

    return {
        success: true,
        updatedCount,
        updatedTours: syncedTours,
        updatedHints: syncedHints,
        conflicts
    };
}


