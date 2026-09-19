'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import {
  api,
  type ProjectPublic,
  type UsagePublic,
  type ApiKeyPublic,
  type ApiKeyCreated,
  ApiError,
} from '@/lib/api';
import { formatBytes, formatRelativeTime, getQuotaColor } from '@/lib/formatters';
import { saveKeyMaterial, removeKeyMaterial } from '@/lib/key-vault';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ApiKeyCreatedModal } from '@/components/api-key-created-modal';
import { ProjectIntegrationSnippets } from '@/components/project-integration-snippets';
import {
  FolderKanban,
  HardDrive,
  KeyRound,
  Trash2,
  Plus,
  ArrowLeft,
  AlertCircle,
  FileCode,
  Radio,
  Download,
  Upload,
  RefreshCw,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Layers,
  Calendar,
  X,
} from 'lucide-react';

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params?.id as string;
  const { executeWithAuth } = useAuth();

  const [project, setProject] = useState<ProjectPublic | null>(null);
  const [usage, setUsage] = useState<UsagePublic | null>(null);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Key creation state
  const [isCreateKeyOpen, setIsCreateKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);
  const [createdKeyResult, setCreatedKeyResult] = useState<ApiKeyCreated | null>(null);

  // Key revocation dialog
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKeyPublic | null>(null);

  // Project deletion dialog
  const [isDeleteProjectOpen, setIsDeleteProjectOpen] = useState(false);

  // Copy helper
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(
    async (isSilent = false) => {
      if (!projectId) return;
      if (!isSilent) setLoading(true);
      setError(null);

      try {
        const [proj, usageData, keysData] = await Promise.all([
          executeWithAuth(async (token) => api.projects.get(token, projectId)),
          executeWithAuth(async (token) => api.usage.get(token, projectId)),
          executeWithAuth(async (token) => api.keys.list(token, projectId)),
        ]);

        setProject(proj);
        setUsage(usageData);
        setKeys(keysData.keys || []);
      } catch (err: unknown) {
        console.error('Failed to load project details:', err);
        if (err instanceof ApiError && (err.status === 404 || err.code === 'PROJECT_NOT_FOUND')) {
          setError('Project not found. It may have been deleted.');
        } else {
          setError(err instanceof Error ? err.message : 'Error loading project data');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [projectId, executeWithAuth]
  );

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    Promise.all([
      executeWithAuth(async (token) => api.projects.get(token, projectId)),
      executeWithAuth(async (token) => api.usage.get(token, projectId)),
      executeWithAuth(async (token) => api.keys.list(token, projectId)),
    ])
      .then(([proj, usageData, keysData]) => {
        if (!cancelled) {
          setProject(proj);
          setUsage(usageData);
          setKeys(keysData.keys || []);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          console.error('Failed to load project details:', err);
          if (err instanceof ApiError && (err.status === 404 || err.code === 'PROJECT_NOT_FOUND')) {
            setError('Project not found. It may have been deleted.');
          } else {
            setError(err instanceof Error ? err.message : 'Error loading project data');
          }
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, executeWithAuth]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadData(true);
  };

  const handleCreateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingKey(true);
    setCreateKeyError(null);

    try {
      const result = await executeWithAuth(async (token) =>
        api.keys.create(token, projectId, {
          name: newKeyName.trim() || undefined,
        })
      );

      // Append new key to list
      setKeys((prev) => [result.key, ...prev]);
      setIsCreateKeyOpen(false);
      setNewKeyName('');

      // Save plaintext locally — dobara kabhi available nahi hogi (sirf yahi
      // secret hai jisse uploads is key ke naam se sign hote hain).
      saveKeyMaterial(result.key?.key_id, result.api_key, {
        name: result.key?.name,
        project_id: projectId,
      });

      // Show one-time plaintext modal
      setCreatedKeyResult(result);
    } catch (err: unknown) {
      console.error('Failed to create key:', err);
      setCreateKeyError(err instanceof Error ? err.message : 'Could not create key');
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!keyToRevoke) return;

    await executeWithAuth(async (token) =>
      api.keys.revoke(token, projectId, keyToRevoke.key_id)
    );
    removeKeyMaterial(keyToRevoke.key_id);

    setKeys((prev) =>
      prev.map((k) => (k.key_id === keyToRevoke.key_id ? { ...k, revoked: true } : k))
    );
    setKeyToRevoke(null);
  };

  const handleDeleteProject = async () => {
    if (!project) return;

    await executeWithAuth(async (token) => api.projects.delete(token, projectId));
    router.push('/dashboard');
  };

  const handleCopyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-white/10 rounded-lg" />
        <div className="h-40 rounded-3xl bg-[#0B0D14] border border-white/10" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="h-28 rounded-2xl bg-[#0B0D14] border border-white/10" />
          <div className="h-28 rounded-2xl bg-[#0B0D14] border border-white/10" />
          <div className="h-28 rounded-2xl bg-[#0B0D14] border border-white/10" />
        </div>
        <div className="h-64 rounded-3xl bg-[#0B0D14] border border-white/10" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 text-center rounded-3xl bg-[#0B0D14] border border-white/10 max-w-lg mx-auto my-12">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-white">Unable to load project</h2>
        <p className="mt-1.5 text-xs text-slate-400">{error || 'Project data could not be found.'}</p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Projects</span>
        </Link>
      </div>
    );
  }

  // Quota calculation
  const totalBytes = usage?.total_bytes ?? 0;
  const quotaBytes = usage?.quota_bytes || project.max_bytes || 5 * 1024 * 1024 * 1024; // 5 GB default fallback
  const usedPercentage = quotaBytes > 0 ? Math.min(100, Math.round((totalBytes / quotaBytes) * 100)) : 0;
  const quotaStyle = getQuotaColor(usedPercentage);

  const activeKeys = keys.filter((k) => !k.revoked);
  const firstActiveKey = activeKeys[0];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Projects</span>
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-white">{project.name}</h1>
            <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10 text-slate-300">
              {project.plan} Plan
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-slate-400">{project.description || 'Dedicated storage workspace'}</span>
            <span className="text-slate-600">&bull;</span>
            <button
              onClick={() => handleCopyText(project.project_id, 'pid')}
              className="font-mono text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              title="Copy Project ID"
            >
              <span>{project.project_id}</span>
              {copiedId === 'pid' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-xl border border-white/10 hover:bg-white/[0.05] text-slate-400 hover:text-white transition-colors"
            title="Refresh usage and keys"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-[#FF4FD8]' : ''}`} />
          </button>

          <button
            onClick={() => setIsDeleteProjectOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Project</span>
          </button>
        </div>
      </div>

      {/* Usage & Quota Card */}
      <div className="p-6 rounded-3xl bg-[#0B0D14] border border-white/10 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-[#FF4FD8]" />
              <h2 className="text-sm font-semibold text-white tracking-tight">Storage Volume &amp; Quota</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live consumption for user uploads, media files, and egress bandwidth.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`text-xs font-mono px-2.5 py-1 rounded-full border ${quotaStyle.badgeClass}`}>
              {usedPercentage}% Used
            </span>
          </div>
        </div>

        {/* Quota Progress Bar */}
        <div>
          <div className="flex justify-between text-xs font-mono mb-2">
            <span className="text-slate-300">
              <strong className="text-white">{formatBytes(totalBytes)}</strong> used
            </span>
            <span className="text-slate-400">
              Limit: <strong className="text-white">{formatBytes(quotaBytes)}</strong>
            </span>
          </div>
          <div className="w-full h-3 rounded-full bg-white/[0.05] overflow-hidden p-0.5 border border-white/8">
            <div
              className={`h-full rounded-full transition-all duration-500 ${quotaStyle.barClass}`}
              style={{ width: `${Math.max(2, usedPercentage)}%` }}
            />
          </div>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-white/8">
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <FileCode className="w-3.5 h-3.5 text-[#67E8F9]" />
              <span>Total Files</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {usage ? usage.total_files.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500">
              Max: {usage?.quota_files ? usage.quota_files.toLocaleString() : (project.max_files || 10000).toLocaleString()}
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              <span>Uploads</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {usage ? usage.uploads.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500">Total ingested</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Download className="w-3.5 h-3.5 text-amber-400" />
              <span>Downloads</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {usage ? usage.downloads.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500">File fetches</div>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="flex items-center gap-1.5 text-slate-400 text-xs mb-1">
              <Radio className="w-3.5 h-3.5 text-[#FF4FD8]" />
              <span>Bandwidth Out</span>
            </div>
            <div className="text-lg font-bold text-white font-mono">
              {usage ? formatBytes(usage.bandwidth_out_bytes) : '0 B'}
            </div>
            <div className="text-[10px] text-slate-500">Streams &amp; egress</div>
          </div>
        </div>
      </div>

      {/* API Keys Management Section */}
      <div className="p-6 rounded-3xl bg-[#0B0D14] border border-white/10 shadow-xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-[#FF4FD8]" />
              <h2 className="text-sm font-semibold text-white tracking-tight">Production API Keys</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Secret keys for backend authentication. Up to 20 active keys per project.
            </p>
          </div>

          <button
            onClick={() => {
              setCreateKeyError(null);
              setIsCreateKeyOpen(true);
            }}
            disabled={activeKeys.length >= 20}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#FF4FD8] hover:bg-[#FF2FB3] text-black font-semibold text-xs shadow-lg shadow-[#FF4FD8]/20 transition-all disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            <span>Generate New Key</span>
          </button>
        </div>

        {/* Keys Table */}
        <div className="rounded-2xl border border-white/8 overflow-hidden bg-white/[0.01]">
          {keys.length === 0 ? (
            <div className="p-8 text-center">
              <KeyRound className="w-8 h-8 text-slate-600 mx-auto mb-2" />
              <p className="text-xs text-slate-400">No API keys created yet for this project.</p>
              <button
                onClick={() => setIsCreateKeyOpen(true)}
                className="mt-3 text-xs text-[#FF4FD8] hover:underline"
              >
                Create your first key
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-white/8 bg-white/[0.02] text-slate-400 font-mono text-[11px]">
                    <th className="py-3 px-4">Name / Label</th>
                    <th className="py-3 px-4">Key Hint</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Last Used</th>
                    <th className="py-3 px-4">Created</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {keys.map((k) => {
                    const createdInfo = formatRelativeTime(k.created_at);
                    const lastUsedInfo = formatRelativeTime(k.last_used_at);

                    return (
                      <tr key={k.key_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3.5 px-4 font-medium text-white">
                          {k.name || <span className="text-slate-500 italic">Unnamed key</span>}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#FF9BE8]">
                          <code>{k.key_hint}</code>
                        </td>
                        <td className="py-3.5 px-4">
                          {k.revoked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                              Revoked
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono" title={lastUsedInfo.full}>
                          {lastUsedInfo.relative}
                        </td>
                        <td className="py-3.5 px-4 text-slate-400 font-mono" title={createdInfo.full}>
                          {createdInfo.relative}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {!k.revoked && (
                            <button
                              onClick={() => setKeyToRevoke(k)}
                              className="text-rose-400 hover:text-rose-300 text-[11px] font-medium transition-colors hover:underline"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Integration Code Snippets */}
      <ProjectIntegrationSnippets keyHint={firstActiveKey?.key_hint} />

      {/* Create Key Modal */}
      {isCreateKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md p-7 rounded-3xl bg-[#0B0D14] border border-white/15 shadow-2xl">
            <button
              onClick={() => setIsCreateKeyOpen(false)}
              className="absolute top-6 right-6 text-slate-400 hover:text-white p-1"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#FF4FD8]/10 border border-[#FF4FD8]/20 flex items-center justify-center text-[#FF4FD8]">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Generate API key</h3>
                <p className="text-xs text-slate-400">Creates a secret live key for your backend server.</p>
              </div>
            </div>

            {createKeyError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {createKeyError}
              </div>
            )}

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Key Label / Identifier <span className="text-slate-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. backend-production-api"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs placeholder:text-slate-600 focus:outline-none focus:border-[#FF4FD8]"
                />
              </div>

              <div className="p-3 rounded-xl bg-white/[0.02] border border-white/8 text-[11px] text-slate-400 leading-relaxed">
                Note: Plaintext keys are revealed <strong>only once</strong> upon generation.
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateKeyOpen(false)}
                  disabled={isCreatingKey}
                  className="px-4 py-2 rounded-xl border border-white/10 text-xs text-slate-300 hover:bg-white/[0.05]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingKey}
                  className="px-5 py-2 rounded-xl bg-[#FF4FD8] hover:bg-[#FF2FB3] text-black font-semibold text-xs shadow-lg shadow-[#FF4FD8]/20 disabled:opacity-50"
                >
                  {isCreatingKey ? 'Generating...' : 'Generate Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* One-Time Plaintext API Key Created Modal */}
      <ApiKeyCreatedModal data={createdKeyResult} onClose={() => setCreatedKeyResult(null)} />

      {/* Revoke Key Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(keyToRevoke)}
        onClose={() => setKeyToRevoke(null)}
        onConfirm={handleRevokeKey}
        title="Revoke API Key"
        description="Are you sure you want to revoke this key? Any application servers using this key will immediately be rejected."
        itemName={keyToRevoke?.name || keyToRevoke?.key_hint || 'Secret Key'}
        confirmLabel="Revoke Key"
      />

      {/* Delete Project Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteProjectOpen}
        onClose={() => setIsDeleteProjectOpen(false)}
        onConfirm={handleDeleteProject}
        title="Delete Storage Project"
        description="This will permanently delete this project and revoke all associated API keys. This action cannot be undone."
        itemName={project.name}
        confirmLabel="Delete Project Permanently"
        requireTypingName={true}
      />
    </div>
  );
}
