import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLANA_DEVNET_GENESIS_HASH } from './validate-devnet-evidence.mjs';
import {
  validateLifecycleManifest,
  reconcileDevnetLifecycle
} from './reconcile-devnet-lifecycle.mjs';

import {
  DEFAULT_RPC_TIMEOUT_MS, MAX_RPC_RESPONSE_BYTES,
  RpcReadError, readBoundedJsonRpc, requireRpcResult
} from './bounded-json-rpc.mjs';

function result(code, ok = false, errors = [code]) {
  return {
    ok, code, errors,
    receiptEvidenceVerified: false,
    lifecycleVerified: false,
    sendAuthorized: false
  };
}

/**
 * Read at most five bounded JSON-RPC responses and reconcile one public Devnet
 * receipt package. The limit is per response, the timeout is per request and
 * includes its body, and no request is retried. Empty stream chunks and more
 * than 4096 chunks are rejected; fragmented reads yield to deadline timers.
 * This is a trusted-RPC comparison,
 * not an authenticated chain proof or a CopyPump trading-readiness claim.
 *
 * No RPC URL means offline manifest validation only. Neither offline nor online
 * results ever authorize sending or assert a complete verified lifecycle.
 */
export async function verifyDevnetLifecycle({
  manifest,
  rpcUrl,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  maxResponseBytes = MAX_RPC_RESPONSE_BYTES
} = {}) {
  let validation;
  let manifestSnapshot;
  try {
    // Pin expectations before the first await: caller mutations during RPC
    // must not alter the already validated operation/signature/account binding.
    manifestSnapshot = structuredClone(manifest);
    validation = validateLifecycleManifest(manifestSnapshot);
  } catch {
    return result('LIFECYCLE_MANIFEST_INVALID');
  }
  if (!validation.ok) return result('LIFECYCLE_MANIFEST_INVALID', false, validation.errors);

  if (rpcUrl === undefined || rpcUrl === null || (typeof rpcUrl === 'string' && rpcUrl.trim() === '')) {
    return result('DEVNET_LIFECYCLE_READ_SKIPPED', true, []);
  }
  const rpc = async (id, method, params) => {
    const payload = await readBoundedJsonRpc({
      rpcUrl, request: { jsonrpc: '2.0', id, method, params },
      fetchImpl, timeoutMs, maxResponseBytes
    });
    requireRpcResult(payload);
    return payload;
  };

  try {
    const identity = await rpc(1, 'getGenesisHash', []);
    if (typeof identity.result !== 'string') return result('RPC_INVALID_RESPONSE');
    if (identity.result !== SOLANA_DEVNET_GENESIS_HASH) return result('RPC_WRONG_CLUSTER');

    const signatures = manifestSnapshot.trades.map((trade) => trade.transactionSignature);
    const statusResponse = await rpc(2, 'getSignatureStatuses', [
      signatures, { searchTransactionHistory: true }
    ]);
    const transactionResponses = [];
    for (const [index, transactionSignature] of signatures.entries()) {
      const response = await rpc(index + 3, 'getTransaction', [
        transactionSignature,
        { commitment: 'finalized', encoding: 'json', maxSupportedTransactionVersion: 1 }
      ]);
      transactionResponses.push({ transactionSignature, requestCommitment: 'finalized', response });
    }
    const report = reconcileDevnetLifecycle(manifestSnapshot, {
      genesisHash: identity.result,
      statusResponse,
      transactionResponses
    });
    return { ...report, lifecycleVerified: false, sendAuthorized: false };
  } catch (error) {
    return result(error instanceof RpcReadError ? error.code : 'LIFECYCLE_EVIDENCE_INVALID');
  }
}

function parseCliArgs(argv) {
  const options = { inputPath: null, rpcUrl: process.env.COPYPUMP_DEVNET_RPC_URL, timeoutMs: DEFAULT_RPC_TIMEOUT_MS };
  const flags = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--rpc-url' || argument === '--rpc-timeout-ms') {
      if (flags.has(argument) || !argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error();
      flags.add(argument);
      const value = argv[++index];
      if (argument === '--rpc-url') options.rpcUrl = value;
      else options.timeoutMs = Number(value);
    } else {
      if (argument.startsWith('--') || options.inputPath !== null) throw new Error();
      options.inputPath = argument;
    }
  }
  if (options.inputPath === null) throw new Error();
  return options;
}

async function runCli() {
  let options;
  let manifest;
  try {
    options = parseCliArgs(process.argv.slice(2));
    manifest = JSON.parse(await fs.readFile(options.inputPath, 'utf8'));
  } catch {
    console.error(JSON.stringify(result('CLI_INPUT_INVALID')));
    process.exitCode = 2;
    return;
  }
  const report = await verifyDevnetLifecycle({ manifest, rpcUrl: options.rpcUrl, timeoutMs: options.timeoutMs });
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runCli();
}
