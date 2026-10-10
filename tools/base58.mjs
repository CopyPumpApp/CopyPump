const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// Structural byte-width validation only; this does not authenticate an address,
// blockhash or signature. Bound work to the 32/64-byte public tool contracts.
export function isBase58Bytes(value, expectedBytes) {
  if (expectedBytes !== 32 && expectedBytes !== 64) return false;
  if (typeof value !== 'string' || value.length < expectedBytes
    || value.length > (expectedBytes === 32 ? 44 : 88)) return false;
  let number = 0n;
  for (const character of value) {
    const digit = ALPHABET.indexOf(character);
    if (digit < 0) return false;
    number = number * 58n + BigInt(digit);
  }
  let leadingZeroes = 0;
  while (value[leadingZeroes] === '1') leadingZeroes += 1;
  const bodyBytes = number === 0n ? 0 : Math.ceil(number.toString(2).length / 8);
  return leadingZeroes + bodyBytes === expectedBytes;
}
