import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcileDevnetLifecycle, validateLifecycleManifest } from '../tools/reconcile-devnet-lifecycle.mjs';

const example = JSON.parse(readFileSync(new URL('../examples/devnet-lifecycle.example.json', import.meta.url), 'utf8'));
const rpc = JSON.parse(readFileSync(new URL('../examples/devnet-lifecycle-rpc-fixtures.json', import.meta.url), 'utf8'));
const fresh = () => ({ manifest: structuredClone(example), evidence: structuredClone(rpc) });
const run = ({ manifest, evidence }) => reconcileDevnetLifecycle(manifest, evidence);
const tx = (f, index = 0) => f.evidence.transactionResponses[index].response.result;
const addr = (last) => '1'.repeat(31) + last;
function rejected(f, reason) {
  const result = run(f);
  assert.equal(result.ok, false);
  assert.equal(result.receiptEvidenceVerified, false);
  assert.equal(result.lifecycleVerified, false);
  assert.equal(result.sendAuthorized, false);
  assert.ok(result.errors.includes(reason), JSON.stringify(result));
}

test('synthetic finalized receipts reconcile exact deltas without accepting the product lifecycle', () => {
  const f = fresh();
  const result = run(f);
  assert.equal(result.ok, true);
  assert.equal(result.code, 'RECEIPTS_MATCH_EXPECTATIONS');
  assert.equal(result.receiptEvidenceVerified, true);
  assert.equal(result.verificationScope, 'DEVNET_TRACKED_ACCOUNT_RECEIPTS');
  for (const flag of ['lifecycleVerified', 'tradeSemanticsVerified', 'walletWideBalanceVerified', 'pnlVerified', 'sendAuthorized']) assert.equal(result[flag], false);
  assert.equal(result.operationMapping, 'CALLER_SUPPLIED');
  assert.deepEqual(result.receipts.map((r) => r.tokenDelta), ['1000000', '-400000', '-600000']);
  assert.deepEqual(result.receipts.map((r) => r.networkFeeLamports), ['5000', '5000', '5000']);
  assert.deepEqual(result.receipts.map((r) => r.version), ['legacy', 0, 1]);
  assert.equal(result.receipts[0].ownerLamportDelta, '-100005000');
  assert.equal(result.receipts[0].feePayerLamportDelta, '-100005000');
});

test('invalid and unknown manifest fields cannot be used as stronger evidence claims', () => {
  for (const value of [null, false, [], 'manifest', 1]) assert.equal(validateLifecycleManifest(value).ok, false);
  const f = fresh(); f.manifest.verified = true;
  rejected(f, 'MANIFEST_UNEXPECTED_FIELD');
  delete f.manifest.verified; f.manifest.network = 'solana-mainnet';
  rejected(f, 'MANIFEST_DEVNET_SCHEMA_REQUIRED');
});

test('account identities require exact decoded public-key width and distinct roles', () => {
  for (const owner of ['2'.repeat(32), '1'.repeat(33), 'z'.repeat(44)]) {
    const f = fresh(); f.manifest.owner = owner;
    rejected(f, 'MANIFEST_ACCOUNT_IDENTITY_INVALID');
  }
  const f = fresh();
  f.manifest.owner = f.manifest.positionTokenAccount;
  rejected(f, 'MANIFEST_ACCOUNT_IDENTITY_INVALID');
});

test('trade signature byte width is checked, not just its printable alphabet', () => {
  for (const signature of ['2'.repeat(64), '1'.repeat(65), 'z'.repeat(88)]) {
    const f = fresh(); f.manifest.trades[0].transactionSignature = signature;
    rejected(f, 'BUY_IDENTITY_INVALID');
  }
});

test('each trade needs a different operation and signature', () => {
  const f = fresh(); f.manifest.trades[1].transactionSignature = f.manifest.trades[0].transactionSignature;
  rejected(f, 'TRADE_IDENTITIES_MUST_BE_DISTINCT');
  f.manifest.trades[1].transactionSignature = example.trades[1].transactionSignature;
  f.manifest.trades[1].operationId = f.manifest.trades[0].operationId;
  rejected(f, 'TRADE_IDENTITIES_MUST_BE_DISTINCT');
});

