// modules/i18n.js - 增强型国际化与动态语言切换模块

export const SUPPORTED_LOCALES = [
  { code: 'auto', name: '🌐 Auto' },
  { code: 'zh_CN', name: '🇨🇳 简体中文' },
  { code: 'en', name: '🇺🇸 English' },
  { code: 'ja', name: '🇯🇵 日本語' },
  { code: 'ko', name: '🇰🇷 한국어' },
  { code: 'ru', name: '🇷🇺 Русский' },
  { code: 'de', name: '🇩🇪 Deutsch' },
  { code: 'fr', name: '🇫🇷 Français' },
  { code: 'es', name: '🇪🇸 Español' },
  { code: 'pt_BR', name: '🇧🇷 Português' },
  { code: 'hi', name: '🇮🇳 हिंदी' },
  { code: 'bn', name: '🇧🇩 বাংলা' },
  { code: 'ar', name: '🇸🇦 العربية' }
];

export function getSupportedLocales() {
  const autoName = getMessage('langAuto') || '🌐 Auto';
  return [
    { code: 'auto', name: autoName },
    ...SUPPORTED_LOCALES.slice(1)
  ];
}

const STORAGE_KEY = 'user_locale';
let currentLocale = 'auto';
let customDictionary = {};
let isInitialized = false;

// 保留原生 chrome.i18n.getMessage 的安全引用
const nativeGetMessage = (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage)
  ? chrome.i18n.getMessage.bind(chrome.i18n)
  : (key) => key;

/**
 * 获取翻译文本 (支持自定义语言包与原生 fallback)
 * @param {string} key
 * @param {string|string[]} [substitutions]
 * @returns {string}
 */
export function getMessage(key, substitutions) {
  if (currentLocale !== 'auto' && customDictionary && customDictionary[key]) {
    let msg = customDictionary[key].message || '';
    if (substitutions !== undefined) {
      const subs = Array.isArray(substitutions) ? substitutions : [substitutions];
      subs.forEach((sub, idx) => {
        msg = msg.replace(new RegExp(`\\$${idx + 1}`, 'g'), sub);
      });
    }
    return msg;
  }
  return nativeGetMessage(key, substitutions) || '';
}

// 统一对当前上下文的 chrome.i18n.getMessage 进行透明代理包装
if (typeof chrome !== 'undefined' && chrome.i18n) {
  chrome.i18n.getMessage = getMessage;
}

/**
 * 动态加载对应语言包的 messages.json 字典
 */
async function loadDictionary(locale) {
  if (!locale || locale === 'auto') {
    customDictionary = {};
    return;
  }
  try {
    const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
    const resp = await fetch(url);
    if (resp.ok) {
      customDictionary = await resp.json();
    }
  } catch (e) {
    customDictionary = {};
  }
}

/**
 * 初始化 i18n
 */
export async function initI18n() {
  if (isInitialized) return currentLocale;
  isInitialized = true;

  try {
    const res = await chrome.storage.local.get(STORAGE_KEY);
    currentLocale = res[STORAGE_KEY] || 'auto';
  } catch (e) {
    currentLocale = 'auto';
  }

  if (currentLocale !== 'auto') {
    await loadDictionary(currentLocale);
  }

  // 跨页面与后台实时同步语言配置
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener(async (changes, areaName) => {
      if (areaName === 'local' && STORAGE_KEY in changes) {
        const newLocale = changes[STORAGE_KEY].newValue || 'auto';
        if (newLocale !== currentLocale) {
          currentLocale = newLocale;
          await loadDictionary(currentLocale);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('o-maid-locale-changed', { detail: { locale: currentLocale } }));
          }
        }
      }
    });
  }

  return currentLocale;
}

/**
 * 获取当前设置的语言
 */
export function getCurrentLocale() {
  return currentLocale;
}

/**
 * 切换并保存界面语言
 */
export async function setLocale(locale) {
  currentLocale = locale || 'auto';
  await loadDictionary(currentLocale);
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: currentLocale });
  } catch (e) {
    chrome.storage.local.set({ [STORAGE_KEY]: currentLocale });
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('o-maid-locale-changed', { detail: { locale: currentLocale } }));
  }
}

/**
 * 遍历带有 data-i18n 属性的元素，并自动填充本地化文本
 * @param {Document|Element} context 搜索的上下文根节点
 */
export function localizeHtml(context = document) {
  const elements = context.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const message = getMessage(key);
    if (message) {
      el.innerHTML = message;
    }
  });

  // 处理输入框占位符
  const placeholders = context.querySelectorAll('[data-i18n-placeholder]');
  placeholders.forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const message = getMessage(key);
    if (message) {
      el.placeholder = message;
    }
  });

  // 处理 title 属性 (悬停提示)
  const titles = context.querySelectorAll('[data-i18n-title]');
  titles.forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const message = getMessage(key);
    if (message) {
      el.title = message;
    }
  });
}
