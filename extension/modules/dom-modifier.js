// modules/dom-modifier.js

/**
 * 修改元素的文本内容
 * @param {string} selector CSS选择器
 * @param {string} newText 新的文本内容
 */
export function modifyElementText(selector, newText) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = newText;
    console.log(`Modified text for: ${selector}`);
  }
}
