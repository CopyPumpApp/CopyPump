import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isBase58Bytes } from './base58.mjs';
import {
  DEFAULT_RPC_TIMEOUT_MS, MAX_RPC_RESPONSE_BYTES, RpcReadError,
  readBoundedJsonRpc, requireRpcResult
} from './bounded-json-rpc.mjs';

export const REQUIRED_LIFECYCLE_STEPS = [
  'BUY',
  'POSITION',
  'PARTIAL_SELL',
  'FULL_SELL'
];

export const SOLANA_DEVNET_GENESIS_HASH = 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
export { DEFAULT_RPC_TIMEOUT_MS };

const VALID_STATUSES = new Set(['draft', 'partial', 'verified']);
const VALID_EVIDENCE_TYPES = new Set(['onchain', 'application']);
const FORBIDDEN_KEY = /(seed|mnemonic|private.?key|api.?key|secret|credential|auth.?token|access.?token|cookie)/i;

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function scanForSensitiveFields(value, location = '$', errors = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSensitiveFields(item, `${location}[${index}]`, errors));
    return errors;
  }

  if (!isObject(value)) return errors;

  for (const [key, child] of Object.entries(value)) {
    const next = `${location}.${key}`;
    if (FORBIDDEN_KEY.test(key) && child !== null && child !== '' && child !== false) {
      errors.push(`${next}: sensitive-looking field is not allowed in a public evidence manifest`);
    }
    scanForSensitiveFields(child, next, errors);
  }

  return errors;
}

export function validateEvidenceManifest(manifest) {
  const errors = [];
  const warnings = [];

  if (!isObject(manifest)) {
    return { ok: false, errors: ['manifest must be a JSON object'], warnings, verificationScope: 'MANIFEST_SCHEMA_ONLY', lifecycleVerified: false };
  }

  if (manifest.schemaVersion !== 1) {
    errors.push('schemaVersion must equal 1');
  }

  if (manifest.network !== 'solana-devnet') {
    errors.push('network must equal solana-devnet; Mainnet evidence is intentionally out of scope');
  }

  if (!VALID_STATUSES.has(manifest.status)) {
    errors.push('status must be one of: draft, partial, verified');
  }

  if (!Array.isArray(manifest.lifecycle)) {
    errors.push('lifecycle must be an array');
  } else {
    const seen = new Set();

    for (const [index, step] of manifest.lifecycle.entries()) {
      const where = `lifecycle[${index}]`;
      if (!isObject(step)) {
        errors.push(`${where} must be an object`);
        continue;
      }

      if (!REQUIRED_LIFECYCLE_STEPS.includes(step.step)) {
        errors.push(`${where}.step must be one of ${REQUIRED_LIFECYCLE_STEPS.join(', ')}`);
      } else if (seen.has(step.step)) {
        errors.push(`${where}.step duplicates ${step.step}`);
      } else {
        seen.add(step.step);
      }

      if (!VALID_EVIDENCE_TYPES.has(step.evidenceType)) {
        errors.push(`${where}.evidenceType must be onchain or application`);
      }

      if (typeof step.verified !== 'boolean') {
        errors.push(`${where}.verified must be boolean`);
      }

      if (typeof step.simulation !== 'boolean') {
        errors.push(`${where}.simulation must be boolean`);
      }

      if (!isObject(step.evidence)) {
        errors.push(`${where}.evidence must be an object`);
        continue;
      }

      if (step.evidenceType === 'onchain' && step.verified === true) {
        const signature = step.evidence.transactionSignature;
        if (!isBase58Bytes(signature, 64)) {
          errors.push(`${where}.evidence.transactionSignature must be a syntactically valid Solana signature when an on-chain step is marked verified`);
        }
      }

      if (step.evidenceType === 'application' && step.verified === true) {
        if (typeof step.evidence.source !== 'string' || step.evidence.source.trim().length < 3) {
          errors.push(`${where}.evidence.source is required when application evidence is marked verified`);
        }
      }

      if (step.verified === false && Object.keys(step.evidence).length === 0) {
        warnings.push(`${where}: no evidence attached yet`);
      }
    }

    for (const required of REQUIRED_LIFECYCLE_STEPS) {
      if (!seen.has(required)) errors.push(`missing required lifecycle step: ${required}`);
    }
  }

  if (manifest.status === 'verified' && Array.isArray(manifest.lifecycle)) {
    for (const step of manifest.lifecycle) {
      if (!isObject(step)) continue;
      if (step.verified !== true) {
        errors.push(`status=verified requires ${step.step ?? 'every lifecycle step'} to be verified`);
      }
      if (step.simulation !== false) {
        errors.push(`status=verified requires ${step.step ?? 'every lifecycle step'} to be non-simulated`);
      }
    }
  }

  scanForSensitiveFields(manifest, '$', errors);

  return { ok: errors.length === 0, errors, warnings, verificationScope: 'MANIFEST_SCHEMA_ONLY', lifecycleVerified: false };
}

