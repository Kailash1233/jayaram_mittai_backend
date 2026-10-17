// Creates Razorpay signatures with the secrets in .env, for MANUAL testing of
// /api/payments/razorpay/verify and /webhook without a frontend.
// Test mode only: refuses to run with a live key.
//
//   node scripts/razorpay-sign.mjs payment <razorpay_order_id> <razorpay_payment_id>
//   node scripts/razorpay-sign.mjs webhook <payment.captured|payment.failed> <razorpay_order_id> [payment_id]
//
// The webhook mode prints the exact one-line body to send with its signature:
// the signature only matches if the body is sent byte for byte.

import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
    }),
);

if (!env.RAZORPAY_KEY_ID?.startsWith('rzp_test_')) {
  console.error('Refusing: RAZORPAY_KEY_ID is not a test key (rzp_test_…).');
  process.exit(1);
}

const sign = (secret, data) => createHmac('sha256', secret).update(data).digest('hex');
const [mode, ...args] = process.argv.slice(2);

if (mode === 'payment' && args.length === 2) {
  const [orderId, paymentId] = args;
  console.log(JSON.stringify({
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: sign(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`),
  }, null, 2));
} else if (mode === 'webhook' && args.length >= 2) {
  const [event, orderId, paymentId = 'pay_MANUALTEST'] = args;
  const body = JSON.stringify({
    event,
    payload: { payment: { entity: { id: paymentId, order_id: orderId, method: 'upi' } } },
  });
  console.log(`Body (send exactly this, on one line):\n${body}\n`);
  console.log(`x-razorpay-signature: ${sign(env.RAZORPAY_WEBHOOK_SECRET, body)}`);
} else {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(0, 9).join('\n'));
  process.exit(1);
}