test('all three trade steps must be present in their explicit order', () => {
  const f = fresh(); f.manifest.trades.reverse(); rejected(f, 'TRADE_ORDER_INVALID');
  f.manifest.trades.pop(); rejected(f, 'THREE_ORDERED_TRADES_REQUIRED');
});

test('POSITION binds to the declared BUY operation and raw post balance', () => {
  const f = fresh(); f.manifest.position.afterOperationId = 'unrelated';
  rejected(f, 'POSITION_BUY_BINDING_MISMATCH');
  f.manifest.position.afterOperationId = 'buy-1'; f.manifest.position.rawAmount = '1';
  rejected(f, 'POSITION_BUY_BINDING_MISMATCH');
});

test('expectations must describe zero to positive, partial to positive, then full to zero', () => {
  const f = fresh(); f.manifest.trades[0].expectedPreAmount = '1'; rejected(f, 'BUY_FROM_ZERO_REQUIRED');
  f.manifest.trades[0].expectedPreAmount = '0'; f.manifest.trades[1].expectedPostAmount = '0'; rejected(f, 'PARTIAL_POSITION_INVALID');
  f.manifest.trades[1].expectedPostAmount = '600000'; f.manifest.trades[2].expectedPostAmount = '1'; rejected(f, 'FULL_POSITION_INVALID');
});

test('gaps in declared token-balance continuity are rejected', () => {
  const f = fresh(); f.manifest.trades[1].expectedPreAmount = '999999'; rejected(f, 'PARTIAL_POSITION_INVALID');
  f.manifest.trades[1].expectedPreAmount = '1000000'; f.manifest.trades[2].expectedPreAmount = '599999'; rejected(f, 'FULL_POSITION_INVALID');
});

for (const value of [null, 100, '-1', '01', '1.5', '1e6', '18446744073709551616']) test('raw expected token amounts reject ' + JSON.stringify(value), () => {
  const f = fresh(); f.manifest.trades[0].expectedPostAmount = value;
  rejected(f, 'BUY_EXPECTED_AMOUNTS_INVALID');
});

test('signed lamport expectations are canonical integers, including positive and zero', () => {
  for (const value of ['-0', '+1', ' 1', 1, '-18446744073709551616']) {
    const f = fresh(); f.manifest.trades[0].expectedOwnerLamportDelta = value;
    rejected(f, 'BUY_EXPECTED_AMOUNTS_INVALID');
  }
});

test('wrong or unverified genesis cannot establish Devnet receipt evidence', () => {
  const f = fresh(); f.evidence.genesisHash = 'mainnet'; rejected(f, 'DEVNET_IDENTITY_REQUIRED');
  assert.equal(reconcileDevnetLifecycle(f.manifest, null).ok, false);
});

test('status RPC response requires an unambiguous matching envelope', () => {
  const f = fresh(); f.evidence.statusResponse.id = 1;
  rejected(f, 'STATUS_RPC_ENVELOPE_INVALID');
  f.evidence.statusResponse.id = 2; f.evidence.statusResponse.error = null;
  rejected(f, 'STATUS_RPC_ENVELOPE_INVALID');
});

test('exactly three status results and receipts are required', () => {
  const f = fresh(); f.evidence.statusResponse.result.value.pop(); rejected(f, 'THREE_STATUS_RESULTS_REQUIRED');
  f.evidence.statusResponse = structuredClone(rpc.statusResponse); f.evidence.transactionResponses.pop(); rejected(f, 'THREE_RECEIPTS_REQUIRED');
});

