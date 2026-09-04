// modules/element-selector.js - 元素选择功能模块 (递归 Iframe 绑定方案)

import { generateSelector } from './utils.js';
import { broadcastStartSelection, broadcastStopSelection, elementSelectedInFrame } from './communication.js';

let selectionContext = null;
let selectionCallback = null;
let lastHoveredElement = null;

// 用于跟踪哪些文档已经注入了样式
const injectedDocuments = new Set();
// 用于跟踪哪些文档已经绑定了事件 (避免重复绑定)
const boundDocuments = new Set();

/**
 * 向指定文档注入高亮样式
 * @param {Document} doc - 目标文档对象
 */
function injectHighlightStyle(doc) {
    if (!doc || injectedDocuments.has(doc)) return;

    try {
        const styleId = 'o-maid-dynamic-highlight-style';
        if (doc.getElementById(styleId)) {
            injectedDocuments.add(doc);
            return;
        }

        const style = doc.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .o-maid-selection-highlight {
                outline: 2px solid #007bff !important;
                outline-offset: -2px !important;
                background-color: rgba(0, 123, 255, 0.2) !important;
                transition: outline 0.1s ease, background-color 0.1s ease !important;
                cursor: crosshair !important;
            }
        `;
        (doc.head || doc.documentElement).appendChild(style);
        injectedDocuments.add(doc);
        console.log('O-Maid: 已向文档注入高亮样式', doc.location.href);
    } catch (e) {
        console.error('O-Maid: 样式注入失败', e);
    }
}

/**
 * 严格判断事件是否发生在插件面板或提示条自身内部（支持 Shadow DOM 穿透）
 */
function isEventInsidePanel(e) {
    if (!e) return false;
    const target = e.target;
    if (target) {
        if (target.id === 'o-maid-ui-host' || target.closest?.('#o-maid-ui-host')) return true;
        if (target.id === 'o-maid-panel' || target.closest?.('#o-maid-panel')) return true;
        if (target.id === 'o-maid-selection-banner' || target.closest?.('#o-maid-selection-banner')) return true;
    }
    if (typeof e.composedPath === 'function') {
        const path = e.composedPath();
        for (const node of path) {
            if (node && (node.id === 'o-maid-ui-host' || node.id === 'o-maid-panel' || node.id === 'o-maid-selection-banner')) {
                return true;
            }
        }
    }
    return false;
}

let selectionBanner = null;

function showSelectionBanner() {
    if (selectionBanner || window.self !== window.top) return;
    selectionBanner = document.createElement('div');
    selectionBanner.id = 'o-maid-selection-banner';
    selectionBanner.innerHTML = `🎯 <strong>正在选择元素</strong>：请在页面上点击目标元素 &nbsp;<span style="opacity:0.85; font-size:11px; background:rgba(255,255,255,0.25); padding:2px 7px; border-radius:4px; margin-left:6px; cursor:pointer;" id="o-maid-banner-esc-btn">按 ESC 退出</span>`;
    selectionBanner.style.cssText = `
        position: fixed;
        top: 14px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #1e293b, #334155);
        color: #fff;
        padding: 8px 18px;
        border-radius: 20px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        z-index: 2147483647;
        pointer-events: auto;
        display: flex;
        align-items: center;
        border: 1px solid rgba(255,255,255,0.2);
    `;
    document.body.appendChild(selectionBanner);
    selectionBanner.querySelector('#o-maid-banner-esc-btn')?.addEventListener('click', () => {
        stopSelectionMode();
    });
}

function hideSelectionBanner() {
    const banners = document.querySelectorAll('#o-maid-selection-banner');
    banners.forEach(b => b.remove());
    selectionBanner = null;
}

function handleKeyDown(e) {
    if (e.key === 'Escape' || e.keyCode === 27) {
        console.log('O-Maid: 用户按下 ESC 键退出选择模式');
        stopSelectionMode();
    }
}

/**
 * 彻底解绑所有文档的所有事件监听
 */
function clearAllEvents() {
    for (const doc of boundDocuments) {
        try {
            doc.removeEventListener('mouseover', highlightElementForSelection, true);
            doc.removeEventListener('mouseover', highlightElementForSelection, false);
            doc.removeEventListener('mouseout', removeHighlightFromElement, true);
            doc.removeEventListener('mouseout', removeHighlightFromElement, false);
            doc.removeEventListener('click', selectElementForAction, true);
            doc.removeEventListener('click', selectElementForAction, false);
            doc.removeEventListener('keydown', handleKeyDown, true);
            doc.removeEventListener('keydown', handleKeyDown, false);
        } catch (e) { }
    }
    boundDocuments.clear();

    try {
        document.removeEventListener('mouseover', highlightElementForSelection, true);
        document.removeEventListener('mouseover', highlightElementForSelection, false);
        document.removeEventListener('mouseout', removeHighlightFromElement, true);
        document.removeEventListener('mouseout', removeHighlightFromElement, false);
        document.removeEventListener('click', selectElementForAction, true);
        document.removeEventListener('click', selectElementForAction, false);
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('keydown', handleKeyDown, false);
    } catch (e) { }
}

/**
 * 给指定文档绑定或解绑事件
 * @param {Document} doc - 目标文档
 * @param {boolean} bind - true 为绑定，false 为解绑
 */
function bindEventsToDoc(doc, bind) {
    if (!doc) return;

    if (bind) {
        if (boundDocuments.has(doc)) return;
        doc.addEventListener('mouseover', highlightElementForSelection, true);
        doc.addEventListener('mouseout', removeHighlightFromElement, true);
        doc.addEventListener('click', selectElementForAction, true);
        doc.addEventListener('keydown', handleKeyDown, true);
        boundDocuments.add(doc);
    } else {
        try {
            doc.removeEventListener('mouseover', highlightElementForSelection, true);
            doc.removeEventListener('mouseout', removeHighlightFromElement, true);
            doc.removeEventListener('click', selectElementForAction, true);
            doc.removeEventListener('keydown', handleKeyDown, true);
        } catch(e){}
        boundDocuments.delete(doc);
    }
}

/**
 * 递归初始化所有同源 iframe
 * @param {Document} doc - 起始文档
 * @param {boolean} bind - true 为绑定，false 为解绑
 */
function initRecursive(doc, bind) {
    if (!doc) return;

    // 1. 绑定当前文档
    bindEventsToDoc(doc, bind);

    // 2. 递归处理 iframe
    try {
        const iframes = doc.querySelectorAll('iframe');
        for (const iframe of iframes) {
            try {
                // 仅处理同源 iframe
                const innerDoc = iframe.contentDocument;
                if (innerDoc) {
                    initRecursive(innerDoc, bind);
                }
            } catch (e) {
                // 跨域 iframe 会在此报错，优雅跳过
                console.warn('O-Maid: 无法访问跨域 iframe', iframe.src);
            }
        }
    } catch (e) {
        console.error('O-Maid: 递归遍历失败', e);
    }
}

/**
 * 从所有已注入样式的文档中移除样式
 */
function clearAllInjectedStyles() {
    for (const doc of injectedDocuments) {
        try {
            const style = doc.getElementById('o-maid-dynamic-highlight-style');
            if (style) style.remove();
        } catch (e) { }
    }
    injectedDocuments.clear();

    try {
        const s = document.getElementById('o-maid-dynamic-highlight-style');
        if (s) s.remove();
    } catch(e){}
}

let isSelecting = false;

/**
 * 开始选择模式
 * @param {Object} context - 选择上下文
 * @param {Function} callback - 选择回调
 */
export function startSelectionMode(context, callback) {
    if (isSelecting && selectionCallback === callback && selectionContext === context) {
        return;
    }
    isSelecting = true;

    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 进入选择模式`);

    if (context) selectionContext = context;
    if (callback) selectionCallback = callback;

    if (isTop) {
        showSelectionBanner();
    }

    // 1. 注入样式
    injectHighlightStyle(document);

    // 2. 递归绑定事件
    initRecursive(document, true);
}

