// parse-unified-diff.js — unified diff / git patch 解析器
//
// 状态机实现，对标 delta ARCHITECTURE.md 五态设计：
//   1. 文件头（diff --git / --- a/x / +++ b/y / rename / new file / deleted file）
//   2. hunk 头（@@ -a,b +c,d @@）
//   3. hunk 内容（空格=上下文 / - = 删 / + = 增）
//   4. No newline at end of file
//   5. GIT binary patch（识别后跳过）
//
// 输出：{ files: DiffFile[] }，DiffFile = { oldPath, newPath, oldText, newText, hunks }

/**
 * 单个 diff 文件的解析结果。
 * @typedef {Object} DiffFile
 * @property {string} oldPath
 * @property {string} newPath
 * @property {string|null} oldText 重建后的原文（null = 新文件或 binary）
 * @property {string|null} newText 重建后的新文（null = 删除文件或 binary）
 * @property {Hunk[]} hunks
 * @property {boolean} [binary] 是否为 binary patch（true 时 oldText/newText 为 null）
 */

/**
 * 单个 hunk 的解析结果。
 * @typedef {Object} Hunk
 * @property {number} oldStart 左侧起始行号（1-based）
 * @property {number} oldLines 左侧行数
 * @property {number} newStart 右侧起始行号（1-based）
 * @property {number} newLines 右侧行数
 * @property {string[]} context 上下文行（两侧共有）
 * @property {string[]} removed 删除行（仅左侧）
 * @property {string[]} added 新增行（仅右侧）
 */

const MAX_HUNKS_PER_FILE = 1000; // 防超大 diff 拖垮主线程
const MAX_LINES_PER_HUNK = 10000;

/**
 * 解析 unified diff 文本，返回 DiffFile 数组。
 * @param {string} text
 * @returns {{ files: DiffFile[] }}
 */
export function parseUnifiedDiff(text) {
  if (!text || typeof text !== 'string') return { files: [] };

  const lines = text.split(/\r?\n/);
  /** @type {DiffFile[]} */
  const files = [];
  let currentFile = null;
  let currentHunk = null;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 文件头：diff --git
    if (line.startsWith('diff --git')) {
      // 保存前一个文件
      if (currentFile && currentHunk) {
        currentFile.hunks.push(currentHunk);
        currentHunk = null;
      }
      if (currentFile) files.push(currentFile);
      currentFile = { oldPath: '', newPath: '', oldText: null, newText: null, hunks: [], binary: false };
      // 尝试解析路径：diff --git a/x b/y（备用，主要从 --- / +++ 行获取）
      const m = line.match(/^diff --git a\/(.+) b\/(.+)/);
      if (m) {
        currentFile.oldPath = m[1];
        currentFile.newPath = m[2];
      }
      i++;
      continue;
    }

    // --- a/x 或 --- /dev/null
    if (line.startsWith('--- ')) {
      const path = line.slice(4).trim();
      if (currentFile) currentFile.oldPath = path === '/dev/null' ? '' : path.replace(/^a\//, '');
      i++;
      continue;
    }

    // +++ b/y 或 +++ /dev/null
    if (line.startsWith('+++ ')) {
      const path = line.slice(4).trim();
      if (currentFile) currentFile.newPath = path === '/dev/null' ? '' : path.replace(/^b\//, '');
      i++;
      continue;
    }

    // rename from / to
    if (line.startsWith('rename from ')) {
      if (currentFile) currentFile.oldPath = line.slice(10).trim();
      i++;
      continue;
    }
    if (line.startsWith('rename to ')) {
      if (currentFile) currentFile.newPath = line.slice(8).trim();
      i++;
      continue;
    }

    // new file / deleted file / mode change
    if (line.startsWith('new file mode') || line.startsWith('deleted file mode') || line.startsWith('mode change')) {
      i++;
      continue;
    }

    // similarity index / index 行
    if (line.startsWith('similarity index') || line.startsWith('index ')) {
      i++;
      continue;
    }

    // GIT binary patch
    if (line.startsWith('GIT binary patch')) {
      if (currentFile) currentFile.binary = true;
      // 跳过直到 delta 结束
      while (i < lines.length && !lines[i].startsWith(')')) i++;
      i++; // 跳过 ) 行
      continue;
    }

    // hunk 头（兼容带上下文注释的格式，如 `@@ -1,3 +1,3 @@ function main`）
    if (line.startsWith('@@')) {
      const m = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
      // 先保存前一个 hunk（如果有）
      if (currentHunk) {
        currentFile?.hunks.push(currentHunk);
        currentHunk = null;
      }
      // 只有 hunk 数未达上限时才创建新 hunk
      if (m && currentFile && currentFile.hunks.length < MAX_HUNKS_PER_FILE) {
        currentHunk = {
          oldStart: parseInt(m[1], 10),
          oldLines: m[2] ? parseInt(m[2], 10) : 1,
          newStart: parseInt(m[3], 10),
          newLines: m[4] ? parseInt(m[4], 10) : 1,
          context: [],
          removed: [],
          added: [],
        };
      }
      i++;
      continue;
    }

    // hunk 内容
    if (currentHunk && currentHunk.context.length + currentHunk.removed.length + currentHunk.added.length < MAX_LINES_PER_HUNK) {
      if (line === '') {
        // 空行视为上下文
        currentHunk.context.push('');
      } else if (line.startsWith(' ')) {
        currentHunk.context.push(line.slice(1));
      } else if (line.startsWith('-')) {
        currentHunk.removed.push(line.slice(1));
      } else if (line.startsWith('+')) {
        currentHunk.added.push(line.slice(1));
      } else if (line === '\\ No newline at end of file') {
        // 标记 EOF 无换行（暂不处理，仅跳过）
      }
      i++;
      continue;
    }

    // 其他行（注释等）跳过
    i++;
  }

  // 保存最后一个文件和 hunk
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  // 重建 oldText / newText
  for (const f of files) {
    if (f.binary) continue;
    if (f.hunks.length === 0) continue;

    const oldLines = [];
    const newLines = [];

    for (const hunk of f.hunks) {
      // 上下文 + 删除 → oldText
      for (const l of hunk.context) oldLines.push(l);
      for (const l of hunk.removed) oldLines.push(l);
      // 上下文 + 新增 → newText
      for (const l of hunk.context) newLines.push(l);
      for (const l of hunk.added) newLines.push(l);
    }

    // 如果是新文件（oldPath 为空），oldText 为 null
    if (f.oldPath === '') {
      f.oldText = null;
    } else {
      f.oldText = oldLines.length > 0 ? oldLines.join('\n') + '\n' : '';
    }

    // 如果是删除文件（newPath 为空），newText 为 null
    if (f.newPath === '') {
      f.newText = null;
    } else {
      f.newText = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
    }
  }

  return { files };
}
