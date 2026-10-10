import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateSendSafety } from "../tools/validate-send-safety.mjs";

const fixture = JSON.parse(readFileSync(new URL("../examples/send-safety.example.json", import.meta.url), "utf8"));
const fresh = () => structuredClone(fixture);
const run = (f) => validateSendSafety(f.input, f.policy, { nowMs: f.nowMs });
function hold(f, reason) {
  const value = run(f);
  assert.equal(value.valid, false);
  assert.equal(value.decision, "HOLD");
  assert.equal(value.sendAuthorized, false);
  assert.ok(value.reasons.includes(reason), JSON.stringify(value));
}
function setFee(f, value) {
  f.input.transactionConfig.priorityFee = value;
  f.input.estimation.transactionConfig.priorityFee = value;
  f.input.finalSimulation.transactionConfig.priorityFee = value;
}

test("synthetic two-stage evidence is consistent, deterministic and never authorizes sending", () => {
  const f = fresh();
  const before = structuredClone(f);
  const value = run(f);
  assert.equal(value.valid, true);
  assert.equal(value.scope, "OFFLINE_POLICY_REVIEW_ONLY");
  assert.equal(value.sendAuthorized, false);
  assert.deepEqual(value.derivedLimits, { computeUnitLimit: 110000, loadedAccountsDataSizeLimit: 65536 });
  assert.deepEqual(run(f), value);
  assert.deepEqual(f, before);
});

for (const version of ["legacy", 0, "1", null]) test("does not reinterpret version " + JSON.stringify(version) + " as v1", () => {
  const f = fresh(); f.input.version = version; hold(f, "V1_REQUIRED");
});

for (const [name, value] of [["missing", undefined], ["null", null], ["zero", 0], ["negative", -1], ["fraction", 1.5], ["string", "110000"], ["NaN", NaN], ["infinity", Infinity], ["unsafe", Number.MAX_SAFE_INTEGER + 1], ["over-runtime", 1_400_001]]) test("rejects " + name + " compute limit", () => {
  const f = fresh(); f.input.transactionConfig.computeUnitLimit = value; hold(f, "CONFIG_COMPUTE_INVALID");
});

for (const value of [undefined, null, 0, -1, 1.5, "65536", NaN, Infinity, 67_108_865]) test("rejects malformed loaded-data limit " + String(value), () => {
  const f = fresh(); f.input.transactionConfig.loadedAccountsDataSizeLimit = value; hold(f, "CONFIG_DATA_INVALID");
});

test("v1 ComputeBudget instructions cannot substitute for transactionConfig", () => {
  const f = fresh(); f.input.computeBudgetInstructionCount = 1;
  delete f.input.transactionConfig.computeUnitLimit;
  hold(f, "COMPUTE_BUDGET_INSTRUCTIONS_FORBIDDEN");
});

for (const field of ["computeUnitPrice", "microLamports", "priorityFeeLamports"]) test("rejects ambiguous legacy/SDK field " + field, () => {
  const f = fresh(); f.input.transactionConfig[field] = "5000"; hold(f, "CONFIG_UNEXPECTED_FIELD");
});

for (const value of [undefined, null, 1, -1, "-1", "1.5", "1e3", "01", " 1", "18446744073709551616", Number.MAX_SAFE_INTEGER + 1]) test("rejects noncanonical or overflowing priority fee " + String(value), () => {
  const f = fresh(); setFee(f, value); hold(f, "CONFIG_PRIORITY_FEE_INVALID");
});

test("fees preserve u64 precision beyond JavaScript safe numbers", () => {
  const f = fresh(); setFee(f, "9007199254740993");
  f.policy.maxPriorityFeeLamports = "9007199254740993";
  f.policy.maxTotalFeeLamports = "18446744073709551615";
  f.input.feeEstimate.totalFeeLamports = "9007199254745993";
  assert.equal(run(f).valid, true);
});

