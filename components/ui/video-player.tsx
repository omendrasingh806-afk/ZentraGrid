'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import Hls from 'hls.js';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  filename: string;
  mimeType?: string;
  /** Bearer token (ZentraGrid API key) — stream endpoint developer API hai */
  authToken?: string | null;
  /** Loading ke waqt dikhane ke liye thumbnail (perceived speed) */
  poster?: string;
}

type LoadMode = 'idle' | 'hls' | 'mse' | 'blob' | 'direct';

const MAX_TOTAL_MS = 60_000; // 60s tak wake-up retry
const RETRY_DELAY_MS = 2_500;
const MSE_CHUNK = 2 * 1024 * 1024; // 2 MiB parallel-friendly chunks
const MSE_METADATA_TIMEOUT = 9_000; // itne me metadata na aaye toh blob fallback

export default function VideoPlayer({
  streamUrl,
  filename,
  mimeType,
  authToken,
  poster,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [buffering, setBuffering] = useState(false);

  const [ready, setReady] = useState(false); // playable media attached
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<LoadMode>('idle');
  const [attempt, setAttempt] = useState(1);
  const [elapsed, setElapsed] = useState(0);
  const [retryTick, setRetryTick] = useState(0);

  const isHlsSource = streamUrl.includes('.m3u8');

  // ==========================================================
  // Media loading: HLS → (MP4) MSE progressive → blob fallback
  // ==========================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let objectUrl: string | null = null;
    const abort = new AbortController();
    const startedAt = Date.now();

    setLoading(true);
    setReady(false);
    setHasError(false);
    setAttempt(1);
    setElapsed(0);

    const elapsedTimer = window.setInterval(() => {
      if (!cancelled) setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const authHeaders = (extra: Record<string, string> = {}) =>
      authToken ? { Authorization: `Bearer ${authToken}`, ...extra } : { ...extra };

    // ---------- 1. HLS (best result: adaptive + instant start) ----------
    const loadHls = (): boolean => {
      if (!isHlsSource) return false;

      // Safari: native HLS
      if (!Hls.isSupported() && video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = streamUrl;
        video.preload = 'auto';
        setMode('hls');
        setReady(true);
        setLoading(false);
        return true;
      }

      if (!Hls.isSupported()) return false;

      const hls = new Hls({
        maxBufferLength: 30,
        startLevel: 0, // chhoti quality se turant start, phir upgrade
        capLevelToPlayerSize: true,
        lowLatencyMode: false,
        // Har segment/playlist request par Authorization lagao
        xhrSetup: (xhr: XMLHttpRequest) => {
          if (authToken) xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
        },
      });
      hlsRef.current = hls;

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setMode('hls');
        setReady(true);
        setLoading(false);
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled || !data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad(); // network hiccup → resume
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          hlsRef.current = null;
          setHasError(true);
          setLoading(false);
        }
      });

      hls.loadSource(streamUrl);
      hls.attachMedia(video);
      return true;
    };

    // ---------- 2. MP4 progressive streaming via MSE + Range ----------
    const appendChunk = (sb: SourceBuffer, buf: ArrayBuffer) =>
      new Promise<void>((resolve, reject) => {
        const done = () => {
          sb.removeEventListener('updateend', done);
          sb.removeEventListener('error', fail);
          resolve();
        };
        const fail = () => {
          sb.removeEventListener('updateend', done);
          sb.removeEventListener('error', fail);
          reject(new Error('SourceBuffer append failed'));
        };
        sb.addEventListener('updateend', done);
        sb.addEventListener('error', fail);
        try {
          sb.appendBuffer(buf);
        } catch (err) {
          sb.removeEventListener('updateend', done);
          sb.removeEventListener('error', fail);
          reject(err);
        }
      });

    const loadViaMSE = async (): Promise<boolean> => {
      if (typeof window === 'undefined' || !('MediaSource' in window)) return false;

      const candidates = [
        'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
        'video/mp4; codecs="avc1.4d401f,mp4a.40.2"',
        'video/mp4',
      ];
      const sbType = candidates.find((t) => MediaSource.isTypeSupported(t));
      if (!sbType) return false;

      const mediaSource = new MediaSource();
      const msUrl = URL.createObjectURL(mediaSource);
      video.src = msUrl;
      video.preload = 'auto';

      await new Promise<void>((resolve) =>
        mediaSource.addEventListener('sourceopen', () => resolve(), { once: true })
      );
      if (cancelled) {
        URL.revokeObjectURL(msUrl);
        return false;
      }

      let sourceBuffer: SourceBuffer;
      try {
        sourceBuffer = mediaSource.addSourceBuffer(sbType);
      } catch {
        URL.revokeObjectURL(msUrl);
        return false;
      }

      // Watchdog: fragmented nahi hai toh metadata kabhi nahi aayega → fallback
      const metadataOk = new Promise<boolean>((resolve) => {
        const ok = () => resolve(true);
        video.addEventListener('loadedmetadata', ok, { once: true });
        setTimeout(() => {
          video.removeEventListener('loadedmetadata', ok);
          resolve(video.readyState >= 1);
        }, MSE_METADATA_TIMEOUT);
      });

      let offset = 0;
      let total = Number.POSITIVE_INFINITY;
      let firstChunkDone = false;

      try {
        while (!cancelled && offset < total) {
          const res = await fetch(streamUrl, {
            headers: authHeaders({ Range: `bytes=${offset}-${offset + MSE_CHUNK - 1}` }),
            signal: abort.signal,
          });
          if (res.status !== 206 && res.status !== 200) throw new Error(`HTTP ${res.status}`);

          const contentRange = res.headers.get('Content-Range');
          if (contentRange) {
            const parsedTotal = parseInt(contentRange.split('/')[1], 10);
            if (!Number.isNaN(parsedTotal)) total = parsedTotal;
          } else if (res.status === 200) {
            total = Number.parseInt(res.headers.get('Content-Length') || '0', 10) || total;
          }

          const buf = await res.arrayBuffer();
          if (buf.byteLength === 0) break;
          if (cancelled) break;

          await appendChunk(sourceBuffer, buf);
          offset += buf.byteLength;

          if (!firstChunkDone) {
            firstChunkDone = true;
            // Pehla chunk lagte hi playable? tab UI turant khol do
            const gotMeta = await Promise.race([
              metadataOk,
              new Promise<boolean>((r) => setTimeout(() => r(video.readyState >= 1), 1200)),
            ]);
            if (!gotMeta && video.readyState < 1) {
              // fragmented mp4 nahi — MSE chhodo
              try {
                mediaSource.endOfStream();
              } catch {
                /* noop */
              }
              URL.revokeObjectURL(msUrl);
              return false;
            }
            if (!cancelled) {
              setMode('mse');
              setReady(true);
              setLoading(false);
            }
          }
        }

        if (!cancelled && mediaSource.readyState === 'open') {
          try {
            mediaSource.endOfStream();
          } catch {
            /* noop */
          }
        }
        return true;
      } catch {
        try {
          if (mediaSource.readyState === 'open') mediaSource.endOfStream();
        } catch {
          /* noop */
        }
        URL.revokeObjectURL(msUrl);
        return false;
      }
    };

    // ---------- 3. Blob fallback (poori file, last resort) ----------
    const loadViaBlob = async (): Promise<boolean> => {
      const res = await fetch(streamUrl, {
        headers: authHeaders(),
        signal: abort.signal,
      });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      const blob = await res.blob();
      if (cancelled) return false;
      objectUrl = URL.createObjectURL(blob);
      video.src = objectUrl;
      video.preload = 'auto';
      setMode('blob');
      setReady(true);
      setLoading(false);
      return true;
    };

    // ---------- Orchestration with 60s wake-up retry ----------
    (async () => {
      // No auth needed → seedha src (browser khud Range karega)
      if (!authToken && !isHlsSource) {
        video.src = streamUrl;
        video.preload = 'metadata';
        setMode('direct');
        setReady(true);
        setLoading(false);
        window.clearInterval(elapsedTimer);
        return;
      }

      if (loadHls()) return; // HLS apna error handling khud karta hai

      let tries = 0;
      while (!cancelled) {
        tries += 1;
        setAttempt(tries);
        try {
          const streamed = await loadViaMSE();
          if (streamed || cancelled) return;
          const blobbed = await loadViaBlob();
          if (blobbed || cancelled) return;
        } catch (err: unknown) {
          const status = (err as { status?: number })?.status;
          // Auth/file errors → retry bekaar
          if (status === 401 || status === 403 || status === 404) break;
        }
        if (cancelled) return;
        if (Date.now() - startedAt + RETRY_DELAY_MS > MAX_TOTAL_MS) break;
        await sleep(RETRY_DELAY_MS);
      }

      if (!cancelled) {
        setLoading(false);
        setHasError(true);
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      window.clearInterval(elapsedTimer);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [streamUrl, authToken, isHlsSource, retryTick]);

  // ==========================================================
  // Media element listeners — src/mode badalne par re-attach
  // ==========================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onDurationChange = () => setDuration(video.duration);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setHasError(false);
    };
    const onCanPlay = () => setBuffering(false);
    const onWaiting = () => setBuffering(true);
    const onPlay = () => setIsPlaying(true);
    const onPlaying = () => {
      setBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('play', onPlay);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
    };
  }, [ready, mode]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video || !ready) return;
    if (video.paused || video.ended) {
      video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, [ready]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || !progressRef.current || !duration || !isFinite(duration)) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pos * duration));
    video.currentTime = newTime; // Range request backend handle karta hai
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    const video = videoRef.current;
    if (video) {
      video.volume = v;
      video.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const toggleFullscreen = () => {
    videoRef.current?.requestFullscreen?.();
  };

  const formatTime = (secs: number) => {
    if (!isFinite(secs) || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 && isFinite(duration) ? (currentTime / duration) * 100 : 0;

  const modeLabel =
    mode === 'hls'
      ? 'HLS adaptive'
      : mode === 'mse'
      ? 'Range streaming'
      : mode === 'blob'
      ? 'Buffered'
      : mode === 'direct'
      ? 'Progressive'
      : '';

  return (
    <div className="relative rounded-2xl overflow-hidden liquid-glass border border-white/12 shadow-2xl bg-black group">
      <video
        ref={videoRef}
        poster={poster}
        preload="metadata"
        className={`w-full aspect-video object-contain bg-black ${ready ? '' : 'invisible absolute'}`}
        onClick={togglePlay}
        playsInline
      />

      {/* Loading — poster ke upar, 60s wake-up window */}
      {!ready && !hasError && loading && (
        <div className="w-full aspect-video bg-black flex flex-col items-center justify-center gap-4 px-6 relative">
          {poster && (
            <img
              src={poster}
              alt=""
              className="absolute inset-0 w-full h-full object-cover opacity-30 blur-[1px]"
            />
          )}
          <div className="relative z-10 flex flex-col items-center gap-3">
            <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-xs text-slate-200 font-semibold">Stream load ho rahi hai…</p>
              <p className="text-[10px] font-mono text-slate-500 mt-1.5">
                {isHlsSource ? 'HLS playlist' : 'Range chunks'} • attempt #{attempt} • {elapsed}s / 60s
              </p>
              {elapsed >= 5 && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  Backend jaag raha hai — 60s tak koshish jaari rahegi
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {buffering && ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0D14]/95 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
          <h4 className="text-sm font-semibold text-white">Stream load nahi ho payi</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            60s tak koshish ki — backend so raha ho sakta hai, key invalid/revoked ho, ya file encoding
            supported nahi hai.
          </p>
          <p className="text-[10px] font-mono text-slate-500 mt-2">{filename}</p>
          <button
            onClick={() => setRetryTick((t) => t + 1)}
            className="mt-4 px-3 py-1.5 rounded-lg liquid-glass border border-white/10 text-xs text-white hover:border-[#FF4FD8]/50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FF4FD8]" />
            Retry — 60s tak dobara koshish
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#06070B]/90 via-[#06070B]/60 to-transparent transition-opacity opacity-90 group-hover:opacity-100">
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="relative h-1.5 hover:h-2.5 w-full bg-white/20 rounded-full cursor-pointer transition-all mb-3 overflow-hidden"
        >
          <div
            className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#FF4FD8] to-[#67E8F9] rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-xs text-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={!ready}
              className="p-1.5 rounded-lg liquid-glass border border-white/15 hover:border-[#FF4FD8] text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 text-[#FF4FD8]" />
              ) : (
                <Play className="w-4 h-4 text-[#FF4FD8]" />
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="text-slate-300 hover:text-white p-1"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-[#FF4FD8] bg-white/20 rounded-lg cursor-pointer"
                aria-label="Volume slider"
              />
            </div>

            <div className="font-mono text-[11px] text-slate-400 ml-2">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {modeLabel && (
              <span className="font-mono text-[10px] text-slate-400 bg-white/10 px-2 py-0.5 rounded">
                {modeLabel}
              </span>
            )}
            <span className="hidden sm:inline font-mono text-[10px] text-slate-400 bg-white/10 px-2 py-0.5 rounded">
              {mimeType || 'video/mp4'}
            </span>
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Fullscreen"
            >
              <Maximize className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
