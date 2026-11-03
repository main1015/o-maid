// modules/highlighter.js

/**
 * 根据选择器高亮页面上的元素
 * @param {string} selector CSS选择器
 */
export function highlightElement(selector) {
  const element = document.querySelector(selector);
  if (element) {
    element.style.border = '2px solid red';
    console.log(`Highlighted: ${selector}`);
  }
}
