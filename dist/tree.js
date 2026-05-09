export class TreeBuildingError extends Error {
}
function sortChildren(node) {
    node.children.sort((a, b) => a.startTime - b.startTime);
    for (const child of node.children) {
        sortChildren(child);
    }
}
export function buildCallTree(spans) {
    if (spans.length === 0) {
        throw new TreeBuildingError("Empty span list");
    }
    const index = new Map();
    const segmentRoots = [];
    for (const node of spans) {
        index.set(`${node.segmentId}:${node.spanId}`, node);
    }
    // Phase 1: intra-segment tree
    for (const node of spans) {
        if (node.parentSpanId === -1) {
            segmentRoots.push(node);
        }
        else {
            const parentKey = `${node.segmentId}:${node.parentSpanId}`;
            const parent = index.get(parentKey);
            if (parent) {
                parent.children.push(node);
            }
            else {
                console.warn(`Parent ${parentKey} not found for span ${node.segmentId}:${node.spanId}, treating as root`);
                segmentRoots.push(node);
            }
        }
    }
    // Phase 2: inter-segment linking
    let globalRoot = null;
    for (const root of segmentRoots) {
        if (root.refs.length === 0) {
            globalRoot = root;
            continue;
        }
        const ref = root.refs[0];
        const parentKey = `${ref.parentSegmentId}:${ref.parentSpanId}`;
        const parent = index.get(parentKey);
        if (parent) {
            parent.children.push(root);
        }
        else {
            console.warn(`Cross-segment parent ${parentKey} not found for segment ${root.segmentId}, treating as top-level root`);
            if (!globalRoot || root.startTime < globalRoot.startTime) {
                globalRoot = root;
            }
        }
    }
    if (!globalRoot) {
        segmentRoots.sort((a, b) => a.startTime - b.startTime);
        globalRoot = segmentRoots[0];
    }
    sortChildren(globalRoot);
    return globalRoot;
}
export function flattenTree(node, depth = 0) {
    const rows = [{ node, depth }];
    for (const child of node.children) {
        rows.push(...flattenTree(child, depth + 1));
    }
    return rows;
}
export function maxTreeDepth(node, depth = 0) {
    if (node.children.length === 0)
        return depth;
    return Math.max(...node.children.map((c) => maxTreeDepth(c, depth + 1)));
}
