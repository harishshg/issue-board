/* Minimal, safe Markdown renderer: headings, paragraphs, lists, task lists, tables,
 * fenced code, blockquotes, hr, inline code, bold, italic and links.
 * All text is HTML-escaped before formatting, so user content can't inject markup. */
window.MD = (() => {
  'use strict';

  const escape = (s) => String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  const TASK_RE = /^\[( |x|X)\]\s+/;
  let taskCounter = 0;

  function safeUrl(url) {
    return /^(https?:\/\/|mailto:|#|\/|\.\/)/i.test(url);
  }

  function inline(text) {
    return String(text).split(/(`[^`]+`)/).map((part) => {
      if (part.length > 1 && part.startsWith('`') && part.endsWith('`')) {
        return `<code>${escape(part.slice(1, -1))}</code>`;
      }
      let t = escape(part);
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
        safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>` : m);
      t = t.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g,
        '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
      return t;
    }).join('');
  }

  const isFence = (l) => /^\s*```/.test(l);
  const isHeading = (l) => /^#{1,6}\s+/.test(l);
  const isHr = (l) => /^\s*(-{3,}|\*{3,})\s*$/.test(l);
  const isTable = (l) => /^\s*\|/.test(l);
  const isQuote = (l) => /^>\s?/.test(l);
  const isList = (l) => LIST_RE.test(l);
  const isBlockStart = (l) => isFence(l) || isHeading(l) || isHr(l) || isTable(l) || isQuote(l) || isList(l);
  const leading = (l) => l.length - l.trimStart().length;

  function table(rows) {
    const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    let head = cells(rows[0]);
    let body = rows.slice(1);
    if (body.length && /^[\s|:-]+$/.test(body[0])) body = body.slice(1);
    else { body = rows; head = null; }
    const th = head ? `<thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead>` : '';
    const tb = body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('');
    return `<div class="md-table"><table>${th}<tbody>${tb}</tbody></table></div>`;
  }

  function list(items, ordered) {
    const tag = ordered ? 'ol' : 'ul';
    const base = Math.min(...items.map((i) => i.indent));
    const lis = items.map((item) => {
      let text = item.text;
      let box = '';
      let cls = '';
      const task = text.match(TASK_RE);
      if (task) {
        const checked = task[1] !== ' ';
        box = `<input type="checkbox" class="md-task" data-task="${taskCounter++}"${checked ? ' checked' : ''} aria-label="Toggle item"> `;
        text = text.replace(TASK_RE, '');
        cls = ' class="task' + (checked ? ' done' : '') + '"';
      }
      const content = text.includes('\n') ? blocks(text) : inline(text);
      const depth = Math.min(Math.floor((item.indent - base) / 2), 4);
      const style = depth ? ` style="margin-left:${depth * 18}px"` : '';
      return `<li${cls}${style}>${box}${content}</li>`;
    }).join('');
    return `<${tag}${items.some((i) => TASK_RE.test(i.text)) ? ' class="tasks"' : ''}>${lis}</${tag}>`;
  }

  function blocks(src) {
    const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
    let html = '';
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }

      if (isFence(line)) {
        const indent = leading(line);
        const buf = [];
        i++;
        while (i < lines.length && !isFence(lines[i])) buf.push(lines[i++].slice(Math.min(indent, leading(lines[i - 1]))));
        i++;
        html += `<pre><code>${escape(buf.join('\n'))}</code></pre>`;
        continue;
      }
      let m = line.match(/^(#{1,6})\s+(.*)$/);
      if (m) {
        const level = Math.min(m[1].length + 1, 6);
        html += `<h${level}>${inline(m[2])}</h${level}>`;
        i++;
        continue;
      }
      if (isHr(line)) { html += '<hr>'; i++; continue; }
      if (isTable(line)) {
        const rows = [];
        while (i < lines.length && isTable(lines[i])) rows.push(lines[i++]);
        html += table(rows);
        continue;
      }
      if (isQuote(line)) {
        const buf = [];
        while (i < lines.length && isQuote(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
        html += `<blockquote>${blocks(buf.join('\n'))}</blockquote>`;
        continue;
      }
      if (isList(line)) {
        const ordered = /^\s*\d/.test(line);
        const items = [];
        let contentIndent = 0;
        while (i < lines.length) {
          const l = lines[i];
          const mm = l.match(LIST_RE);
          if (mm) {
            items.push({ indent: mm[1].length, text: mm[3] });
            contentIndent = l.length - mm[3].length;
            i++;
            continue;
          }
          const nextIndented = !l.trim() && i + 1 < lines.length && leading(lines[i + 1]) >= 2 && !LIST_RE.test(lines[i + 1]);
          if (items.length && ((l.trim() && leading(l) >= 2) || nextIndented)) {
            items[items.length - 1].text += '\n' + l.slice(Math.min(contentIndent, leading(l)));
            i++;
            continue;
          }
          break;
        }
        html += list(items, ordered);
        continue;
      }
      const para = [];
      while (i < lines.length && lines[i].trim() && !(para.length && isBlockStart(lines[i]))) {
        para.push(inline(lines[i].trim()));
        i++;
      }
      html += `<p>${para.join('<br>')}</p>`;
    }
    return html;
  }

  function render(src) {
    taskCounter = 0;
    return blocks(src);
  }

  /** Flip the n-th task checkbox ("- [ ]" <-> "- [x]") in the Markdown source. */
  function toggleTask(src, index) {
    const lines = String(src || '').split('\n');
    let inFence = false;
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
      if (isFence(lines[i])) { inFence = !inFence; continue; }
      if (inFence) continue;
      const m = lines[i].match(/^((?:>\s?)*\s*(?:[-*+]|\d+[.)])\s+)\[( |x|X)\]/);
      if (m) {
        if (n === index) {
          lines[i] = m[1] + (m[2] === ' ' ? '[x]' : '[ ]') + lines[i].slice(m[0].length);
          return lines.join('\n');
        }
        n++;
      }
    }
    return src;
  }

  return { render, inline, escape, toggleTask };
})();
