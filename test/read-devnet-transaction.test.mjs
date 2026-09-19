import test from 'node:test';
import assert from 'node:assert/strict';
import { SOLANA_DEVNET_GENESIS_HASH } from '../tools/validate-devnet-evidence.mjs';
import { readDevnetTransaction } from '../tools/read-devnet-transaction.mjs';

const syntheticSignature = '1'.repeat(64);

function jsonResponse(payload, ok = true) {
  return { ok, json: async () => payload };
}

function successfulPayload(version = 1) {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      version,
      transaction: { message: {}, signatures: [syntheticSignature] },
      meta: { err: null }
    }
  };
}

function failedPayload() {
  return {
    jsonrpc: '2.0',
    id: 2,
    result: {
      version: 1,
      transaction: { message: {}, signatures: [syntheticSignature] },
      meta: { err: { InstructionError: [0, 'Custom'] } }
    }
  };
}

function rpcForTransaction(payload, requests = []) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);

    if (body.method === 'getGenesisHash') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: SOLANA_DEVNET_GENESIS_HASH });
    }

    if (body.method === 'getTransaction') return jsonResponse(payload);
    throw new Error('unexpected RPC method');
  };
}

test('offline/default mode makes no RPC call', async () => {
  let calls = 0;
  const result = await readDevnetTransaction({
    transactionSignature: syntheticSignature,
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network should not be used');
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, 'RPC_TRANSACTION_READ_SKIPPED');
  assert.equal(result.transaction, null);
  assert.equal(calls, 0);
});

test('sends bounded Devnet getTransaction request with v1 support', async () => {
  const requests = [];
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: rpcForTransaction(successfulPayload(), requests),
    timeoutMs: 500
  });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.kind, 'transaction_succeeded');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].method, 'getGenesisHash');
  assert.equal(requests[1].method, 'getTransaction');
  assert.equal(requests[1].params[0], syntheticSignature);
  assert.equal(requests[1].params[1].maxSupportedTransactionVersion, 1);
  assert.equal(requests[1].params[1].commitment, 'confirmed');
});

test('classifies result null as not found', async () => {
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: rpcForTransaction({ jsonrpc: '2.0', id: 2, result: null }),
    timeoutMs: 500
  });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.kind, 'not_found');
});

test('rejects RPC -32015 without reflecting provider text', async () => {
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: rpcForTransaction({
      jsonrpc: '2.0',
      id: 2,
      error: { code: -32015, message: 'provider detail must not leak' }
    }),
    timeoutMs: 500
  });

  assert.equal(result.ok, false);
  assert.equal(result.transaction.kind, 'unsupported_transaction_version');
  assert.equal(result.transaction.rpcCode, -32015);
  assert.doesNotMatch(JSON.stringify(result), /provider detail/);
});

test('classifies a returned transaction with meta.err as failed', async () => {
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: rpcForTransaction(failedPayload()),
    timeoutMs: 500
  });

  assert.equal(result.ok, true);
  assert.equal(result.transaction.kind, 'transaction_failed');
});

test('fails closed on malformed transaction payload', async () => {
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: rpcForTransaction({ jsonrpc: '2.0', id: 2, result: { version: 1 } }),
    timeoutMs: 500
  });

  assert.equal(result.ok, false);
  assert.equal(result.transaction.kind, 'invalid_response');
});

test('rejects the wrong cluster before transaction lookup', async () => {
  const requests = [];
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/not-devnet',
    transactionSignature: syntheticSignature,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      requests.push(body);
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: 'not-devnet' });
    },
    timeoutMs: 500
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RPC_WRONG_CLUSTER');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'getGenesisHash');
});

test('times out transaction lookup without leaking the RPC URL', async () => {
  const rpcUrl = 'https://user:secret@example.invalid/devnet?api-key=must-not-leak';
  const result = await readDevnetTransaction({
    rpcUrl,
    transactionSignature: syntheticSignature,
    timeoutMs: 100,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'getGenesisHash') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: SOLANA_DEVNET_GENESIS_HASH });
      }

      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        }, { once: true });
      });
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RPC_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|user:secret/);
});

test('handles transaction transport failure without leaking provider details', async () => {
  const result = await readDevnetTransaction({
    rpcUrl: 'https://example.invalid/devnet',
    transactionSignature: syntheticSignature,
    timeoutMs: 500,
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.method === 'getGenesisHash') {
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: SOLANA_DEVNET_GENESIS_HASH });
      }
      throw new Error('provider token and internal endpoint must not leak');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RPC_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /provider token|internal endpoint/);
});
