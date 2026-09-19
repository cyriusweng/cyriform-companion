/*
MIT License

Copyright (c) 2026 Cyrius

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

*/
'use strict';
const { Plugin, PluginSettingTab, Setting, SuggestModal, Notice, MarkdownView, setIcon } = require('obsidian');
const Logic = (() => { const module = {exports:{}};
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

return module.exports; })();
const LABELS = {
  important: 'Important', alert: 'Attention', draft: 'Draft', archived: 'Archived', pinned: 'Pinned',
  meeting: 'Meeting', daily: 'Daily note', index: 'Index', project: 'Project',
  wide: 'Wide · 90ch', narrow: 'Narrow · 54ch', 'full-width': 'Full width',
  'accent-cobalt': 'Cobalt', 'accent-gold': 'Old gold', 'accent-oxblood': 'Oxblood', 'accent-mineral': 'Mineral', 'accent-bone': 'Bone and ink',
  gold: 'Old gold', cobalt: 'Cobalt', oxblood: 'Oxblood', mineral: 'Mineral', bone: 'Bone and ink',
  banner: 'Banner', left: 'Float left', right: 'Float right', grid: 'Two-column grid', invert: 'Invert in dark mode',
  ' ': 'Open', x: 'Completed', '/': 'In progress', '-': 'Cancelled', '>': 'Deferred', '<': 'Scheduled', '?': 'Question', '!': 'Important', '*': 'Starred', '"': 'Quotation',
};
const ACTIONS = [
  { id: 'state', label: 'Set page state', icon: 'flag', detail: 'Important, attention, draft, archived or pinned' },
  { id: 'type', label: 'Set note type', icon: 'notebook-pen', detail: 'Meeting, daily note, index or project' },
  { id: 'width', label: 'Set reading width', icon: 'move-horizontal', detail: 'Narrow, wide or full-width reading' },
  { id: 'accent', label: 'Set note accent', icon: 'palette', detail: 'A colour signal for this note' },
  { id: 'callout', label: 'Insert callout', icon: 'message-square', detail: 'Wrap selected text in a semantic annotation' },
  { id: 'highlight', label: 'Highlight selected text', icon: 'highlighter', detail: 'Mark a single paragraph in one of five colours' },
  { id: 'task', label: 'Set task state', icon: 'square-check', detail: 'Update the task on the captured cursor line' },
  { id: 'image', label: 'Set image layout', icon: 'image', detail: 'Style the image at the captured cursor position' },
];
const titleCase = value => LABELS[value] || value.charAt(0).toUpperCase() + value.slice(1);
const PREVIEW_IMAGE = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="360" viewBox="0 0 160 96"><rect width="160" height="96" fill="#FBF8F1"/><path d="M18 72H142M18 24V72M34 60L66 36L94 50L132 20" fill="none" stroke="#365ED8" stroke-width="3"/><circle cx="94" cy="50" r="5" fill="#A78555"/></svg>');
function renderPreview(choice, el, context, baseClasses) {
  const preview = el.createDiv({ cls: 'cyriform-effect-preview' });
  preview.dataset.kind = choice.kind;
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  const frontmatter = { cssclasses: baseClasses.slice() };
  if (Logic.GROUPS[choice.kind]) Logic.updateClasses(frontmatter, choice.kind, choice.value);
  const page = preview.createDiv({ cls: 'markdown-preview-view markdown-rendered cyriform-effect-content' });
  for (const token of frontmatter.cssclasses || []) page.classList.add(token);
  const sample = Array.from(context?.selection || 'Keep the detail that matters.').slice(0, 100).join('');
  if (Logic.GROUPS[choice.kind]) {
    page.addClass('cyriform-effect-page', 'is-readable-line-width');
    if (choice.kind !== 'width') page.addClass('cyriform-effect-readable');
    const content = page.createDiv({ cls: 'markdown-preview-sizer' }).createDiv({ cls: 'markdown-preview-section' });
    content.createDiv({ cls: 'inline-title', text: context?.file?.basename || 'Field notes' });
    content.createEl('p', { text: choice.kind === 'width' ? 'A clear observation gives the next thought a place to begin. Keep its context and follow the question.' : 'A clear observation, in its original context.' });
    if (choice.kind === 'width') content.createEl('p', { text: 'The page keeps its structure as the emphasis changes.' });
    content.createEl('a', { cls: 'internal-link', text: 'Follow the reference' });
  } else if (choice.kind === 'callout') {
    const callout = page.createDiv({ cls: 'callout', attr: { 'data-callout': choice.value } });
    const title = callout.createDiv({ cls: 'callout-title' });
    const icon = title.createDiv({ cls: 'callout-icon' });
    const iconName = el.ownerDocument.defaultView.getComputedStyle(callout).getPropertyValue('--callout-icon').trim().replace(/^['"]|['"]$/g, '');
    setIcon(icon, iconName || 'message-square');
    title.createDiv({ cls: 'callout-title-inner', text: choice.label });
    callout.createDiv({ cls: 'callout-content' }).createEl('p', { text: sample });
  } else if (choice.kind === 'highlight') {
    const paragraph = page.createEl('p');
    paragraph.appendText('A thought worth keeping: ');
    paragraph.createEl('mark', { cls: 'cyriform-mark-' + choice.value, text: sample });
  } else if (choice.kind === 'task') {
    const item = page.createEl('ul', { cls: 'contains-task-list' }).createEl('li', { cls: 'task-list-item', attr: { 'data-task': choice.value } });
    if (choice.value !== ' ') item.addClass('is-checked');
    const checkbox = item.createEl('input', { cls: 'task-list-item-checkbox', type: 'checkbox' });
    checkbox.checked = choice.value !== ' ';
    checkbox.tabIndex = -1;
    item.createSpan({ cls: 'task-list-item-content', text: choice.label + ' · Review the reference' });
  } else if (choice.kind === 'image') {
    page.addClass('cyriform-effect-page', 'is-readable-line-width');
    const paragraph = page.createDiv({ cls: 'markdown-preview-sizer' }).createEl('p');
    const alt = 'Sample diagram' + (choice.value ? ' cyriform-' + choice.value : '');
    for (let n = 0; n < (choice.value === 'grid' ? 2 : 1); n++) {
      const embed = paragraph.createSpan({ cls: 'image-embed', attr: { alt } });
      embed.createEl('img', { attr: { alt, src: PREVIEW_IMAGE } });
    }
    if (choice.value !== 'grid') paragraph.appendText('An observation and its context remain together on the page.');
  }
}
class CyriformPicker extends SuggestModal {
  constructor(plugin, title, choices, choose, context) {
    super(plugin.app); this.plugin = plugin; this.choices = choices; this.choose = choose; this.context = context;
    const classes = context && plugin.app.metadataCache?.getFileCache(context.file)?.frontmatter?.cssclasses;
    this.previewClasses = (Array.isArray(classes) ? classes : [classes]).filter(value => typeof value === 'string').flatMap(value => value.split(/\s+/).filter(Boolean));
    this.setPlaceholder(title); this.setInstructions([{ command: '↑ ↓', purpose: 'Choose' }, { command: 'Enter', purpose: 'Apply' }, { command: 'Esc', purpose: 'Close' }]);
  }
  onOpen() { super.onOpen(); this.modalEl.addClass('cyriform-picker'); this.inputEl.setAttribute('aria-label', this.inputEl.placeholder); this.plugin.pickers.add(this); }
  onClose() { this.plugin.pickers.delete(this); super.onClose(); }
  getSuggestions(query) { const q = query.trim().toLowerCase(); return this.choices.filter(choice => (choice.label + ' ' + (choice.detail || '')).toLowerCase().includes(q)); }
  renderSuggestion(choice, el) {
    el.addClass('cyriform-choice');
    const icon = el.createSpan({ cls: 'cyriform-choice-icon' }); setIcon(icon, choice.icon || 'minus');
    const words = el.createDiv({ cls: 'cyriform-choice-words' }); words.createDiv({ text: choice.label, cls: 'cyriform-choice-title' });
    if (choice.detail) words.createDiv({ text: choice.detail, cls: 'cyriform-choice-detail' });
    if (choice.kind) renderPreview(choice, el, this.context, this.previewClasses);
  }
  async onChooseSuggestion(choice) {
    if (this.plugin.disposed) return;
    try { await this.choose(choice); } catch (error) { new Notice(error instanceof Error ? error.message : 'Cyriform could complete this action after reopening the picker.'); }
  }
}
class CyriformSettings extends PluginSettingTab {
  constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
  display() {
    this.containerEl.empty();
    this.containerEl.createEl('p', { text: 'Per-note tools for Ground, Force and Variations. Theme typography and colour controls are available through Style Settings.' });
    new Setting(this.containerEl).setName('Editor toolbar').setDesc('Show a compact tool strip above Markdown editors. Commands remain available from the command palette.').addToggle(toggle => toggle.setValue(this.plugin.settings.toolbar).onChange(async value => { this.plugin.settings.toolbar = value; await this.plugin.saveData(this.plugin.settings); this.plugin.refreshToolbars(); }));
    new Setting(this.containerEl).setName('Ribbon shortcut').setDesc('Show the Cyriform tools shortcut in the application ribbon.').addToggle(toggle => toggle.setValue(this.plugin.settings.ribbon).onChange(async value => { this.plugin.settings.ribbon = value; await this.plugin.saveData(this.plugin.settings); this.plugin.refreshRibbon(); }));
    new Setting(this.containerEl).setName('Editor context menu').setDesc('Add Cyriform actions to the Markdown editor context menu.').addToggle(toggle => toggle.setValue(this.plugin.settings.contextMenu).onChange(async value => { this.plugin.settings.contextMenu = value; await this.plugin.saveData(this.plugin.settings); }));
    this.containerEl.createEl('p', { text: 'The selected action uses the note and cursor captured when the picker opens. Reopen the picker after editing the document. Per-note classes remain in the note when the companion is disabled.' });
  }
}
module.exports = class CyriformCompanion extends Plugin {
  async onload() {
    this.disposed = false; this.pickers = new Set(); this.toolbars = new Map(); this.ribbon = null;
    const saved = await this.loadData(); this.settings = { toolbar: false, ribbon: true, contextMenu: true };
    for (const key of Object.keys(this.settings)) if (typeof saved?.[key] === 'boolean') this.settings[key] = saved[key];
    this.addSettingTab(new CyriformSettings(this.app, this));
    this.addCommand({ id: 'open-tools', name: 'Open note tools', editorCallback: (editor, view) => this.openTools(this.capture(view, editor)) });
    for (const action of ACTIONS) this.addCommand({ id: action.id, name: action.label, editorCallback: (editor, view) => this.openAction(action.id, this.capture(view, editor)) });
    this.registerEvent(this.app.workspace.on('editor-menu', (menu, editor, view) => {
      if (!this.settings.contextMenu || !(view instanceof MarkdownView)) return;
      const context = this.capture(view, editor);
      menu.addSeparator(); menu.addItem(item => item.setTitle('Cyriform tools').setIcon('feather').onClick(() => this.openTools(context)));
    }));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshToolbars()));
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refreshToolbars()));
    this.app.workspace.onLayoutReady(() => { if (!this.disposed) { this.refreshRibbon(); this.refreshToolbars(); } });
  }
  capture(view, editor) {
    if (!view?.file || !editor) return null;
    return { view, editor, file: view.file, text: editor.getValue(), from: editor.getCursor('from'), to: editor.getCursor('to'), cursor: editor.getCursor(), selection: editor.getSelection(), multiple: editor.listSelections().length > 1 };
  }
  activeContext() { const view = this.app.workspace.getActiveViewOfType(MarkdownView); return this.capture(view, view?.editor); }
  check(context, editing = false) {
    if (this.disposed) throw new Error('Enable Cyriform Companion to use this action.');
    if (!context || this.app.vault.getAbstractFileByPath(context.file.path) !== context.file) throw new Error('Open a Markdown note, then choose the action.');
    if (editing && (context.view.file !== context.file || context.editor.getValue() !== context.text)) throw new Error('The captured note has changed. Reopen Cyriform tools to use its current contents.');
    if (editing && context.multiple) throw new Error('Use one selection for this action.');
    return context;
  }
  picker(title, choices, choose, context) { new CyriformPicker(this, title, choices, choose, context).open(); }
  openTools(context) {
    if (!context) { new Notice('Open a Markdown note to use Cyriform tools.'); return; }
    this.picker('Cyriform · choose a tool', ACTIONS, choice => this.openAction(choice.id, context));
  }
  openAction(action, context) {
    if (!context) { new Notice('Open a Markdown note to use Cyriform tools.'); return; }
    const group = Logic.GROUPS[action];
    if (group) {
      const choices = [{ value: '', kind: action, label: 'Theme default', detail: 'Clear this Cyriform category', icon: 'rotate-ccw' }, ...group.map(value => ({ value, kind: action, label: titleCase(value), icon: action === 'accent' ? 'palette' : 'file-pen-line' }))];
      this.picker('Cyriform · ' + ACTIONS.find(item => item.id === action).label.toLowerCase(), choices, async choice => {
        this.check(context);
        await this.app.fileManager.processFrontMatter(context.file, frontmatter => Logic.updateClasses(frontmatter, action, choice.value));
        new Notice('Cyriform · ' + choice.label + ' applied to ' + context.file.basename + '.');
      }, context);
      return;
    }
    const values = { callout: Logic.CALLOUTS, highlight: Logic.MARKS, task: Logic.TASKS, image: ['', ...Logic.IMAGE_LAYOUTS] }[action];
    if (!values) return;
    const choices = values.map(value => ({ value, kind: action, label: value === '' ? 'Standard image' : titleCase(value), icon: { callout: 'message-square', highlight: 'highlighter', task: 'square-check', image: 'image' }[action] }));
    this.picker('Cyriform · ' + ACTIONS.find(item => item.id === action).label.toLowerCase(), choices, choice => this.applyEditor(action, choice.value, context), context);
  }
  applyEditor(action, value, context) {
    const { editor, from, to, cursor, selection } = this.check(context, true);
    if (action === 'callout') {
      const before = from.ch > 0 ? '\n\n' : '';
      const after = to.ch < editor.getLine(to.line).length ? '\n\n' : '\n';
      editor.replaceRange(before + Logic.callout(selection, value) + after, from, to, 'cyriform');
    } else if (action === 'highlight') {
      editor.replaceRange(Logic.highlight(selection, value), from, to, 'cyriform');
    } else {
      const line = editor.getLine(cursor.line);
      const replacement = action === 'task' ? Logic.taskLine(line, value) : Logic.imageLayout(line, cursor.ch, value);
      editor.replaceRange(replacement, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: line.length }, 'cyriform');
    }
    editor.focus();
  }
  refreshRibbon() {
    this.ribbon?.remove(); this.ribbon = null;
    if (this.settings.ribbon) this.ribbon = this.addRibbonIcon('feather', 'Cyriform tools', () => this.openTools(this.activeContext()));
  }
  refreshToolbars() {
    if (this.disposed) return;
    const views = new Set(this.app.workspace.getLeavesOfType('markdown').map(leaf => leaf.view));
    for (const [view, bar] of this.toolbars) if (!views.has(view) || !this.settings.toolbar) { bar.remove(); this.toolbars.delete(view); }
    if (!this.settings.toolbar) return;
    for (const view of views) {
      if (!(view instanceof MarkdownView) || this.toolbars.has(view)) continue;
      const doc = view.contentEl.ownerDocument;
      const bar = doc.createElement('div'); bar.className = 'cyriform-toolbar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Cyriform note tools');
      for (const action of ACTIONS) {
        const button = doc.createElement('button'); button.type = 'button'; button.dataset.action = action.id; button.setAttribute('aria-label', action.label); button.title = action.label; setIcon(button, action.icon); bar.append(button);
      }
      // A single delegated listener belongs to this removable element.
      bar.addEventListener('pointerdown', event => { if (event.target.closest('button')) event.preventDefault(); });
      bar.addEventListener('click', event => { const button = event.target.closest('button[data-action]'); if (button) this.openAction(button.dataset.action, this.capture(view, view.editor)); });
      view.contentEl.prepend(bar); this.toolbars.set(view, bar);
    }
  }
  onunload() {
    this.disposed = true;
    for (const picker of [...this.pickers]) picker.close();
    for (const bar of this.toolbars.values()) bar.remove();
    this.toolbars.clear(); this.ribbon?.remove(); this.ribbon = null;
  }
};
