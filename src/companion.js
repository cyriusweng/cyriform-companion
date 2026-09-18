'use strict';
const { Plugin, PluginSettingTab, Setting, SuggestModal, Notice, MarkdownView, setIcon } = require('obsidian');
const Logic = require('./logic');
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
class CyriformPicker extends SuggestModal {
  constructor(plugin, title, choices, choose) {
    super(plugin.app); this.plugin = plugin; this.choices = choices; this.choose = choose;
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
    if (choice.preview) { const preview = el.createSpan({ cls: 'cyriform-choice-preview ' + choice.preview, text: choice.sample || 'Aa' }); preview.setAttribute('aria-hidden', 'true'); }
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
  picker(title, choices, choose) { new CyriformPicker(this, title, choices, choose).open(); }
  openTools(context) {
    if (!context) { new Notice('Open a Markdown note to use Cyriform tools.'); return; }
    this.picker('Cyriform · choose a tool', ACTIONS, choice => this.openAction(choice.id, context));
  }
  openAction(action, context) {
    if (!context) { new Notice('Open a Markdown note to use Cyriform tools.'); return; }
    const group = Logic.GROUPS[action];
    if (group) {
      const choices = [{ value: '', label: 'Theme default', detail: 'Clear this Cyriform category', icon: 'rotate-ccw' }, ...group.map(value => ({ value, label: titleCase(value), icon: action === 'accent' ? 'palette' : 'file-pen-line', preview: action === 'accent' ? 'cyriform-preview-' + value : '' }))];
      this.picker('Cyriform · ' + ACTIONS.find(item => item.id === action).label.toLowerCase(), choices, async choice => {
        this.check(context);
        await this.app.fileManager.processFrontMatter(context.file, frontmatter => Logic.updateClasses(frontmatter, action, choice.value));
        new Notice('Cyriform · ' + choice.label + ' applied to ' + context.file.basename + '.');
      });
      return;
    }
    const values = { callout: Logic.CALLOUTS, highlight: Logic.MARKS, task: Logic.TASKS, image: ['', ...Logic.IMAGE_LAYOUTS] }[action];
    if (!values) return;
    const choices = values.map(value => ({ value, label: value === '' ? 'Standard image' : titleCase(value), icon: { callout: 'message-square', highlight: 'highlighter', task: 'square-check', image: 'image' }[action], preview: 'cyriform-preview-' + action + '-' + (value || 'default'), sample: action === 'task' ? `[${value}]` : 'Aa' }));
    this.picker('Cyriform · ' + ACTIONS.find(item => item.id === action).label.toLowerCase(), choices, choice => this.applyEditor(action, choice.value, context));
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
