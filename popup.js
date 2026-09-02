// popup.js

document.getElementById('toggle-panel-btn').addEventListener('click', () => {
  // 获取当前活动的标签页
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const activeTab = tabs[0];
    // 向 content.js 发送消息，通知其切换面板显示状态
    chrome.tabs.sendMessage(activeTab.id, { action: 'togglePanel' }, (response) => {
      if (chrome.runtime.lastError) {
        console.warn("无法发送消息到 content script: " + chrome.runtime.lastError.message);
      } else {
        if(response) console.log(response.status);
      }
    });
    // 发送消息后立即关闭弹窗
    window.close();
  });
});