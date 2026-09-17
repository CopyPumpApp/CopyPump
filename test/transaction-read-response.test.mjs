import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { classifyTransactionReadResponse } from '../tools/classify-transaction-read-response.mjs';

const fixtures = JSON.parse(
  await fs.readFile(new URL('../examples/transaction-read-response-fixtures.json', import.meta.url), 'utf8')
);

for (const fixture of fixtures.cases) {
  test(`classifies ${fixture.name}`, () => {
    const result = classifyTransactionReadResponse(fixture.payload);
    assert.equal(result.kind, fixture.expectedKind);
  });
}

test('keeps successful legacy, v0, and v1 transaction shapes version-tolerant', () => {
  const successCases = fixtures.cases.filter((fixture) => fixture.expectedKind === 'transaction_succeeded');
  assert.deepEqual(
    successCases.map((fixture) => classifyTransactionReadResponse(fixture.payload).version),
    ['legacy', 0, 1]
  );
});

test('fails closed for primitive and incomplete payloads', () => {
  assert.equal(classifyTransactionReadResponse(null).kind, 'invalid_response');
  assert.equal(classifyTransactionReadResponse([]).kind, 'invalid_response');
  assert.equal(classifyTransactionReadResponse({ jsonrpc: '2.0', id: 8 }).kind, 'invalid_response');
  assert.equal(
    classifyTransactionReadResponse({ jsonrpc: '2.0', id: 9, result: { meta: { err: null } } }).kind,
    'invalid_response'
  );
});

test('classifies non-version RPC errors separately without echoing provider text', () => {
  const result = classifyTransactionReadResponse({
    jsonrpc: '2.0',
    id: 10,
    error: { code: -32005, message: 'provider details must not be reflected' }
  });

  assert.deepEqual(result, { kind: 'rpc_error', rpcCode: -32005 });
  assert.doesNotMatch(JSON.stringify(result), /provider details/);
});
