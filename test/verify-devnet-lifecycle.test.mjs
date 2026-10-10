import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { verifyDevnetLifecycle } from '../tools/verify-devnet-lifecycle.mjs';
import { SOLANA_DEVNET_GENESIS_HASH } from '../tools/validate-devnet-evidence.mjs';

const manifestFixture = JSON.parse(await fs.readFile(
  new URL('../examples/devnet-lifecycle.example.json', import.meta.url), 'utf8'
));
const evidenceFixture = JSON.parse(await fs.readFile(
  new URL('../examples/devnet-lifecycle-rpc-fixtures.json', import.meta.url), 'utf8'
));
const rpcUrl = 'https://example.invalid/devnet';

function fixtures() {
  return { manifest: structuredClone(manifestFixture), evidence: structuredClone(evidenceFixture) };
}

function jsonResponse(payload, options = {}) {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' }, ...options
  });
}

function fixtureRpc(evidence, requests = []) {
  return async (url, init) => {
    const request = JSON.parse(init.body);
    requests.push({ url, init, request });
    if (request.method === 'getGenesisHash') {
      return jsonResponse({ jsonrpc: '2.0', id: request.id, result: SOLANA_DEVNET_GENESIS_HASH });
    }
    if (request.method === 'getSignatureStatuses') return jsonResponse(evidence.statusResponse);
    if (request.method === 'getTransaction') {
      const receipt = evidence.transactionResponses.find((item) => item.transactionSignature === request.params[0]);
      assert.ok(receipt, 'only fixture transaction signatures may be queried');
      return jsonResponse(receipt.response);
    }
    assert.fail('unexpected RPC method');
  };
}

function assertNoAuthorization(report) {
  assert.equal(report.lifecycleVerified, false);
  assert.equal(report.sendAuthorized, false);
}

function assertRejected(report, code) {
  assert.equal(report.ok, false);
  assert.equal(report.code, code);
  assert.equal(report.receiptEvidenceVerified, false);
  assertNoAuthorization(report);
}

test('offline mode validates the manifest without making a network call or asserting receipt proof', async () => {
  for (const missingUrl of [undefined, null, '', '  ']) {
    let calls = 0;
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture,
      rpcUrl: missingUrl,
      fetchImpl: async () => { calls += 1; throw new Error('network is forbidden'); }
    });
    assert.equal(report.ok, true);
    assert.equal(report.code, 'DEVNET_LIFECYCLE_READ_SKIPPED');
    assert.equal(report.receiptEvidenceVerified, false);
    assertNoAuthorization(report);
    assert.equal(calls, 0);
  }
});

test('invalid manifests are rejected before any RPC, including in offline mode', async () => {
  for (const configuredUrl of [undefined, rpcUrl]) {
    let calls = 0;
    const report = await verifyDevnetLifecycle({
      manifest: {},
      rpcUrl: configuredUrl,
      fetchImpl: async () => { calls += 1; throw new Error('network is forbidden'); }
    });
    assertRejected(report, 'LIFECYCLE_MANIFEST_INVALID');
    assert.equal(calls, 0);
  }
});

test('valid online evidence is read in five bounded requests without changing its proof scope', async () => {
  const { manifest, evidence } = fixtures();
  const requests = [];
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl, fetchImpl: fixtureRpc(evidence, requests) });
  assert.equal(report.ok, true);
  assert.equal(report.receiptEvidenceVerified, true);
  assertNoAuthorization(report);
  assert.deepEqual(requests.map(({ request }) => request.method), [
    'getGenesisHash', 'getSignatureStatuses', 'getTransaction', 'getTransaction', 'getTransaction'
  ]);
  assert.deepEqual(requests.map(({ request }) => request.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(requests[1].request.params, [
    manifest.trades.map((trade) => trade.transactionSignature), { searchTransactionHistory: true }
  ]);
  for (const [index, entry] of requests.slice(2).entries()) {
    assert.deepEqual(entry.request.params, [manifest.trades[index].transactionSignature, {
      commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 1
    }]);
  }
  for (const { url, init } of requests) {
    assert.equal(url, rpcUrl);
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.credentials, 'omit');
    assert.ok(init.signal instanceof AbortSignal);
  }
});

