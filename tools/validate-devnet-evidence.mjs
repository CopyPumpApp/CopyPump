import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_LIFECYCLE_STEPS = [
  'BUY',
  'POSITION',
  'PARTIAL_SELL',
  'FULL_SELL'
];

const VALID_STATUSES = new Set(['draft', 'partial', 'verified']);
const VALID_EVIDENCE_TYPES = new Set(['onchain', 'application']);
const BASE58_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
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
    return { ok: false, errors: ['manifest must be a JSON object'], warnings };
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
        if (typeof signature !== 'string' || !BASE58_SIGNATURE.test(signature)) {
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

  return { ok: errors.length === 0, errors, warnings };
}

async function runCli() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node tools/validate-devnet-evidence.mjs <manifest.json>');
    process.exitCode = 2;
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, errors: [`unable to read JSON: ${error.message}`], warnings: [] }, null, 2));
    process.exitCode = 2;
    return;
  }

  const result = validateEvidenceManifest(manifest);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  await runCli();
}
