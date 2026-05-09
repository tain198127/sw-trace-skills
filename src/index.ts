import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadConfig, saveConfig, oapUrl, getCurrentRepo, listRepos,
  initRepo, setCurrentRepo, repoExists, resetAll,
} from "./config.js";
import { fetchTrace, TraceNotFoundError, TraceFetchError, TraceResponseError } from "./client.js";
import { buildCallTree } from "./tree.js";
import { writeTraceCsv } from "./csv-writer.js";
import { locateAllSpans } from "./code-locator.js";
import { analyzeTrace, generateAnalysisReport, generateConversationSummary } from "./analyzer.js";
import type { TraceMeta } from "./types.js";

// --- CLI argument parsing ---

interface CliArgs {
  command: "fetch" | "config" | "reset" | "repo" | "help";
  traceIds: string[];
  name: string;
  repo: string | null;
  cwd: string | null;
  noAnalyze: boolean;
  noLocate: boolean;
  noCsv: boolean;
  design: boolean;
}

function parseArgs(rawArgs: string[]): CliArgs {
  const args = rawArgs.slice(2);
  const defaults = { noAnalyze: false, noLocate: false, noCsv: false, design: false };

  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", traceIds: [], name: "", repo: null, cwd: null, ...defaults };
  }
  if (args[0] === "config") {
    const repo = extractOpt(args, "--repo") || extractOpt(args, "-r") || null;
    return { command: "config", traceIds: [], name: "", repo, cwd: null, ...defaults };
  }
  if (args[0] === "reset") {
    return { command: "reset", traceIds: [], name: "", repo: null, cwd: null, ...defaults };
  }
  if (args[0] === "repo") {
    const targetRepo = args[1] || null;
    return { command: "repo", traceIds: [], name: "", repo: targetRepo, cwd: null, ...defaults };
  }

  const traceIds: string[] = [];
  let name = "";
  const opts = { ...defaults };
  let repo: string | null = null;
  let cwd: string | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" || args[i] === "-n") {
      name = args[++i] || "";
    } else if (args[i] === "--repo" || args[i] === "-r") {
      repo = args[++i] || null;
    } else if (args[i] === "--cwd") {
      cwd = args[++i] || null;
    } else if (args[i] === "--no-analyze") {
      opts.noAnalyze = true;
    } else if (args[i] === "--no-locate") {
      opts.noLocate = true;
    } else if (args[i] === "--no-csv") {
      opts.noCsv = true;
    } else if (args[i] === "--design") {
      opts.design = true;
    } else {
      const parts = args[i].split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) traceIds.push(trimmed);
      }
    }
  }

  if (traceIds.length === 0) {
    return { command: "help", traceIds: [], name: "", repo, cwd, ...defaults };
  }

  if (!name) {
    name = `trace-${Date.now()}`;
  }

  return { command: "fetch", traceIds, name, repo, cwd, ...opts };
}

function extractOpt(args: string[], flag: string): string | null {
  for (let i = 0; i < args.length - 1; i++) {
    if (args[i] === flag) return args[i + 1];
  }
  return null;
}

// --- Help ---

function printHelp(): string {
  return `
sw-trace — SkyWalking trace fetcher, code locator and analyzer

Usage:
  sw-trace <trace_ids> [--name <name>] [--repo <repo>] [--cwd <dir>] [--no-analyze] [--no-locate] [--no-csv] [--design]
  sw-trace config [--repo <repo>]
  sw-trace reset
  sw-trace help

Arguments:
  trace_ids       One or more SkyWalking trace IDs (space or comma separated)

Options:
  --name, -n      Output folder name under .trace/ (default: trace-<timestamp>)
  --repo, -r      Repo name (default: last used repo)
  --cwd           Project working directory for output (default: current directory)
  --no-analyze    Skip automatic analysis
  --no-locate     Skip code location
  --no-csv        Skip CSV export
  --design        Generate detailed design document

Commands:
  repo            List repos (default), or switch to a repo: repo <name>
  config          Configure a repo (SkyWalking address, codebases, etc.)
  reset           Clear all repos and reconfigure from scratch
  help            Show this help

Examples:
  sw-trace abc123.1.123 --name login-bug
  sw-trace id1 id2 id3 --name order-flow --repo bjs_newb
  sw-trace id1 --name payment --design --cwd /path/to/project
  sw-trace config --repo my-project
  sw-trace repo
  sw-trace repo bjs_newb
  sw-trace reset
`.trim();
}

// --- Repo command ---

function runRepo(args: CliArgs): void {
  if (!args.repo) {
    // List all repos
    const repos = listRepos();
    const current = getCurrentRepo();
    console.log("Available repos:");
    if (repos.length === 0) {
      console.log("  (none)");
    } else {
      for (const name of repos) {
        const marker = name === current ? " * (current)" : "";
        console.log(`  ${name}${marker}`);
      }
    }
    return;
  }

  // Switch to specified repo
  const name = args.repo;
  if (!repoExists(name)) {
    console.error(`Repo '${name}' not found.`);
    console.error(`Available repos: ${listRepos().join(", ") || "(none)"}`);
    process.exit(1);
  }
  setCurrentRepo(name);
  console.log(`Switched to repo: ${name}`);
}

// --- Reset command ---

function runReset(): void {
  resetAll();
  console.log("All repos and configurations have been cleared.");
  console.log("Run '/sw-trace config' to set up a new repo.");
}

// --- Main fetch flow ---

