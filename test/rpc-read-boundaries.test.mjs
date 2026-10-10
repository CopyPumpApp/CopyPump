import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLANA_DEVNET_GENESIS_HASH, verifyDevnetRpcIdentity, validateEvidenceManifest
} from '../tools/validate-devnet-evidence.mjs';
import { readDevnetTransaction } from '../tools/read-devnet-transaction.mjs';
import { readBoundedJsonRpc } from '../tools/bounded-json-rpc.mjs';

const rpcUrl = 'https://example.invalid/devnet?api-key=fixture-only-secret';
const signature = '1'.repeat(64);
const genesis = () => ({ jsonrpc: '2.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH });
const transaction = () => ({
  jsonrpc: '2.0', id: 2,
  result: { version: 1, transaction: { signatures: [signature], message: {} }, meta: { err: null } }
});
const response = (payload) => new Response(JSON.stringify(payload));
const helpers = [
  { name: 'identity', id: 1, payload: genesis, invoke: (options) => verifyDevnetRpcIdentity(options) },
  { name: 'transaction', id: 2, payload: transaction,
    invoke: (options) => readDevnetTransaction({ transactionSignature: signature, ...options }) }
];

function callHelper(helper, fetchForTarget, options = {}) {
  let calls = 0;
  return helper.invoke({
    rpcUrl,
    fetchImpl: async (url, init) => {
      calls += 1;
      assert.ok(calls <= helper.id, 'no request is retried');
      const request = JSON.parse(init.body);
      assert.equal(init.redirect, 'error');
      assert.equal(init.credentials, 'omit');
      if (request.id !== helper.id) return response(genesis());
      return fetchForTarget({ url, init, request });
    },
    ...options
  });
}

function rejected(report, code) {
  assert.equal(report.ok, false);
  assert.equal(report.code, code);
  assert.doesNotMatch(JSON.stringify(report), /fixture-only-secret|example\.invalid|provider-private/);
  if ('transaction' in report) {
    assert.equal(report.lifecycleVerified, false);
    assert.equal(report.sendAuthorized, false);
  }
}

for (const helper of helpers) {
  test(`${helper.name}: the configured deadline bounds a fetch that ignores abort`, { timeout: 2000 }, async () => {
    let signal;
    const report = await callHelper(helper, ({ init }) => {
      signal = init.signal;
      return new Promise(() => {});
    }, { timeoutMs: 100 });
    rejected(report, 'RPC_TIMEOUT');
    assert.equal(signal.aborted, true);
  });

  test(`${helper.name}: the deadline also bounds a stalled streaming body`, { timeout: 2000 }, async () => {
    let cancelled = false;
    const report = await callHelper(helper, () => new Response(new ReadableStream({
      start() {},
      cancel() { cancelled = true; }
    })), { timeoutMs: 100 });
    rejected(report, 'RPC_TIMEOUT');
    assert.equal(cancelled, true);
  });

  test(`${helper.name}: a late fetch is cancelled without consuming its body`, { timeout: 2000 }, async () => {
    let resolveFetch;
    let readCalls = 0;
    let cancellations = 0;
    const report = await callHelper(helper, () => new Promise((resolve) => {
      resolveFetch = resolve;
    }), { timeoutMs: 100 });
    rejected(report, 'RPC_TIMEOUT');
    resolveFetch({ ok: true, body: {
      getReader() { readCalls += 1; throw new Error('late read must not start'); },
      cancel() { cancellations += 1; return Promise.resolve(); }
    } });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(readCalls, 0);
    assert.equal(cancellations, 1);
  });

  test(`${helper.name}: aborting a body is reported as timeout rather than malformed JSON`, { timeout: 2000 }, async () => {
    const report = await callHelper(helper, ({ init }) => new Response(new ReadableStream({
      start(controller) {
        init.signal.addEventListener('abort', () => controller.error(new DOMException('provider-private', 'AbortError')), { once: true });
      }
    })), { timeoutMs: 100 });
    rejected(report, 'RPC_TIMEOUT');
  });

  test(`${helper.name}: rejects mismatched and ambiguous JSON-RPC envelopes`, async () => {
    for (const mutate of [
      (p) => { p.id = 999; },
      (p) => { p.id = String(p.id); },
      (p) => { p.jsonrpc = '1.0'; },
      (p) => { p.error = null; },
      (p) => { delete p.result; },
      (p) => { delete p.result; p.error = { code: 'invalid', message: 'provider-private' }; }
    ]) {
      const payload = helper.payload();
      mutate(payload);
      rejected(await callHelper(helper, () => response(payload)), 'RPC_INVALID_RESPONSE');
    }
  });

  test(`${helper.name}: rejects redirects and an unbounded json fallback`, async () => {
    const redirected = response(helper.payload());
    Object.defineProperty(redirected, 'redirected', { value: true });
    rejected(await callHelper(helper, () => redirected), 'RPC_REDIRECT_REJECTED');
    let jsonCalls = 0;
    rejected(await callHelper(helper, () => ({ ok: true, json() { jsonCalls += 1; return helper.payload(); } })), 'RPC_INVALID_RESPONSE');
    assert.equal(jsonCalls, 0);
  });

  test(`${helper.name}: unsafe URLs and transport bounds fail before any request`, async () => {
    for (const [options, code] of [
      [{ rpcUrl: 'http://example.invalid/devnet' }, 'RPC_URL_INVALID'],
      [{ rpcUrl: 'https://user:fixture-only-secret@example.invalid/devnet' }, 'RPC_URL_INVALID'],
      [{ rpcUrl: 'https://example.invalid/devnet#fixture-only-secret' }, 'RPC_URL_INVALID'],
      [{ timeoutMs: 99 }, 'RPC_TIMEOUT_INVALID'],
      [{ timeoutMs: 30001 }, 'RPC_TIMEOUT_INVALID'],
      [{ maxResponseBytes: 1_000_001 }, 'RPC_RESPONSE_LIMIT_INVALID'],
      [{ maxResponseBytes: 0 }, 'RPC_RESPONSE_LIMIT_INVALID']
    ]) {
      const report = await helper.invoke({ rpcUrl, ...options,
        fetchImpl: async () => assert.fail('invalid options must not call fetch') });
      rejected(report, code);
    }
  });

  test(`${helper.name}: respects the byte cap at and immediately above the boundary`, async () => {
    const json = JSON.stringify(helper.payload());
    assert.ok(json.length < 1_000_000);
    const exact = json + ' '.repeat(1_000_000 - json.length);
    assert.equal((await callHelper(helper, () => new Response(exact))).ok, true);
    rejected(await callHelper(helper, () => new Response(exact + ' ')), 'RPC_RESPONSE_TOO_LARGE');
    rejected(await callHelper(helper, () => new Response('{}', { headers: { 'content-length': '513' } }), { maxResponseBytes: 512 }), 'RPC_RESPONSE_TOO_LARGE');
    rejected(await callHelper(helper, () => new Response('é'.repeat(300)), { maxResponseBytes: 512 }), 'RPC_RESPONSE_TOO_LARGE');
  });

  test(`${helper.name}: bounds chunk count and rejects empty chunks`, async () => {
    const makeChunks = (count, empty = false) => {
      let offset = 0;
      const payload = new TextEncoder().encode(JSON.stringify(helper.payload()));
      return new Response(new ReadableStream({
        pull(controller) {
          if (offset === count) controller.close();
          else controller.enqueue(offset++ === 0 ? payload : new Uint8Array(empty ? 0 : [32]));
        }
      }));
    };
    assert.equal((await callHelper(helper, () => makeChunks(4096))).ok, true);
    rejected(await callHelper(helper, () => makeChunks(4097)), 'RPC_RESPONSE_TOO_FRAGMENTED');
    rejected(await callHelper(helper, () => makeChunks(2, true)), 'RPC_INVALID_RESPONSE');
  });

  test(`${helper.name}: invalid JSON and UTF-8 never become receipt evidence`, async () => {
    for (const body of ['{invalid', new Uint8Array([0xff, 0xfe])]) {
      rejected(await callHelper(helper, () => new Response(body)), 'RPC_INVALID_JSON');
    }
  });
}

test('transaction reads reject a different receipt signature or unsupported returned version', async () => {
  for (const mutate of [
    (p) => { p.result.transaction.signatures[0] = '1'.repeat(63) + '2'; },
    (p) => { p.result.transaction.signatures = []; },
    (p) => { p.result.transaction.signatures.push('1'.repeat(65)); },
    (p) => { p.result.version = 2; },
    (p) => { p.result.version = '1'; },
    (p) => { delete p.result.version; }
  ]) {
    const payload = transaction();
    mutate(payload);
    const report = await callHelper(helpers[1], () => response(payload));
    rejected(report, 'RPC_TRANSACTION_READ_REJECTED');
    assert.equal(report.transaction.kind, 'invalid_response');
  }
});

test('transaction reads retain supported legacy/v0/v1 classification and never authorize send', async () => {
  for (const version of ['legacy', 0, 1]) {
    const payload = transaction();
    payload.result.version = version;
    const report = await callHelper(helpers[1], () => response(payload));
    assert.equal(report.ok, true);
    assert.equal(report.transaction.kind, 'transaction_succeeded');
    assert.equal(report.transaction.version, version);
    assert.equal(report.verificationScope, 'TRANSACTION_READ_CLASSIFICATION');
    assert.equal(report.lifecycleVerified, false);
    assert.equal(report.sendAuthorized, false);
  }
});

test('invalid decoded signatures stop read requests and schema-only verification', async () => {
  for (const invalid of ['1'.repeat(65), '2'.repeat(64), 'z'.repeat(88)]) {
    rejected(await readDevnetTransaction({ rpcUrl, transactionSignature: invalid,
      fetchImpl: async () => assert.fail('invalid signature must not call fetch') }), 'TRANSACTION_SIGNATURE_INVALID');
    const manifest = {
      schemaVersion: 1, network: 'solana-devnet', status: 'verified',
      lifecycle: ['BUY', 'POSITION', 'PARTIAL_SELL', 'FULL_SELL'].map((step) => ({
        step, evidenceType: 'onchain', verified: true, simulation: false,
        evidence: { transactionSignature: invalid }
      }))
    };
    const report = validateEvidenceManifest(manifest);
    assert.equal(report.ok, false);
    assert.equal(report.lifecycleVerified, false);
    assert.ok(report.errors.some((error) => error.includes('transactionSignature')));
  }
});

test('the shared transport refuses state-changing and unlisted RPC methods before fetch', async () => {
  for (const method of ['sendTransaction', 'requestAirdrop', 'simulateTransaction', 'getBlock']) {
    await assert.rejects(readBoundedJsonRpc({ rpcUrl,
      request: { jsonrpc: '2.0', id: 1, method, params: [] },
      fetchImpl: async () => assert.fail('unlisted method must not call fetch')
    }), { code: 'RPC_REQUEST_INVALID' });
  }
});

test('request serialization cannot replace an allowed read method with a custom toJSON', async () => {
  let method;
  const payload = await readBoundedJsonRpc({ rpcUrl,
    request: { jsonrpc: '2.0', id: 1, method: 'getGenesisHash', params: [],
      toJSON() { assert.fail('caller serialization must not replace the read request'); } },
    fetchImpl: async (_url, init) => {
      method = JSON.parse(init.body).method;
      return response(genesis());
    }
  });
  assert.equal(method, 'getGenesisHash');
  assert.equal(payload.result, SOLANA_DEVNET_GENESIS_HASH);
});
