import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, rmSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { DEFAULT_CONFIG } from "./types.js";
const BASE_DIR = join(process.env.HOME || "/root", ".claude", "sw-trace");
const REPOS_DIR = join(BASE_DIR, "repos");
const CURRENT_FILE = join(REPOS_DIR, ".current");
function ensureDirs() {
    if (!existsSync(REPOS_DIR)) {
        mkdirSync(REPOS_DIR, { recursive: true });
    }
}
// --- Repo management ---
export function listRepos() {
    ensureDirs();
    try {
        return readdirSync(REPOS_DIR)
            .filter((name) => {
            if (name === ".current")
                return false;
            return statSync(join(REPOS_DIR, name)).isDirectory();
        });
    }
    catch {
        return [];
    }
}
export function getCurrentRepo() {
    if (!existsSync(CURRENT_FILE))
        return null;
    try {
        const name = readFileSync(CURRENT_FILE, "utf-8").trim();
        if (!name)
            return null;
        if (existsSync(join(REPOS_DIR, name, "config.yaml")))
            return name;
        return null;
    }
    catch {
        return null;
    }
}
export function setCurrentRepo(name) {
    ensureDirs();
    writeFileSync(CURRENT_FILE, name, "utf-8");
}
export function repoConfigPath(repoName) {
    return join(REPOS_DIR, repoName, "config.yaml");
}
export function repoExists(repoName) {
    return existsSync(join(REPOS_DIR, repoName, "config.yaml"));
}
export function initRepo(repoName, config) {
    ensureDirs();
    const repoDir = join(REPOS_DIR, repoName);
    mkdirSync(repoDir, { recursive: true });
    const fullConfig = {
        skywalking: { ...DEFAULT_CONFIG.skywalking, ...config?.skywalking },
        codebases: config?.codebases || [],
        output: { ...DEFAULT_CONFIG.output, ...config?.output },
        promptOverride: config?.promptOverride,
    };
    const path = join(repoDir, "config.yaml");
    writeFileSync(path, stringifyYaml(fullConfig, { lineWidth: 0 }), "utf-8");
    setCurrentRepo(repoName);
    return path;
}
export function deleteRepo(repoName) {
    const repoDir = join(REPOS_DIR, repoName);
    if (existsSync(repoDir)) {
        rmSync(repoDir, { recursive: true, force: true });
    }
    const current = getCurrentRepo();
    if (current === repoName) {
        writeFileSync(CURRENT_FILE, "", "utf-8");
    }
}
export function resetAll() {
    if (existsSync(REPOS_DIR)) {
        rmSync(REPOS_DIR, { recursive: true, force: true });
    }
}
// --- Config read/write per repo ---
export function loadConfig(repoName) {
    const path = repoConfigPath(repoName);
    if (!existsSync(path)) {
        return { ...DEFAULT_CONFIG, repo: repoName };
    }
    const raw = readFileSync(path, "utf-8");
    const parsed = parseYaml(raw) || {};
    return {
        skywalking: { ...DEFAULT_CONFIG.skywalking, ...parsed.skywalking },
        codebases: parsed.codebases || [],
        output: { ...DEFAULT_CONFIG.output, ...parsed.output },
        promptOverride: parsed.prompt_override,
        repo: repoName,
    };
}
export function saveConfig(repoName, config) {
    ensureDirs();
    const repoDir = join(REPOS_DIR, repoName);
    mkdirSync(repoDir, { recursive: true });
    const serialized = {
        skywalking: config.skywalking,
        codebases: config.codebases,
        output: config.output,
    };
    if (config.promptOverride) {
        serialized.prompt_override = config.promptOverride;
    }
    const path = join(repoDir, "config.yaml");
    writeFileSync(path, stringifyYaml(serialized, { lineWidth: 0 }), "utf-8");
    setCurrentRepo(repoName);
    return path;
}
export function oapUrl(config) {
    const { host, port, protocol } = config.skywalking;
    return `${protocol}://${host}:${port}`;
}
export function resolvePromptOverride(config) {
    if (!config.promptOverride)
        return null;
    if (!existsSync(config.promptOverride))
        return null;
    return readFileSync(config.promptOverride, "utf-8");
}