async function runFetch(args: CliArgs): Promise<void> {
  // Determine repo
  let repoName = args.repo;
  if (!repoName) {
    repoName = getCurrentRepo();
  }
  if (!repoName) {
    console.error("No repo specified and no previous repo found.");
    console.error("Run '/sw-trace config' to create a repo first.");
    process.exit(1);
  }

  if (!repoExists(repoName)) {
    console.error(`Repo '${repoName}' not found.`);
    console.error(`Available repos: ${listRepos().join(", ") || "(none)"}`);
    process.exit(1);
  }

  console.log(`Repo: ${repoName}`);

  const config = loadConfig(repoName);
  const url = oapUrl(config);

  // Output directory: absolute path from config takes precedence
  const outputBase = config.output.directory;
  const isAbsolute = outputBase.startsWith("/") || outputBase.startsWith("~");
  const workDir = args.cwd || process.cwd();
  const outputDir = isAbsolute
    ? join(outputBase, args.name)
    : join(workDir, outputBase, args.name);
  const rawDir = join(outputDir, "raw");
  mkdirSync(rawDir, { recursive: true });

  const generatedFiles: string[] = [];

  console.log(`OAP: ${url}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Fetching ${args.traceIds.length} trace(s)...`);

  // Fetch all traces
  const allSpans = new Map<string, { spans: ReturnType<typeof buildCallTree>; raw: unknown }>();

  for (const traceId of args.traceIds) {
    try {
      console.log(`  Fetching ${traceId}...`);
      const spans = await fetchTrace(url, traceId, config.skywalking.timeout);
      const root = buildCallTree(spans);

      const rawPath = join(rawDir, `${traceId}.json`);
      writeFileSync(rawPath, JSON.stringify(spans, null, 2), "utf-8");
      generatedFiles.push(rawPath);

      allSpans.set(traceId, { spans: root, raw: spans });
      console.log(`  OK: ${traceId} (${spans.length} spans)`);
    } catch (err) {
      if (err instanceof TraceNotFoundError) {
        console.error(`  SKIP: ${traceId} — trace not found`);
      } else if (err instanceof TraceFetchError || err instanceof TraceResponseError) {
        console.error(`  FAIL: ${traceId} — ${err.message}`);
      } else {
        console.error(`  FAIL: ${traceId} — ${err}`);
      }
    }
  }

  if (allSpans.size === 0) {
    console.error("No traces fetched successfully.");
    return;
  }

  // Code location
  const allLocations = new Map<string, ReturnType<typeof locateAllSpans>>();
  if (!args.noLocate && config.codebases.length > 0) {
    console.log("Locating code...");
    for (const [traceId, { spans }] of allSpans) {
      const allNodes = flattenForLocation(spans);
      const locs = locateAllSpans(allNodes, config.codebases);
      allLocations.set(traceId, locs);
    }
  }

  // CSV export
  if (!args.noCsv) {
    console.log("Exporting CSV...");
    for (const [traceId, { spans }] of allSpans) {
      const csvPath = join(outputDir, `${traceId}.csv`);
      writeTraceCsv(spans, csvPath);
      generatedFiles.push(csvPath);
    }
  }

  // Analysis
  if (!args.noAnalyze) {
    console.log("Analyzing...");
    const results = [];
    for (const [traceId, { spans }] of allSpans) {
      const locations = allLocations.get(traceId) || new Map();
      const result = analyzeTrace(spans, traceId, locations);
      results.push(result);
    }

    const report = generateAnalysisReport(results);
    const reportPath = join(outputDir, "analysis.md");
    writeFileSync(reportPath, report, "utf-8");
    generatedFiles.push(reportPath);

    if (!args.noLocate) {
      const locsOutput: Record<string, Array<Record<string, unknown>>> = {};
      for (const [traceId, locs] of allLocations) {
        locsOutput[traceId] = [...locs.entries()].map(([key, locs]) => ({
          spanKey: key,
          locations: locs,
        }));
      }
      const locsPath = join(outputDir, "locations.json");
      writeFileSync(locsPath, JSON.stringify(locsOutput, null, 2), "utf-8");
      generatedFiles.push(locsPath);
    }

    console.log("\n" + generateConversationSummary(results));
  }

  // Save meta
  const meta: TraceMeta = {
    name: args.name,
    traceIds: [...allSpans.keys()],
    oapUrl: url,
    fetchedAt: new Date().toISOString(),
    codebases: config.codebases.map((cb) => cb.name),
    mode: args.design ? "design" : "analyze",
    repo: repoName,
  };
  const metaPath = join(outputDir, "meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
  generatedFiles.push(metaPath);

  // Print generated files
  console.log("\n--- Generated Files ---");
  for (const f of generatedFiles) {
    console.log(`  ${f}`);
  }
  console.log(`\nOutput directory: ${outputDir}`);
}

function flattenForLocation(node: ReturnType<typeof buildCallTree>): ReturnType<typeof buildCallTree>[] {
  const result: ReturnType<typeof buildCallTree>[] = [node];
  for (const child of node.children) {
    result.push(...flattenForLocation(child));
  }
  return result;
}

// --- Entry point ---

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  switch (args.command) {
    case "help":
      console.log(printHelp());
      break;
    case "config":
      console.log("Config should be run through Claude Code: /sw-trace config");
      console.log("This CLI supports: fetch, repo, reset, help.");
      break;
    case "reset":
      runReset();
      break;
    case "repo":
      runRepo(args);
      break;
    case "fetch":
      await runFetch(args);
      break;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
