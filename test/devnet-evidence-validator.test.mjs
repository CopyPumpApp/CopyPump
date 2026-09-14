import test from 'node:test';
import assert from 'node:assert/strict';
import { validateEvidenceManifest } from '../tools/validate-devnet-evidence.mjs';

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
