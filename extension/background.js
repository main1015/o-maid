// background.js - O-Maid 后台服务工作者

import * as StorageAPI from './modules/storage-api.js';

// -----------------------------------------------------------------------------
// I. 核心扩展逻辑
// -----------------------------------------------------------------------------

const tabPorts = {}; // 跟踪所有内容脚本连接
let activeTours = {}; // { [tabId]: { tourId: string, currentStep: number } }
let tourNavigatingState = null; // { tourId: string, currentStep: number, targetUrl: string } - 记录正在跨页面跳转的任务

/**
 * 监听来自内容脚本的连接
 */
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'o-maid-content') return;

  const tabId = port.sender.tab.id;
  const frameUrl = port.sender.url;
  const isTop = port.sender.frameId === 0;

  console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 连接已建立, TabID: ${tabId}, URL: ${frameUrl}`);

  port.onDisconnect.addListener(() => {
    // 强制消费 lastError，彻底消除 BFCache 导致 Unchecked runtime.lastError 报警
    if (chrome.runtime.lastError) {
      console.log('O-Maid: [BG] Port 连接断开已捕获:', chrome.runtime.lastError.message);
    }

    if (tabPorts[tabId]) {
      tabPorts[tabId] = tabPorts[tabId].filter(p => p.port !== port);
      if (tabPorts[tabId].length === 0) {
        delete tabPorts[tabId];
        if (activeTours[tabId]) {
          delete activeTours[tabId];
        }
      }
    }
  });
});

/**
 * 监听标签页更新以恢复多页面任务
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    let tourToResume = activeTours[tabId];

    // 如果当前标签页没有记录，但在全局导航状态中匹配到了 URL
    if (!tourToResume && tourNavigatingState && tab.url && tab.url.includes(tourNavigatingState.targetUrl)) {
      console.log(`O-Maid: [BG] New tab ${tabId} matches navigating tour. Resuming...`);
      tourToResume = { tourId: tourNavigatingState.tourId, currentStep: tourNavigatingState.currentStep };
      activeTours[tabId] = tourToResume;
      tourNavigatingState = null; // 消耗掉该状态
    }

    if (tourToResume) {
      const { tourId, currentStep } = tourToResume;
      console.log(`Tab ${tabId} updated/ready. Resuming tour ${tourId} at step ${currentStep}`);

      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          action: 'resumeTour',
          tourId: tourId,
          startStep: currentStep
        }).catch(() => { });
      }, 800); // 增加一点点延迟，确保 content.js 初始化完成
    }
  }
});

/**
 * 向标签页的所有 frame 广播消息
 */
function broadcastToTab(tabId, message) {
  if (!tabId) return;

  if (tabPorts[tabId]) {
    tabPorts[tabId].forEach(p => {
      try {
        p.port.postMessage(message);
      } catch (e) { }
    });
  }

  chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
    if (chrome.runtime.lastError || !frames) return;
    frames.forEach(frame => {
      chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId }).catch(() => { });
    });
  });
}

/**
 * 安装/更新时的处理
 */
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    StorageAPI.loadDefaultRules();
  } else if (details.reason === 'update') {
    StorageAPI.migrateOldData();
  }
});

// -----------------------------------------------------------------------------
// II. 消息处理
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;
  console.log('O-Maid: [BG] 收到消息:', request.action, request);

  try {
    // 请求当前标签页数据
    if (request.action === 'getDataForTab') {
      StorageAPI.getDataForTab(sendResponse);
    }
    // 广播消息
    else if (request.action === 'broadcastStartSelection' || request.action === 'broadcastStopSelection') {
      let targetAction = request.action === 'broadcastStartSelection' ? 'startSelection' : 'stopSelection';
      broadcastToTab(tabId, { action: targetAction, keepContext: request.keepContext });
      sendResponse({ success: true });
    }
    // 任务状态管理
    else if (request.action === 'startTourState') {
      if (tabId) activeTours[tabId] = { tourId: request.tourId, currentStep: request.startStep || 1 };
      sendResponse({ success: true });
    }
    else if (request.action === 'stopTourState') {
      if (tabId && activeTours[tabId]) delete activeTours[tabId];
      sendResponse({ success: true });
    }
    else if (request.action === 'proceedToNextStep') {
      if (tabId && activeTours[tabId]) {
        activeTours[tabId].currentStep = request.nextStep;

        // 记录导航意图，以便跨标签页恢复
        StorageAPI.getTourById(activeTours[tabId].tourId, (tour) => {
          if (tour && tour.steps[request.nextStep - 1]) {
            tourNavigatingState = {
              tourId: activeTours[tabId].tourId,
              currentStep: request.nextStep,
              targetUrl: tour.steps[request.nextStep - 1].url
            };
            console.log("O-Maid: [BG] Prepared for navigation to", tourNavigatingState.targetUrl);
          }
        });
      }
      sendResponse({ success: true });
    }
    // iframe 元素选择转发
    else if (request.action === 'elementSelectedInFrame') {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'uiElementSelected',
          selector: request.selector,
          url: request.url
        }, { frameId: 0 }).catch(() => { });
      }
      sendResponse({ success: true });
    }
    // iframe 高亮坐标转发
    else if (request.action === 'sendHighlightRect') {
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          action: 'updateIframeHighlight',
          rect: request.rect,
          frameId: sender.frameId
        }, { frameId: 0 }).catch(() => { });
      }
      sendResponse({ success: true });
    }
    // 数据管理
    else if (request.action === 'markTourAsCompleted') {
      StorageAPI.markTourAsCompleted(request.tourId, sendResponse);
    }
    else if (request.action === 'resetTourCompletion') {
      StorageAPI.resetTourCompletion(request.tourId, sendResponse, () => broadcastToTab(tabId, { action: 'dataUpdated' }));
    }
    // CRUD 操作
    else if (request.action === 'addTour') {
      StorageAPI.addTour(request.tour, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'updateTour') {
      StorageAPI.updateTour(request.tour, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'deleteTour') {
      StorageAPI.deleteTour(request.tourId, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'addHoverHint') {
      StorageAPI.addHoverHint(request.hint, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'updateHoverHint') {
      StorageAPI.updateHoverHint(request.hint, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'deleteHoverHint') {
      StorageAPI.deleteHoverHint(request.hintId, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'importData') {
      StorageAPI.importAllData(request.data, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else if (request.action === 'exportData') {
      StorageAPI.getDataForTab((data) => {
        sendResponse({ success: true, data });
      });
    }
    else if (request.action === 'refreshSyncedRules') {
      StorageAPI.refreshSyncedRules(request.updatedTours, request.updatedHints, sendResponse, () => {
        broadcastToTab(tabId, { action: 'dataUpdated' });
      });
    }
    else {
      sendResponse({ success: false, error: 'Unknown action' });
    }
  } catch (err) {
    console.error('O-Maid: [BG] 消息处理出错:', err);
    sendResponse({ success: false, error: err.message });
  }

  return true; // 保持异步响应
});

// -----------------------------------------------------------------------------
// III. API 同步 (占位符)
// -----------------------------------------------------------------------------

/**
 * 与后端同步数据
 * @param {Array} tours - 任务数组
 * @param {Array} hints - 提示数组
 */
async function syncDataWithBackend(tours, hints) {
  console.log("syncDataWithBackend called. API endpoint not configured.");
  // TODO: 实现后端同步逻辑
}

/**
 * 定时同步
 */
function scheduleSync() {
  // TODO: 实现定时同步逻辑
}