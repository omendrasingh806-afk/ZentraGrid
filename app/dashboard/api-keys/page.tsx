'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/context/toast-context';
import { apiKeysApi } from '@/lib/api';
import { ZentraApiKey } from '@/lib/types';
import { saveKeyMaterial, removeKeyMaterial } from '@/lib/key-vault';
import CodeBlock from '@/components/ui/code-block';
import { 
  KeyRound, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  AlertTriangle, 
  ShieldCheck, 
  Eye, 
  Lock,
  Calendar,
  Terminal
} from 'lucide-react';

export default function ApiKeysPage() {
  const { currentProject, getIdToken } = useAuth();
  const { toast } = useToast();

  const [keys, setKeys] = useState<ZentraApiKey[]>([]);
  const [loading, setLoading] = useState(false);

  // Key creation state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [creating, setCreating] = useState(false);

  // One-time Plaintext Key Display modal
  const [revealedKey, setRevealedKey] = useState<{ name: string; plaintext: string; keyHint: string } | null>(null);

  // Revocation state
  const [revokeCandidate, setRevokeCandidate] = useState<ZentraApiKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  useEffect(() => {
    const targetPid = currentProject?.project_id || currentProject?.id;
    if (!targetPid) return;
    let isCancelled = false;

    (async () => {
      setLoading(true);
      try {
        const token = await getIdToken();
        const res = await apiKeysApi.listKeys(targetPid, token || '');
        if (!isCancelled) {
          setKeys(res.keys || []);
        }
      } catch (err) {
        if (!isCancelled) {
          console.warn('API keys fetch error', err);
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [currentProject, getIdToken]);

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPid = currentProject?.project_id || currentProject?.id;
    if (!targetPid) {
      toast.error('Project Required', 'Please select or create a project first.');
      return;
    }
    if (!keyName.trim()) {
      toast.warning('Please provide a descriptive key name.');
      return;
    }

    setCreating(true);
    try {
      const token = await getIdToken();
      const res = await apiKeysApi.createKey(targetPid, keyName.trim(), token || '');
      const rawKey = res.key || res;
      const plaintext = res.plaintext_key || (res as any).api_key || '';
      const newKey: ZentraApiKey = {
        id: rawKey.key_id || rawKey.id || `key_${Date.now()}`,
        key_id: rawKey.key_id || rawKey.id || `key_${Date.now()}`,
        name: rawKey.name || keyName.trim(),
        key_hint: rawKey.key_hint || (plaintext ? plaintext.slice(-4) : '••••'),
        project_id: rawKey.project_id || targetPid,
        revoked: Boolean(rawKey.revoked),
        last_used_at: rawKey.last_used_at,
        created_at: rawKey.created_at || new Date().toISOString()
      };
      setKeys((prev) => [newKey, ...prev.filter(k => k.id !== newKey.id && k.key_id !== newKey.key_id)]);
      setCreateModalOpen(false);
      setKeyName('');

      // Plaintext sirf abhi available hai — locally save karo taaki dashboard
      // is key se authenticated uploads (POST /v1/files) kar sake.
      saveKeyMaterial(newKey.key_id || newKey.id, plaintext, {
        name: newKey.name,
        project_id: newKey.project_id,
      });

      // Open ONE-TIME plaintext reveal modal
      setRevealedKey({
        name: newKey.name || keyName.trim() || 'API Key',
        plaintext: plaintext,
        keyHint: newKey.key_hint || (plaintext ? plaintext.slice(-4) : '••••')
      });

      toast.success('API Key Created', 'Store the plaintext key now. It will never be displayed again.');
    } catch (err: any) {
      console.error('Create key error:', err);
      toast.error('Failed to create key', err?.message || 'Check your permissions.');
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeKey = async () => {
    const targetPid = currentProject?.project_id || currentProject?.id;
    if (!targetPid || !revokeCandidate) return;
    setRevoking(true);
    try {
      const token = await getIdToken();
      const targetKeyId = revokeCandidate.key_id || revokeCandidate.id;
      await apiKeysApi.revokeKey(targetPid, targetKeyId, token || '');
      removeKeyMaterial(targetKeyId);
      setKeys((prev) => prev.filter((k) => k.id !== targetKeyId && k.key_id !== targetKeyId));
      toast.info('API Key Revoked', `Key "${revokeCandidate.name || 'API Key'}" has been permanently deactivated.`);
      setRevokeCandidate(null);
    } catch (err: any) {
      toast.error('Revocation Failed', err?.message || 'Could not revoke key.');
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to Clipboard', `${label} is copied.`);
  };

  return (
    <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2.5">
            <KeyRound className="w-7 h-7 text-[#FF4FD8]" />
            <span>Developer API Keys</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Scoped tokens for background workers and application servers in{' '}
            <span className="text-[#FF9BE8] font-semibold">{currentProject?.name}</span>.
          </p>
        </div>

        <button
          onClick={() => setCreateModalOpen(true)}
          className="liquid-glass px-4 py-2.5 rounded-xl border border-[#FF4FD8]/60 text-xs font-semibold text-white bg-gradient-to-r from-[#FF4FD8] to-[#FF2FB3] hover:opacity-95 shadow-[0_0_20px_rgba(255,79,216,0.3)] transition-all flex items-center gap-2 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Generate New Key</span>
        </button>
      </div>

      {/* Security notice */}
      <div className="liquid-glass p-5 rounded-2xl border border-white/10 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#67E8F9] shrink-0 mt-0.5" />
        <div className="text-xs text-slate-300 leading-relaxed">
          <span className="font-semibold text-white">Cryptographic Security Standard:</span> Plaintext tokens are generated on demand and returned exactly once. ZentraGrid only stores SHA-256 hashes and key hints in the database. Never expose keys in client-side bundles or public GitHub repositories.
        </div>
      </div>

      {/* Keys Table */}
      <div className="liquid-glass rounded-3xl border border-white/10 overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between text-xs">
          <span className="font-bold text-white">Active Scoped Keys</span>
          <span className="font-mono text-slate-400 text-[11px]">{keys.length} keys provisioned</span>
        </div>

        {keys.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            <KeyRound className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <span>No API keys yet. Generate a key to start uploading from your backend.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px] bg-white/[0.01]">
                  <th className="py-3 px-4 font-semibold">Key Name</th>
                  <th className="py-3 px-4 font-semibold">Key Hint</th>
                  <th className="py-3 px-4 font-semibold">Created</th>
                  <th className="py-3 px-4 font-semibold">Last Used</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold text-right">Revoke</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="py-3.5 px-4 font-sans font-medium text-white">
                      {k.name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 flex items-center gap-2">
                      <span className="bg-white/5 px-2 py-0.5 rounded border border-white/10 text-[11px]">
                        {k.key_hint}
                      </span>
                      <button
                        onClick={() => copyToClipboard(k.key_hint, 'Key Hint')}
                        className="text-slate-400 hover:text-white"
                        title="Copy Key Hint"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 text-[11px]">
                      {new Date(k.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                      {k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        ACTIVE
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setRevokeCandidate(k)}
                        className="px-2 py-1 rounded hover:bg-rose-500/10 text-slate-400 hover:text-rose-400 text-xs transition-colors"
                        title="Revoke key"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Integration Usage Card */}
      <div className="liquid-glass p-6 rounded-3xl border border-white/10 space-y-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#FF4FD8]" />
          Quick Backend Implementation Example
        </h3>
        <p className="text-xs text-slate-400">
          Inject your live key as a Bearer token in the Authorization header:
        </p>
        <CodeBlock
          filename="curl-upload-example.sh"
          language="bash"
          code={`curl -X POST "https://api.zentragrid.com/v1/files" \\
  -H "Authorization: Bearer ZTG_live_YOUR_KEY_HERE" \\
  -F "file=@./video.mp4"`}
        />
      </div>

      {/* Create Key Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-md liquid-glass rounded-3xl border border-white/20 p-6 bg-[#0B0D14]/95 shadow-2xl relative animate-fade-in">
            <h3 className="text-base font-bold text-white mb-1">Generate Scoped API Key</h3>
            <p className="text-xs text-slate-400 mb-5">
              Assign a recognizable name describing where this key will be used (e.g. Ingestion Worker, Production Backend).
            </p>

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Key Name <span className="text-[#FF4FD8]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g. Next.js Upload Worker"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.05] border border-white/12 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#FF4FD8]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="liquid-glass px-4 py-2 rounded-xl border border-[#FF4FD8]/60 text-xs font-semibold text-white bg-gradient-to-r from-[#FF4FD8] to-[#FF2FB3] hover:opacity-95 shadow-[0_0_20px_rgba(255,79,216,0.3)] disabled:opacity-50"
                >
                  {creating ? 'Generating Key...' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ONE-TIME PLAINTEXT KEY DISPLAY MODAL */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-2xl">
          <div className="w-full max-w-lg liquid-glass rounded-3xl border border-[#FF4FD8]/60 p-8 bg-[#0B0D14]/98 shadow-2xl relative animate-fade-in space-y-5">
            <div className="w-12 h-12 rounded-2xl bg-[#FF4FD8]/15 border border-[#FF4FD8]/40 flex items-center justify-center text-[#FF4FD8]">
              <Lock className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-white mb-1">
                Save Your Secret API Key
              </h3>
              <p className="text-xs text-rose-300 font-semibold flex items-center gap-1.5 mt-2 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                Copy this key now. You will not be able to see it again.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-slate-400">
                Plaintext Key ({revealedKey.name}):
              </span>
              <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-2 font-mono text-xs text-emerald-400 break-all select-all">
                <span>{revealedKey.plaintext}</span>
                <button
                  onClick={() => copyToClipboard(revealedKey.plaintext, 'Plaintext API Key')}
                  className="px-3 py-1.5 rounded-lg liquid-glass border border-emerald-500/40 text-white font-sans text-xs flex items-center gap-1.5 shrink-0 hover:bg-emerald-500/20"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </button>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setRevealedKey(null)}
                className="liquid-glass px-6 py-2.5 rounded-xl border border-white/20 text-xs font-semibold text-white hover:border-[#FF4FD8]"
              >
                I have saved my key safely
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revoke Confirmation Modal */}
      {revokeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-md liquid-glass rounded-3xl border border-rose-500/30 p-6 bg-[#0B0D14]/95 shadow-2xl relative animate-fade-in">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="w-5 h-5" />
            </div>

            <h3 className="text-base font-bold text-white mb-1">Revoke API Key</h3>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Are you sure you want to permanently revoke key{' '}
              <span className="text-white font-mono font-semibold">{revokeCandidate.name}</span> ({revokeCandidate.key_hint})? Any active scripts or background servers using this token will immediately fail with HTTP 401 Unauthorized.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setRevokeCandidate(null)}
                className="px-3.5 py-2 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeKey}
                disabled={revoking}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-semibold shadow-lg disabled:opacity-50"
              >
                {revoking ? 'Revoking...' : 'Revoke Key'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
