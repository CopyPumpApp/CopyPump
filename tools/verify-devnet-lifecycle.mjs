import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SOLANA_DEVNET_GENESIS_HASH } from './validate-devnet-evidence.mjs';
import {
  validateLifecycleManifest,
  reconcileDevnetLifecycle
} from './reconcile-devnet-lifecycle.mjs';

const DEFAULT_TIMEOUT_MS = 5000;
const HARD_RESPONSE_BYTE_LIMIT = 1_000_000;
const HARD_RESPONSE_CHUNK_LIMIT = 4096;
const CHUNK_YIELD_INTERVAL = 64;

class RpcReadError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function result(code, ok = false, errors = [code]) {
  return {
    ok,
    code,
    errors,
    receiptEvidenceVerified: false,
    lifecycleVerified: false,
    sendAuthorized: false
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRpcUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0
      && url.username === '' && url.password === '' && url.hash === '';
  } catch {
    return false;
  }
}

function validateEnvelope(payload, id) {
  if (!isRecord(payload) || payload.jsonrpc !== '2.0' || payload.id !== id
    || Object.hasOwn(payload, 'result') === Object.hasOwn(payload, 'error')) {
    throw new RpcReadError('RPC_INVALID_RESPONSE');
  }
  if (Object.hasOwn(payload, 'error')) {
    if (!isRecord(payload.error) || !Number.isSafeInteger(payload.error.code)) {
      throw new RpcReadError('RPC_INVALID_RESPONSE');
    }
    throw new RpcReadError(payload.error.code === -32015
      ? 'RPC_UNSUPPORTED_TRANSACTION_VERSION' : 'RPC_ERROR');
  }
}

// One deadline covers fetch AND streaming the body. Promise.race also bounds a
// faulty injected transport that ignores AbortSignal. No response.text()/json()
// fallback: those would buffer an unbounded response before checking its size.
async function readRpc({ rpcUrl, request, fetchImpl, timeoutMs, maxResponseBytes }) {
  const controller = new AbortController();
  let reader;
  let response;
  let timer;

  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new RpcReadError('RPC_TIMEOUT'));
    }, timeoutMs);
  });

  const read = async () => {
    response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(request),
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal
    });
    if (controller.signal.aborted) throw new RpcReadError('RPC_TIMEOUT');
    if (response?.redirected === true) throw new RpcReadError('RPC_REDIRECT_REJECTED');
    if (!response?.ok) throw new RpcReadError('RPC_UNAVAILABLE');

    const contentLength = response.headers?.get?.('content-length');
    if (contentLength !== null && contentLength !== undefined) {
      if (!/^\d+$/.test(contentLength)) throw new RpcReadError('RPC_INVALID_RESPONSE');
      const declaredSize = Number(contentLength);
      if (!Number.isSafeInteger(declaredSize) || declaredSize > maxResponseBytes) {
        throw new RpcReadError('RPC_RESPONSE_TOO_LARGE');
      }
    }
    if (typeof response.body?.getReader !== 'function') {
      throw new RpcReadError('RPC_INVALID_RESPONSE');
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const chunks = [];
    let bytes = 0;
    let chunkCount = 0;
    while (true) {
      if (controller.signal.aborted) throw new RpcReadError('RPC_TIMEOUT');
      const chunk = await reader.read();
      if (controller.signal.aborted) throw new RpcReadError('RPC_TIMEOUT');
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array) || chunk.value.byteLength === 0) {
        throw new RpcReadError('RPC_INVALID_RESPONSE');
      }
      chunkCount += 1;
      if (chunkCount > HARD_RESPONSE_CHUNK_LIMIT) throw new RpcReadError('RPC_RESPONSE_TOO_FRAGMENTED');
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) throw new RpcReadError('RPC_RESPONSE_TOO_LARGE');
      try {
        chunks.push(decoder.decode(chunk.value, { stream: true }));
      } catch {
        throw new RpcReadError('RPC_INVALID_JSON');
      }
      // A stream whose reads resolve immediately must still let the deadline
      // timer run; byte limits alone do not prevent microtask starvation.
      if (chunkCount % CHUNK_YIELD_INTERVAL === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (controller.signal.aborted) throw new RpcReadError('RPC_TIMEOUT');
      }
    }

    let payload;
    try {
      chunks.push(decoder.decode());
      payload = JSON.parse(chunks.join(''));
    } catch {
      throw new RpcReadError('RPC_INVALID_JSON');
    }
    validateEnvelope(payload, request.id);
    return payload;
  };

  try {
    return await Promise.race([read(), timeout]);
  } catch (error) {
    if (error instanceof RpcReadError) throw error;
    throw new RpcReadError(controller.signal.aborted ? 'RPC_TIMEOUT' : 'RPC_UNAVAILABLE');
  } finally {
    clearTimeout(timer);
    controller.abort();
    // Cleanup must not let a faulty stream's cancellation defeat the deadline.
    try {
      const cancellation = reader ? reader.cancel() : response?.body?.cancel?.();
      cancellation?.catch?.(() => {});
    } catch {}
    try { reader?.releaseLock(); } catch {}
  }
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
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxResponseBytes = HARD_RESPONSE_BYTE_LIMIT
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
  if (typeof rpcUrl !== 'string' || !validRpcUrl(rpcUrl)) return result('RPC_URL_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    return result('RPC_TIMEOUT_INVALID');
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1
    || maxResponseBytes > HARD_RESPONSE_BYTE_LIMIT) {
    return result('RPC_RESPONSE_LIMIT_INVALID');
  }
  if (typeof fetchImpl !== 'function') return result('RPC_UNAVAILABLE');

  const rpc = (id, method, params) => readRpc({
    rpcUrl,
    request: { jsonrpc: '2.0', id, method, params },
    fetchImpl,
    timeoutMs,
    maxResponseBytes
  });

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
  const options = { inputPath: null, rpcUrl: process.env.COPYPUMP_DEVNET_RPC_URL, timeoutMs: DEFAULT_TIMEOUT_MS };
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