test('caller mutations during the first fetch cannot change captured operation expectations', async () => {
  const { manifest, evidence } = fixtures();
  const originalSignatures = manifest.trades.map((trade) => trade.transactionSignature);
  const requests = [];
  const readFixture = fixtureRpc(evidence, requests);
  const report = await verifyDevnetLifecycle({
    manifest,
    rpcUrl,
    fetchImpl: async (url, init) => {
      if (requests.length === 0) {
        manifest.owner = '2'.repeat(32);
        manifest.trades[0].operationId = 'mutated-operation';
        manifest.trades[0].transactionSignature = '2'.repeat(64);
        manifest.trades[0].expectedPostAmount = '999';
      }
      return readFixture(url, init);
    }
  });
  assert.equal(report.ok, true);
  assert.equal(report.receiptEvidenceVerified, true);
  assertNoAuthorization(report);
  assert.deepEqual(requests[1].request.params[0], originalSignatures);
  assert.deepEqual(requests.slice(2).map(({ request }) => request.params[0]), originalSignatures);
});

test('manifest snapshot failures are sanitized and make no RPC calls', async () => {
  const { manifest } = fixtures();
  manifest.owner = () => 'not normalized JSON';
  let calls = 0;
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl,
    fetchImpl: async () => { calls += 1; throw new Error('network is forbidden'); } });
  assertRejected(report, 'LIFECYCLE_MANIFEST_INVALID');
  assert.equal(calls, 0);
  assert.doesNotMatch(JSON.stringify(report), /not normalized JSON|DataCloneError/);
});

test('the wrong genesis stops the verifier before any status or receipt lookup', async () => {
  let calls = 0;
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture,
    rpcUrl,
    fetchImpl: async () => {
      calls += 1;
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: 'not-devnet' });
    }
  });
  assertRejected(report, 'RPC_WRONG_CLUSTER');
  assert.equal(calls, 1);
});

test('unsupported or credential-bearing URLs fail without network access or leaked values', async () => {
  for (const unsafeUrl of [
    'http://example.invalid/devnet',
    'file:///private/example',
    'https://user:fixture-secret@example.invalid/devnet',
    'https://example.invalid/devnet#fixture-secret',
    'not a URL',
    123
  ]) {
    let calls = 0;
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture,
      rpcUrl: unsafeUrl,
      fetchImpl: async () => { calls += 1; throw new Error('network is forbidden'); }
    });
    assertRejected(report, 'RPC_URL_INVALID');
    assert.equal(calls, 0);
    assert.doesNotMatch(JSON.stringify(report), /fixture-secret|private\/example/);
  }
});

test('invalid timeout and response-size bounds fail before network access', async () => {
  for (const timeoutMs of [99, 30001, -1, 0, 1.5, NaN, Infinity, '5000']) {
    const report = await verifyDevnetLifecycle({ manifest: manifestFixture, rpcUrl, timeoutMs,
      fetchImpl: async () => assert.fail('network is forbidden') });
    assertRejected(report, 'RPC_TIMEOUT_INVALID');
  }
  for (const maxResponseBytes of [0, -1, 1.5, 1_000_001, NaN, Infinity, '1000']) {
    const report = await verifyDevnetLifecycle({ manifest: manifestFixture, rpcUrl, maxResponseBytes,
      fetchImpl: async () => assert.fail('network is forbidden') });
    assertRejected(report, 'RPC_RESPONSE_LIMIT_INVALID');
  }
});

test('an injected transport that follows a redirect is rejected', async () => {
  const response = jsonResponse({ jsonrpc: '2.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH });
  Object.defineProperty(response, 'redirected', { value: true });
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl, fetchImpl: async () => response
  });
  assertRejected(report, 'RPC_REDIRECT_REJECTED');
});

