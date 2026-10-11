// Live check of the customer address and delivery zone endpoints.
// Admin endpoints are intentionally not tested.
// Usage: node scripts/endpoint-check.mjs [baseUrl]   (default http://localhost:3001)
// Writes a full request/response log to logs/endpoint-check-<timestamp>.log
//
// Side effect: creates one test address (contact number 90000xxxxx,
// landmark "TEST - endpoint check - safe to delete").

import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:3001';
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const logPath = `logs/endpoint-check-${stamp}.log`;
const lines = [];
const results = [];

const log = (s = '') => lines.push(s);
const pretty = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  return s.length > 1500 ? s.slice(0, 1500) + `\n… (${s.length} chars, truncated)` : s;
};

async function check(name, method, path, { body, expect, headers = {}, verify } = {}) {
  const started = Date.now();
  let status, data, note = '';
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = res.status;
    const text = await res.text();
    try { data = text ? JSON.parse(text) : ''; } catch { data = text; }
  } catch (err) {
    status = 'NETWORK ERROR';
    data = String(err);
  }

  let pass = status === expect;
  if (pass && verify) {
    const problem = verify(data);
    if (problem) { pass = false; note = problem; }
  }
  results.push({ name, pass, status, expect });

  log('─'.repeat(72));
  log(`${pass ? 'PASS' : 'FAIL'}  ${name}`);
  log(`${method} ${path}   (${Date.now() - started} ms)`);
  if (body !== undefined) log(`Request body:\n${pretty(body)}`);
  log(`Status: ${status}   (expected ${expect})`);
  if (note) log(`Problem: ${note}`);
  log(`Response:\n${pretty(data)}`);
  log();
  return data;
}

// ── Header ────────────────────────────────────────────────────────────
log(`Endpoint check — address & delivery zones`);
log(`Server: ${BASE}`);
log(`Run at: ${new Date().toString()}`);
log();

// ── Delivery zones ────────────────────────────────────────────────────
log('═'.repeat(72));
log('DELIVERY ZONES');
log('═'.repeat(72));

const zones = await check('List all delivery zones', 'GET', '/api/deliveryzones', {
  expect: 200,
  verify: (d) => (Array.isArray(d) ? null : 'response is not an array'),
});

const firstZone = Array.isArray(zones) ? zones.find((z) => z.location_name) : null;
if (firstZone) {
  await check(`Find zone by known location ("${firstZone.location_name}")`, 'POST',
    '/api/deliveryzones/location', {
      body: { location: firstZone.location_name },
      expect: 201, // Nest default for POST, even for lookups
      verify: (d) => (d?.location_name === firstZone.location_name ? null : 'returned a different zone'),
    });
} else {
  log('SKIP  Find zone by known location — no zones with location_name in the list');
  log();
}

await check('Find zone by unknown location (expect 404)', 'POST', '/api/deliveryzones/location', {
  body: { location: 'Nowhere-EndpointCheck' },
  expect: 404,
});

await check('Find zone with empty body (expect 404)', 'POST', '/api/deliveryzones/location', {
  body: {},
  expect: 404,
});

// ── Addresses ─────────────────────────────────────────────────────────
log('═'.repeat(72));
log('ADDRESSES');
log('═'.repeat(72));

const testNumber = '90000' + String(Date.now()).slice(-5);
const address = {
  address_line: '1 Endpoint Check Street',
  landmark: 'TEST - endpoint check - safe to delete',
  city: 'Chennai',
  pincode: '600001',
  contact_number: testNumber,
};

await check('Create address', 'POST', '/api/addresses/create', {
  body: address,
  expect: 201,
  verify: (d) => (d?.contact_number === testNumber ? null : 'created row does not match'),
});

await check('Search address by contact number', 'POST', '/api/addresses/search', {
  body: { contact_number: testNumber },
  expect: 201,
  verify: (d) => (d?.address_line === address.address_line ? null : 'returned a different address'),
});

const updated = { ...address, address_line: '2 Updated Check Road', city: 'Madurai' };
await check('Update address', 'PATCH', '/api/addresses/update', {
  body: updated,
  expect: 200,
  verify: (d) => (d?.city === 'Madurai' ? null : 'response does not show the new city'),
});

await check('Search again — update was saved', 'POST', '/api/addresses/search', {
  body: { contact_number: testNumber },
  expect: 201,
  verify: (d) =>
    d?.city === 'Madurai' && d?.address_line === updated.address_line
      ? null
      : `stored city is "${d?.city}", address_line "${d?.address_line}" — update not saved`,
});

await check('Search unknown contact number (expect 404)', 'POST', '/api/addresses/search', {
  body: { contact_number: '0000000099' },
  expect: 404,
});

await check('Update unknown contact number (expect 404)', 'PATCH', '/api/addresses/update', {
  body: { ...updated, contact_number: '0000000099' },
  expect: 404,
});

await check('Create address with missing fields (expect 400)', 'POST', '/api/addresses/create', {
  body: { city: 'Chennai' },
  expect: 400,
});

// ── Summary ───────────────────────────────────────────────────────────
const passed = results.filter((r) => r.pass).length;
const summary = [
  '═'.repeat(72),
  `SUMMARY: ${passed}/${results.length} passed`,
  '═'.repeat(72),
  ...results.map((r) => `${r.pass ? 'PASS' : 'FAIL'}  ${String(r.status).padEnd(4)} (exp ${r.expect})  ${r.name}`),
  '',
  `Test address created with contact_number ${testNumber}`,
];
lines.splice(4, 0, ...summary, '');

mkdirSync('logs', { recursive: true });
writeFileSync(logPath, lines.join('\n'));
console.log(summary.join('\n'));
console.log(`\nFull log: ${logPath}`);
process.exitCode = passed === results.length ? 0 : 1;