test("absolute priority cap is inclusive and rejects one lamport over", () => {
  const f = fresh(); setFee(f, "10000"); f.input.feeEstimate.totalFeeLamports = "15000";
  assert.equal(run(f).valid, true);
  setFee(f, "10001"); hold(f, "PRIORITY_FEE_CAP_EXCEEDED");
});

test("zero fee requires an explicit rule", () => {
  const f = fresh(); setFee(f, "0"); hold(f, "ZERO_PRIORITY_FEE_FORBIDDEN");
  f.policy.allowZeroPriorityFee = true; assert.equal(run(f).valid, true);
});

test("total network fee has its own cap and cannot be below priority fee", () => {
  const f = fresh(); f.input.feeEstimate.totalFeeLamports = "20001"; hold(f, "TOTAL_FEE_CAP_EXCEEDED");
  f.input.feeEstimate.totalFeeLamports = "4999"; hold(f, "TOTAL_FEE_BELOW_PRIORITY_FEE");
});

test("default heap accepts absent, null and explicit 32KiB; overrides hold", () => {
  const f = fresh();
  for (const heap of [undefined, null, 32768]) {
    f.input.transactionConfig.heapSize = heap; assert.equal(run(f).valid, true);
  }
  for (const heap of [0, 32767, 65536, 262145, "32768"]) {
    f.input.transactionConfig.heapSize = heap; hold(f, "CONFIG_HEAP_OVERRIDE_FORBIDDEN");
  }
});

for (const section of ["estimation", "finalSimulation"]) {
  const prefix = section === "estimation" ? "ESTIMATION" : "FINAL_SIMULATION";
  test(section + " requires explicit err:null, not an absent or falsy error", () => {
    const f = fresh();
    for (const err of [undefined, false, 0, "", { InstructionError: [0, "Custom"] }]) {
      f.input[section].err = err; hold(f, prefix + "_SUCCESS_REQUIRED");
    }
  });
  test(section + " requires both measurements from the same record", () => {
    const f = fresh(); delete f.input[section].loadedAccountsDataSize; hold(f, prefix + "_MEASUREMENTS_REQUIRED");
    f.input[section].loadedAccountsDataSize = 100;
    f.input[section].unitsConsumed = null; hold(f, prefix + "_MEASUREMENTS_REQUIRED");
  });
}

test("changing approved instruction content invalidates estimation binding", () => {
  const f = fresh(); f.input.intentDigest = "c".repeat(64); hold(f, "ESTIMATION_BINDING_MISMATCH");
});

test("final simulation must preserve the intent measured during estimation", () => {
  const f = fresh(); f.input.finalSimulation.intentDigest = "c".repeat(64);
  hold(f, "FINAL_SIMULATION_INTENT_MISMATCH");
  delete f.input.finalSimulation.intentDigest;
  hold(f, "FINAL_SIMULATION_INTENT_MISMATCH");
});

test("changing final message invalidates simulation and fee evidence", () => {
  const f = fresh(); f.input.messageDigest = "c".repeat(64);
  hold(f, "FINAL_SIMULATION_BINDING_MISMATCH"); hold(f, "FEE_ESTIMATE_BINDING_MISMATCH");
});

test("budget/fee changes cannot reuse the final simulated configuration", () => {
  const f = fresh(); f.input.transactionConfig.priorityFee = "6000"; hold(f, "FINAL_CONFIG_MISMATCH");
});

test("changing blockhash cannot reuse old simulation evidence", () => {
  const f = fresh(); f.input.lifetime.blockhash = "1".repeat(31) + "2"; hold(f, "SIMULATION_BLOCKHASH_MISMATCH");
});

test("matching blockhash strings with invalid decoded widths cannot pass policy review", () => {
  for (const blockhash of ["1".repeat(33), "2".repeat(32), "z".repeat(44)]) {
    const f = fresh();
    f.input.lifetime.blockhash = f.input.estimation.blockhash = f.input.finalSimulation.blockhash = blockhash;
    hold(f, "LIFETIME_EVIDENCE_INVALID");
  }
});

