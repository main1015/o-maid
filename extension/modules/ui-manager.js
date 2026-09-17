// modules/ui-manager.js - UI 面板管理模块

import { areUrlsMatching, querySelectorAllDeep, getProxyElement, appendTourHash, stripTourHash } from './utils.js';
import { getDataForTab, addHoverHint, updateHoverHint, deleteHoverHint, addTour, updateTour, deleteTour, resetTourCompletion, startTourState, proceedToNextStep, refreshSyncedRules } from './communication.js';
import { startSelectionMode, stopSelectionMode } from './element-selector.js';
import { startTour } from './tour-manager.js';
import { createHoverTooltip } from './hover-hints.js';
import * as CloudAPI from './cloud-api.js';

let uiPanel = null;
let uiHost = null;
let shadowRoot = null;
let currentView = 'view';
let currentMainTab = 'view';
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
    panel.style.display = 'none'; // 明确预设初始状态为隐藏，彻底解决第一次点击失效的Bug
    panel.innerHTML = `
    <div class="o-maid-resize-handle" title="${chrome.i18n.getMessage('btnCollapsePanel')}"></div>
    <div class="o-maid-collapse-tab" title="${chrome.i18n.getMessage('btnCollapsePanel')}">
      <div class="o-maid-collapse-tab-icon">📋</div>
    </div>
    <div id="o-maid-panel-header">
      <span id="o-maid-header-title" style="font-weight: bold; display: inline-flex; align-items: center; gap: 6px;"><img src="${chrome.runtime.getURL('icons/icon16.png')}" style="width: 16px; height: 16px; border-radius: 3px;" alt=""> ${chrome.i18n.getMessage('uiTitle')}</span>
      <div id="o-maid-header-buttons">
        <button id="auth-btn" title="${chrome.i18n.getMessage('btnCloudAuth')}">👤</button>
        <button id="settings-btn" title="${chrome.i18n.getMessage('btnSettings')}">⚙️</button>
        <button id="o-maid-collapse-btn" title="${chrome.i18n.getMessage('btnCollapsePanel')}">◀</button>
        <button id="o-maid-export-btn" title="${chrome.i18n.getMessage('btnExport')}">📤</button>
        <button id="o-maid-import-btn" title="${chrome.i18n.getMessage('btnImport')}">📥</button>
        <button id="o-maid-add-new-btn" title="${chrome.i18n.getMessage('btnAdd')}">+</button>
        <button id="o-maid-close-btn" title="${chrome.i18n.getMessage('btnClosePanel')}">×</button>
      </div>
    </div>
    <div id="o-maid-notification" style="display:none;"></div>
    <div id="o-maid-panel-content">
      <!-- 现代一体化分段切换器 (Segmented Control) -->
      <div class="o-maid-segment-bar">
        <button class="tab-btn active" data-tab="view">${chrome.i18n.getMessage('tabLocalRules')}</button>
        <button class="tab-btn" data-tab="cloud">${chrome.i18n.getMessage('tabCloudShared')}</button>
      </div>
      <div id="auth-compact-bar" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding: 0 4px; font-size: 11px; color: #64748b;">
        <span id="auth-banner-text">${chrome.i18n.getMessage('msgCloudNotLoggedIn')}</span>
        <a href="javascript:void(0)" id="auth-banner-btn" style="color: #6366f1; text-decoration: none; font-weight: 500; cursor: pointer;">${chrome.i18n.getMessage('btnLoginNow')}</a>
      </div>

      <!-- View: Main list view -->
      <div id="o-maid-view-view" class="tab-content active">
        <div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center; white-space: nowrap;">
            <span style="flex-shrink: 0;">${chrome.i18n.getMessage('labelScope')} <strong id="local-scope-label">${chrome.i18n.getMessage('scopeCurrentPage')}</strong></span>
            <div style="display: flex; gap: 6px; align-items: center; flex-shrink: 0;">
                <button id="sync-refresh-btn" style="background: #e0e7ff; color: #4338ca; border: none; padding: 2px 6px; border-radius: 4px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 3px; font-weight: 500; white-space: nowrap; flex-shrink: 0;" title="${chrome.i18n.getMessage('titleSyncRefresh')}">
                    <span class="sync-icon">🔄</span> ${chrome.i18n.getMessage('btnRefresh')}
                </button>
                <a href="javascript:void(0)" id="toggle-local-scope-btn" style="color: #6366f1; text-decoration: underline; font-size: 11px; cursor: pointer; white-space: nowrap; flex-shrink: 0;">${chrome.i18n.getMessage('btnViewAll')}</a>
            </div>
        </div>
        <div class="o-maid-list-section">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #eee; background: #fafafa;">
            <h4 class="o-maid-collapsible active" data-target="o-maid-tours-list" style="margin: 0; padding: 0; border: none; background: transparent;">${chrome.i18n.getMessage('titleTours')} <span class="arrow"></span></h4>
            <button id="quick-create-tour-btn" class="o-maid-quick-add-btn" title="${chrome.i18n.getMessage('titleQuickAddTour')}">${chrome.i18n.getMessage('btnQuickAdd')}</button>
          </div>
          <ul id="o-maid-tours-list"></ul>
        </div>
        <div class="o-maid-list-section">
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 15px; border-bottom: 1px solid #eee; background: #fafafa;">
            <h4 class="o-maid-collapsible active" data-target="o-maid-hints-list" style="margin: 0; padding: 0; border: none; background: transparent;">${chrome.i18n.getMessage('titleHints')} <span class="arrow"></span></h4>
            <button id="quick-create-hint-btn" class="o-maid-quick-add-btn" title="${chrome.i18n.getMessage('titleQuickAddHint')}">${chrome.i18n.getMessage('btnQuickAdd')}</button>
          </div>
          <ul id="o-maid-hints-list"></ul>
        </div>
        <div id="local-no-data-container" style="display:none; text-align:center; padding:15px; color:#64748b; font-size:12px;">
            <p id="o-maid-no-data-msg" style="margin:0;">${chrome.i18n.getMessage('msgNoLocalRules')}</p>
            <a href="javascript:void(0)" id="local-empty-view-all-link" style="color:#6366f1; text-decoration:underline; display:inline-block; margin-top:6px; cursor:pointer;">${chrome.i18n.getMessage('linkViewAllLocal')}</a>
        </div>
      </div>

      <!-- View: Cloud Discover -->
      <div id="view-cloud" class="tab-content" style="display:none;">
          <div style="background: #f1f5f9; padding: 6px 10px; border-radius: 6px; margin-bottom: 10px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
              <span>${chrome.i18n.getMessage('labelScope')} <strong id="cloud-scope-label">${chrome.i18n.getMessage('scopeCurrentSite')}</strong></span>
              <a href="javascript:void(0)" id="toggle-cloud-scope-btn" style="color: #6366f1; text-decoration: underline; font-size: 11px; cursor: pointer;">${chrome.i18n.getMessage('linkViewAllCloud')}</a>
          </div>
          <div class="o-maid-list-section">
              <h4 class="o-maid-collapsible active" data-target="cloud-tours-list">${chrome.i18n.getMessage('titleCloudTours')} <span class="arrow"></span></h4>
              <ul id="cloud-tours-list"></ul>
          </div>
          <div class="o-maid-list-section">
              <h4 class="o-maid-collapsible active" data-target="cloud-hints-list">${chrome.i18n.getMessage('titleCloudHints')} <span class="arrow"></span></h4>
              <ul id="cloud-hints-list"></ul>
          </div>
          <button id="refresh-cloud-btn" class="choice-btn">${chrome.i18n.getMessage('btnRefreshCloud')}</button>
          <div id="cloud-no-data-container" style="display:none; text-align:center; padding:15px; color:#64748b; font-size:12px;">
              <p id="cloud-no-data-msg">${chrome.i18n.getMessage('msgNoCloudRulesSite')}</p>
              <a href="javascript:void(0)" id="cloud-empty-view-all-link" style="color:#6366f1; text-decoration:underline; display:inline-block; margin-top:6px; cursor:pointer;">${chrome.i18n.getMessage('linkViewAllCloudRules')}</a>
          </div>
      </div>

      <!-- View: Auth -->
      <div id="view-auth" style="display:none;">
          <h5 style="margin-top:0; font-size:14px; font-weight:600; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:6px;">${chrome.i18n.getMessage('titleAuth')}</h5>
          <div id="auth-status" style="margin-bottom: 10px; font-size: 13px; color: #475569;"></div>
          <div id="auth-form-container">
              <input type="text" id="auth-username" placeholder="${chrome.i18n.getMessage('placeholderUsername')}" style="width: 100%; margin-bottom: 8px; padding: 7px 10px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
              <input type="password" id="auth-password" placeholder="${chrome.i18n.getMessage('placeholderPassword')}" style="width: 100%; margin-bottom: 8px; padding: 7px 10px; box-sizing: border-box; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
              <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                  <button id="login-btn" class="choice-btn" style="flex: 1; margin: 0; padding: 7px; border-radius: 6px; background: #6366f1; color: #fff; border: none; font-weight: 500; cursor: pointer;">${chrome.i18n.getMessage('btnLogin')}</button>
                  <button id="register-btn" class="choice-btn" style="flex: 1; margin: 0; padding: 7px; border-radius: 6px; background: #f8fafc; color: #475569; border: 1px solid #cbd5e1; font-weight: 500; cursor: pointer;">${chrome.i18n.getMessage('btnRegister')}</button>
              </div>
          </div>
          <button id="logout-btn" class="choice-btn" style="display:none; width: 100%; margin-bottom: 12px; background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; border-radius: 6px; padding: 8px; cursor: pointer; font-weight: 500; font-size: 13px;">${chrome.i18n.getMessage('btnLogout')}</button>
          <div style="font-size: 11px; color: #64748b; margin-top: 10px; display: flex; justify-content: space-between; align-items: center; border-top: 1px dashed #eee; padding-top: 8px;">
            <span>${chrome.i18n.getMessage('labelServerAddress')} <code id="auth-current-server" style="color: #6366f1;">http://localhost:3000/api</code></span>
            <a href="javascript:void(0)" id="auth-change-server-link" style="color: #6366f1; text-decoration: underline; cursor: pointer;">${chrome.i18n.getMessage('linkChangePort')}</a>
          </div>
          <hr style="border:none; border-top:1px solid #eee; margin:16px 0;">
          <button id="close-auth-btn" class="cancel-btn" style="width:100%; padding:7px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-size:13px; color:#334155;">${chrome.i18n.getMessage('btnClose')}</button>
      </div>

      <!-- View: Settings -->
      <div id="view-settings" style="display:none;">
          <h5 style="margin-top:0; font-size:14px; font-weight:600; margin-bottom:12px; border-bottom:1px solid #eee; padding-bottom:6px;">${chrome.i18n.getMessage('titleSysSettings')}</h5>
          <label style="font-size:12px; font-weight:600; color:#475569;">${chrome.i18n.getMessage('labelApiBase')}</label>
          <input type="text" id="setting-api-base" placeholder="http://localhost:3000/api" style="width: 100%; margin-top:4px; margin-bottom: 10px; padding: 7px 10px; box-sizing: border-box; border:1px solid #cbd5e1; border-radius:6px; font-size:13px;">
          <button id="save-settings-btn" class="save-btn" style="width: 100%; padding:8px; border-radius:6px; background:#6366f1; color:#fff; border:none; font-weight:600; cursor:pointer; margin-bottom: 16px;">${chrome.i18n.getMessage('btnSaveApiSettings')}</button>
          
          <div style="border-top:1px dashed #e2e8f0; padding-top:12px; margin-bottom:12px;">
            <span style="font-size:12px; font-weight:600; color:#475569; display:block; margin-bottom:8px;">${chrome.i18n.getMessage('labelLocalDataBackup')}</span>
            <div style="display:flex; gap:8px;">
              <button id="o-maid-export-btn" class="btn" style="flex:1; border:1px solid #cbd5e1; background:#f8fafc; padding:6px; border-radius:6px; font-size:12px; cursor:pointer;">${chrome.i18n.getMessage('btnExportJson')}</button>
              <button id="o-maid-import-btn" class="btn" style="flex:1; border:1px solid #cbd5e1; background:#f8fafc; padding:6px; border-radius:6px; font-size:12px; cursor:pointer;">${chrome.i18n.getMessage('btnImportJson')}</button>
            </div>
          </div>
          <hr style="border:none; border-top:1px solid #eee; margin:16px 0;">
          <button id="close-settings-btn" class="cancel-btn" style="width:100%; padding:7px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; cursor:pointer; font-size:13px; color:#334155;">${chrome.i18n.getMessage('btnClose')}</button>
      </div>

      <!-- View: Add Choice -->
      <div id="o-maid-view-add-choice" style="display:none;">
        <h5>${chrome.i18n.getMessage('titleAddChoice')}</h5>
        <button id="o-maid-create-hint-btn" class="choice-btn">${chrome.i18n.getMessage('btnCreateHint')}</button>
        <button id="o-maid-create-tour-btn" class="choice-btn">${chrome.i18n.getMessage('btnCreateTour')}</button>
        <hr style="border:none; border-top:1px solid #eee; margin:16px 0;">
        <button id="o-maid-cancel-creation-btn" class="cancel-btn" style="width:100%;">${chrome.i18n.getMessage('btnCancel')}</button>
      </div>

      <!-- View: Hint Editor -->
      <div id="o-maid-view-edit-hint" style="display:none;">
        <label>${chrome.i18n.getMessage('labelHintText')}</label>
        <textarea id="o-maid-hint-text" rows="4"></textarea>
        <label>${chrome.i18n.getMessage('labelCssSelector')}</label>
        <div class="selector-wrapper">
          <input type="text" id="o-maid-hint-selector" readonly>
          <button id="o-maid-hint-reselect-btn">${chrome.i18n.getMessage('btnReselect')}</button>
        </div>
        <div class="form-actions">
          <button id="o-maid-save-hint-btn" class="save-btn">${chrome.i18n.getMessage('btnSave')}</button>
          <button id="o-maid-cancel-edit-hint-btn" class="cancel-btn">${chrome.i18n.getMessage('btnCancel')}</button>
        </div>
      </div>

      <!-- View: Tour Editor -->
      <div id="o-maid-view-edit-tour" style="display:none;">
        <label>${chrome.i18n.getMessage('labelTourName')}</label>
        <input type="text" id="o-maid-tour-name">
        <label>${chrome.i18n.getMessage('labelTourTrigger')}</label>
        <select id="o-maid-tour-trigger">
          <option value="manual">${chrome.i18n.getMessage('optionManual')}</option>
          <option value="auto">${chrome.i18n.getMessage('optionAuto')}</option>
        </select>
        <div class="o-maid-list-section">
          <h5>${chrome.i18n.getMessage('titleSteps')} (<span id="o-maid-tour-step-count">0</span>)</h5>
          <ul id="o-maid-tour-steps-list"></ul>
        </div>
        <button id="o-maid-tour-add-step-btn" class="choice-btn">${chrome.i18n.getMessage('btnAddStep')}</button>
        <div class="form-actions">
          <button id="o-maid-save-tour-btn" class="save-btn">${chrome.i18n.getMessage('btnSaveTour')}</button>
          <button id="o-maid-cancel-edit-tour-btn" class="cancel-btn">${chrome.i18n.getMessage('btnCancel')}</button>
        </div>
      </div>

      <!-- View: Tour Step Editor -->
      <div id="o-maid-view-edit-tour-step" style="display:none;">
        <label>${chrome.i18n.getMessage('labelStepText')}</label>
        <textarea id="o-maid-tour-step-text" rows="4"></textarea>
        <label>${chrome.i18n.getMessage('labelCssSelector')}</label>
        <div class="selector-wrapper">
          <input type="text" id="o-maid-tour-step-selector" readonly>
          <button id="o-maid-tour-step-reselect-btn">${chrome.i18n.getMessage('btnReselect')}</button>
        </div>
        <div class="form-actions">
          <button id="o-maid-save-tour-step-btn" class="save-btn">${chrome.i18n.getMessage('btnSaveStep')}</button>
          <button id="o-maid-cancel-edit-tour-step-btn" class="cancel-btn">${chrome.i18n.getMessage('btnCancel')}</button>
        </div>
      </div>
    `;
    shadowRoot.appendChild(panel);

    // 添加样式
    addPanelStyles();
    uiPanel = panel;

    wireUpPanelEvents();
    updateAuthUI();

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
    
    /* 顶部Header与按钮美化 */
    #o-maid-panel #o-maid-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 10px 14px;
        background: #ffffff;
        border-bottom: 1px solid #e2e8f0;
    }
    #o-maid-panel #o-maid-header-buttons {
        display: flex;
        gap: 4px;
        align-items: center;
    }
    #o-maid-panel #o-maid-header-buttons button {
        width: 26px;
        height: 26px;
        border: 1px solid #e2e8f0 !important;
        background: #ffffff !important;
        border-radius: 5px !important;
        font-size: 13px !important;
        color: #475569 !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        padding: 0 !important;
        line-height: 1 !important;
        transition: all 0.15s ease !important;
    }
    #o-maid-panel #o-maid-header-buttons button:hover {
        background: #f1f5f9 !important;
        color: #0f172a !important;
        border-color: #cbd5e1 !important;
    }
    #o-maid-panel #o-maid-header-buttons #o-maid-add-new-btn {
        background: #6366f1 !important;
        color: #ffffff !important;
        border-color: #6366f1 !important;
        font-weight: bold !important;
        font-size: 15px !important;
    }
    #o-maid-panel #o-maid-header-buttons #o-maid-add-new-btn:hover {
        background: #4f46e5 !important;
        border-color: #4f46e5 !important;
    }

    /* 现代胶囊分段切换器 (Segmented Control) */
    #o-maid-panel .o-maid-segment-bar {
        display: flex;
        background: #f1f5f9;
        padding: 3px;
        border-radius: 8px;
        margin-bottom: 8px;
        gap: 2px;
    }
    #o-maid-panel .tab-btn {
        flex: 1;
        border: none;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        background: transparent;
        color: #64748b;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    #o-maid-panel .tab-btn.active {
        background: #ffffff;
        color: #0f172a;
        font-weight: 600;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
    }

    /* 卡片操作按钮组（现代优雅微交互风格） */
    #o-maid-panel .item-actions {
        display: flex;
        gap: 5px;
        align-items: center;
    }
    #o-maid-panel .item-actions button {
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 5px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        color: #64748b;
        font-size: 12px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.15s ease;
    }
    #o-maid-panel .item-actions button:hover {
        border-color: #cbd5e1;
        background: #ffffff;
        color: #0f172a;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    #o-maid-panel .item-actions .start-btn {
        background: #ecfdf5;
        border-color: #a7f3d0;
        color: #059669;
    }
    #o-maid-panel .item-actions .start-btn:hover {
        background: #10b981;
        color: #ffffff;
        border-color: #10b981;
    }
    #o-maid-panel .item-actions .publish-btn {
        background: #eef2ff;
        border-color: #c7d2fe;
        color: #6366f1;
    }
    #o-maid-panel .item-actions .publish-btn:hover {
        background: #6366f1;
        color: #ffffff;
        border-color: #6366f1;
    }
    #o-maid-panel .item-actions .edit-btn:hover {
        background: #0284c7;
        color: #ffffff;
        border-color: #0284c7;
    }
    #o-maid-panel .item-actions .delete-btn {
        background: #fff;
        border-color: #fee2e2;
        color: #ef4444;
    }
    #o-maid-panel .item-actions .delete-btn:hover {
        background: #ef4444;
        color: #ffffff;
        border-color: #ef4444;
    }

    #o-maid-panel #o-maid-panel-content label { display: block; margin: 10px 0 5px; font-size: 12px; font-weight: bold; }
    #o-maid-panel #o-maid-panel-content input[type="text"], #o-maid-panel #o-maid-panel-content textarea, #o-maid-panel #o-maid-panel-content select { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; }
    #o-maid-panel .selector-wrapper { display: flex; }
    #o-maid-panel .selector-wrapper input { flex-grow: 1; border-top-right-radius: 0; border-bottom-right-radius: 0; background: #eee; }
    #o-maid-panel .selector-wrapper button { border-top-left-radius: 0; border-bottom-left-radius: 0; }
    #o-maid-panel .form-actions { margin-top: 20px; display:flex; justify-content: flex-end; gap: 10px; }
    #o-maid-panel button.save-btn { background: #6366f1; color: white; border: none; border-radius: 6px; padding: 7px 14px; cursor: pointer; font-weight: 500; }
    #o-maid-panel button.cancel-btn { 
        padding: 7px 14px; 
        border: 1px solid #cbd5e1; 
        background: #ffffff; 
        color: #334155; 
        border-radius: 6px; 
        font-size: 13px; 
        cursor: pointer; 
        transition: all 0.15s ease;
    }
    #o-maid-panel button.cancel-btn:hover { 
        background: #f8fafc; 
        border-color: #94a3b8; 
        color: #0f172a; 
    }
    #o-maid-panel button.choice-btn { display: block; width: 100%; text-align: center; padding: 10px; margin-bottom: 10px; }
    #o-maid-panel #o-maid-tour-steps-list li { background: #f9f9f9; }
    
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

    /* 快捷新建微胶囊按钮 */
    .o-maid-quick-add-btn {
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        background: rgba(13, 110, 253, 0.08) !important;
        color: #0d6efd !important;
        border: 1px solid rgba(13, 110, 253, 0.25) !important;
        border-radius: 12px !important;
        font-size: 11px !important;
        padding: 2px 10px !important;
        line-height: 1.5 !important;
        cursor: pointer !important;
        font-weight: 500 !important;
        white-space: nowrap !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }
    .o-maid-quick-add-btn:hover {
        background: #0d6efd !important;
        color: #ffffff !important;
        border-color: #0d6efd !important;
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 6px rgba(13, 110, 253, 0.3) !important;
    }

    /* 统一卡片操作按钮组 */
    #o-maid-panel .item-actions {
        display: flex !important;
        align-items: center !important;
        gap: 5px !important;
    }
    #o-maid-panel .item-actions button {
        width: 26px !important;
        height: 26px !important;
        min-width: 26px !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 0 !important;
        border-radius: 6px !important;
        font-size: 12px !important;
        cursor: pointer !important;
        border: 1px solid #e2e8f0 !important;
        background: #f8fafc !important;
        color: #475569 !important;
        transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1) !important;
        box-shadow: 0 1px 2px rgba(0,0,0,0.03) !important;
    }
    #o-maid-panel .item-actions button:hover {
        transform: translateY(-1px) !important;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.08) !important;
    }
    #o-maid-panel .item-actions .edit-btn:hover {
        background: #eff6ff !important;
        color: #2563eb !important;
        border-color: #93c5fd !important;
    }
    #o-maid-panel .item-actions .delete-btn:hover {
        background: #fef2f2 !important;
        color: #dc2626 !important;
        border-color: #fca5a5 !important;
    }
    #o-maid-panel .item-actions .start-btn {
        background: #10b981 !important;
        color: #ffffff !important;
        border-color: #059669 !important;
    }
    #o-maid-panel .item-actions .start-btn:hover {
        background: #059669 !important;
        border-color: #047857 !important;
    }
    #o-maid-panel .item-actions .reset-btn:hover {
        background: #f1f5f9 !important;
        color: #1e293b !important;
        border-color: #cbd5e1 !important;
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
    uiPanel.querySelector('#quick-create-tour-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        switchToView('edit-tour');
    });
    uiPanel.querySelector('#quick-create-hint-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        switchToView('edit-hint');
    });
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
    uiPanel.querySelector('#o-maid-cancel-creation-btn').addEventListener('click', () => switchToView('main'));
    uiPanel.querySelector('#o-maid-create-hint-btn').addEventListener('click', () => switchToView('edit-hint'));
    uiPanel.querySelector('#o-maid-create-tour-btn').addEventListener('click', () => switchToView('edit-tour'));

    // Auth & Tabs
    uiPanel.querySelector('#auth-btn')?.addEventListener('click', () => {
        updateAuthUI();
        switchToView('auth');
    });
    uiPanel.querySelector('#close-auth-btn')?.addEventListener('click', () => switchToView('main'));
    uiPanel.querySelector('#auth-change-server-link')?.addEventListener('click', () => {
        uiPanel.querySelector('#setting-api-base').value = CloudAPI.getApiBase();
        switchToView('settings');
    });
    
    // Settings
    uiPanel.querySelector('#settings-btn')?.addEventListener('click', () => {
        uiPanel.querySelector('#setting-api-base').value = CloudAPI.getApiBase();
        switchToView('settings');
    });
    uiPanel.querySelector('#close-settings-btn')?.addEventListener('click', () => switchToView('main'));
    uiPanel.querySelector('#save-settings-btn')?.addEventListener('click', () => {
        const val = uiPanel.querySelector('#setting-api-base').value.trim();
        if(val) {
            CloudAPI.setApiBase(val);
            showNotification(chrome.i18n.getMessage('msgSetSaveSuccess'), 'success');
            switchToView('main');
        } else {
            showNotification(chrome.i18n.getMessage('msgApiEmpty'), 'error');
        }
    });

    // 监听跨页面登录状态变更
    window.addEventListener('o-maid-auth-changed', () => {
        updateAuthUI();
    });

    
    uiPanel.querySelector('#login-btn')?.addEventListener('click', async () => {
        const u = uiPanel.querySelector('#auth-username').value;
        const p = uiPanel.querySelector('#auth-password').value;
        if(!u || !p) return showNotification(chrome.i18n.getMessage('msgInputCredentials'), 'error');
        const res = await CloudAPI.login(u, p);
        if(res.success) {
            showNotification(chrome.i18n.getMessage('msgLoginSuccess'), 'success');
            const pwdInput = uiPanel.querySelector('#auth-password');
            if (pwdInput) pwdInput.value = '';
            updateAuthUI();
        } else {
            showNotification(chrome.i18n.getMessage('msgLoginFailed') + res.error, 'error');
        }
    });

    uiPanel.querySelector('#register-btn')?.addEventListener('click', async () => {
        const u = uiPanel.querySelector('#auth-username').value;
        const p = uiPanel.querySelector('#auth-password').value;
        if(!u || !p) return showNotification(chrome.i18n.getMessage('msgInputCredentials'), 'error');
        const res = await CloudAPI.register(u, p);
        if(res.success) {
            showNotification(chrome.i18n.getMessage('msgRegisterSuccess'), 'success');
        } else {
            showNotification(chrome.i18n.getMessage('msgRegisterFailed') + res.error, 'error');
        }
    });

    uiPanel.querySelector('#logout-btn')?.addEventListener('click', () => {
        CloudAPI.logout();
        updateAuthUI();
        showNotification(chrome.i18n.getMessage('msgLogoutSuccess'), 'success');
    });

    uiPanel.querySelector('#refresh-cloud-btn')?.addEventListener('click', fetchCloudDataAndRender);

    // Banner 快捷登录
    uiPanel.querySelector('#auth-banner-btn')?.addEventListener('click', () => {
        updateAuthUI();
        switchToView('auth');
    });

    const tabBtns = uiPanel.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchMainTab(tabId);
        });
    });

    // 全网大厅切换
    uiPanel.querySelector('#toggle-cloud-scope-btn')?.addEventListener('click', () => {
        isCloudShowAll = !isCloudShowAll;
        fetchCloudDataAndRender();
    });
    uiPanel.querySelector('#cloud-empty-view-all-link')?.addEventListener('click', () => {
        isCloudShowAll = true;
        fetchCloudDataAndRender();
    });

    // 本地库全部规则切换
    uiPanel.querySelector('#toggle-local-scope-btn')?.addEventListener('click', () => {
        isLocalShowAll = !isLocalShowAll;
        fetchAllAndRenderLists();
    });
    uiPanel.querySelector('#local-empty-view-all-link')?.addEventListener('click', () => {
        isLocalShowAll = true;
        fetchAllAndRenderLists();
    });

    // 本地库云端数据同步刷新
    uiPanel.querySelector('#sync-refresh-btn')?.addEventListener('click', handleSyncRefresh);

    // Hint Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-hint-btn').addEventListener('click', () => {
        stopSelectionMode();
        switchToView('main');
    });
    uiPanel.querySelector('#o-maid-save-hint-btn').addEventListener('click', saveHint);
    uiPanel.querySelector('#o-maid-hint-reselect-btn').addEventListener('click', () => {
        startSelectionMode({ type: 'hint' }, handleElementSelection);
    });

    // Tour Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-tour-btn').addEventListener('click', () => {
        stopSelectionMode();
        switchToView('main');
    });
    uiPanel.querySelector('#o-maid-tour-add-step-btn').addEventListener('click', () => {
        tourBuilderState.name = uiPanel.querySelector('#o-maid-tour-name').value;
        tourBuilderState.trigger = uiPanel.querySelector('#o-maid-tour-trigger').value;
        startSelectionMode({ type: 'tour_step' }, handleElementSelection);
    });
    uiPanel.querySelector('#o-maid-save-tour-btn').addEventListener('click', saveTour);

    // Tour Step Editor view
    uiPanel.querySelector('#o-maid-cancel-edit-tour-step-btn').addEventListener('click', () => {
        stopSelectionMode();
        switchToView('edit-tour', tourBuilderState);
    });
    uiPanel.querySelector('#o-maid-save-tour-step-btn').addEventListener('click', saveTourStep);
    uiPanel.querySelector('#o-maid-tour-step-reselect-btn').addEventListener('click', () => {
        const stepIdx = itemToEdit?.index ?? (tourBuilderState.steps.length - 1);
        startSelectionMode({ type: 'tour_step_update', stepIndex: stepIdx }, handleElementSelection);
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
                showNotification(chrome.i18n.getMessage('msgExportSuccess'), "success");
            } else {
                showNotification(chrome.i18n.getMessage('msgExportFailed'), "error");
            }
        } catch (err) {
            showNotification(chrome.i18n.getMessage('msgExportError') + err.message, "error");
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
                showNotification(chrome.i18n.getMessage('msgInvalidDataFormat'), 'error');
                return;
            }

            // 导入数据
            import('./communication.js').then(async (comm) => {
                const res = await comm.importData(data);
                if (res.success) {
                    showNotification(chrome.i18n.getMessage('msgImportSuccess'), "success");
                    fetchAllAndRenderLists();
                } else {
                    showNotification(chrome.i18n.getMessage('msgImportFailed') + (res.error || 'Unknown error'), "error");
                }
            });
        } catch (err) {
            showNotification(chrome.i18n.getMessage('msgParseError') + err.message, "error");
        }
        // 重置 input 以便下次选择同一文件
        event.target.value = '';
    };
    reader.readAsText(file);
}


