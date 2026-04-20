import { mkdir, readFile, writeFile, appendFile, access } from "node:fs/promises";

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readJsonFile<T>(path: string): Promise<T> {
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as T;
}

export async function readJsonFileIfExists<T>(path: string): Promise<T | null> {
  if (!(await exists(path))) {
    return null;
  }
  return readJsonFile<T>(path);
}

export async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  const encoded = `${JSON.stringify(payload, null, 2)}\n`;
  await writeFile(path, encoded, "utf8");
}

export async function appendJsonLine(path: string, payload: unknown): Promise<void> {
  const encoded = `${JSON.stringify(payload)}\n`;
  await appendFile(path, encoded, "utf8");
}

export async function readJsonLines<T>(path: string): Promise<T[]> {
  if (!(await exists(path))) {
    return [];
  }

  const raw = await readFile(path, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
