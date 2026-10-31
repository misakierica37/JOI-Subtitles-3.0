import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Move, PictureInPicture2, Minus, Plus } from 'lucide-react';
import { hexToRgba } from '../utils/translationLogic';

export interface SeparateCaptionWindowProps {
  isOpen: boolean;
  onClose: () => void;
  englishText: string;
  romanianText: string;
  interimEnglish: string;
  isListening: boolean;
  isTranslating: boolean;
  fontSize: number;
  onChangeFontSize: (newSize: number) => void;
  bgOpacity: number; // 0 = completely transparent (default)
}

export const SeparateCaptionWindow: React.FC<SeparateCaptionWindowProps> = ({
  isOpen,
  onClose,
  englishText,
  romanianText,
  interimEnglish,
  isListening,
  isTranslating,
  fontSize,
  onChangeFontSize,
  bgOpacity,
}) => {
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 200, y: 675 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // Offscreen Canvas & Video for OS-level Always-on-Top PiP window on Linux Mint
  const pipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isPipActive, setIsPipActive] = useState(false);

  const paintPipCanvas = useCallback(() => {
    const canvas = pipCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    // Dark slate plate in video PiP (since video streams don't support OS alpha transparency)
    ctx.fillStyle = '#0B2220';
    ctx.fillRect(0, 0, width, height);

    const displayRo =
      romanianText || 'Pregătit pentru subtitrare în timp real (Engleză → Română)...';
    const displayEn = interimEnglish || englishText || '';

    if (displayEn) {
      ctx.font = '600 17px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#99F6E4';
      ctx.textAlign = 'center';
      ctx.fillText(displayEn.slice(0, 95), width / 2, 40);
    }

    const scaledFont = Math.min(44, Math.max(20, fontSize));
    ctx.font = `800 ${scaledFont}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';

    const words = displayRo.split(' ');
    const maxWidth = width - 56;
    let line = '';
    const lines: string[] = [];
    for (const w of words) {
      const testLine = line ? `${line} ${w}` : w;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = testLine;
      }
    }
    if (line) lines.push(line);

    lines.slice(-2).forEach((ln, idx) => {
      ctx.fillText(ln, width / 2, 92 + idx * (scaledFont + 8));
    });
  }, [romanianText, englishText, interimEnglish, fontSize]);

  useEffect(() => {
    if (isOpen) {
      paintPipCanvas();
    }
  }, [isOpen, paintPipCanvas]);

  useEffect(() => {
    const video = pipVideoRef.current;
    if (!video) return;
    const handleLeave = () => setIsPipActive(false);
    video.addEventListener('leavepictureinpicture', handleLeave);
    return () => video.removeEventListener('leavepictureinpicture', handleLeave);
  }, []);

  const handleTogglePip = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
        return;
      }
      paintPipCanvas();
      const canvas = pipCanvasRef.current;
      const video = pipVideoRef.current;
      if (!canvas || !video) return;
      const stream = canvas.captureStream(5);
      video.srcObject = stream;
      await video.play();
      await video.requestPictureInPicture();
      setIsPipActive(true);
    } catch {
      // Ignore if PiP is restricted in automated test environment
    }
  };

  if (!isOpen) return null;

  const plateBg =
    bgOpacity <= 0.01 ? 'transparent' : hexToRgba('#062422', bgOpacity);

  return (
    <>
      <canvas ref={pipCanvasRef} width={960} height={180} className="hidden" aria-hidden="true" />
      <video ref={pipVideoRef} muted playsInline className="hidden" />

      <div
        role="region"
        aria-label="Separate Live Captioning Window"
        data-testid="separate-caption-window"
        style={{
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          backgroundColor: plateBg,
        }}
        onPointerMove={(e) => {
          if (!isDragging) return;
          setPos({
            x: Math.max(12, Math.min(window.innerWidth - 360, e.clientX - dragOffset.current.dx)),
            y: Math.max(12, Math.min(window.innerHeight - 140, e.clientY - dragOffset.current.dy)),
          });
        }}
        onPointerUp={() => setIsDragging(false)}
        className="fixed z-50 w-[min(1040px,calc(100vw-32px))] rounded-2xl border-2 border-teal-700/40 transition-colors"
      >
        {/* Minimal Window Header Bar */}
        <div
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest('button')) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            setIsDragging(true);
            dragOffset.current = {
              dx: e.clientX - pos.x,
              dy: e.clientY - pos.y,
            };
          }}
          className="flex items-center justify-between gap-4 px-4 py-2 rounded-t-xl bg-[#0B3B38] text-teal-50 cursor-move select-none"
        >
          <div className="flex items-center gap-2 text-xs font-semibold">
            <Move className="w-3.5 h-3.5 text-teal-300" />
            <span>JOI Subtitles 3.0 — Separate Caption Window (Transparent Overlay)</span>
            {isListening && (
              <span className="ml-2 text-teal-200 font-mono">· Listening (EN → RO)</span>
            )}
            {isTranslating && (
              <span className="ml-1 text-amber-200 font-mono">· Translating...</span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onChangeFontSize(Math.max(18, fontSize - 2))}
              aria-label="Decrease subtitle font size"
              className="p-1 rounded bg-teal-800 hover:bg-teal-700 text-teal-100 cursor-pointer"
              title="Smaller text"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="text-xs font-mono px-1.5 text-teal-100 tabular-nums">
              {fontSize}px
            </span>
            <button
              type="button"
              onClick={() => onChangeFontSize(Math.min(56, fontSize + 2))}
              aria-label="Increase subtitle font size"
              className="p-1 rounded bg-teal-800 hover:bg-teal-700 text-teal-100 cursor-pointer"
              title="Larger text"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={handleTogglePip}
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium bg-teal-800 hover:bg-teal-700 text-white cursor-pointer whitespace-nowrap"
              title="Pop out Always-on-Top OS Picture-in-Picture window"
            >
              <PictureInPicture2 className="w-3.5 h-3.5" />
              <span>{isPipActive ? 'Exit PiP' : 'Pin on Top (PiP)'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              data-testid="close-caption-window-btn"
              aria-label="Close Separate Caption Window"
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-semibold bg-red-600 hover:bg-red-500 text-white cursor-pointer whitespace-nowrap"
            >
              <X className="w-3.5 h-3.5" />
              <span>Close Window</span>
            </button>
          </div>
        </div>

        {/* Transparent Caption Body with High-Contrast Outlined Text for Easy Readability Over Any Background */}
        <div
          data-testid="caption-transparent-stage"
          className="px-6 py-5 text-center select-text"
        >
          {(interimEnglish || englishText) && (
            <p
              data-testid="caption-english-source"
              style={{
                textShadow:
                  '0 1px 4px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 1)',
              }}
              className="text-sm font-semibold text-white mb-1.5 tracking-wide"
            >
              [EN] {interimEnglish || englishText}
            </p>
          )}

          <p
            data-testid="caption-romanian-output"
            style={{
              fontSize: `${fontSize}px`,
              lineHeight: 1.25,
              color: '#FFFFFF',
              WebkitTextStroke: '1.2px #042F2E',
              textShadow:
                '0 3px 8px rgba(4, 47, 46, 0.98), 0 1px 3px rgba(0, 0, 0, 0.98), 2px 2px 0px #042F2E, -2px -2px 0px #042F2E, 2px -2px 0px #042F2E, -2px 2px 0px #042F2E',
            }}
            className="font-extrabold tracking-tight break-words"
          >
            {romanianText || 'Subtitrările în limba română vor apărea aici...'}
          </p>
        </div>
      </div>
    </>
  );
};
