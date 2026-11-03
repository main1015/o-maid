// modules/hover-hints.js - 悬停提示功能模块

import { areUrlsMatching, querySelectorAllDeep, getElementOffset } from './utils.js';

let hoverTooltip = null;
// 用于跟踪已绑定的元素，避免重复绑定监听器
const boundElements = new WeakMap();
let currentHints = [];
let observer = null;

/**
 * 创建悬停提示元素
 */
export function createHoverTooltip() {
    // 检查是否在 Shadow DOM 中已经存在
    const uiHost = document.getElementById('o-maid-ui-host');
    if (!uiHost || !uiHost.shadowRoot) {
        // 如果没有宿主，回退到 document.body (虽然不推荐，但为了兼容性)
        if (document.getElementById('o-maid-hover-tooltip')) {
            hoverTooltip = document.getElementById('o-maid-hover-tooltip');
            return;
        }
        hoverTooltip = document.createElement('div');
        hoverTooltip.id = 'o-maid-hover-tooltip';
        document.body.appendChild(hoverTooltip);
        return;
    }

    const shadowRoot = uiHost.shadowRoot;
    if (shadowRoot.getElementById('o-maid-hover-tooltip')) {
        hoverTooltip = shadowRoot.getElementById('o-maid-hover-tooltip');
        return;
    }

    hoverTooltip = document.createElement('div');
    hoverTooltip.id = 'o-maid-hover-tooltip';
    shadowRoot.appendChild(hoverTooltip);
}

/**
 * 初始化悬停提示并启动监听
 * @param {Array} hints - 提示数组
 */
export function initHoverHints(hints) {
    currentHints = hints;
    if (!hoverTooltip) createHoverTooltip();

    applyHints();

    // 启动 MutationObserver 监听动态添加的元素
    if (!observer) {
        observer = new MutationObserver(() => {
            applyHints();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
}

let activeSelectors = new Map(); // hintId -> selector

/**
 * 将提示应用到当前页面的元素上
 */
function applyHints() {
    const pageUrl = window.location.href;
    const relevantHints = currentHints.filter(hint => areUrlsMatching(hint.url, pageUrl));
    const currentHintIds = new Set(relevantHints.map(h => h.id));

    // 1. 清理已删除的提示
    for (const [hintId, selector] of activeSelectors.entries()) {
        if (!currentHintIds.has(hintId)) {
            const elements = querySelectorAllDeep(selector);
            elements.forEach(el => {
                const boundInfo = boundElements.get(el);
                if (boundInfo && boundInfo.id === hintId) {
                    el.classList.remove('o-maid-hint-target-highlight');
                    el.removeEventListener('mouseenter', boundInfo.showFn);
                    el.removeEventListener('mouseleave', boundInfo.hideFn);
                    boundElements.delete(el);
                }
            });
            activeSelectors.delete(hintId);
        }
    }

    // 2. 应用/更新当前提示
    relevantHints.forEach(hint => {
        activeSelectors.set(hint.id, hint.selector);
        const elements = querySelectorAllDeep(hint.selector);
        elements.forEach(el => {
            // 检查是否已经绑定过该提示 (且内容未变)
            const boundInfo = boundElements.get(el);
            if (boundInfo && boundInfo.id === hint.id && boundInfo.text === hint.text) {
                return;
            }

            const showHint = (e) => {
                el.classList.add('o-maid-hint-target-highlight');
                hoverTooltip.innerHTML = hint.text;
                hoverTooltip.style.display = 'block';

                const offset = getElementOffset(el);
                const rect = el.getBoundingClientRect();
                const tooltipHeight = hoverTooltip.offsetHeight;
                const tooltipWidth = hoverTooltip.offsetWidth;

                // 如果在 Shadow DOM 中使用 fixed 定位，需要考虑滚动
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

                let left = offset.left - scrollLeft;
                let top = offset.top - scrollTop + offset.height + 10;

                // 检测下方空间是否足够 (考虑视口高度)
                const spaceBelow = window.innerHeight - (rect.bottom);
                if (spaceBelow < tooltipHeight + 15 && (rect.top > tooltipHeight + 15)) {
                    // 下方空间不足且上方空间充足，则显示在上方
                    top = offset.top - scrollTop - tooltipHeight - 10;
                }

                // 防止右侧溢出
                if (left + tooltipWidth > window.innerWidth - 10) {
                    left = window.innerWidth - tooltipWidth - 10;
                }

                // 防止左侧溢出
                if (left < 10) left = 10;

                hoverTooltip.style.left = `${left}px`;
                hoverTooltip.style.top = `${top}px`;
            };

            const hideHint = () => {
                el.classList.remove('o-maid-hint-target-highlight');
                hoverTooltip.style.display = 'none';
            };

            // 如果已经绑定过但内容变了，移除旧监听器并清除可能存在的高亮
            if (boundInfo) {
                el.classList.remove('o-maid-hint-target-highlight');
                el.removeEventListener('mouseenter', boundInfo.showFn);
                el.removeEventListener('mouseleave', boundInfo.hideFn);
            }

            el.addEventListener('mouseenter', showHint);
            el.addEventListener('mouseleave', hideHint);

            // 记录绑定状态和函数引用
            boundElements.set(el, {
                id: hint.id,
                text: hint.text,
                showFn: showHint,
                hideFn: hideHint
            });
        });
    });
}

/**
 * 获取悬停提示元素
 * @returns {HTMLElement} 悬停提示元素
 */
export function getHoverTooltip() {
    return hoverTooltip;
}
