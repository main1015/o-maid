// modules/ui-manager.js - UI 面板管理模块

import { areUrlsMatching, querySelectorAllDeep, getProxyElement, appendTourHash, stripTourHash } from './utils.js';
import { getDataForTab, addHoverHint, updateHoverHint, deleteHoverHint, addTour, updateTour, deleteTour, resetTourCompletion, startTourState, proceedToNextStep } from './communication.js';
import { startSelectionMode } from './element-selector.js';
import { startTour } from './tour-manager.js';
import { createHoverTooltip } from './hover-hints.js';

let uiPanel = null;
let uiHost = null;
let shadowRoot = null;
let currentView = 'view';
let itemToEdit = null;
let tourBuilderState = null;

/**
 * 创建 UI 面板
 */
export function createUIPanel() {
    if (window.self !== window.top) return;

    // 检查是否已经存在宿主
    uiHost = document.getElementById('o-maid-ui-host');
    if (uiHost) {
        shadowRoot = uiHost.shadowRoot;
        uiPanel = shadowRoot.getElementById('o-maid-panel');
        return;
    }

    // 创建宿主元素
    uiHost = document.createElement('div');
    uiHost.id = 'o-maid-ui-host';
    // 确保宿主本身不影响布局，但能承载 Shadow DOM
    uiHost.style.position = 'static';
    uiHost.style.zIndex = '2147483646';
    document.body.appendChild(uiHost);

    // 挂载 Shadow Root
    shadowRoot = uiHost.attachShadow({ mode: 'open' });

    createHoverTooltip();
    const panel = document.createElement('div');
    panel.id = 'o-maid-panel';
    panel.innerHTML = `
    <div class="o-maid-resize-handle" title="拖拽调整宽度"></div>
    <div class="o-maid-collapse-tab" title="展开侧边栏">
      <div class="o-maid-collapse-tab-icon">📋</div>
    </div>
    <div id="o-maid-panel-header">
      <span id="o-maid-header-title">页面助手</span>
      <div id="o-maid-header-buttons">
        <button id="o-maid-collapse-btn" title="折叠侧边栏" style="font-size: 14px;">◀</button>
        <button id="o-maid-export-btn" title="导出数据" style="font-size: 14px;">📤</button>
        <button id="o-maid-import-btn" title="导入数据" style="font-size: 14px;">📥</button>
        <button id="o-maid-add-new-btn" title="添加新提示">+</button>
        <button id="o-maid-close-btn" title="关闭面板">×</button>
      </div>
    </div>
    <div id="o-maid-notification" style="display:none;"></div>
    <div id="o-maid-panel-content">
      <!-- View: Main list view -->
      <div id="o-maid-view-view">
        <div class="o-maid-list-section">
          <h4 class="o-maid-collapsible active" data-target="o-maid-tours-list">引导任务 <span class="arrow"></span></h4>
          <ul id="o-maid-tours-list"></ul>
        </div>
        <div class="o-maid-list-section">
          <h4 class="o-maid-collapsible active" data-target="o-maid-hints-list">悬停提示 <span class="arrow"></span></h4>
          <ul id="o-maid-hints-list"></ul>
        </div>
        <p id="o-maid-no-data-msg" style="display:none;">当前没有任何提示或任务。</p>
      </div>

      <!-- View: Add Choice -->
      <div id="o-maid-view-add-choice" style="display:none;">
        <h5>您想创建什么？</h5>
        <button id="o-maid-create-hint-btn" class="choice-btn">悬停提示</button>
        <button id="o-maid-create-tour-btn" class="choice-btn">引导任务</button>
        <hr><button id="o-maid-cancel-creation-btn" class="cancel-btn">取消</button>
      </div>

      <!-- View: Hint Editor -->
      <div id="o-maid-view-edit-hint" style="display:none;">
        <label>提示文本:</label>
        <textarea id="o-maid-hint-text" rows="4"></textarea>
        <label>CSS 选择器:</label>
        <div class="selector-wrapper">
          <input type="text" id="o-maid-hint-selector" readonly>
          <button id="o-maid-hint-reselect-btn">重选</button>
        </div>
        <div class="form-actions">
          <button id="o-maid-save-hint-btn" class="save-btn">保存</button>
          <button id="o-maid-cancel-edit-hint-btn" class="cancel-btn">取消</button>
        </div>
      </div>

      <!-- View: Tour Editor -->
      <div id="o-maid-view-edit-tour" style="display:none;">
        <label>任务名称:</label>
        <input type="text" id="o-maid-tour-name">
        <label>触发方式:</label>
        <select id="o-maid-tour-trigger">
          <option value="manual">手动</option>
          <option value="auto">自动</option>
        </select>
        <div class="o-maid-list-section">
          <h5>步骤 (<span id="o-maid-tour-step-count">0</span>)</h5>
          <ul id="o-maid-tour-steps-list"></ul>
        </div>
        <button id="o-maid-tour-add-step-btn" class="choice-btn">+ 添加步骤</button>
        <div class="form-actions">
          <button id="o-maid-save-tour-btn" class="save-btn">保存任务</button>
          <button id="o-maid-cancel-edit-tour-btn" class="cancel-btn">取消</button>
        </div>
      </div>

      <!-- View: Tour Step Editor -->
      <div id="o-maid-view-edit-tour-step" style="display:none;">
        <label>步骤提示文本:</label>
        <textarea id="o-maid-tour-step-text" rows="4"></textarea>
        <label>CSS 选择器:</label>
        <div class="selector-wrapper">
          <input type="text" id="o-maid-tour-step-selector" readonly>
          <button id="o-maid-tour-step-reselect-btn">重选</button>
        </div>
        <div class="form-actions">
          <button id="o-maid-save-tour-step-btn" class="save-btn">保存步骤</button>
          <button id="o-maid-cancel-edit-tour-step-btn" class="cancel-btn">取消</button>
        </div>
      </div>
    `;
    shadowRoot.appendChild(panel);

    // 添加样式
    addPanelStyles();
    uiPanel = panel;

    wireUpPanelEvents();

    // 创建隐藏的文件输入框用于导入
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'o-maid-import-input';
    fileInput.accept = '.json';
    fileInput.style.display = 'none';
    shadowRoot.appendChild(fileInput);
    fileInput.addEventListener('change', handleImportFile);
}

