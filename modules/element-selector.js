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
 * 给指定文档绑定或解绑事件
 * @param {Document} doc - 目标文档
 * @param {boolean} bind - true 为绑定，false 为解绑
 */
function bindEventsToDoc(doc, bind) {
    if (!doc) return;

    if (bind) {
        if (boundDocuments.has(doc)) return;
        doc.addEventListener('mouseover', highlightElementForSelection);
        doc.addEventListener('mouseout', removeHighlightFromElement);
        doc.addEventListener('click', selectElementForAction, { capture: true });
        boundDocuments.add(doc);
    } else {
        doc.removeEventListener('mouseover', highlightElementForSelection);
        doc.removeEventListener('mouseout', removeHighlightFromElement);
        doc.removeEventListener('click', selectElementForAction, { capture: true });
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
}

let isSelecting = false;

/**
 * 开始选择模式
 * @param {Object} context - 选择上下文
 * @param {Function} callback - 选择回调
 * @param {boolean} isFromMessage - 是否是由消息触发的 (防止死循环)
 */
export function startSelectionMode(context, callback, isFromMessage = false) {
    if (isSelecting) return;
    isSelecting = true;

    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 进入选择模式, FromMessage: ${isFromMessage}`);

    if (context) selectionContext = context;
    if (callback) selectionCallback = callback;

    // 1. 初始注入当前文档样式
    injectHighlightStyle(document);

    // 2. 递归绑定所有同源 iframe 的事件
    initRecursive(document, true);

    // 3. 只有非消息触发的调用才发起广播 (双重保险)
    if (!isFromMessage) {
        broadcastStartSelection();
    }
}

/**
 * 停止选择模式
 * @param {boolean} keepContext - 是否保留上下文
 * @param {boolean} isFromMessage - 是否是由消息触发的
 */
export function stopSelectionMode(keepContext = false, isFromMessage = false) {
    if (!isSelecting) return;
    isSelecting = false;

    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 退出选择模式, FromMessage: ${isFromMessage}`);

    // 1. 递归解绑所有事件
    initRecursive(document, false);

    // 2. 清理样式
    clearAllInjectedStyles();

    // 3. 清理最后一个高亮元素
    if (lastHoveredElement) {
        try {
            lastHoveredElement.classList.remove('o-maid-selection-highlight');
        } catch (e) { }
        lastHoveredElement = null;
    }

    if (!keepContext) {
        selectionContext = null;
        selectionCallback = null;
    }

    // 4. 只有非消息触发的调用才发起广播
    if (!isFromMessage) {
        broadcastStopSelection(keepContext);
    }
}

/**
 * 鼠标移入：添加高亮类
 */
export function highlightElementForSelection(e) {
    const isTop = window.self === window.top;
    const target = e.target;
    const tagName = target.tagName ? target.tagName.toUpperCase() : '';

    // 忽略面板
    if (target.closest('#o-maid-panel') || target.id === 'o-maid-panel') {
        return;
    }

    // 在 top frame 中，忽略 iframe 标签本身的高亮，让事件穿透
    // 注意：在递归绑定方案下，鼠标进入 iframe 内部后，事件会由内部 doc 触发
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
    // 忽略面板点击
    if (e.target.closest('#o-maid-panel') || e.target.id === 'o-maid-panel') {
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