/**
 * 切换主分段 Tab（本地规则 vs 云端共享）
 * 保证两个列表视图互斥呈现，绝对杜绝同时出现
 * @param {string} tabId - 'view' 或 'cloud'
 */
function switchMainTab(tabId = currentMainTab) {
    currentMainTab = tabId;
    currentView = tabId;

    if (!uiPanel) return;

    // 1. 彻底隐藏所有子视图
    ['auth', 'settings', 'add-choice', 'edit-hint', 'edit-tour', 'edit-tour-step'].forEach(v => {
        const el = uiPanel.querySelector(`#view-${v}`) || uiPanel.querySelector(`#o-maid-view-${v}`);
        if (el) el.style.display = 'none';
    });

    // 2. 确保主视图控制栏显示
    const segmentBar = uiPanel.querySelector('.o-maid-segment-bar');
    if (segmentBar) segmentBar.style.display = 'flex';
    const authBar = uiPanel.querySelector('#auth-compact-bar');
    if (authBar) authBar.style.display = 'flex';
    const addBtn = uiPanel.querySelector('#o-maid-add-new-btn');
    if (addBtn) addBtn.style.display = 'block';

    // 3. 同步 Tab 按钮样式
    const tabBtns = uiPanel.querySelectorAll('.tab-btn');
    tabBtns.forEach(b => {
        const isCurrent = b.getAttribute('data-tab') === tabId;
        b.classList.toggle('active', isCurrent);
        b.style.background = isCurrent ? '#6366f1' : '#f8fafc';
        b.style.color = isCurrent ? '#fff' : '#333';
    });

    // 4. 互斥显隐两个主视图容器
    const localView = uiPanel.querySelector('#o-maid-view-view');
    const cloudView = uiPanel.querySelector('#view-cloud');
    if (tabId === 'view') {
        if (localView) localView.style.display = 'block';
        if (cloudView) cloudView.style.display = 'none';
        fetchAllAndRenderLists();
    } else if (tabId === 'cloud') {
        if (localView) localView.style.display = 'none';
        if (cloudView) cloudView.style.display = 'block';
        fetchCloudDataAndRender();
    }
}

