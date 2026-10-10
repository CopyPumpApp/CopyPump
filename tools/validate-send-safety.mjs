// Public, offline consistency model for issue #9. This is not a signer or attester.
// Protocol references and the caller's trust obligations are in
// docs/SOLANA_V1_SEND_SAFETY_DRAFT.md. Policy limits have no production defaults.
import { isBase58Bytes } from './base58.mjs';

export const SEND_SAFETY_SCOPE = "OFFLINE_POLICY_REVIEW_ONLY";
export const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
export const MAX_COMPUTE_UNITS = 1_400_000;
export const MAX_LOADED_ACCOUNT_BYTES = 67_108_864;
export const ACCOUNT_DATA_PAGE_BYTES = 32_768;
export const EVIDENCE_COMMITMENT = "confirmed";
const U64_MAX = (1n << 64n) - 1n;
const DIGEST = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const uint = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= min && value <= max;
const id = (value) => typeof value === "string" && ID.test(value);
const digest = (value) => typeof value === "string" && DIGEST.test(value);

function lamports(value) {
  // Canonical decimal strings retain every u64 bit across JSON serialization.
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,19})$/.test(value)) return null;
  const parsed = BigInt(value);
  return parsed <= U64_MAX ? parsed : null;
}

function shape(value, fields, name, reasons) {
  if (!record(value)) {
    reasons.push(name + "_REQUIRED");
    return {};
  }
  if (Object.keys(value).some((key) => !fields.includes(key))) reasons.push(name + "_UNEXPECTED_FIELD");
  return value;
}

function result(reasons, derivedLimits = null) {
  const unique = [...new Set(reasons)];
  return {
    scope: SEND_SAFETY_SCOPE,
    valid: unique.length === 0,
    decision: unique.length === 0 ? "POLICY_CONSISTENT" : "HOLD",
    sendAuthorized: false,
    reasons: unique,
    derivedLimits
  };
}

function checkConfig(value, name, reasons) {
  const config = shape(value, ["computeUnitLimit", "loadedAccountsDataSizeLimit", "priorityFee", "heapSize"], name, reasons);
  if (!uint(config.computeUnitLimit, 1, MAX_COMPUTE_UNITS)) reasons.push(name + "_COMPUTE_INVALID");
  if (!uint(config.loadedAccountsDataSizeLimit, 1, MAX_LOADED_ACCOUNT_BYTES)) reasons.push(name + "_DATA_INVALID");
  if (lamports(config.priorityFee) === null) reasons.push(name + "_PRIORITY_FEE_INVALID");
  // This initial review model only admits the default heap. null is the RPC
  // representation of unset. Explicit default is equivalent; larger heaps HOLD.
  if (config.heapSize !== undefined && config.heapSize !== null && config.heapSize !== 32_768) reasons.push(name + "_HEAP_OVERRIDE_FORBIDDEN");
  return config;
}

const PROVENANCE = ["network", "genesisHash", "policyRevision", "pathId", "sourceId", "observedAtMs", "contextSlot", "commitment"];

/**
 * Check normalized, caller-supplied evidence; never construct or authorize a send.
 * Digests must be computed from actual messages by a trusted, separate adapter.
 * The caller supplies time so validation is pure, reproducible and offline.
 */
