import { localizeHtml, initI18n, getSupportedLocales, getCurrentLocale, setLocale } from './modules/i18n.js';
import { initLogger, setLoggingEnabled } from './modules/logger.js';

// 初始化多语言与日志管控
async function init() {
  await initI18n();
  localizeHtml();
  await initLogger();
  setupLanguageSelector();
}

function setupLanguageSelector() {
  const langSelect = document.getElementById('popup-language-select');
  if (!langSelect) return;

  const renderOptions = () => {
    langSelect.innerHTML = getSupportedLocales().map(loc =>
      `<option value="${loc.code}" ${loc.code === getCurrentLocale() ? 'selected' : ''}>${loc.name}</option>`
    ).join('');
    langSelect.value = getCurrentLocale();
  };

  renderOptions();

  langSelect.addEventListener('change', async (e) => {
    await setLocale(e.target.value);
    renderOptions();
    localizeHtml();
  });

  chrome.storage?.onChanged?.addListener((changes, areaName) => {
    if (areaName === 'local' && 'user_locale' in changes) {
      renderOptions();
      localizeHtml();
    }
  });
}

init();

const toggleBtn = document.getElementById('toggle-panel-btn');
const statusTip = document.getElementById('status-tip');
const reloadBtn = document.getElementById('reload-tab-btn');
const debugLogCheckbox = document.getElementById('popup-debug-log');

// 回显与监听调试日志开关
if (debugLogCheckbox) {
  chrome.storage.local.get('enable_debug_log', (res) => {
    debugLogCheckbox.checked = !!res.enable_debug_log;
  });

  debugLogCheckbox.addEventListener('change', (e) => {
    setLoggingEnabled(e.target.checked);
  });
}

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
        const _errMsg = chrome.runtime.lastError.message;
        console.debug("无法连接当前页面的助手脚本:", _errMsg);
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