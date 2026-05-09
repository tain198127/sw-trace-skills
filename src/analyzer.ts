import type { SpanNode, AnalysisResult, ErrorSpan, SlowCall, ChainPath, DbCallInfo, CodeLocation } from "./types.js";
import { flattenTree } from "./tree.js";

const DEFAULT_SLOW_THRESHOLD = 1000;

function getTagValue(span: SpanNode, key: string): string {
  return span.tags.find((t) => t.key === key)?.value || "";
}

function traceErrorChain(span: SpanNode): SpanNode[] {
  const path: SpanNode[] = [];
  let current: SpanNode | undefined = span;
  while (current) {
    path.unshift(current);
    current = current.children.find((c) => c.isError);
  }
  if (path.length === 1) {
    // No error child — trace up through parent chain is not available in tree form
    // Just return the error span itself
    return [span];
  }
  return path;
}

function extractErrorMessage(span: SpanNode): string {
  if (span.logs.length > 0) {
    const errorLog = span.logs.find((l) =>
      l.data.some((d) => d.key === "error.kind" || d.key === "message")
    );
    if (errorLog) {
      return errorLog.data
        .map((d) => `${d.key}: ${d.value}`)
        .join("; ");
    }
  }
  const status = getTagValue(span, "status.code");
  if (status && Number(status) >= 400) {
    return `HTTP ${status}`;
  }
  return "Error span (no details)";
}

export function analyzeTrace(
  root: SpanNode,
  traceId: string,
  locations: Map<string, CodeLocation[]>,
  slowThreshold: number = DEFAULT_SLOW_THRESHOLD
): AnalysisResult {
  const flat = flattenTree(root);
  const allSpans = flat.map((f) => f.node);
  const spanKey = (s: SpanNode) => `${s.segmentId}:${s.spanId}`;

  // Error spans
  const errorSpans: ErrorSpan[] = allSpans
    .filter((s) => s.isError)
    .map((s) => ({
      span: s,
      errorMessage: extractErrorMessage(s),
      location: locations.get(spanKey(s))?.[0],
    }));

  // Slow calls
  const slowCalls: SlowCall[] = allSpans
    .map((s) => ({
      span: s,
      duration: s.endTime > s.startTime ? s.endTime - s.startTime : 0,
    }))
    .filter((item) => item.duration > slowThreshold)
    .sort((a, b) => b.duration - a.duration)
    .map((item) => ({
      ...item,
      location: locations.get(spanKey(item.span))?.[0],
    }));

  // Error chains
  const errorChains: ChainPath[] = errorSpans.map((err) => {
    const nodes = traceErrorChain(err.span);
    return {
      nodes,
      rootError: err,
      locations: nodes
        .map((n) => locations.get(spanKey(n)))
        .filter((l): l is CodeLocation[] => l !== undefined && l.length > 0)
        .flat(),
    };
  });

  // DB calls
  const dbCalls: DbCallInfo[] = allSpans
    .filter((s) => s.layer === "Database" || getTagValue(s, "db.type"))
    .map((s) => ({
      span: s,
      dbType: getTagValue(s, "db.type") || s.component,
      dbStatement: getTagValue(s, "db.statement"),
      dbInstance: getTagValue(s, "db.instance") || s.peer,
      duration: s.endTime > s.startTime ? s.endTime - s.startTime : 0,
      location: locations.get(spanKey(s))?.[0],
    }))
    .sort((a, b) => b.duration - a.duration);

  // Summary
  const totalDuration = root.endTime > root.startTime ? root.endTime - root.startTime : 0;
  const summaryParts: string[] = [];
  summaryParts.push(`Total spans: ${allSpans.length}, Duration: ${totalDuration}ms`);
  if (errorSpans.length > 0) {
    summaryParts.push(`Errors: ${errorSpans.length}`);
  }
  if (slowCalls.length > 0) {
    summaryParts.push(`Slow calls (>${slowThreshold}ms): ${slowCalls.length}`);
  }
  if (dbCalls.length > 0) {
    const slowDb = dbCalls.filter((d) => d.duration > slowThreshold);
    if (slowDb.length > 0) {
      summaryParts.push(`Slow DB calls: ${slowDb.length}`);
    }
  }

  return {
    traceId,
    totalSpans: allSpans.length,
    totalDuration,
    errorSpans,
    slowCalls,
    errorChains,
    dbCalls,
    summary: summaryParts.join("; "),
  };
}

