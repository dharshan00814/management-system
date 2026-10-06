import * as vscode from 'vscode';

export class IdleDetectorService {
  private lastActivityMs: number = Date.now();
  private isIdle: boolean = false;
  private checkIntervalTimer: NodeJS.Timeout | null = null;
  private idleTimeoutMs: number;
  private onIdleCallback: () => void;
  private onActiveCallback: () => void;
  private disposables: vscode.Disposable[] = [];

  constructor(
    idleTimeoutMinutes: number,
    onIdle: () => void,
    onActive: () => void
  ) {
    this.idleTimeoutMs = Math.max(1, idleTimeoutMinutes) * 60 * 1000;
    this.onIdleCallback = onIdle;
    this.onActiveCallback = onActive;

    this.registerActivityListeners();
    this.startCheckLoop();
  }

  public recordActivity() {
    this.lastActivityMs = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      this.onActiveCallback();
    }
  }

  public getIsIdle(): boolean {
    return this.isIdle;
  }

  public updateTimeout(minutes: number) {
    this.idleTimeoutMs = Math.max(1, minutes) * 60 * 1000;
  }

  private registerActivityListeners() {
    // 1. Text document changes (typing/editing without logging content)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(() => this.recordActivity())
    );

    // 2. Switching active text editor / file tabs
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor(() => this.recordActivity())
    );

    // 3. Window focus state changes
    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          this.recordActivity();
        }
      })
    );
  }

  private startCheckLoop() {
    // Check every 15 seconds
    this.checkIntervalTimer = setInterval(() => {
      const elapsed = Date.now() - this.lastActivityMs;
      if (elapsed >= this.idleTimeoutMs && !this.isIdle) {
        this.isIdle = true;
        this.onIdleCallback();
      }
    }, 15000);
  }

  public dispose() {
    if (this.checkIntervalTimer) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}
