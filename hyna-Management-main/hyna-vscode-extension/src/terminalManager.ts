import * as vscode from 'vscode';
import type { DeveloperTool } from './types';

export class HynaTerminalManager implements vscode.Pseudoterminal {
  private writeEmitter = new vscode.EventEmitter<string>();
  onDidWrite: vscode.Event<string> = this.writeEmitter.event;

  private closeEmitter = new vscode.EventEmitter<number>();
  onDidClose?: vscode.Event<number> = this.closeEmitter.event;

  private terminal: vscode.Terminal | null = null;
  private isTerminalOpen = false;
  private onUserInterrupt?: () => void;
  private onTerminalClose?: () => void;

  private currentInfo = {
    toolName: 'Developer Tool',
    deviceName: 'Workstation',
    workspaceName: 'Current Project',
    projectName: 'None',
    taskTitle: 'None',
  };

  constructor(
    onUserInterrupt?: () => void,
    onTerminalClose?: () => void
  ) {
    this.onUserInterrupt = onUserInterrupt;
    this.onTerminalClose = onTerminalClose;
  }

  public updateInfo(info: Partial<typeof this.currentInfo>) {
    this.currentInfo = { ...this.currentInfo, ...info };
  }

  open(): void {
    this.isTerminalOpen = true;
    this.printHeader();
  }

  close(): void {
    this.isTerminalOpen = false;
    this.terminal = null;
    if (this.onTerminalClose) {
      this.onTerminalClose();
    }
  }

  handleInput(data: string): void {
    // If user presses Ctrl+C (\x03), trigger disconnect / stop
    if (data === '\x03') {
      this.writeEmitter.fire('^C\r\n\x1b[33m[Hyna Live Tracker] Termination signal received. Stopping session and disconnecting...\x1b[0m\r\n');
      if (this.onUserInterrupt) {
        this.onUserInterrupt();
      }
    } else if (data === '\r' || data === '\n') {
      this.writeEmitter.fire('\r\n\x1b[90m(Hyna Live Tracker is actively running. Press Ctrl+C or run Hyna: Disconnect to stop)\x1b[0m\r\n');
    }
  }

  private printHeader(): void {
    const banner = [
      '\r\n\x1b[36m  _   _                    \x1b[0m',
      '\x1b[36m | | | |_   _ _ __   __ _  \x1b[0m  \x1b[1mHyna Studio Developer Tracker\x1b[0m',
      `\x1b[36m | |_| | | | | '_ \\ / _\` | \x1b[0m  \x1b[35m${this.currentInfo.toolName} Live Activity Agent v1.0.0\x1b[0m`,
      '\x1b[36m |  _  | |_| | | | | (_| | \x1b[0m  \x1b[90mPrivacy-Preserving Work Activity\x1b[0m',
      '\x1b[36m |_| |_|\\__, |_| |_|\\__,_| \x1b[0m',
      '\x1b[36m         |___/             \x1b[0m\r\n',
      '\x1b[32m✔ [Hyna Live Tracker] Connected to Hyna Studio\x1b[0m',
      `\x1b[90m• Workstation:\x1b[0m  ${this.currentInfo.deviceName}`,
      `\x1b[90m• Environment:\x1b[0m  \x1b[35m${this.currentInfo.toolName}\x1b[0m`,
      `\x1b[90m• Workspace:\x1b[0m    ${this.currentInfo.workspaceName}`,
      `\x1b[90m• Project:\x1b[0m      ${this.currentInfo.projectName}`,
      `\x1b[90m• Task:\x1b[0m         ${this.currentInfo.taskTitle}\r\n`,
      '\x1b[36m⚡ Automatic tracking active: Reporting safe activity & heartbeats every 45s.\x1b[0m',
      '\x1b[33mℹ When you close this terminal or exit this tool, tracking will automatically stop & disconnect.\x1b[0m\r\n',
      '\x1b[90m--------------------------------------------------------------------------------\x1b[0m\r\n',
    ];

    this.writeEmitter.fire(banner.join('\r\n'));
  }

  public show(reveal = true): void {
    if (!this.terminal) {
      this.terminal = vscode.window.createTerminal({
        name: 'Hyna Live Tracker',
        iconPath: new vscode.ThemeIcon('pulse'),
        pty: this,
      });
    }

    if (reveal) {
      this.terminal.show(true);
    }
  }

  public log(message: string): void {
    if (!this.isTerminalOpen) return;
    const time = new Date().toLocaleTimeString();
    this.writeEmitter.fire(`\x1b[90m[${time}]\x1b[0m ${message}\r\n`);
  }

  public logSuccess(message: string): void {
    this.log(`\x1b[32m✔ ${message}\x1b[0m`);
  }

  public logInfo(message: string): void {
    this.log(`\x1b[36mℹ ${message}\x1b[0m`);
  }

  public logWarning(message: string): void {
    this.log(`\x1b[33m⚠ ${message}\x1b[0m`);
  }

  public logHeartbeat(status: 'active' | 'idle'): void {
    if (status === 'idle') {
      this.log(`\x1b[33m[Heartbeat]\x1b[0m Workstation idle (Reporting to Hyna Studio)`);
    } else {
      this.log(`\x1b[32m[Heartbeat]\x1b[0m Active work synced with Hyna Studio`);
    }
  }

  public logActivity(filePath: string, branch?: string): void {
    const branchTag = branch ? ` \x1b[90m(git: ${branch})\x1b[0m` : '';
    this.log(`\x1b[35m[Activity]\x1b[0m File: ${filePath}${branchTag}`);
  }

  public logSessionEnded(): void {
    this.logWarning('Session ended safely. Workstation disconnected from Hyna Studio.');
  }

  public dispose(): void {
    if (this.terminal) {
      try {
        this.terminal.dispose();
      } catch {
        // ignore
      }
      this.terminal = null;
      this.isTerminalOpen = false;
    }
  }
}
