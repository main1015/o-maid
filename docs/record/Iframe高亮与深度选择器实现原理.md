# Iframe 高亮与深度选择器实现原理

## 1. 背景
在 Chrome 扩展开发中，`iframe` 的样式隔离和事件捕获一直是难点。主页面的 CSS 无法直接作用于 iframe 内部，且动态生成的 iframe 往往无法通过常规的内容脚本注入来覆盖。

## 2. 核心技术方案

### 2.1 跨环境识别：`ownerDocument`
在处理鼠标事件时，通过 `e.target.ownerDocument` 获取元素所属的真实文档对象。
- **原理**：无论元素是在主页面还是在嵌套的同源 iframe 中，`ownerDocument` 都能准确指向该元素所在的 `document` 上下文。这为后续的样式注入提供了目标。

### 2.2 动态样式注入 (Dynamic Style Injection)
为了打破 iframe 的样式沙箱，我们采用了“按需注入”的策略。
- **逻辑**：当鼠标第一次滑入某个文档环境时，脚本会检查该文档的 `head` 中是否已存在高亮样式表。若无，则动态创建一个 `<style>` 标签并注入。
- **代码片段**：
```javascript
function injectHighlightStyle(doc) {
    if (!doc || injectedDocuments.has(doc)) return;
    const style = doc.createElement('style');
    style.id = 'o-maid-dynamic-highlight-style';
    style.innerHTML = `
        .o-maid-selection-highlight {
            outline: 2px solid #007bff !important;
            outline-offset: -2px !important;
            background-color: rgba(0, 123, 255, 0.2) !important;
        }
    `;
    (doc.head || doc.documentElement).appendChild(style);
    injectedDocuments.add(doc);
}
```

### 2.3 递归事件绑定 (Recursive Binding)
为了确保能捕获到所有同源 iframe 的事件，脚本从顶层开始递归遍历。
- **逻辑**：`initRecursive` 函数会遍历当前文档下的所有 `iframe`，并为同源 iframe 的 `contentDocument` 绑定监听器。
- **优势**：主动穿透，不依赖插件的自动注入机制，对动态创建的 iframe 兼容性更好。

### 2.4 深度路径选择器 (Deep Selector)
为了在主页面定位 iframe 内部元素，选择器需要包含路径信息。
- **实现**：通过 `ownerDocument.defaultView.frameElement` 递归向上查找 iframe 标签，并使用 ` >>> ` 分隔符拼接。
- **示例**：`iframe#test-iframe >>> .internal-button`

## 3. 总结
本方案通过 **“主动递归绑定 + 动态环境识别 + 即时样式注入”** 的组合拳，实现了稳健、高性能且零 DOM 干扰（针对目标元素本身）的跨 frame 元素选择功能。
