// sidepanel.js - Side Panel 主逻辑
import { localizeHtml } from './modules/i18n.js';

let currentTabId = null;
let currentView = 'main';
let itemToEdit = null;
let tourBuilderState = null;

// 获取当前活动标签页
async function getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
}

// 初始化
async function init() {
    console.log('Side Panel initializing...');

    // 初始化本地化
    localizeHtml();

    const tab = await getCurrentTab();
    currentTabId = tab.id;

    // 加载数据
    await loadData();

    // 绑定事件
    setupEventListeners();

    // 监听标签页切换
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
        currentTabId = activeInfo.tabId;
        await loadData();
    });

    // 监听数据更新
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'dataUpdated') {
            loadData();
        } else if (message.action === 'elementSelected') {
            handleElementSelected(message.selector, message.url);
        }
    });
}

// 加载数据
async function loadData() {
    try {
        const response = await chrome.runtime.sendMessage({
            action: 'getDataForTab',
            tabId: currentTabId
        });

        if (response && response.success) {
            renderToursList(response.data.guided_tours || []);
            renderHintsList(response.data.hover_hints || []);

            const hasData = (response.data.guided_tours?.length > 0) || (response.data.hover_hints?.length > 0);
            const noDataMsg = document.getElementById('no-data-msg');
            if (noDataMsg) noDataMsg.style.display = hasData ? 'none' : 'block';
        }
    } catch (error) {
        console.error('Failed to load data:', error);
    }
}

// 渲染任务列表
function renderToursList(tours) {
    const list = document.getElementById('tours-list');
    if (!list) return;

    list.innerHTML = '';

    tours.forEach(tour => {
        const li = createTourItem(tour);
        list.appendChild(li);
    });
}

// 创建任务项
function createTourItem(tour) {
    const li = document.createElement('li');
    li.innerHTML = `
    <div class="item-header">
      <div class="item-info toggle-steps" style="cursor: pointer;" title="${chrome.i18n.getMessage('spTourItemToggleSteps')}">
        <span class="step-arrow">▶</span>
        <div class="name">${tour.name}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-outline-secondary btn-sm reset-btn" title="${chrome.i18n.getMessage('spTourItemResetStatus')}">↺</button>
        <button class="btn btn-success btn-sm start-btn">▶</button>
        <button class="btn btn-outline-primary btn-sm edit-btn">✎</button>
        <button class="btn btn-outline-danger btn-sm delete-btn">🗑</button>
      </div>
    </div>
    <div class="item-meta">
      <span class="details">${tour.steps.length} ${chrome.i18n.getMessage('spTourItemStepCount') || '步'}, ${tour.trigger === 'auto' ? chrome.i18n.getMessage('spTriggerAuto') : chrome.i18n.getMessage('spTriggerManual')}</span>
    </div>
    <ul class="steps-list" style="display: none;">
      ${tour.steps.map((step, index) => `
        <li class="step-item" data-index="${index}">
          <span class="step-num">${index + 1}</span>
          <span class="step-text">${step.text || chrome.i18n.getMessage('spUnnamedStep')}</span>
        </li>
      `).join('')}
    </ul>
  `;

    // 展开/折叠步骤
    const toggleBtn = li.querySelector('.toggle-steps');
    const stepsList = li.querySelector('.steps-list');
    const arrow = li.querySelector('.step-arrow');
    toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isHidden = stepsList.style.display === 'none';
        stepsList.style.display = isHidden ? 'block' : 'none';
        arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
    });

    // 开始按钮
    li.querySelector('.start-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({
            action: 'startTour',
            tabId: currentTabId,
            tourId: tour.id
        });
    });

    // 重置按钮
    li.querySelector('.reset-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({
            action: 'resetTourCompletion',
            tourId: tour.id
        });
        showNotification(chrome.i18n.getMessage('spMsgTourReset').replace('$1', tour.name), 'success');
        await loadData();
    });

    // 编辑按钮
    li.querySelector('.edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        switchToView('edit-tour', tour);
    });

    // 删除按钮
    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        await chrome.runtime.sendMessage({
            action: 'deleteTour',
            tourId: tour.id
        });
        showNotification(chrome.i18n.getMessage('spMsgTourDeleted'), 'success');
        await loadData();
    });

    return li;
}

// 渲染提示列表
async function renderHintsList(hints) {
    const list = document.getElementById('hints-list');
    if (!list) return;

    list.innerHTML = '';

    // 获取当前标签页的 URL
    const tab = await getCurrentTab();
    const currentUrl = tab.url;

    // 过滤出当前页面的提示
    const currentPageHints = hints.filter(hint => {
        return areUrlsMatching(hint.url, currentUrl);
    });

    currentPageHints.forEach(hint => {
        const li = createHintItem(hint);
        list.appendChild(li);
    });
}