for (const status of [null, { slot: 100, err: null, confirmationStatus: 'confirmed' }, { slot: 100, err: null, confirmationStatus: 'processed' }, { slot: 100, confirmationStatus: 'finalized' }, { slot: 100, err: false, confirmationStatus: 'finalized' }, { slot: 100, err: { InstructionError: [0, 'Custom'] }, confirmationStatus: 'finalized' }]) test('unfinalized or unsuccessful status is not proof: ' + JSON.stringify(status), () => {
  const f = fresh(); f.evidence.statusResponse.result.value[0] = status;
  rejected(f, 'BUY_FINALIZED_SUCCESS_REQUIRED');
});

test('future status slots cannot pass via an older status context', () => {
  const f = fresh(); f.evidence.statusResponse.result.context.slot = 99;
  rejected(f, 'BUY_FINALIZED_SUCCESS_REQUIRED');
});

test('finalized request provenance cannot be replaced by confirmed', () => {
  const f = fresh(); f.evidence.transactionResponses[0].requestCommitment = 'confirmed';
  rejected(f, 'BUY_REQUEST_BINDING_MISMATCH');
});

test('returned first signature must match the independently requested transaction ID', () => {
  const f = fresh(); tx(f).transaction.signatures[0] = example.trades[1].transactionSignature;
  rejected(f, 'BUY_SIGNATURE_MISMATCH');
});

test('receipt request IDs, success envelopes and presence are checked', () => {
  const f = fresh(); f.evidence.transactionResponses[0].response.id = 4;
  rejected(f, 'BUY_RPC_ENVELOPE_INVALID');
  f.evidence.transactionResponses[0].response.id = 3;
  f.evidence.transactionResponses[0].response.result = null;
  rejected(f, 'BUY_TRANSACTION_NOT_FOUND');
});

test('transaction and status slots must agree exactly', () => {
  const f = fresh(); tx(f).slot = 99; rejected(f, 'BUY_SLOT_BINDING_MISMATCH');
});

test('equal slots and reverse chronology need additional block-order evidence', () => {
  const f = fresh(); tx(f, 1).slot = 100; f.evidence.statusResponse.result.value[1].slot = 100;
  rejected(f, 'TRANSACTION_ORDER_UNPROVEN');
  tx(f, 1).slot = 99; f.evidence.statusResponse.result.value[1].slot = 99;
  rejected(f, 'TRANSACTION_ORDER_UNPROVEN');
});

test('unsupported versions are held, never reinterpreted as legacy or v1', () => {
  for (const version of [undefined, null, '1', 2]) {
    const f = fresh(); tx(f).version = version; rejected(f, 'BUY_VERSION_UNSUPPORTED');
  }
});

test('meta success is strict and cannot be inferred from missing or falsy err', () => {
  for (const error of [undefined, false, 0, '', { InstructionError: [0, 'Custom'] }]) {
    const f = fresh(); tx(f).meta.err = error; rejected(f, 'BUY_TRANSACTION_NOT_SUCCESSFUL');
  }
});

test('empty transaction objects and parsed account-key shapes are insufficient', () => {
  const f = fresh(); tx(f).transaction.message.accountKeys = [{ pubkey: f.manifest.owner }];
  rejected(f, 'BUY_RAW_ACCOUNT_KEYS_REQUIRED');
  tx(f).transaction = {}; rejected(f, 'BUY_RAW_ACCOUNT_KEYS_REQUIRED');
});

test('v0 indexes resolve static keys, loaded writable, then loaded readonly', () => {
  const f = fresh(); const receipt = tx(f, 1);
  const program = receipt.transaction.message.accountKeys[2];
  receipt.transaction.message.accountKeys = [f.manifest.owner];
  receipt.transaction.message.header.numReadonlyUnsignedAccounts = 0;
  receipt.transaction.message.addressTableLookups = [{ accountKey: addr('5'), writableIndexes: [4], readonlyIndexes: [7] }];
  receipt.meta.loadedAddresses = { writable: [f.manifest.positionTokenAccount], readonly: [program] };
  assert.equal(run(f).ok, true);
  receipt.meta.loadedAddresses = { writable: [program], readonly: [f.manifest.positionTokenAccount] };
  rejected(f, 'PARTIAL_SELL_PRE_ACCOUNT_LIFECYCLE_EVIDENCE_REQUIRED');
});