export function generateAnalysisReport(results: AnalysisResult[]): string {
  const lines: string[] = [];

  lines.push("# SkyWalking Trace Analysis Report");
  lines.push("");
  lines.push(`Traces analyzed: ${results.length}`);
  lines.push("");

  // Per-trace analysis
  for (const result of results) {
    lines.push("---");
    lines.push("");
    lines.push(`## Trace: ${result.traceId}`);
    lines.push("");
    lines.push(`**Summary:** ${result.summary}`);
    lines.push("");

    if (result.errorSpans.length > 0) {
      lines.push("### Errors");
      lines.push("");
      for (const err of result.errorSpans) {
        lines.push(`- **${err.span.serviceCode}** | ${err.span.endpointName || err.span.component}`);
        lines.push(`  - Error: ${err.errorMessage}`);
        if (err.location) {
          lines.push(`  - Location: \`${err.location.file}:${err.location.line}\` (${err.location.codebase})`);
          if (err.location.snippet) {
            lines.push("  ```java");
            lines.push(err.location.snippet);
            lines.push("  ```");
          }
        }
        lines.push("");
      }
    }

    if (result.slowCalls.length > 0) {
      lines.push("### Slow Calls");
      lines.push("");
      lines.push("| Duration (ms) | Service | Endpoint | Component | Location |");
      lines.push("|---|---|---|---|---|");
      for (const sc of result.slowCalls) {
        const loc = sc.location
          ? `${sc.location.codebase}:${sc.location.file.split("/").pop()}:${sc.location.line}`
          : "-";
        lines.push(`| ${sc.duration} | ${sc.span.serviceCode} | ${sc.span.endpointName || "-"} | ${sc.span.component} | ${loc} |`);
      }
      lines.push("");
    }

    if (result.dbCalls.length > 0) {
      lines.push("### Database Calls");
      lines.push("");
      lines.push("| Duration (ms) | Type | Instance | Statement |");
      lines.push("|---|---|---|---|");
      for (const db of result.dbCalls.slice(0, 20)) {
        const stmt = db.dbStatement.length > 80 ? db.dbStatement.slice(0, 77) + "..." : db.dbStatement;
        lines.push(`| ${db.duration} | ${db.dbType} | ${db.dbInstance} | ${stmt} |`);
      }
      lines.push("");
    }
  }

  // Cross-trace comparison
  if (results.length > 1) {
    lines.push("---");
    lines.push("");
    lines.push("## Cross-Trace Comparison");
    lines.push("");

    // Find common slow code locations
    const locationCounts = new Map<string, { file: string; line: number; codebase: string; count: number }>();
    for (const result of results) {
      const seen = new Set<string>();
      for (const sc of result.slowCalls) {
        if (sc.location) {
          const key = `${sc.location.codebase}:${sc.location.file}:${sc.location.line}`;
          if (!seen.has(key)) {
            seen.add(key);
            const existing = locationCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              locationCounts.set(key, {
                file: sc.location.file,
                line: sc.location.line,
                codebase: sc.location.codebase,
                count: 1,
              });
            }
          }
        }
      }
    }

    const hotspots = [...locationCounts.entries()]
      .filter(([, v]) => v.count > 1)
      .sort((a, b) => b[1].count - a[1].count);

    if (hotspots.length > 0) {
      lines.push("### Shared Slow Code (appears in multiple traces)");
      lines.push("");
      lines.push("| Hit Count | Codebase | File:Line |");
      lines.push("|---|---|---|");
      for (const [, loc] of hotspots) {
        lines.push(`| ${loc.count} | ${loc.codebase} | ${loc.file.split("/").pop()}:${loc.line} |`);
      }
      lines.push("");
    } else {
      lines.push("No shared slow code locations found across traces.");
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function generateConversationSummary(results: AnalysisResult[]): string {
  const parts: string[] = ["## Trace Analysis Summary\n"];

  for (const result of results) {
    parts.push(`**${result.traceId}**: ${result.summary}`);

    if (result.errorSpans.length > 0) {
      parts.push(`  - ${result.errorSpans.length} error(s):`);
      for (const err of result.errorSpans.slice(0, 5)) {
        const loc = err.location ? ` @ ${err.location.file}:${err.location.line}` : "";
        parts.push(`    - ${err.span.serviceCode}: ${err.errorMessage}${loc}`);
      }
    }

    if (result.slowCalls.length > 0) {
      parts.push(`  - Top slow calls:`);
      for (const sc of result.slowCalls.slice(0, 3)) {
        const loc = sc.location ? ` @ ${sc.location.file}:${sc.location.line}` : "";
        parts.push(`    - ${sc.duration}ms: ${sc.span.serviceCode}${loc}`);
      }
    }
    parts.push("");
  }

  if (results.length > 1) {
    parts.push("Full report saved to `.trace/<name>/analysis.md`.");
  }

  return parts.join("\n");
}
