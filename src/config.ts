import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { SwConfig } from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";

const CONFIG_FILENAME = "sw-trace.yaml";

function findProjectRoot(cwd: string): string {
  let dir = resolve(cwd);
  while (dir !== "/") {
    if (existsSync(join(dir, ".claude"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) break;
    dir = parent;
  }
  return cwd;
}

export function configPath(cwd: string): string {
  const root = findProjectRoot(cwd);
  return join(root, ".claude", CONFIG_FILENAME);
}

export async function loadConfig(cwd: string): Promise<SwConfig> {
  const path = configPath(cwd);
  if (!existsSync(path)) return { ...DEFAULT_CONFIG };

  const raw = await readFile(path, "utf-8");
  const parsed = parseYaml(raw) || {};
  return {
    skywalking: { ...DEFAULT_CONFIG.skywalking, ...parsed.skywalking },
    codebases: parsed.codebases || [],
    output: { ...DEFAULT_CONFIG.output, ...parsed.output },
    promptOverride: parsed.prompt_override,
  };
}

export async function saveConfig(cwd: string, config: SwConfig): Promise<string> {
  const path = configPath(cwd);
  const dir = join(path, "..");
  await mkdir(dir, { recursive: true });

  const serialized: Record<string, unknown> = {
    skywalking: config.skywalking,
    codebases: config.codebases,
    output: config.output,
  };
  if (config.promptOverride) {
    serialized.prompt_override = config.promptOverride;
  }

  await writeFile(path, stringifyYaml(serialized, { lineWidth: 0 }), "utf-8");
  return path;
}

export function oapUrl(config: SwConfig): string {
  const { host, port, protocol } = config.skywalking;
  return `${protocol}://${host}:${port}`;
}

export async function resolvePromptOverride(config: SwConfig): Promise<string | null> {
  if (!config.promptOverride) return null;
  if (!existsSync(config.promptOverride)) return null;
  return readFile(config.promptOverride, "utf-8");
}
