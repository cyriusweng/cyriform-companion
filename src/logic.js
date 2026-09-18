'use strict';
const PREFIX = 'cyriform-';
const GROUPS = {
  state: ['important', 'alert', 'draft', 'archived', 'pinned'],
  type: ['meeting', 'daily', 'index', 'project'],
  width: ['wide', 'narrow', 'full-width'],
  accent: ['accent-cobalt', 'accent-gold', 'accent-oxblood', 'accent-mineral', 'accent-bone'],
};
const IMAGE_LAYOUTS = ['banner', 'left', 'right', 'grid', 'invert'];
const MARKS = ['gold', 'cobalt', 'oxblood', 'mineral', 'bone'];
const TASKS = [' ', 'x', '/', '-', '>', '<', '?', '!', '*', '"'];
const CALLOUTS = ['note', 'abstract', 'info', 'todo', 'tip', 'success', 'question', 'warning', 'failure', 'danger', 'bug', 'example', 'quote', 'important', 'reference', 'experiment'];
function updateClasses(frontmatter, group, choice) {
  const options = GROUPS[group];
  if (!options || (choice !== '' && !options.includes(choice))) throw new Error('Choose a recognised page option.');
  const current = frontmatter.cssclasses;
  if (current != null && typeof current !== 'string' && !Array.isArray(current)) throw new Error('The cssclasses property needs a text value or a list of text values.');
  const values = typeof current === 'string' ? current.split(/\s+/).filter(Boolean) : (current || []).slice();
  if (values.some(value => typeof value !== 'string')) throw new Error('Each cssclasses entry needs a text value.');
  const owned = new Set(options.map(value => PREFIX + value));
  const result = values.filter(value => !owned.has(value));
  if (choice) result.push(PREFIX + choice);
  if (result.length) frontmatter.cssclasses = result;
  else if (Object.hasOwn(frontmatter, 'cssclasses')) delete frontmatter.cssclasses;
  return frontmatter;
}
function callout(text, type) {
  if (!CALLOUTS.includes(type)) throw new Error('Choose a recognised callout type.');
  const title = type.charAt(0).toUpperCase() + type.slice(1);
  return `> [!${type}] ${title}\n` + (text || 'Write your annotation here.').split('\n').map(line => '> ' + line).join('\n');
}
function highlight(text, colour) {
  if (!MARKS.includes(colour)) throw new Error('Choose a recognised highlight colour.');
  if (!text || text.includes('\n')) throw new Error('Select text within a single paragraph.');
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<mark class="cyriform-mark-${colour}">${escaped}</mark>`;
}
function taskLine(line, state) {
  if (!TASKS.includes(state)) throw new Error('Choose a recognised task state.');
  const match = /^(\s*(?:>\s*)*)(?:(- |\* |\+ |\d+[.)] )(?:(\[[^\]\r\n]\])\s*)?)?(.*)$/.exec(line);
  if (!match || /^(?:`{3,}|~{3,})/.test(match[4])) throw new Error('Place the cursor on an ordinary text or task line.');
  return `${match[1]}${match[2] || '- '}[${state}] ${match[4]}`;
}
function imageSpans(line) {
  const result = [];
  for (let i = 0; i < line.length - 2; i++) {
    if (line[i] !== '!' || line[i + 1] !== '[' || (i && line[i - 1] === '\\')) continue;
    if (line[i + 2] === '[') {
      const end = line.indexOf(']]', i + 3);
      if (end >= 0) { result.push({ start: i, end: end + 2, kind: 'wiki', inner: line.slice(i + 3, end) }); i = end + 1; }
      continue;
    }
    let close = i + 2;
    for (; close < line.length; close++) {
      if (line[close] === '\\') { close++; continue; }
      if (line[close] === ']') break;
    }
    if (line[close + 1] !== '(') continue;
    let depth = 1, end = close + 2, quoted = false, angle = false;
    for (; end < line.length; end++) {
      const c = line[end];
      if (c === '\\') { end++; continue; }
      if (c === '"' && !angle) quoted = !quoted;
      if (!quoted && c === '<') angle = true;
      if (!quoted && c === '>') angle = false;
      if (quoted || angle) continue;
      if (c === '(') depth++;
      if (c === ')' && --depth === 0) break;
      if (c !== ')' && c !== '(') continue;
    }
    if (depth === 0) { result.push({ start: i, end: end + 1, kind: 'markdown', alt: line.slice(i + 2, close), suffix: line.slice(close, end + 1) }); i = end; }
  }
  return result;
}
function cleanImageTokens(text) {
  return text.split(/(\s+)/).filter(part => !IMAGE_LAYOUTS.some(layout => part === PREFIX + layout)).join('').trim();
}
function imageLayout(line, cursor, layout) {
  if (layout !== '' && !IMAGE_LAYOUTS.includes(layout)) throw new Error('Choose a recognised image layout.');
  const images = imageSpans(line);
  let target = images.find(image => cursor >= image.start && cursor <= image.end);
  if (!target && images.length === 1) target = images[0];
  if (!target) throw new Error('Place the cursor within one inline image embed.');
  const token = layout ? PREFIX + layout : '';
  let replacement;
  if (target.kind === 'wiki') {
    const parts = target.inner.split('|');
    const path = parts.shift();
    const size = parts.length && /^\d+(?:x\d+)?$/.test(parts.at(-1)) ? parts.pop() : '';
    const originalAlt = parts.join('|');
    const alt = [cleanImageTokens(originalAlt), token].filter(Boolean).join(' ');
    replacement = `![[${[path, alt, size].filter(Boolean).join('|')}]]`;
  } else {
    const alt = [cleanImageTokens(target.alt), token].filter(Boolean).join(' ');
    replacement = '![' + alt + target.suffix;
  }
  return line.slice(0, target.start) + replacement + line.slice(target.end);
}
module.exports = { GROUPS, IMAGE_LAYOUTS, MARKS, TASKS, CALLOUTS, updateClasses, callout, highlight, taskLine, imageSpans, imageLayout };