/**
 * 停止选择模式
 * @param {boolean} keepContext - 是否保留上下文
 */
export function stopSelectionMode(keepContext = false) {
    // 1. 立即强制清除所有横幅
    hideSelectionBanner();

    // 2. 立即彻底清除所有高亮类名
    try {
        document.querySelectorAll('.o-maid-selection-highlight').forEach(el => {
            el.classList.remove('o-maid-selection-highlight');
        });
    } catch(e){}

    // 3. 彻底解绑所有事件监听
    clearAllEvents();

    // 4. 清理样式
    clearAllInjectedStyles();

    lastHoveredElement = null;

    if (!isSelecting) return;
    isSelecting = false;

    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 彻底退出选择模式`);

    if (!keepContext) {
        selectionContext = null;
        selectionCallback = null;
    }
}

/**
 * 鼠标移入：添加高亮类
 */
export function highlightElementForSelection(e) {
    // 忽略面板内部与提示条自身的任何事件
    if (isEventInsidePanel(e)) {
        return;
    }

    const isTop = window.self === window.top;
    const target = e.target;
    const tagName = target.tagName ? target.tagName.toUpperCase() : '';

    // 在 top frame 中，忽略 iframe 标签本身的高亮，让事件穿透
    if (tagName === 'IFRAME') {
        return;
    }

    // 忽略 html 和 body
    if (tagName === 'HTML' || tagName === 'BODY') {
        return;
    }

    // 确保目标元素所属的文档已注入样式
    const targetDoc = target.ownerDocument;
    if (targetDoc && !injectedDocuments.has(targetDoc)) {
        injectHighlightStyle(targetDoc);
    }

    // 移除旧的高亮
    if (lastHoveredElement && lastHoveredElement !== target) {
        try {
            lastHoveredElement.classList.remove('o-maid-selection-highlight');
        } catch (e) { }
    }

    // 添加新的高亮
    lastHoveredElement = target;
    try {
        lastHoveredElement.classList.add('o-maid-selection-highlight');
    } catch (e) { }
}

/**
 * 鼠标移出：移除高亮类
 */
function removeHighlightFromElement(e) {
    if (e.target && e.target.classList) {
        try {
            e.target.classList.remove('o-maid-selection-highlight');
        } catch (e) { }
    }
    if (lastHoveredElement === e.target) {
        lastHoveredElement = null;
    }
}

/**
 * 更新高亮位置 (保持接口兼容)
 */
export function updateHighlightPosition() { }

/**
 * 处理来自 Iframe 的更新 (保持接口兼容)
 */
export function handleIframeHighlightUpdate() { }

/**
 * 选择操作
 */
export function selectElementForAction(e) {
    // 绝对忽略面板自身与提示条的点击，防止误选面板或吞掉按钮事件
    if (isEventInsidePanel(e)) {
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    const target = e.target;
    const targetDoc = target.ownerDocument;
    const isInsideIframe = targetDoc !== document;

    // 生成选择器 (现在包含 iframe 路径)
    const selector = generateSelector(target);

    // 获取正确的 URL
    let targetUrl = window.location.href;
    try {
        // 【核心修复】如果选择器包含 ' >>> '，说明是跨 frame 选择。
        // 我们强制将其 URL 归属到顶层页面，这样它就能在主面板列表中显示。
        if (selector.includes(' >>> ')) {
            targetUrl = window.top.location.href;
        } else if (isInsideIframe) {
            targetUrl = targetDoc.location.href;
        }
    } catch (e) {
        console.warn('O-Maid: 访问顶层 URL 受限，使用当前页面 URL', e);
        targetUrl = isInsideIframe ? targetDoc.location.href : window.location.href;
    }

    console.log('O-Maid: 元素已选择 (稳健版)', { selector, targetUrl, isInsideIframe });

    const savedContext = selectionContext;
    const savedCallback = selectionCallback;

    // 停止选择模式
    // 如果是在 iframe 内部脚本运行，则需要通知其他 frame
    stopSelectionMode(isInsideIframe && window.self !== window.top);

    if (window.self === window.top) {
        // 如果是在顶层脚本中捕获的（无论是主页还是同源 iframe 内部）
        if (savedCallback && savedContext) {
            savedCallback(selector, targetUrl, savedContext);
        }
    } else {
        // 如果是在 iframe 内部脚本中捕获的
        elementSelectedInFrame(selector, targetUrl);
    }
}

/**
 * 处理元素选择
 */
export function handleElementSelection(selector, url) {
    if (!selectionContext) return;
    if (selectionCallback) {
        selectionCallback(selector, url, selectionContext);
    }
    selectionContext = null;
    selectionCallback = null;
}
