// Multi-instance helpers (Issue #3).

export function newInstanceId(cryptoObj = globalThis.crypto) {
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  return 'i-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export function pendingFileStorageKey(instanceId) {
  return instanceId ? 'pendingFile_' + instanceId : 'pendingFile';
}

export function editorUrlWithInstance(baseEditorUrl, instanceId) {
  const sep = String(baseEditorUrl).includes('?') ? '&' : '?';
  return `${baseEditorUrl}${sep}i=${encodeURIComponent(instanceId)}`;
}
