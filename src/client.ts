import axios from "axios";
import type { SpanNode, SpanTag, SpanLog, SpanRef } from "./types.js";

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

export class TraceExporterError extends Error {}

export class TraceFetchError extends TraceExporterError {}

export class TraceNotFoundError extends TraceExporterError {}

export class TraceResponseError extends TraceExporterError {}

function parseSpan(raw: Record<string, unknown>): SpanNode {
  const tags: SpanTag[] = ((raw.tags as Record<string, string>[]) || []).map(
    (t) => ({ key: t.key, value: t.value })
  );
  const logs: SpanLog[] = ((raw.logs as Record<string, unknown>[]) || []).map(
    (l) => ({
      time: l.time as string,
      data: ((l.data as Array<{ key: string; value: string }>) || []).map(
        (d) => ({ key: d.key, value: d.value })
      ),
    })
  );
  const refs: SpanRef[] = (
    (raw.refs as Record<string, unknown>[]) || []
  ).map((r) => ({
    traceId: r.traceId as string,
    parentSegmentId: r.parentSegmentId as string,
    parentSpanId: r.parentSpanId as number,
    type: r.type as string,
  }));

  return {
    spanId: raw.spanId as number,
    segmentId: raw.segmentId as string,
    parentSpanId: raw.parentSpanId as number,
    refs,
    serviceCode: (raw.serviceCode as string) || "",
    serviceInstanceName: (raw.serviceInstanceName as string) || "",
    startTime: (raw.startTime as number) || 0,
    endTime: (raw.endTime as number) || 0,
    endpointName: (raw.endpointName as string) || "",
    spanType: (raw.type as string) || "",
    peer: (raw.peer as string) || "",
    component: (raw.component as string) || "",
    isError: (raw.isError as boolean) || false,
    layer: (raw.layer as string) || "",
    tags,
    logs,
    children: [],
  };
}

export async function fetchTrace(
  oapUrl: string,
  traceId: string,
  timeout: number = 30
): Promise<SpanNode[]> {
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
  } catch (err) {
    if (axios.isAxiosError(err) && !err.response) {
      throw new TraceFetchError(
        `Cannot connect to OAP at ${url}: ${err.message}`
      );
    }
    throw new TraceFetchError(`Request to OAP failed: ${err}`);
  }

  if (resp.status !== 200) {
    throw new TraceFetchError(
      `OAP returned HTTP ${resp.status}: ${String(resp.data).slice(0, 200)}`
    );
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

  return spans.map((s: Record<string, unknown>) => parseSpan(s));
}