/**
 * 切换视图
 * @param {string} viewName - 视图名称 ('main', 'view', 'cloud', 'settings', 'auth', 'edit-hint', etc.)
 * @param {Object} data - 数据对象
 */
export function switchToView(viewName, data = null) {
    if (!uiPanel) return;

    if (uiPanel.style.display !== 'flex') {
        uiPanel.style.display = 'flex';
    }

    // 主视图切换
    if (viewName === 'view' || viewName === 'cloud') {
        stopSelectionMode();
        uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleMain');
        switchMainTab(viewName);
        return;
    }
    if (viewName === 'main') {
        stopSelectionMode();
        uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleMain');
        switchMainTab(currentMainTab);
        return;
    }

    currentView = viewName;
    itemToEdit = data;

    // 隐藏所有其它视图（严格包含 view 和 cloud 两大主视图）
    ['view', 'cloud', 'add-choice', 'edit-hint', 'edit-tour', 'edit-tour-step', 'auth', 'settings'].forEach(v => {
        const viewEl = uiPanel.querySelector(`#o-maid-view-${v}`) || uiPanel.querySelector(`#view-${v}`);
        if (viewEl) viewEl.style.display = 'none';
    });

    // 隐藏主视图顶部的 Tab 分段栏与快捷账号栏，避免在子视图中产生视觉混乱
    const segmentBar = uiPanel.querySelector('.o-maid-segment-bar');
    if (segmentBar) segmentBar.style.display = 'none';
    const authBar = uiPanel.querySelector('#auth-compact-bar');
    if (authBar) authBar.style.display = 'none';

    // 呈现目标子视图
    const targetView = uiPanel.querySelector(`#o-maid-view-${viewName}`) || uiPanel.querySelector(`#view-${viewName}`);
    if (targetView) targetView.style.display = 'block';

    const addBtn = uiPanel.querySelector('#o-maid-add-new-btn');
    if (addBtn) addBtn.style.display = 'none';

    switch (viewName) {
        case 'add-choice':
            stopSelectionMode();
            uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleCreate');
            break;
        case 'settings':
            stopSelectionMode();
            uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleSettings');
            break;
        case 'auth':
            stopSelectionMode();
            uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleAuth');
            break;
        case 'edit-hint':
            uiPanel.querySelector('#o-maid-header-title').textContent = data ? chrome.i18n.getMessage('dynamicTitleEditHint') : chrome.i18n.getMessage('dynamicTitleNewHint');
            uiPanel.querySelector('#o-maid-hint-text').value = data?.text || '';
            uiPanel.querySelector('#o-maid-hint-selector').value = data?.selector || '';
            if (!data) startSelectionMode({ type: 'hint' }, handleElementSelection);
            break;
        case 'edit-tour':
            uiPanel.querySelector('#o-maid-header-title').textContent = data ? chrome.i18n.getMessage('dynamicTitleEditTour') : chrome.i18n.getMessage('dynamicTitleNewTour');
            tourBuilderState = data ? JSON.parse(JSON.stringify(data)) : { name: '', trigger: 'manual', steps: [] };
            uiPanel.querySelector('#o-maid-tour-name').value = tourBuilderState.name;
            uiPanel.querySelector('#o-maid-tour-trigger').value = tourBuilderState.trigger;
            renderTourBuilderSteps();
            break;
        case 'edit-tour-step':
            uiPanel.querySelector('#o-maid-header-title').textContent = chrome.i18n.getMessage('dynamicTitleEditStep');
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
    stopSelectionMode();
    if (uiPanel) {
        uiPanel.style.display = 'none';
    }
}

/**
 * 切换面板显示/隐藏
 */
export function togglePanel() {
    const isVisible = uiPanel && uiPanel.style.display === 'flex';
    if (isVisible) {
        hidePanel();
    } else {
        showPanel();
    }
}

let isLocalShowAll = false; // 默认仅展示当前网页的规则

/**
 * 获取所有数据并渲染列表
 */
async function fetchAllAndRenderLists() {
    const response = await getDataForTab();
    if (!response || !uiPanel) return;

    const pageUrl = window.location.href;
    const allTours = response.guided_tours || [];
    const allHints = response.hover_hints || [];

    // 引导任务过滤：默认只看属于当前页面的任务
    const filteredTours = isLocalShowAll ? allTours : allTours.filter(tour => {
        return tour.steps && tour.steps.some(step => areUrlsMatching(step.url, pageUrl));
    });

    // 悬停提示过滤：默认只看属于当前页面的提示
    const filteredHints = isLocalShowAll ? allHints : allHints.filter(hint => {
        return areUrlsMatching(hint.url, pageUrl);
    });

    renderToursList(filteredTours, isLocalShowAll);
    renderHintsList(filteredHints, isLocalShowAll);

    const localScopeLabel = uiPanel.querySelector('#local-scope-label');
    const toggleLocalScopeBtn = uiPanel.querySelector('#toggle-local-scope-btn');
    if (localScopeLabel) localScopeLabel.textContent = isLocalShowAll ? chrome.i18n.getMessage('dynamicScopeAll') : chrome.i18n.getMessage('dynamicScopeCurrent');
    if (toggleLocalScopeBtn) toggleLocalScopeBtn.textContent = isLocalShowAll ? chrome.i18n.getMessage('dynamicBtnViewCurrent') : chrome.i18n.getMessage('dynamicBtnViewAll');

    const hasData = (filteredTours.length > 0) || (filteredHints.length > 0);
    const noDataContainer = uiPanel.querySelector('#local-no-data-container');
    const noDataMsg = uiPanel.querySelector('#o-maid-no-data-msg');
    const emptyLink = uiPanel.querySelector('#local-empty-view-all-link');

    if (noDataContainer) noDataContainer.style.display = hasData ? 'none' : 'block';
    if (noDataMsg) {
        noDataMsg.textContent = isLocalShowAll ? chrome.i18n.getMessage('dynamicNoRulesAll') : chrome.i18n.getMessage('dynamicNoRulesCurrent');
    }
    if (emptyLink) {
        emptyLink.style.display = isLocalShowAll ? 'none' : 'inline-block';
    }
}

/**
 * 显示规则同步冲突仲裁模态框
 * @param {Array} conflicts - 冲突规则数组
 * @param {Function} onResolve - 仲裁结果回调 ('overwrite' | 'keep')
 */
function showConflictModal(conflicts, onResolve) {
    let modal = shadowRoot.getElementById('o-maid-conflict-modal');
    if (modal) modal.remove();

    modal = document.createElement('div');
    modal.id = 'o-maid-conflict-modal';
    modal.style.cssText = `
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(2px);
        display: flex; align-items: center; justify-content: center; z-index: 10000;
        padding: 16px; box-sizing: border-box;
    `;

    const itemsHtml = conflicts.map(c => `
        <li style="margin-bottom: 8px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 11px;">
            <div style="font-weight: 600; color: #1e293b; margin-bottom: 2px;">
                ${c.type === 'tour' ? '📌 引导' : '💡 提示'}: ${c.name}
            </div>
            <div style="color: #64748b;">
                原作者: <strong>${c.author || '他人'}</strong> | <span style="color: #b45309; font-weight: 500;">本地已改动，云端有更新</span>
            </div>
        </li>
    `).join('');

    modal.innerHTML = `
        <div style="background: #ffffff; border-radius: 10px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15); width: 100%; max-width: 330px; overflow: hidden; border: 1px solid #cbd5e1;">
            <div style="padding: 12px 14px; background: #fffbeb; border-bottom: 1px solid #fef3c7; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 15px;">⚠️</span>
                <strong style="font-size: 12px; color: #92400e;">规则同步冲突确认</strong>
            </div>
            <div style="padding: 12px 14px; font-size: 11px; color: #475569; line-height: 1.5;">
                <p style="margin: 0 0 8px 0;">检测到以下 <strong>${conflicts.length}</strong> 条规则在本地有定制修改，且云端原作者也更新了新版本：</p>
                <ul style="list-style: none; padding: 0; margin: 0 0 10px 0; max-height: 140px; overflow-y: auto;">
                    ${itemsHtml}
                </ul>
                <p style="margin: 0; color: #64748b;">请选择您的处理决策：</p>
            </div>
            <div style="padding: 10px 14px; background: #f8fafc; border-top: 1px solid #f1f5f9; display: flex; gap: 8px; justify-content: flex-end;">
                <button id="conflict-keep-btn" style="background: #ffffff; color: #475569; border: 1px solid #cbd5e1; padding: 5px 9px; border-radius: 5px; font-size: 11px; cursor: pointer; font-weight: 500;">
                    🛡️ 保留本地修改
                </button>
                <button id="conflict-overwrite-btn" style="background: #6366f1; color: #ffffff; border: none; padding: 5px 11px; border-radius: 5px; font-size: 11px; cursor: pointer; font-weight: 500;">
                    🔄 覆盖本地
                </button>
            </div>
        </div>
    `;

    shadowRoot.getElementById('o-maid-panel').appendChild(modal);

    modal.querySelector('#conflict-keep-btn').addEventListener('click', () => {
        modal.remove();
        onResolve('keep');
    });

    modal.querySelector('#conflict-overwrite-btn').addEventListener('click', () => {
        modal.remove();
        onResolve('overwrite');
    });
}

/**
 * 触发本地已同步规则的云端最新快照刷新
 */
async function handleSyncRefresh() {
    const btn = uiPanel.querySelector('#sync-refresh-btn');
    if (!btn || btn.disabled) return;

    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="sync-icon">⏳</span> 刷新中';

    try {
        const response = await getDataForTab();
        const allTours = response?.guided_tours || [];
        const allHints = response?.hover_hints || [];

        // 筛选存在 cloudId 关联的规则
        const syncedTours = allTours.filter(t => t.cloudId);
        const syncedHints = allHints.filter(h => h.cloudId);

        if (syncedTours.length === 0 && syncedHints.length === 0) {
            showNotification(chrome.i18n.getMessage('msgNoLocalCloudRules'), 'info');
            return;
        }

        // 请求云端比对快照（分离纯净更新与冲突项）
        const syncResult = await CloudAPI.syncCloudRules(allTours, allHints);
        if (!syncResult || !syncResult.success) {
            showNotification(chrome.i18n.getMessage('msgSyncFailed'), 'error');
            return;
        }

        const conflicts = syncResult.conflicts || [];
        const updatedTours = syncResult.updatedTours || [];
        const updatedHints = syncResult.updatedHints || [];

        // 1. 先就地静默更新无冲突的规则
        if (updatedTours.length > 0 || updatedHints.length > 0) {
            await refreshSyncedRules(updatedTours, updatedHints);
        }

        // 2. 如果存在冲突，唤起仲裁模态弹窗
        if (conflicts.length > 0) {
            showConflictModal(conflicts, async (decision) => {
                if (decision === 'overwrite') {
                    // 覆盖本地：放弃本地修改，以云端快照为准覆写
                    const conflictTours = conflicts.filter(c => c.type === 'tour').map(c => ({
                        ...c.localItem,
                        ...c.cloudItem,
                        id: c.localItem.id,
                        resolution: 'overwrite'
                    }));
                    const conflictHints = conflicts.filter(c => c.type === 'hint').map(c => ({
                        ...c.localItem,
                        ...c.cloudItem,
                        id: c.localItem.id,
                        resolution: 'overwrite'
                    }));
                    await refreshSyncedRules(conflictTours, conflictHints);
                    showNotification(chrome.i18n.getMessage('msgSyncConflictRecovered').replace('', conflicts.length), 'success');
                } else {
                    // 保留本地修改：不覆写 steps/text/selector，维持用户定制修改
                    const conflictTours = conflicts.filter(c => c.type === 'tour').map(c => ({
                        ...c.localItem,
                        downloads: c.cloudItem.downloads,
                        resolution: 'keep'
                    }));
                    const conflictHints = conflicts.filter(c => c.type === 'hint').map(c => ({
                        ...c.localItem,
                        downloads: c.cloudItem.downloads,
                        resolution: 'keep'
                    }));
                    await refreshSyncedRules(conflictTours, conflictHints);
                    showNotification(chrome.i18n.getMessage('msgSyncConflictKept').replace('', conflicts.length), 'info');
                }
                await fetchAllAndRenderLists();
            });
        } else {
            // 无任何冲突时的常规反馈
            if (syncResult.updatedCount > 0) {
                showNotification(chrome.i18n.getMessage('msgSyncUpdated').replace('', syncResult.updatedCount), 'success');
            } else {
                showNotification(chrome.i18n.getMessage('msgSyncAllLatest'), 'info');
            }
            await fetchAllAndRenderLists();
        }
    } catch (err) {
        console.error('O-Maid: 同步刷新失败:', err);
        showNotification(chrome.i18n.getMessage('msgSyncError') + (err.message || 'Timeout'), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    }
}

function updateAuthUI() {
    const user = CloudAPI.getUsername();
    const status = uiPanel.querySelector('#auth-status');
    const form = uiPanel.querySelector('#auth-form-container');
    const logoutBtn = uiPanel.querySelector('#logout-btn');
    const bannerText = uiPanel.querySelector('#auth-banner-text');
    const bannerBtn = uiPanel.querySelector('#auth-banner-btn');
    const currentServerEl = uiPanel.querySelector('#auth-current-server');

    if (currentServerEl) {
        currentServerEl.textContent = CloudAPI.getApiBase();
    }

    if(user) {
        if (status) status.textContent = chrome.i18n.getMessage('dynamicStatusLoggedIn').replace('$1', user);
        if (form) form.style.display = 'none';
        if (logoutBtn) logoutBtn.style.display = 'block';
        if (bannerText) bannerText.innerHTML = chrome.i18n.getMessage('dynamicBannerLoggedIn').replace('$1', user);
        if (bannerBtn) bannerBtn.textContent = chrome.i18n.getMessage('dynamicBtnAccountSettings');
    } else {
        if (status) status.textContent = chrome.i18n.getMessage('dynamicStatusNotLoggedIn');
        if (form) form.style.display = 'block';
        if (logoutBtn) logoutBtn.style.display = 'none';
        if (bannerText) bannerText.textContent = chrome.i18n.getMessage('dynamicBannerNotLoggedIn');
        if (bannerBtn) bannerBtn.textContent = chrome.i18n.getMessage('dynamicBtnLoginRegister');
    }
}

let isCloudShowAll = false;

async function fetchCloudDataAndRender() {
    const domain = new URL(window.location.href).hostname;
    const scopeLabel = uiPanel.querySelector('#cloud-scope-label');
    const scopeBtn = uiPanel.querySelector('#toggle-cloud-scope-btn');
    if (scopeLabel) scopeLabel.textContent = isCloudShowAll ? chrome.i18n.getMessage('dynamicScopeCloudAll') : domain;
    if (scopeBtn) scopeBtn.textContent = isCloudShowAll ? chrome.i18n.getMessage('dynamicBtnCloudViewCurrent') : chrome.i18n.getMessage('dynamicBtnCloudViewAll');

    try {
        const guideRes = isCloudShowAll ? await CloudAPI.fetchAllCloudGuides() : await CloudAPI.fetchCloudGuides(domain);
        const hintRes = isCloudShowAll ? await CloudAPI.fetchAllCloudHints() : await CloudAPI.fetchCloudHints(domain);
        
        const guides = guideRes.success ? guideRes.guides : [];
        const hints = hintRes.success ? hintRes.hints : [];
        
        renderCloudToursList(guides);
        renderCloudHintsList(hints);
        
        const noDataContainer = uiPanel.querySelector('#cloud-no-data-container');
        const noDataMsg = uiPanel.querySelector('#cloud-no-data-msg');
        const emptyLink = uiPanel.querySelector('#cloud-empty-view-all-link');

        const isEmpty = (guides.length === 0 && hints.length === 0);
        if (noDataContainer) noDataContainer.style.display = isEmpty ? 'block' : 'none';
        if (noDataMsg) {
            noDataMsg.textContent = isCloudShowAll ? chrome.i18n.getMessage('dynamicNoCloudRulesAll') : chrome.i18n.getMessage('dynamicNoCloudRulesCurrent').replace('$1', domain);
        }
        if (emptyLink) {
            emptyLink.style.display = isCloudShowAll ? 'none' : 'inline-block';
        }
    } catch(e) {
        showNotification(chrome.i18n.getMessage('msgFetchCloudFailed'), 'error');
    }
}

function renderCloudToursList(tours) {
    const list = uiPanel.querySelector('#cloud-tours-list');
    list.innerHTML = '';
    tours.forEach(tour => {
        const li = document.createElement('li');
        const domainBadge = tour.domain ? `<span style="background:rgba(99,102,241,0.12); color:#6366f1; padding:1px 5px; border-radius:3px; font-size:11px; margin-right:5px; font-family:monospace;">${tour.domain}</span>` : '';
        
        let statusBadge = '';
        if (tour.status === 'pending') {
            statusBadge = `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); padding:1px 5px; border-radius:3px; font-size:11px; margin-left:5px;">⏳ 待审核</span>`;
        } else if (tour.status === 'rejected') {
            statusBadge = `<span style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.35); padding:1px 5px; border-radius:3px; font-size:11px; margin-left:5px;">✕ 已驳回</span>`;
        }

        li.innerHTML = `
            <div class="item-header">
                <div class="item-info toggle-steps" style="cursor: pointer;">
                    <div class="name">${domainBadge}${tour.name}${statusBadge}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-primary btn-sm download-btn" title="下载到本地">⬇️</button>
                </div>
            </div>
            <div class="item-meta">
                <span class="details">作者: ${tour.author || '匿名'} | 下载: ${tour.downloads || 0}</span>
            </div>
        `;
        li.querySelector('.download-btn').addEventListener('click', async () => {
            const res = await addTour({...tour, id: undefined, cloudId: tour.id, isDownloaded: true, isSynced: true, trigger: 'manual'});
            if(res.success) {
                CloudAPI.downloadGuide(tour.id);
                showNotification(res.updated ? chrome.i18n.getMessage('msgDownloadOverwrite') : chrome.i18n.getMessage('msgDownloadSuccess'), 'success');
                window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
                fetchAllAndRenderLists();
            }
        });
        list.appendChild(li);
    });
}

function renderCloudHintsList(hints) {
    const list = uiPanel.querySelector('#cloud-hints-list');
    list.innerHTML = '';
    hints.forEach(hint => {
        const li = document.createElement('li');
        const domainBadge = hint.domain ? `<span style="background:rgba(99,102,241,0.12); color:#6366f1; padding:1px 5px; border-radius:3px; font-size:11px; margin-right:5px; font-family:monospace;">${hint.domain}</span>` : '';
        
        let statusBadge = '';
        if (hint.status === 'pending') {
            statusBadge = `<span style="background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.35); padding:1px 5px; border-radius:3px; font-size:11px; margin-left:5px;">⏳ 待审核</span>`;
        } else if (hint.status === 'rejected') {
            statusBadge = `<span style="background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.35); padding:1px 5px; border-radius:3px; font-size:11px; margin-left:5px;">✕ 已驳回</span>`;
        }

        li.innerHTML = `
            <div class="item-header">
                <div class="item-info">
                    <div class="name">${domainBadge}${hint.text}${statusBadge}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-primary btn-sm download-btn" title="下载到本地">⬇️</button>
                </div>
            </div>
            <div class="item-meta">
                <span class="details">作者: ${hint.author || '匿名'} | 下载: ${hint.downloads || 0}</span>
            </div>
        `;
        li.querySelector('.download-btn').addEventListener('click', async () => {
            const res = await addHoverHint({...hint, id: undefined, cloudId: hint.id, isDownloaded: true, isSynced: true});
            if(res.success) {
                CloudAPI.downloadHint(hint.id);
                showNotification(res.updated ? chrome.i18n.getMessage('msgDownloadOverwriteHint') : chrome.i18n.getMessage('msgDownloadSuccess'), 'success');
                window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
                fetchAllAndRenderLists();
            }
        });
        list.appendChild(li);
    });
}

/**
 * 封装行内安全的删除二次确认微交互（彻底避免使用受限或被静默拦截的 window.confirm）
 * @param {HTMLElement} btn - 删除按钮元素
 * @param {string} itemName - 类型名称 ('任务' 或 '提示')
 * @param {Function} onConfirm - 确认后的执行回调
 */
function setupDeleteConfirm(btn, itemName, onConfirm) {
    if (!btn) return;
    let isConfirming = false;
    let autoResetTimer = null;

    const resetToTrash = () => {
        isConfirming = false;
        btn.textContent = '🗑';
        btn.title = `删除此${itemName}`;
        btn.style.background = '#ffffff';
        btn.style.color = '#ef4444';
        btn.style.borderColor = '#fee2e2';
        btn.style.fontWeight = 'normal';
        btn.style.fontSize = '12px';
        btn.disabled = false;
        if (autoResetTimer) {
            clearTimeout(autoResetTimer);
            autoResetTimer = null;
        }
    };

    btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!isConfirming) {
            // 第一次点击：保持 26px 方形尺寸，变成醒目的红底白勾 ✓
            isConfirming = true;
            btn.textContent = '✓';
            btn.title = '再次点击确认删除（3秒后自动取消）';
            btn.style.setProperty('background', '#dc2626', 'important');
            btn.style.setProperty('color', '#ffffff', 'important');
            btn.style.setProperty('border-color', '#b91c1c', 'important');
            btn.style.fontWeight = 'bold';
            btn.style.fontSize = '14px';

            autoResetTimer = setTimeout(resetToTrash, 3000);
        } else {
            // 第二次点击：立即执行删除
            if (autoResetTimer) clearTimeout(autoResetTimer);
            btn.textContent = '...';
            btn.disabled = true;
            try {
                await onConfirm();
            } catch (err) {
                console.error(`删除${itemName}异常:`, err);
                resetToTrash();
            }
        }
    });
}