test('missing or inconsistent v0 lookup resolution is rejected', () => {
  const f = fresh(); delete tx(f, 1).meta.loadedAddresses;
  rejected(f, 'PARTIAL_SELL_V0_LOADED_ADDRESSES_REQUIRED');
  tx(f, 1).meta.loadedAddresses = { writable: [addr('7')], readonly: [] };
  rejected(f, 'PARTIAL_SELL_LOADED_ADDRESS_COUNT_MISMATCH');
});

test('unexpected loaded accounts in legacy/v1 and duplicated effective keys are rejected', () => {
  const f = fresh(); tx(f).meta.loadedAddresses.writable = [addr('7')]; rejected(f, 'BUY_UNEXPECTED_LOADED_ADDRESSES');
  tx(f).meta.loadedAddresses.writable = [];
  tx(f).transaction.message.accountKeys[2] = f.manifest.owner;
  rejected(f, 'BUY_ACCOUNT_KEYS_INVALID');
});

test('the declared owner and token account must actually be present in the receipt', () => {
  const f = fresh(); tx(f).transaction.message.accountKeys[1] = addr('7');
  rejected(f, 'BUY_EXPECTED_ACCOUNT_ABSENT');
});

for (const field of ['owner', 'mint', 'programId']) test('token ' + field + ' cannot change or be missing across balances', () => {
  const f = fresh(); tx(f).meta.postTokenBalances[0][field] = addr('7');
  rejected(f, 'BUY_POST_TOKEN_IDENTITY_MISMATCH');
  delete tx(f).meta.postTokenBalances[0][field];
  rejected(f, 'BUY_POST_TOKEN_IDENTITY_MISMATCH');
});

test('missing token arrays are unavailable evidence, never zero balances', () => {
  const f = fresh(); delete tx(f).meta.preTokenBalances; rejected(f, 'BUY_PRE_TOKEN_BALANCES_REQUIRED');
});

test('creation and closure need explicit evidence; a missing side cannot become zero', () => {
  const f = fresh(); tx(f).meta.preTokenBalances = [];
  tx(f).meta.preBalances[1] = 0;
  rejected(f, 'BUY_PRE_ACCOUNT_LIFECYCLE_EVIDENCE_REQUIRED');
  f.evidence = structuredClone(rpc); tx(f, 2).meta.postTokenBalances = [];
  tx(f, 2).meta.postBalances[1] = 0;
  rejected(f, 'FULL_SELL_POST_ACCOUNT_LIFECYCLE_EVIDENCE_REQUIRED');
});

test('duplicate, negative, fractional and out-of-range token balance indices are rejected', () => {
  const f = fresh(); tx(f).meta.preTokenBalances.push(structuredClone(tx(f).meta.preTokenBalances[0]));
  rejected(f, 'BUY_PRE_TOKEN_BALANCE_INDEX_INVALID');
  tx(f).meta.preTokenBalances.pop();
  for (const value of [-1, 0.5, 3, '1']) {
    tx(f).meta.preTokenBalances[0].accountIndex = value;
    rejected(f, 'BUY_PRE_TOKEN_BALANCE_INDEX_INVALID');
  }
});

test('raw token amount and decimals govern accounting, never uiAmount', () => {
  const f = fresh(); tx(f).meta.postTokenBalances[0].uiTokenAmount.uiAmount = 999999999;
  assert.equal(run(f).ok, true);
  tx(f).meta.postTokenBalances[0].uiTokenAmount.decimals = 9;
  rejected(f, 'BUY_POST_TOKEN_AMOUNT_INVALID');
  tx(f).meta.postTokenBalances[0].uiTokenAmount.decimals = 6;
  tx(f).meta.postTokenBalances[0].uiTokenAmount.amount = '1000001';
  rejected(f, 'BUY_TOKEN_EXPECTATION_MISMATCH');
});

