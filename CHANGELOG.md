# Change Log

All notable changes to the "commit-components" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

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
