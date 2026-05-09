export interface SpanRef {
    traceId: string;
    parentSegmentId: string;
    parentSpanId: number;
    type: string;
}
export interface SpanTag {
    key: string;
    value: string;
}
export interface SpanLog {
    time: string;
    data: Array<{
        key: string;
        value: string;
    }>;
}
export interface SpanNode {
    spanId: number;
    segmentId: string;
    parentSpanId: number;
    refs: SpanRef[];
    serviceCode: string;
    serviceInstanceName: string;
    startTime: number;
    endTime: number;
    endpointName: string;
    spanType: string;
    peer: string;
    component: string;
    isError: boolean;
    layer: string;
    tags: SpanTag[];
    logs: SpanLog[];
    children: SpanNode[];
}
export interface CodebaseConfig {
    name: string;
    path: string;
    type: "springboot" | "ejb" | "generic";
    sourceRoots: string[];
}
export interface SwConfig {
    skywalking: {
        host: string;
        port: number;
        protocol: string;
        timeout: number;
    };
    codebases: CodebaseConfig[];
    output: {
        directory: string;
    };
    promptOverride?: string;
}
export interface CodeLocation {
    codebase: string;
    file: string;
    line: number;
    method: string;
    snippet?: string;
    confidence: "high" | "medium" | "low";
}
export interface ErrorSpan {
    span: SpanNode;
    errorMessage: string;
    location?: CodeLocation;
}
export interface SlowCall {
    span: SpanNode;
    duration: number;
    location?: CodeLocation;
}
export interface ChainPath {
    nodes: SpanNode[];
    rootError: ErrorSpan;
    locations: CodeLocation[];
}
export interface AnalysisResult {
    traceId: string;
    totalSpans: number;
    totalDuration: number;
    errorSpans: ErrorSpan[];
    slowCalls: SlowCall[];
    errorChains: ChainPath[];
    dbCalls: DbCallInfo[];
    summary: string;
}
export interface DbCallInfo {
    span: SpanNode;
    dbType: string;
    dbStatement: string;
    dbInstance: string;
    duration: number;
    location?: CodeLocation;
}
export interface TraceMeta {
    name: string;
    traceIds: string[];
    oapUrl: string;
    fetchedAt: string;
    codebases: string[];
}
export declare const DEFAULT_CONFIG: SwConfig;
