// ==========================================
// Session restore - last opened document
// Chrome FileSystem handles cannot persist; we restore content + name.
// ==========================================

export const LAST_FILE_KEY = 'lastFile';

/** Default max age: 30 days */
export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * @param {{ content: string, filename?: string, sourceUrl?: string|null, timestamp?: number }} input
 */
export function buildLastFileRecord(input) {
  const content = typeof input?.content === 'string' ? input.content : '';
  const filename =
    typeof input?.filename === 'string' && input.filename.trim()
      ? input.filename.trim()
      : 'untitled.md';
  return {
    content,
    filename,
    sourceUrl: input?.sourceUrl || null,
    timestamp: typeof input?.timestamp === 'number' ? input.timestamp : Date.now(),
  };
}

/**
 * @param {unknown} record
 * @param {number} [now]
 * @param {number} [maxAgeMs]
 */
export function isLastFileUsable(record, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!record || typeof record !== 'object') return false;
  if (typeof record.content !== 'string') return false;
  if (typeof record.filename !== 'string' || !record.filename.trim()) return false;
  if (typeof record.timestamp === 'number' && now - record.timestamp > maxAgeMs) {
    return false;
  }
  return true;
}

function hasChromeStorage() {
  return typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
}

/**
 * Persist last document snapshot (content only; no FileSystemHandle).
 * @param {{ content: string, filename?: string, sourceUrl?: string|null }} doc
 */
export async function rememberLastFile(doc) {
  if (!hasChromeStorage()) return;
  const record = buildLastFileRecord(doc);
  try {
    await chrome.storage.local.set({ [LAST_FILE_KEY]: record });
  } catch (err) {
    console.warn('[MD Editor] rememberLastFile failed:', err);
  }
}

/**
 * @returns {Promise<null | { content: string, filename: string, sourceUrl: string|null, timestamp: number }>}
 */
export async function loadLastFile() {
  if (!hasChromeStorage()) return null;
  try {
    const result = await chrome.storage.local.get(LAST_FILE_KEY);
    const record = result[LAST_FILE_KEY];
    if (!isLastFileUsable(record)) {
      if (record) await chrome.storage.local.remove(LAST_FILE_KEY);
      return null;
    }
    return record;
  } catch (err) {
    console.warn('[MD Editor] loadLastFile failed:', err);
    return null;
  }
}

export async function clearLastFile() {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.remove(LAST_FILE_KEY);
  } catch (err) {
    console.warn('[MD Editor] clearLastFile failed:', err);
  }
}
