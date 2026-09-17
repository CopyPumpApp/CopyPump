function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function classifyTransactionReadResponse(payload) {
  if (!isObject(payload)) {
    return { kind: 'invalid_response' };
  }

  if (isObject(payload.error)) {
    if (payload.error.code === -32015) {
      return {
        kind: 'unsupported_transaction_version',
        rpcCode: -32015
      };
    }

    return {
      kind: 'rpc_error',
      rpcCode: Number.isInteger(payload.error.code) ? payload.error.code : null
    };
  }

  if (!Object.prototype.hasOwnProperty.call(payload, 'result')) {
    return { kind: 'invalid_response' };
  }

  if (payload.result === null) {
    return { kind: 'not_found' };
  }

  if (!isObject(payload.result) || !isObject(payload.result.transaction) || !isObject(payload.result.meta)) {
    return { kind: 'invalid_response' };
  }

  if (!Object.prototype.hasOwnProperty.call(payload.result.meta, 'err')) {
    return { kind: 'invalid_response' };
  }

  if (payload.result.meta.err !== null) {
    return {
      kind: 'transaction_failed',
      version: payload.result.version ?? null
    };
  }

  return {
    kind: 'transaction_succeeded',
    version: payload.result.version ?? null
  };
}
