// modules/storage-api.js - 数据存储 API 模块

/**
 * 获取标签页数据
 * @param {Function} sendResponse - 响应回调
 */
export function getDataForTab(sendResponse) {
    chrome.storage.local.get(['guided_tours', 'hover_hints', 'tour_completions'], (result) => {
        sendResponse({
            guided_tours: result.guided_tours || [],
            hover_hints: result.hover_hints || [],
            tour_completions: result.tour_completions || {}
        });
    });
}

/**
 * 标记任务为已完成
 * @param {string} tourId - 任务 ID
 * @param {Function} sendResponse - 响应回调
 */
export function markTourAsCompleted(tourId, sendResponse) {
    if (!tourId) {
        sendResponse({ success: false });
        return;
    }

    chrome.storage.local.get('tour_completions', (data) => {
        const completions = data.tour_completions || {};
        completions[tourId] = true;
        chrome.storage.local.set({ tour_completions: completions }, () => {
            console.log(`Tour ${tourId} marked as completed.`);
            sendResponse({ success: true });
        });
    });
}

/**
 * 重置任务完成状态
 * @param {string} tourId - 任务 ID
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function resetTourCompletion(tourId, sendResponse, broadcastCallback) {
    if (!tourId) {
        sendResponse({ success: false });
        return;
    }

    chrome.storage.local.get('tour_completions', (data) => {
        const completions = data.tour_completions || {};
        const wasCompleted = !!completions[tourId];
        delete completions[tourId];
        chrome.storage.local.set({ tour_completions: completions }, () => {
            console.log(`O-Maid: [Storage] Tour ${tourId} completion status reset. (Was completed: ${wasCompleted})`);
            sendResponse({ success: true });
            broadcastCallback();
        });
    });
}

/**
 * 添加引导任务
 * @param {Object} tour - 任务对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function addTour(tour, sendResponse, broadcastCallback) {
    const newTour = { ...tour };
    newTour.id = `tour-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    chrome.storage.local.get('guided_tours', (data) => {
        const tours = data.guided_tours || [];
        tours.push(newTour);
        chrome.storage.local.set({ guided_tours: tours }, () => {
            sendResponse({ success: true, tour: newTour });
            broadcastCallback();
        });
    });
}

/**
 * 更新引导任务
 * @param {Object} tour - 任务对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function updateTour(tour, sendResponse, broadcastCallback) {
    chrome.storage.local.get('guided_tours', (data) => {
        let tours = data.guided_tours || [];
        const index = tours.findIndex(t => t.id === tour.id);
        if (index !== -1) {
            tours[index] = tour;
            chrome.storage.local.set({ guided_tours: tours }, () => {
                sendResponse({ success: true });
                broadcastCallback();
            });
        } else {
            sendResponse({ success: false, error: "Tour not found" });
        }
    });
}

/**
 * 根据 ID 获取引导任务
 * @param {string} tourId - 任务 ID
 * @param {Function} callback - 回调函数
 */
export function getTourById(tourId, callback) {
    chrome.storage.local.get('guided_tours', (data) => {
        const tours = data.guided_tours || [];
        const tour = tours.find(t => t.id === tourId);
        callback(tour);
    });
}

/**
 * 删除引导任务
 * @param {string} tourId - 任务 ID
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function deleteTour(tourId, sendResponse, broadcastCallback) {
    chrome.storage.local.get('guided_tours', (data) => {
        let tours = data.guided_tours || [];
        const updatedTours = tours.filter(t => t.id !== tourId);
        chrome.storage.local.set({ guided_tours: updatedTours }, () => {
            sendResponse({ success: true });
            broadcastCallback();
        });
    });
}

/**
 * 添加悬停提示
 * @param {Object} hint - 提示对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function addHoverHint(hint, sendResponse, broadcastCallback) {
    const newHint = { ...hint };
    newHint.id = `hint-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

    chrome.storage.local.get('hover_hints', (data) => {
        const hints = data.hover_hints || [];
        hints.push(newHint);
        chrome.storage.local.set({ hover_hints: hints }, () => {
            sendResponse({ success: true, hint: newHint });
            broadcastCallback();
        });
    });
}

/**
 * 更新悬停提示
 * @param {Object} hint - 提示对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function updateHoverHint(hint, sendResponse, broadcastCallback) {
    chrome.storage.local.get('hover_hints', (data) => {
        let hints = data.hover_hints || [];
        const index = hints.findIndex(h => h.id === hint.id);
        if (index !== -1) {
            hints[index] = hint;
            chrome.storage.local.set({ hover_hints: hints }, () => {
                sendResponse({ success: true });
                broadcastCallback();
            });
        } else {
            sendResponse({ success: false, error: "Hint not found" });
        }
    });
}

/**
 * 删除悬停提示
 * @param {string} hintId - 提示 ID
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function deleteHoverHint(hintId, sendResponse, broadcastCallback) {
    chrome.storage.local.get('hover_hints', (data) => {
        let hints = data.hover_hints || [];
        const updatedHints = hints.filter(h => h.id !== hintId);
        chrome.storage.local.set({ hover_hints: updatedHints }, () => {
            sendResponse({ success: true });
            broadcastCallback();
        });
    });
}

/**
 * 加载默认规则
 */
