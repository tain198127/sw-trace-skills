import type { SpanNode } from "./types.js";
export declare class TreeBuildingError extends Error {
}
export declare function buildCallTree(spans: SpanNode[]): SpanNode;
export declare function flattenTree(node: SpanNode, depth?: number): Array<{
    node: SpanNode;
    depth: number;
}>;
export declare function maxTreeDepth(node: SpanNode, depth?: number): number;
