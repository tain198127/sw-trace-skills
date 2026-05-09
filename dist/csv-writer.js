import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { maxTreeDepth, flattenTree } from "./tree.js";
const MAX_DEPTH = 20;
function formatLabel(node) {
    if (node.endpointName)
        return `${node.serviceCode}: ${node.endpointName}`;
    if (node.component && node.peer)
        return `${node.component}: ${node.peer}`;
    if (node.component)
        return `${node.component}: ${node.spanType}`;
    return `${node.serviceCode}: ${node.spanType}`;
}
function formatTags(node) {
    if (node.tags.length === 0)
        return "";
    return node.tags.map((t) => `${t.key}=${t.value}`).join("; ");
}
export function writeTraceCsv(root, outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    const depth = Math.min(maxTreeDepth(root) + 1, MAX_DEPTH);
    const rows = flattenTree(root);
    const levelHeaders = Array.from({ length: depth }, (_, i) => `Level_${i}`);
    const metaHeaders = [
        "Service",
        "Endpoint",
        "Component",
        "Peer",
        "Duration_ms",
        "Start_Time",
        "IsError",
        "Layer",
        "Tags",
    ];
    const headers = [...levelHeaders, ...metaHeaders];
    const lines = [headers.map(escapeCsv).join(",")];
    for (const { node, depth: d } of rows) {
        const levelCols = Array(depth).fill("");
        levelCols[Math.min(d, depth - 1)] = escapeCsv(formatLabel(node));
        const duration = node.endTime > node.startTime ? node.endTime - node.startTime : 0;
        const metaCols = [
            escapeCsv(node.serviceCode),
            escapeCsv(node.endpointName),
            escapeCsv(node.component),
            escapeCsv(node.peer),
            String(duration),
            String(node.startTime),
            String(node.isError),
            escapeCsv(node.layer),
            escapeCsv(formatTags(node)),
        ];
        lines.push([...levelCols, ...metaCols].join(","));
    }
    const content = "﻿" + lines.join("\n");
    writeFileSync(outputPath, content, "utf-8");
    return outputPath;
}
function escapeCsv(value) {
    if (!value)
        return "";
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}
