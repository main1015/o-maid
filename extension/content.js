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

    // 统一的消息监听器
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 收到 runtime 消息:`, msg.action);

      if (msg.action === 'uiElementSelected' && isTop) {
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

    // 在顶层页面自动预挂载面板架构，确保右侧展开小耳朵与提示气泡立即可用
    if (isTop) {
      createUIPanel();
    }
  }

  // ----------------- 即刻初始化 -----------------
  console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 脚本注入成功 (状态: ${document.readyState})，立即启动插件初始化...`);
  initializePlugin().catch(err => {
    console.error(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 初始化异常:`, err);
  });
})();