/**
 * 添加面板样式
 */
function addPanelStyles() {
    const style = document.createElement('style');
    style.id = 'o-maid-panel-styles';
    style.innerHTML = `
    /* 基础面板样式 - 悬浮式布局 */
    #o-maid-panel { 
        position: fixed;
        top: 0;
        right: 0;
        height: 100vh;
        width: 380px;
        min-width: 280px;
        max-width: 600px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        box-shadow: -2px 0 20px rgba(0, 0, 0, 0.15);
        border-radius: 12px 0 0 12px;
        z-index: 2147483646; 
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji" !important; 
        font-size: 14px !important; 
        line-height: 1.5 !important;
        color: #333 !important; 
        display: none; 
        flex-direction: column;
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        text-align: left !important;
        border: none;
    }

    #o-maid-panel *, #o-maid-panel *:before, #o-maid-panel *:after {
        font-family: inherit !important;
        font-size: inherit !important;
        line-height: inherit !important;
        box-sizing: border-box !important;
        text-transform: none !important;
    }

    /* 折叠状态 */
    #o-maid-panel.collapsed {
        transform: translateX(calc(100% - 2px));
    }

    /* 拖拽手柄 */
    .o-maid-resize-handle {
        position: absolute;
        left: 0;
        top: 0;
        width: 6px;
        height: 100%;
        cursor: ew-resize;
        background: transparent;
        transition: background 0.2s;
        z-index: 10;
    }

    .o-maid-resize-handle:hover,
    .o-maid-resize-handle.dragging {
        background: rgba(13, 110, 253, 0.3);
    }

    /* 折叠标签 */
    .o-maid-collapse-tab {
        position: absolute;
        left: -48px;
        top: 50%;
        transform: translateY(-50%);
        width: 48px;
        height: 120px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
        border-radius: 12px 0 0 12px;
        box-shadow: -2px 0 10px rgba(0, 0, 0, 0.1);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s;
    }

    #o-maid-panel.collapsed .o-maid-collapse-tab {
        opacity: 1;
        pointer-events: auto;
    }

    .o-maid-collapse-tab:hover {
        background: rgba(255, 255, 255, 1);
    }

    .o-maid-collapse-tab-icon {
        font-size: 24px;
        writing-mode: vertical-rl;
        text-orientation: mixed;
    }

    /* 移动端适配 - 竖屏时显示在底部 */
    @media (max-width: 768px) and (orientation: portrait) {
        #o-maid-panel {
            top: auto;
            bottom: 0;
            left: 0;
            right: 0;
            width: 100vw;
            height: 50vh;
            min-height: 300px;
            max-height: 80vh;
            border-radius: 12px 12px 0 0;
        }

        #o-maid-panel.collapsed {
            transform: translateY(calc(100% - 48px));
        }

        .o-maid-resize-handle {
            left: 0;
            top: 0;
            width: 100%;
            height: 6px;
            cursor: ns-resize;
        }

        .o-maid-collapse-tab {
            left: 50%;
            top: -48px;
            transform: translateX(-50%);
            width: 120px;
            height: 48px;
            border-radius: 12px 12px 0 0;
        }

        .o-maid-collapse-tab-icon {
            writing-mode: horizontal-tb;
        }
    }

    #o-maid-panel #o-maid-panel-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; background: #f7f7f7; border-bottom: 1px solid #eee; font-weight: bold; }
    #o-maid-panel #o-maid-header-buttons { display: flex; gap: 8px; }
    #o-maid-panel #o-maid-header-buttons button { font-size: 18px; border: 1px solid #ccc; background: #fff; cursor: pointer; border-radius: 4px; padding: 2px 8px; line-height: 1; display: flex; align-items: center; justify-content: center; }
    #o-maid-panel #o-maid-panel-content { padding: 15px; overflow-y: auto; flex-grow: 1; scrollbar-width: thin; }
    
    /* 列表与折叠样式 (手风琴风格) */
    #o-maid-panel .o-maid-list-section { border: 1px solid #dee2e6; border-radius: 4px; margin-bottom: 15px; overflow: hidden; background: #fff; }
    #o-maid-panel .o-maid-collapsible { 
        cursor: pointer; 
        display: flex; 
        justify-content: space-between; 
        align-items: center; 
        user-select: none; 
        margin: 0; 
        padding: 12px 15px; 
        background: #fff; 
        color: #0d6efd;
        font-weight: 600;
        transition: background-color 0.2s, color 0.2s;
        border: none;
        width: 100%;
        text-align: left;
    }
    #o-maid-panel .o-maid-collapsible:hover { background-color: #f8f9fa; }
    #o-maid-panel .o-maid-collapsible.active { 
        background-color: #e7f1ff; 
        color: #0c63e4; 
        border-bottom: 1px solid #dee2e6;
    }
    
    #o-maid-panel .o-maid-collapsible .arrow { 
        width: 10px;
        height: 10px;
        border-right: 2px solid currentColor;
        border-bottom: 2px solid currentColor;
        transform: rotate(45deg);
        transition: transform 0.2s ease-in-out;
        margin-right: 5px;
    }
    #o-maid-panel .o-maid-collapsible.active .arrow { 
        transform: rotate(-135deg);
        margin-top: 5px;
    }
    
    #o-maid-panel #o-maid-tours-list, #o-maid-panel #o-maid-hints-list { 
        list-style-type: none; 
        padding: 15px; 
        margin: 0; 
        background: #fdfdfd;
    }
    
    #o-maid-panel .o-maid-list-section h5 { margin-top: 0; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; color: #666; font-size: 13px; }
    
    #o-maid-panel #o-maid-tours-list li, #o-maid-panel #o-maid-hints-list li, #o-maid-panel #o-maid-tour-steps-list li { 
        background: #fff; 
        margin-bottom: 12px; 
        padding: 15px; 
        border: 1px solid #e0e0e0; 
        border-radius: 6px; 
        display: flex; 
        flex-direction: column;
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    #o-maid-panel #o-maid-tours-list li:last-child, #o-maid-panel #o-maid-hints-list li:last-child { margin-bottom: 0; }
    
    #o-maid-panel .item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        margin-bottom: 5px;
    }
    
    #o-maid-panel .item-info { flex-grow: 1; overflow: hidden; }
    #o-maid-panel .item-info .name { font-weight: bold; font-size: 15px; color: #212529; }
    #o-maid-panel .item-info .details, #o-maid-panel .step-details { font-size: 11px; color: #6c757d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; width: 100%; margin-top: 2px; }
    
    #o-maid-panel .item-actions { display: flex; gap: 5px; }
    
    /* Bootstrap 5 风格按钮 */
    #o-maid-panel .btn {
        display: inline-block;
        font-weight: 400;
        line-height: 1.5;
        text-align: center;
        text-decoration: none;
        vertical-align: middle;
        cursor: pointer;
        user-select: none;
        background-color: transparent;
        border: 1px solid transparent;
        padding: 0.25rem 0.5rem;
        font-size: 0.875rem;
        border-radius: 0.25rem;
        transition: color .15s ease-in-out,background-color .15s ease-in-out,border-color .15s ease-in-out,box-shadow .15s ease-in-out;
    }
    #o-maid-panel .btn-outline-primary {
        color: #0d6efd;
        border-color: #0d6efd;
    }
    #o-maid-panel .btn-outline-primary:hover {
        color: #fff;
        background-color: #0d6efd;
        border-color: #0d6efd;
    }
    #o-maid-panel .btn-outline-danger {
        color: #dc3545;
        border-color: #dc3545;
    }
    #o-maid-panel .btn-outline-danger:hover {
        color: #fff;
        background-color: #dc3545;
        border-color: #dc3545;
    }
    #o-maid-panel .btn-sm {
        padding: 0.1rem 0.4rem;
        font-size: 0.75rem;
        border-radius: 0.2rem;
    }
    #o-maid-panel .btn-success {
        color: #fff;
        background-color: #198754;
        border-color: #198754;
    }
    #o-maid-panel #o-maid-panel-content label { display: block; margin: 10px 0 5px; font-size: 12px; font-weight: bold; }
    #o-maid-panel #o-maid-panel-content input[type="text"], #o-maid-panel #o-maid-panel-content textarea, #o-maid-panel #o-maid-panel-content select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    #o-maid-panel .selector-wrapper { display: flex; }
    #o-maid-panel .selector-wrapper input { flex-grow: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; background: #eee; }
    #o-maid-panel .selector-wrapper button { border-top-left-radius: 0; border-bottom-left-radius: 0; }
    #o-maid-panel .form-actions { margin-top: 20px; display:flex; justify-content: flex-end; gap: 10px; }
    #o-maid-panel button.save-btn { background: #007bff; color: white; border-color: #007bff; }
    #o-maid-panel button.cancel-btn { background: #f1f1f1; }
    #o-maid-panel button.choice-btn { display: block; width: 100%; text-align: center; padding: 10px; margin-bottom: 10px; }
    #o-maid-panel #o-maid-tour-steps-list li { background: #f9f9f9; }
    #o-maid-panel .delete-btn, #o-maid-panel .delete-step-btn { background-color: #dc3545; color: white; border-color: #dc3545; }
    #o-maid-panel .start-btn { background-color: #28a745; color: white; border-color: #28a745; }
    
    /* 页面平滑过渡 */
    html { transition: margin 0.3s ease, width 0.3s ease, height 0.3s ease; }

    /* 引导任务步骤列表样式 */
    #o-maid-panel .o-maid-steps-list {
        list-style: none;
        padding: 10px 0 !important;
        margin: 0;
        background: #fdfdfd;
        border-top: 1px dashed #eee;
    }

    #o-maid-panel .o-maid-step-item {
        display: flex;
        flex-direction: row !important;
        gap: 10px;
        align-items: center;
        justify-content: flex-start;
        padding: 15px;
        margin-top: 10px;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: 13px !important;
        background: white;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }

    #o-maid-panel .o-maid-step-item:hover {
        background-color: #fff;
        box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        transform: translateY(-1px);
        border-color: #b3d7ff;
    }

    #o-maid-panel .o-maid-step-item.disabled {
        opacity: 0.6;
        cursor: pointer;
        color: #999 !important;
        background: #f9f9f9;
        box-shadow: none;
    }

    #o-maid-panel .o-maid-step-item .step-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        background: #0d6efd;
        color: white;
        border-radius: 50%;
        font-size: 12px !important;
        font-weight: bold;
        flex-shrink: 0;
        margin-bottom: 0px;
        margin-right: 8px;
    }

    #o-maid-panel .o-maid-step-item.disabled .step-num {
        background: #ccc;
    }

    #o-maid-panel .o-maid-step-item .step-text {
        white-space: normal;
        line-height: 1.4;
        color: #333;
        text-align: left !important;
        flex: 1 !important;
        display: block !important;
        word-break: break-all;
    }

    #o-maid-panel .step-arrow {
        display: inline-block;
        transition: transform 0.2s;
        margin-right: 8px;
        font-size: 10px;
        color: #666;
    }

    #o-maid-panel .item-meta {
        padding: 0 15px 10px 15px;
        font-size: 12px !important;
        color: #666;
    }

    /* 通知样式 */
    #o-maid-notification {
        padding: 8px 15px;
        font-size: 12px;
        text-align: center;
        z-index: 100;
        animation: slideDown 0.3s ease-out;
    }
    #o-maid-notification.info { background: #e7f1ff; color: #0c63e4; }
    #o-maid-notification.success { background: #d1e7dd; color: #0f5132; }
    #o-maid-notification.error { background: #f8d7da; color: #842029; }

    @keyframes slideDown {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
    }
  `;
    shadowRoot.appendChild(style);

    // 注入 hints.css 到 Shadow DOM
    const hintsStyle = document.createElement('style');
    hintsStyle.id = 'o-maid-hints-styles';
    // 这里我们直接从文件读取内容或者硬编码，为了简单先硬编码核心部分
    hintsStyle.innerHTML = `
        #o-maid-hover-tooltip {
            position: fixed; /* 在 Shadow DOM 中使用 fixed 相对视口定位 */
            display: none;
            z-index: 2147483647;
            background: #333;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 250px;
            pointer-events: none;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        }
    `;
    shadowRoot.appendChild(hintsStyle);
}

