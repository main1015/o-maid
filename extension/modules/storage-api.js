/**
 * 获取或初始化匿名客户端设备指纹
 */
export function getOrCreateClientId(callback) {
    chrome.storage.local.get('anonymous_client_id', (result) => {
        if (result.anonymous_client_id) {
            callback(result.anonymous_client_id);
        } else {
            const newId = 'anon_' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).substr(2, 6)));
            chrome.storage.local.set({ anonymous_client_id: newId }, () => {
                callback(newId);
            });
        }
    });
}

/**
 * 计算业务内容语义指纹 (Content Signature)
 */
export function computeSignature(type, item) {
    if (!item) return '';
    if (type === 'tour') {
        const name = (item.name || '').trim().toLowerCase();
        const stepsSign = (item.steps || []).map(s => `${(s.url || '').trim()}@${(s.selector || '').trim()}@${(s.text || '').trim()}`).join(';');
        return `tour:${name}:${stepsSign}`;
    } else if (type === 'hint') {
        const url = (item.url || '').trim();
        const selector = (item.selector || '').trim();
        const text = (item.text || '').trim();
        return `hint:${url}:${selector}:${text}`;
    }
    return '';
}

/**
 * 生成全局唯一规则 ID (GURID)
 */
export function generateUniqueRuleId(type, clientTag) {
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : (Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6));
    const tag = clientTag ? clientTag.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 10) : 'anon';
    return `om_${type}_${tag}_${uuid}`;
}

/**
 * 历史存量数据去重与清洗函数
 */
export function deduplicateData(tours = [], hints = []) {
    const cleanTours = [];
    const tourSignatures = new Set();
    const tourCloudIds = new Set();

    for (let i = tours.length - 1; i >= 0; i--) {
        const t = tours[i];
        const sig = t.signature || computeSignature('tour', t);
        t.signature = sig;
        const cId = t.cloudId || null;

        const isDuplicate = tourSignatures.has(sig) || (cId && tourCloudIds.has(cId));
        if (!isDuplicate) {
            tourSignatures.add(sig);
            if (cId) tourCloudIds.add(cId);
            cleanTours.unshift(t);
        }
    }

    const cleanHints = [];
    const hintSignatures = new Set();
    const hintCloudIds = new Set();

    for (let i = hints.length - 1; i >= 0; i--) {
        const h = hints[i];
        const sig = h.signature || computeSignature('hint', h);
        h.signature = sig;
        const cId = h.cloudId || null;

        const isDuplicate = hintSignatures.has(sig) || (cId && hintCloudIds.has(cId));
        if (!isDuplicate) {
            hintSignatures.add(sig);
            if (cId) hintCloudIds.add(cId);
            cleanHints.unshift(h);
        }
    }

    return {
        tours: cleanTours,
        hints: cleanHints,
        hasChanged: (cleanTours.length !== tours.length) || (cleanHints.length !== hints.length)
    };
}

/**
 * 获取标签页数据（自动执行历史存量去重清洗）
 * @param {Function} sendResponse - 响应回调
 */
