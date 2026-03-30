# Commit Components — CLAUDE.md

## What This Is

A VS Code extension that replaces the plain Git commit input box with a structured form. Users fill in scope, title, description, and footer separately; the extension assembles a formatted commit message and writes it directly into the Source Control input box.

## Key Concepts

- **Scope**: optional component/module prefix (e.g. `feat`, `fix`, or a YAML-loaded project scope)
- **Footer**: optional trailer line (e.g. `Signed-off-by: …`, issue refs). Stored in VS Code settings as `commitComponents.footer`
- **YAML scope autoload**: if `.git_components.yaml` exists at workspace root, scopes are loaded from it automatically
- **Gitlint**: experimental validation — only runs if `.gitlint` exists at workspace root

## Project Structure

```
src/extension.ts   — all extension logic (single file)
package.json       — manifest, commands, keybindings, configuration schema
esbuild.js         — build script (bundles to dist/extension.js)
```

## Architecture Notes

- Everything lives in `src/extension.ts` — no sub-modules yet
- The webview (`CommitFormPanel`) is created fresh each time; HTML is generated server-side via `_buildHtml()`
- Git SCM integration uses the `vscode.git` built-in extension API (version 1)
- Footer auto-configuration on first install reads `git config` via `spawnSync` — checks `commit.gpgsign` before pre-filling to avoid adding a sign-off trailer when the user isn't signing commits

## Commands

| Command | ID | Default Key |
|---|---|---|
| Open Form | `commitComponents.openForm` | `Cmd/Ctrl+Alt+C` |
| Set Default Footer | `commitComponents.setFooter` | — |

## Configuration

| Key | Type | Description |
|---|---|---|
| `commitComponents.footer` | string | Default footer pre-filled in every commit form |

## Build & Publish

```bash
pnpm run compile        # type-check + lint + esbuild
pnpm run package        # production bundle
vsce package            # produces .vsix
vsce publish            # publish to marketplace
```

## Design Principles

- No success popups after applying — keep the flow unobtrusive
- Gitlint validation is always opt-in (requires `.gitlint` present) and always lets the user override
- Auto-footer setup on install is a one-time action tracked in `globalState`; never overwrites a footer the user has already set
