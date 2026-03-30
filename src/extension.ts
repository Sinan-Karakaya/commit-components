import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import * as os from 'os'
import { spawnSync } from 'child_process'

export function activate(context: vscode.ExtensionContext) {
  void autoConfigureFooterOnInstall(context)

  const disposable = vscode.commands.registerCommand(
    'commitComponents.openForm',
    async () => {
      await ensureFooterConfigured()
      CommitFormPanel.createOrShow(context)
    },
  )
  const setFooterDisposable = vscode.commands.registerCommand(
    'commitComponents.setFooter',
    async () => {
      await promptAndSaveFooter()
    },
  )

  context.subscriptions.push(disposable, setFooterDisposable)
}

async function autoConfigureFooterOnInstall(
  context: vscode.ExtensionContext,
): Promise<void> {
  const STATE_KEY = 'footerAutoConfigured'
  if (context.globalState.get<boolean>(STATE_KEY)) {
    return
  }
  await context.globalState.update(STATE_KEY, true)

  if (getConfiguredFooter()) {
    return
  }

  const gpgSign = gitConfigGet('commit.gpgsign')
  if (gpgSign !== 'true' && gpgSign !== '1') {
    return
  }

  const name = gitConfigGet('user.name')
  const email = gitConfigGet('user.email')
  if (!name || !email) {
    return
  }

  const footer = `Signed-off-by: ${name} <${email}>`
  try {
    await vscode.workspace
      .getConfiguration('commitComponents')
      .update('footer', footer, vscode.ConfigurationTarget.Global)
  } catch {
    // Best effort — silently skip if settings cannot be written
  }
}

function gitConfigGet(key: string): string {
  const result = spawnSync('git', ['config', '--get', key], {
    encoding: 'utf8',
  })
  if (result.status !== 0 || result.error) {
    return ''
  }
  return result.stdout.trim()
}

async function ensureFooterConfigured(): Promise<void> {
  const currentFooter = getConfiguredFooter()

  if (currentFooter) {
    return
  }

  const pick = await vscode.window.showQuickPick(
    ['Set footer now', 'Continue without footer'],
    {
      title: 'Commit Components Footer',
      placeHolder: 'No default footer is configured',
      ignoreFocusOut: true,
    },
  )

  if (pick === 'Set footer now') {
    await promptAndSaveFooter()
    if (!getConfiguredFooter()) {
      vscode.window.showWarningMessage(
        'Footer was not saved. You can set it from "Commit Helper: Set Default Footer".',
      )
    }
  }
}

async function promptAndSaveFooter(): Promise<void> {
  const config = vscode.workspace.getConfiguration('commitComponents')
  const currentFooter = config.get<string>('footer', '')
  const nextFooter = await vscode.window.showInputBox({
    title: 'Commit Components Footer',
    prompt: 'Set the default footer appended to generated commit messages',
    placeHolder: 'e.g. Signed-off-by: Your Name <you@example.com>',
    value: currentFooter,
    ignoreFocusOut: true,
  })

  if (nextFooter === undefined) {
    return
  }

  const target = await pickFooterSaveTarget()
  if (!target) {
    return
  }

  try {
    await config.update('footer', nextFooter.trim(), target)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    void vscode.window.showErrorMessage(`Could not save footer: ${message}`)
  }
}

async function pickFooterSaveTarget(): Promise<
  vscode.ConfigurationTarget | undefined
> {
  if (!vscode.workspace.workspaceFolders?.length) {
    return vscode.ConfigurationTarget.Global
  }

  const selected = await vscode.window.showQuickPick(
    [
      {
        label: 'Workspace',
        description: 'Save footer only for this workspace',
        target: vscode.ConfigurationTarget.Workspace,
      },
      {
        label: 'User (Global)',
        description: 'Save footer for all VS Code workspaces',
        target: vscode.ConfigurationTarget.Global,
      },
    ],
    {
      title: 'Where do you want to save the footer?',
      ignoreFocusOut: true,
    },
  )

  return selected?.target
}

function getConfiguredFooter(): string {
  return vscode.workspace
    .getConfiguration('commitComponents')
    .get<string>('footer', '')
    .trim()
}

