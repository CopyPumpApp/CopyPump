import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SOLANA_DEVNET_GENESIS_HASH,
  validateEvidenceManifest,
  validateEvidenceWithOptionalRpc,
  verifyDevnetRpcIdentity
} from '../tools/validate-devnet-evidence.mjs';

const syntheticSignature = '1'.repeat(64);

function verifiedManifest() {
  return {
    schemaVersion: 1,
    network: 'solana-devnet',
    status: 'verified',
    lifecycle: [
      {
        step: 'BUY',
        evidenceType: 'onchain',
        verified: true,
        simulation: false,
        evidence: { transactionSignature: syntheticSignature }
      },
      {
        step: 'POSITION',
        evidenceType: 'application',
        verified: true,
        simulation: false,
        evidence: { source: 'public reconciliation record' }
      },
      {
        step: 'PARTIAL_SELL',
        evidenceType: 'onchain',
        verified: true,
        simulation: false,
        evidence: { transactionSignature: syntheticSignature }
      },
      {
        step: 'FULL_SELL',
        evidenceType: 'onchain',
        verified: true,
        simulation: false,
        evidence: { transactionSignature: syntheticSignature }
      }
    ]
  };
}

function jsonResponse(payload, ok = true) {
  return { ok, json: async () => payload };
}

test('accepts a complete schema-valid verified manifest', () => {
  const result = validateEvidenceManifest(verifiedManifest());
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('rejects Mainnet manifests', () => {
  const manifest = verifiedManifest();
  manifest.network = 'solana-mainnet';
  const result = validateEvidenceManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /solana-devnet/);
});

test('requires every lifecycle step', () => {
  const manifest = verifiedManifest();
  manifest.lifecycle = manifest.lifecycle.filter((step) => step.step !== 'PARTIAL_SELL');
  const result = validateEvidenceManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing required lifecycle step: PARTIAL_SELL/);
});

test('rejects sensitive-looking public fields', () => {
  const manifest = verifiedManifest();
  manifest.privateKey = 'must-never-be-public';
  const result = validateEvidenceManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /sensitive-looking field/);
});

test('verified status cannot include simulated steps', () => {
  const manifest = verifiedManifest();
  manifest.lifecycle[0].simulation = true;
  const result = validateEvidenceManifest(manifest);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /non-simulated/);
});

test('offline/default mode makes no RPC call', async () => {
  let calls = 0;
  const result = await validateEvidenceWithOptionalRpc(verifiedManifest(), {
    fetchImpl: async () => {
      calls += 1;
      throw new Error('network should not be used');
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.rpc, null);
  assert.equal(calls, 0);
});

test('accepts the Solana Devnet genesis hash', async () => {
  const requests = [];
  const result = await validateEvidenceWithOptionalRpc(verifiedManifest(), {
    rpcUrl: 'https://example.invalid/devnet',
    fetchImpl: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return jsonResponse({ jsonrpc: '2.0', id: 1, result: SOLANA_DEVNET_GENESIS_HASH });
    },
    timeoutMs: 500
  });

  assert.equal(result.ok, true);
  assert.equal(result.rpc.code, 'RPC_DEVNET_CONFIRMED');
  assert.equal(result.rpc.network, 'solana-devnet');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'getGenesisHash');
  assert.deepEqual(requests[0].params, []);
});

test('rejects an RPC endpoint on the wrong cluster', async () => {
  const result = await validateEvidenceWithOptionalRpc(verifiedManifest(), {
    rpcUrl: 'https://example.invalid/not-devnet',
    fetchImpl: async () => jsonResponse({ jsonrpc: '2.0', id: 1, result: 'not-the-devnet-genesis-hash' }),
    timeoutMs: 500
  });

  assert.equal(result.ok, false);
  assert.equal(result.rpc.code, 'RPC_WRONG_CLUSTER');
  assert.match(result.errors.join('\n'), /not Solana Devnet/);
});

test('times out an unavailable RPC without echoing the URL', async () => {
  const rpcUrl = 'https://user:secret@example.invalid/devnet?api-key=must-not-leak';
  const result = await verifyDevnetRpcIdentity({
    rpcUrl,
    timeoutMs: 100,
    fetchImpl: async (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RPC_TIMEOUT');
  assert.doesNotMatch(JSON.stringify(result), /must-not-leak|user:secret/);
});

test('handles RPC transport failure without leaking provider details', async () => {
  const result = await verifyDevnetRpcIdentity({
    rpcUrl: 'https://example.invalid/devnet',
    timeoutMs: 500,
    fetchImpl: async () => {
      throw new Error('provider token and internals must not leak');
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'RPC_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(result), /provider token|internals/);
});
