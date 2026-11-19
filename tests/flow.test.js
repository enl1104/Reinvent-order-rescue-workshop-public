'use strict';

/*
 * The defect reads the backend 3x; the solution reads 1x; both return the same
 * four facts. A fourth test drives the whole agent in mock mode and asserts the
 * defect's read count surfaces end to end.
 *
 * Set env before requiring app modules: orders.js reads ORDER_DELAY_MS at load.
 */
process.env.MODEL_MODE = 'mock';
process.env.ORDER_DELAY_MS = '0';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildContext: defect } = require('../app/flow');
const { buildContext: solution } = require('../solution/flow');
const { answer } = require('../app/service');

function countingBackend() {
  const state = { calls: 0 };
  const lookup = async () => {
    state.calls += 1;
    return { status: 'processing', delivery: 'Friday', can_change_address: true };
  };
  return { state, lookup };
}

const EXPECTED_FIELDS = ['order_id', 'status', 'delivery', 'can_change_address'];

test('defect reads the backend three times', async () => {
  const b = countingBackend();
  await defect('DEMO-1001', b.lookup);
  assert.equal(b.state.calls, 3);
});

test('solution reads the backend once', async () => {
  const b = countingBackend();
  await solution('DEMO-1001', b.lookup);
  assert.equal(b.state.calls, 1);
});

test('defect and solution return the same four fields', async () => {
  const d = await defect('DEMO-1001', countingBackend().lookup);
  const s = await solution('DEMO-1001', countingBackend().lookup);
  assert.deepEqual(Object.keys(d).sort(), [...EXPECTED_FIELDS].sort());
  assert.deepEqual(d, s);
});

test('service.answer surfaces the defect read count in mock mode', async () => {
  const result = await answer(null);
  assert.equal(result.backend_reads, 3); // the planted defect, visible end to end
  assert.equal(result.tool_calls, 1);
  assert.equal(result.mode, 'mock');
  assert.ok(typeof result.answer === 'string' && result.answer.length > 0);
  assert.ok(result.answer.includes('DEMO-1001'));
});
