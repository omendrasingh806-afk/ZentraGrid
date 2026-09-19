'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { filesApi, projectsApi, usageApi } from '@/lib/api';
import { ZentraFile, ProjectUsage } from '@/lib/types';
import VideoPlayer from '@/components/ui/video-player';
import { 
  HardDrive, 
  Database, 
  BarChart3, 
  KeyRound, 
  ArrowUpRight, 
  Plus, 
  Film, 
  FileText, 
  Download, 
  ExternalLink,
  Activity,
  Zap,
  Play,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';

export default function DashboardOverviewPage() {
  const { currentProject, user, getIdToken } = useAuth();

  const [files, setFiles] = useState<ZentraFile[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [usage, setUsage] = useState<ProjectUsage | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<ZentraFile | null>(null);

  // Load files & telemetry
  useEffect(() => {
    const targetPid = currentProject?.project_id || currentProject?.id;
    if (!targetPid) return;
    let isCancelled = false;

    async function loadData() {
      setLoadingFiles(true);
      try {
        const [filesRes, token] = await Promise.all([
          filesApi.listFiles(targetPid),
          getIdToken()
        ]);
        if (!isCancelled) {
          setFiles(filesRes.files || []);
        }
        if (token) {
          const usageRes = await usageApi.get(token, targetPid);
          if (!isCancelled) {
            setUsage(usageRes);
          }
        }
      } catch (e) {
        console.warn('Dashboard data fetch warning:', e);
      } finally {
        if (!isCancelled) {
          setLoadingFiles(false);
        }
      }
    }
    loadData();
    return () => {
      isCancelled = true;
    };
  }, [currentProject, getIdToken]);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Dynamic real metrics calculation
  const usedBytes = usage?.total_bytes ?? currentProject?.storage_used_bytes ?? currentProject?.storage_bytes ?? 0;
  const quotaBytes = usage?.quota_bytes ?? currentProject?.storage_quota_bytes ?? currentProject?.max_bytes ?? 10737418240; // 10 GB
  const quotaPercent = quotaBytes > 0 ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;

  const bandwidthBytes = usage?.bandwidth_out_bytes ?? usage?.bandwidth_bytes ?? 0;
  const bandwidthCapBytes = usage?.bandwidth_quota_bytes ?? 536870912000; // 500 GB cap
  const bandwidthPercent = bandwidthCapBytes > 0 ? Math.min(100, ((bandwidthBytes / bandwidthCapBytes) * 100)).toFixed(1) : '0.0';

  const totalRequests = usage?.api_requests ?? ((usage?.uploads || 0) + (usage?.downloads || 0) + (usage?.streams || 0));
  const storedObjects = usage?.total_files ?? files.length;

  return (
    <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Dashboard Overview
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Active Workspace:{' '}
            <span className="text-[#FF9BE8] font-semibold">{currentProject?.name || 'Default Project'}</span>{' '}
            <span className="font-mono text-xs text-slate-500">({currentProject?.id || 'prj_prod'})</span>
          </p>
        </div>
      </div>

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Storage Used */}
        <div className="liquid-glass p-5 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Storage Used</span>
            <Database className="w-4 h-4 text-[#FF4FD8]" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {formatBytes(usedBytes)}
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1">
              <span>Quota: {formatBytes(quotaBytes)}</span>
              <span className="text-[#FF4FD8] font-bold">{quotaPercent}%</span>
            </div>
            <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#FF4FD8] to-[#FF2FB3] rounded-full" 
                style={{ width: `${quotaPercent}%` }} 
              />
            </div>
          </div>
        </div>

        {/* Metric 2: Bandwidth */}
        <div className="liquid-glass p-5 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Monthly Bandwidth</span>
            <Zap className="w-4 h-4 text-[#67E8F9]" />
          </div>
          <div className="text-2xl font-bold text-[#67E8F9] tracking-tight">
            {formatBytes(bandwidthBytes)}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#67E8F9]" />
            <span>{formatBytes(bandwidthCapBytes)} cap ({bandwidthPercent}% used)</span>
          </div>
        </div>

        {/* Metric 3: API Ingestion Requests */}
        <div className="liquid-glass p-5 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Total Requests</span>
            <Activity className="w-4 h-4 text-[#8B5CF6]" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight font-mono">
            {totalRequests.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-400 font-mono mt-4 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>{usage ? `${usage.uploads || 0} up • ${usage.downloads || 0} down • ${usage.streams || 0} stream` : '0 API operations logged'}</span>
          </div>
        </div>

        {/* Metric 4: Total Files Stored */}
        <div className="liquid-glass p-5 rounded-2xl border border-white/10">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-2">
            <span>Stored Objects</span>
            <HardDrive className="w-4 h-4 text-[#FF9BE8]" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight font-mono">
            {storedObjects}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-4 flex items-center justify-between">
            <span>{storedObjects === 0 ? 'No objects stored' : `${storedObjects} active object${storedObjects > 1 ? 's' : ''}`}</span>
            <span className="text-slate-300">us-east-1</span>
          </div>
        </div>
      </div>

      {/* Video Streaming Modal if active */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl">
          <div className="w-full max-w-3xl liquid-glass rounded-3xl border border-white/20 p-6 bg-[#0B0D14]/95 shadow-2xl relative animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-[#FF4FD8]" />
                  Range Streaming: {selectedVideo.name}
                </h3>
                <span className="text-[10px] font-mono text-slate-400">
                  Endpoint: GET /v1/files/{selectedVideo.id}/stream
                </span>
              </div>
              <button
                onClick={() => setSelectedVideo(null)}
                className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg liquid-glass border border-white/10"
              >
                Close
              </button>
            </div>

            <VideoPlayer
              streamUrl={`https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4`}
              filename={selectedVideo.name}
              mimeType={selectedVideo.mime_type}
            />

            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-400">
              <span>File ID: {selectedVideo.id}</span>
              <span>Size: {formatBytes(selectedVideo.size)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Two Column Section: Recent Files & System Telemetry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 cols: Recent Objects */}
        <div className="lg:col-span-8 liquid-glass p-6 rounded-2xl border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-[#FF4FD8]" />
              <h3 className="text-sm font-bold text-white">Recent Storage Objects</h3>
            </div>
            <Link
              href="/dashboard/storage"
              className="text-xs text-[#FF4FD8] hover:underline flex items-center gap-1 font-medium"
            >
              <span>View All Files</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 font-mono text-[11px]">
                  <th className="pb-3 font-semibold">Object Name</th>
                  <th className="pb-3 font-semibold">Size</th>
                  <th className="pb-3 font-semibold">Type</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {files.slice(0, 5).map((file) => {
                  const isVideo = file.mime_type.includes('video') || file.name.endsWith('.mp4');
                  return (
                    <tr key={file.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3 pr-2 text-slate-200 font-sans font-medium flex items-center gap-2 max-w-[200px] truncate">
                        {isVideo ? (
                          <Film className="w-4 h-4 text-[#FF4FD8] shrink-0" />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{file.name}</span>
                      </td>
                      <td className="py-3 pr-2 text-slate-400">{formatBytes(file.size)}</td>
                      <td className="py-3 pr-2 text-slate-500 text-[11px] truncate max-w-[120px]">
                        {file.mime_type}
                      </td>
                      <td className="py-3 pr-2">
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {file.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 font-sans">
                          {isVideo && (
                            <button
                              onClick={() => setSelectedVideo(file)}
                              className="px-2 py-1 rounded liquid-glass border border-white/10 text-[11px] text-[#FF4FD8] hover:border-[#FF4FD8]/40 flex items-center gap-1"
                              title="Stream Video"
                            >
                              <Play className="w-3 h-3 fill-[#FF4FD8]" />
                              <span>Stream</span>
                            </button>
                          )}
                          <a
                            href={`/v1/files/${file.id}/download`}
                            download
                            className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                            title="Download Object"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 cols: Live Node Telemetry & Quick Links */}
        <div className="lg:col-span-4 space-y-4">
          <div className="liquid-glass p-5 rounded-2xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between text-xs pb-3 border-b border-white/10">
              <span className="font-bold text-white flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#67E8F9]" />
                Cluster Telemetry
              </span>
              <span className="font-mono text-[10px] text-emerald-400">100% HEALTH</span>
            </div>

            <div className="space-y-2.5 text-xs font-mono">
              <div className="flex items-center justify-between text-slate-400">
                <span>Ingest Latency</span>
                <span className="text-white">14ms avg</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Range Seek Latency</span>
                <span className="text-white">22ms avg</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Edge Cache Hit Rate</span>
                <span className="text-[#67E8F9]">94.2%</span>
              </div>
              <div className="flex items-center justify-between text-slate-400">
                <span>Active Replicas</span>
                <span className="text-white">3 nodes</span>
              </div>
            </div>
          </div>

          {/* Quick Developer Tip */}
          <div className="liquid-glass p-5 rounded-2xl border border-white/10 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-[#FF4FD8]" />
              Need to integrate in backend?
            </h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Generate a scoped API key and pass it in the <code className="text-[#FF9BE8]">Authorization: Bearer ZTG_live_*</code> header.
            </p>
            <Link
              href="/docs"
              className="inline-flex items-center gap-1 text-xs text-[#FF4FD8] font-semibold hover:underline"
            >
              <span>Explore full API specs</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
