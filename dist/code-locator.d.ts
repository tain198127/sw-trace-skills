import type { SpanNode, CodebaseConfig, CodeLocation } from "./types.js";
export declare function locateCode(span: SpanNode, codebases: CodebaseConfig[]): CodeLocation[];
export declare function locateAllSpans(spans: SpanNode[], codebases: CodebaseConfig[]): Map<string, CodeLocation[]>;
