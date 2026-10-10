// Shared transport for the public read-only tools. Cluster identity and receipt
// meaning are checked by callers; this module never signs, sends or retries.
export const DEFAULT_RPC_TIMEOUT_MS = 5000;
export const MAX_RPC_RESPONSE_BYTES = 1_000_000;
const MAX_RESPONSE_CHUNKS = 4096;
const CHUNK_YIELD_INTERVAL = 64;
const READ_METHODS = new Set(['getGenesisHash', 'getSignatureStatuses', 'getTransaction']);

export class RpcReadError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validRpcUrl(value) {
  if (typeof value !== 'string') return false;
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
    || Object.hasOwn(payload, 'result') === Object.hasOwn(payload, 'error')
    || (Object.hasOwn(payload, 'error') && (!isRecord(payload.error)
      || !Number.isSafeInteger(payload.error.code)))) {
    throw new RpcReadError('RPC_INVALID_RESPONSE');
  }
}

// Consumers that need successful result envelopes use this after the bounded
// read. The older transaction classifier can instead classify an RPC error.
export function requireRpcResult(payload) {
  if (Object.hasOwn(payload, 'error')) {
    throw new RpcReadError(payload.error.code === -32015
      ? 'RPC_UNSUPPORTED_TRANSACTION_VERSION' : 'RPC_ERROR');
  }
  return payload.result;
}

/**
 * One deadline covers fetch and body, even if an injected transport ignores
 * AbortSignal. Both bytes and nonempty chunks are bounded; no text/json fallback
 * buffers an unbounded body. Only the three listed read methods are supported.
 */
export async function readBoundedJsonRpc({
  rpcUrl, request, fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_RPC_TIMEOUT_MS, maxResponseBytes = MAX_RPC_RESPONSE_BYTES
} = {}) {
  if (!validRpcUrl(rpcUrl)) throw new RpcReadError('RPC_URL_INVALID');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new RpcReadError('RPC_TIMEOUT_INVALID');
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1
    || maxResponseBytes > MAX_RPC_RESPONSE_BYTES) {
    throw new RpcReadError('RPC_RESPONSE_LIMIT_INVALID');
  }
  if (typeof fetchImpl !== 'function') throw new RpcReadError('RPC_UNAVAILABLE');
  if (!isRecord(request)) throw new RpcReadError('RPC_REQUEST_INVALID');
  const { jsonrpc, id: requestId, method, params } = request;
  if (jsonrpc !== '2.0' || !Number.isSafeInteger(requestId) || requestId < 1
    || !READ_METHODS.has(method) || !Array.isArray(params)) {
    throw new RpcReadError('RPC_REQUEST_INVALID');
  }
  // Capture the serialized request and its ID before the first await.
  let requestBody;
  try { requestBody = JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }); }
  catch { throw new RpcReadError('RPC_REQUEST_INVALID'); }

  const controller = new AbortController();
  let reader;
  let response;
  let timer;
  const cleanup = () => {
    // Cancellation must not defeat the deadline, even with a faulty stream.
    try {
      const cancellation = reader ? reader.cancel() : response?.body?.cancel?.();
      cancellation?.catch?.(() => {});
    } catch {}
    try { reader?.releaseLock(); } catch {}
  };
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
      body: requestBody,
      redirect: 'error',
      credentials: 'omit',
      signal: controller.signal
    });
    if (controller.signal.aborted) {
      cleanup(); // A late fetch can resolve after the race's finally has run.
      throw new RpcReadError('RPC_TIMEOUT');
    }
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
      if (++chunkCount > MAX_RESPONSE_CHUNKS) throw new RpcReadError('RPC_RESPONSE_TOO_FRAGMENTED');
      bytes += chunk.value.byteLength;
      if (bytes > maxResponseBytes) throw new RpcReadError('RPC_RESPONSE_TOO_LARGE');
      try { chunks.push(decoder.decode(chunk.value, { stream: true })); }
      catch { throw new RpcReadError('RPC_INVALID_JSON'); }
      if (chunkCount % CHUNK_YIELD_INTERVAL === 0) {
        await new Promise((resolve) => setImmediate(resolve));
        if (controller.signal.aborted) throw new RpcReadError('RPC_TIMEOUT');
      }
    }
    let payload;
    try {
      chunks.push(decoder.decode());
      payload = JSON.parse(chunks.join(''));
    } catch { throw new RpcReadError('RPC_INVALID_JSON'); }
    validateEnvelope(payload, requestId);
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
    cleanup();
  }
}
