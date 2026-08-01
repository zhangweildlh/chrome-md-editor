// Pure HTML → Markdown helpers (preview WYSIWYG round-trip).
// Extracted so Issue #1 / #3 regressions can be unit-tested without a browser.
// 临时调试探针（定位 BUG-1/2/3，修复后删除）
import { probe } from './probe.js';

export function normalizeMarkdown(md) {
  const raw = String(md || '');
  const afterCRLF = raw.replace(/\r\n/g, '\n');
  const afterTab = afterCRLF.replace(/[ \t]+\n/g, '\n');
  const newlinesBefore = (afterTab.match(/\n/g) || []).length;
  const compressed = afterTab.replace(/\n{3,}/g, '\n\n');
  const newlinesAfter = (compressed.match(/\n/g) || []).length;
  const result = compressed.trim();
  probe('P1-F normalizeMarkdown压缩', {
    action: 'normalize-newlines',
    newlinesBefore,
    newlinesAfter,
    collapsedCount: newlinesBefore - newlinesAfter,
    lenBefore: afterTab.length,
    lenAfter: result.length,
  });
  return result;
}

export function reconstructRawTag(node, convertNodeFn) {
  const convert = convertNodeFn || convertNode;
  const tag = node.tagName.toLowerCase();
  const attrs = Array.from(node.attributes || [])
    .map((a) => ` ${a.name}="${a.value}"`)
    .join('');
  const childText = Array.from(node.childNodes).map(convert).join('');
  return `<${tag}${attrs}>${childText}</${tag}>`;
}

// Use numeric nodeType constants so this runs in Node tests (no global Node)
// and in the browser (DOM Node.TEXT_NODE === 3, ELEMENT_NODE === 1).
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

