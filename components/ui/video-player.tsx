'use client';

import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, RotateCcw, AlertCircle } from 'lucide-react';

interface VideoPlayerProps {
  streamUrl: string;
  filename: string;
  mimeType?: string;
  /**
   * Optional Bearer token (ZentraGrid API key).
   * Browser ka <video> tag Authorization header nahi bhej sakta, isliye jab token
   * diya ho toh hum GET /v1/files/{id}/stream se authenticated fetch karke
   * blob → object URL se playback karte hain.
   *
   * Render backend free tier so jata hai (cold start ~30-60s), isliye fetch
   * 60s tak retry-loop chalata hai — tab tak loading, success pe turant playback.
   */
  authToken?: string | null;
}

export default function VideoPlayer({ streamUrl, filename, mimeType, authToken }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [buffering, setBuffering] = useState(false);

  // Authenticated fetch state — authToken ho toh video ko tab tak KOI src nahi
  // (warna video bin Authorization ke 401 par turant error baitha deta hai)
  const [resolvedSrc, setResolvedSrc] = useState<string>(authToken ? '' : streamUrl);
  const [fetchingStream, setFetchingStream] = useState<boolean>(Boolean(authToken));
  const [fetchAttempt, setFetchAttempt] = useState(1);
  const [fetchElapsed, setFetchElapsed] = useState(0);
  const [retryTick, setRetryTick] = useState(0);

  // ================================================
  // Authenticated stream loader — 60s retry loop
  // ================================================
  useEffect(() => {
    if (!authToken) {
      setResolvedSrc(streamUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    const MAX_TOTAL_MS = 60_000; // total retry budget: 60 seconds
    const PER_ATTEMPT_MS = 20_000; // ek attempt ka timeout
    const RETRY_DELAY_MS = 2_500; // do attempts ke beech gap

    const startedAt = Date.now();
    setFetchingStream(true);
    setHasError(false);
    setResolvedSrc('');
    setFetchAttempt(1);
    setFetchElapsed(0);

    const elapsedTimer = window.setInterval(() => {
      if (!cancelled) setFetchElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      let attempt = 0;
      while (!cancelled) {
        attempt += 1;
        setFetchAttempt(attempt);

        const controller = new AbortController();
        const abortTimer = window.setTimeout(() => controller.abort(), PER_ATTEMPT_MS);

        try {
          const res = await fetch(streamUrl, {
            headers: { Authorization: `Bearer ${authToken}` },
            signal: controller.signal,
          });
          window.clearTimeout(abortTimer);

          if (res.ok) {
            const blob = await res.blob();
            if (cancelled) return;
            objectUrl = URL.createObjectURL(blob);
            setResolvedSrc(objectUrl);
            setFetchingStream(false);
            return;
          }

          // Auth/permission/file errors — retry ka fayda nahi
          if (res.status === 401 || res.status === 403 || res.status === 404) {
            break;
          }

          // Retryable (429 / 5xx / cold-start). Retry-After honor karo agar ho toh.
          const retryAfterHeader = res.headers.get('Retry-After');
          const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
          const waitMs = Math.max(retryAfterSeconds * 1000, RETRY_DELAY_MS);
          if (Date.now() - startedAt + waitMs > MAX_TOTAL_MS) break;
          await sleep(waitMs);
        } catch {
          // Network glitch ya abort — backend jaag raha ho sakta hai
          window.clearTimeout(abortTimer);
          if (cancelled) return;
          if (Date.now() - startedAt + RETRY_DELAY_MS > MAX_TOTAL_MS) break;
          await sleep(RETRY_DELAY_MS);
        }
      }

      if (!cancelled) {
        setFetchingStream(false);
        setHasError(true);
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(elapsedTimer);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [streamUrl, authToken, retryTick]);

  // ================================================
  // Video listeners — blob swap (remount) ke baad bhi attach rehna chahiye,
  // isliye deps resolvedSrc par hain ([] nahi)
  // ================================================
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setHasError(false);
    };
    const onLoadedData = () => setBuffering(false);
    const onCanPlay = () => setBuffering(false);
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      // Authenticated flow me blob ready hone tak video render hi nahi hota,
      // toh yahan only genuine decode/playback errors aate hain.
      if (resolvedSrc) {
        setHasError(true);
        setBuffering(false);
      }
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('loadeddata', onLoadedData);
    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnded);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('loadeddata', onLoadedData);
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnded);
      video.removeEventListener('error', onError);
    };
  }, [resolvedSrc]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    // State guessing ki jagah element ki asli paused property use karo
    if (video.paused || video.ended) {
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setHasError(true));
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = Math.max(0, Math.min(duration, pos * duration));
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
      setIsMuted(v === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleRetry = () => {
    if (authToken) {
      // Authenticated flow: 60s retry loop dobara start
      setRetryTick((t) => t + 1);
    } else if (videoRef.current) {
      videoRef.current.load();
      setHasError(false);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative rounded-2xl overflow-hidden liquid-glass border border-white/12 shadow-2xl bg-black group">
      {/* Video element — authenticated flow me blob ready hone par hi mount hota hai */}
      {resolvedSrc !== '' && (
        <video
          key={resolvedSrc}
          ref={videoRef}
          src={resolvedSrc}
          className="w-full aspect-video object-contain bg-black"
          onClick={togglePlay}
          playsInline
        />
      )}

      {/* Loading state — 60s retry loop ke dauran */}
      {resolvedSrc === '' && !hasError && fetchingStream && (
        <div className="w-full aspect-video bg-black flex flex-col items-center justify-center gap-4 px-6">
          <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
          <div className="text-center">
            <p className="text-xs text-slate-200 font-semibold">Stream load ho rahi hai…</p>
            <p className="text-[10px] font-mono text-slate-500 mt-1.5">
              GET /v1/files/&lt;id&gt;/stream • attempt #{Math.max(fetchAttempt, 1)} • {fetchElapsed}s / 60s
            </p>
            {fetchElapsed >= 5 && (
              <p className="text-[10px] text-amber-400/80 mt-1">
                Backend (Render) jaag raha hai — zyada se zyada 60s lag sakta hai
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty fallback (non-fetching, no src, no error — practically aya nahi) */}
      {resolvedSrc === '' && !hasError && !fetchingStream && (
        <div className="w-full aspect-video bg-black" />
      )}

      {/* Buffering indicator */}
      {buffering && resolvedSrc !== '' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state — sirf 60s ke saare attempts ke baad */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0D14]/95 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
          <h4 className="text-sm font-semibold text-white">Stream load nahi ho payi</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            {authToken
              ? '60s tak baar-baar koshish ki — backend so raha ho sakta hai ya key invalid/revoke hai.'
              : `Could not load "${filename}". Verify the backend stream endpoint.`}
          </p>
          {authToken && (
            <p className="text-[10px] font-mono text-slate-500 mt-2">
              File: {filename}
            </p>
          )}
          <button
            onClick={handleRetry}
            className="mt-4 px-3 py-1.5 rounded-lg liquid-glass border border-white/10 text-xs text-white hover:border-[#FF4FD8]/50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FF4FD8]" />
            Retry — 60s tak dobara koshish
          </button>
        </div>
      )}

      {/* Custom Liquid Glass Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#06070B]/90 via-[#06070B]/60 to-transparent transition-opacity opacity-90 group-hover:opacity-100">
        {/* Scrubber */}
        <div
          ref={progressRef}
          onClick={handleSeek}
          className="relative h-1.5 hover:h-2.5 w-full bg-white/20 rounded-full cursor-pointer transition-all mb-3 overflow-hidden"
        >
          <div
            className="absolute top-0 left-0 bottom-0 bg-gradient-to-r from-[#FF4FD8] to-[#67E8F9] rounded-full transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between text-xs text-slate-200">
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              disabled={resolvedSrc === ''}
              className="p-1.5 rounded-lg liquid-glass border border-white/15 hover:border-[#FF4FD8] text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4 text-[#FF4FD8]" /> : <Play className="w-4 h-4 text-[#FF4FD8]" />}
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
            <span className="font-mono text-[10px] text-slate-400 bg-white/10 px-2 py-0.5 rounded">
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