/**
 * 显示面板通知
 * @param {string} message - 消息内容
 * @param {string} type - 类型: info, success, error
 * @param {number} duration - 持续时间 (ms)
 */
function showNotification(message, type = 'info', duration = 3000) {
    const notification = shadowRoot.getElementById('o-maid-notification');
    if (!notification) return;

    notification.textContent = message;
    notification.className = type;
    notification.style.display = 'block';

    if (notification._timer) clearTimeout(notification._timer);
    notification._timer = setTimeout(() => {
        notification.style.display = 'none';
    }, duration);
}

/**
 * 初始化拖拽调整宽度功能
 */
function initResizeHandle() {
    const handle = shadowRoot.querySelector('.o-maid-resize-handle');
    if (!handle) return;

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const isMobile = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = uiPanel.offsetWidth;
        startHeight = uiPanel.offsetHeight;
        handle.classList.add('dragging');
        document.body.style.cursor = isMobile ? 'ns-resize' : 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        if (isMobile) {
            // 移动端竖屏:调整高度
            const deltaY = startY - e.clientY;
            const newHeight = Math.max(300, Math.min(window.innerHeight * 0.8, startHeight + deltaY));
            uiPanel.style.height = newHeight + 'px';
        } else {
            // 桌面端:调整宽度
            const deltaX = startX - e.clientX;
            const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));
            uiPanel.style.width = newWidth + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            handle.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // 保存尺寸到 localStorage
            if (isMobile) {
                localStorage.setItem('o-maid-panel-height', uiPanel.style.height);
            } else {
                localStorage.setItem('o-maid-panel-width', uiPanel.style.width);
            }
        }
    });
}

