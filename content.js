// content.js - O-Maid 内容脚本入口文件

(async () => {
  const isTop = window.self === window.top;

  /**
   * 真正的初始化函数
   */
  async function initializePlugin() {
    console.log(`O-Maid 插件开始初始化... [${isTop ? 'Top' : 'Iframe'}] URL: ${window.location.href}`);

    // 动态导入所有模块 (放在这里延迟加载)
    let communication, uiManager, elementSelector, hoverHints, tourManager;
    try {
      communication = await import(chrome.runtime.getURL('modules/communication.js'));
      uiManager = await import(chrome.runtime.getURL('modules/ui-manager.js'));
      elementSelector = await import(chrome.runtime.getURL('modules/element-selector.js'));
      hoverHints = await import(chrome.runtime.getURL('modules/hover-hints.js'));
      tourManager = await import(chrome.runtime.getURL('modules/tour-manager.js'));
      console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 所有模块导入并在延迟后加载完毕`);
    } catch (err) {
      console.error(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 模块导入失败:`, err);
      return;
    }

    const { connectPort, registerMessageHandler, getDataForTab } = communication;
    const { createUIPanel, togglePanel, switchToView, getCurrentView } = uiManager;
    const {
      startSelectionMode,
      stopSelectionMode,
      handleElementSelection,
      handleIframeHighlightUpdate
    } = elementSelector;
    const { initHoverHints } = hoverHints;
    const { startTour, checkAndStartAutoTour } = tourManager;

    // ----------------- 初始化 -----------------

    connectPort();

    registerMessageHandler('startSelection', () => {
      startSelectionMode();
    });

    // 统一的消息监听器
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 收到 runtime 消息:`, msg.action);

      if (msg.action === 'startSelection') {
        startSelectionMode(null, null, true);
      } else if (msg.action === 'stopSelection') {
        stopSelectionMode(isTop && msg.keepContext, true);
      } else if (msg.action === 'uiElementSelected' && isTop) {
        handleElementSelection(msg.selector, msg.url);
      } else if (msg.action === 'updateIframeHighlight' && isTop) {
        handleIframeHighlightUpdate(msg.rect, msg.frameId);
      } else if (msg.action === 'togglePanel' && isTop) {
        togglePanel();
      } else if (msg.action === 'resumeTour') {
        resumeTour(msg.tourId, msg.startStep);
      } else if (msg.action === 'startTourFromPanel' && isTop) {
        // 来自 Side Panel 的开始任务请求
        resumeTour(msg.tourId, 1);
      }
      return true;
    });

    registerMessageHandler('dataUpdated', async () => {
      await processPageData();
      if (isTop && getCurrentView() === 'view') {
        switchToView('view');
      }
    });

    // ----------------- 数据处理 -----------------

    async function processPageData() {
      console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 处理页面数据...`);
      const response = await getDataForTab();
      if (!response) return;

      const { guided_tours = [], hover_hints = [], tour_completions = {} } = response;
      initHoverHints(hover_hints);
      if (isTop) {
        checkAndStartAutoTour(guided_tours, tour_completions);
      }
    }

    async function resumeTour(tourId, startStep) {
      console.log(`O-Maid: [Resume] resumeTour called for tour: ${tourId}, startStep: ${startStep}`);
      const response = await getDataForTab();
      if (!response || !response.guided_tours) return;

      const tourToResume = response.guided_tours.find(t => t.id === tourId);
      if (tourToResume) {
        console.log(`O-Maid: [Resume] Found tour object, initiating startTour(..., ${startStep})`);
        startTour(tourToResume, parseInt(startStep, 10));
      } else {
        chrome.runtime.sendMessage({ action: 'stopTourState' });
      }
    }

    /**
     * 解析 URL Hash 以尝试恢复引导
     */
    async function checkHashForResume() {
      const hash = window.location.hash;
      if (hash && hash.includes('o-maid-tour=')) {
        console.log("O-Maid: [Hash] Found tour info in URL hash. Attempting auto-resume...");
        const tourIdMatch = hash.match(/o-maid-tour=([^&]+)/);
        const stepMatch = hash.match(/step=(\d+)/);

        if (tourIdMatch) {
          const tourId = tourIdMatch[1];
          const startStep = stepMatch ? parseInt(stepMatch[1]) : 1;
          console.log(`O-Maid: [Hash] Parsed tourId: ${tourId}, startStep: ${startStep}`);
          await resumeTour(tourId, startStep);
        }
      }
    }

    // 执行初次数据处理
    await processPageData();
    // 检查是否有锚标记需要恢复
    await checkHashForResume();
  }

  // ----------------- 触发逻辑 -----------------

  console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 脚本注入成功，注入时刻状态: ${document.readyState}`);

  const startInitialization = (reason) => {
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 触发注入 (原因: ${reason}, 当前状态: ${document.readyState})，等待 2 秒后尝试初始化...`);
    setTimeout(initializePlugin, 2000);
  };

  if (document.readyState === 'complete') {
    startInitialization('脚本注入时页面已加载完成');
  } else {
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 页面尚未加载完，正在监听 window.load 事件...`);
    window.addEventListener('load', () => {
      startInitialization('监听到 load 事件');
    }, { once: true });
  }
})();