export function deactivate() {}

// ---------------------------------------------------------------------------
// YAML parsing
// ---------------------------------------------------------------------------

interface ScopeItem {
  name: string
  owner?: string
}

function extractOwner(record: Record<string, unknown>): string | undefined {
  // singular string: owner: "team-a"
  if (typeof record['owner'] === 'string' && record['owner'].trim() !== '') {
    return record['owner'].trim()
  }
  // plural array: owners: [team-a, team-b]
  if (Array.isArray(record['owners'])) {
    const names = record['owners']
      .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
      .map((o) => o.trim())
    if (names.length > 0) {
      return names.join(', ')
    }
  }
  return undefined
}

function itemFromYaml(item: unknown): ScopeItem | null {
  if (typeof item === 'string' && item.trim() !== '') {
    return { name: item.trim() }
  }
  if (isRecord(item) && typeof item['name'] === 'string' && item['name'].trim() !== '') {
    return { name: item['name'].trim(), owner: extractOwner(item) }
  }
  return null
}

function parseScopes(filePath: string): ScopeItem[] {
  let content: string
  try {
    content = fs.readFileSync(filePath, 'utf8')
  } catch {
    return []
  }

  let parsed: unknown
  try {
    parsed = yaml.load(content)
  } catch {
    return []
  }

  // Simple array of strings or objects: ["frontend", {name: "backend", owner: "team"}]
  if (Array.isArray(parsed)) {
    return parsed.map(itemFromYaml).filter((s): s is ScopeItem => s !== null)
  }

  if (!isRecord(parsed)) {
    return []
  }

  // Look for well-known top-level keys that hold arrays of scopes
  const candidates = [
    'scopes',
    'components',
    'packages',
    'modules',
    'apps',
    'services',
  ]
  for (const key of candidates) {
    const value = parsed[key]
    if (Array.isArray(value)) {
      const result = value
        .map(itemFromYaml)
        .filter((s): s is ScopeItem => s !== null)
      if (result.length > 0) {
        return result
      }
    }
  }

  // Fallback: use the top-level keys as scopes, read owner(s) from values
  return Object.keys(parsed)
    .filter((k) => k.trim() !== '')
    .map((k) => {
      const val = parsed[k]
      const owner = isRecord(val) ? extractOwner(val) : undefined
      return { name: k, owner }
    })
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// ---------------------------------------------------------------------------
// Git SCM helpers
// ---------------------------------------------------------------------------

interface GitRepository {
  inputBox: { value: string }
}

interface GitAPI {
  repositories: GitRepository[]
}

interface GitExtension {
  getAPI(version: number): GitAPI
}

function getGitInputBox(): GitRepository['inputBox'] | undefined {
  try {
    const ext = vscode.extensions.getExtension<GitExtension>('vscode.git')
    if (!ext) {
      return undefined
    }
    const git = ext.exports.getAPI(1)
    return git.repositories[0]?.inputBox
  } catch {
    return undefined
  }
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ---------------------------------------------------------------------------
// Webview panel
// ---------------------------------------------------------------------------

class CommitFormPanel {
  public static currentPanel: CommitFormPanel | undefined

  private readonly _panel: vscode.WebviewPanel
  private readonly _context: vscode.ExtensionContext
  private _disposables: vscode.Disposable[] = []

  public static createOrShow(context: vscode.ExtensionContext) {
    const column =
      vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One

    if (CommitFormPanel.currentPanel) {
      CommitFormPanel.currentPanel._panel.reveal(column)
      CommitFormPanel.currentPanel._refresh()
      return
    }

    const panel = vscode.window.createWebviewPanel(
      'commitHelper',
      'Commit Helper',
      column,
      { enableScripts: true, retainContextWhenHidden: true },
    )

    CommitFormPanel.currentPanel = new CommitFormPanel(panel, context)
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this._panel = panel
    this._context = context

    this._refresh()

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables)

    this._panel.webview.onDidReceiveMessage(
      (message: {
        command: string
        scope: string
        title: string
        description: string
        footer: string
        type: string
        format: 'simple' | 'conventional'
      }) => {
        if (message.command === 'submit') {
          void this._handleSubmit(
            message.scope,
            message.title,
            message.description,
            message.footer,
            message.type,
            message.format,
          )
        } else if (message.command === 'generateWithCopilot') {
          void this._generateWithCopilot()
        }
      },
      null,
      this._disposables,
    )
  }

  private async _handleSubmit(
    scope: string,
    title: string,
    description: string,
    footer: string,
    type: string,
    format: 'simple' | 'conventional',
  ) {
    const noScope = scope === '__no_scope__'
    let firstLine: string
    if (format === 'conventional') {
      firstLine = noScope ? `${type}: ${title}` : `${type}(${scope}): ${title}`
    } else {
      firstLine = noScope ? title : `${scope}: ${title}`
    }
    let msg = firstLine
    if (description.trim()) {
      msg += `\n\n${description.trim()}`
    }
    if (footer.trim()) {
      msg += `\n\n${footer.trim()}`
    }

    const isValid = await this._validateWithGitlint(msg)
    if (!isValid) {
      return
    }

    const inputBox = getGitInputBox()
    if (inputBox !== undefined) {
      inputBox.value = msg
    } else {
      vscode.env.clipboard.writeText(msg)
    }

    this._panel.dispose()
  }

  private async _validateWithGitlint(message: string): Promise<boolean> {
    const folders = vscode.workspace.workspaceFolders
    if (!folders || folders.length === 0) {
      return true
    }

    const workspaceRoot = folders[0].uri.fsPath
    const gitlintConfigPath = path.join(workspaceRoot, '.gitlint')
    if (!fs.existsSync(gitlintConfigPath)) {
      return true
    }

    const tempFile = path.join(
      os.tmpdir(),
      `commit-components-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`,
    )

    try {
      fs.writeFileSync(tempFile, message, 'utf8')
      const result = spawnSync('gitlint', ['--msg-filename', tempFile], {
        cwd: workspaceRoot,
        encoding: 'utf8',
      })

      if (result.error) {
        const pick = await vscode.window.showWarningMessage(
          'Experimental: A .gitlint file was found, but the gitlint binary is not available in PATH.',
          'Continue without validation',
          'Cancel',
        )
        return pick === 'Continue without validation'
      }

      if (result.status === 0) {
        return true
      }

      const details = [result.stdout, result.stderr]
        .filter(Boolean)
        .join('\n')
        .trim()

      const messageText = details
        ? `Experimental gitlint check: commit message does not conform to gitlint rules.\n\n${details}`
        : 'Experimental gitlint check: commit message does not conform to gitlint rules.'

      const pick = await vscode.window.showWarningMessage(
        messageText,
        'Use anyway',
        'Cancel',
      )
      return pick === 'Use anyway'
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err)
      const pick = await vscode.window.showWarningMessage(
        `Experimental gitlint check failed: ${messageText}`,
        'Continue without validation',
        'Cancel',
      )
      return pick === 'Continue without validation'
    } finally {
      try {
        fs.unlinkSync(tempFile)
      } catch {
        // Best effort cleanup
      }
    }
  }

  private _getStagedDiff(): string {
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    const result = spawnSync('git', ['diff', '--staged'], {
      encoding: 'utf8',
      cwd,
    })
    if (result.error || result.status !== 0) {
      return ''
    }
    return result.stdout.trim()
  }

  private async _generateWithCopilot(): Promise<void> {
    const postDone = () =>
      void this._panel.webview.postMessage({ command: 'copilotDone' })

    const diff = this._getStagedDiff()
    if (!diff) {
      void vscode.window.showWarningMessage(
        'No staged changes found. Stage some files before generating a commit message.',
      )
      postDone()
      return
    }

    let models: vscode.LanguageModelChat[]
    try {
      models = await vscode.lm.selectChatModels({ vendor: 'copilot' })
    } catch {
      void vscode.window.showErrorMessage(
        'Could not access Copilot language models.',
      )
      postDone()
      return
    }

    if (models.length === 0) {
      void vscode.window.showErrorMessage(
        'No Copilot language models available. Make sure GitHub Copilot is installed and signed in.',
      )
      postDone()
      return
    }

    const model = models[0]
    const prompt = `You are a git commit message assistant.
Given the staged diff below, generate a conventional commit message.

Respond with ONLY a valid JSON object — no markdown, no explanation:
{"title": "<imperative title, max 72 chars, no scope, or tasks type such as feat, fix etc...>", "description": "<optional multi-line body, empty string if not needed>"}

Staged diff:
\`\`\`
${diff.slice(0, 8000)}
\`\`\``

    try {
      const cts = new vscode.CancellationTokenSource()
      const response = await model.sendRequest(
        [vscode.LanguageModelChatMessage.User(prompt)],
        {},
        cts.token,
      )

      let text = ''
      for await (const chunk of response.text) {
        text += chunk
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Unexpected response format from Copilot.')
      }

      const parsed = JSON.parse(jsonMatch[0]) as {
        title?: string
        description?: string
      }

      void this._panel.webview.postMessage({
        command: 'copilotResult',
        title: parsed.title ?? '',
        description: parsed.description ?? '',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      void vscode.window.showErrorMessage(`Copilot generation failed: ${msg}`)
      postDone()
    }
  }

  private _getScopes(): ScopeItem[] {
    const folders = vscode.workspace.workspaceFolders
    if (folders && folders.length > 0) {
      const yamlPath = path.join(folders[0].uri.fsPath, '.git_components.yaml')
      if (fs.existsSync(yamlPath)) {
        const yamlScopes = parseScopes(yamlPath)
        if (yamlScopes.length > 0) {
          return yamlScopes
        }
      }
    }
    return vscode.workspace
      .getConfiguration('commitComponents')
      .get<string[]>('scopes', [])
      .filter((s) => s.trim() !== '')
      .map((s) => ({ name: s.trim() }))
  }

  private _refresh() {
    const scopes = this._getScopes()
    const config = vscode.workspace.getConfiguration('commitComponents')
    const footer = config.get<string>('footer', '')
    const defaultFormat = config.get<string>('defaultFormat', 'simple') as
      | 'simple'
      | 'conventional'
    this._panel.webview.html = this._buildHtml(scopes, footer, defaultFormat)
  }

  private _buildHtml(
    scopes: ScopeItem[],
    footer: string,
    defaultFormat: 'simple' | 'conventional',
  ): string {
    const scopeField =
      scopes.length > 0
        ? `<select id="scope">
                 <option value="">— select scope —</option>
                 ${scopes
                   .map((s) => {
                     const ownerAttr = s.owner
                       ? ` data-owner="${escapeHtml(s.owner)}"`
                       : ''
                     return `<option value="${escapeHtml(s.name)}"${ownerAttr}>${escapeHtml(s.name)}</option>`
                   })
                   .join('\n                 ')}
                 <option value="__no_scope__">— No scope —</option>
               </select>
               <span class="scope-note" id="scopeNote"></span>`
        : `<input type="text" id="scope" placeholder="feat, fix, docs, refactor…" />`

    const isConventional = defaultFormat === 'conventional'

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Commit Helper</title>
<style>
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    margin: 0;
    padding: 24px;
  }

  h1 {
    font-size: 1.1em;
    font-weight: 600;
    margin: 0 0 20px;
    color: var(--vscode-foreground);
  }

  .field {
    margin-bottom: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--vscode-foreground);
    opacity: 0.85;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  label .req { color: var(--vscode-inputValidation-errorBorder); }

  input[type="text"],
  select,
  textarea {
    width: 100%;
    padding: 5px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    font-family: inherit;
    font-size: inherit;
    outline: none;
  }

  input[type="text"]:focus,
  select:focus,
  textarea:focus {
    border-color: var(--vscode-focusBorder);
  }

  textarea {
    min-height: 72px;
    resize: vertical;
    line-height: 1.5;
  }

  .footer-area {
    opacity: 0.75;
  }

  .preview-label {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--vscode-foreground);
    opacity: 0.85;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
  }

  .preview {
    background: var(--vscode-textCodeBlock-background, var(--vscode-input-background));
    border: 1px solid var(--vscode-input-border, transparent);
    border-left: 3px solid var(--vscode-focusBorder);
    border-radius: 2px;
    padding: 8px 10px;
    font-family: var(--vscode-font-family);
    font-size: 0.9em;
    white-space: pre-wrap;
    word-break: break-word;
    min-height: 40px;
    color: var(--vscode-editor-foreground);
  }

  .preview.empty {
    opacity: 0.4;
    font-style: italic;
    font-family: inherit;
  }

  .actions {
    margin-top: 20px;
    display: flex;
    gap: 8px;
    align-items: center;
  }

  button[type="submit"] {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 16px;
    border-radius: 2px;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
    font-weight: 500;
  }

  button[type="submit"]:hover {
    background: var(--vscode-button-hoverBackground);
  }

  button[type="submit"]:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .hint {
    font-size: 0.8em;
    opacity: 0.6;
  }

  .field-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .copilot-btn {
    background: transparent;
    color: var(--vscode-textLink-foreground);
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: 0.8em;
    font-family: inherit;
    line-height: 1;
  }

  .copilot-btn:hover:not(:disabled) {
    text-decoration: underline;
  }

  .copilot-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .scope-note {
    font-size: 0.8em;
    opacity: 0.65;
    display: none;
  }

  .scope-note.visible {
    display: block;
  }

  .format-tabs {
    display: flex;
    margin-bottom: 20px;
    border: 1px solid var(--vscode-input-border, transparent);
    border-radius: 2px;
    overflow: hidden;
    width: fit-content;
  }

  .format-tab {
    background: var(--vscode-input-background);
    color: var(--vscode-foreground);
    border: none;
    padding: 5px 14px;
    cursor: pointer;
    font-family: inherit;
    font-size: 0.85em;
    font-weight: 500;
    opacity: 0.7;
  }

  .format-tab.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    opacity: 1;
  }

  .format-tab:hover:not(.active) {
    opacity: 1;
  }
</style>
</head>
<body>
<h1>Commit Helper</h1>
<form id="form" novalidate>

  <div class="format-tabs">
    <button type="button" class="format-tab${!isConventional ? ' active' : ''}" data-format="simple">Simple</button>
    <button type="button" class="format-tab${isConventional ? ' active' : ''}" data-format="conventional">Conventional</button>
  </div>

  <div class="field" id="typeField"${!isConventional ? ' style="display:none"' : ''}>
    <label for="commitType">Type <span class="req">*</span></label>
    <select id="commitType">
      <option value="">— select type —</option>
      <option value="feat">feat</option>
      <option value="fix">fix</option>
      <option value="ci">ci</option>
      <option value="docs">docs</option>
      <option value="refactor">refactor</option>
      <option value="test">test</option>
      <option value="chore">chore</option>
      <option value="perf">perf</option>
      <option value="style">style</option>
      <option value="build">build</option>
      <option value="revert">revert</option>
    </select>
  </div>

  <div class="field">
    <label for="scope">Scope <span class="req">*</span></label>
    ${scopeField}
  </div>

  <div class="field">
    <div class="field-header">
      <label for="title">Title <span class="req">*</span></label>
      <button type="button" id="copilotBtn" class="copilot-btn">Generate with Copilot</button>
    </div>
    <input type="text" id="title" placeholder="Short, imperative description of the change" autocomplete="off" />
  </div>

  <div class="field">
    <label for="description">Description</label>
    <textarea id="description" placeholder="Optional — longer explanation, motivation, context…"></textarea>
  </div>

  <div class="field">
    <label for="footer">Footer</label>
    <textarea id="footer" class="footer-area" placeholder="e.g. Signed-off-by: …">${escapeHtml(footer)}</textarea>
  </div>

  <div>
    <div class="preview-label">Preview</div>
    <div class="preview empty" id="preview">Fill in the fields above…</div>
  </div>

  <div class="actions">
    <button type="submit" id="submitBtn" disabled>Fill Commit Message</button>
    <span class="hint">Fills the Source Control input box</span>
  </div>

</form>

<script>
  const vscode = acquireVsCodeApi();

  const scopeEl       = document.getElementById('scope');
  const scopeNote     = document.getElementById('scopeNote');
  const typeEl        = document.getElementById('commitType');
  const titleEl       = document.getElementById('title');
  const descriptionEl = document.getElementById('description');
  const footerEl      = document.getElementById('footer');
  const previewEl     = document.getElementById('preview');
  const submitBtn     = document.getElementById('submitBtn');
  const copilotBtn    = document.getElementById('copilotBtn');
  const typeField     = document.getElementById('typeField');

  let currentFormat = '${defaultFormat}';

  document.querySelectorAll('.format-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      currentFormat = btn.dataset.format;
      document.querySelectorAll('.format-tab').forEach(function (b) {
        b.classList.toggle('active', b.dataset.format === currentFormat);
      });
      typeField.style.display = currentFormat === 'conventional' ? '' : 'none';
      update();
    });
  });

  function buildMessage() {
    const scope       = scopeEl.value.trim();
    const title       = titleEl.value.trim();
    const description = descriptionEl.value.trim();
    const footer      = footerEl.value.trim();
    const type        = typeEl.value.trim();
    const noScope     = scope === '__no_scope__';

    if (!scope || !title) { return null; }
    if (currentFormat === 'conventional' && !type) { return null; }

    let firstLine;
    if (currentFormat === 'conventional') {
      firstLine = noScope ? type + ': ' + title : type + '(' + scope + '): ' + title;
    } else {
      firstLine = noScope ? title : scope + ': ' + title;
    }

    let msg = firstLine;
    if (description) { msg += '\\n\\n' + description; }
    if (footer)      { msg += '\\n\\n' + footer; }
    return msg;
  }

  function updateScopeNote() {
    if (!scopeNote) { return; }
    const selected = scopeEl.options && scopeEl.options[scopeEl.selectedIndex];
    const owner = selected ? selected.dataset.owner : '';
    if (owner) {
      scopeNote.textContent = 'Owners: ' + owner;
      scopeNote.classList.add('visible');
    } else {
      scopeNote.textContent = '';
      scopeNote.classList.remove('visible');
    }
  }

  function update() {
    updateScopeNote();
    const msg = buildMessage();
    if (msg) {
      previewEl.textContent = msg;
      previewEl.classList.remove('empty');
      submitBtn.disabled = false;
    } else {
      previewEl.textContent = 'Fill in the fields above…';
      previewEl.classList.add('empty');
      submitBtn.disabled = true;
    }
  }

  [scopeEl, typeEl, titleEl, descriptionEl, footerEl].forEach(function (el) {
    el.addEventListener('input',  update);
    el.addEventListener('change', update);
  });

  copilotBtn.addEventListener('click', function () {
    copilotBtn.disabled = true;
    copilotBtn.textContent = 'Generating…';
    vscode.postMessage({ command: 'generateWithCopilot' });
  });

  window.addEventListener('message', function (event) {
    const msg = event.data;
    if (msg.command === 'copilotResult') {
      titleEl.value = msg.title || '';
      descriptionEl.value = msg.description || '';
      update();
      copilotBtn.disabled = false;
      copilotBtn.textContent = 'Generate with Copilot';
    } else if (msg.command === 'copilotDone') {
      copilotBtn.disabled = false;
      copilotBtn.textContent = 'Generate with Copilot';
    }
  });

  document.getElementById('form').addEventListener('submit', function (e) {
    e.preventDefault();
    const msg = buildMessage();
    if (!msg) { return; }
    vscode.postMessage({
      command:     'submit',
      scope:       scopeEl.value.trim(),
      title:       titleEl.value.trim(),
      description: descriptionEl.value.trim(),
      footer:      footerEl.value.trim(),
      type:        typeEl.value.trim(),
      format:      currentFormat,
    });
  });

  update();
  titleEl.focus();
</script>
</body>
</html>`
  }

  public dispose() {
    CommitFormPanel.currentPanel = undefined
    this._panel.dispose()
    while (this._disposables.length) {
      this._disposables.pop()?.dispose()
    }
  }
}