/**
 * 初始化折叠功能
 */
function initCollapseToggle() {
    const collapseBtn = shadowRoot.querySelector('#o-maid-collapse-btn');
    const collapseTab = shadowRoot.querySelector('.o-maid-collapse-tab');

    const toggleCollapse = () => {
        const isCollapsed = uiPanel.classList.toggle('collapsed');
        localStorage.setItem('o-maid-panel-collapsed', isCollapsed);

        // 更新折叠按钮图标
        if (collapseBtn) {
            const isMobile = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
            collapseBtn.textContent = isCollapsed ? (isMobile ? '▼' : '▶') : (isMobile ? '▲' : '◀');
        }
    };

    collapseBtn?.addEventListener('click', toggleCollapse);
    collapseTab?.addEventListener('click', toggleCollapse);
}

/**
 * 绑定面板事件
 */
function wireUpPanelEvents() {
    uiPanel.querySelector('#o-maid-close-btn').addEventListener('click', hidePanel);
    uiPanel.querySelector('#o-maid-add-new-btn').addEventListener('click', () => switchToView('add-choice'));
    uiPanel.querySelector('#o-maid-export-btn').addEventListener('click', handleExport);
    uiPanel.querySelector('#o-maid-import-btn').addEventListener('click', () => {
        const input = shadowRoot.getElementById('o-maid-import-input');
        if (input) input.click();
    });

    // 初始化拖拽调整宽度功能
    initResizeHandle();

    // 初始化折叠功能
    initCollapseToggle();

    // 折叠功能
    uiPanel.querySelectorAll('.o-maid-collapsible').forEach(header => {
        header.addEventListener('click', () => {
            const targetId = header.dataset.target;
            const targetList = uiPanel.querySelector(`#${targetId}`);
            const isActive = header.classList.toggle('active');
            if (targetList) {
                targetList.style.display = isActive ? 'block' : 'none';
            }
        });
    });

    // Add Choice view
    uiPanel.querySelector('#o-maid-cancel-creation-btn').addEventListener('click', () => switchToView('view'));
    uiPanel.querySelector('#o-maid-create-hint-btn').addEventListener('click', () => switchToView('edit-hint'));
    uiPanel.querySelector('#o-maid-create-tour-btn').addEventListener('click', () => switchToView('edit-tour'));

    // Hint Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-hint-btn').addEventListener('click', () => switchToView('view'));
    uiPanel.querySelector('#o-maid-save-hint-btn').addEventListener('click', saveHint);
    uiPanel.querySelector('#o-maid-hint-reselect-btn').addEventListener('click', () => {
        startSelectionMode({ type: 'hint' }, handleElementSelection);
    });

    // Tour Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-tour-btn').addEventListener('click', () => switchToView('view'));
    uiPanel.querySelector('#o-maid-tour-add-step-btn').addEventListener('click', () => {
        tourBuilderState.name = uiPanel.querySelector('#o-maid-tour-name').value;
        tourBuilderState.trigger = uiPanel.querySelector('#o-maid-tour-trigger').value;
        startSelectionMode({ type: 'tour_step' }, handleElementSelection);
    });
    uiPanel.querySelector('#o-maid-save-tour-btn').addEventListener('click', saveTour);

    // Tour Step Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-tour-step-btn').addEventListener('click', () => switchToView('edit-tour', tourBuilderState));
    uiPanel.querySelector('#o-maid-save-tour-step-btn').addEventListener('click', saveTourStep);
    uiPanel.querySelector('#o-maid-tour-step-reselect-btn').addEventListener('click', () => {
        startSelectionMode({ type: 'tour_step_update', stepIndex: itemToEdit.index }, handleElementSelection);
    });
}

