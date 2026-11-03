// modules/logger.js - O-Maid 统一日志管理模块

const STORAGE_KEY = 'enable_debug_log';
let isDebugEnabled = false;
let isInitialized = false;

// 缓存原生控制台原生方法的引用
export const rawConsole = {
  log: console.log.bind(console),
  info: (console.info || console.log).bind(console),
  warn: (console.warn || console.log).bind(console),
  debug: (console.debug || console.log).bind(console),
  error: console.error.bind(console)
};

/**
 * 应用或取消对当前上下文 console 的拦截
 * @param {boolean} enabled 是否开启日志输出
 */
function applyConsoleInterception(enabled) {
  isDebugEnabled = !!enabled;
  if (!isDebugEnabled) {
    // 关闭时：log, info, debug, warn 静默处理，保留 error
    console.log = () => {};
    console.info = () => {};
    console.debug = () => {};
    console.warn = () => {};
  } else {
    // 开启时：恢复原生打印能力
    console.log = rawConsole.log;
    console.info = rawConsole.info;
    console.debug = rawConsole.debug;
    console.warn = rawConsole.warn;
  }
}

// 模块加载瞬间先默认保持静默，防止在异步读取 storage 前泄露初始化 log
applyConsoleInterception(false);

/**
 * 初始化日志模块
 * @returns {Promise<boolean>} 当前调试日志开启状态
 */
export async function initLogger() {
  if (isInitialized) {
    return isDebugEnabled;
  }
  isInitialized = true;

  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    isDebugEnabled = !!res[STORAGE_KEY];
  } catch (e) {
    isDebugEnabled = false;
  }

  applyConsoleInterception(isDebugEnabled);

  // 跨页面与后台实时同步变更
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && STORAGE_KEY in changes) {
      const nextVal = !!changes[STORAGE_KEY].newValue;
      applyConsoleInterception(nextVal);
    }
  });

  return isDebugEnabled;
}

/**
 * 查询当前是否允许日志输出
 */
export function isLoggingEnabled() {
  return isDebugEnabled;
}

/**
 * 切换调试日志开关
 * @param {boolean} enabled
 */
export async function setLoggingEnabled(enabled) {
  isDebugEnabled = !!enabled;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: isDebugEnabled });
  } catch (e) {
    // 降级处理回调模式
    chrome.storage.local.set({ [STORAGE_KEY]: isDebugEnabled });
  }
  applyConsoleInterception(isDebugEnabled);
}

/**
 * 统一的 Logger 对象
 */
export const logger = {
  log: (...args) => {
    if (isDebugEnabled) rawConsole.log(...args);
  },
  info: (...args) => {
    if (isDebugEnabled) rawConsole.info(...args);
  },
  warn: (...args) => {
    if (isDebugEnabled) rawConsole.warn(...args);
  },
  debug: (...args) => {
    if (isDebugEnabled) rawConsole.debug(...args);
  },
  error: (...args) => {
    rawConsole.error(...args);
  },
  raw: rawConsole
};
