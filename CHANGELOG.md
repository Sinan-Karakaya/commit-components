# Change Log

All notable changes to the "commit-components" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [0.0.5]

- **Global fallback scopes**: define a scope list in `commitComponents.scopes` (settings). Used when no `.git_components.yaml` is present. Leave empty to keep the free-text input.
- **No-scope option**: when a scope dropdown is shown, a `— No scope —` entry is available. Selecting it satisfies the required field but omits the scope prefix from the commit message (useful when the scope belongs in the title instead).
- **Owner display**: if a YAML scope entry has an `owner` field, it is shown next to the scope name in the dropdown (e.g. `frontend — @team-ui`).
- **Conventional commits format**: a Simple / Conventional toggle at the top of the form lets you switch formats per commit. Conventional mode adds a type selector (feat, fix, ci, docs, refactor, test, chore, perf, style, build, revert) and produces `type(scope): title`.
- **Default format setting**: `commitComponents.defaultFormat` (`"simple"` or `"conventional"`) controls which format is pre-selected when opening the form.

## [0.0.4]

- Scope field is now required — commit messages always include a scope prefix.
- Added "Generate with Copilot" button to pre-fill the title and description fields from the staged diff using GitHub Copilot (requires GitHub Copilot extension).

## [0.0.3]

- Added key shortcut (`Cmd/Ctrl+Alt+C`) to open the commit form.
- Pre-fill footer field from existing `commitComponents.footer` setting on open.
- Experimental gitlint validation for generated commit messages when `.gitlint` exists at workspace root.
- Added choice to save footer setting at Workspace or User (Global) level.

## [0.0.2]

- Added choice to save footer setting at Workspace or User (Global) level.
- Added optional experimental gitlint validation for generated commit messages when `.gitlint` exists.
