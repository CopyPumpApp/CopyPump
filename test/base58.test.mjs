import test from 'node:test';
import assert from 'node:assert/strict';
import { isBase58Bytes } from '../tools/base58.mjs';

test('all-zero values keep their exact number of leading zero bytes', () => {
  for (const bytes of [32, 64]) {
    assert.equal(isBase58Bytes('1'.repeat(bytes), bytes), true);
    assert.equal(isBase58Bytes('1'.repeat(bytes - 1), bytes), false);
    assert.equal(isBase58Bytes('1'.repeat(bytes + 1), bytes), false);
  }
});

test('nonzero values accept valid leading-zero and maximum printable lengths', () => {
  for (const [bytes, maximumLength] of [[32, 44], [64, 88]]) {
    for (const value of [
      '1'.repeat(bytes - 1) + '2',
      // Base58 5R is 256: its two-byte body follows the leading zeroes.
      '1'.repeat(bytes - 2) + '5R',
      '2' + '1'.repeat(maximumLength - 1)
    ]) assert.equal(isBase58Bytes(value, bytes), true, value);
  }
  assert.equal(isBase58Bytes('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG', 32), true);
});

test('printable lengths cannot hide too few or too many decoded bytes', () => {
  for (const [bytes, maximumLength] of [[32, 44], [64, 88]]) {
    for (const value of [
      '2'.repeat(bytes),
      'z'.repeat(maximumLength),
      // Base58 5Q is 255: only one body byte, unlike the 256 boundary above.
      '1'.repeat(bytes - 2) + '5Q'
    ]) assert.equal(isBase58Bytes(value, bytes), false, value);
  }
});

test('malformed alphabet, padding and non-string values are rejected', () => {
  for (const value of [undefined, null, false, 32, {}, [], '',
    ...['0', 'O', 'I', 'l', ' ', '\n'].map((character) => character + '1'.repeat(31)),
    '1'.repeat(32) + ' ', '1'.repeat(89)
  ]) assert.equal(isBase58Bytes(value, 32), false);
});

test('only the bounded 32-byte and 64-byte contracts are supported', () => {
  for (const bytes of [undefined, null, false, 0, -1, 31, 33, 63, 65, 32.5, '32', Infinity, NaN]) {
    assert.equal(isBase58Bytes('1'.repeat(32), bytes), false);
  }
  assert.equal(isBase58Bytes('1'.repeat(32), 64), false);
  assert.equal(isBase58Bytes('1'.repeat(64), 32), false);
});
