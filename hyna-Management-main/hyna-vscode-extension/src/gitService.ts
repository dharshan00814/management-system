import { exec } from 'child_process';
import * as vscode from 'vscode';

/**
 * Safely inspects non-sensitive Git metadata for the active workspace.
 * Reads ONLY the current branch name and commit count.
 * Never touches or reads source code contents.
 */
export async function getActiveGitBranch(workspaceRoot?: string): Promise<string | undefined> {
  if (!workspaceRoot) {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return undefined;
    workspaceRoot = folders[0].uri.fsPath;
  }

  return new Promise((resolve) => {
    exec(
      'git rev-parse --abbrev-ref HEAD',
      { cwd: workspaceRoot, timeout: 3000 },
      (error, stdout) => {
        if (error) {
          resolve(undefined);
          return;
        }
        const branch = stdout.trim();
        resolve(branch.length > 0 ? branch : undefined);
      }
    );
  });
}