export function loadDefaultRules() {
    console.log("First-time installation. Loading default rules from rules.json.");
    const rulesUrl = chrome.runtime.getURL('rules.json');

    fetch(rulesUrl)
        .then(response => {
            if (!response.ok) throw new Error(`Could not fetch rules.json: ${response.statusText}`);
            return response.json();
        })
        .then(data => {
            const transformedHints = (data.singleHints || []).map(hint => ({
                id: hint.id,
                url: hint.url,
                selector: hint.element,
                text: hint.content
            }));

            const transformedGuides = (data.guides || []).map(guide => ({
                ...guide,
                steps: guide.steps.map(step => ({
                    ...step,
                    selector: step.element,
                    text: step.content
                }))
            }));

            const initialData = {
                guided_tours: transformedGuides,
                hover_hints: transformedHints,
                tour_completions: {}
            };

            chrome.storage.local.set(initialData, () => {
                console.log("Default rules and completion state have been loaded into storage.", initialData);
            });
        })
        .catch(error => {
            console.error("Error loading default rules:", error);
        });
}

/**
 * 迁移旧版本数据
 */
export function migrateOldData() {
    console.log("O-Maid updated.");
    chrome.storage.local.get('rules', (result) => {
        if (result.rules && Array.isArray(result.rules)) {
            console.log("Old 'rules' format found. Migrating to new data structure.");
            const oldRules = result.rules;
            const newTours = [];

            oldRules.forEach(rule => {
                if (rule.actions && rule.actions.length > 0) {
                    const tour = {
                        id: `tour-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                        name: `Migrated: ${rule.url.split('/').pop() || rule.url}`,
                        trigger: 'manual',
                        steps: rule.actions
                            .filter(action => action.type === 'EXPLAIN')
                            .map(action => ({ url: rule.url, selector: action.selector, text: action.text }))
                    };
                    if (tour.steps.length > 0) newTours.push(tour);
                }
            });

            if (newTours.length > 0) {
                chrome.storage.local.get('guided_tours', (data) => {
                    const allTours = (data.guided_tours || []).concat(newTours);
                    chrome.storage.local.set({ guided_tours: allTours }, () => {
                        console.log("Successfully migrated old rules to new Guided Tours format.");
                        chrome.storage.local.remove('rules');
                    });
                });
            } else {
                chrome.storage.local.remove('rules');
            }
        }
    });
}
/**
 * 导入所有数据
 * @param {Object} data - 包含 guided_tours 和 hover_hints 的对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function importAllData(data, sendResponse, broadcastCallback) {
    if (!data || (typeof data !== 'object')) {
        sendResponse({ success: false, error: "Invalid data format" });
        return;
    }

    const { guided_tours = [], hover_hints = [], tour_completions = {} } = data;

    // 可以在这里做更多的数据验证

    const newData = {
        guided_tours: Array.isArray(guided_tours) ? guided_tours : [],
        hover_hints: Array.isArray(hover_hints) ? hover_hints : [],
        tour_completions: (typeof tour_completions === 'object') ? tour_completions : {}
    };

    chrome.storage.local.set(newData, () => {
        console.log("O-Maid: Data imported successfully.", newData);
        sendResponse({ success: true });
        broadcastCallback();
    });
}