test('JSON-RPC envelopes must match the request ID and contain exactly result or error', async () => {
  for (const payload of [
    { jsonrpc: '2.0', id: 2, result: SOLANA_DEVNET_GENESIS_HASH },
    { jsonrpc: '1.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH },
    { jsonrpc: '2.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH, error: null },
    { jsonrpc: '2.0', id: 1 },
    { jsonrpc: '2.0', id: 1, error: { code: 'invalid' } },
    [], null
  ]) {
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture, rpcUrl, fetchImpl: async () => jsonResponse(payload)
    });
    assertRejected(report, 'RPC_INVALID_RESPONSE');
  }
});

test('a later receipt with the wrong response ID cannot be associated with the requested operation', async () => {
  const { manifest, evidence } = fixtures();
  evidence.transactionResponses[0].response.id = 4;
  const requests = [];
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl, fetchImpl: fixtureRpc(evidence, requests) });
  assertRejected(report, 'RPC_INVALID_RESPONSE');
  assert.equal(requests.length, 3);
});

test('provider errors are sanitized and never retried', async () => {
  for (const [code, expected] of [[-32015, 'RPC_UNSUPPORTED_TRANSACTION_VERSION'], [-32005, 'RPC_ERROR']]) {
    let calls = 0;
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture,
      rpcUrl: `${rpcUrl}?api-key=fixture-only-secret`,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ jsonrpc: '2.0', id: 1,
          error: { code, message: 'untrusted-provider-details', data: 'fixture-only-secret' } });
      }
    });
    assertRejected(report, expected);
    assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(report), /untrusted-provider-details|fixture-only-secret|example\.invalid/);
  }
});

test('network exceptions and HTTP failures are sanitized', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('untrusted transport error with fixture-secret'); },
    async () => new Response('private provider response', { status: 503 })
  ]) {
    const report = await verifyDevnetLifecycle({ manifest: manifestFixture, rpcUrl, fetchImpl });
    assertRejected(report, 'RPC_UNAVAILABLE');
    assert.doesNotMatch(JSON.stringify(report), /fixture-secret|private provider|transport error/);
  }
});

test('malformed JSON and invalid UTF-8 cannot become evidence', async () => {
  for (const makeResponse of [
    () => new Response('{invalid JSON'),
    () => new Response(new Uint8Array([0xff, 0xfe]))
  ]) {
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture, rpcUrl, fetchImpl: async () => makeResponse()
    });
    assertRejected(report, 'RPC_INVALID_JSON');
  }
});

test('a declared oversized response is rejected before JSON parsing', async () => {
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl, maxResponseBytes: 1024,
    fetchImpl: async () => new Response('{}', { headers: { 'content-length': '1025' } })
  });
  assertRejected(report, 'RPC_RESPONSE_TOO_LARGE');
});

test('streamed size is bounded even without a length header or with an understated header', async () => {
  for (const headers of [{}, { 'content-length': '2' }]) {
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture, rpcUrl, maxResponseBytes: 1024,
      fetchImpl: async () => new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(700));
          controller.enqueue(new Uint8Array(700));
          controller.close();
        }
      }), { headers })
    });
    assertRejected(report, 'RPC_RESPONSE_TOO_LARGE');
  }
});

test('response limits count UTF-8 bytes rather than JavaScript string length', async () => {
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl, maxResponseBytes: 500,
    fetchImpl: async () => new Response('é'.repeat(300))
  });
  assertRejected(report, 'RPC_RESPONSE_TOO_LARGE');
});

test('an endless sequence of empty stream chunks is rejected without spinning', async () => {
  let pulls = 0;
  let cancelled = false;
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture,
    rpcUrl,
    fetchImpl: async () => new Response(new ReadableStream({
      pull(controller) { pulls += 1; controller.enqueue(new Uint8Array(0)); },
      cancel() { cancelled = true; }
    }))
  });
  assertRejected(report, 'RPC_INVALID_RESPONSE');
  assert.ok(pulls < 10);
  assert.equal(cancelled, true);
});

