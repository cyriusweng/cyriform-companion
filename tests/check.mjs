import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const logic = require('../src/logic.js');
const root = new URL('../', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS ' + name); };
test('frontmatter preserves unrelated properties and classes', () => {
  const fm = { title: 'A & B', aliases: ['A', 'B'], number: 42, cssclasses: ['wide', 'third-party', 'cyriform-wide', 'cyriform-important'] };
  logic.updateClasses(fm, 'width', 'narrow');
  assert.deepEqual(fm, { title: 'A & B', aliases: ['A', 'B'], number: 42, cssclasses: ['wide', 'third-party', 'cyriform-important', 'cyriform-narrow'] });
});
test('each page category is exclusive and independently clearable', () => {
  for (const [group, options] of Object.entries(logic.GROUPS)) {
    const fm = { cssclasses: ['external', ...options.map(v => 'cyriform-' + v)] };
    logic.updateClasses(fm, group, options[0]); assert.deepEqual(fm.cssclasses, ['external', 'cyriform-' + options[0]]);
    logic.updateClasses(fm, group, ''); assert.deepEqual(fm.cssclasses, ['external']);
  }
});
test('string classes are normalised and unexpected property types stay intact', () => {
  assert.deepEqual(logic.updateClasses({ cssclasses: 'wide cyriform-wide' }, 'width', 'narrow').cssclasses, ['wide', 'cyriform-narrow']);
  for (const cssclasses of [42, {}, [1]]) { const fm = { cssclasses }; assert.throws(() => logic.updateClasses(fm, 'width', 'wide')); assert.equal(fm.cssclasses, cssclasses); }
  assert.throws(() => logic.updateClasses({}, 'unknown', 'value'));
  assert.throws(() => logic.updateClasses({}, 'width', 'injected'));
});
test('callouts preserve every selected line', () => {
  assert.equal(logic.callout('First\n\n- nested\n> quoted', 'note'), '> [!note] Note\n> First\n> \n> - nested\n> > quoted');
  assert.throws(() => logic.callout('text', '<script>'));
});
test('highlights safely preserve literal HTML and ampersands', () => {
  assert.equal(logic.highlight('<script> & "text"', 'gold'), '<mark class="cyriform-mark-gold">&lt;script&gt; &amp; &quot;text&quot;</mark>');
  assert.throws(() => logic.highlight('', 'gold')); assert.throws(() => logic.highlight('one\ntwo', 'gold'));
});
test('task editing preserves indentation, quotes, numbering and text', () => {
  assert.equal(logic.taskLine('  - [x] Keep [[Link]] #tag', '/'), '  - [/] Keep [[Link]] #tag');
  assert.equal(logic.taskLine('> 12. [ ] numbered', '!'), '> 12. [!] numbered');
  assert.equal(logic.taskLine('  ordinary text', 'x'), '  - [x] ordinary text');
  assert.equal(logic.taskLine('- [-] cancelled', ' '), '- [ ] cancelled');
  assert.throws(() => logic.taskLine('```js', 'x'));
});
test('Markdown image layout preserves URL, title and surrounding text', () => {
  const input = 'Before ![A diagram](https://example.org/a_(b).png "A title") after';
  assert.equal(logic.imageLayout(input, 20, 'banner'), 'Before ![A diagram cyriform-banner](https://example.org/a_(b).png "A title") after');
  assert.equal(logic.imageLayout('![A \\] bracket](<path with spaces.png>)', 8, 'left'), '![A \\] bracket cyriform-left](<path with spaces.png>)');
});
test('wikilink images preserve aliases and dimensions', () => {
  assert.equal(logic.imageLayout('![[image.png|A diagram|300x200]]', 8, 'banner'), '![[image.png|A diagram cyriform-banner|300x200]]');
  assert.equal(logic.imageLayout('![[image.png|300]]', 8, 'grid'), '![[image.png|cyriform-grid|300]]');
  assert.equal(logic.imageLayout('![[image.png|A cyriform-banner|300]]', 8, ''), '![[image.png|A|300]]');
});
test('multiple images use the captured cursor and require a clear target', () => {
  const line = '![one](one.png) between ![two](two.png)';
  assert.equal(logic.imageLayout(line, 28, 'right'), '![one](one.png) between ![two cyriform-right](two.png)');
  assert.throws(() => logic.imageLayout(line, 20, 'grid'));
  assert.throws(() => logic.imageLayout('ordinary text', 4, 'banner'));
  assert.throws(() => logic.imageLayout('\\![escaped](image.png)', 5, 'banner'));
});
// Test the bundled plugin at the public Obsidian API boundary.

class FakeMarkdownView { }
class FakePlugin { }
const bundle = { exports: {} };
vm.runInNewContext(read('main.js'), { module: bundle, require: () => ({ Plugin: FakePlugin, PluginSettingTab: class { }, Setting: class { }, SuggestModal: class { }, Notice: class { }, MarkdownView: FakeMarkdownView, setIcon() { } }), console, document: {} }, { filename: 'main.js' });
const Companion = bundle.exports;
function contextFixture() {
  const plugin = new Companion(), file = { path: 'note.md', basename: 'note' };
  let text = '- [ ] Original'; const view = new FakeMarkdownView(); view.file = file;
  const editor = { getValue: () => text, getLine: () => text, replaceRange: value => { text = value; }, focus() { }, listSelections: () => [{}], getSelection: () => '', getCursor: () => ({ line: 0, ch: 4 }) };
  view.editor = editor; plugin.disposed = false; plugin.app = { vault: { getAbstractFileByPath: () => file } };
  return { plugin, view, editor, file, context: plugin.capture(view, editor), set: value => { text = value; }, get: () => text };
}
test('bundled task command updates its captured editor', () => {
  const f = contextFixture(); f.plugin.applyEditor('task', 'x', f.context); assert.equal(f.get(), '- [x] Original');
});
test('stale text and switched files preserve current document', () => {
  const f = contextFixture(); f.set('New content'); assert.throws(() => f.plugin.applyEditor('task', 'x', f.context)); assert.equal(f.get(), 'New content');
  const g = contextFixture(); g.view.file = { path: 'other.md' }; assert.throws(() => g.plugin.applyEditor('task', 'x', g.context)); assert.equal(g.get(), '- [ ] Original');
});
test('multiple selections and disposed plugins preserve content', () => {
  const f = contextFixture(); f.context.multiple = true; assert.throws(() => f.plugin.applyEditor('task', 'x', f.context));
  f.context.multiple = false; f.plugin.disposed = true; assert.throws(() => f.plugin.applyEditor('task', 'x', f.context)); assert.equal(f.get(), '- [ ] Original');
});
test('unload closes pickers and removes owned interface elements', () => {
  const f = contextFixture(); let closed = 0, removed = 0;
  f.plugin.pickers = new Set([{ close() { closed++; } }]); f.plugin.toolbars = new Map([[{}, { remove() { removed++; } }]]); f.plugin.ribbon = { remove() { removed++; } };
  f.plugin.onunload(); assert.equal(closed, 1); assert.equal(removed, 2); assert.equal(f.plugin.toolbars.size, 0); assert.equal(f.plugin.disposed, true);
});
test('toolbar uses the captured view document and cleans up', () => {
  const f = contextFixture(), created = []; let attached;
  const doc = { createElement(tag) { created.push(tag); return { dataset: {}, children: [], setAttribute() { }, append(child) { this.children.push(child); }, addEventListener() { }, remove() { this.removed = true; } }; } };
  f.view.contentEl = { ownerDocument: doc, prepend(bar) { attached = bar; } };
  f.plugin.settings = { toolbar: true }; f.plugin.toolbars = new Map(); f.plugin.app.workspace = { getLeavesOfType: () => [{ view: f.view }] };
  f.plugin.refreshToolbars(); assert.equal(created.filter(tag => tag === 'button').length, 8); assert.equal(attached.children.length, 8);
  f.plugin.settings.toolbar = false; f.plugin.refreshToolbars(); assert.equal(attached.removed, true); assert.equal(f.plugin.toolbars.size, 0);
});
console.log(JSON.stringify({passed},null,2));
