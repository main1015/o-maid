// modules/tour-manager.js - 引导任务管理模块

import { areUrlsMatching, querySelectorDeep, querySelectorAllDeep, getProxyElement, appendTourHash } from './utils.js';
import { startTourState, stopTourState, proceedToNextStep, markTourAsCompleted } from './communication.js';

let isTourActive = false; // 全局锁，防止并发启动

/**
 * 开始引导任务
 * @param {Object} tour - 任务对象
 * @param {number} startStepNumber - 起始步骤编号
 * @param {Function} onHidePanel - 隐藏面板的回调函数
 */
export function startTour(tour, startStepNumber = 1, onHidePanel = null) {
    if (isTourActive) {
        console.warn(`O-Maid: [Tour] A tour is already active. Ignoring start request for "${tour.name}".`);
        return;
    }
    isTourActive = true;

    console.log(`O-Maid: [Tour] startTour called for "${tour.name}" at step ${startStepNumber}`);
    // 通知 background 任务开始
    startTourState(tour.id);

    const intro = introJs();

    // 将任务格式映射到 Intro.js 期望的格式
    const introJsSteps = tour.steps.map((step, index) => {
        return {
            element: null, // 初始设为 null，在 onbeforechange 中动态查找
            title: step.title || chrome.i18n.getMessage('defaultStepTitle').replace('$1', index + 1),
            intro: step.text || step.content || step.intro || '', // 确保内容字段正确匹配
            position: step.position || 'bottom'
        };
    });

    // 找到起始步骤的索引（0-based）
    let startStepIndex = tour.steps.findIndex(s => s.step === startStepNumber);
    if (startStepIndex === -1) {
        // 如果找不到显式的 step 属性，假设 startStepNumber 是 1-based 的索引
        if (startStepNumber > 0 && startStepNumber <= tour.steps.length) {
            startStepIndex = startStepNumber - 1;
        }
    }

    if (startStepIndex === -1) {
        console.error(`O-Maid: [Tour] Could not find step ${startStepNumber} (Index: ${startStepIndex}) in tour "${tour.name}"`);
        alert(chrome.i18n.getMessage('msgStepElementNotFound').replace('$1', startStepNumber));
        stopTourState();
        return;
    }

    console.log(`O-Maid: [Tour] Resolving start step: input number=${startStepNumber}, final index=${startStepIndex}`);

    const stepToStart = introJsSteps[startStepIndex];
    const initialStepObj = tour.steps[startStepIndex];

    // 尝试查找第一步的元素
    stepToStart.element = querySelectorAllDeep(initialStepObj.selector || initialStepObj.element, document, true)[0];

    // 增加重试逻辑：如果第一步元素未找到，尝试等待并重试
    if (!stepToStart.element) {
        console.log(`O-Maid: [Tour] Step ${startStepNumber} element not found immediately. Retrying...`);
        let retryCount = 0;
        const maxRetries = 10;
        const retryInterval = 500;

        const retryTimer = setInterval(() => {
            retryCount++;
            const stepObj = tour.steps[startStepIndex];
            // 彻底静默重试期间的日志
            const targetEl = querySelectorAllDeep(stepObj.selector || stepObj.element, document, true)[0];

            if (targetEl) {
                console.log(`O-Maid: [Tour] Step ${startStepNumber} element found after ${retryCount} retries.`);
                clearInterval(retryTimer);
                stepToStart.element = targetEl;
                proceedWithIntro();
            } else if (retryCount >= maxRetries) {
                const stepObj = tour.steps[startStepIndex];
                console.error(`O-Maid: [Tour] Step ${startStepNumber} element still not found after ${maxRetries} retries. 
                  Selector: ${stepObj.selector || stepObj.element}`);
                clearInterval(retryTimer);
                // 移除 alert，改用控制台报错，避免打断用户
                stopTourState();
            }
        }, retryInterval);
        return;
    }

    proceedWithIntro();

    function proceedWithIntro() {
        // 如果起始步骤在 iframe 中，先处理代理
        const currentStepObj = introJsSteps[startStepIndex];
        if (currentStepObj?.element && currentStepObj.element.ownerDocument !== document) {
            console.log(`O-Maid: [Tour] Start step is in an iframe. Using proxy.`);
            currentStepObj.element = getProxyElement(currentStepObj.element);
        }

        const options = {
            steps: introJsSteps,
            nextLabel: chrome.i18n.getMessage('introNextLabel'),
            prevLabel: chrome.i18n.getMessage('introPrevLabel'),
            doneLabel: chrome.i18n.getMessage('introDoneLabel'),
            showStepNumbers: true,
            exitOnOverlayClick: false,
            initialStep: startStepIndex,
            scrollToElement: true,
            scrollPadding: 100,
            tooltipClass: 'o-maid-custom-tooltip',
            positionPrecedence: ["bottom", "top", "right", "left"]
        };

        const intro = introJs();
        intro.setOptions(options);

        let isInitializing = true; // 标志：是否处于初始化自动跳转阶段

        intro.onbeforechange(function () {
            // targetElement 在这里可能还没被 Intro.js 赋值，因为我们初始 element 是 null
            // 我们根据当前步骤索引动态查找
            const nextStepIndex = this._currentStep;
            const nextStepObj = tour.steps[nextStepIndex];

            if (!nextStepObj) return;

            // 修复启动时的误跳：仅在初始化阶段且目标步骤是历史步骤时，跳过 URL 校验
            if (isInitializing && nextStepIndex < startStepIndex) {
                console.log(`O-Maid: [Tour] Skipping URL check for earlier step ${nextStepIndex + 1} during initialization.`);
                return;
            }

            // 如果下一步在不同的 URL，导航到那里
            if (!areUrlsMatching(nextStepObj.url, window.location.href)) {
                console.log(`O-Maid: [Tour] Next step is on a different URL: ${nextStepObj.url}. Opening new tab...`);
                const nextStepNum = nextStepObj.step || (nextStepIndex + 1);
                const targetWithHash = appendTourHash(nextStepObj.url, tour.id, nextStepNum);

                // 先通知 background 我们要跳到哪个步骤
                proceedToNextStep(nextStepNum).then(() => {
                    // 用户说“打开新页面”，这里我们使用 window.open
                    window.open(targetWithHash, '_blank');
                    // 同时也关闭当前的引导，因为它会在新页面恢复
                    this.exit();
                });
                return false;
            }

            // 动态查找元素
            let targetEl = querySelectorAllDeep(nextStepObj.selector || nextStepObj.element, document, true)[0];

            if (targetEl) {
                // 处理 Iframe 代理定位
                if (targetEl.ownerDocument !== document) {
                    targetEl = getProxyElement(targetEl);
                }

                // 更新 Intro.js 内部引用的元素
                if (this._introItems && this._introItems[nextStepIndex]) {
                    this._introItems[nextStepIndex].element = targetEl;
                }
            } else {
                console.warn(`O-Maid: [Tour] Element not found for step ${nextStepIndex + 1}: ${nextStepObj.selector}`);
            }
        });

        intro.onchange(function (targetElement) {
            // 步骤切换后，强制刷新位置以校准 Tooltip
            setTimeout(() => {
                this.refresh();

                // 彻底解决遮挡的核心逻辑：手动检测 Tooltip 是否与目标元素重叠
                const tooltipContainer = document.querySelector('.introjs-tooltip');
                if (tooltipContainer && targetElement) {
                    const tooltipRect = tooltipContainer.getBoundingClientRect();
                    const elementRect = targetElement.getBoundingClientRect();

                    // 检测垂直重叠 (Tooltip 挡住了元素)
                    const isOverlapping = !(tooltipRect.bottom < elementRect.top || tooltipRect.top > elementRect.bottom);
                    const isHorizontalOverlap = !(tooltipRect.right < elementRect.left || tooltipRect.left > elementRect.right);

                    if (isOverlapping && isHorizontalOverlap) {
                        console.warn('O-Maid: [Tour] Tooltip is overlapping element. Forcing adjustment...');
                        // 如果重叠，强制向下移动 (假设我们优先使用 bottom 定位)
                        const currentTop = parseFloat(tooltipContainer.style.top) || 0;
                        const offset = elementRect.bottom - tooltipRect.top + 20;
                        tooltipContainer.style.top = (currentTop + offset) + 'px';

                        // 同时也修正箭头位置 (隐藏它，因为它可能不再准确)
                        const arrow = tooltipContainer.querySelector('.introjs-arrow');
                        if (arrow) arrow.style.display = 'none';
                    }
                }
            }, 200); // 略微增加延时确保 intro.js 完成自带的定位
        });

        let isDoneButtonClicked = false;
        const handleGlobalClick = (e) => {
            if (e.target.closest('.introjs-donebutton')) {
                console.log("O-Maid: [Tour] Done button clicked.");
                isDoneButtonClicked = true;
            }
        };
        document.addEventListener('click', handleGlobalClick, true);

        intro.oncomplete(() => {
            console.log(`O-Maid: [Tour] oncomplete triggered. Done button clicked: ${isDoneButtonClicked}`);

            if (tour.trigger === 'auto' && isDoneButtonClicked) {
                console.log(`O-Maid: [Tour] Marking tour "${tour.name}" as completed.`);
                markTourAsCompleted(tour.id);
            } else {
                console.log(`O-Maid: [Tour] Tour finished but NOT marking as completed (isDoneButtonClicked: ${isDoneButtonClicked}).`);
            }
            stopTourState();
        });

        intro.onexit(() => {
            // 用户手动关闭任务时也停止追踪
            isTourActive = false; // 释放锁
            stopTourState();
            console.log("Tour exited.");
            document.removeEventListener('click', handleGlobalClick, true);
        });

        // 隐藏面板 - 用户反馈不需要关闭
        // if (onHidePanel) {
        //     onHidePanel();
        // }

        intro.start();

        // 核心修复：如果指定了起始步骤且不是第一步，立即同步跳转以消除闪烁
        if (startStepIndex > 0) {
            console.log(`O-Maid: [Tour] Synchronously jumping to step ${startStepNumber} (index ${startStepIndex})`);
            intro.goToStep(startStepNumber); // goToStep 通常是 1-based
            intro.refresh(); // 刷新以确保 Tooltip 位置正确
        }

        // 初始化跳转完成，后续的步骤切换（包括点击上一步）都要执行正常的 URL 校验
        isInitializing = false;
    }
}

