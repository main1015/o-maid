# O-Maid 快速参考指南

## 🔍 快速查找功能位置

### 我想修改...

#### 1. 悬停提示的样式
📁 `modules/hover-hints.js` → `createHoverTooltip()` 函数中的样式

#### 2. UI 面板的样式
📁 `modules/ui-manager.js` → `addPanelStyles()` 函数

#### 3. 元素选择时的高亮颜色
📁 `modules/element-selector.js` → `highlightElementForSelection()` 函数

#### 4. 引导任务的按钮文本
📁 `modules/tour-manager.js` → `startTour()` 函数中的 `setOptions`

#### 5. 数据存储逻辑
📁 `modules/storage-api.js` → 各种 CRUD 函数

#### 6. 与 background 的通信
📁 `modules/communication.js` → 各种消息发送函数

#### 7. 工具函数（URL 匹配、选择器生成等）
📁 `modules/utils.js`

## 🎨 常见修改场景

### 场景 1: 修改面板宽度
```javascript
// modules/ui-manager.js - addPanelStyles()
#o-maid-panel { 
  width: 300px;  // 修改这里
  ...
}
```

### 场景 2: 添加新的消息类型
```javascript
// 1. modules/communication.js - 添加新函数
export async function myNewAction(param) {
  return sendMessage({ action: 'myNewAction', param });
}

// 2. background.js - handleMessage() 中添加处理
if (request.action === 'myNewAction') {
  // 处理逻辑
  sendResponse({ success: true });
  return;
}
```

### 场景 3: 修改选择器生成逻辑
```javascript
// modules/utils.js - generateSelector()
export function generateSelector(el) {
  // 修改选择器生成逻辑
}
```

### 场景 4: 添加新的 UI 视图
```javascript
// modules/ui-manager.js

// 1. 在 createUIPanel() 中添加 HTML
<div id="o-maid-view-my-new-view" style="display:none;">
  <!-- 新视图内容 -->
</div>

// 2. 在 switchToView() 中添加处理
case 'my-new-view':
  // 初始化逻辑
  break;

// 3. 在 wireUpPanelEvents() 中绑定事件
```

## 📋 模块依赖关系

```
content.js (入口)
  ├─→ communication.js
  ├─→ ui-manager.js
  │     ├─→ utils.js
  │     ├─→ communication.js
  │     ├─→ element-selector.js
  │     ├─→ tour-manager.js
  │     └─→ hover-hints.js
  ├─→ element-selector.js
  │     ├─→ utils.js
  │     └─→ communication.js
  ├─→ hover-hints.js
  │     └─→ utils.js
  └─→ tour-manager.js
        ├─→ utils.js
        └─→ communication.js

background.js (入口)
  └─→ storage-api.js
```

## 🐛 调试技巧

### 1. 查看 Content Script 日志
- 打开网页
- F12 → Console
- 查看 "O-Maid" 开头的日志

### 2. 查看 Background Script 日志
- Chrome 扩展管理页面
- 点击 "Service Worker"
- 查看控制台

### 3. 调试模块加载
```javascript
// 在 content.js 或 background.js 中
console.log('Module loaded:', moduleName);
```

### 4. 检查消息传递
```javascript
// modules/communication.js
export function sendMessage(message) {
  console.log('Sending:', message);  // 添加日志
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      console.log('Response:', response);  // 添加日志
      resolve(response);
    });
  });
}
```

## 🔧 常用命令

### 重新加载扩展
1. 打开 `chrome://extensions/`
2. 找到 "页面元素助手"
3. 点击刷新图标 🔄

### 查看存储数据
```javascript
// 在控制台中运行
chrome.storage.local.get(null, (data) => console.log(data));
```

### 清除存储数据
```javascript
// 在控制台中运行
chrome.storage.local.clear();
```

## 📝 代码风格

### 函数命名
- 动词开头：`createPanel()`, `startTour()`, `handleMessage()`
- 驼峰命名：`myFunctionName`

### 常量命名
- 全大写：`MAX_WIDTH`, `DEFAULT_COLOR`

### 文件命名
- 小写 + 连字符：`element-selector.js`, `ui-manager.js`

### 注释风格
```javascript
/**
 * 函数说明
 * @param {type} paramName - 参数说明
 * @returns {type} 返回值说明
 */
```

## 🎯 性能优化建议

1. **避免频繁 DOM 操作**
   - 批量更新 DOM
   - 使用 DocumentFragment

2. **缓存选择器结果**
   ```javascript
   const panel = uiPanel.querySelector('#my-element');
   // 重复使用 panel 而不是每次都查询
   ```

3. **使用事件委托**
   ```javascript
   // 在父元素上监听，而不是每个子元素
   list.addEventListener('click', (e) => {
     if (e.target.matches('.delete-btn')) {
       // 处理删除
     }
   });
   ```

## 📚 扩展阅读

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/reference/)
- [ES6 Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules)
- [Intro.js Documentation](https://introjs.com/docs)

---

有问题？查看 [ARCHITECTURE.md](./ARCHITECTURE.md) 了解详细架构！
