import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

export interface SafeGitMetadata {
  branch?: string;
  commitsToday?: number;
  lastCommitAgo?: string;
}

export function getSafeGitMetadata(cwd: string = process.cwd()): SafeGitMetadata {
  try {
    // Check if .git exists in workspace or parent
    let currentDir = cwd;
    let gitDir: string | null = null;
    for (let i = 0; i < 5; i++) {
      const check = path.join(currentDir, ".git");
      if (fs.existsSync(check)) {
        gitDir = check;
        break;
      }
      const parent = path.dirname(currentDir);
      if (parent === currentDir) break;
      currentDir = parent;
    }

    if (!gitDir) {
      return {};
    }

    // Safe command 1: branch name
    let branch: string | undefined;
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      }).trim();
    } catch {
      // If git CLI is unavailable, read .git/HEAD directly
      try {
        const headFile = path.join(gitDir, "HEAD");
        if (fs.existsSync(headFile)) {
          const headContent = fs.readFileSync(headFile, "utf-8").trim();
          if (headContent.startsWith("ref: refs/heads/")) {
            branch = headContent.replace("ref: refs/heads/", "");
          }
        }
      } catch {
        // Ignore fallback error
      }
    }

    // Safe command 2: commits count today
    let commitsToday: number | undefined;
    try {
      const today = new Date().toISOString().split("T")[0];
      const countStr = execSync(`git rev-list --count --since="${today} 00:00:00" HEAD`, {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      }).trim();
      commitsToday = parseInt(countStr, 10) || 0;
    } catch {
      // Ignore if unavailable
    }

    // Safe command 3: last commit relative time
    let lastCommitAgo: string | undefined;
    try {
      lastCommitAgo = execSync('git log -1 --format="%cr"', {
        cwd,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 3000,
      }).trim();
    } catch {
      // Ignore if unavailable
    }

    return {
      branch: branch || undefined,
      commitsToday,
      lastCommitAgo,
    };
  } catch {
    return {};
  }
}
