// Pure reconciliation of supplied public RPC receipts. No wallet, network or I/O.
// RPC trust and unproved trade/accounting claims are explicit in
// docs/DEVNET_LIFECYCLE_VERIFICATION.md. This is not milestone acceptance.
import { isBase58Bytes } from './base58.mjs';

export const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export const CLASSIC_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const LIFECYCLE_RECEIPT_SCOPE = 'DEVNET_TRACKED_ACCOUNT_RECEIPTS';
const STEPS = ['BUY', 'PARTIAL_SELL', 'FULL_SELL'];
const U64_MAX = (1n << 64n) - 1n;
const MAX_ACCOUNTS = 256;
const own = (value, key) => Object.hasOwn(value, key);
const uint = (value, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= max;
const label = (value) => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value);

function object(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function amount(value, signed = false) {
  if (typeof value !== 'string' || !(signed ? /^(0|-?[1-9][0-9]{0,19})$/ : /^(0|[1-9][0-9]{0,19})$/).test(value)) return null;
  const parsed = BigInt(value);
  return parsed >= (signed ? -U64_MAX : 0n) && parsed <= U64_MAX ? parsed : null;
}

function shape(value, fields, prefix, errors) {
  if (!object(value)) { errors.push(prefix + '_REQUIRED'); return {}; }
  if (Object.keys(value).some((key) => !fields.includes(key))) errors.push(prefix + '_UNEXPECTED_FIELD');
  return value;
}

/** Validate the small expected-account contract, not a declaration of execution. */
export function validateLifecycleManifest(manifest) {
  const errors = [];
  const m = shape(manifest, ['schemaVersion', 'network', 'owner', 'positionMint', 'positionTokenAccount', 'decimals', 'position', 'trades'], 'MANIFEST', errors);
  if (m.schemaVersion !== 1 || m.network !== 'solana-devnet') errors.push('MANIFEST_DEVNET_SCHEMA_REQUIRED');
  if (![m.owner, m.positionMint, m.positionTokenAccount].every((key) => isBase58Bytes(key, 32)) || new Set([m.owner, m.positionMint, m.positionTokenAccount]).size !== 3) errors.push('MANIFEST_ACCOUNT_IDENTITY_INVALID');
  if (!uint(m.decimals, 255)) errors.push('MANIFEST_DECIMALS_INVALID');
  const position = shape(m.position, ['afterOperationId', 'rawAmount'], 'POSITION', errors);
  if (!label(position.afterOperationId) || amount(position.rawAmount) === null) errors.push('POSITION_BINDING_INVALID');
  if (!Array.isArray(m.trades) || m.trades.length !== 3) {
    errors.push('THREE_ORDERED_TRADES_REQUIRED');
    return { ok: false, errors: [...new Set(errors)] };
  }

  const trades = m.trades.map((value, index) => {
    const step = STEPS[index];
    const trade = shape(value, ['step', 'operationId', 'transactionSignature', 'expectedPreAmount', 'expectedPostAmount', 'expectedFeeLamports', 'expectedOwnerLamportDelta'], step, errors);
    if (trade.step !== step) errors.push('TRADE_ORDER_INVALID');
    if (!label(trade.operationId) || !isBase58Bytes(trade.transactionSignature, 64)) errors.push(step + '_IDENTITY_INVALID');
    if (amount(trade.expectedPreAmount) === null || amount(trade.expectedPostAmount) === null || amount(trade.expectedFeeLamports) === null || amount(trade.expectedOwnerLamportDelta, true) === null) errors.push(step + '_EXPECTED_AMOUNTS_INVALID');
    return trade;
  });
  if (new Set(trades.map((trade) => trade.operationId)).size !== 3 || new Set(trades.map((trade) => trade.transactionSignature)).size !== 3) errors.push('TRADE_IDENTITIES_MUST_BE_DISTINCT');
  const [buy, partial, full] = trades;
  if (position.afterOperationId !== buy.operationId || position.rawAmount !== buy.expectedPostAmount) errors.push('POSITION_BUY_BINDING_MISMATCH');
  const numbers = trades.map((trade) => [amount(trade.expectedPreAmount), amount(trade.expectedPostAmount)]);
  if (numbers.every((pair) => pair.every((value) => value !== null))) {
    const [[beforeBuy, afterBuy], [beforePartial, afterPartial], [beforeFull, afterFull]] = numbers;
    if (beforeBuy !== 0n || afterBuy <= 0n) errors.push('BUY_FROM_ZERO_REQUIRED');
    if (beforePartial !== afterBuy || afterPartial <= 0n || afterPartial >= beforePartial) errors.push('PARTIAL_POSITION_INVALID');
    if (beforeFull !== afterPartial || beforeFull <= 0n || afterFull !== 0n) errors.push('FULL_POSITION_INVALID');
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function report(errors, receipts = []) {
  const unique = [...new Set(errors)];
  return {
    ok: unique.length === 0,
    code: unique.length === 0 ? 'RECEIPTS_MATCH_EXPECTATIONS' : 'LIFECYCLE_EVIDENCE_REJECTED',
    verificationScope: LIFECYCLE_RECEIPT_SCOPE,
    receiptEvidenceVerified: unique.length === 0,
    lifecycleVerified: false,
    sendAuthorized: false,
    tradeSemanticsVerified: false,
    operationMapping: 'CALLER_SUPPLIED',
    walletWideBalanceVerified: false,
    pnlVerified: false,
    errors: unique,
    receipts
  };
}

function envelope(payload, id, prefix, errors) {
  if (!object(payload) || payload.jsonrpc !== '2.0' || payload.id !== id || own(payload, 'error') || !own(payload, 'result')) {
    errors.push(prefix + '_RPC_ENVELOPE_INVALID');
    return undefined;
  }
  return payload.result;
}

function accountKeys(transaction, meta, version, prefix, errors) {
  const message = transaction.message;
  if (!object(message) || !Array.isArray(message.accountKeys) || message.accountKeys.length === 0 || message.accountKeys.length > MAX_ACCOUNTS || !message.accountKeys.every((key) => isBase58Bytes(key, 32))) {
    errors.push(prefix + '_RAW_ACCOUNT_KEYS_REQUIRED'); return null;
  }
  const header = message.header;
  const staticCount = message.accountKeys.length;
  if (!object(header) || !uint(header.numRequiredSignatures, 255) || header.numRequiredSignatures === 0 || header.numRequiredSignatures > staticCount || !uint(header.numReadonlySignedAccounts, 255) || header.numReadonlySignedAccounts >= header.numRequiredSignatures || !uint(header.numReadonlyUnsignedAccounts, 255) || header.numReadonlyUnsignedAccounts > staticCount - header.numRequiredSignatures || !Array.isArray(transaction.signatures) || transaction.signatures.length !== header.numRequiredSignatures) {
    errors.push(prefix + '_MESSAGE_HEADER_INVALID'); return null;
  }
  if (version === 1) {
    const config = message.transactionConfig;
    const fields = ['priorityFee', 'computeUnitLimit', 'loadedAccountsDataSizeLimit', 'heapSize'];
    if (!object(config) || Object.keys(config).some((key) => !fields.includes(key)) || !fields.every((key) => own(config, key) && (config[key] === null || uint(config[key], key === 'priorityFee' ? Number.MAX_SAFE_INTEGER : 4_294_967_295))) || own(message, 'addressTableLookups') || staticCount > 64) {
      errors.push(prefix + '_V1_MESSAGE_SHAPE_INVALID'); return null;
    }
  } else if (own(message, 'transactionConfig')) {
    errors.push(prefix + '_UNEXPECTED_TRANSACTION_CONFIG'); return null;
  }
  let loaded = [];
  let loadedWritableCount = 0;
  if (version === 0) {
    if (!Array.isArray(message.addressTableLookups) || !object(meta.loadedAddresses) || !Array.isArray(meta.loadedAddresses.writable) || !Array.isArray(meta.loadedAddresses.readonly)) {
      errors.push(prefix + '_V0_LOADED_ADDRESSES_REQUIRED'); return null;
    }
    let writableCount = 0;
    let readonlyCount = 0;
    if (message.addressTableLookups.length > MAX_ACCOUNTS) { errors.push(prefix + '_LOOKUPS_INVALID'); return null; }
    for (const lookup of message.addressTableLookups) {
      if (!object(lookup) || !isBase58Bytes(lookup.accountKey, 32) || !Array.isArray(lookup.writableIndexes) || !Array.isArray(lookup.readonlyIndexes) || lookup.writableIndexes.length + lookup.readonlyIndexes.length > MAX_ACCOUNTS || ![...lookup.writableIndexes, ...lookup.readonlyIndexes].every((index) => uint(index, 255)) || new Set([...lookup.writableIndexes, ...lookup.readonlyIndexes]).size !== lookup.writableIndexes.length + lookup.readonlyIndexes.length) {
        errors.push(prefix + '_LOOKUPS_INVALID'); return null;
      }
      writableCount += lookup.writableIndexes.length;
      readonlyCount += lookup.readonlyIndexes.length;
    }
    if (meta.loadedAddresses.writable.length !== writableCount || meta.loadedAddresses.readonly.length !== readonlyCount) {
      errors.push(prefix + '_LOADED_ADDRESS_COUNT_MISMATCH'); return null;
    }
    loaded = [...meta.loadedAddresses.writable, ...meta.loadedAddresses.readonly];
    loadedWritableCount = meta.loadedAddresses.writable.length;
  } else if ((message.addressTableLookups !== undefined && (!Array.isArray(message.addressTableLookups) || message.addressTableLookups.length !== 0)) || (meta.loadedAddresses !== undefined && (!object(meta.loadedAddresses) || !Array.isArray(meta.loadedAddresses.writable) || !Array.isArray(meta.loadedAddresses.readonly) || meta.loadedAddresses.writable.length !== 0 || meta.loadedAddresses.readonly.length !== 0))) {
    errors.push(prefix + '_UNEXPECTED_LOADED_ADDRESSES'); return null;
  }
  const keys = [...message.accountKeys, ...loaded];
  if (keys.length > MAX_ACCOUNTS || !loaded.every((key) => isBase58Bytes(key, 32)) || new Set(keys).size !== keys.length) {
    errors.push(prefix + '_ACCOUNT_KEYS_INVALID'); return null;
  }
  const writable = keys.map((_key, index) => index < staticCount
    ? (index < header.numRequiredSignatures
      ? index < header.numRequiredSignatures - header.numReadonlySignedAccounts
      : index < staticCount - header.numReadonlyUnsignedAccounts)
    : index < staticCount + loadedWritableCount);
  return { keys, writable };
}

function tokenAmount(entries, accountIndex, keys, manifest, prefix, errors) {
  if (!Array.isArray(entries) || entries.length > MAX_ACCOUNTS) {
    errors.push(prefix + '_TOKEN_BALANCES_REQUIRED'); return null;
  }
  const seen = new Set();
  let selected = null;
  for (const entry of entries) {
    if (!object(entry) || !uint(entry.accountIndex, keys.length - 1) || seen.has(entry.accountIndex)) {
      errors.push(prefix + '_TOKEN_BALANCE_INDEX_INVALID'); return null;
    }
    seen.add(entry.accountIndex);
    if (entry.accountIndex === accountIndex) selected = entry;
  }
  // Missing sides can describe creation/closure or missing recording. This
  // initial verifier does not decode account lifecycle instructions: never zero.
  if (!selected) { errors.push(prefix + '_ACCOUNT_LIFECYCLE_EVIDENCE_REQUIRED'); return null; }
  if (selected.owner !== manifest.owner || selected.mint !== manifest.positionMint || selected.programId !== CLASSIC_TOKEN_PROGRAM) {
    errors.push(prefix + '_TOKEN_IDENTITY_MISMATCH'); return null;
  }
  if (!object(selected.uiTokenAmount) || selected.uiTokenAmount.decimals !== manifest.decimals || amount(selected.uiTokenAmount.amount) === null) {
    errors.push(prefix + '_TOKEN_AMOUNT_INVALID'); return null;
  }
  return amount(selected.uiTokenAmount.amount);
}

function receipt(manifest, trade, entry, status, statusContextSlot, index, errors) {
  const prefix = STEPS[index];
  const startErrors = errors.length;
  if (!object(entry) || entry.transactionSignature !== trade.transactionSignature || entry.requestCommitment !== 'finalized') {
    errors.push(prefix + '_REQUEST_BINDING_MISMATCH'); return null;
  }
  const tx = envelope(entry.response, index + 3, prefix, errors);
  if (tx === null) { errors.push(prefix + '_TRANSACTION_NOT_FOUND'); return null; }
  if (!object(tx) || !object(tx.transaction) || !object(tx.meta)) {
    errors.push(prefix + '_TRANSACTION_METADATA_REQUIRED'); return null;
  }
  if (!['legacy', 0, 1].includes(tx.version)) { errors.push(prefix + '_VERSION_UNSUPPORTED'); return null; }
  if (!uint(tx.slot) || tx.slot !== status.slot || tx.slot > statusContextSlot) errors.push(prefix + '_SLOT_BINDING_MISMATCH');
  if (!Array.isArray(tx.transaction.signatures) || tx.transaction.signatures.length === 0 || tx.transaction.signatures.length > MAX_ACCOUNTS || tx.transaction.signatures[0] !== trade.transactionSignature || !tx.transaction.signatures.every((signature) => isBase58Bytes(signature, 64))) errors.push(prefix + '_SIGNATURE_MISMATCH');
  if (tx.meta.err !== null) errors.push(prefix + '_TRANSACTION_NOT_SUCCESSFUL');
  const accounts = accountKeys(tx.transaction, tx.meta, tx.version, prefix, errors);
  if (!accounts) return null;
  const { keys, writable } = accounts;
  const ownerIndex = keys.indexOf(manifest.owner);
  const tokenIndex = keys.indexOf(manifest.positionTokenAccount);
  if (ownerIndex < 0 || tokenIndex < 0) { errors.push(prefix + '_EXPECTED_ACCOUNT_ABSENT'); return null; }
  const pre = tokenAmount(tx.meta.preTokenBalances, tokenIndex, keys, manifest, prefix + '_PRE', errors);
  const post = tokenAmount(tx.meta.postTokenBalances, tokenIndex, keys, manifest, prefix + '_POST', errors);
  if (!Array.isArray(tx.meta.preBalances) || !Array.isArray(tx.meta.postBalances) || tx.meta.preBalances.length !== keys.length || tx.meta.postBalances.length !== keys.length || !uint(tx.meta.fee) || !tx.meta.preBalances.every((value) => uint(value)) || !tx.meta.postBalances.every((value) => uint(value))) {
    errors.push(prefix + '_EXACT_LAMPORTS_REQUIRED'); return null;
  }
  if (tx.meta.preBalances[tokenIndex] === 0 || tx.meta.postBalances[tokenIndex] === 0) {
    errors.push(prefix + '_OPEN_TOKEN_ACCOUNT_REQUIRED'); return null;
  }
  if (pre === null || post === null) return null;
  const fee = BigInt(tx.meta.fee);
  const ownerDelta = BigInt(tx.meta.postBalances[ownerIndex]) - BigInt(tx.meta.preBalances[ownerIndex]);
  const payerDelta = BigInt(tx.meta.postBalances[0]) - BigInt(tx.meta.preBalances[0]);
  if ((pre !== post && !writable[tokenIndex]) || (ownerDelta !== 0n && !writable[ownerIndex])) errors.push(prefix + '_CHANGED_ACCOUNT_READONLY');
  if (pre.toString() !== trade.expectedPreAmount || post.toString() !== trade.expectedPostAmount) errors.push(prefix + '_TOKEN_EXPECTATION_MISMATCH');
  if (fee.toString() !== trade.expectedFeeLamports) errors.push(prefix + '_FEE_EXPECTATION_MISMATCH');
  if (ownerDelta.toString() !== trade.expectedOwnerLamportDelta) errors.push(prefix + '_LAMPORT_EXPECTATION_MISMATCH');
  if (errors.length !== startErrors) return null;
  return {
    step: trade.step,
    operationId: trade.operationId,
    transactionSignature: trade.transactionSignature,
    slot: tx.slot,
    version: tx.version,
    tokenPreAmount: pre.toString(),
    tokenPostAmount: post.toString(),
    tokenDelta: (post - pre).toString(),
    decimals: manifest.decimals,
    ownerLamportDelta: ownerDelta.toString(),
    feePayer: keys[0],
    feePayerLamportDelta: payerDelta.toString(),
    networkFeeLamports: fee.toString()
  };
}

/**
 * Reconcile one declared, pre-existing classic SPL token account across three
 * supplied finalized receipts. Evidence may be synthetic; this pure function
 * cannot authenticate a provider, prove an opId originated in CopyPump, decode
 * swaps, establish wallet-wide holdings, or accept the full product milestone.
 */
export function reconcileDevnetLifecycle(manifest, evidence) {
  const validation = validateLifecycleManifest(manifest);
  if (!validation.ok) return report(validation.errors);
  const errors = [];
  if (!object(evidence) || evidence.genesisHash !== DEVNET_GENESIS_HASH) return report(['DEVNET_IDENTITY_REQUIRED']);
  const statuses = envelope(evidence.statusResponse, 2, 'STATUS', errors);
  if (!object(statuses) || !object(statuses.context) || !uint(statuses.context.slot) || !Array.isArray(statuses.value) || statuses.value.length !== 3) return report([...errors, 'THREE_STATUS_RESULTS_REQUIRED']);
  if (!Array.isArray(evidence.transactionResponses) || evidence.transactionResponses.length !== 3) return report([...errors, 'THREE_RECEIPTS_REQUIRED']);
  const receipts = [];
  for (let index = 0; index < 3; index += 1) {
    const status = statuses.value[index];
    if (!object(status) || status.confirmationStatus !== 'finalized' || status.confirmations !== null || status.err !== null || !uint(status.slot) || status.slot > statuses.context.slot) {
      errors.push(STEPS[index] + '_FINALIZED_SUCCESS_REQUIRED'); continue;
    }
    const normalized = receipt(manifest, manifest.trades[index], evidence.transactionResponses[index], status, statuses.context.slot, index, errors);
    if (normalized) receipts.push(normalized);
  }
  if (receipts.length === 3) {
    if (!(receipts[0].slot < receipts[1].slot && receipts[1].slot < receipts[2].slot)) errors.push('TRANSACTION_ORDER_UNPROVEN');
  } else if (errors.length === 0) errors.push('THREE_RECONCILED_RECEIPTS_REQUIRED');
  return report(errors, receipts);
}
