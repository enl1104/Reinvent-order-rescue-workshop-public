'use strict';

/*
 * Synthetic order backend.
 *
 * One call to lookup() is one backend read. In a real system this would be a
 * database query or an HTTP call to an order service; here it is an
 * in-process function with a small delay, so every read shows up as its own
 * `orders.lookup` span in the trace. No external infrastructure is required.
 */

const { withSpan } = require('./telemetry');

const ORDER = { status: 'processing', delivery: 'Friday', can_change_address: true };
const DELAY_MS = Number(process.env.ORDER_DELAY_MS ?? 400);

function lookup(orderId) {
  return withSpan('orders.lookup', { kind: 'CLIENT', attributes: { 'order.id': orderId } }, async () => {
    await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    return { ...ORDER };
  });
}

module.exports = { lookup };
