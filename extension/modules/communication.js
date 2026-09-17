// modules/communication.js - 与 background 通信模块

let port = null;
const messageHandlers = new Map();

/**
 * 建立与 background 的连接
 */
export function connectPort() {
    if (port) return;

    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 正在尝试连接到 background...`);

    port = chrome.runtime.connect({ name: 'o-maid-content' });
    port.onMessage.addListener(handlePortMessage);
    port.onDisconnect.addListener(() => {
        if (chrome.runtime.lastError) {
            console.log('O-Maid: [Content] Port 连接断开已捕获:', chrome.runtime.lastError.message);
        }
        port = null;
        console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 连接已断开。`);
    });
}

/**
 * 处理来自 port 的消息
 * @param {Object} msg - 消息对象
 */
function handlePortMessage(msg) {
    const isTop = window.self === window.top;
    console.log(`O-Maid: [${isTop ? 'Top' : 'Iframe'}] 收到 Port 消息:`, msg.action);
    const handler = messageHandlers.get(msg.action);
    if (handler) {
        handler(msg);
    }
}

/**
 * 注册消息处理器
 * @param {string} action - 消息动作
 * @param {Function} handler - 处理函数
 */
export function registerMessageHandler(action, handler) {
    messageHandlers.set(action, handler);
}

/**
 * 安全地发送消息到 background
 * @param {Object} message - 消息对象
 */
export function postPortMessage(message) {
    if (!port) {
        connectPort();
    }

    try {
        port.postMessage(message);
    } catch (e) {
        console.error("O-Maid: Port communication failed. Retrying once.", e);
        port = null;
        connectPort();
        try {
            port.postMessage(message);
        } catch (e2) {
            console.error("O-Maid: Failed to send message on retry. The background service might be down.", e2);
        }
    }
}

/**
 * 发送消息到 background 并等待响应 (MV3 Promise 风格)
 * @param {Object} message - 消息对象
 * @returns {Promise} 响应 Promise
 */
export async function sendMessage(message) {
    try {
        // 在 MV3 中，如果不传递回调函数，sendMessage 会返回一个 Promise
        const response = await chrome.runtime.sendMessage(message);
        return response;
    } catch (e) {
        console.error(`O-Maid: sendMessage [${message.action}] 失败:`, e);

        // 特殊处理：扩展上下文失效（通常是因为插件重新加载了）
        if (e.message.includes('context invalidated')) {
            const msg = chrome.i18n.getMessage('msgPluginReloaded') || "O-Maid 插件已在后台更新或重新加载。请刷新当前页面以继续使用。";
            console.error(`O-Maid: ${msg}`);
            // 弹出提示（可选，为了不干扰用户可以只在控制台显示，但既然报错了，弹窗更明确）
            if (window.confirm(`${msg}\n${chrome.i18n.getMessage('msgConfirmRefresh') || '是否现在刷新页面？'}`)) {
                window.location.reload();
            }
        }

        // 返回一个统一的错误格式，防止调用方挂起
        return { success: false, error: e.message };
    }
}

/**
 * 获取当前标签页的数据
 * @returns {Promise<Object>} 数据对象
 */
export async function getDataForTab() {
    return sendMessage({ action: 'getDataForTab' });
}

/**
 * 标记任务为已完成
 * @param {string} tourId - 任务 ID
 */
export async function markTourAsCompleted(tourId) {
    return sendMessage({ action: 'markTourAsCompleted', tourId });
}

/**
 * 重置任务完成状态
 * @param {string} tourId - 任务 ID
 */
export async function resetTourCompletion(tourId) {
    return sendMessage({ action: 'resetTourCompletion', tourId });
}

/**
 * 开始任务状态追踪
 * @param {string} tourId - 任务 ID
 */
export async function startTourState(tourId) {
    return sendMessage({ action: 'startTourState', tourId });
}

/**
 * 停止任务状态追踪
 */
export async function stopTourState() {
    return sendMessage({ action: 'stopTourState' });
}

/**
 * 进入下一步
 * @param {number} nextStep - 下一步编号
 */
export async function proceedToNextStep(nextStep) {
    return sendMessage({ action: 'proceedToNextStep', nextStep });
}

/**
 * 广播开始选择模式
 */
export async function broadcastStartSelection() {
    return sendMessage({ action: 'broadcastStartSelection' });
}

/**
 * 广播停止选择模式
 * @param {boolean} keepContext - 是否保留上下文
 */
export async function broadcastStopSelection(keepContext = false) {
    return sendMessage({ action: 'broadcastStopSelection', keepContext });
}

/**
 * 添加悬停提示
 * @param {Object} hint - 提示对象
 */
export async function addHoverHint(hint) {
    return sendMessage({ action: 'addHoverHint', hint });
}

/**
 * 更新悬停提示
 * @param {Object} hint - 提示对象
 */
export async function updateHoverHint(hint) {
    return sendMessage({ action: 'updateHoverHint', hint });
}

/**
 * 删除悬停提示
 * @param {string} hintId - 提示 ID
 */
export async function deleteHoverHint(hintId) {
    return sendMessage({ action: 'deleteHoverHint', hintId });
}

/**
 * 添加引导任务
 * @param {Object} tour - 任务对象
 */
export async function addTour(tour) {
    return sendMessage({ action: 'addTour', tour });
}

/**
 * 更新引导任务
 * @param {Object} tour - 任务对象
 */
export async function updateTour(tour) {
    return sendMessage({ action: 'updateTour', tour });
}

/**
 * 删除引导任务
 * @param {string} tourId - 任务 ID
 */
export async function deleteTour(tourId) {
    return sendMessage({ action: 'deleteTour', tourId });
}

/**
 * 通知 iframe 中选择了元素
 * @param {string} selector - 选择器
 * @param {string} url - URL
 */
export async function elementSelectedInFrame(selector, url) {
    return sendMessage({ action: 'elementSelectedInFrame', selector, url });
}

/**
 * 发送高亮坐标到 top frame
 * @param {Object} rect - 坐标对象
 */
export async function sendHighlightRect(rect) {
    return sendMessage({ action: 'sendHighlightRect', rect });
}

/**
 * 导入所有数据
 * @param {Object} data - 数据对象
 */
export async function importData(data) {
    return sendMessage({ action: 'importData', data });
}

/**
 * 导出所有数据
 */
export async function exportData() {
    return sendMessage({ action: 'exportData' });
}

/**
 * 刷新与云端同步的规则
 * @param {Array} updatedTours - 更新的引导流程
 * @param {Array} updatedHints - 更新的悬停提示
 */
export async function refreshSyncedRules(updatedTours, updatedHints) {
    return sendMessage({ action: 'refreshSyncedRules', updatedTours, updatedHints });
}