test('excessive tiny chunks are bounded and yield to timers before the byte limit', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({
    jsonrpc: '2.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH
  }) + ' '.repeat(5000));
  let offset = 0;
  let timerRan = false;
  const timer = setTimeout(() => { timerRan = true; }, 0);
  try {
    const report = await verifyDevnetLifecycle({
      manifest: manifestFixture,
      rpcUrl,
      fetchImpl: async () => new Response(new ReadableStream({
        pull(controller) {
          if (offset === bytes.length) controller.close();
          else controller.enqueue(bytes.slice(offset, ++offset));
        }
      }))
    });
    assertRejected(report, 'RPC_RESPONSE_TOO_FRAGMENTED');
    assert.ok(offset < bytes.length);
    assert.equal(timerRan, true);
  } finally {
    clearTimeout(timer);
  }
});

test('the request deadline still holds when a faulty fetch ignores its abort signal', async () => {
  let capturedSignal;
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl, timeoutMs: 100,
    fetchImpl: async (_url, init) => {
      capturedSignal = init.signal;
      return new Promise(() => {});
    }
  });
  assertRejected(report, 'RPC_TIMEOUT');
  assert.equal(capturedSignal.aborted, true);
});

test('the same deadline covers a stalled body after HTTP headers arrive', async () => {
  let cancelled = false;
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl, timeoutMs: 100,
    fetchImpl: async () => new Response(new ReadableStream({
      start() {},
      cancel() { cancelled = true; }
    }))
  });
  assertRejected(report, 'RPC_TIMEOUT');
  assert.equal(cancelled, true);
});

test('missing stream support does not fall back to an unbounded json method', async () => {
  let jsonCalls = 0;
  const report = await verifyDevnetLifecycle({
    manifest: manifestFixture, rpcUrl,
    fetchImpl: async () => ({ ok: true, json: async () => { jsonCalls += 1; return {}; } })
  });
  assertRejected(report, 'RPC_INVALID_RESPONSE');
  assert.equal(jsonCalls, 0);
});

test('a null finalized receipt remains unproven after successful transport reads', async () => {
  const { manifest, evidence } = fixtures();
  evidence.transactionResponses[0].response.result = null;
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl, fetchImpl: fixtureRpc(evidence) });
  assert.equal(report.ok, false);
  assert.equal(report.receiptEvidenceVerified, false);
  assertNoAuthorization(report);
});

test('a returned receipt for a different signature cannot establish the requested lifecycle', async () => {
  const { manifest, evidence } = fixtures();
  evidence.transactionResponses[0].response.result.transaction.signatures[0] = '2'.repeat(64);
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl, fetchImpl: fixtureRpc(evidence) });
  assert.equal(report.ok, false);
  assert.equal(report.receiptEvidenceVerified, false);
  assertNoAuthorization(report);
});

test('a confirmed-only status cannot be promoted by a successful receipt read', async () => {
  const { manifest, evidence } = fixtures();
  evidence.statusResponse.result.value[0].confirmationStatus = 'confirmed';
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl, fetchImpl: fixtureRpc(evidence) });
  assert.equal(report.ok, false);
  assert.equal(report.receiptEvidenceVerified, false);
  assertNoAuthorization(report);
});

test('CLI defaults to offline validation and makes its limited proof scope explicit', async () => {
  const run = promisify(execFile);
  const { stdout } = await run(process.execPath, [
    new URL('../tools/verify-devnet-lifecycle.mjs', import.meta.url).pathname,
    new URL('../examples/devnet-lifecycle.example.json', import.meta.url).pathname
  ], { env: { ...process.env, COPYPUMP_DEVNET_RPC_URL: '' }, timeout: 5000 });
  const report = JSON.parse(stdout);
  assert.equal(report.code, 'DEVNET_LIFECYCLE_READ_SKIPPED');
  assert.equal(report.receiptEvidenceVerified, false);
  assertNoAuthorization(report);
});
