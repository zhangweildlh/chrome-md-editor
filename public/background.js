// Service Worker - 管理编辑器标签页 + 拦截 .md 文件

// 生成唯一实例 ID，用于区分多个编辑器实例（避免 pendingFile 单键竞态）
function newInstanceId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'i-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

// 点击扩展图标时打开编辑器页面
// 每次点击都新建一个独立实例（支持同时打开多个编辑器）
chrome.action.onClicked.addListener(async () => {
  await chrome.tabs.create({
    url: chrome.runtime.getURL('src/editor.html') + '?i=' + newInstanceId(),
  });
});

// ==========================================
// 方案 B：通过 tabs.onUpdated 拦截 .md 文件
// 当 content script 不生效时作为备用
// ==========================================
const MD_EXTENSIONS = /\.(md|markdown|mdown|mkd|mkdn)(\?.*)?$/i;

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // 只处理 file:// 协议的 .md 文件加载完成时
  if (changeInfo.status !== 'complete') return;
  if (!tab.url || !tab.url.startsWith('file://')) return;
  if (!MD_EXTENSIONS.test(tab.url)) return;

  try {
    // 注入脚本读取页面内容
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => {
        return document.body.innerText || document.body.textContent || '';
      },
    });

    const content = results?.[0]?.result;
    if (!content || !content.trim()) return;

    // 从 URL 中提取文件名
    const decodedUrl = decodeURIComponent(tab.url);
    const filename = decodedUrl.split('/').pop() || 'untitled.md';

    // 用「每个实例独立」的 storage 键，避免多个 .md 同时打开时相互覆盖
    const instanceId = newInstanceId();
    await chrome.storage.local.set({
      ['pendingFile_' + instanceId]: {
        content: content,
        filename: filename,
        sourceUrl: tab.url,
        timestamp: Date.now(),
      },
    });

    // 重定向到编辑器（携带实例 ID，使该标签页精确加载对应文件）
    await chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL('src/editor.html') + '?i=' + instanceId,
    });
  } catch (err) {
    console.warn('[MD Editor] 拦截 .md 文件失败:', err);
  }
});
