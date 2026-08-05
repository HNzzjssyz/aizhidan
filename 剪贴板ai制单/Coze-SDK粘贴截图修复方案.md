# Coze Chat SDK 粘贴截图功能修复方案

## 问题描述

在使用 Coze Chat SDK（`CozeWebSDK.WebChatClient`）集成智能体聊天窗口时，用户无法通过 **Ctrl+V / Cmd+V** 将剪贴板中的截图粘贴到聊天输入框中。SDK 仅支持通过点击加号按钮选择文件上传图片，不支持粘贴图片。

## 根因分析

### 排查过程

1. **排除页面代码干扰**：创建了一个仅包含 Coze SDK 的最小化测试页面，确认在纯净环境下粘贴截图同样不生效，排除了业务代码干扰的可能性。

2. **DOM 结构探测**：通过探测 SDK 渲染的 DOM 结构，发现：
   - SDK 使用 `<textarea>` 作为聊天输入框（placeholder="发送消息"），不支持粘贴图片
   - SDK 内部存在隐藏的文件上传 input：`input.coze-chat-sdk-semi-upload-hidden-input`（`display:none`，支持多文件上传）
   - 无 iframe、无 Shadow DOM，所有元素均在主文档中

3. **结论**：Coze Chat SDK 的输入框（textarea）未实现 paste 事件中图片数据的处理逻辑，这是 SDK 本身的功能缺失，而非集成代码导致的问题。

### SDK DOM 结构

```
document
└── DIV (SDK 容器, class 含 "coze-chat-sdk")
    ├── ... (聊天消息区域)
    ├── TEXTAREA (输入框, placeholder="发送消息")
    └── DIV.coze-chat-sdk-semi-upload
        ├── INPUT.coze-chat-sdk-semi-upload-hidden-input (type=file, multiple=true, display:none)
        └── INPUT.coze-chat-sdk-semi-upload-hidden-input-replace (type=file, display:none)
```

## 解决方案

### 核心思路

拦截 paste 事件 → 检测剪贴板中的图片 → 注入到 SDK 的隐藏文件上传 input → 触发 change 事件，复用 SDK 原有的文件上传流程。

### 实现代码

```javascript
function isInCozeSDKArea(el) {
  while (el) {
    if (el.className && typeof el.className === 'string') {
      if (el.className.indexOf('coze-chat-sdk') !== -1 || el.className.indexOf('coz-') !== -1) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

function injectImageToCozeSDK(e) {
  var items = e.clipboardData && e.clipboardData.items;
  if (!items) return;

  var hasImage = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      hasImage = true;
      break;
    }
  }
  if (!hasImage) return;

  if (!isInCozeSDKArea(e.target)) return;

  var fileInput = document.querySelector('input.coze-chat-sdk-semi-upload-hidden-input');
  if (!fileInput) return;

  e.preventDefault();
  e.stopPropagation();

  var files = [];
  for (var i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      var file = items[i].getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length === 0) return;

  var dataTransfer = new DataTransfer();
  files.forEach(function(f) { dataTransfer.items.add(f); });
  fileInput.files = dataTransfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
}

document.addEventListener('paste', injectImageToCozeSDK, true);
```

### 关键技术点

#### 1. 事件监听阶段：Capture 模式

```javascript
document.addEventListener('paste', injectImageToCozeSDK, true);
//                                                  第三参数 true = capture 阶段
```

使用 **capture 阶段**（而非默认的 bubble 阶段）监听 paste 事件，确保我们的处理器在 SDK 内部处理器之前执行。这样我们可以在检测到图片时调用 `e.preventDefault()` 和 `e.stopPropagation()`，阻止事件继续传播到 SDK 的文本处理逻辑。

#### 2. 目标区域判定

```javascript
function isInCozeSDKArea(el) {
  while (el) {
    if (el.className && typeof el.className === 'string') {
      if (el.className.indexOf('coze-chat-sdk') !== -1 || el.className.indexOf('coz-') !== -1) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}
```

通过向上遍历 DOM 树，检查目标元素是否在 SDK 容器内（通过 class 名中包含 `coze-chat-sdk` 或 `coz-` 判断）。这确保了：

- 在 SDK 输入框中粘贴图片 → 拦截并注入上传
- 在页面其他区域粘贴文本 → 不受影响，正常处理

#### 3. DataTransfer API 注入文件

```javascript
var dataTransfer = new DataTransfer();
files.forEach(function(f) { dataTransfer.items.add(f); });
fileInput.files = dataTransfer.files;
```

使用 `DataTransfer` API 构造文件列表，赋值给隐藏的 file input 的 `files` 属性。这是浏览器原生支持的 API，无需额外依赖。

> **注意**：`DataTransfer` 构造函数在 Chrome 62+、Firefox 62+、Safari 14.1+ 中可用，与 Coze SDK 的浏览器兼容性要求一致。

#### 4. 触发 SDK 上传流程

```javascript
fileInput.dispatchEvent(new Event('change', { bubbles: true }));
```

触发 file input 的 `change` 事件，SDK 内部会监听此事件并启动文件上传流程。`bubbles: true` 确保事件能够冒泡到 SDK 的上层监听器。

## 事件流程对比

### 修复前

```
用户在输入框粘贴截图
  → paste 事件到达 textarea
  → SDK 无图片处理逻辑
  → 无任何反应
```

### 修复后

```
用户在输入框粘贴截图
  → paste 事件（capture 阶段）被 injectImageToCozeSDK 捕获
  → 检测到剪贴板包含图片 + 目标在 SDK 区域
  → e.preventDefault() + e.stopPropagation() 阻止默认行为
  → 提取图片文件 → DataTransfer → 赋值给 file input
  → 触发 change 事件
  → SDK 文件上传流程启动 → 图片上传成功
```

## 注意事项

1. **SDK 版本依赖**：本方案依赖 SDK 渲染的 DOM 结构（class 名 `coze-chat-sdk-semi-upload-hidden-input`）。如果 SDK 升级后修改了 class 名或 DOM 结构，需要相应调整选择器。

2. **isIframe 配置**：本方案在 `isIframe: false`（非 iframe 模式）下验证通过。如果使用 iframe 模式（默认），由于跨域限制，无法访问 iframe 内部的 DOM 元素，方案将不适用。

3. **安全性**：本方案仅在用户主动触发粘贴操作时执行，不涉及自动读取剪贴板内容，符合浏览器安全策略。

4. **兼容性**：`DataTransfer` 构造函数在主流现代浏览器中均已支持，与 Coze SDK 的浏览器兼容性要求（Chrome 87+、Edge 88+、Safari 14+、Firefox 78+）一致。
