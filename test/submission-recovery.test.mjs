import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { classifySubmissionRecovery } from '../tools/classify-submission-recovery.mjs';
import { SOLANA_DEVNET_GENESIS_HASH } from '../tools/validate-devnet-evidence.mjs';

const fixture = JSON.parse(await fs.readFile(
  new URL('../examples/submission-recovery.example.json', import.meta.url), 'utf8'
));

function sample() {
  return structuredClone(fixture);
}

function assertHeld(result, kind) {
  assert.deepEqual(result, {
    kind,
    action: 'HOLD',
    reservation: 'KEEP',
    sendAuthorized: false,
    replacementAllowed: false
  });
}

function finalized(err = null) {
  return { slot: 3000, confirmationStatus: 'finalized', err };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

test('published fixture holds an expired unknown signature even after history lookup', () => {
  assert.equal(fixture.attempt.genesisHash, SOLANA_DEVNET_GENESIS_HASH);
  assert.deepEqual(classifySubmissionRecovery(fixture.attempt, fixture.observation), fixture.expected);
});

test('blockhash expiry and null never permit replacement, with or without history lookup', () => {
  for (const searchTransactionHistory of [true, false]) {
    const { attempt, observation } = sample();
    observation.searchTransactionHistory = searchTransactionHistory;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'unknown_expired');
  }
});

test('a committed-before-send checkpoint cannot establish that handoff never happened', () => {
  const { attempt, observation } = sample();
  attempt.stage = 'COMMITTED_BEFORE_SEND';
  assertHeld(classifySubmissionRecovery(attempt, observation), 'unknown_expired');
});

test('recent-blockhash expiry uses strictly greater block height, not context slot', () => {
  for (const blockHeight of [null, 1999, 2000]) {
    const { attempt, observation } = sample();
    observation.blockHeight = blockHeight;
    observation.contextSlot = 9000000;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'unknown_not_found');
  }
});

test('raising minContextSlot does not extend the blockhash lifetime', () => {
  const { attempt, observation } = sample();
  attempt.minContextSlot = 3999;
  assertHeld(classifySubmissionRecovery(attempt, observation), 'unknown_expired');
  attempt.minContextSlot = 4001;
  assertHeld(classifySubmissionRecovery(attempt, observation), 'stale_observation');
});

test('non-finalized successes and errors stay pending even after blockhash expiry', () => {
  for (const confirmationStatus of [null, 'processed', 'confirmed']) {
    for (const err of [null, 'AccountNotFound', { InstructionError: [0, 'Custom'] }]) {
      const { attempt, observation } = sample();
      observation.status = { slot: 3000, confirmationStatus, err };
      assertHeld(classifySubmissionRecovery(attempt, observation), 'pending');
    }
  }
});

test('finalized success requests accounting reconciliation but never releases or resends', () => {
  const { attempt, observation } = sample();
  observation.status = finalized();
  assert.deepEqual(classifySubmissionRecovery(attempt, observation), {
    kind: 'finalized_success',
    action: 'RECONCILE',
    reservation: 'KEEP_UNTIL_RECONCILED',
    sendAuthorized: false,
    replacementAllowed: false
  });
});

test('finalized failure retains reservation until actual fees and balances are reconciled', () => {
  for (const err of ['BlockhashNotFound', { InstructionError: [1, { Custom: 7 }] }]) {
    const { attempt, observation } = sample();
    observation.status = finalized(err);
    assert.deepEqual(classifySubmissionRecovery(attempt, observation), {
      kind: 'finalized_failure',
      action: 'RECONCILE',
      reservation: 'KEEP_UNTIL_RECONCILED',
      sendAuthorized: false,
      replacementAllowed: false
    });
  }
});

