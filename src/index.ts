import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig, oapUrl } from "./config.js";
import { fetchTrace, TraceNotFoundError, TraceFetchError, TraceResponseError } from "./client.js";
import { buildCallTree } from "./tree.js";
import { writeTraceCsv } from "./csv-writer.js";
import { locateAllSpans } from "./code-locator.js";
import { analyzeTrace, generateAnalysisReport, generateConversationSummary } from "./analyzer.js";
import type { TraceMeta } from "./types.js";

// --- CLI argument parsing ---

interface CliArgs {
  command: "fetch" | "config" | "help";
  traceIds: string[];
  name: string;
  configPath?: string;
  noAnalyze: boolean;
  noLocate: boolean;
  noCsv: boolean;
}

function parseArgs(rawArgs: string[]): CliArgs {
  const args = rawArgs.slice(2);
  if (args.length === 0 || args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    return { command: "help", traceIds: [], name: "", noAnalyze: false, noLocate: false, noCsv: false };
  }
  if (args[0] === "config") {
    return { command: "config", traceIds: [], name: "", noAnalyze: false, noLocate: false, noCsv: false };
  }

  const traceIds: string[] = [];
  let name = "";
  let noAnalyze = false;
  let noLocate = false;
  let noCsv = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" || args[i] === "-n") {
      name = args[++i] || "";
    } else if (args[i] === "--no-analyze") {
      noAnalyze = true;
    } else if (args[i] === "--no-locate") {
      noLocate = true;
    } else if (args[i] === "--no-csv") {
      noCsv = true;
    } else {
      // Split by comma or space — comma-separated trace IDs
      const parts = args[i].split(",");
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) traceIds.push(trimmed);
      }
    }
  }

  if (traceIds.length === 0) {
    return { command: "help", traceIds: [], name: "", noAnalyze: false, noLocate: false, noCsv: false };
  }

  if (!name) {
    name = `trace-${Date.now()}`;
  }

  return { command: "fetch", traceIds, name, noAnalyze, noLocate, noCsv };
}

// --- Config command ---

function printHelp(): string {
  return `
sw-trace — SkyWalking trace fetcher, code locator and analyzer

Usage:
  sw-trace <trace_ids> [--name <name>] [--no-analyze] [--no-locate] [--no-csv]
  sw-trace config
  sw-trace help

Arguments:
  trace_ids       One or more SkyWalking trace IDs (space or comma separated)

Options:
  --name, -n      Output folder name under .trace/ (default: trace-<timestamp>)
  --no-analyze    Skip automatic analysis
  --no-locate     Skip code location
  --no-csv        Skip CSV export

Examples:
  sw-trace abc123.1.123 --name login-bug
  sw-trace id1 id2 id3 --name order-flow
  sw-trace config
`.trim();
}

// --- Main fetch flow ---

async function runFetch(args: CliArgs): Promise<void> {
  const cwd = process.cwd();
  const config = await loadConfig(cwd);
  const url = oapUrl(config);

  // Create output directory
  const outputDir = join(cwd, config.output.directory, args.name);
  const rawDir = join(outputDir, "raw");
  mkdirSync(rawDir, { recursive: true });

  console.log(`OAP: ${url}`);
  console.log(`Fetching ${args.traceIds.length} trace(s)...`);

  // Fetch all traces
  const allSpans: Map<string, { spans: ReturnType<typeof buildCallTree>; raw: unknown }> = new Map();

  for (const traceId of args.traceIds) {
    try {
      console.log(`  Fetching ${traceId}...`);
      const spans = await fetchTrace(url, traceId, config.skywalking.timeout);
      const root = buildCallTree(spans);

      // Save raw JSON
      const rawPath = join(rawDir, `${traceId}.json`);
      writeFileSync(rawPath, JSON.stringify(spans, null, 2), "utf-8");

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
      console.log(`  CSV: ${csvPath}`);
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

    // Save analysis report
    const report = generateAnalysisReport(results);
    const reportPath = join(outputDir, "analysis.md");
    writeFileSync(reportPath, report, "utf-8");
    console.log(`  Report: ${reportPath}`);

    // Save locations
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
      console.log(`  Locations: ${locsPath}`);
    }

    // Print conversation summary
    console.log("\n" + generateConversationSummary(results));
  }

  // Save meta
  const meta: TraceMeta = {
    name: args.name,
    traceIds: [...allSpans.keys()],
    oapUrl: url,
    fetchedAt: new Date().toISOString(),
    codebases: config.codebases.map((cb) => cb.name),
  };
  const metaPath = join(outputDir, "meta.json");
  writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");

  console.log(`\nAll data saved to: ${outputDir}`);
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
      console.log("Config command should be run through Claude Code /sw-trace config");
      console.log("This CLI supports fetch operations. Use Claude Code for interactive config.");
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
