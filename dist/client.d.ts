import type { SpanNode, TraceSummary } from "./types.js";
export declare class TraceExporterError extends Error {
}
export declare class TraceFetchError extends TraceExporterError {
}
export declare class TraceNotFoundError extends TraceExporterError {
}
export declare class TraceResponseError extends TraceExporterError {
}
export declare function fetchTrace(oapUrl: string, traceId: string, timeout?: number): Promise<SpanNode[]>;
export declare class TraceListError extends TraceExporterError {
}
export declare function queryRecentTraces(oapUrl: string, limit?: number, minutesBack?: number, timeout?: number): Promise<TraceSummary[]>;