test('missing committed identity or checkpoint fields fail closed', () => {
  for (const field of Object.keys(fixture.attempt)) {
    const { attempt, observation } = sample();
    delete attempt[field];
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('matching signatures with invalid decoded widths cannot enter recovery', () => {
  for (const signature of ['1'.repeat(65), '2'.repeat(64), 'z'.repeat(88)]) {
    const { attempt, observation } = sample();
    attempt.signature = observation.signature = signature;
    observation.status = finalized();
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('an invalid-width observed signature is rejected before finalized reconciliation', () => {
  const { attempt, observation } = sample();
  observation.signature = '1'.repeat(65);
  observation.status = finalized();
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
});

test('a recent blockhash with invalid decoded width invalidates the attempt', () => {
  for (const blockhash of ['1'.repeat(33), '2'.repeat(32), 'z'.repeat(44)]) {
    const { attempt, observation } = sample();
    attempt.expiry.blockhash = blockhash;
    observation.status = finalized();
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('valid signature and blockhash width boundaries retain the reconciliation-only outcome', () => {
  for (const [signature, blockhash] of [
    ['1'.repeat(63) + '2', '1'.repeat(31) + '2'],
    ['2' + '1'.repeat(87), '2' + '1'.repeat(43)]
  ]) {
    const { attempt, observation } = sample();
    attempt.signature = observation.signature = signature;
    attempt.expiry.blockhash = blockhash;
    observation.status = finalized();
    assert.deepEqual(classifySubmissionRecovery(attempt, observation), {
      kind: 'finalized_success', action: 'RECONCILE', reservation: 'KEEP_UNTIL_RECONCILED',
      sendAuthorized: false, replacementAllowed: false
    });
  }
});

test('unsigned, uncommitted and unsupported attempt stages cannot enter recovery', () => {
  for (const stage of ['PREPARED', 'SIGNED', 'SUBMITTED', 'RETRY', '', null]) {
    const { attempt, observation } = sample();
    attempt.stage = stage;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('negative, fractional, unsafe and non-number heights or slots fail closed', () => {
  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2000', NaN, Infinity]) {
    for (const field of ['committedAtSlot', 'minContextSlot']) {
      const { attempt, observation } = sample();
      attempt[field] = invalid;
      assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
    }
    const { attempt, observation } = sample();
    attempt.expiry.lastValidBlockHeight = invalid;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('wrong network and a falsely labelled Devnet genesis are held', () => {
  const { attempt, observation } = sample();
  attempt.network = observation.network = 'solana-mainnet';
  assertHeld(classifySubmissionRecovery(attempt, observation), 'wrong_cluster');
  attempt.network = observation.network = 'solana-devnet';
  attempt.genesisHash = observation.genesisHash = 'unexpected-genesis';
  assertHeld(classifySubmissionRecovery(attempt, observation), 'wrong_cluster');
});

test('each changed provenance component is rejected before accepting terminal success', () => {
  const replacements = {
    operationId: 'different-operation',
    attemptId: 'different-attempt',
    signature: '1'.repeat(63) + '2',
    messageDigest: 'a'.repeat(64),
    network: 'solana-mainnet',
    genesisHash: 'different-genesis',
    policyRevision: 'different-policy',
    simulationRevision: 'different-simulation'
  };
  for (const [field, value] of Object.entries(replacements)) {
    const { attempt, observation } = sample();
    observation[field] = value;
    observation.status = finalized();
    assertHeld(classifySubmissionRecovery(attempt, observation), 'provenance_mismatch');
  }
});

test('missing observation fields cannot be treated as an absent transaction or success', () => {
  for (const field of Object.keys(fixture.observation)) {
    const { attempt, observation } = sample();
    delete observation[field];
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
  }
});

test('malformed status errors cannot be mistaken for finalized success', () => {
  for (const err of [undefined, false, 0, '', {}, []]) {
    const { attempt, observation } = sample();
    observation.status = finalized(err);
    // The helper default is null, so assign undefined explicitly as malformed.
    observation.status.err = err;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
  }
  const { attempt, observation } = sample();
  observation.status = finalized();
  delete observation.status.err;
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
});

test('future status slots and unknown confirmation statuses are invalid', () => {
  for (const status of [
    { slot: 4001, confirmationStatus: 'finalized', err: null },
    { slot: 3000, confirmationStatus: 'complete', err: null },
    { slot: 3000, err: null },
    { slot: -1, confirmationStatus: 'finalized', err: null }
  ]) {
    const { attempt, observation } = sample();
    observation.status = status;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
  }
});

test('observations before the committed slot or persisted high-water mark are stale', () => {
  const { attempt, observation } = sample();
  observation.contextSlot = 999;
  assertHeld(classifySubmissionRecovery(attempt, observation), 'stale_observation');
  observation.contextSlot = 4000;
  attempt.lastObservation = { contextSlot: 4001, status: null };
  assertHeld(classifySubmissionRecovery(attempt, observation), 'stale_observation');
});

test('an older receipt cannot satisfy an attempt committed at a later observed slot', () => {
  for (const confirmationStatus of ['processed', 'confirmed', 'finalized']) {
    for (const err of [null, 'AccountNotFound']) {
      const { attempt, observation } = sample();
      observation.status = { slot: 999, confirmationStatus, err };
      assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_observation');
    }
  }
});

test('a persisted checkpoint cannot smuggle an older receipt into a new attempt', () => {
  const { attempt, observation } = sample();
  attempt.lastObservation = { contextSlot: 3500, status: { ...finalized(), slot: 999 } };
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
});

test('persisted checkpoint context must meet both pinned freshness floors', () => {
  const { attempt, observation } = sample();
  attempt.lastObservation = { contextSlot: 999, status: null };
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  attempt.lastObservation.contextSlot = 2000;
  attempt.minContextSlot = 2001;
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
});

test('a receipt and checkpoint exactly at their pinned slot floors remain admissible', () => {
  const { attempt, observation } = sample();
  attempt.minContextSlot = 2000;
  observation.status = { ...finalized(), slot: attempt.committedAtSlot };
  attempt.lastObservation = {
    contextSlot: attempt.minContextSlot,
    status: { ...observation.status }
  };
  assert.equal(classifySubmissionRecovery(attempt, observation).kind, 'finalized_success');
});

test('a previous finalized outcome cannot be silently downgraded or contradicted', () => {
  for (const previous of [finalized(), finalized('AccountNotFound')]) {
    for (const status of [null,
      { slot: 3000, confirmationStatus: 'confirmed', err: previous.err },
      { slot: 3001, confirmationStatus: 'finalized', err: previous.err },
      finalized(previous.err === null ? 'AccountNotFound' : null)
    ]) {
      const { attempt, observation } = sample();
      attempt.lastObservation = { contextSlot: 3500, status: previous };
      observation.status = status;
      assertHeld(classifySubmissionRecovery(attempt, observation), 'conflicting_observation');
    }
  }
});

test('re-reading an identical finalized result remains a reconciliation request', () => {
  const { attempt, observation } = sample();
  observation.status = finalized();
  attempt.lastObservation = { contextSlot: 3500, status: finalized() };
  const once = classifySubmissionRecovery(attempt, observation);
  assert.equal(once.kind, 'finalized_success');
  attempt.lastObservation = { contextSlot: observation.contextSlot, status: observation.status };
  assert.deepEqual(classifySubmissionRecovery(attempt, observation), once);
});

test('durable-nonce lifetime is never inferred from recent-blockhash heights', () => {
  for (const status of [null, finalized(), finalized('AccountNotFound')]) {
    const { attempt, observation } = sample();
    attempt.expiry = {
      kind: 'durable-nonce',
      nonceAccount: '1'.repeat(32),
      nonceValue: '1'.repeat(31) + '2'
    };
    observation.status = status;
    observation.blockHeight = Number.MAX_SAFE_INTEGER;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'unsupported_expiry');
  }
});

test('durable-nonce account and value require exact 32-byte identities before the unsupported hold', () => {
  for (const field of ['nonceAccount', 'nonceValue']) {
    const { attempt, observation } = sample();
    attempt.expiry = {
      kind: 'durable-nonce', nonceAccount: '1'.repeat(32), nonceValue: '1'.repeat(31) + '2'
    };
    attempt.expiry[field] = '1'.repeat(33);
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('missing, unknown and malformed expiry variants cannot authorize recovery', () => {
  for (const expiry of [null, {}, { kind: 'timestamp', expiresAt: 0 },
    { kind: 'recent-blockhash', lastValidBlockHeight: 2000 },
    { kind: 'durable-nonce', nonceAccount: '1'.repeat(32) }
  ]) {
    const { attempt, observation } = sample();
    attempt.expiry = expiry;
    assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
  }
});

test('primitive inputs and lost checkpoints fail closed', () => {
  for (const value of [undefined, null, false, '', [], 1]) {
    assertHeld(classifySubmissionRecovery(value, fixture.observation), 'invalid_attempt');
    assertHeld(classifySubmissionRecovery(fixture.attempt, value), 'invalid_observation');
  }
  const { attempt, observation } = sample();
  attempt.lastObservation = { contextSlot: 3500 };
  assertHeld(classifySubmissionRecovery(attempt, observation), 'invalid_attempt');
});

test('classification is deterministic, leaves frozen records unchanged and performs no fetch', () => {
  const { attempt, observation } = deepFreeze(sample());
  const before = JSON.stringify({ attempt, observation });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network access is forbidden in this classifier'); };
  try {
    const first = classifySubmissionRecovery(attempt, observation);
    assert.deepEqual(classifySubmissionRecovery(attempt, observation), first);
    assert.equal(JSON.stringify({ attempt, observation }), before);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider error details are not echoed by the offline decision', () => {
  const { attempt, observation } = sample();
  observation.status = finalized({ ProviderText: 'untrusted-provider-details' });
  const result = classifySubmissionRecovery(attempt, observation);
  assert.equal(result.kind, 'finalized_failure');
  assert.doesNotMatch(JSON.stringify(result), /untrusted-provider-details|ProviderText/);
});
