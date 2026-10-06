import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { StoredCredentials, DeveloperActivityEvent, ProjectTaskMapping } from "./types";

const HYNA_DIR = path.join(os.homedir(), ".hyna");
const CREDS_FILE = path.join(HYNA_DIR, "credentials.json");
const QUEUE_FILE = path.join(HYNA_DIR, "offline_queue.json");
const LOCAL_CONFIG_FILE = ".hyna.json";

function ensureDirExists(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveCredentials(creds: StoredCredentials): void {
  ensureDirExists(HYNA_DIR);
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

export function getCredentials(): StoredCredentials | null {
  try {
    if (!fs.existsSync(CREDS_FILE)) return null;
    const content = fs.readFileSync(CREDS_FILE, "utf-8");
    return JSON.parse(content) as StoredCredentials;
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      fs.unlinkSync(CREDS_FILE);
    }
  } catch {
    // Ignore error
  }
}

export function enqueueOfflineEvent(event: DeveloperActivityEvent): void {
  ensureDirExists(HYNA_DIR);
  let queue: DeveloperActivityEvent[] = [];
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      queue = JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8"));
    }
  } catch {
    queue = [];
  }
  queue.push(event);
  // Cap at 100 safe events
  if (queue.length > 100) {
    queue = queue.slice(queue.length - 100);
  }
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

export function getOfflineQueue(): DeveloperActivityEvent[] {
  try {
    if (!fs.existsSync(QUEUE_FILE)) return [];
    return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf-8")) as DeveloperActivityEvent[];
  } catch {
    return [];
  }
}

export function clearOfflineQueue(): void {
  try {
    if (fs.existsSync(QUEUE_FILE)) {
      fs.unlinkSync(QUEUE_FILE);
    }
  } catch {
    // Ignore error
  }
}

export function getLocalProjectTaskConfig(cwd: string = process.cwd()): ProjectTaskMapping | null {
  try {
    const configPath = path.join(cwd, LOCAL_CONFIG_FILE);
    if (!fs.existsSync(configPath)) return null;
    return JSON.parse(fs.readFileSync(configPath, "utf-8")) as ProjectTaskMapping;
  } catch {
    return null;
  }
}

export function saveLocalProjectTaskConfig(mapping: ProjectTaskMapping, cwd: string = process.cwd()): void {
  const configPath = path.join(cwd, LOCAL_CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(mapping, null, 2));
}
