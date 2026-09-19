/**
 * Local vault for API key plaintext material.
 *
 * The ZentraGrid backend only stores a HASH of each API key — the plaintext
 * `ZTG_live_xxx` is returned exactly once in the POST /v1/projects/{id}/keys
 * creation response. To sign browser-side uploads (POST /v1/files with
 * `Authorization: Bearer ZTG_live_xxx`) the dashboard must retain the secret,
 * so we persist it in localStorage, keyed by `key_id`.
 *
 * If a key was created on another device, the secret will be missing here and
 * uploads for that key are not possible from this browser (the UI surfaces
 * this state and prompts the user to create a fresh key).
 */

export interface KeyMaterialEntry {
  key_id: string;
  plaintext: string;
  name?: string | null;
  project_id?: string;
  stored_at: string;
}

const VAULT_STORAGE_KEY = 'zg_key_material_v1';

type VaultMap = Record<string, KeyMaterialEntry>;

function readVault(): VaultMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeVault(map: VaultMap): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(map));
  } catch (err) {
    console.warn('KeyVault: could not persist key material', err);
  }
}

/** Save key plaintext right after creation (creation pe hi milegi, dobara nahi). */
export function saveKeyMaterial(
  keyId: string | null | undefined,
  plaintext: string | null | undefined,
  meta: { name?: string | null; project_id?: string } = {}
): void {
  if (!keyId || !plaintext) return;
  const vault = readVault();
  vault[keyId] = {
    key_id: keyId,
    plaintext,
    name: meta.name ?? null,
    project_id: meta.project_id,
    stored_at: new Date().toISOString(),
  };
  writeVault(vault);
}

/** Resolve stored secret for a key_id (ya object jisme key_id/id ho). */
export function getKeyMaterial(
  ref: string | { key_id?: string; id?: string } | null | undefined
): KeyMaterialEntry | null {
  if (!ref) return null;
  const keyId = typeof ref === 'string' ? ref : ref.key_id || ref.id;
  if (!keyId) return null;
  return readVault()[keyId] ?? null;
}

/** Kya is key ka plaintext is device par saved hai? */
export function hasKeyMaterial(
  ref: string | { key_id?: string; id?: string } | null | undefined
): boolean {
  return Boolean(getKeyMaterial(ref)?.plaintext);
}

/** Key revoke/delete hone par local secret bhi saaf karo. */
export function removeKeyMaterial(ref: string | { key_id?: string; id?: string } | null | undefined): void {
  if (!ref) return;
  const keyId = typeof ref === 'string' ? ref : ref.key_id || ref.id;
  if (!keyId) return;
  const vault = readVault();
  if (keyId in vault) {
    delete vault[keyId];
    writeVault(vault);
  }
}

/** Project delete hone par uski saari saved secrets saaf karo. */
export function removeProjectKeyMaterials(projectId: string | null | undefined): void {
  if (!projectId) return;
  const vault = readVault();
  let changed = false;
  for (const keyId of Object.keys(vault)) {
    if (vault[keyId].project_id === projectId) {
      delete vault[keyId];
      changed = true;
    }
  }
  if (changed) writeVault(vault);
}