/**
 * 渲染任务列表
 * @param {Array} tours - 任务数组
 */
function renderToursList(tours, isShowAll = false) {
    const list = uiPanel.querySelector('#o-maid-tours-list');
    list.innerHTML = '';
    tours.forEach(tour => {
        const li = document.createElement('li');
        const isRelevant = tour.steps.some(step => areUrlsMatching(step.url, window.location.href));
        let domainBadge = '';
        if (isShowAll && !isRelevant && tour.steps[0]?.url) {
            try {
                const d = new URL(tour.steps[0].url).hostname;
                domainBadge = `<span style="background:rgba(99,102,241,0.12); color:#6366f1; padding:1px 5px; border-radius:3px; font-size:11px; margin-right:5px; font-family:monospace;">${d}</span>`;
            } catch(e){}
        }
        // 云端状态识别判断
        const isDownloaded = !!tour.isDownloaded;
        const isSynced = !!(tour.isSynced || (tour.cloudId && !isDownloaded));
        const isModified = !!tour.isLocallyModified;

        let modifiedBadge = '';
        if (isModified) {
            modifiedBadge = `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 1px 5px; border-radius: 4px; font-size: 10px; margin-left: 6px; font-weight: 500;" title="本地已有二次编辑修改">⚠️ 本地已修改</span>`;
        }

        let cloudIcon = '☁️';
        let cloudTitle = '未同步：点击发布到云端';
        let cloudBtnStyle = 'opacity: 0.65;';

        if (isDownloaded) {
            cloudIcon = '🌐';
            cloudTitle = `来自云端共享 (作者: ${tour.author || '他人'})：受所有权保护`;
            cloudBtnStyle = 'border-color: #0284c7; color: #0284c7; background: rgba(14, 165, 233, 0.08);';
        } else if (isSynced) {
            cloudIcon = '☁️✓';
            cloudTitle = '已同步至云端：点击更新云端数据';
            cloudBtnStyle = 'border-color: #10b981; color: #10b981; background: rgba(16, 185, 129, 0.08); font-weight: bold;';
        }

        li.innerHTML = `
            <div class="item-header">
                <div class="item-info toggle-steps" style="cursor: pointer;" title="点击展开/折叠步骤">
                    <span class="step-arrow">▶</span>
                    <div class="name">${domainBadge}${tour.name}${modifiedBadge}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-secondary btn-sm reset-btn" title="重置完成状态">↺</button>
                    <button class="btn btn-success btn-sm start-btn" title="${isRelevant ? '开始任务' : '跳转并开始任务'}">▶</button>
                    <button class="btn btn-outline-primary btn-sm publish-btn" style="${cloudBtnStyle}" title="${cloudTitle}">${cloudIcon}</button>
                    <button class="btn btn-outline-primary btn-sm edit-btn" title="编辑此任务">✎</button>
                    <button class="btn btn-outline-danger btn-sm delete-btn" title="删除此任务">🗑</button>
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

        // 发布/更新按钮逻辑
        const publishBtn = li.querySelector('.publish-btn');
        publishBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if(!CloudAPI.getUsername()) {
                showNotification(chrome.i18n.getMessage('msgPublishNeedLogin'), 'error');
                updateAuthUI();
                switchToView('auth');
                return;
            }

            // 原作者写保护：非原作者不可覆盖云端规则
            if (tour.isDownloaded && tour.author && tour.author !== CloudAPI.getUsername()) {
                showNotification(`该规则由 [${tour.author}] 共享，不可直接覆盖原版。如需分享，请新建或另存为专属规则`, 'error', 4000);
                return;
            }

            try {
                const domain = new URL(tour.steps[0]?.url || tour.startUrl || window.location.href).hostname;
                const cloudTour = {
                    id: tour.cloudId || tour.id,
                    name: tour.name,
                    startUrl: tour.steps[0]?.url || tour.startUrl,
                    domain: domain,
                    steps: tour.steps
                };
                const res = await CloudAPI.publishGuide(cloudTour);
                if(res.error) showNotification(chrome.i18n.getMessage('msgPublishFailed') + res.error, 'error');
                else {
                    if (res.status === 'pending') {
                        showNotification(res.message || chrome.i18n.getMessage('msgPublishPending'), 'warning', 4000);
                    } else {
                        showNotification(chrome.i18n.getMessage('msgPublishSuccess'), 'success');
                    }
                    await updateTour({ ...tour, cloudId: res.id || tour.cloudId || tour.id, isSynced: true });
                    fetchAllAndRenderLists();
                }
            } catch(e) {
                showNotification(chrome.i18n.getMessage('msgPublishException'), 'error');
            }
        });

        // 重置按钮逻辑
        const resetBtn = li.querySelector('.reset-btn');
        resetBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            console.log(`O-Maid: [UI] Resetting completion for tour: ${tour.id}`);
            const res = await resetTourCompletion(tour.id);
            if (res.success) {
                showNotification(chrome.i18n.getMessage('msgTourResetSuccess').replace('', tour.name), 'success');
                window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
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
        setupDeleteConfirm(li.querySelector('.delete-btn'), '任务', async () => {
            const res = await deleteTour(tour.id);
            if (res && res.success) {
                showNotification(chrome.i18n.getMessage('msgTourDeleteSuccess').replace('', tour.name), 'success');
                window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
                fetchAllAndRenderLists();
            } else {
                showNotification(`删除失败: ${res?.error || '存储异常'}`, 'error');
            }
        });

        list.appendChild(li);
    });
}

/**
 * 渲染提示列表
 * @param {Array} hints - 提示数组
 */
function renderHintsList(hints, isShowAll = false) {
    const list = uiPanel.querySelector('#o-maid-hints-list');
    list.innerHTML = '';
    hints.forEach(hint => {
        const isCurrent = areUrlsMatching(hint.url, window.location.href);
        let domainBadge = '';
        if (isShowAll && !isCurrent && hint.url) {
            try {
                const d = new URL(hint.url).hostname;
                domainBadge = `<span style="background:rgba(99,102,241,0.12); color:#6366f1; padding:1px 5px; border-radius:3px; font-size:11px; margin-right:5px; font-family:monospace;">${d}</span>`;
            } catch(e){}
        }
        // 云端状态识别判断
        const isDownloaded = !!hint.isDownloaded;
        const isSynced = !!(hint.isSynced || (hint.cloudId && !isDownloaded));
        const isModified = !!hint.isLocallyModified;

        let modifiedBadge = '';
        if (isModified) {
            modifiedBadge = `<span style="background: #fffbeb; color: #b45309; border: 1px solid #fde68a; padding: 1px 5px; border-radius: 4px; font-size: 10px; margin-left: 6px; font-weight: 500;" title="本地已有二次编辑修改">⚠️ 本地已修改</span>`;
        }

        let cloudIcon = '☁️';
        let cloudTitle = '未同步：点击发布到云端';
        let cloudBtnStyle = 'opacity: 0.65;';

        if (isDownloaded) {
            cloudIcon = '🌐';
            cloudTitle = `来自云端共享 (作者: ${hint.author || '他人'})：受所有权保护`;
            cloudBtnStyle = 'border-color: #0284c7; color: #0284c7; background: rgba(14, 165, 233, 0.08);';
        } else if (isSynced) {
            cloudIcon = '☁️✓';
            cloudTitle = '已同步至云端：点击更新云端数据';
            cloudBtnStyle = 'border-color: #10b981; color: #10b981; background: rgba(16, 185, 129, 0.08); font-weight: bold;';
        }

        const li = document.createElement('li');
        li.innerHTML = `
            <div class="item-header">
                <div class="item-info preview-trigger" style="cursor: pointer;" title="点击在页面上定位">
                    <div class="name">${domainBadge}${hint.text}${modifiedBadge}</div>
                </div>
                <div class="item-actions">
                    <button class="btn btn-outline-primary btn-sm publish-btn" style="${cloudBtnStyle}" title="${cloudTitle}">${cloudIcon}</button>
                    <button class="btn btn-outline-primary btn-sm edit-btn" title="编辑此提示">✎</button>
                    <button class="btn btn-outline-danger btn-sm delete-btn" title="删除此提示">🗑</button>
                </div>
            </div>
            <div class="item-info">
                <span class="details">${hint.selector}</span>
            </div>
        `;
        li.querySelector('.publish-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            if(!CloudAPI.getUsername()) {
                showNotification(chrome.i18n.getMessage('msgPublishNeedLogin'), 'error');
                updateAuthUI();
                switchToView('auth');
                return;
            }

            // 原作者写保护：非原作者不可覆盖云端规则
            if (hint.isDownloaded && hint.author && hint.author !== CloudAPI.getUsername()) {
                showNotification(`该规则由 [${hint.author}] 共享，不可直接覆盖原版。如需分享，请新建或另存为专属规则`, 'error', 4000);
                return;
            }

            try {
                const domain = new URL(hint.url || window.location.href).hostname;
                const cloudHint = {
                    id: hint.cloudId || hint.id,
                    url: hint.url,
                    domain: domain,
                    selector: hint.selector,
                    text: hint.text
                };
                const res = await CloudAPI.publishHint(cloudHint);
                if(res.error) showNotification(chrome.i18n.getMessage('msgPublishFailed') + res.error, 'error');
                else {
                    if (res.status === 'pending') {
                        showNotification(res.message || chrome.i18n.getMessage('msgPublishPending'), 'warning', 4000);
                    } else {
                        showNotification(chrome.i18n.getMessage('msgPublishSuccess'), 'success');
                    }
                    await updateHoverHint({ ...hint, cloudId: res.id || hint.cloudId || hint.id, isSynced: true });
                    fetchAllAndRenderLists();
                }
            } catch(e) {
                showNotification(chrome.i18n.getMessage('msgPublishException'), 'error');
            }
        });
        li.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            switchToView('edit-hint', hint);
        });
        setupDeleteConfirm(li.querySelector('.delete-btn'), '提示', async () => {
            const res = await deleteHoverHint(hint.id);
            if (res && res.success) {
                showNotification(chrome.i18n.getMessage('msgHintDeleteSuccess'), 'success');
                window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
                fetchAllAndRenderLists();
            } else {
                showNotification(`删除失败: ${res?.error || '存储异常'}`, 'error');
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
                showNotification(chrome.i18n.getMessage('msgElementNotFound'), 'info');
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

    // 确保彻底清除选择横幅与模式
    stopSelectionMode();

    if (type === 'hint') {
        const hintData = itemToEdit || { url: cleanUrl };
        hintData.selector = selector;
        hintData.url = cleanUrl;
        switchToView('edit-hint', hintData);
        showNotification(chrome.i18n.getMessage('msgElementSelectedHint'), 'success');
    } else if (type === 'tour_step') {
        const newStep = { selector, url: cleanUrl, text: '' };
        tourBuilderState.steps.push(newStep);
        const newIndex = tourBuilderState.steps.length - 1;
        // 跳转到步骤编辑视图以输入文本
        switchToView('edit-tour-step', { index: newIndex, step: newStep });
        showNotification(chrome.i18n.getMessage('msgElementSelectedTour'), 'success');
    } else if (type === 'tour_step_update') {
        const stepIndex = context.stepIndex;
        if (tourBuilderState && tourBuilderState.steps[stepIndex]) {
            tourBuilderState.steps[stepIndex].selector = selector;
            tourBuilderState.steps[stepIndex].url = cleanUrl;
            // 重新进入编辑步骤视图，更新显示
            switchToView('edit-tour-step', { index: stepIndex, step: tourBuilderState.steps[stepIndex] });
            showNotification(chrome.i18n.getMessage('msgStepElementUpdated'), 'success');
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
        showNotification(chrome.i18n.getMessage('msgFillRequiredFields'), 'error');
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
            showNotification(chrome.i18n.getMessage('msgSaveSuccess'), 'success');
            window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
        } else {
            console.error('O-Maid: 保存失败', res);
            showNotification(chrome.i18n.getMessage('msgSaveFailedLog'), 'error');
        }
    } catch (err) {
        console.error('O-Maid: 保存过程中发生错误', err);
        showNotification(chrome.i18n.getMessage('msgSaveError') + err.message, 'error');
    }
}

/**
 * 保存任务
 */
async function saveTour() {
    const name = uiPanel.querySelector('#o-maid-tour-name').value;
    tourBuilderState.name = name;
    tourBuilderState.trigger = uiPanel.querySelector('#o-maid-tour-trigger').value;

    if (!tourBuilderState.name || tourBuilderState.steps.length === 0) {
        showNotification(chrome.i18n.getMessage('msgFillRequiredFields'), 'error');
        return;
    }

    const action = tourBuilderState.id ? updateTour : addTour;
    const res = await action(tourBuilderState);
    if (res.success) {
        switchToView('view');
        showNotification(chrome.i18n.getMessage('msgTourSaveSuccess'), 'success');
        window.dispatchEvent(new CustomEvent('o-maid-data-changed'));
    }
}

/**
 * 保存步骤修改
 */
function saveTourStep() {
    const text = uiPanel.querySelector('#o-maid-tour-step-text').value;
    const selector = uiPanel.querySelector('#o-maid-tour-step-selector').value;

    if (!text || !selector) {
        showNotification(chrome.i18n.getMessage('msgFillRequiredFields'), 'error');
        return;
    }

    if (itemToEdit && typeof itemToEdit.index === 'number') {
        tourBuilderState.steps[itemToEdit.index].text = text;
        tourBuilderState.steps[itemToEdit.index].selector = selector;
        switchToView('edit-tour', tourBuilderState);
        showNotification(chrome.i18n.getMessage('msgStepUpdated'), 'success');
    }
}

/**
 * 获取当前视图
 * @returns {string} 当前视图名称
 */
export function getCurrentView() {
    return currentView;
}
