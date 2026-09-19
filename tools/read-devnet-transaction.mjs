import { classifyTransactionReadResponse } from './classify-transaction-read-response.mjs';
import {
  DEFAULT_RPC_TIMEOUT_MS,
  verifyDevnetRpcIdentity
} from './validate-devnet-evidence.mjs';

const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const FAILURE_KINDS = new Set([
  'invalid_response',
  'rpc_error',
  'unsupported_transaction_version'
]);

function skipped() {
  return {
    ok: true,
    code: 'RPC_TRANSACTION_READ_SKIPPED',
    network: 'solana-devnet',
    transaction: null
  };
}

export async function readDevnetTransaction({
  rpcUrl,
  transactionSignature,
  fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS
} = {}) {
  const hasRpcUrl = typeof rpcUrl === 'string' && rpcUrl.trim().length > 0;
  const hasSignature = typeof transactionSignature === 'string' && transactionSignature.trim().length > 0;

  if (!hasRpcUrl || !hasSignature) return skipped();

  if (!BASE58_SIGNATURE.test(transactionSignature)) {
    return {
      ok: false,
      code: 'TRANSACTION_SIGNATURE_INVALID',
      network: 'solana-devnet',
      transaction: null
    };
  }

  const identity = await verifyDevnetRpcIdentity({
    rpcUrl,
    fetchImpl,
    timeoutMs
  });

  if (!identity.ok) {
    return {
      ok: false,
      code: identity.code,
      network: 'solana-devnet',
      error: identity.error,
      transaction: null
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'getTransaction',
        params: [
          transactionSignature,
          {
            commitment: 'confirmed',
            encoding: 'json',
            maxSupportedTransactionVersion: 1
          }
        ]
      }),
      signal: controller.signal
    });

    if (!response?.ok) {
      return {
        ok: false,
        code: 'RPC_UNAVAILABLE',
        network: 'solana-devnet',
        transaction: null
      };
    }

    let payload;
    try {
      payload = await response.json();
    } catch {
      return {
        ok: false,
        code: 'RPC_INVALID_RESPONSE',
        network: 'solana-devnet',
        transaction: { kind: 'invalid_response' }
      };
    }

    const transaction = classifyTransactionReadResponse(payload);
    return {
      ok: !FAILURE_KINDS.has(transaction.kind),
      code: FAILURE_KINDS.has(transaction.kind)
        ? 'RPC_TRANSACTION_READ_REJECTED'
        : 'RPC_TRANSACTION_CLASSIFIED',
      network: 'solana-devnet',
      transaction
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        ok: false,
        code: 'RPC_TIMEOUT',
        network: 'solana-devnet',
        error: `Solana transaction read timed out after ${timeoutMs} milliseconds`,
        transaction: null
      };
    }

    return {
      ok: false,
      code: 'RPC_UNAVAILABLE',
      network: 'solana-devnet',
      transaction: null
    };
  } finally {
    clearTimeout(timeout);
  }
}
