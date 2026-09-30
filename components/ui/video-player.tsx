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
   * diya ho toh hum endpoint (GET /v1/files/{id}/stream) se authenticated fetch
   * karke blob → object URL se playback karte hain.
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

  const [resolvedSrc, setResolvedSrc] = useState<string>(streamUrl);
  const [fetchingStream, setFetchingStream] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // Authenticated stream ko blob fetch karke object URL banao
  useEffect(() => {
    if (!authToken) {
      setResolvedSrc(streamUrl);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;
    setFetchingStream(true);
    setHasError(false);

    fetch(streamUrl, {
      headers: { Authorization: `Bearer ${authToken}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setResolvedSrc(objectUrl);
        setFetchingStream(false);
      })
      .catch((err) => {
        console.warn('Authenticated stream fetch error:', err);
        if (!cancelled) {
          setFetchingStream(false);
          setHasError(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [streamUrl, authToken, retryTick]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onTimeUpdate = () => setCurrentTime(video.currentTime);
    const onLoadedMetadata = () => {
      setDuration(video.duration);
      setHasError(false);
    };
    const onWaiting = () => setBuffering(true);
    const onPlaying = () => {
      setBuffering(false);
      setIsPlaying(true);
    };
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      setHasError(true);
      setBuffering(false);
    };

    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('pause', onPause);
    video.addEventListener('error', onError);

    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('error', onError);
    };
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => setHasError(true));
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

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative rounded-2xl overflow-hidden liquid-glass border border-white/12 shadow-2xl bg-black group">
      {/* Video element */}
      <video
        key={resolvedSrc}
        ref={videoRef}
        src={resolvedSrc}
        className="w-full aspect-video object-contain bg-black"
        onClick={togglePlay}
        playsInline
      />

      {/* Authenticated blob fetch progress */}
      {fetchingStream && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3 pointer-events-none">
          <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-mono text-slate-300">
            Fetching stream — GET /v1/files/{filename}/stream
          </span>
        </div>
      )}

      {/* Buffering indicator */}
      {buffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 pointer-events-none">
          <div className="w-10 h-10 border-2 border-[#FF4FD8] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0B0D14]/95 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
          <h4 className="text-sm font-semibold text-white">Stream playback error</h4>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Could not stream range request for &quot;{filename}&quot;. Verify the backend supports Range headers or media encoding.
          </p>
          <button
            onClick={() => {
              if (authToken) {
                // Authenticated flow: blob fetch ko dobara trigger karo
                setResolvedSrc(streamUrl);
                setRetryTick((t) => t + 1);
              } else if (videoRef.current) {
                videoRef.current.load();
                setHasError(false);
              }
            }}
            className="mt-4 px-3 py-1.5 rounded-lg liquid-glass border border-white/10 text-xs text-white hover:border-[#FF4FD8]/50 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-[#FF4FD8]" />
            Retry Stream
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
              className="p-1.5 rounded-lg liquid-glass border border-white/15 hover:border-[#FF4FD8] text-white transition-all"
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
              {mimeType || 'video/mp4'} (Range Stream)
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
