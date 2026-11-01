import { NotionAnnotations, NotionBlock, NotionRichText } from './types';

/**
 * Notion 的单个 rich_text 内容上限是 2000 字符
 */
const MAX_RICH_TEXT_LENGTH = 2000;

/**
 * 行内语法的匹配顺序：代码 > 粗体 > 斜体 > 删除线 > 链接/图片
 */
const INLINE_REGEX = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)|(!?\[[^\]\n]*\]\([^)\n]+\))/;

/**
 * Notion 只接受固定的语言枚举，其它一律降级成 plain text，避免写入代码块时 400
 */
const LANGUAGE_MAP: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  javascript: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  typescript: 'typescript',
  py: 'python',
  python: 'python',
  sh: 'shell',
  zsh: 'shell',
  bash: 'bash',
  shell: 'shell',
  json: 'json',
  jsonc: 'json',
  html: 'html',
  xml: 'xml',
  css: 'css',
  scss: 'css',
  less: 'css',
  md: 'markdown',
  markdown: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  java: 'java',
  kotlin: 'kotlin',
  go: 'go',
  golang: 'go',
  rust: 'rust',
  rs: 'rust',
  ruby: 'ruby',
  rb: 'ruby',
  php: 'php',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'c++',
  'c++': 'c++',
  cs: 'c#',
  csharp: 'c#',
  diff: 'diff',
  dockerfile: 'docker',
  makefile: 'makefile',
  plaintext: 'plain text',
  text: 'plain text',
  txt: 'plain text',
};

function createRichText(
  content: string,
  annotations: NotionAnnotations = {},
  link?: string | null
): NotionRichText[] {
  if (!content) {
    return [];
  }
  const hasAnnotations = Object.keys(annotations).length > 0;
  const result: NotionRichText[] = [];
  for (let start = 0; start < content.length; start += MAX_RICH_TEXT_LENGTH) {
    const chunk = content.slice(start, start + MAX_RICH_TEXT_LENGTH);
    const richText: NotionRichText = {
      type: 'text',
      text: link ? { content: chunk, link: { url: link } } : { content: chunk },
    };
    if (hasAnnotations) {
      richText.annotations = { ...annotations };
    }
    result.push(richText);
  }
  return result;
}

/**
 * 把一段 markdown 行内文本解析成 Notion 的 rich_text 数组
 */
export function parseInline(
  text: string,
  annotations: NotionAnnotations = {},
  link?: string | null
): NotionRichText[] {
  const result: NotionRichText[] = [];
  let rest = text || '';
  while (rest.length > 0) {
    const match = INLINE_REGEX.exec(rest);
    if (!match) {
      result.push(...createRichText(rest, annotations, link));
      break;
    }
    if (match.index > 0) {
      result.push(...createRichText(rest.slice(0, match.index), annotations, link));
    }
    const token = match[0];
    rest = rest.slice(match.index + token.length);

    if (token.startsWith('`')) {
      result.push(...createRichText(token.slice(1, -1), { ...annotations, code: true }, link));
    } else if (token.startsWith('**') || token.startsWith('__')) {
      result.push(...parseInline(token.slice(2, -2), { ...annotations, bold: true }, link));
    } else if (token.startsWith('~~')) {
      result.push(
        ...parseInline(token.slice(2, -2), { ...annotations, strikethrough: true }, link)
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      result.push(...parseInline(token.slice(1, -1), { ...annotations, italic: true }, link));
    } else if (token.startsWith('![') || token.startsWith('[')) {
      const linkMatch = /^!?\[([^\]]*)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        const label = linkMatch[1] || linkMatch[2];
        const url = linkMatch[2].trim();
        result.push(...parseInline(label, annotations, url));
      } else {
        result.push(...createRichText(token, annotations, link));
      }
    } else {
      result.push(...createRichText(token, annotations, link));
    }
  }
  return result;
}

function textBlock(type: string, content: string): NotionBlock {
  return {
    object: 'block',
    type,
    [type]: {
      rich_text: parseInline(content),
    },
  };
}

function normalizeLanguage(language?: string): string {
  const key = (language || '').trim().toLowerCase();
  return LANGUAGE_MAP[key] || 'plain text';
}

function codeBlock(language: string, content: string): NotionBlock {
  return {
    object: 'block',
    type: 'code',
    code: {
      rich_text: createRichText(content),
      language: normalizeLanguage(language),
    },
  };
}

function imageBlock(alt: string, url: string): NotionBlock {
  // Notion 的 external image 只接受 http(s) 链接，其它情况降级成普通段落
  if (!/^https?:\/\//i.test(url)) {
    return textBlock('paragraph', alt || url);
  }
  return {
    object: 'block',
    type: 'image',
    image: {
      type: 'external',
      external: { url },
      caption: alt ? parseInline(alt) : [],
    },
  };
}