export function getDataForTab(sendResponse) {
    chrome.storage.local.get(['guided_tours', 'hover_hints', 'tour_completions'], (result) => {
        const rawTours = result.guided_tours || [];
        const rawHints = result.hover_hints || [];
        const completions = result.tour_completions || {};

        // 运行智能去重清洗
        const dedupResult = deduplicateData(rawTours, rawHints);

        // 如果检测到存量重复项，自动静默回写清洗后的干净数据
        if (dedupResult.hasChanged) {
            console.log(`O-Maid: [Deduplication] Cleaned duplicate items (Tours: ${rawTours.length} -> ${dedupResult.tours.length}, Hints: ${rawHints.length} -> ${dedupResult.hints.length})`);
            chrome.storage.local.set({
                guided_tours: dedupResult.tours,
                hover_hints: dedupResult.hints
            });
        }

        sendResponse({
            guided_tours: dedupResult.tours,
            hover_hints: dedupResult.hints,
            tour_completions: completions
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
 * 添加引导任务 (内置智能去重与更新覆盖)
 * @param {Object} tour - 任务对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function addTour(tour, sendResponse, broadcastCallback) {
    getOrCreateClientId((clientId) => {
        const targetSig = tour.signature || computeSignature('tour', tour);

        chrome.storage.local.get('guided_tours', (data) => {
            const tours = data.guided_tours || [];
            
            // 检查是否已存在相同语义指纹或相同云端ID的任务
            const existingIndex = tours.findIndex(t => {
                if (tour.cloudId && t.cloudId && t.cloudId === tour.cloudId) return true;
                const tSig = t.signature || computeSignature('tour', t);
                return tSig === targetSig;
            });

            if (existingIndex !== -1) {
                // 已存在：就地覆盖更新，保留原ID
                const existing = tours[existingIndex];
                const updatedTour = {
                    ...existing,
                    ...tour,
                    id: existing.id,
                    signature: targetSig
                };
                tours[existingIndex] = updatedTour;
                chrome.storage.local.set({ guided_tours: tours }, () => {
                    sendResponse({ success: true, updated: true, tour: updatedTour });
                    broadcastCallback();
                });
            } else {
                // 不存在：生成全局唯一 GURID 并追加
                const newTour = {
                    ...tour,
                    id: generateUniqueRuleId('tour', clientId),
                    signature: targetSig
                };
                tours.push(newTour);
                chrome.storage.local.set({ guided_tours: tours }, () => {
                    sendResponse({ success: true, tour: newTour });
                    broadcastCallback();
                });
            }
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
 * 添加悬停提示 (内置智能去重与更新覆盖)
 * @param {Object} hint - 提示对象
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播回调
 */
export function addHoverHint(hint, sendResponse, broadcastCallback) {
    getOrCreateClientId((clientId) => {
        const targetSig = hint.signature || computeSignature('hint', hint);

        chrome.storage.local.get('hover_hints', (data) => {
            const hints = data.hover_hints || [];

            // 检查是否已存在相同语义指纹或相同云端ID的提示
            const existingIndex = hints.findIndex(h => {
                if (hint.cloudId && h.cloudId && h.cloudId === hint.cloudId) return true;
                const hSig = h.signature || computeSignature('hint', h);
                return hSig === targetSig;
            });

            if (existingIndex !== -1) {
                // 已存在：就地覆盖更新
                const existing = hints[existingIndex];
                const updatedHint = {
                    ...existing,
                    ...hint,
                    id: existing.id,
                    signature: targetSig
                };
                hints[existingIndex] = updatedHint;
                chrome.storage.local.set({ hover_hints: hints }, () => {
                    sendResponse({ success: true, updated: true, hint: updatedHint });
                    broadcastCallback();
                });
            } else {
                // 不存在：生成全局唯一 GURID 并追加
                const newHint = {
                    ...hint,
                    id: generateUniqueRuleId('hint', clientId),
                    signature: targetSig
                };
                hints.push(newHint);
                chrome.storage.local.set({ hover_hints: hints }, () => {
                    sendResponse({ success: true, hint: newHint });
                    broadcastCallback();
                });
            }
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

/**
 * 批量刷新已与云端同步的规则
 * @param {Array} updatedTours - 包含最新云端属性的引导任务列表
 * @param {Array} updatedHints - 包含最新云端属性的提示列表
 * @param {Function} sendResponse - 响应回调
 * @param {Function} broadcastCallback - 广播通知
 */
export function refreshSyncedRules(updatedTours = [], updatedHints = [], sendResponse, broadcastCallback) {
    chrome.storage.local.get(['guided_tours', 'hover_hints'], (result) => {
        let tours = result.guided_tours || [];
        let hints = result.hover_hints || [];

        const tourUpdatesMap = new Map();
        updatedTours.forEach(t => {
            if (t.id) tourUpdatesMap.set(t.id, t);
            if (t.cloudId) tourUpdatesMap.set(`cloud_${t.cloudId}`, t);
        });

        const hintUpdatesMap = new Map();
        updatedHints.forEach(h => {
            if (h.id) hintUpdatesMap.set(h.id, h);
            if (h.cloudId) hintUpdatesMap.set(`cloud_${h.cloudId}`, h);
        });

        tours = tours.map(localTour => {
            const update = tourUpdatesMap.get(localTour.id) || (localTour.cloudId ? tourUpdatesMap.get(`cloud_${localTour.cloudId}`) : null);
            if (update) {
                return {
                    ...localTour,
                    ...update,
                    id: localTour.id, // 保障本地局部主键不变
                    created_at: localTour.created_at || update.created_at
                };
            }
            return localTour;
        });

        hints = hints.map(localHint => {
            const update = hintUpdatesMap.get(localHint.id) || (localHint.cloudId ? hintUpdatesMap.get(`cloud_${localHint.cloudId}`) : null);
            if (update) {
                return {
                    ...localHint,
                    ...update,
                    id: localHint.id, // 保障本地局部主键不变
                    created_at: localHint.created_at || update.created_at
                };
            }
            return localHint;
        });

        chrome.storage.local.set({ guided_tours: tours, hover_hints: hints }, () => {
            console.log(`O-Maid: 成功刷新同步数据 (Tours: ${updatedTours.length}, Hints: ${updatedHints.length})`);
            if (typeof sendResponse === 'function') {
                sendResponse({ success: true, toursCount: updatedTours.length, hintsCount: updatedHints.length });
            }
            if (typeof broadcastCallback === 'function') {
                broadcastCallback();
            }
        });
    });
}

