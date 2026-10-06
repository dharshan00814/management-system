import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import { DeveloperActivityEvent, DeveloperTool, DeveloperEventType } from "../types/developerActivity";

// 1. Zod schema for Event Validation & Privacy Invariant
const DeveloperActivityEventSchema = z.object({
  userId: z.string().uuid("userId must be a valid UUID"),
  tool: z.enum(["vscode", "cursor", "antigravity"] as const),
  eventType: z.enum([
    "session_started",
    "session_heartbeat",
    "file_activity",
    "workspace_changed",
    "task_started",
    "task_changed",
    "idle",
    "active",
    "session_ended",
  ] as const),
  projectId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  workspaceName: z.string().max(255).optional(),
  fileName: z.string().max(255).optional(),
  filePath: z.string().max(1000).optional(),
  gitBranch: z.string().max(255).optional(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict(); // Enforce strict mode to forbid unauthorized / surveillance fields!

// Tool detection logic
function detectTool(appName: string, env: Record<string, string | undefined>): DeveloperTool {
  if (
    appName.toLowerCase().includes("cursor") ||
    env.CURSOR_VERSION ||
    env.CURSOR_AGENT
  ) {
    return "cursor";
  }
  if (appName.toLowerCase().includes("antigravity")) {
    return "antigravity";
  }
  return "vscode";
}

// Active / Idle state tracker logic
class ActivityStateTracker {
  private lastActivity: number;
  private idleTimeoutMs: number;
  public status: "active" | "idle" | "ended";

  constructor(idleTimeoutMs = 5 * 60 * 1000) {
    this.idleTimeoutMs = idleTimeoutMs;
    this.lastActivity = Date.now();
    this.status = "active";
  }

  public recordActivity(timestamp = Date.now()): "active" | "resumed" {
    const wasIdle = this.status === "idle";
    this.lastActivity = timestamp;
    this.status = "active";
    return wasIdle ? "resumed" : "active";
  }

  public checkIdle(currentTime = Date.now()): boolean {
    if (this.status === "ended") return false;
    if (currentTime - this.lastActivity >= this.idleTimeoutMs) {
      this.status = "idle";
      return true;
    }
    return false;
  }

  public end(): void {
    this.status = "ended";
  }
}

// Offline queue manager
class OfflineQueueManager {
  private queue: DeveloperActivityEvent[] = [];
  private readonly maxLimit = 100;

  public enqueue(event: DeveloperActivityEvent): void {
    this.queue.push(event);
    if (this.queue.length > this.maxLimit) {
      this.queue = this.queue.slice(this.queue.length - this.maxLimit);
    }
  }

  public getQueue(): DeveloperActivityEvent[] {
    return [...this.queue];
  }

  public flush(): DeveloperActivityEvent[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }
}

describe("Developer Activity Tracking Test Suite", () => {
  describe("1. Common Event Schema & Privacy Guarantees", () => {
    it("should accept valid DeveloperActivityEvent conforming to protocol", () => {
      const validEvent: DeveloperActivityEvent = {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        tool: "cursor",
        eventType: "session_heartbeat",
        projectId: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
        taskId: "6ba7b811-9dad-11d1-80b4-00c04fd430c8",
        workspaceName: "hyna-Management",
        fileName: "admin.tsx",
        filePath: "src/routes/admin.tsx",
        gitBranch: "feature/rbac",
        timestamp: new Date().toISOString(),
        metadata: { commitsToday: 3 },
      };

      const result = DeveloperActivityEventSchema.safeParse(validEvent);
      expect(result.success).toBe(true);
    });

    it("should strictly REJECT surveillance fields (no keystrokes, screenshots, or private content)", () => {
      const maliciousPayload = {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        tool: "cursor",
        eventType: "file_activity",
        timestamp: new Date().toISOString(),
        // Forbidden surveillance fields
        keystrokes: "my-password-123",
        screenshot: "base64_encoded_screen",
        fileContent: "export const SECRET_KEY = 'topsecret';",
        terminalBuffer: "cat .env",
      };

      const result = DeveloperActivityEventSchema.safeParse(maliciousPayload);
      expect(result.success).toBe(false);
      if (!result.success) {
        const unrecognizedKeys = result.error.issues.map((i) => (i as any).keys || i.path);
        expect(unrecognizedKeys.length).toBeGreaterThan(0);
      }
    });

    it("should enforce valid tools: vscode, cursor, antigravity", () => {
      const eventWithInvalidTool = {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        tool: "unsupported-ide",
        eventType: "session_started",
        timestamp: new Date().toISOString(),
      };

      const result = DeveloperActivityEventSchema.safeParse(eventWithInvalidTool);
      expect(result.success).toBe(false);
    });
  });

  describe("2. Tool Detection (Cursor vs VS Code vs Antigravity)", () => {
    it("should detect Cursor explicitly when appName or env variables indicate Cursor", () => {
      expect(detectTool("Cursor", {})).toBe("cursor");
      expect(detectTool("Visual Studio Code", { CURSOR_VERSION: "0.45.0" })).toBe("cursor");
      expect(detectTool("Code", { CURSOR_AGENT: "true" })).toBe("cursor");
    });

    it("should detect VS Code when running standard VS Code", () => {
      expect(detectTool("Visual Studio Code", {})).toBe("vscode");
      expect(detectTool("Code - OSS", {})).toBe("vscode");
    });

    it("should detect Antigravity when running under Antigravity", () => {
      expect(detectTool("Google Antigravity", {})).toBe("antigravity");
      expect(detectTool("Antigravity Editor", {})).toBe("antigravity");
    });
  });

  describe("3. Active vs Idle State Transitions", () => {
    let tracker: ActivityStateTracker;

    beforeEach(() => {
      tracker = new ActivityStateTracker(5 * 60 * 1000); // 5 min
    });

    it("starts in ACTIVE state", () => {
      expect(tracker.status).toBe("active");
    });

    it("remains ACTIVE when activity occurs within the 5-minute window", () => {
      const now = Date.now();
      tracker.recordActivity(now + 2 * 60 * 1000); // 2 mins later
      const isIdle = tracker.checkIdle(now + 4 * 60 * 1000); // 4 mins total, 2 mins after last activity
      expect(isIdle).toBe(false);
      expect(tracker.status).toBe("active");
    });

    it("transitions to IDLE when inactive for 5 minutes or more", () => {
      const now = Date.now();
      const isIdle = tracker.checkIdle(now + 5 * 60 * 1000 + 1); // 5m 1ms later
      expect(isIdle).toBe(true);
      expect(tracker.status).toBe("idle");
    });

    it("resumes ACTIVE when activity occurs after being idle", () => {
      const now = Date.now();
      tracker.checkIdle(now + 6 * 60 * 1000); // Trigger idle
      expect(tracker.status).toBe("idle");

      const transition = tracker.recordActivity(now + 6 * 60 * 1000 + 500);
      expect(transition).toBe("resumed");
      expect(tracker.status).toBe("active");
    });
  });

  describe("4. Pairing Code & Authentication Flow", () => {
    it("generates correct pairing code format: HYNA-{TOOL}-{RANDOM}", () => {
      const generateCode = (tool: DeveloperTool) => {
        const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `HYNA-${tool.toUpperCase()}-${rand}`;
      };

      const vsCodeCode = generateCode("vscode");
      const cursorCode = generateCode("cursor");
      const agtCode = generateCode("antigravity");

      expect(vsCodeCode).toMatch(/^HYNA-VSCODE-[A-Z0-9]{6}$/);
      expect(cursorCode).toMatch(/^HYNA-CURSOR-[A-Z0-9]{6}$/);
      expect(agtCode).toMatch(/^HYNA-ANTIGRAVITY-[A-Z0-9]{6}$/);
    });

    it("rejects connection when pairing code is expired or invalid", () => {
      const mockDatabase = [
        { id: "1", code: "HYNA-VSCODE-ABC123", expires_at: Date.now() - 10000 }, // Expired
        { id: "2", code: "HYNA-CURSOR-XYZ789", expires_at: Date.now() + 600000 }, // Valid
      ];

      const validateCode = (inputCode: string) => {
        const found = mockDatabase.find((item) => item.code === inputCode);
        if (!found) return { success: false, reason: "invalid_code" };
        if (found.expires_at < Date.now()) return { success: false, reason: "expired_code" };
        return { success: true, record: found };
      };

      expect(validateCode("HYNA-NONEXISTENT").success).toBe(false);
      expect(validateCode("HYNA-VSCODE-ABC123").reason).toBe("expired_code");
      expect(validateCode("HYNA-CURSOR-XYZ789").success).toBe(true);
    });
  });

  describe("5. Offline Queue Handling", () => {
    it("enqueues events during offline network conditions and flushes them", () => {
      const queue = new OfflineQueueManager();
      const mockEvent: DeveloperActivityEvent = {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        tool: "vscode",
        eventType: "session_heartbeat",
        timestamp: new Date().toISOString(),
      };

      queue.enqueue(mockEvent);
      queue.enqueue({ ...mockEvent, eventType: "file_activity", fileName: "App.tsx" });

      expect(queue.getQueue().length).toBe(2);

      const flushed = queue.flush();
      expect(flushed.length).toBe(2);
      expect(queue.getQueue().length).toBe(0);
    });

    it("enforces safe upper bound (100) to prevent unbounded memory growth", () => {
      const queue = new OfflineQueueManager();
      for (let i = 0; i < 120; i++) {
        queue.enqueue({
          userId: "550e8400-e29b-41d4-a716-446655440000",
          tool: "antigravity",
          eventType: "session_heartbeat",
          timestamp: new Date().toISOString(),
          metadata: { seq: i },
        });
      }

      expect(queue.getQueue().length).toBe(100);
      expect(queue.getQueue()[0].metadata?.seq).toBe(20); // First 20 dropped
    });
  });

  describe("6. Role-Based Access Control (RBAC) Logic", () => {
    interface MockUser {
      id: string;
      role: "ceo" | "cto" | "cpo" | "coo" | "manager" | "member";
    }

    interface MockProject {
      id: string;
      manager_id: string;
      member_ids: string[];
    }

    const executives: MockUser[] = [
      { id: "exec-1", role: "ceo" },
      { id: "exec-2", role: "cto" },
      { id: "exec-3", role: "cpo" },
      { id: "exec-4", role: "coo" },
    ];

    const managerA: MockUser = { id: "mgr-a", role: "manager" };
    const memberA: MockUser = { id: "mem-a", role: "member" };
    const memberB: MockUser = { id: "mem-b", role: "member" };

    const projectAlpha: MockProject = {
      id: "proj-alpha",
      manager_id: "mgr-a",
      member_ids: ["mgr-a", "mem-a"],
    };

    function canViewMemberActivity(
      viewer: MockUser,
      targetMemberId: string,
      projects: MockProject[]
    ): boolean {
      // 1. A member can always view their own activity
      if (viewer.id === targetMemberId) return true;

      // 2. Organization Executives (CEO, CTO, CPO, COO) can view org-wide
      if (["ceo", "cto", "cpo", "coo"].includes(viewer.role)) return true;

      // 3. Managers can ONLY view members assigned to their managed projects
      if (viewer.role === "manager") {
        return projects.some(
          (p) => p.manager_id === viewer.id && p.member_ids.includes(targetMemberId)
        );
      }

      // 4. Regular members cannot view other members' activity
      return false;
    }

    it("allows members to view only their own activity", () => {
      expect(canViewMemberActivity(memberA, memberA.id, [projectAlpha])).toBe(true);
      expect(canViewMemberActivity(memberA, memberB.id, [projectAlpha])).toBe(false);
    });

    it("allows managers to view activity only for members in their assigned projects", () => {
      expect(canViewMemberActivity(managerA, memberA.id, [projectAlpha])).toBe(true);
      expect(canViewMemberActivity(managerA, memberB.id, [projectAlpha])).toBe(false); // memberB not in Alpha
    });

    it("allows CEO, CTO, CPO, COO org-wide visibility", () => {
      for (const exec of executives) {
        expect(canViewMemberActivity(exec, memberA.id, [projectAlpha])).toBe(true);
        expect(canViewMemberActivity(exec, memberB.id, [projectAlpha])).toBe(true);
      }
    });
  });
});