/**
 * 处理数据导出
 */
async function handleExport() {
    import('./communication.js').then(async (comm) => {
        try {
            const response = await comm.exportData();
            if (response && response.success) {
                const dataStr = JSON.stringify(response.data, null, 2);
                const blob = new Blob([dataStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);

                const a = document.createElement('a');
                a.href = url;
                a.download = `o-maid-data-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showNotification("数据导出成功！", "success");
            } else {
                showNotification("导出失败", "error");
            }
        } catch (err) {
            showNotification("导出错误: " + err.message, "error");
        }
    });
}



/**
 * 处理数据导入
 */
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.guided_tours && !data.hover_hints) {
                throw new Error("无效的数据格式");
            }

            // 导入数据
            import('./communication.js').then(async (comm) => {
                const res = await comm.importData(data);
                if (res.success) {
                    showNotification("数据导入成功！", "success");
                    fetchAllAndRenderLists();
                } else {
                    showNotification("导入失败: " + (res.error || "未知错误"), "error");
                }
            });
        } catch (err) {
            showNotification("解析 JSON 文件失败: " + err.message, "error");
        }
        // 重置 input 以便下次选择同一文件
        event.target.value = '';
    };
    reader.readAsText(file);
}


/**
 * 切换视图
 * @param {string} viewName - 视图名称
 * @param {Object} data - 数据对象
 */
export function switchToView(viewName, data = null) {
    currentView = viewName;
    itemToEdit = data;

    if (!uiPanel) return;

    if (uiPanel.style.display !== 'flex') {
        uiPanel.style.display = 'flex';
    }

    ['view', 'add-choice', 'edit-hint', 'edit-tour', 'edit-tour-step'].forEach(v => {
        const viewEl = uiPanel.querySelector(`#o-maid-view-${v}`);
        if (viewEl) viewEl.style.display = 'none';
    });
    const targetView = uiPanel.querySelector(`#o-maid-view-${viewName}`);
    if (targetView) targetView.style.display = 'block';

    const addBtn = uiPanel.querySelector('#o-maid-add-new-btn');
    if (addBtn) addBtn.style.display = viewName === 'view' ? 'block' : 'none';

    switch (viewName) {
        case 'view':
            uiPanel.querySelector('#o-maid-header-title').textContent = '页面助手';
            fetchAllAndRenderLists();
            break;
        case 'add-choice':
            uiPanel.querySelector('#o-maid-header-title').textContent = '创建';
            break;
        case 'edit-hint':
            uiPanel.querySelector('#o-maid-header-title').textContent = data ? '修改悬停提示' : '新建悬停提示';
            uiPanel.querySelector('#o-maid-hint-text').value = data?.text || '';
            uiPanel.querySelector('#o-maid-hint-selector').value = data?.selector || '';
            if (!data) startSelectionMode({ type: 'hint' }, handleElementSelection);
            break;
        case 'edit-tour':
            uiPanel.querySelector('#o-maid-header-title').textContent = data ? '修改引导任务' : '新建引导任务';
            tourBuilderState = data ? JSON.parse(JSON.stringify(data)) : { name: '', trigger: 'manual', steps: [] };
            uiPanel.querySelector('#o-maid-tour-name').value = tourBuilderState.name;
            uiPanel.querySelector('#o-maid-tour-trigger').value = tourBuilderState.trigger;
            renderTourBuilderSteps();
            break;
        case 'edit-tour-step':
            uiPanel.querySelector('#o-maid-header-title').textContent = '编辑步骤';
            uiPanel.querySelector('#o-maid-tour-step-text').value = data.step.text || '';
            uiPanel.querySelector('#o-maid-tour-step-selector').value = data.step.selector || '';
            break;
    }
}

/**
 * 显示面板
 */
export function showPanel() {
    if (!uiPanel) {
        createUIPanel();
    }
    if (uiPanel) {
        uiPanel.style.display = 'flex';

        // 恢复保存的宽度/高度
        const isMobile = window.matchMedia('(max-width: 768px) and (orientation: portrait)').matches;
        if (isMobile) {
            const savedHeight = localStorage.getItem('o-maid-panel-height');
            if (savedHeight) {
                uiPanel.style.height = savedHeight;
            }
        } else {
            const savedWidth = localStorage.getItem('o-maid-panel-width');
            if (savedWidth) {
                uiPanel.style.width = savedWidth;
            }
        }

        // 恢复折叠状态
        const isCollapsed = localStorage.getItem('o-maid-panel-collapsed') === 'true';
        if (isCollapsed) {
            uiPanel.classList.add('collapsed');
            const collapseBtn = shadowRoot.querySelector('#o-maid-collapse-btn');
            if (collapseBtn) {
                collapseBtn.textContent = isMobile ? '▼' : '▶';
            }
        }

        switchToView('view');
    }
}

/**
 * 隐藏面板
 */
export function hidePanel() {
    if (uiPanel) {
        uiPanel.style.display = 'none';
    }
}

/**
 * 切换面板显示/隐藏
 */
export function togglePanel() {
    if (uiPanel && uiPanel.style.display !== 'none') {
        hidePanel();
    } else {
        showPanel();
    }
}

/**
 * 获取所有数据并渲染列表
 */
async function fetchAllAndRenderLists() {
    const response = await getDataForTab();
    if (!response) return;

    if (!uiPanel) return;
    renderToursList(response.guided_tours || []);
    renderHintsList(response.hover_hints || []);
    const hasData = (response.guided_tours?.length > 0) || (response.hover_hints?.length > 0);
    const noDataMsg = uiPanel.querySelector('#o-maid-no-data-msg');
    if (noDataMsg) noDataMsg.style.display = hasData ? 'none' : 'block';
}

/**
 * 渲染任务列表
 * @param {Array} tours - 任务数组
 */
function renderToursList(tours) {
    const list = uiPanel.querySelector('#o-maid-tours-list');
    list.innerHTML = '';
    tours.forEach(tour => {
        const li = document.createElement('li');
        const isRelevant = tour.steps.some(step => areUrlsMatching(step.url, window.location.href));
        li.innerHTML = `
            <div class="item-header">
                <div class="item-info toggle-steps" style="cursor: pointer;" title="点击展开/折叠步骤">
                    <span class="step-arrow">▶</span>
                    <div class="name">${tour.name}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-secondary btn-sm reset-btn" title="重置完成状态">↺</button>
                    <button class="btn btn-success btn-sm start-btn" title="${isRelevant ? '开始任务' : '跳转并开始任务'}">▶</button>
                    <button class="btn btn-outline-primary btn-sm edit-btn">✎</button>
                    <button class="btn btn-outline-danger btn-sm delete-btn">🗑</button>
                </div>
            </div>
            <div class="item-meta">
                <span class="details">${tour.steps.length} 步, ${tour.trigger === 'auto' ? '自动' : '手动'}</span>
            </div>
            <ul class="o-maid-steps-list" style="display: none;">
                ${tour.steps.map((step, index) => {
            const stepMatch = areUrlsMatching(step.url, window.location.href);
            return `
                        <li class="o-maid-step-item ${stepMatch ? '' : 'disabled'}" data-index="${index}" title="${stepMatch ? '点击在页面上定位' : '点击跳转到: ' + step.url}">
                            <span class="step-num">${index + 1}</span>
                            <span class="step-text">${step.text || '未命名步骤'}</span>
                        </li>
                    `;
        }).join('')}
            </ul>
        `;

        const startBtn = li.querySelector('.start-btn');
        startBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const firstStep = tour.steps[0];
            if (firstStep && !areUrlsMatching(firstStep.url, window.location.href)) {
                console.log(`O-Maid: [UI] Starting tour from a different page. Navigating to: ${firstStep.url}`);
                const targetWithHash = appendTourHash(firstStep.url, tour.id, 1);
                startTourState(tour.id, 1).then(() => {
                    window.location.href = targetWithHash;
                });
            } else {
                startTour(tour, 1, hidePanel);
            }
        });

        // 重置按钮逻辑
        const resetBtn = li.querySelector('.reset-btn');
        resetBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log(`O-Maid: [UI] Resetting completion for tour: ${tour.id}`);
            const res = await resetTourCompletion(tour.id);
            if (res.success) {
                showNotification(`任务 "${tour.name}" 的完成状态已重置。`, 'success');
                fetchAllAndRenderLists();
            } else {
                console.error(`O-Maid: [UI] Failed to reset completion for tour: ${tour.id}`, res);
            }
        });

        // 展开/折叠逻辑
        const toggleBtn = li.querySelector('.toggle-steps');
        const stepsList = li.querySelector('.o-maid-steps-list');
        const arrow = li.querySelector('.step-arrow');
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = stepsList.style.display === 'none';
            stepsList.style.display = isHidden ? 'block' : 'none';
            arrow.style.transform = isHidden ? 'rotate(90deg)' : 'rotate(0deg)';
        });

        // 步骤点击定位逻辑
        li.querySelectorAll('.o-maid-step-item:not(.disabled)').forEach(stepItem => {
            const index = parseInt(stepItem.dataset.index);
            const step = tour.steps[index];

            stepItem.addEventListener('click', (e) => {
                e.stopPropagation();

                if (!areUrlsMatching(step.url, window.location.href)) {
                    console.log(`O-Maid: [UI] Step is on a different page. Navigating to: ${step.url}`);
                    const stepNum = step.step || (index + 1);
                    const targetWithHash = appendTourHash(step.url, tour.id, stepNum);
                    startTourState(tour.id, stepNum).then(() => {
                        proceedToNextStep(stepNum).then(() => {
                            window.location.href = targetWithHash;
                        });
                    });
                    return;
                }

                const targetEl = querySelectorAllDeep(step.selector)[0];
                const proxyEl = getProxyElement(targetEl);

                introJs().setOptions({
                    steps: [{
                        element: proxyEl,
                        title: `第 ${index + 1} 步`,
                        intro: step.text || tour.name,
                        position: 'bottom'
                    }],
                    overlayOpacity: 0.5,
                    showStepNumbers: false,
                    showButtons: false,
                    showBullets: false,
                    showProgress: false,
                    scrollPadding: 100,
                    tooltipClass: 'o-maid-custom-tooltip'
                }).onchange(function (targetElement) {
                    setTimeout(() => {
                        const tooltip = document.querySelector('.introjs-tooltip');
                        if (tooltip && targetElement) {
                            const tooltipRect = tooltip.getBoundingClientRect();
                            const elRect = targetElement.getBoundingClientRect();
                            if (!(tooltipRect.bottom < elRect.top || tooltipRect.top > elRect.bottom)) {
                                const currentTop = parseFloat(tooltip.style.top) || 0;
                                tooltip.style.top = (currentTop + (elRect.bottom - tooltipRect.top) + 20) + 'px';
                                const arrow = tooltip.querySelector('.introjs-arrow');
                                if (arrow) arrow.style.display = 'none';
                            }
                        }
                    }, 200);
                }).start();
            });

            // 步骤悬停高亮
            stepItem.addEventListener('mouseenter', () => {
                const elements = querySelectorAllDeep(step.selector);
                elements.forEach(el => el.classList.add('o-maid-selection-highlight'));
            });
            stepItem.addEventListener('mouseleave', () => {
                const elements = querySelectorAllDeep(step.selector);
                elements.forEach(el => el.classList.remove('o-maid-selection-highlight'));
            });
        });

        li.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            switchToView('edit-tour', tour);
        });
        li.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除任务 "${tour.name}" 吗？`)) {
                const res = await deleteTour(tour.id);
                if (res.success) switchToView('view');
            }
        });

        list.appendChild(li);
    });
}

/**
 * 渲染提示列表
 * @param {Array} hints - 提示数组
 */
function renderHintsList(hints) {
    const list = uiPanel.querySelector('#o-maid-hints-list');
    list.innerHTML = '';
    const pageUrl = window.location.href;
    hints.filter(h => areUrlsMatching(h.url, pageUrl)).forEach(hint => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="item-header">
                <div class="item-info preview-trigger" style="cursor: pointer;" title="点击在页面上定位">
                    <div class="name">${hint.text}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-primary btn-sm edit-btn">✎</button>
                    <button class="btn btn-outline-danger btn-sm delete-btn">🗑</button>
                </div>
            </div>
            <div class="item-info">
                <span class="details">${hint.selector}</span>
            </div>
        `;
        li.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            switchToView('edit-hint', hint);
        });
        li.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm(`确定要删除提示 "${hint.text}" 吗？`)) {
                const res = await deleteHoverHint(hint.id);
                if (res.success) switchToView('view');
            }
        });

        // 点击名称定位
        li.querySelector('.preview-trigger').addEventListener('click', () => {
            const elements = querySelectorAllDeep(hint.selector);
            if (elements.length > 0) {
                const proxyEl = getProxyElement(elements[0]);

                introJs().setOptions({
                    steps: [{
                        element: proxyEl,
                        title: '预览提示',
                        intro: hint.text,
                        position: 'bottom'
                    }],
                    overlayOpacity: 0.5,
                    showStepNumbers: false,
                    showButtons: false,
                    showBullets: false,
                    showProgress: false,
                    scrollPadding: 100,
                    tooltipClass: 'o-maid-custom-tooltip'
                }).onchange(function (targetElement) {
                    setTimeout(() => {
                        const tooltip = document.querySelector('.introjs-tooltip');
                        if (tooltip && targetElement) {
                            const tooltipRect = tooltip.getBoundingClientRect();
                            const elRect = targetElement.getBoundingClientRect();
                            if (!(tooltipRect.bottom < elRect.top || tooltipRect.top > elRect.bottom)) {
                                const currentTop = parseFloat(tooltip.style.top) || 0;
                                tooltip.style.top = (currentTop + (elRect.bottom - tooltipRect.top) + 20) + 'px';
                                const arrow = tooltip.querySelector('.introjs-arrow');
                                if (arrow) arrow.style.display = 'none';
                            }
                        }
                    }, 200);
                }).start();
            } else {
                showNotification('未能在当前页面找到该元素。', 'info');
            }
        });

        // 预览功能：悬停时高亮对应元素
        li.addEventListener('mouseenter', () => {
            const elements = querySelectorAllDeep(hint.selector);
            elements.forEach(el => el.classList.add('o-maid-selection-highlight'));
        });
        li.addEventListener('mouseleave', () => {
            const elements = querySelectorAllDeep(hint.selector);
            elements.forEach(el => el.classList.remove('o-maid-selection-highlight'));
        });

        list.appendChild(li);
    });
}

