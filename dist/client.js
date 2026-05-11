import axios from "axios";
const GRAPHQL_QUERY = `
query queryTrace($traceId: ID!) {
  queryTrace(traceId: $traceId) {
    spans {
      traceId
      segmentId
      spanId
      parentSpanId
      refs {
        traceId
        parentSegmentId
        parentSpanId
        type
      }
      serviceCode
      serviceInstanceName
      startTime
      endTime
      endpointName
      type
      peer
      component
      isError
      layer
      tags {
        key
        value
      }
      logs {
        time
        data {
          key
          value
        }
      }
    }
  }
}
`.trim();
export class TraceExporterError extends Error {
}
export class TraceFetchError extends TraceExporterError {
}
export class TraceNotFoundError extends TraceExporterError {
}
export class TraceResponseError extends TraceExporterError {
}
function parseSpan(raw) {
    const tags = (raw.tags || []).map((t) => ({ key: t.key, value: t.value }));
    const logs = (raw.logs || []).map((l) => ({
        time: l.time,
        data: (l.data || []).map((d) => ({ key: d.key, value: d.value })),
    }));
    const refs = (raw.refs || []).map((r) => ({
        traceId: r.traceId,
        parentSegmentId: r.parentSegmentId,
        parentSpanId: r.parentSpanId,
        type: r.type,
    }));
    return {
        spanId: raw.spanId,
        segmentId: raw.segmentId,
        parentSpanId: raw.parentSpanId,
        refs,
        serviceCode: raw.serviceCode || "",
        serviceInstanceName: raw.serviceInstanceName || "",
        startTime: raw.startTime || 0,
        endTime: raw.endTime || 0,
        endpointName: raw.endpointName || "",
        spanType: raw.type || "",
        peer: raw.peer || "",
        component: raw.component || "",
        isError: raw.isError || false,
        layer: raw.layer || "",
        tags,
        logs,
        children: [],
    };
}
export async function fetchTrace(oapUrl, traceId, timeout = 30) {
    const url = `${oapUrl}/graphql`;
    const payload = {
        query: GRAPHQL_QUERY,
        variables: { traceId },
    };
    let resp;
    try {
        resp = await axios.post(url, payload, {
            timeout: timeout * 1000,
            headers: { "Content-Type": "application/json" },
        });
    }
    catch (err) {
        if (axios.isAxiosError(err) && !err.response) {
            throw new TraceFetchError(`Cannot connect to OAP at ${url}: ${err.message}`);
        }
        throw new TraceFetchError(`Request to OAP failed: ${err}`);
    }
    if (resp.status !== 200) {
        throw new TraceFetchError(`OAP returned HTTP ${resp.status}: ${String(resp.data).slice(0, 200)}`);
    }
    const data = resp.data;
    if (!data) {
        throw new TraceResponseError("OAP returned empty response");
    }
    const errors = data.errors;
    if (errors) {
        throw new TraceResponseError(`GraphQL errors: ${JSON.stringify(errors)}`);
    }
    const queryTrace = data?.data?.queryTrace;
    if (!queryTrace) {
        throw new TraceNotFoundError(`Trace not found: ${traceId}`);
    }
    const spans = queryTrace.spans;
    if (!spans || spans.length === 0) {
        throw new TraceNotFoundError(`Trace ${traceId} has no spans`);
    }
    return spans.map((s) => parseSpan(s));
}
const LIST_TRACES_QUERY = `
query queryTraces($condition: TraceQueryCondition) {
  queryBasicTraces(condition: $condition) {
    traces {
      traceIds
      endpointNames
      duration
      start
      isError
    }
  }
}
`.trim();
export class TraceListError extends TraceExporterError {
}
export async function queryRecentTraces(oapUrl, limit = 30, minutesBack = 60, timeout = 30) {
    const url = `${oapUrl}/graphql`;
    const now = new Date();
    const from = new Date(now.getTime() - minutesBack * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`;
    const payload = {
        query: LIST_TRACES_QUERY,
        variables: {
            condition: {
                queryDuration: {
                    start: fmt(from),
                    end: fmt(now),
                    step: "MINUTE",
                },
                queryOrder: "BY_START_TIME",
                paging: { pageNum: 1, pageSize: limit },
                traceState: "ALL",
            },
        },
    };
    let resp;
    try {
        resp = await axios.post(url, payload, {
            timeout: timeout * 1000,
            headers: { "Content-Type": "application/json" },
        });
    }
    catch (err) {
        if (axios.isAxiosError(err) && !err.response) {
            throw new TraceListError(`Cannot connect to OAP at ${url}: ${err.message}`);
        }
        throw new TraceListError(`Request to OAP failed: ${err}`);
    }
    if (resp.status !== 200) {
        throw new TraceListError(`OAP returned HTTP ${resp.status}: ${String(resp.data).slice(0, 200)}`);
    }
    const data = resp.data;
    if (!data) {
        throw new TraceListError("OAP returned empty response");
    }
    const errors = data.errors;
    if (errors) {
        throw new TraceListError(`GraphQL errors: ${JSON.stringify(errors)}`);
    }
    const traces = data?.data?.queryBasicTraces?.traces;
    if (!traces || traces.length === 0) {
        return [];
    }
    return traces.map((t) => ({
        traceId: Array.isArray(t.traceIds) ? String(t.traceIds[0]) : "",
        startTime: t.start || "",
        duration: t.duration || 0,
        endpointName: Array.isArray(t.endpointNames)
            ? String(t.endpointNames[0] || "")
            : "",
        isError: t.isError || false,
        serviceCode: "",
    }));
}