test("valid blockhashes retain leading-zero bytes and support the printable upper bound", () => {
  for (const blockhash of ["1".repeat(31) + "2", "2" + "1".repeat(43)]) {
    const f = fresh();
    f.input.lifetime.blockhash = f.input.estimation.blockhash = f.input.finalSimulation.blockhash = blockhash;
    const value = run(f);
    assert.equal(value.valid, true);
    assert.equal(value.sendAuthorized, false);
  }
});

test("requires a separate final simulation after estimation", () => {
  const f = fresh(); f.input.finalSimulation.simulationId = f.input.estimation.simulationId; hold(f, "SEPARATE_FINAL_SIMULATION_REQUIRED");
  f.input.finalSimulation.simulationId = "final-1";
  f.input.finalSimulation.observedAtMs = 9999; hold(f, "FINAL_SIMULATION_PRECEDES_ESTIMATION");
});

test("final measured resources must fit final budgets", () => {
  const f = fresh(); f.input.finalSimulation.unitsConsumed = 110001; hold(f, "FINAL_RESOURCE_LIMIT_EXCEEDED");
  f.input.finalSimulation.unitsConsumed = 105000;
  f.input.finalSimulation.loadedAccountsDataSize = 65537; hold(f, "FINAL_RESOURCE_LIMIT_EXCEEDED");
});

test("provisional simulation cannot report usage beyond its own limit", () => {
  const f = fresh(); f.input.estimation.transactionConfig.computeUnitLimit = 99999; hold(f, "ESTIMATION_EXCEEDS_PROVISIONAL_LIMITS");
});

test("bounded headroom is rounded upward with integer arithmetic", () => {
  const f = fresh(); f.input.estimation.unitsConsumed = 100001;
  f.input.transactionConfig.computeUnitLimit = 110002;
  f.input.finalSimulation.transactionConfig.computeUnitLimit = 110002;
  assert.equal(run(f).valid, true);
  f.policy.maxComputeHeadroomUnits = 10000; hold(f, "COMPUTE_HEADROOM_CAP_EXCEEDED");
});

test("derived compute exceeding cap holds instead of clamping", () => {
  const f = fresh(); f.policy.maxComputeUnitLimit = 109999;
  f.input.transactionConfig.computeUnitLimit = 109999; hold(f, "DERIVED_COMPUTE_CAP_EXCEEDED");
});

test("a convenient static maximum cannot replace the derived limit", () => {
  const f = fresh(); f.input.transactionConfig.computeUnitLimit = 200000;
  f.input.finalSimulation.transactionConfig.computeUnitLimit = 200000; hold(f, "CONFIG_NOT_DERIVED_FROM_ESTIMATION");
});

for (const [measured, growth, expected] of [[32767, 0, 32768], [32768, 0, 32768], [32769, 0, 65536], [32768, 1, 65536]]) test("data page rounding for " + measured + " bytes and growth " + growth, () => {
  const f = fresh(); f.policy.dataGrowthAllowanceBytes = growth;
  f.input.estimation.loadedAccountsDataSize = measured;
  f.input.transactionConfig.loadedAccountsDataSizeLimit = expected;
  f.input.finalSimulation.transactionConfig.loadedAccountsDataSizeLimit = expected;
  f.input.finalSimulation.loadedAccountsDataSize = measured;
  assert.equal(run(f).valid, true);
  assert.equal(run(f).derivedLimits.loadedAccountsDataSizeLimit, expected);
});

test("page rounding after growth may exceed cap even though measurement fits", () => {
  const f = fresh(); f.policy.maxLoadedAccountsDataSizeLimit = 32768; hold(f, "DERIVED_DATA_CAP_EXCEEDED");
});