test('raw token strings preserve quantities above JavaScript safe integer', () => {
  const f = fresh();
  f.manifest.trades[0].expectedPostAmount = '9007199254740993';
  f.manifest.trades[1].expectedPreAmount = '9007199254740993';
  f.manifest.position.rawAmount = '9007199254740993';
  tx(f).meta.postTokenBalances[0].uiTokenAmount.amount = '9007199254740993';
  tx(f, 1).meta.preTokenBalances[0].uiTokenAmount.amount = '9007199254740993';
  assert.equal(run(f).ok, true);
  assert.equal(run(f).receipts[0].tokenDelta, '9007199254740993');
});

test('unsafe or malformed numeric RPC lamports cannot be recovered by string conversion', () => {
  for (const value of [Number.MAX_SAFE_INTEGER + 1, '5000', -1, 1.5, null]) {
    const f = fresh(); tx(f).meta.fee = value; rejected(f, 'BUY_EXACT_LAMPORTS_REQUIRED');
  }
  const f = fresh(); tx(f).meta.preBalances[0] = Number.MAX_SAFE_INTEGER + 1;
  rejected(f, 'BUY_EXACT_LAMPORTS_REQUIRED');
});

test('native balance arrays must align with effective account keys', () => {
  const f = fresh(); tx(f).meta.postBalances.pop(); rejected(f, 'BUY_EXACT_LAMPORTS_REQUIRED');
});

test('observed network fees and owner net movement must match the supplied account record', () => {
  const f = fresh(); tx(f).meta.fee = 5001; rejected(f, 'BUY_FEE_EXPECTATION_MISMATCH');
  tx(f).meta.fee = 5000; tx(f).meta.postBalances[0] += 1;
  rejected(f, 'BUY_LAMPORT_EXPECTATION_MISMATCH');
});

test('fee sponsorship keeps owner and fee payer deltas separate', () => {
  const f = fresh(); const receipt = tx(f);
  receipt.transaction.message.accountKeys = [addr('7'), f.manifest.positionTokenAccount, receipt.transaction.message.accountKeys[2], f.manifest.owner];
  receipt.transaction.message.header.numReadonlyUnsignedAccounts = 0;
  const before = receipt.meta.preBalances[0]; const after = receipt.meta.postBalances[0];
  receipt.meta.preBalances = [1000000, 2039280, 1, before];
  receipt.meta.postBalances = [995000, 2039280, 1, after];
  const result = run(f);
  assert.equal(result.ok, true);
  assert.equal(result.receipts[0].feePayer, addr('7'));
  assert.equal(result.receipts[0].feePayerLamportDelta, '-5000');
  assert.equal(result.receipts[0].ownerLamportDelta, '-100005000');
  assert.equal(result.pnlVerified, false);
});

test('v1 receipts require their actual RPC config shape and omit address lookups', () => {
  const f = fresh(); const message = tx(f, 2).transaction.message;
  delete message.transactionConfig; rejected(f, 'FULL_SELL_V1_MESSAGE_SHAPE_INVALID');
  message.transactionConfig = { priorityFee: null, computeUnitLimit: 200000, loadedAccountsDataSizeLimit: 65536, heapSize: null };
  assert.equal(run(f).ok, true);
  message.addressTableLookups = []; rejected(f, 'FULL_SELL_V1_MESSAGE_SHAPE_INVALID');
  delete message.addressTableLookups;
  delete message.transactionConfig.heapSize; rejected(f, 'FULL_SELL_V1_MESSAGE_SHAPE_INVALID');
});

test('legacy and v0 cannot carry v1 config under a mismatched version label', () => {
  for (const index of [0, 1]) {
    const f = fresh(); tx(f, index).transaction.message.transactionConfig = null;
    rejected(f, example.trades[index].step + '_UNEXPECTED_TRANSACTION_CONFIG');
  }
});

test('v1 config integer shape is bounded without reusing sender policy', () => {
  const f = fresh(); const config = tx(f, 2).transaction.message.transactionConfig;
  config.computeUnitLimit = '200000'; rejected(f, 'FULL_SELL_V1_MESSAGE_SHAPE_INVALID');
  config.computeUnitLimit = 200000; config.priorityFee = Number.MAX_SAFE_INTEGER + 1;
  rejected(f, 'FULL_SELL_V1_MESSAGE_SHAPE_INVALID');
});

