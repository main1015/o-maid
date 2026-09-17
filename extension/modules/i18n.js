// modules/i18n.js

/**
 * 遍历带有 data-i18n 属性的元素，并自动填充本地化文本
 * @param {Document|Element} context 搜索的上下文根节点
 */
export function localizeHtml(context = document) {
    const elements = context.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const message = chrome.i18n.getMessage(key);
        if (message) {
            el.innerHTML = message;
        }
    });

    // 处理输入框占位符
    const placeholders = context.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const message = chrome.i18n.getMessage(key);
        if (message) {
            el.placeholder = message;
        }
    });

    // 处理 title 属性 (悬停提示)
    const titles = context.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const message = chrome.i18n.getMessage(key);
        if (message) {
            el.title = message;
        }
    });
}
