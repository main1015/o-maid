// popup.js
import { localizeHtml } from './modules/i18n.js';

// 初始化本地化
localizeHtml();

const toggleBtn = document.getElementById('toggle-panel-btn');
const statusTip = document.getElementById('status-tip');
const reloadBtn = document.getElementById('reload-tab-btn');

toggleBtn.addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    if (!activeTab || !activeTab.id) return;

    // 检查特殊浏览器系统页面 (chrome://, edge://, about:)
    if (activeTab.url && (activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('edge://') || activeTab.url.startsWith('about:'))) {
      if (statusTip) {
        statusTip.style.display = 'block';
        statusTip.innerHTML = chrome.i18n.getMessage('popupSystemPageError');
      }
      return;
    }

    // 向网页中的 content.js 发送呼出命令
    chrome.tabs.sendMessage(activeTab.id, { action: 'togglePanel' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("无法连接当前页面的助手脚本:", chrome.runtime.lastError.message);
        // 说明扩展刚刚重载过或页面尚未载入脚本
        if (statusTip) {
          statusTip.style.display = 'block';
        }
      } else {
        window.close();
      }
    });
  });
});

if (reloadBtn) {
  reloadBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id) {
        chrome.tabs.reload(tabs[0].id, () => {
          window.close();
        });
      }
    });
  });
}