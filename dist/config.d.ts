import type { SwConfig } from "./types.js";
export declare function configPath(cwd: string): string;
export declare function loadConfig(cwd: string): Promise<SwConfig>;
export declare function saveConfig(cwd: string, config: SwConfig): Promise<string>;
export declare function oapUrl(config: SwConfig): string;
export declare function resolvePromptOverride(config: SwConfig): Promise<string | null>;
