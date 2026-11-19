'use strict';

/* Wire the pieces together: one function the HTTP server (and tests) call. */

const crypto = require('node:crypto');
const orders = require('./orders');
const { makeClient, runAgent } = require('./agent');
const { buildContext } = require('./flow');
const { withSpan, currentTraceId, forceFlush } = require('./telemetry');

const QUESTION = 'Where is my order and can I still change the delivery address?';

async function answer(question, { flow = buildContext } = {}) {
  const started = performance.now();
  const requestId = crypto.randomUUID();
  let reads = 0;
  const countingLookup = (orderId) => {
    reads += 1;
    return orders.lookup(orderId);
  };
  const captureContent = (process.env.GENAI_CAPTURE_CONTENT || 'false').toLowerCase() === 'true';

  let traceId = null;
  const result = await withSpan('POST /chat', { kind: 'SERVER', attributes: { 'request.id': requestId } }, async () => {
    traceId = currentTraceId();
    return runAgent(question || QUESTION, makeClient(), flow, countingLookup, { captureContent, startedAt: started });
  });

  await forceFlush();
  return {
    ...result,
    mode: process.env.MODEL_MODE || 'mock',
    platform: process.env.DEPLOY_PLATFORM || 'local',
    request_id: requestId,
    trace_id: traceId,
    backend_reads: reads,
    elapsed_ms: Math.round(performance.now() - started),
  };
}

module.exports = { answer, QUESTION };