export async function verifyDevnetRpcIdentity({
  rpcUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  maxResponseBytes = MAX_RPC_RESPONSE_BYTES
} = {}) {
  if (typeof rpcUrl !== 'string' || rpcUrl.trim().length === 0) {
    return { ok: false, code: 'RPC_URL_REQUIRED', error: 'Solana RPC URL is required for the optional identity check' };
  }
  try {
    const payload = await readBoundedJsonRpc({
      rpcUrl,
      request: { jsonrpc: '2.0', id: 1, method: 'getGenesisHash', params: [] },
      fetchImpl, timeoutMs, maxResponseBytes
    });
    const genesisHash = requireRpcResult(payload);
    if (typeof genesisHash !== 'string') {
      throw new RpcReadError('RPC_INVALID_RESPONSE');
    }
    if (genesisHash !== SOLANA_DEVNET_GENESIS_HASH) {
      return { ok: false, code: 'RPC_WRONG_CLUSTER', error: 'RPC endpoint is not Solana Devnet' };
    }
    return { ok: true, code: 'RPC_DEVNET_CONFIRMED', network: 'solana-devnet', genesisHash };
  } catch (error) {
    const code = error instanceof RpcReadError ? error.code : 'RPC_UNAVAILABLE';
    return { ok: false, code, error: code === 'RPC_TIMEOUT'
      ? 'Solana RPC identity check timed out'
      : 'Solana RPC identity check failed its bounded read contract' };
  }
}

export async function validateEvidenceWithOptionalRpc(manifest, options = {}) {
  const schemaResult = validateEvidenceManifest(manifest);
  const rpcUrl = options.rpcUrl;

  if (typeof rpcUrl !== 'string' || rpcUrl.trim().length === 0) {
    return { ...schemaResult, rpc: null };
  }

  const rpc = await verifyDevnetRpcIdentity(options);
  const errors = [...schemaResult.errors];
  if (!rpc.ok) errors.push(`rpc: ${rpc.error}`);

  return {
    ok: schemaResult.ok && rpc.ok,
    errors,
    warnings: [...schemaResult.warnings],
    verificationScope: 'MANIFEST_SCHEMA_ONLY',
    lifecycleVerified: false,
    rpc
  };
}

function parseCliArgs(argv) {
  const options = { inputPath: null, rpcUrl: null, timeoutMs: DEFAULT_RPC_TIMEOUT_MS };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === '--rpc-url') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--rpc-url requires a value');
      options.rpcUrl = next;
      index += 1;
      continue;
    }

    if (value === '--rpc-timeout-ms') {
      const next = argv[index + 1];
      if (!next || next.startsWith('--')) throw new Error('--rpc-timeout-ms requires a value');
      const parsed = Number(next);
      if (!Number.isInteger(parsed)) throw new Error('--rpc-timeout-ms must be an integer');
      options.timeoutMs = parsed;
      index += 1;
      continue;
    }

    if (value.startsWith('--')) throw new Error('unknown CLI option');
    if (options.inputPath !== null) throw new Error('only one manifest path is allowed');
    options.inputPath = value;
  }

  return options;
}

async function runCli() {
  let cli;
  try {
    cli = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error('Usage: node tools/validate-devnet-evidence.mjs <manifest.json> [--rpc-url <url>] [--rpc-timeout-ms <100-30000>]');
    process.exitCode = 2;
    return;
  }

  if (!cli.inputPath) {
    console.error('Usage: node tools/validate-devnet-evidence.mjs <manifest.json> [--rpc-url <url>] [--rpc-timeout-ms <100-30000>]');
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(cli.inputPath, 'utf8'));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, errors: [`unable to read JSON: ${error.message}`], warnings: [], rpc: null }, null, 2));
    process.exitCode = 2;
    return;
  }

  const result = await validateEvidenceWithOptionalRpc(manifest, {
    rpcUrl: cli.rpcUrl,
    timeoutMs: cli.timeoutMs
  });

  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await runCli();
}