/**
 * 检查并自动启动任务
 * @param {Array} tours - 任务数组
 * @param {Object} completions - 完成记录
 */
export function checkAndStartAutoTour(tours, completions) {
    const pageUrl = window.location.href;
    console.log(`O-Maid: [AutoTour] Checking for auto-start tours on ${pageUrl}`);

    const autoTour = tours.find(tour => {
        const isAuto = tour.trigger === 'auto';
        const isNotCompleted = !completions[tour.id];
        const hasSteps = tour.steps && tour.steps.length > 0;

        let urlMatches = false;
        if (hasSteps) {
            const stepUrl = tour.steps[0].url;
            urlMatches = areUrlsMatching(stepUrl, pageUrl);
        }

        // 记录所有自动任务的过滤状态，无论是否匹配成功
        if (isAuto) {
            console.log(`O-Maid: [AutoTour] Evaluating tour "${tour.name}":
              - Trigger: ${tour.trigger}
              - Is Not Completed: ${isNotCompleted} (Completion status: ${completions[tour.id]})
              - Has Steps: ${hasSteps}
              - URL Match: ${urlMatches} (Step 0: ${tour.steps?.[0]?.url} vs Current: ${pageUrl})`);
        }

        return isAuto && isNotCompleted && hasSteps && urlMatches;
    });

    if (autoTour) {
        console.log(`O-Maid: [AutoTour] Found matching tour: "${autoTour.name}". Preparing to start...`);
        setTimeout(() => {
            console.log(`O-Maid: [AutoTour] Executing startTour for "${autoTour.name}" after delay.`);
            startTour(autoTour);
        }, 500);
    } else {
        console.log(`O-Maid: [AutoTour] No matching auto-start tours found on this page.`);
    }
}
