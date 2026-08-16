// 路径省略工具：保留文件名完整，中间段用 '...' 省略，使总长 <= maxLen（按字符计，中文算 1）
// 处理函数可能含 '/' 或 '\' 两种分隔符。
// 设计文档：.workbuddy/memory/对比合并重构设计文档.md §7
export function ellipsizePath(fullPath, maxLen = 32) {
  const sep = fullPath.includes('/') ? '/' : '\\';
  const idx = Math.max(fullPath.lastIndexOf('/'), fullPath.lastIndexOf('\\'));
  const dir = idx >= 0 ? fullPath.slice(0, idx) : '';
  const file = idx >= 0 ? fullPath.slice(idx + 1) : fullPath;
  if (fullPath.length <= maxLen) return fullPath;
  if (file.length >= maxLen - 3) return '...' + file.slice(file.length - (maxLen - 3)); // 文件名本身就超长
  const headLen = Math.ceil((maxLen - 3 - file.length) / 2);
  const tailLen = maxLen - 3 - file.length - headLen;
  return dir.slice(0, headLen) + '...' + dir.slice(dir.length - tailLen) + sep + file;
}

// 三用例（验收）：
// 1. 短路径原样返回：ellipsizePath('C:/a/b.md')                      -> 'C:/a/b.md'
// 2. 文件名超长保尾：ellipsizePath('C:/a/verylongfilename-that-exceeds.md', 20) -> '...hat-exceeds.md'
// 3. 多段路径中间省略：ellipsizePath('C:/a/very/long/path/to/myfile.md', 20) -> 'C:/a...th/to/myfile.md'
