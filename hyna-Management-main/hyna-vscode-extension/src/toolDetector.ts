import * as vscode from 'vscode';
import type { DeveloperTool } from './types';

/**
 * Detects whether the extension is running inside Antigravity, Cursor, or standard VS Code.
 */
export function detectDeveloperTool(): DeveloperTool {
  const appName = (vscode.env.appName || '').toLowerCase();
  const execPath = (process.execPath || '').toLowerCase();

  if (
    appName.includes('antigravity') ||
    execPath.includes('antigravity') ||
    Boolean(process.env.ANTIGRAVITY_AGENT) ||
    Boolean(process.env.ANTIGRAVITY_EDITOR_APP_ROOT) ||
    Boolean(process.env.ANTIGRAVITY_CONVERSATION_ID)
  ) {
    return 'antigravity';
  }

  if (
    appName.includes('cursor') ||
    execPath.includes('cursor') ||
    Boolean(process.env.CURSOR_VERSION) ||
    Boolean(process.env.CURSOR_AGENT)
  ) {
    return 'cursor';
  }

  return 'vscode';
}
