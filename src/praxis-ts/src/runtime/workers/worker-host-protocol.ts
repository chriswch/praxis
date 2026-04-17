import { readFile } from "node:fs/promises";

export type WorkerHostMode = "launch" | "resume";

export type WorkerHostHandshake =
  | {
      version: 1;
      status: "ready";
      dispatch_id: string;
      worker_id: string;
      session_id: string;
      started_at: string;
      locator: string;
      provider_details: {
        command: {
          binary: string;
          args: string[];
          cwd: string;
        };
        mode: WorkerHostMode;
      };
    }
  | {
      version: 1;
      status: "error";
      dispatch_id: string;
      worker_id: string;
      error: string;
      emitted_at: string;
    };

export function isWorkerHostHandshake(payload: unknown): payload is WorkerHostHandshake {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return false;
  }

  const record = payload as Record<string, unknown>;
  if (record.version !== 1 || typeof record.status !== "string") {
    return false;
  }

  if (record.status === "ready") {
    return (
      typeof record.dispatch_id === "string" &&
      typeof record.worker_id === "string" &&
      typeof record.session_id === "string" &&
      typeof record.started_at === "string" &&
      typeof record.locator === "string"
    );
  }

  if (record.status === "error") {
    return (
      typeof record.dispatch_id === "string" &&
      typeof record.worker_id === "string" &&
      typeof record.error === "string" &&
      typeof record.emitted_at === "string"
    );
  }

  return false;
}

export async function waitForHandshake(
  path: string,
  providerLabel: string,
): Promise<WorkerHostHandshake> {
  const startedAt = Date.now();
  const timeoutMs = parsePositiveInt(process.env.PRAXIS_WORKER_STARTUP_TIMEOUT_MS, 20000);

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (isWorkerHostHandshake(parsed)) {
        return parsed;
      }
      throw new Error(`Malformed worker-host handshake at ${path}.`);
    } catch (error) {
      if (isRetryableHandshakeReadError(error)) {
        await sleep(100);
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Timed out waiting for ${providerLabel} worker host startup handshake at ${path}.`,
  );
}

function isRetryableHandshakeReadError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseWorkerLocator(locator: string): number | null {
  const match = /^worker-host:\/\/pid\/(\d+)$/.exec(locator.trim());
  if (!match) {
    return null;
  }
  const pid = Number.parseInt(match[1], 10);
  return Number.isFinite(pid) && pid > 0 ? pid : null;
}

export function buildWorkerLocator(pid: number): string {
  return `worker-host://pid/${String(pid)}`;
}

export async function waitForWorkerExit(pid: number, timeoutMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (!isProcessAlive(pid)) {
      return true;
    }
    await sleep(50);
  }
  return !isProcessAlive(pid);
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