export function convertNode(node) {
  if (node.nodeType === TEXT_NODE) {
    return node.textContent;
  }
  if (node.nodeType !== ELEMENT_NODE) return '';

  // Skip bilingual reading translations injected into the preview
  if (
    node.classList?.contains('md-translation') ||
    node.getAttribute?.('data-md-translation') === '1'
  ) {
    return '';
  }

  const tag = node.tagName.toLowerCase();
  const children = () => Array.from(node.childNodes).map(convertNode).join('');
  const childText = children();

  switch (tag) {
    case 'h1':
      return `# ${childText.trim()}\n\n`;
    case 'h2':
      return `## ${childText.trim()}\n\n`;
    case 'h3':
      return `### ${childText.trim()}\n\n`;
    case 'h4':
      return `#### ${childText.trim()}\n\n`;
    case 'h5':
      return `##### ${childText.trim()}\n\n`;
    case 'h6':
      return `###### ${childText.trim()}\n\n`;
    case 'p': {
      const out = `${childText.trim()}\n\n`;
      probe('P1-G convertNode-p块', {
        action: 'convert-p',
        childTextSample: childText.slice(0, 200),
        childTextLen: childText.length,
        isEmpty: childText.trim().length === 0,
        outSample: out.slice(0, 200),
      });
      return out;
    }
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return `**${childText}**`;
    case 'em':
    case 'i':
      return `*${childText}*`;
    case 'del':
    case 's':
      return `~~${childText}~~`;
    case 'code':
      if (node.parentElement && node.parentElement.tagName === 'PRE') {
        return childText;
      }
      return `\`${childText}\``;
    case 'pre': {
      const codeEl = node.querySelector('code');
      const lang = codeEl?.className?.match(/language-(\w+)/)?.[1] || '';
      const code = codeEl ? codeEl.textContent : childText;
      return `\`\`\`${lang}\n${code.trimEnd()}\n\`\`\`\n\n`;
    }
    case 'blockquote': {
      const trimmed = childText.trim();
      const lines = trimmed.split('\n');
      const mapped = lines.map((l) => `> ${l}`).join('\n');
      const out = mapped + '\n\n';
      probe('P3-A convertNode-blockquote', {
        action: 'convert-blockquote',
        childTextSample: childText.slice(0, 300),
        childTextLen: childText.length,
        trimmedLen: trimmed.length,
        lineCount: lines.length,
        lines,
        outSample: out.slice(0, 300),
        hasEmptyLine: lines.some((l) => l.trim().length === 0),
      });
      return out;
    }
    case 'ul': {
      let result = '';
      for (const li of node.children) {
        if (li.tagName === 'LI') {
          const checkbox = li.querySelector('input[type="checkbox"]');
          const prefix = checkbox
            ? checkbox.checked
              ? '- [x] '
              : '- [ ] '
            : '- ';
          const text = Array.from(li.childNodes)
            .filter((n) => n.tagName !== 'INPUT')
            .map(convertNode)
            .join('')
            .trim();
          result += `${prefix}${text}\n`;
        }
      }
      return result + '\n';
    }
    case 'ol': {
      let result = '';
      let i = 1;
      for (const li of node.children) {
        if (li.tagName === 'LI') {
          result += `${i}. ${convertNode(li).trim()}\n`;
          i++;
        }
      }
      return result + '\n';
    }
    case 'li':
      return childText;
    case 'a': {
      const href = node.getAttribute('href') || '';
      return `[${childText}](${href})`;
    }
    case 'img': {
      // Prefer original markdown src after preview rewrites blob/object URLs
      const src =
        node.getAttribute('data-md-original-src') ||
        node.getAttribute('src') ||
        '';
      const alt = node.getAttribute('alt') || '';
      return `![${alt}](${src})`;
    }
    case 'hr':
      return '---\n\n';
    case 'table': {
      const rows = Array.from(node.querySelectorAll('tr'));
      if (rows.length === 0) return childText;
      let result = '';
      rows.forEach((row, idx) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        result += '| ' + cells.map((c) => c.textContent.trim()).join(' | ') + ' |\n';
        if (idx === 0) {
          result += '| ' + cells.map(() => '------').join(' | ') + ' |\n';
        }
      });
      return result + '\n';
    }
    case 'input':
      return '';
    case 'div': {
      if (node.classList.contains('mermaid-diagram')) {
        return '';
      }
      return childText;
    }
    case 'mark':
    case 'center':
    case 'font':
    case 'span':
    case 'sup':
    case 'sub':
      return reconstructRawTag(node, convertNode);
    default:
      return childText;
  }
}

/**
 * Convert preview HTML back to Markdown source.
 * Browser: uses DOMParser.
 * Node tests: pass `parseHTML` from linkedom, which reliably builds a body tree.
 */
export function htmlToMarkdown(html, { DOMParserImpl, parseHTML } = {}) {
  if (typeof parseHTML === 'function') {
    const wrapped = `<!DOCTYPE html><html><body>${html}</body></html>`;
    const { document } = parseHTML(wrapped);
    const converted = convertNode(document.body);
    const result = normalizeMarkdown(converted) + '\n';
    probe('P3-B htmlToMarkdown转换', {
      action: 'html-to-md',
      mode: 'node-parseHTML',
      htmlLen: html.length,
      convertedSample: converted.slice(0, 400),
      resultSample: result.slice(0, 400),
      hasBlockquote: result.includes('> '),
    });
    return result;
  }

  const Parser = DOMParserImpl || globalThis.DOMParser;
  if (!Parser) {
    throw new Error('DOMParser or parseHTML is required for htmlToMarkdown');
  }
  const doc = new Parser().parseFromString(html, 'text/html');
  const converted = convertNode(doc.body);
  const result = normalizeMarkdown(converted) + '\n';
  probe('P3-B htmlToMarkdown转换', {
    action: 'html-to-md',
    mode: 'browser-DOMParser',
    htmlLen: html.length,
    convertedSample: converted.slice(0, 400),
    resultSample: result.slice(0, 400),
    hasBlockquote: result.includes('> '),
  });
  return result;
}
