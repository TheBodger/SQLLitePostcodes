'use strict';

/**
 * Minimal self-contained test runner (no external deps).
 * Run with:  node src/tests/postcodeUtils.test.js
 */

const { parsePostcode, hasValidCoords } = require('../postcodeUtils');

let passed = 0;
let failed = 0;

function assert(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓  ${description}`);
    passed++;
  } else {
    console.error(`  ✗  ${description}`);
    console.error(`       expected : ${JSON.stringify(expected)}`);
    console.error(`       got      : ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertNull(description, actual) {
  assert(description, actual, null);
}

console.log('\n── parsePostcode ─────────────────────────────────');

assert(
  'SW1A 2AA → area=SW, district=SW1A, sector=SW1A 2',
  parsePostcode('SW1A 2AA'),
  { area: 'SW', district: 'SW1A', sector: 'SW1A 2' }
);

assert(
  'E1 6AN → area=E, district=E1, sector=E1 6',
  parsePostcode('E1 6AN'),
  { area: 'E', district: 'E1', sector: 'E1 6' }
);

assert(
  'EC2A 1HQ → area=EC, district=EC2A, sector=EC2A 1',
  parsePostcode('EC2A 1HQ'),
  { area: 'EC', district: 'EC2A', sector: 'EC2A 1' }
);

assert(
  'W1A 1AA → area=W, district=W1A, sector=W1A 1',
  parsePostcode('W1A 1AA'),
  { area: 'W', district: 'W1A', sector: 'W1A 1' }
);

assert(
  'B1 1BB → area=B, district=B1, sector=B1 1',
  parsePostcode('B1 1BB'),
  { area: 'B', district: 'B1', sector: 'B1 1' }
);

assert(
  'lowercase input sw1a 2aa is normalised',
  parsePostcode('sw1a 2aa'),
  { area: 'SW', district: 'SW1A', sector: 'SW1A 2' }
);

assert(
  'no-space input SW1A2AA is parsed',
  parsePostcode('SW1A2AA'),
  { area: 'SW', district: 'SW1A', sector: 'SW1A 2' }
);

assertNull('empty string returns null',   parsePostcode(''));
assertNull('null input returns null',     parsePostcode(null));
assertNull('garbage returns null',        parsePostcode('NOTAPOSTCODE'));
assertNull('partial postcode returns null', parsePostcode('SW1A'));

console.log('\n── hasValidCoords ────────────────────────────────');

assert('valid coords',            hasValidCoords(530000, 180000), true);
assert('zero easting → false',    hasValidCoords(0,      180000), false);
assert('zero northing → false',   hasValidCoords(530000, 0),      false);
assert('null easting → false',    hasValidCoords(null,   180000), false);
assert('null northing → false',   hasValidCoords(530000, null),   false);
assert('both null → false',       hasValidCoords(null,   null),   false);
assert('NaN easting → false',     hasValidCoords(NaN,    180000), false);

console.log(`\n─────────────────────────────────────────────────`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
