import type { SpanNode, AnalysisResult, CodeLocation } from "./types.js";
export declare function analyzeTrace(root: SpanNode, traceId: string, locations: Map<string, CodeLocation[]>, slowThreshold?: number): AnalysisResult;
export declare function generateAnalysisReport(results: AnalysisResult[]): string;
export declare function generateConversationSummary(results: AnalysisResult[]): string;
