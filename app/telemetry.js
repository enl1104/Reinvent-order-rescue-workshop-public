'use strict';

/*
 * Optional OpenTelemetry trace export over OTLP/HTTP (protobuf).
 *
 * Tracing is OFF unless OTEL_EXPORTER_OTLP_TRACES_ENDPOINT is set, so the app
 * runs with zero observability setup. Point it at any OTLP backend (Dynatrace,
 * an OpenTelemetry Collector, ...). Headers come from the standard
 * OTEL_EXPORTER_OTLP_TRACES_HEADERS variable, e.g.
 *   Authorization=Api-Token%20dt0c01.XXXX
 */

const api = require('@opentelemetry/api');

const ENABLED = Boolean(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT);
let provider = null;

if (ENABLED) {
  const { NodeTracerProvider } = require('@opentelemetry/sdk-trace-node');
  const { BatchSpanProcessor } = require('@opentelemetry/sdk-trace-base');
  const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-proto');
  const { resourceFromAttributes } = require('@opentelemetry/resources');

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': 'order-rescue-agent',
      'service.namespace': process.env.SERVICE_NAMESPACE || 'order-rescue',
      'service.version': '2.0',
      'deployment.platform': process.env.DEPLOY_PLATFORM || 'local',
      'cloud.provider': 'aws',
      'cloud.region': process.env.AWS_REGION || 'us-east-1',
    }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();
  console.log('[otel] trace export enabled');
} else {
  console.log('[otel] OTEL_EXPORTER_OTLP_TRACES_ENDPOINT not set, tracing disabled');
}

const tracer = api.trace.getTracer('order-rescue', '2.0');

/** Run fn inside a span. fn receives the span (or null when tracing is off). */
async function withSpan(name, { kind = 'INTERNAL', attributes = {} } = {}, fn) {
  if (!ENABLED) return fn(null);
  return tracer.startActiveSpan(
    name,
    { kind: api.SpanKind[kind], attributes },
    async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.setAttribute('error.type', err && err.name ? err.name : 'Error');
        span.setStatus({ code: api.SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    }
  );
}

function currentTraceId() {
  if (!ENABLED) return null;
  const span = api.trace.getActiveSpan();
  return span ? span.spanContext().traceId : null;
}

/** Export buffered spans now, so each request's trace is sent promptly. */
async function forceFlush() {
  if (provider) await provider.forceFlush();
}

module.exports = { withSpan, currentTraceId, forceFlush };