for (const [section, prefix] of [["estimation", "ESTIMATION"], ["finalSimulation", "FINAL_SIMULATION"], ["feeEstimate", "FEE_ESTIMATE"]]) test(section + " rejects stale, future and regressed context evidence", () => {
  const f = fresh(); f.input[section].observedAtMs = 8999; hold(f, prefix + "_STALE_OR_FUTURE");
  f.input[section].observedAtMs = 11001; hold(f, prefix + "_STALE_OR_FUTURE");
  f.input[section].observedAtMs = 10500;
  f.input[section].contextSlot = 96; hold(f, prefix + "_CONTEXT_INVALID");
  f.input[section].contextSlot = 102; hold(f, prefix + "_CONTEXT_INVALID");
});

test("slot freshness does not keep an expired blockhash alive", () => {
  const f = fresh(); f.input.current.blockHeight = 211; hold(f, "LIFETIME_EXPIRED_OR_TOO_SHORT");
});

for (const [section, prefix] of [["estimation", "ESTIMATION"], ["finalSimulation", "FINAL_SIMULATION"], ["feeEstimate", "FEE_ESTIMATE"], ["lifetime", "LIFETIME"], ["current", "CURRENT_CHAIN"]]) test(section + " requires the explicit confirmed commitment contract", () => {
  for (const commitment of [undefined, null, "processed", "finalized"]) {
    const f = fresh(); f.input[section].commitment = commitment;
    hold(f, prefix + "_COMMITMENT_INVALID");
  }
});

test("fee evidence cannot predate the paired blockhash acquisition context", () => {
  const f = fresh(); f.input.feeEstimate.contextSlot = 98;
  hold(f, "LIFETIME_CONTEXT_INVALID");
  f.input.feeEstimate.contextSlot = f.input.lifetime.contextSlot;
  assert.equal(run(f).valid, true);
});

test("height boundary observes supplied remaining-height policy", () => {
  const f = fresh(); f.input.current.blockHeight = 205; assert.equal(run(f).valid, true);
  f.input.current.blockHeight = 206; hold(f, "LIFETIME_EXPIRED_OR_TOO_SHORT");
  f.policy.minRemainingBlockHeights = 0; f.input.current.blockHeight = 210; assert.equal(run(f).valid, true);
  f.input.current.blockHeight = 211; hold(f, "LIFETIME_EXPIRED_OR_TOO_SHORT");
});

test("does not apply recent-blockhash policy to durable nonce", () => {
  const f = fresh(); f.input.lifetime.kind = "durable-nonce"; hold(f, "RECENT_BLOCKHASH_LIFETIME_REQUIRED");
});

test("wrong chain or policy revision cannot pass with otherwise valid numbers", () => {
  const f = fresh(); f.input.network = "solana-mainnet"; hold(f, "DEVNET_DOMAIN_REQUIRED");
  f.input.network = "solana-devnet"; f.input.policyRevision = "old-revision"; hold(f, "POLICY_BINDING_MISMATCH");
});

test("no implicit clock, default policy or permissive malformed-object fallback", () => {
  const f = fresh(); assert.equal(validateSendSafety(f.input, f.policy).valid, false);
  for (const value of [undefined, null, false, [], "data"]) {
    assert.equal(validateSendSafety(value, f.policy, { nowMs: f.nowMs }).valid, false);
    assert.equal(validateSendSafety(f.input, value, { nowMs: f.nowMs }).valid, false);
  }
});

test("validation uses no fetch and does not echo arbitrary provider text", () => {
  const original = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("network forbidden"); };
  try {
    const f = fresh(); assert.equal(run(f).valid, true);
    f.input.estimation.unexpected = "PRIVATE_PROVIDER_DETAIL";
    hold(f, "ESTIMATION_UNEXPECTED_FIELD");
    assert.equal(JSON.stringify(run(f)).includes("PRIVATE_PROVIDER_DETAIL"), false);
  } finally { globalThis.fetch = original; }
});