export function validateSendSafety(input, policy, { nowMs } = {}) {
  const reasons = [];
  const p = shape(policy, ["revision", "pathId", "maxComputeUnitLimit", "computeHeadroomBps", "maxComputeHeadroomUnits", "dataGrowthAllowanceBytes", "maxLoadedAccountsDataSizeLimit", "maxPriorityFeeLamports", "maxTotalFeeLamports", "allowZeroPriorityFee", "maxEvidenceAgeMs", "maxEvidenceSlotLag", "minRemainingBlockHeights"], "POLICY", reasons);
  if (!id(p.revision) || !id(p.pathId)) reasons.push("POLICY_ID_INVALID");
  if (!uint(p.maxComputeUnitLimit, 1, MAX_COMPUTE_UNITS)) reasons.push("POLICY_COMPUTE_CAP_INVALID");
  if (!uint(p.computeHeadroomBps, 0, 10_000) || !uint(p.maxComputeHeadroomUnits, 0, MAX_COMPUTE_UNITS)) reasons.push("POLICY_COMPUTE_HEADROOM_INVALID");
  if (!uint(p.dataGrowthAllowanceBytes, 0, MAX_LOADED_ACCOUNT_BYTES) || !uint(p.maxLoadedAccountsDataSizeLimit, 1, MAX_LOADED_ACCOUNT_BYTES)) reasons.push("POLICY_DATA_BOUND_INVALID");
  const priorityCap = lamports(p.maxPriorityFeeLamports);
  const totalCap = lamports(p.maxTotalFeeLamports);
  if (priorityCap === null || totalCap === null || priorityCap > totalCap) reasons.push("POLICY_FEE_CAP_INVALID");
  if (typeof p.allowZeroPriorityFee !== "boolean") reasons.push("POLICY_ZERO_FEE_RULE_REQUIRED");
  if (!uint(p.maxEvidenceAgeMs, 1) || !uint(p.maxEvidenceSlotLag) || !uint(p.minRemainingBlockHeights)) reasons.push("POLICY_FRESHNESS_INVALID");
  if (!uint(nowMs)) reasons.push("CURRENT_TIME_REQUIRED");
  if (reasons.length) return result(reasons);

  const x = shape(input, ["schemaVersion", "version", "network", "genesisHash", "policyRevision", "pathId", "intentDigest", "messageDigest", "computeBudgetInstructionCount", "transactionConfig", "estimation", "finalSimulation", "feeEstimate", "lifetime", "current"], "INPUT", reasons);
  if (x.schemaVersion !== 1) reasons.push("SCHEMA_UNSUPPORTED");
  if (x.version !== 1) reasons.push("V1_REQUIRED");
  if (x.network !== "solana-devnet" || x.genesisHash !== DEVNET_GENESIS_HASH) reasons.push("DEVNET_DOMAIN_REQUIRED");
  if (x.policyRevision !== p.revision || x.pathId !== p.pathId) reasons.push("POLICY_BINDING_MISMATCH");
  if (!digest(x.intentDigest) || !digest(x.messageDigest)) reasons.push("MESSAGE_BINDING_REQUIRED");
  // V1 treats ComputeBudget instructions as no-ops. Their absence here is a
  // conservative product rule, not a claim that Solana rejects them.
  if (x.computeBudgetInstructionCount !== 0) reasons.push("COMPUTE_BUDGET_INSTRUCTIONS_FORBIDDEN");
  const config = checkConfig(x.transactionConfig, "CONFIG", reasons);
  const priorityFee = lamports(config.priorityFee);
  if (priorityFee !== null) {
    if (priorityFee > priorityCap) reasons.push("PRIORITY_FEE_CAP_EXCEEDED");
    if (priorityFee === 0n && !p.allowZeroPriorityFee) reasons.push("ZERO_PRIORITY_FEE_FORBIDDEN");
  }

  const current = shape(x.current, ["network", "genesisHash", "sourceId", "contextSlot", "blockHeight", "observedAtMs", "commitment"], "CURRENT_CHAIN", reasons);
  if (current.network !== "solana-devnet" || current.genesisHash !== DEVNET_GENESIS_HASH || !id(current.sourceId)) reasons.push("CURRENT_CHAIN_PROVENANCE_INVALID");
  if (current.commitment !== EVIDENCE_COMMITMENT) reasons.push("CURRENT_CHAIN_COMMITMENT_INVALID");
  if (!uint(current.contextSlot) || !uint(current.blockHeight)) reasons.push("CURRENT_CHAIN_HEIGHT_INVALID");
  if (!uint(current.observedAtMs) || current.observedAtMs > nowMs || nowMs - current.observedAtMs > p.maxEvidenceAgeMs) reasons.push("CURRENT_CHAIN_STALE_OR_FUTURE");

  function evidence(value, fields, name, bindingKey, expectedDigest) {
    const e = shape(value, [...PROVENANCE, ...fields, bindingKey], name, reasons);
    if (e.network !== "solana-devnet" || e.genesisHash !== DEVNET_GENESIS_HASH || e.policyRevision !== p.revision || e.pathId !== p.pathId || !id(e.sourceId)) reasons.push(name + "_PROVENANCE_INVALID");
    if (e.commitment !== EVIDENCE_COMMITMENT) reasons.push(name + "_COMMITMENT_INVALID");
    if (!digest(e[bindingKey]) || e[bindingKey] !== expectedDigest) reasons.push(name + "_BINDING_MISMATCH");
    if (!uint(e.observedAtMs) || e.observedAtMs > nowMs || nowMs - e.observedAtMs > p.maxEvidenceAgeMs) reasons.push(name + "_STALE_OR_FUTURE");
    if (!uint(e.contextSlot) || !uint(current.contextSlot) || e.contextSlot > current.contextSlot || current.contextSlot - e.contextSlot > p.maxEvidenceSlotLag) reasons.push(name + "_CONTEXT_INVALID");
    return e;
  }

  const simulationFields = ["simulationId", "blockhash", "err", "unitsConsumed", "loadedAccountsDataSize", "transactionConfig"];
  const estimate = evidence(x.estimation, simulationFields, "ESTIMATION", "intentDigest", x.intentDigest);
  const final = evidence(x.finalSimulation, [...simulationFields, "intentDigest"], "FINAL_SIMULATION", "messageDigest", x.messageDigest);
  if (!digest(final.intentDigest) || final.intentDigest !== x.intentDigest) reasons.push("FINAL_SIMULATION_INTENT_MISMATCH");
  for (const [name, sim] of [["ESTIMATION", estimate], ["FINAL_SIMULATION", final]]) {
    if (!id(sim.simulationId)) reasons.push(name + "_ID_REQUIRED");
    if (sim.err !== null) reasons.push(name + "_SUCCESS_REQUIRED");
    if (!uint(sim.unitsConsumed, 1, MAX_COMPUTE_UNITS) || !uint(sim.loadedAccountsDataSize, 1, MAX_LOADED_ACCOUNT_BYTES)) reasons.push(name + "_MEASUREMENTS_REQUIRED");
  }
  const provisional = checkConfig(estimate.transactionConfig, "ESTIMATION_CONFIG", reasons);
  const simulatedConfig = checkConfig(final.transactionConfig, "FINAL_CONFIG", reasons);
  if (provisional.priorityFee !== config.priorityFee) reasons.push("ESTIMATION_FEE_CHANGED");
  if (estimate.unitsConsumed > provisional.computeUnitLimit || estimate.loadedAccountsDataSize > provisional.loadedAccountsDataSizeLimit) reasons.push("ESTIMATION_EXCEEDS_PROVISIONAL_LIMITS");
  if (final.simulationId === estimate.simulationId) reasons.push("SEPARATE_FINAL_SIMULATION_REQUIRED");
  if (final.contextSlot < estimate.contextSlot || final.observedAtMs < estimate.observedAtMs) reasons.push("FINAL_SIMULATION_PRECEDES_ESTIMATION");
  if (simulatedConfig.computeUnitLimit !== config.computeUnitLimit || simulatedConfig.loadedAccountsDataSizeLimit !== config.loadedAccountsDataSizeLimit || simulatedConfig.priorityFee !== config.priorityFee) reasons.push("FINAL_CONFIG_MISMATCH");
  if (final.unitsConsumed > config.computeUnitLimit || final.loadedAccountsDataSize > config.loadedAccountsDataSizeLimit) reasons.push("FINAL_RESOURCE_LIMIT_EXCEEDED");

  const fee = evidence(x.feeEstimate, ["totalFeeLamports"], "FEE_ESTIMATE", "messageDigest", x.messageDigest);
  const totalFee = lamports(fee.totalFeeLamports);
  if (totalFee === null) reasons.push("TOTAL_FEE_REQUIRED");
  else {
    if (totalFee > totalCap) reasons.push("TOTAL_FEE_CAP_EXCEEDED");
    if (priorityFee !== null && totalFee < priorityFee) reasons.push("TOTAL_FEE_BELOW_PRIORITY_FEE");
  }

  const life = shape(x.lifetime, ["kind", "blockhash", "lastValidBlockHeight", "contextSlot", "commitment"], "LIFETIME", reasons);
  if (life.kind !== "recent-blockhash") reasons.push("RECENT_BLOCKHASH_LIFETIME_REQUIRED");
  if (life.commitment !== EVIDENCE_COMMITMENT) reasons.push("LIFETIME_COMMITMENT_INVALID");
  if (!isBase58Bytes(life.blockhash, 32) || !uint(life.lastValidBlockHeight) || !uint(life.contextSlot)) reasons.push("LIFETIME_EVIDENCE_INVALID");
  if (estimate.blockhash !== life.blockhash || final.blockhash !== life.blockhash) reasons.push("SIMULATION_BLOCKHASH_MISMATCH");
  if (!uint(current.contextSlot) || life.contextSlot > current.contextSlot || estimate.contextSlot < life.contextSlot || final.contextSlot < life.contextSlot || fee.contextSlot < life.contextSlot) reasons.push("LIFETIME_CONTEXT_INVALID");
  // Block height, never slot or a wall-clock approximation, controls expiry.
  if (uint(life.lastValidBlockHeight) && uint(current.blockHeight) && life.lastValidBlockHeight - current.blockHeight < p.minRemainingBlockHeights) reasons.push("LIFETIME_EXPIRED_OR_TOO_SHORT");

  let derivedLimits = null;
  if (uint(estimate.unitsConsumed, 1, MAX_COMPUTE_UNITS) && uint(estimate.loadedAccountsDataSize, 1, MAX_LOADED_ACCOUNT_BYTES)) {
    const headroom = (BigInt(estimate.unitsConsumed) * BigInt(p.computeHeadroomBps) + 9_999n) / 10_000n;
    const compute = BigInt(estimate.unitsConsumed) + headroom;
    const growth = BigInt(estimate.loadedAccountsDataSize) + BigInt(p.dataGrowthAllowanceBytes);
    const page = BigInt(ACCOUNT_DATA_PAGE_BYTES);
    const data = ((growth + page - 1n) / page) * page;
    derivedLimits = { computeUnitLimit: Number(compute), loadedAccountsDataSizeLimit: Number(data) };
    if (headroom > BigInt(p.maxComputeHeadroomUnits)) reasons.push("COMPUTE_HEADROOM_CAP_EXCEEDED");
    if (compute > BigInt(p.maxComputeUnitLimit) || compute > BigInt(MAX_COMPUTE_UNITS)) reasons.push("DERIVED_COMPUTE_CAP_EXCEEDED");
    if (data > BigInt(p.maxLoadedAccountsDataSizeLimit) || data > BigInt(MAX_LOADED_ACCOUNT_BYTES)) reasons.push("DERIVED_DATA_CAP_EXCEEDED");
    // Do not clamp a required limit down, or inflate to a convenient maximum.
    if (config.computeUnitLimit !== derivedLimits.computeUnitLimit || config.loadedAccountsDataSizeLimit !== derivedLimits.loadedAccountsDataSizeLimit) reasons.push("CONFIG_NOT_DERIVED_FROM_ESTIMATION");
  }
  return result(reasons, derivedLimits);
}
