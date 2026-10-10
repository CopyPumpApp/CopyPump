// Offline public review model. No signing, submission, storage, RPC or clock.
import { isBase58Bytes } from './base58.mjs';

// This constant matches the repository's read-only Devnet identity gate.
const DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const MESSAGE_DIGEST = /^[a-f0-9]{64}$/;
const STAGES = new Set(['COMMITTED_BEFORE_SEND', 'SUBMISSION_UNKNOWN']);
const CONFIRMATION_STATUSES = new Set([null, 'processed', 'confirmed', 'finalized']);
const BINDING_FIELDS = [
  'operationId', 'attemptId', 'signature', 'messageDigest',
  'network', 'genesisHash', 'policyRevision', 'simulationRevision'
];

function isRecord(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isSlotOrHeight(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isLabel(value) {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function validBinding(value) {
  return BINDING_FIELDS.every((field) => isLabel(value[field]))
    && isBase58Bytes(value.signature, 64)
    && MESSAGE_DIGEST.test(value.messageDigest);
}

function validError(error) {
  if (error === null) return true;
  if (typeof error === 'string') return isLabel(error);
  if (!isRecord(error) || Object.keys(error).length === 0) return false;
  try {
    // Inputs are normalized JSON, not arbitrary RPC objects or exception objects.
    JSON.stringify(error);
    return true;
  } catch {
    return false;
  }
}

function validStatus(status, contextSlot, committedAtSlot) {
  if (status === null) return true;
  return isRecord(status)
    && isSlotOrHeight(status.slot)
    && status.slot >= committedAtSlot
    && status.slot <= contextSlot
    && CONFIRMATION_STATUSES.has(status.confirmationStatus)
    && Object.hasOwn(status, 'err')
    && validError(status.err);
}

function validCheckpoint(checkpoint, attempt) {
  return checkpoint === null || (isRecord(checkpoint)
    && isSlotOrHeight(checkpoint.contextSlot)
    && checkpoint.contextSlot >= Math.max(attempt.committedAtSlot, attempt.minContextSlot)
    && validStatus(checkpoint.status, checkpoint.contextSlot, attempt.committedAtSlot));
}

function validExpiry(expiry) {
  if (!isRecord(expiry)) return false;
  if (expiry.kind === 'recent-blockhash') {
    return isBase58Bytes(expiry.blockhash, 32)
      && isSlotOrHeight(expiry.lastValidBlockHeight);
  }
  if (expiry.kind === 'durable-nonce') {
    return isBase58Bytes(expiry.nonceAccount, 32)
      && isBase58Bytes(expiry.nonceValue, 32);
  }
  return false;
}

function decision(kind, finalized = false) {
  return {
    kind,
    action: finalized ? 'RECONCILE' : 'HOLD',
    reservation: finalized ? 'KEEP_UNTIL_RECONCILED' : 'KEEP',
    sendAuthorized: false,
    replacementAllowed: false
  };
}

function conflictsWithFinalized(previous, current) {
  if (previous?.confirmationStatus !== 'finalized') return false;
  return current === null
    || current.confirmationStatus !== 'finalized'
    || current.slot !== previous.slot
    || JSON.stringify(current.err) !== JSON.stringify(previous.err);
}

/**
 * Classify an injected status observation for one durably committed attempt.
 *
 * Both accepted stages mean the record was committed before possible transport
 * handoff. COMMITTED_BEFORE_SEND does NOT prove it stayed unsent: a process can
 * crash after sending but before persisting a later stage. The caller must load
 * the original record (including lastObservation) without resetting checkpoints.
 * committedAtSlot is the trusted observed slot floor captured before possible
 * handoff, not a local wall-clock timestamp. Earlier receipts cannot satisfy
 * this attempt, and checkpoints must respect both pinned freshness floors.
 *
 * Observation binding fields are trusted adapter provenance, not fields supplied
 * by getSignatureStatuses. Equality checks do not authenticate an RPC provider,
 * verify signatures, validate message bytes or prove a durable storage commit.
 * The adapter must associate the request and response with the pinned attempt
 * and verified Devnet identity before calling this function.
 *
 * status follows a normalized getSignatureStatuses item: null, or
 * { slot, confirmationStatus: null|'processed'|'confirmed'|'finalized', err }.
 * blockHeight is null or an injected observed height, never a context slot.
 * searchTransactionHistory records whether history lookup was requested; even
 * true does not turn a null result into proof of non-execution.
 *
 * A finalized result only requests balance/fee reconciliation. This model never
 * releases a reservation, creates a replacement or authorizes any submission.
 * Durable-nonce recovery intentionally remains unsupported and always holds.
 *
 * Sources: https://solana.com/docs/rpc/http/getsignaturestatuses
 * https://solana.com/developers/cookbook/transactions/confirmation
 * https://solana.com/docs/core/transactions/durable-nonces
 */
export function classifySubmissionRecovery(attempt, observation) {
  if (!isRecord(attempt)
    || attempt.schemaVersion !== 1
    || !validBinding(attempt)
    || !STAGES.has(attempt.stage)
    || !isSlotOrHeight(attempt.committedAtSlot)
    || !isSlotOrHeight(attempt.minContextSlot)
    || !validExpiry(attempt.expiry)
    || !validCheckpoint(attempt.lastObservation, attempt)) {
    return decision('invalid_attempt');
  }

  if (attempt.network !== 'solana-devnet' || attempt.genesisHash !== DEVNET_GENESIS_HASH) {
    return decision('wrong_cluster');
  }

  if (!isRecord(observation)
    || !validBinding(observation)
    || !isSlotOrHeight(observation.contextSlot)
    || !validStatus(observation.status, observation.contextSlot, attempt.committedAtSlot)
    || !(observation.blockHeight === null || isSlotOrHeight(observation.blockHeight))
    || typeof observation.searchTransactionHistory !== 'boolean') {
    return decision('invalid_observation');
  }

  if (BINDING_FIELDS.some((field) => attempt[field] !== observation[field])) {
    return decision('provenance_mismatch');
  }

  // minContextSlot is only a freshness floor. It never extends transaction TTL.
  const minimumContextSlot = Math.max(
    attempt.committedAtSlot,
    attempt.minContextSlot,
    attempt.lastObservation?.contextSlot ?? 0
  );
  if (observation.contextSlot < minimumContextSlot) {
    return decision('stale_observation');
  }

  if (conflictsWithFinalized(attempt.lastObservation?.status, observation.status)) {
    return decision('conflicting_observation');
  }

  // Never apply recent-blockhash height expiry to a durable nonce.
  if (attempt.expiry.kind === 'durable-nonce') {
    return decision('unsupported_expiry');
  }

  if (observation.status?.confirmationStatus === 'finalized') {
    return decision(observation.status.err === null ? 'finalized_success' : 'finalized_failure', true);
  }

  if (observation.status !== null) return decision('pending');

  // Expiry prevents future recent-blockhash acceptance; it cannot prove that
  // this signature did not land earlier. Null can reflect cache/history gaps.
  if (observation.blockHeight !== null
    && observation.blockHeight > attempt.expiry.lastValidBlockHeight) {
    return decision('unknown_expired');
  }
  return decision('unknown_not_found');
}