test('header counts must describe the returned signatures and account partitions', () => {
  const f = fresh(); const message = tx(f).transaction.message;
  delete message.header; rejected(f, 'BUY_MESSAGE_HEADER_INVALID');
  for (const header of [
    { numRequiredSignatures: 0, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 },
    { numRequiredSignatures: 2, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 1 },
    { numRequiredSignatures: 1, numReadonlySignedAccounts: 1, numReadonlyUnsignedAccounts: 1 },
    { numRequiredSignatures: 1, numReadonlySignedAccounts: 0, numReadonlyUnsignedAccounts: 3 }
  ]) { message.header = header; rejected(f, 'BUY_MESSAGE_HEADER_INVALID'); }
});

test('a tracked token account cannot change while declared readonly', () => {
  const f = fresh(); tx(f).transaction.message.header.numReadonlyUnsignedAccounts = 2;
  rejected(f, 'BUY_CHANGED_ACCOUNT_READONLY');
});

test('a sponsored owner account cannot change native balance while readonly', () => {
  const f = fresh(); const receipt = tx(f);
  receipt.transaction.message.accountKeys.push(f.manifest.owner);
  receipt.transaction.message.accountKeys[0] = addr('7');
  receipt.meta.preBalances.push(receipt.meta.preBalances[0]);
  receipt.meta.postBalances.push(receipt.meta.postBalances[0]);
  receipt.meta.preBalances[0] = 1000000; receipt.meta.postBalances[0] = 995000;
  rejected(f, 'BUY_CHANGED_ACCOUNT_READONLY');
});

test('tracked token-account lamports must be exact and positive on both sides', () => {
  const f = fresh(); tx(f).meta.postBalances[1] = null;
  rejected(f, 'BUY_EXACT_LAMPORTS_REQUIRED');
  tx(f).meta.postBalances[1] = 0; rejected(f, 'BUY_OPEN_TOKEN_ACCOUNT_REQUIRED');
  tx(f).meta.postBalances[1] = 2039280; tx(f).meta.preBalances[1] = 0;
  rejected(f, 'BUY_OPEN_TOKEN_ACCOUNT_REQUIRED');
});

test('finalized status requires explicit rooted confirmation metadata', () => {
  for (const confirmations of [0, 1, undefined, 'null']) {
    const f = fresh(); f.evidence.statusResponse.result.value[0].confirmations = confirmations;
    rejected(f, 'BUY_FINALIZED_SUCCESS_REQUIRED');
  }
});

test('other owned token accounts do not become wallet-wide zero proof', () => {
  const f = fresh(); const receipt = tx(f, 2);
  receipt.transaction.message.accountKeys.push(addr('7'));
  receipt.meta.preBalances.push(2039280); receipt.meta.postBalances.push(2039280);
  for (const key of ['preTokenBalances', 'postTokenBalances']) receipt.meta[key].push({ ...structuredClone(receipt.meta[key][0]), accountIndex: 3, uiTokenAmount: { amount: '100', decimals: 6 } });
  const result = run(f); assert.equal(result.ok, true); assert.equal(result.walletWideBalanceVerified, false);
});

test('pure reconciliation is deterministic, leaves inputs unchanged and sanitizes provider errors', () => {
  const f = fresh(); const snapshot = structuredClone(f);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('network forbidden'); };
  try {
    assert.deepEqual(run(f), run(f)); assert.deepEqual(f, snapshot);
    f.evidence.transactionResponses[0].response.error = { code: -1, message: 'PRIVATE_PROVIDER_DETAIL' };
    rejected(f, 'BUY_RPC_ENVELOPE_INVALID');
    assert.equal(JSON.stringify(run(f)).includes('PRIVATE_PROVIDER_DETAIL'), false);
  } finally { globalThis.fetch = originalFetch; }
});