/**
 * 渲染任务构建器步骤
 */
function renderTourBuilderSteps() {
    const listEl = uiPanel.querySelector('#o-maid-tour-steps-list');
    listEl.innerHTML = '';
    uiPanel.querySelector('#o-maid-tour-step-count').textContent = tourBuilderState.steps.length;
    tourBuilderState.steps.forEach((step, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="item-info">
                <div class="name">${index + 1}. ${step.text}</div>
                <span class="step-details">${step.selector}</span>
            </div>
            <div class="item-actions">
                <button class="btn btn-outline-secondary btn-sm move-up-btn" data-index="${index}" ${index === 0 ? 'disabled style="visibility:hidden"' : ''}>↑</button>
                <button class="btn btn-outline-secondary btn-sm move-down-btn" data-index="${index}" ${index === tourBuilderState.steps.length - 1 ? 'disabled style="visibility:hidden"' : ''}>↓</button>
                <button class="btn btn-outline-primary btn-sm edit-step-btn" data-index="${index}">✎</button>
                <button class="btn btn-outline-danger btn-sm delete-step-btn" data-index="${index}">🗑</button>
            </div>
        `;

        li.querySelector('.move-up-btn').addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (idx > 0) {
                const temp = tourBuilderState.steps[idx];
                tourBuilderState.steps[idx] = tourBuilderState.steps[idx - 1];
                tourBuilderState.steps[idx - 1] = temp;
                renderTourBuilderSteps();
            }
        });

        li.querySelector('.move-down-btn').addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            if (idx < tourBuilderState.steps.length - 1) {
                const temp = tourBuilderState.steps[idx];
                tourBuilderState.steps[idx] = tourBuilderState.steps[idx + 1];
                tourBuilderState.steps[idx + 1] = temp;
                renderTourBuilderSteps();
            }
        });

        li.querySelector('.edit-step-btn').addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            switchToView('edit-tour-step', { index: idx, step: tourBuilderState.steps[idx] });
        });
        li.querySelector('.delete-step-btn').addEventListener('click', (e) => {
            tourBuilderState.steps.splice(parseInt(e.target.dataset.index, 10), 1);
            renderTourBuilderSteps();
        });
        listEl.appendChild(li);
    });
}

/**
 * 处理元素选择
 * @param {string} selector - CSS 选择器
 * @param {string} url - URL
 * @param {Object} context - 选择上下文
 */
function handleElementSelection(selector, url, context) {
    const type = context.type;
    const cleanUrl = stripTourHash(url);

    if (type === 'hint') {
        const hintData = itemToEdit || { url: cleanUrl };
        hintData.selector = selector;
        hintData.url = cleanUrl;
        switchToView('edit-hint', hintData);
    } else if (type === 'tour_step') {
        const newStep = { selector, url: cleanUrl, text: '点击编辑此步骤内容' };
        tourBuilderState.steps.push(newStep);
        const newIndex = tourBuilderState.steps.length - 1;
        // 跳转到步骤编辑视图以输入文本
        switchToView('edit-tour-step', { index: newIndex, step: newStep });
    } else if (type === 'tour_step_update') {
        const stepIndex = context.stepIndex;
        if (tourBuilderState && tourBuilderState.steps[stepIndex]) {
            tourBuilderState.steps[stepIndex].selector = selector;
            tourBuilderState.steps[stepIndex].url = cleanUrl;
            // 重新进入编辑步骤视图，更新显示
            switchToView('edit-tour-step', { index: stepIndex, step: tourBuilderState.steps[stepIndex] });
        }
    }
}

/**
 * 保存提示
 */
async function saveHint() {
    const text = uiPanel.querySelector('#o-maid-hint-text').value;
    const selector = uiPanel.querySelector('#o-maid-hint-selector').value;
    console.log('O-Maid: 准备保存提示', { text, selector, itemToEdit });

    if (!text || !selector) {
        showNotification('提示文本和选择器不能为空。', 'error');
        return;
    }

    const action = itemToEdit?.id ? updateHoverHint : addHoverHint;
    console.log('O-Maid: 正在调用存储 Action...');

    try {
        const cleanUrl = stripTourHash(itemToEdit?.url || window.location.href);
        const res = await action({ ...itemToEdit, text, selector, url: cleanUrl });
        console.log('O-Maid: 存储 Action 响应:', res);
        if (res && res.success) {
            switchToView('view');
            showNotification('保存成功', 'success');
        } else {
            console.error('O-Maid: 保存失败', res);
            showNotification('保存失败，请检查后台日志。', 'error');
        }
    } catch (err) {
        console.error('O-Maid: 保存过程中发生错误', err);
        showNotification('保存出错: ' + err.message, 'error');
    }
}

/**
 * 保存任务
 */
async function saveTour() {
    const name = uiPanel.querySelector('#o-maid-tour-name').value;
    if (!name) {
        showNotification('任务名称不能为空。', 'error');
        return;
    }

    tourBuilderState.name = name;
    tourBuilderState.trigger = uiPanel.querySelector('#o-maid-tour-trigger').value;

    const action = tourBuilderState.id ? updateTour : addTour;
    const res = await action(tourBuilderState);
    if (res.success) {
        switchToView('view');
        showNotification('任务保存成功', 'success');
    }
}

/**
 * 保存步骤修改
 */
function saveTourStep() {
    const text = uiPanel.querySelector('#o-maid-tour-step-text').value;
    const selector = uiPanel.querySelector('#o-maid-tour-step-selector').value;

    if (!text || !selector) {
        showNotification('步骤文本和选择器不能为空。', 'error');
        return;
    }

    if (itemToEdit && typeof itemToEdit.index === 'number') {
        tourBuilderState.steps[itemToEdit.index].text = text;
        tourBuilderState.steps[itemToEdit.index].selector = selector;
        switchToView('edit-tour', tourBuilderState);
        showNotification('步骤已更新', 'success');
    }
}

/**
 * 获取当前视图
 * @returns {string} 当前视图名称
 */
export function getCurrentView() {
    return currentView;
}
