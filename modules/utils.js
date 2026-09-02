// modules/utils.js - 工具函数模块

/**
 * 比较两个 URL 是否匹配（忽略查询参数和哈希）
 * @param {string} url1 - 第一个 URL
 * @param {string} url2 - 第二个 URL
 * @returns {boolean} 是否匹配
 */
export function areUrlsMatching(url1, url2) {
    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);

        // 基础匹配：协议必须相同
        if (u1.protocol !== u2.protocol) return false;

        // 对于 file:// 协议，origin 通常是 "null"，所以我们比较路径
        if (u1.protocol === 'file:') {
            const p1 = decodeURI(u1.pathname).replace(/\/$/, '') || '/';
            const p2 = decodeURI(u2.pathname).replace(/\/$/, '') || '/';
            return p1 === p2;
        }

        // 对于 http/https 协议，比较 origin 和路径
        const p1 = u1.pathname.replace(/\/$/, '') || '/';
        const p2 = u2.pathname.replace(/\/$/, '') || '/';
        return u1.origin === u2.origin && p1 === p2;
    } catch (e) {
        return false;
    }
}

/**
 * 为元素生成唯一的 CSS 选择器 (支持递归 iframe 路径)
 * @param {Element} el - 目标元素
 * @returns {string} CSS 选择器
 */
export function generateSelector(el) {
    if (!el || el.nodeType !== 1) return;

    /**
     * 获取单个文档内的选择器
     */
    const getLocalSelector = (element) => {
        const path = [];
        let curr = element;
        while (curr && curr.nodeType === Node.ELEMENT_NODE) {
            let selector = curr.nodeName.toLowerCase();
            if (curr.id) {
                selector = '#' + curr.id;
                path.unshift(selector);
                break;
            } else {
                // 添加类名以增强区分度
                if (curr.classList && curr.classList.length > 0) {
                    const classes = Array.from(curr.classList)
                        .filter(c => !c.startsWith('o-maid-')) // 过滤掉插件自身的类名
                        .join('.');
                    if (classes) selector += '.' + classes;
                }

                // 始终添加索引以确保唯一性
                let sib = curr, nth = 1;
                while (sib = sib.previousElementSibling) {
                    if (sib.nodeName.toLowerCase() == curr.nodeName.toLowerCase())
                        nth++;
                }
                selector += `:nth-of-type(${nth})`;
            }
            path.unshift(selector);
            curr = curr.parentNode;
        }
        return path.join(' > ');
    };

    let fullPath = getLocalSelector(el);
    let currDoc = el.ownerDocument;

    // 递归向上查找 iframe 路径
    try {
        while (currDoc && currDoc.defaultView && currDoc.defaultView.frameElement) {
            const iframe = currDoc.defaultView.frameElement;
            const iframeSelector = getLocalSelector(iframe);
            fullPath = iframeSelector + ' >>> ' + fullPath;
            currDoc = iframe.ownerDocument;
        }
    } catch (e) {
        console.warn('O-Maid: 无法获取跨域 iframe 的父级路径');
    }

    return fullPath;
}

/**
 * 获取元素相对于顶层页面的绝对坐标 (累加 iframe 偏移)
 * @param {Element} el - 目标元素
 * @returns {Object} { top, left, width, height }
 */
export function getElementOffset(el) {
    if (!el) return { top: 0, left: 0, width: 0, height: 0 };

    const rect = el.getBoundingClientRect();
    let top = rect.top;
    let left = rect.left;

    let currWin = el.ownerDocument.defaultView;
    try {
        // 递归向上累加 iframe 偏移
        while (currWin && currWin !== window.top) {
            const iframe = currWin.frameElement;
            if (!iframe) break;

            const iframeRect = iframe.getBoundingClientRect();
            const style = currWin.parent.getComputedStyle(iframe);

            // 累加 iframe 相对于其父窗口视口的偏移
            // getBoundingClientRect 已经包含了父窗口的滚动，所以直接累加即可
            // 还需要加上 iframe 的边框宽度
            top += iframeRect.top + parseFloat(style.borderTopWidth || 0);
            left += iframeRect.left + parseFloat(style.borderLeftWidth || 0);

            currWin = currWin.parent;
        }
    } catch (e) {
        console.warn('O-Maid: 坐标计算受跨域限制，可能存在偏移');
    }

    // 加上页面的滚动偏移，得到相对于整个文档的绝对坐标
    const docEl = document.documentElement;
    const body = document.body;
    const scrollTop = window.pageYOffset || docEl.scrollTop || body.scrollTop;
    const scrollLeft = window.pageXOffset || docEl.scrollLeft || body.scrollLeft;
    const clientTop = docEl.clientTop || body.clientTop || 0;
    const clientLeft = docEl.clientLeft || body.clientLeft || 0;

    return {
        top: top + scrollTop - clientTop,
        left: left + scrollLeft - clientLeft,
        width: rect.width,
        height: rect.height
    };
}

/**
 * 创建或更新一个代理元素，用于解决 Intro.js 在 iframe 中的定位问题
 * @param {Element} targetEl - 目标元素 (可能在 iframe 中)
 * @returns {Element} 代理元素 (在顶层 document 中)
 */
