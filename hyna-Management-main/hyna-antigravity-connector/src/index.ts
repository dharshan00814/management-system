#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import * as readline from "readline";
import * as os from "os";
import * as path from "path";
import { AntigravityActivityAgent } from "./agent";
import { saveCredentials, getCredentials, clearCredentials, saveLocalProjectTaskConfig, getLocalProjectTaskConfig } from "./storage";
import { StoredCredentials } from "./types";

const VERSION = "1.0.0";

function printBanner(): void {
  console.log(`
\x1b[36m  _   _                    \x1b[0m
\x1b[36m | | | |_   _ _ __   __ _  \x1b[0m  \x1b[1mHyna Studio Developer Tracker\x1b[0m
\x1b[36m | |_| | | | | '_ \\ / _\` | \x1b[0m  \x1b[35mGoogle Antigravity Connector v${VERSION}\x1b[0m
\x1b[36m |  _  | |_| | | | | (_| | \x1b[0m  \x1b[90mPrivacy-Preserving Work Activity\x1b[0m
\x1b[36m |_| |_|\\__, |_| |_|\\__,_| \x1b[0m
\x1b[36m         |___/             \x1b[0m
`);
}

function prompt(questionText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(questionText, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

async function handleConnect(args: string[]): Promise<void> {
  printBanner();

  const stored = getCredentials();
  let code = "";
  let url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || stored?.supabaseUrl || "";
  let anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || stored?.supabaseAnonKey || "";
  let autoStart = true;

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if ((arg === "--code" || arg === "-c") && args[i + 1]) {
      code = args[++i];
    } else if (arg.startsWith("--code=")) {
      code = arg.substring(7).trim();
    } else if (arg.startsWith("--code:")) {
      const rest = arg.substring(7).trim();
      code = rest || (args[++i] || "").trim();
    } else if ((arg === "--url" || arg === "-u") && args[i + 1]) {
      url = args[++i];
    } else if ((arg === "--key" || arg === "-k") && args[i + 1]) {
      anonKey = args[++i];
    } else if (arg === "--no-start") {
      // autoStart = false; // Add this variable if needed later
    }
  }

  if (!url) {
    url = await prompt("Enter Hyna Supabase URL (e.g. https://your-project.supabase.co): ");
  }

  if (!url) {
    console.error("\x1b[31mError: Supabase URL is required.\x1b[0m");
    process.exit(1);
  }

  if (!anonKey) {
    anonKey = await prompt("Enter Hyna Supabase Anon Key: ");
  }

  if (!anonKey) {
    console.error("\x1b[31mError: Supabase Anon Key is required to connect.\x1b[0m");
    process.exit(1);
  }

  if (!code) {
    console.log("To connect Antigravity:");
    console.log("1. Open Hyna Studio -> Settings -> IDE Integrations (/settings/integrations)");
    console.log("2. Click 'Connect Antigravity' and copy your pairing code (HYNA-AGY-XXXX)\n");
    code = await prompt("Enter Pairing Code: ");
  }

  if (!code) {
    console.error("\x1b[31mError: Pairing code is required.\x1b[0m");
    process.exit(1);
  }

  const cleanCode = code.trim().toUpperCase();
  console.log(`\nValidating code [${cleanCode}] with Hyna Studio...`);
  const client = createClient(url, anonKey);
  const deviceName = os.hostname();

  // 1. Try secure RPC function first
  try {
    let { data: rpcData, error: rpcErr } = await client.rpc("verify_developer_connection_code", {
      p_code: cleanCode,
      p_tool: "antigravity",
      p_device_name: deviceName,
    });

    // If duplicate device conflict on an older record for this machine, retry preserving existing device name
    if (rpcErr && (rpcErr.code === "23505" || rpcErr.message?.includes("uq_developer_integration"))) {
      const retry = await client.rpc("verify_developer_connection_code", {
        p_code: cleanCode,
        p_tool: "antigravity",
        p_device_name: null,
      });
      if (!retry.error && retry.data?.success) {
        rpcData = retry.data;
        rpcErr = null;
      }
    }

    if (!rpcErr && rpcData && rpcData.success) {
      const creds: StoredCredentials = {
        supabaseUrl: url,
        supabaseAnonKey: anonKey,
        userId: rpcData.user_id,
        apiKey: rpcData.api_key,
        tool: "antigravity",
        deviceName,
        lastConnectedAt: new Date().toISOString(),
      };
      saveCredentials(creds);
      console.log("\x1b[32mSuccessfully connected Antigravity to Hyna Studio!\x1b[0m");
      console.log(`User ID: ${rpcData.user_id}`);
      console.log(`Device:  ${deviceName}`);

      if (autoStart) {
        console.log("\n\x1b[36m⚡ Automatically starting live activity tracking in terminal...\x1b[0m");
        console.log("\x1b[90m(When you exit this terminal or press Ctrl+C, tracking automatically stops & disconnects)\x1b[0m\n");
        const agent = new AntigravityActivityAgent(process.cwd());
        await agent.start();
      } else {
        console.log("\nYou can start live tracking anytime by running: \x1b[36mnode dist/index.js start\x1b[0m\n");
      }
      return;
    }

    if (rpcData && !rpcData.success) {
      console.error(`\x1b[31mConnection failed: ${rpcData.error || "Invalid or expired pairing code."}\x1b[0m`);
      process.exit(1);
    }
  } catch (err: any) {
    // Non-fatal, try fallback
  }

  // 2. Direct table query fallback
  const { data: integration, error } = await client
    .from("developer_integrations")
    .select("*")
    .eq("connection_code", cleanCode)
    .eq("tool", "antigravity")
    .maybeSingle();

  if (error || !integration) {
    console.error("\x1b[31mConnection failed: Invalid or expired pairing code.\x1b[0m");
    console.error("Please generate a fresh code in Hyna Studio Settings > IDE Integrations.");
    process.exit(1);
  }

  const apiKey = `hyna_agt_${Math.random().toString(36).substring(2, 15)}_${Date.now()}`;

  // Update integration row as connected (keep original device name if conflict)
  const targetDevice = integration.device_name || deviceName;
  const { error: updateErr } = await client
    .from("developer_integrations")
    .update({
      status: "connected",
      device_name: targetDevice,
      api_key: apiKey,
      connection_code: null, // Clear one-time code
      last_connected_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  if (updateErr) {
    console.error("\x1b[31mFailed to update integration state:\x1b[0m", updateErr.message);
    process.exit(1);
  }

  const creds: StoredCredentials = {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    userId: integration.user_id,
    apiKey,
    tool: "antigravity",
    deviceName,
    lastConnectedAt: new Date().toISOString(),
  };

  saveCredentials(creds);

  console.log("\x1b[32mSuccessfully connected Antigravity to Hyna Studio!\x1b[0m");
  console.log(`User ID: ${integration.user_id}`);
  console.log(`Device:  ${deviceName}`);

  if (autoStart) {
    console.log("\n\x1b[36m⚡ Automatically starting live activity tracking in terminal...\x1b[0m");
    console.log("\x1b[90m(When you exit this terminal or press Ctrl+C, tracking automatically stops & disconnects)\x1b[0m\n");
    const agent = new AntigravityActivityAgent(process.cwd());
    await agent.start();
  } else {
    console.log("\nYou can start live tracking anytime by running: \x1b[36mnode dist/index.js start\x1b[0m\n");
  }
}

async function handleStart(): Promise<void> {
  printBanner();
  const creds = getCredentials();
  if (!creds) {
    console.error("\x1b[33mNo connection found. Please run 'hyna-antigravity connect' first.\x1b[0m");
    process.exit(1);
  }

  const agent = new AntigravityActivityAgent(process.cwd());
  await agent.start();
}

async function handleStatus(): Promise<void> {
  printBanner();
  const creds = getCredentials();
  if (!creds) {
    console.log("Status: \x1b[31mDisconnected\x1b[0m");
    console.log("Run 'hyna-antigravity connect' to pair with Hyna Studio.\n");
    return;
  }

  console.log("Status:         \x1b[32mConnected\x1b[0m");
  console.log(`Tool:           \x1b[35mAntigravity\x1b[0m`);
  console.log(`User ID:        ${creds.userId}`);
  console.log(`Device:         ${creds.deviceName}`);
  console.log(`Connected At:   ${new Date(creds.lastConnectedAt).toLocaleString()}`);
  console.log(`Active CWD:     ${process.cwd()}`);

  const localConfig = getLocalProjectTaskConfig();
  if (localConfig?.projectName) {
    console.log(`Mapped Project: ${localConfig.projectName} (${localConfig.projectId || "none"})`);
  }
  if (localConfig?.taskTitle) {
    console.log(`Mapped Task:    ${localConfig.taskTitle} (${localConfig.taskId || "none"})`);
  }
  console.log();
}

async function handleDisconnect(): Promise<void> {
  const creds = getCredentials();
  if (!creds) {
    console.log("No active connection to disconnect.");
    return;
  }

  try {
    const client = createClient(creds.supabaseUrl, creds.supabaseAnonKey);
    const nowIso = new Date().toISOString();
    await client
      .from("developer_integrations")
      .update({
        status: "disconnected",
        updated_at: nowIso,
      })
      .eq("user_id", creds.userId)
      .eq("tool", "antigravity");

    await client
      .from("developer_sessions")
      .update({
        status: "ended",
        ended_at: nowIso,
        last_activity_at: nowIso,
      })
      .eq("user_id", creds.userId)
      .eq("tool", "antigravity")
      .in("status", ["active", "idle"]);
  } catch {
    // Ignore network error during disconnect
  }

  clearCredentials();
  console.log("\x1b[32mDisconnected from Hyna Studio. Antigravity credentials removed.\x1b[0m");
}

async function handleTaskMapping(args: string[]): Promise<void> {
  let projectId: string | undefined;
  let projectName: string | undefined;
  let taskId: string | undefined;
  let taskTitle: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--project" && args[i + 1]) projectId = args[++i];
    if (args[i] === "--project-name" && args[i + 1]) projectName = args[++i];
    if (args[i] === "--task" && args[i + 1]) taskId = args[++i];
    if (args[i] === "--task-title" && args[i + 1]) taskTitle = args[++i];
  }

  if (!projectId && !taskId) {
    const curr = getLocalProjectTaskConfig();
    console.log("\nCurrent Local Task Association (.hyna.json):");
    console.log(`Project: ${curr?.projectName || curr?.projectId || "(none)"}`);
    console.log(`Task:    ${curr?.taskTitle || curr?.taskId || "(none)"}`);
    console.log("\nTo associate this folder with a task:");
    console.log('hyna-antigravity task --project <UUID> --project-name "My Project" --task <UUID> --task-title "My Task"');
    return;
  }

  saveLocalProjectTaskConfig({
    projectId,
    projectName: projectName || projectId,
    taskId,
    taskTitle: taskTitle || taskId,
  });

  console.log("\x1b[32mSaved task association to .hyna.json in current directory.\x1b[0m");
}

function printHelp(): void {
  printBanner();
  console.log(`Usage: hyna-antigravity <command> [options]

Commands:
  connect                  Pair Antigravity with your Hyna account using pairing code
                           Options: --code <CODE> --url <SUPABASE_URL> --key <ANON_KEY>

  start                    Start the live activity tracking agent in current directory
                           Tracks safe metadata (workspace name, git branch, active/idle)

  status                   View connection status, active device, and mapped project

  task                     View or configure project/task association (.hyna.json)
                           Options: --project <ID> --project-name <NAME> --task <ID> --task-title <TITLE>

  disconnect               Disconnect and remove local credentials safely

  help                     Display this help message

Privacy Assurance:
  The Antigravity connector strictly transmits metadata only:
  - Workspace name
  - Relative file path of active work
  - Safe Git branch name
  - Active / Idle status & heartbeat
  * NO file contents, NO keystrokes, NO terminal logs, NO AI chats are ever collected.
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || "start";

  switch (command) {
    case "connect":
      await handleConnect(args.slice(1));
      break;
    case "start":
      await handleStart();
      break;
    case "status":
      await handleStatus();
      break;
    case "task":
      await handleTaskMapping(args.slice(1));
      break;
    case "disconnect":
      await handleDisconnect();
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
