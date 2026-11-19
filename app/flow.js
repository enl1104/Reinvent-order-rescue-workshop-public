'use strict';

/*
 * The workshop defect lives in this one file.
 *
 * buildContext() asks the backend for the order THREE times - once for status,
 * once for delivery, once for the address-change policy - when a single read
 * returns all three facts. That wasteful pattern is what you will see in the
 * trace and what you will fix.
 *
 * This is the ONLY file you edit during the exercise. Change it so the backend
 * is read exactly once, while still returning all four fields. The validated
 * answer is in ../solution/flow.js if you want to compare.
 */

async function buildContext(orderId, lookup) {
  const status = await lookup(orderId);
  const delivery = await lookup(orderId);
  const policy = await lookup(orderId);
  return {
    order_id: orderId,
    status: status.status,
    delivery: delivery.delivery,
    can_change_address: policy.can_change_address,
  };
}

module.exports = { buildContext };