// URL 匹配函数 (简化版)
function areUrlsMatching(url1, url2) {
    if (!url1 || !url2) return false;

    try {
        const u1 = new URL(url1);
        const u2 = new URL(url2);

        // 比较协议、主机和路径
        return u1.protocol === u2.protocol &&
            u1.host === u2.host &&
            u1.pathname === u2.pathname;
    } catch (e) {
        // 如果 URL 解析失败,使用简单的字符串匹配
        return url1 === url2;
    }
}

// 创建提示项
function createHintItem(hint) {
    const li = document.createElement('li');
    li.innerHTML = `
    <div class="item-header">
      <div class="item-info">
        <div class="name">${hint.text.substring(0, 50)}${hint.text.length > 50 ? '...' : ''}</div>
        <div class="details">${hint.selector}</div>
      </div>
      <div class="item-actions">
        <button class="btn btn-outline-primary btn-sm edit-btn">✎</button>
        <button class="btn btn-outline-danger btn-sm delete-btn">🗑</button>
      </div>
    </div>
  `;

    // 编辑按钮
    li.querySelector('.edit-btn').addEventListener('click', () => {
        switchToView('edit-hint', hint);
    });

    // 删除按钮
    li.querySelector('.delete-btn').addEventListener('click', async (e) => {
        if (e) e.stopPropagation();
        await chrome.runtime.sendMessage({
            action: 'deleteHoverHint',
            hintId: hint.id
        });
        showNotification(chrome.i18n.getMessage('spMsgHintDeleted'), 'success');
        await loadData();
    });

    return li;
}

// 切换视图
function switchToView(viewName, data = null) {
    currentView = viewName;
    itemToEdit = data;

    // 隐藏所有视图
    ['main', 'add-choice', 'edit-hint', 'edit-tour', 'edit-tour-step'].forEach(v => {
        const viewEl = document.getElementById(`view-${v}`);
        if (viewEl) viewEl.style.display = 'none';
    });

    // 显示目标视图
    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.style.display = 'block';

    // 更新标题
    const title = document.getElementById('header-title');
    const addBtn = document.getElementById('add-new-btn');

    switch (viewName) {
        case 'main':
            title.textContent = chrome.i18n.getMessage('sidepanelTitle');
            addBtn.style.display = 'block';
            loadData();
            break;
        case 'add-choice':
            title.textContent = chrome.i18n.getMessage('titleAddChoice');
            addBtn.style.display = 'none';
            break;
        case 'edit-hint':
            title.textContent = data ? chrome.i18n.getMessage('spTitleEditHint') : chrome.i18n.getMessage('spTitleNewHint');
            addBtn.style.display = 'none';
            document.getElementById('hint-text').value = data?.text || '';
            document.getElementById('hint-selector').value = data?.selector || '';
            if (!data) {
                // 新建提示,启动选择模式
                startSelectionMode('hint');
            }
            break;
        case 'edit-tour':
            title.textContent = data ? chrome.i18n.getMessage('spTitleEditTour') : chrome.i18n.getMessage('spTitleNewTour');
            addBtn.style.display = 'none';
            tourBuilderState = data ? JSON.parse(JSON.stringify(data)) : { name: '', trigger: 'manual', steps: [] };
            document.getElementById('tour-name').value = tourBuilderState.name;
            document.getElementById('tour-trigger').value = tourBuilderState.trigger;
            renderTourBuilderSteps();
            break;
    }
}