export function getProxyElement(targetEl) {
    if (!targetEl) return null;

    // 如果元素就在顶层 document，直接返回
    if (targetEl.ownerDocument === document) return targetEl;

    let proxy = document.getElementById('o-maid-proxy-element');
    if (!proxy) {
        proxy = document.createElement('div');
        proxy.id = 'o-maid-proxy-element';
        proxy.style.position = 'absolute';
        proxy.style.pointerEvents = 'none';
        proxy.style.zIndex = '2147483647';
        proxy.style.display = 'none';
        document.body.appendChild(proxy);
    }

    const offset = getElementOffset(targetEl);
    proxy.style.top = `${offset.top}px`;
    proxy.style.left = `${offset.left}px`;
    proxy.style.width = `${offset.width}px`;
    proxy.style.height = `${offset.height}px`;
    proxy.style.display = 'block';

    return proxy;
}

/**
 * 深度查询单个元素 (支持 >>> 穿透 iframe)
 * @param {string} selector - CSS 选择器
 * @param {Document|Element} root - 起始根节点
 * @returns {Element|null} 匹配的元素
 */
export function querySelectorDeep(selector, root = document) {
    if (!selector) return null;
    if (!selector.includes(' >>> ')) return root.querySelector(selector);

    const parts = selector.split(' >>> ');
    let currentRoot = root;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        if (!part) continue;

        const found = currentRoot.querySelector(part);
        if (!found) return null;

        if (i < parts.length - 1) {
            if (found.tagName === 'IFRAME' && found.contentDocument) {
                currentRoot = found.contentDocument;
            } else {
                return null;
            }
        } else {
            return found;
        }
    }
    return null;
}

/**
 * 深度查询所有匹配元素 (支持 >>> 穿透 iframe)
 * @param {string} selector - CSS 选择器
 * @param {Document|Element} root - 起始根节点
 * @param {boolean} quiet - 是否静默模式（不输出警告日志）
 * @returns {Array<Element>} 匹配的元素数组
 */
export function querySelectorAllDeep(selector, root = document, quiet = false) {
    if (!selector) return [];
    if (!selector.includes(' >>> ')) return Array.from(root.querySelectorAll(selector));

    const parts = selector.split(' >>> ');
    const lastPart = parts.pop().trim();
    let currentRoots = [root];

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        const nextRoots = [];
        for (const r of currentRoots) {
            const iframes = r.querySelectorAll(part);
            for (const iframe of iframes) {
                if (iframe.tagName === 'IFRAME' && iframe.contentDocument) {
                    nextRoots.push(iframe.contentDocument);
                }
            }
        }

        if (nextRoots.length === 0) {
            if (!quiet) console.warn(`O-Maid: [DeepQuery] Failed to find iframe at part ${i}: "${part}"`);
            return [];
        }
        currentRoots = nextRoots;
    }

    const results = [];
    for (const r of currentRoots) {
        const elements = r.querySelectorAll(lastPart);
        results.push(...Array.from(elements));
    }
    return results;
}

/**
 * 生成唯一 ID
 */
export function generateUniqueId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
}

/**
 * 为 URL 添加任务锚标记
 * @param {string} url - 原始 URL
 * @param {string} tourId - 任务 ID
 * @param {number} step - 步骤编号
 * @returns {string} 带有锚标记的 URL
 */
export function appendTourHash(url, tourId, step) {
    if (!url) return url;
    try {
        const u = new URL(url);
        // 如果原本就有 hash，我们需要合并或者替换
        let hash = u.hash || '#';
        if (hash.includes('o-maid-tour=')) {
            // 简单替换旧的标记
            hash = hash.replace(/o-maid-tour=[^&]+/, `o-maid-tour=${tourId}`);
            if (hash.includes('step=')) {
                hash = hash.replace(/step=\d+/, `step=${step}`);
            } else {
                hash += `&step=${step}`;
            }
        } else {
            // 附加新的标记
            const prefix = hash.length > 1 ? '&' : '';
            hash += `${prefix}o-maid-tour=${tourId}&step=${step}`;
        }
        u.hash = hash;
        return u.toString();
    } catch (e) {
        // 如果 URL 格式不规范（如只是路径），做简单的字符串拼接
        const connector = url.includes('#') ? '&' : '#';
        return `${url}${connector}o-maid-tour=${tourId}&step=${step}`;
    }
}

/**
 * 移除 URL 中的任务锚标记
 * @param {string} url - 带有锚标记的 URL
 * @returns {string} 清理后的 URL
 */
export function stripTourHash(url) {
    if (!url) return url;
    try {
        const u = new URL(url);
        let hash = u.hash;
        if (hash) {
            // 移除 o-maid-tour={...} 和 step={\d+}
            // 模式 1: #o-maid-tour=...&step=...
            // 模式 2: #...&o-maid-tour=...&step=...
            hash = hash.replace(/o-maid-tour=[^&]+&?/, '');
            hash = hash.replace(/step=\d+&?/, '');

            // 清理末尾可能残留的 & 或仅剩的 #
            hash = hash.replace(/[&?]$/, '');
            if (hash === '#' || hash === '') {
                u.hash = '';
            } else {
                u.hash = hash;
            }
        }
        return u.toString();
    } catch (e) {
        // 如果不是标准 URL，做简单的正则替换
        return url.replace(/[#&]o-maid-tour=[^&]+/, '').replace(/[#&]step=\d+/, '').replace(/#$/, '');
    }
}
