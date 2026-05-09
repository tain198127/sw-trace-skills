import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { SpanNode, CodebaseConfig, CodeLocation } from "./types.js";

function classNameToPath(className: string): string {
  return className.replace(/\./g, "/") + ".java";
}

function extractClassMethod(span: SpanNode): { className?: string; methodName?: string } {
  for (const tag of span.tags) {
    if (tag.key === "class.name") {
      const parts = tag.value.split(".");
      return {
        className: tag.value,
        methodName: parts.length > 0 ? parts[parts.length - 1] : undefined,
      };
    }
  }
  return {};
}

function findJavaFile(baseDir: string, className: string): string | null {
  const relativePath = classNameToPath(className);
  for (const root of listDirs(baseDir)) {
    const fullPath = join(baseDir, root, relativePath);
    if (existsSync(fullPath)) return fullPath;
  }
  const fullPath = join(baseDir, relativePath);
  if (existsSync(fullPath)) return fullPath;
  return null;
}

function listDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir).filter((name) => {
      return statSync(join(dir, name)).isDirectory();
    });
  } catch {
    return [];
  }
}

function findMethodLine(content: string, methodName: string): number {
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(new RegExp(`\\b${escapeRegex(methodName)}\\s*\\(`))) {
      return i + 1;
    }
  }
  return 0;
}

function findEndpointInFile(content: string, endpoint: string): number {
  const lines = content.split("\n");
  const patterns = [
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/,
    /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\s*\(\s*\)/,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match) {
        if (!match[2] || match[2] === endpoint || endpoint.endsWith(match[2])) {
          return i + 1;
        }
      }
    }
  }

  // JAX-RS annotations for EJB
  const jaxPatterns = [
    /@(GET|POST|PUT|DELETE|PATCH|Path)\s*(?:\(\s*(?:value\s*=\s*)?["']([^"']+)["']\))/,
    /@(GET|POST|PUT|DELETE|PATCH|Path)\s*\(/,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of jaxPatterns) {
      const match = lines[i].match(pattern);
      if (match) {
        if (!match[2] || match[2] === endpoint || endpoint.endsWith(match[2])) {
          return i + 1;
        }
      }
    }
  }

  return 0;
}

function grepSearch(baseDir: string, keyword: string, maxResults: number = 5): string[] {
  const results: string[] = [];
  if (!existsSync(baseDir)) return results;

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (results.length >= maxResults) return;
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "target") continue;
          walk(fullPath);
        } else if (entry.name.endsWith(".java")) {
          try {
            const content = readFileSync(fullPath, "utf-8");
            if (content.includes(keyword)) {
              results.push(fullPath);
            }
          } catch { /* skip unreadable */ }
        }
      }
    } catch { /* skip */ }
  }

  walk(baseDir);
  return results;
}

function getSnippet(content: string, line: number, contextLines: number = 3): string {
  const lines = content.split("\n");
  const start = Math.max(0, line - contextLines - 1);
  const end = Math.min(lines.length, line + contextLines);
  return lines
    .slice(start, end)
    .map((l, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === line ? " > " : "   ";
      return `${marker}${lineNum}: ${l}`;
    })
    .join("\n");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function locateCode(
  span: SpanNode,
  codebases: CodebaseConfig[]
): CodeLocation[] {
  const locations: CodeLocation[] = [];
  const { className, methodName } = extractClassMethod(span);
  const endpoint = span.endpointName;
  const serviceCode = span.serviceCode;

  for (const cb of codebases) {
    if (!existsSync(cb.path)) continue;

    // Strategy 1: class.name direct match
    if (className) {
      const javaFile = findJavaFile(cb.path, className);
      if (javaFile) {
        const content = readFileSync(javaFile, "utf-8");
        let line = 0;
        if (methodName) {
          line = findMethodLine(content, methodName);
        }
        if (line === 0 && endpoint) {
          line = findEndpointInFile(content, endpoint);
        }
        locations.push({
          codebase: cb.name,
          file: javaFile,
          line,
          method: methodName || className.split(".").pop() || "",
          snippet: line > 0 ? getSnippet(content, line) : undefined,
          confidence: line > 0 ? "high" : "medium",
        });
        continue;
      }
    }

    // Strategy 2: endpoint annotation search
    if (endpoint && endpoint.startsWith("/")) {
      const matches = grepSearch(cb.path, endpoint, 5);
      for (const match of matches) {
        const content = readFileSync(match, "utf-8");
        const line = findEndpointInFile(content, endpoint);
        locations.push({
          codebase: cb.name,
          file: match,
          line,
          method: "",
          snippet: line > 0 ? getSnippet(content, line) : undefined,
          confidence: line > 0 ? "medium" : "low",
        });
      }
      if (matches.length > 0) continue;
    }

    // Strategy 3: service_code grep
    if (serviceCode) {
      const matches = grepSearch(cb.path, serviceCode, 3);
      for (const match of matches) {
        locations.push({
          codebase: cb.name,
          file: match,
          line: 0,
          method: "",
          confidence: "low",
        });
      }
    }
  }

  return locations;
}

export function locateAllSpans(
  spans: SpanNode[],
  codebases: CodebaseConfig[]
): Map<string, CodeLocation[]> {
  const results = new Map<string, CodeLocation[]>();
  const key = (s: SpanNode) => `${s.segmentId}:${s.spanId}`;

  for (const span of spans) {
    if (span.component === "HttpClient" && !span.endpointName) continue;
    const locs = locateCode(span, codebases);
    if (locs.length > 0) {
      results.set(key(span), locs);
    }
  }
  return results;
}