// 渲染任务构建器步骤
function renderTourBuilderSteps() {
    const list = document.getElementById('tour-steps-list');
    const count = document.getElementById('tour-step-count');

    if (!list || !tourBuilderState) return;

    list.innerHTML = '';
    count.textContent = tourBuilderState.steps.length;

    tourBuilderState.steps.forEach((step, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
      <div class="item-header">
        <div class="item-info">
          <div class="name">${chrome.i18n.getMessage('spStepPrefix')} ${index + 1}: ${step.text || chrome.i18n.getMessage('spUnnamed')}</div>
          <div class="details">${step.selector}</div>
        </div>
        <div class="item-actions">
          <button class="btn btn-outline-primary btn-sm edit-step-btn">✎</button>
          <button class="btn btn-outline-danger btn-sm delete-step-btn">🗑</button>
        </div>
      </div>
    `;

        li.querySelector('.edit-step-btn').addEventListener('click', () => {
            switchToView('edit-tour-step', { step, index });
        });

        li.querySelector('.delete-step-btn').addEventListener('click', () => {
            tourBuilderState.steps.splice(index, 1);
            renderTourBuilderSteps();
        });

        list.appendChild(li);
    });
}

// 启动选择模式
async function startSelectionMode(type) {
    await chrome.runtime.sendMessage({
        action: 'startSelection',
        tabId: currentTabId,
        selectionType: type
    });
}

// 处理元素选择
function handleElementSelected(selector, url) {
    if (currentView === 'edit-hint') {
        document.getElementById('hint-selector').value = selector;
    } else if (currentView === 'edit-tour') {
        // 添加新步骤
        tourBuilderState.steps.push({
            text: '',
            selector: selector,
            url: url
        });
        renderTourBuilderSteps();
    }
}

// 显示通知
function showNotification(message, type = 'info', duration = 3000) {
    const notification = document.getElementById('notification');
    if (!notification) return;

    notification.textContent = message;
    notification.className = type;
    notification.style.display = 'block';

    setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

// 设置事件监听
function setupEventListeners() {
    // 添加新按钮
    document.getElementById('add-new-btn')?.addEventListener('click', () => {
        switchToView('add-choice');
    });

    // 导出/导入
    document.getElementById('export-btn')?.addEventListener('click', handleExport);
    document.getElementById('import-btn')?.addEventListener('click', () => {
        document.getElementById('import-input').click();
    });
    document.getElementById('import-input')?.addEventListener('change', handleImportFile);

    // 创建选择
    document.getElementById('create-hint-btn')?.addEventListener('click', () => {
        switchToView('edit-hint');
    });
    document.getElementById('create-tour-btn')?.addEventListener('click', () => {
        switchToView('edit-tour');
    });
    document.getElementById('cancel-creation-btn')?.addEventListener('click', () => {
        switchToView('main');
    });

    // 提示编辑器
    document.getElementById('save-hint-btn')?.addEventListener('click', saveHint);
    document.getElementById('cancel-edit-hint-btn')?.addEventListener('click', () => {
        switchToView('main');
    });
    document.getElementById('hint-reselect-btn')?.addEventListener('click', () => {
        startSelectionMode('hint');
    });

    // 任务编辑器
    document.getElementById('save-tour-btn')?.addEventListener('click', saveTour);
    document.getElementById('cancel-edit-tour-btn')?.addEventListener('click', () => {
        switchToView('main');
    });
    document.getElementById('tour-add-step-btn')?.addEventListener('click', () => {
        tourBuilderState.name = document.getElementById('tour-name').value;
        tourBuilderState.trigger = document.getElementById('tour-trigger').value;
        startSelectionMode('tour_step');
    });

    // 折叠功能
    document.querySelectorAll('.collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const targetList = document.getElementById(targetId);
            const isActive = header.classList.toggle('active');
            if (targetList) {
                targetList.style.display = isActive ? 'block' : 'none';
            }
        });
    });
}

// 保存提示
async function saveHint() {
    const text = document.getElementById('hint-text').value;
    const selector = document.getElementById('hint-selector').value;

    if (!text || !selector) {
        showNotification(chrome.i18n.getMessage('spMsgFillCompleteInfo'), 'error');
        return;
    }

    const tab = await getCurrentTab();
    const hint = {
        text,
        selector,
        url: tab.url,
        id: itemToEdit?.id || Date.now().toString()
    };

    const action = itemToEdit ? 'updateHoverHint' : 'addHoverHint';
    await chrome.runtime.sendMessage({
        action,
        hint
    });

    showNotification(chrome.i18n.getMessage('spMsgHintSaved'), 'success');
    switchToView('main');
}

// 保存任务
async function saveTour() {
    tourBuilderState.name = document.getElementById('tour-name').value;
    tourBuilderState.trigger = document.getElementById('tour-trigger').value;

    if (!tourBuilderState.name || tourBuilderState.steps.length === 0) {
        showNotification(chrome.i18n.getMessage('spMsgFillTourInfo'), 'error');
        return;
    }

    const tour = {
        ...tourBuilderState,
        id: itemToEdit?.id || Date.now().toString()
    };

    const action = itemToEdit ? 'updateTour' : 'addTour';
    await chrome.runtime.sendMessage({
        action,
        tour
    });

    showNotification(chrome.i18n.getMessage('spMsgTourSaved'), 'success');
    switchToView('main');
}

// 导出数据
async function handleExport() {
    const response = await chrome.runtime.sendMessage({ action: 'exportData' });
    if (response && response.success) {
        const dataStr = JSON.stringify(response.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `o-maid-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification(chrome.i18n.getMessage('spMsgExportSuccess'), 'success');
    }
}

// 导入数据
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const response = await chrome.runtime.sendMessage({
                action: 'importData',
                data
            });

            if (response.success) {
                showNotification(chrome.i18n.getMessage('spMsgImportSuccess'), 'success');
                await loadData();
            } else {
                showNotification(chrome.i18n.getMessage('spMsgImportFail') + (response.error || 'Unknown error'), 'error');
            }
        } catch (err) {
            showNotification(chrome.i18n.getMessage('spMsgParseFail') + err.message, 'error');
        }
        event.target.value = '';
    };
    reader.readAsText(file);
}

// 启动
init();