function appendChild(parent: NotionBlock, child: NotionBlock) {
  const container = parent[parent.type];
  if (!container) {
    return;
  }
  if (!Array.isArray(container.children)) {
    container.children = [];
  }
  container.children.push(child);
}

const FENCE_REGEX = /^\s*(```|~~~)\s*([^\s`~]*)\s*$/;
const DIVIDER_REGEX = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const HEADING_REGEX = /^(#{1,6})\s+(.*)$/;
const IMAGE_REGEX = /^!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)$/;
const QUOTE_REGEX = /^\s{0,3}>\s?/;
const LIST_REGEX = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TODO_REGEX = /^\[( |x|X)\]\s+(.*)$/;

/**
 * 判断一行是否是新 block 的开始，用于把连续的普通文本聚合成一个段落
 */
function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  return (
    FENCE_REGEX.test(line) ||
    DIVIDER_REGEX.test(line) ||
    HEADING_REGEX.test(trimmed) ||
    IMAGE_REGEX.test(trimmed) ||
    QUOTE_REGEX.test(line) ||
    LIST_REGEX.test(line)
  );
}

/**
 * 把 markdown 转成 Notion 的 block 数组
 * 只覆盖剪藏内容里常见的语法，未知语法统一降级为段落，保证不会因为格式问题写入失败
 */
export function markdownToBlocks(markdown: string): NotionBlock[] {
  const lines = (markdown || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks: NotionBlock[] = [];
  const listStack: Array<{ indent: number; block: NotionBlock }> = [];
  let index = 0;

  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.replace(/\s+$/, '');

    if (!line.trim()) {
      index++;
      continue;
    }

    // 代码块
    const fenceMatch = FENCE_REGEX.exec(line);
    if (fenceMatch) {
      const language = fenceMatch[2];
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !/^\s*(```|~~~)\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index++;
      }
      index++; // 跳过结束的 ```
      listStack.length = 0;
      blocks.push(codeBlock(language, codeLines.join('\n')));
      continue;
    }

    // 分割线
    if (DIVIDER_REGEX.test(line)) {
      listStack.length = 0;
      blocks.push({ object: 'block', type: 'divider', divider: {} });
      index++;
      continue;
    }

    // 标题，Notion 最多到 heading_3
    const headingMatch = HEADING_REGEX.exec(line.trim());
    if (headingMatch) {
      const level = Math.min(headingMatch[1].length, 3);
      listStack.length = 0;
      blocks.push(textBlock(`heading_${level}`, headingMatch[2]));
      index++;
      continue;
    }

    // 独占一行的图片
    const imageMatch = IMAGE_REGEX.exec(line.trim());
    if (imageMatch) {
      listStack.length = 0;
      blocks.push(imageBlock(imageMatch[1], imageMatch[2]));
      index++;
      continue;
    }

    // 引用，连续的 > 行合并成一个 quote
    if (QUOTE_REGEX.test(raw)) {
      const quoteLines: string[] = [];
      while (index < lines.length && QUOTE_REGEX.test(lines[index])) {
        quoteLines.push(lines[index].replace(QUOTE_REGEX, ''));
        index++;
      }
      listStack.length = 0;
      blocks.push(textBlock('quote', quoteLines.join('\n')));
      continue;
    }

    // 列表（支持嵌套与待办）
    const listMatch = LIST_REGEX.exec(raw);
    if (listMatch) {
      const indent = listMatch[1].replace(/\t/g, '    ').length;
      const ordered = /^\d/.test(listMatch[2]);
      const content = listMatch[3];
      const todoMatch = TODO_REGEX.exec(content);

      let block: NotionBlock;
      if (todoMatch) {
        block = {
          object: 'block',
          type: 'to_do',
          to_do: {
            rich_text: parseInline(todoMatch[2]),
            checked: todoMatch[1].toLowerCase() === 'x',
          },
        };
      } else {
        block = textBlock(ordered ? 'numbered_list_item' : 'bulleted_list_item', content);
      }

      while (listStack.length > 0 && indent <= listStack[listStack.length - 1].indent) {
        listStack.pop();
      }
      if (listStack.length > 0) {
        appendChild(listStack[listStack.length - 1].block, block);
      } else {
        blocks.push(block);
      }
      listStack.push({ indent, block });
      index++;
      continue;
    }

    // 其余情况聚合成段落
    const paragraphLines: string[] = [line];
    index++;
    while (index < lines.length && !isBlockStart(lines[index])) {
      paragraphLines.push(lines[index].replace(/\s+$/, ''));
      index++;
    }
    listStack.length = 0;
    blocks.push(textBlock('paragraph', paragraphLines.join('\n')));
  }

  return blocks;
}
