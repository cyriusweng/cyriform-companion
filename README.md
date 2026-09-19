# Cyriform Companion

Apply note states, widths and accents, and insert callouts, highlights, task states and image layouts through searchable, keyboard-accessible visual pickers. Cyriform Companion works with the [Cyriform theme](https://github.com/cyriusweng/cyriform-theme), which supplies the appearance of its per-note classes and image tokens.

## Use the tools

Open a Markdown note, then choose **Cyriform Companion: Open note tools** from the command palette or select the feather ribbon shortcut. Each of the eight actions also has its own command. Arrow keys choose an item, Enter applies it and Escape closes the picker. The plugin’s settings control the ribbon shortcut, editor context-menu entry and optional editor toolbar. The toolbar starts disabled; the ribbon and context-menu entry start enabled.

Every choice includes an effect preview rendered with the active theme. Page previews retain the note’s existing classes while showing the candidate state, type, width or accent. Content previews show the callout, highlight, task or image treatment. Browsing previews leaves the note unchanged; selecting a choice applies its existing action. The picker supports desktop and mobile-width layouts in light and dark modes.

Page tools change one category in the note’s `cssclasses` property: state, note type, width or accent. **Theme default** clears the selected category. Other categories, unrelated classes and other frontmatter properties remain intact. Obsidian’s frontmatter API may reserialise YAML formatting.

Content tools wrap selected lines in a callout, highlight one selected paragraph, change the task state on the cursor line, or apply an image layout token. A picker captures the note, editor, cursor and selection when opened. Editing actions verify that the captured document is still current before writing. Reopen the picker after changing that document. One selection is supported for each content action, and native editor undo applies to those edits.

## Available choices

| Tool | Choices |
| --- | --- |
| Page state | Important, attention, draft, archived, pinned |
| Note type | Meeting, daily note, index, project |
| Reading width | Theme default, narrow 54ch, wide 90ch, full width |
| Accent | Cobalt, old gold, oxblood, mineral, bone and ink |
| Callout | Standard semantic types, plus important, reference and experiment |
| Highlight | Old gold, cobalt, oxblood, mineral, bone and ink |
| Task state | Open, completed, in progress, cancelled, deferred, scheduled, question, important, starred, quotation |
| Image layout | Standard, banner, float left, float right, two-column grid, dark-mode inversion |

Image actions handle single-line inline Markdown images and wikilink embeds. They preserve the destination, description, title and wikilink dimensions while updating the Cyriform token. Place the cursor within the intended image when a line contains several images. Reference-style image definitions and multiline image syntax use manual layout editing. A highlight writes the selected text inside a colour-specific `mark` element and encodes literal HTML characters.

## Installation

Install from the [official Obsidian Community Directory](https://community.obsidian.md/plugins/cyriform-companion) by choosing **Add to Obsidian**. For manual installation, download `main.js`, `manifest.json` and `styles.css` from the latest GitHub Release into `.obsidian/plugins/cyriform-companion` within your chosen vault. Review and enable **Cyriform Companion** through **Settings → Community plugins**. The minimum application version is Obsidian 1.13.0.

Install the Cyriform theme to display the associated page classes, extended task styling and image layouts. The plugin uses Obsidian’s editor and vault APIs for its text and property actions. Style Settings is an optional, separate plugin for the theme’s typography and colour controls.

## Privacy and permissions

All features are free and operate locally. The plugin’s runtime uses the active vault, the selected editor and Obsidian’s plugin-settings storage. Its runtime communication is confined to those local application APIs. Source code is included in this repository. The implementation uses browser-compatible APIs for mobile support.

The plugin changes only the file or editor captured by the selected action and its own settings. Preserve backups of important notes, particularly when applying a workflow to several documents. Disabling the companion removes its commands, ribbon item, toolbars and event registrations; previously applied note classes and content remain in the notes.

## Verification and support

Native checks used Obsidian 1.13.7 on macOS. They exercised command registration, visual pickers, preservation of unrelated frontmatter, a task-state update, image description and title preservation, an eight-action toolbar, and unload cleanup. Automated tests cover transformation boundaries, stale-document protection, multiple-selection protection, malformed frontmatter, image ambiguity, and toolbar ownership across document contexts. Physical iOS and Android devices remain further acceptance targets.

Report issues through this repository’s Issues page with the Obsidian version, operating system and a minimal sample. Keep sensitive note content in your own vault and use a fabricated sample when reporting a problem.

## Development

Build and test with Node.js 20 or later and its standard library:

```sh
npm run build
npm test
```

`src/logic.js` contains pure transformations. `src/companion.js` contains the Obsidian integration. The build combines them into the root `main.js`; runtime assets remain local and human-readable.

## Licence

Published under the [MIT Licence](./LICENSE), copyright 2026 Cyrius. Cyriform Companion is an independently developed community plugin for Obsidian.
