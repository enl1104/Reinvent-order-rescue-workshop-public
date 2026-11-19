'use strict';

/* Validated solution: read the order once, use every fact from that one read. */

async function buildContext(orderId, lookup) {
  const order = await lookup(orderId);
  return {
    order_id: orderId,
    status: order.status,
    delivery: order.delivery,
    can_change_address: order.can_change_address,
  };
}

module.exports = { buildContext };
