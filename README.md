# Commit Components

Write clear, consistent commit messages directly from Source Control.

Commit Components adds a focused commit form to VS Code so you can build commit messages with:

- optional scope
- concise title
- optional body/description
- optional footer (for sign-off, issue refs, metadata)

The generated message is written straight into the Git Source Control input box.

## Why Use It

Commit messages are often rushed. This extension helps you keep quality high without slowing down your flow.

- Structured input instead of one big text box
- Live commit preview before applying
- Scope suggestions from your repository YAML
- Reusable default footer for team conventions

## Features

### Source Control action

Open the commit form directly from the Source Control (Git) view.

### Commit form with live preview

Build messages in a clean form and preview the final result as you type.

Generated format:

```text
<scope>: <title>

<description>

<footer>
```

If scope is empty, the first line becomes just the title.

### Scope autoload from YAML

If a `.git_components.yaml` file exists at the workspace root, scope options are loaded automatically.

Supported YAML shapes include:

- string arrays
- object arrays with `name`
- top-level maps (keys used as scopes)

### Default footer support

Set a default footer once and reuse it in every commit form.

If no footer is configured, the extension can prompt you to set one when opening the form.

### Quiet workflow

Applying the commit message does not show success popups, so the flow stays fast and unobtrusive.

## Commands

Available from the Command Palette:

- `Commit Helper: Open Form`
- `Commit Helper: Set Default Footer`

## Configuration

This extension contributes:

- `commitComponents.footer`: default footer appended to generated commit messages.

Example:

```json
{
  "commitComponents.footer": "Signed-off-by: Jane Doe <jane@example.com>"
}
```

## How It Works

1. Open Source Control.
2. Launch `Commit Helper: Open Form` (or use the SCM action).
3. Fill title, optional scope/body/footer.
4. Click `Fill Commit Message`.
5. Review and commit from Git panel as usual.

## Requirements

- A Git repository open in VS Code.
- Built-in Git extension enabled.

## Notes

- If Git is not available, the generated message is copied to the clipboard as fallback.
- Scope suggestions require `.git_components.yaml` in the workspace root.
- Gitlint validation is currently experimental and only runs when a `.gitlint` file exists at workspace root.

## Release Notes

### 0.0.1

Initial preview release with:

- commit form webview
- SCM integration
- YAML-based scope suggestions
- default footer command and setting
