import { classifyTransactionReadResponse } from './classify-transaction-read-response.mjs';
import { verifyDevnetRpcIdentity } from './validate-devnet-evidence.mjs';
import { isBase58Bytes } from './base58.mjs';
import {
  DEFAULT_RPC_TIMEOUT_MS, MAX_RPC_RESPONSE_BYTES,
  RpcReadError, readBoundedJsonRpc
} from './bounded-json-rpc.mjs';

const FAILURE_KINDS = new Set([
  'invalid_response', 'rpc_error', 'unsupported_transaction_version'
]);

function result(ok, code, transaction = null) {
  return {
    ok, code, network: 'solana-devnet',
    verificationScope: 'TRANSACTION_READ_CLASSIFICATION',
    lifecycleVerified: false, sendAuthorized: false,
    transaction
  };
}

export async function readDevnetTransaction({
  rpcUrl,
  transactionSignature,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS,
  maxResponseBytes = MAX_RPC_RESPONSE_BYTES
} = {}) {
  const hasRpcUrl = typeof rpcUrl === 'string' && rpcUrl.trim().length > 0;
  const hasSignature = typeof transactionSignature === 'string' && transactionSignature.trim().length > 0;
  if (!hasRpcUrl || !hasSignature) return result(true, 'RPC_TRANSACTION_READ_SKIPPED');
  if (!isBase58Bytes(transactionSignature, 64)) return result(false, 'TRANSACTION_SIGNATURE_INVALID');

  const identity = await verifyDevnetRpcIdentity({ rpcUrl, fetchImpl, timeoutMs, maxResponseBytes });
  if (!identity.ok) return result(false, identity.code);

  try {
    const payload = await readBoundedJsonRpc({
      rpcUrl,
      request: {
        jsonrpc: '2.0', id: 2, method: 'getTransaction',
        params: [transactionSignature, {
          commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 1
        }]
      },
      fetchImpl, timeoutMs, maxResponseBytes
    });
    let transaction = classifyTransactionReadResponse(payload);
    if (transaction.kind === 'transaction_succeeded' || transaction.kind === 'transaction_failed') {
      const signatures = payload.result.transaction.signatures;
      if (!Array.isArray(signatures) || signatures.length < 1 || signatures.length > 256
        || signatures[0] !== transactionSignature
        || !signatures.every((signature) => isBase58Bytes(signature, 64))
        || !['legacy', 0, 1].includes(payload.result.version)) {
        transaction = { kind: 'invalid_response' };
      }
    }
    return result(!FAILURE_KINDS.has(transaction.kind), FAILURE_KINDS.has(transaction.kind)
      ? 'RPC_TRANSACTION_READ_REJECTED' : 'RPC_TRANSACTION_CLASSIFIED', transaction);
  } catch (error) {
    const code = error instanceof RpcReadError ? error.code : 'RPC_UNAVAILABLE';
    return result(false, code);
  }
}
