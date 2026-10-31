import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, AppWindow, Send } from 'lucide-react';
import {
  type TranscriptSegment,
  DEFAULT_CUSTOMIZATION,
  TranslationLruCache,
  appendTranscriptSegment,
  normalizeSpeechChunk,
  encodePcmToWav,
  computeRmsLevel,
  fallbackEnglishToRomanian,
} from './utils/translationLogic';
import { SeparateCaptionWindow } from './components/SeparateCaptionWindow';

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

const DEFAULT_FALLBACK_MICS: AudioInputDevice[] = [
  { deviceId: 'default', label: 'Default System Microphone' },
  { deviceId: 'alsa-internal', label: 'Built-in Audio Analog Stereo (Linux Mint)' },
  { deviceId: 'usb-headset', label: 'USB Presentation Headset Microphone' },
];

const INITIAL_SEGMENTS: TranscriptSegment[] = [
  {
    id: 'joi-1',
    english: "Welcome everyone to today's presentation on system architecture and performance.",
    romanian:
      'Bun venit tuturor la prezentarea de astăzi despre arhitectura sistemului și performanță.',
    startTimeMs: 1000,
    endTimeMs: 4800,
    confidence: 0.99,
    source: 'deepgram',
    cached: true,
    latencyMs: 32,
  },
  {
    id: 'joi-2',
    english: 'The floating caption bar stays on top of your slides and browser windows throughout the event.',
    romanian:
      'Bara plutitoare de subtitrări rămâne deasupra diapozitivelor și ferestrelor browserului pe tot parcursul evenimentului.',
    startTimeMs: 5200,
    endTimeMs: 9500,
    confidence: 0.99,
    source: 'deepgram',
    cached: true,
    latencyMs: 28,
  },
];

export default function App() {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isCaptionWindowOpen, setIsCaptionWindowOpen] = useState<boolean>(true);
  const [micLevel, setMicLevel] = useState<number>(0);

  // Microphone selection state
  const [microphones, setMicrophones] = useState<AudioInputDevice[]>(DEFAULT_FALLBACK_MICS);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');

  const [fontSize, setFontSize] = useState<number>(DEFAULT_CUSTOMIZATION.subtitleFontSize);
  const [bgOpacity, setBgOpacity] = useState<number>(DEFAULT_CUSTOMIZATION.subtitleOpacity);

  const [segments, setSegments] = useState<TranscriptSegment[]>(INITIAL_SEGMENTS);
  const [currentEnglish, setCurrentEnglish] = useState<string>(
    INITIAL_SEGMENTS[INITIAL_SEGMENTS.length - 1].english
  );
  const [currentRomanian, setCurrentRomanian] = useState<string>(
    INITIAL_SEGMENTS[INITIAL_SEGMENTS.length - 1].romanian
  );
  const [interimEnglish, setInterimEnglish] = useState<string>('');
  const [testInput, setTestInput] = useState<string>('');

  const clientCacheRef = useRef(new TranslationLruCache(250));
  const sessionStartMsRef = useRef<number>(Date.now() - 10000);
  const isListeningRef = useRef<boolean>(false);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const nativePollTimerRef = useRef<number | null>(null);
  const webSpeechDeliveredRef = useRef<number>(0);

  const loadAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      if (audioInputs.length > 0) {
        const mapped: AudioInputDevice[] = audioInputs.map((d, idx) => ({
          deviceId: d.deviceId || `mic-${idx}`,
          label: d.label || `Microphone ${idx + 1}`,
        }));
        setMicrophones(mapped);
        setSelectedMicId((prev) =>
          mapped.some((m) => m.deviceId === prev) ? prev : mapped[0].deviceId
        );
      }
    } catch {
      // Keep fallback microphone list if enumeration is restricted
    }
  }, []);

  useEffect(() => {
    loadAudioDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadAudioDevices);
      };
    }
  }, [loadAudioDevices]);

  const translateEnglishSpeech = useCallback(
    async (
      rawEnglish: string,
      source: 'deepgram' | 'webspeech' | 'rehearsal' = 'deepgram',
      confidence = 0.98
    ) => {
      const normalized = normalizeSpeechChunk(rawEnglish);
      if (!normalized) return;

      setCurrentEnglish(normalized);
      setInterimEnglish('');
      const startReq = Date.now();

      const commitTranslation = (
        romanianText: string,
        isCached: boolean,
        latency: number
      ) => {
        clientCacheRef.current.set(normalized, romanianText);
        setCurrentRomanian(romanianText);
        const nowOffset = Date.now() - sessionStartMsRef.current;
        const newSeg: TranscriptSegment = {
          id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          english: normalized,
          romanian: romanianText,
          startTimeMs: Math.max(0, nowOffset - 2200),
          endTimeMs: nowOffset,
          confidence,
          source,
          cached: isCached,
          latencyMs: latency,
        };
        setSegments((prev) => appendTranscriptSegment(prev, newSeg, 25).visibleSegments);
      };

      const cachedRo = clientCacheRef.current.get(normalized);
      if (cachedRo) {
        commitTranslation(cachedRo, true, 1);
        return;
      }

      setIsTranslating(true);
      try {
        try {
          const res = await fetch('/api/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: normalized }),
          });
          if (res.ok) {
            const data = (await res.json()) as {
              romanian?: string;
              cached?: boolean;
              latencyMs?: number;
            };
            if (data?.romanian) {
              commitTranslation(
                data.romanian,
                Boolean(data.cached),
                data.latencyMs || Math.max(1, Date.now() - startReq)
              );
              return;
            }
          }
        } catch {
          // Fall through to local Romanian fallback
        }
        const localRo = fallbackEnglishToRomanian(normalized);
        commitTranslation(localRo, false, Math.max(1, Date.now() - startReq));
      } finally {
        setIsTranslating(false);
      }
    },
    []
  );

  const handleStopListening = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    setInterimEnglish('');
    setMicLevel(0);

    if (nativePollTimerRef.current !== null) {
      window.clearInterval(nativePollTimerRef.current);
      nativePollTimerRef.current = null;
    }

    fetch('/api/listen/stop', { method: 'POST' }).catch(() => {});

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    if (processorNodeRef.current) {
      try {
        processorNodeRef.current.onaudioprocess = null;
        processorNodeRef.current.disconnect();
      } catch {}
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {}
      sourceNodeRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }

    if (mediaStreamRef.current) {
      try {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaStreamRef.current = null;
    }
  }, []);

  const handleStartListening = useCallback(async () => {
    if (isListeningRef.current) return;
    isListeningRef.current = true;
    setIsListening(true);
    setIsCaptionWindowOpen(true);
    setInterimEnglish('Listening for English speech...');

    // CRITICAL FOR FIREFOX: Create and resume AudioContext synchronously inside the click gesture
    // BEFORE awaiting navigator.mediaDevices.getUserMedia() so Firefox never leaves AudioContext suspended!
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    let preCreatedAudioCtx: AudioContext | null = null;
    if (AudioCtx) {
      try {
        preCreatedAudioCtx = new AudioCtx();
        audioContextRef.current = preCreatedAudioCtx;
        if (preCreatedAudioCtx.state === 'suspended') {
          preCreatedAudioCtx.resume().catch(() => {});
        }
      } catch {
        preCreatedAudioCtx = null;
      }
    }

    // Start local Linux Mint native ALSA microphone fallback listener (in case Firefox blocks/mutes mic on localhost)
    fetch('/api/listen/start', { method: 'POST' }).catch(() => {});
    if (nativePollTimerRef.current !== null) {
      window.clearInterval(nativePollTimerRef.current);
    }
    nativePollTimerRef.current = window.setInterval(async () => {
      if (!isListeningRef.current) return;
      try {
        const r = await fetch('/api/listen/poll', { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as {
          transcripts?: Array<{ text: string; confidence?: number }>;
          rmsLevel?: number;
        };
        if (typeof data.rmsLevel === 'number' && data.rmsLevel > 0) {
          setMicLevel((prev) => Math.max(prev, data.rmsLevel!));
        }
        if (Array.isArray(data.transcripts)) {
          for (const item of data.transcripts) {
            if (item.text?.trim()) {
              webSpeechDeliveredRef.current = Date.now();
              translateEnglishSpeech(item.text.trim(), 'deepgram', item.confidence ?? 0.95);
            }
          }
        }
      } catch {
        // Endpoint only present in local .deb server or when reachable
      }
    }, 700);

    const isRealDeviceId =
      selectedMicId &&
      selectedMicId !== 'default' &&
      selectedMicId !== 'alsa-internal' &&
      selectedMicId !== 'usb-headset';
    const audioConstraint: MediaTrackConstraints = isRealDeviceId
      ? {
          deviceId: { ideal: selectedMicId },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        };

    // 1. Start Browser SpeechRecognition in parallel if supported
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = 'en-US';
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              webSpeechDeliveredRef.current = Date.now();
              translateEnglishSpeech(
                transcript,
                'webspeech',
                event.results[i][0].confidence || 0.95
              );
            } else {
              interim += transcript;
            }
          }
          if (interim) {
            setInterimEnglish(interim);
          }
        };

        recognition.onerror = () => {};

        recognition.onend = () => {
          if (isListeningRef.current && recognitionRef.current === recognition) {
            try {
              recognition.start();
            } catch {}
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
      } catch {}
    }

    // 2. Capture Selected Microphone Stream in Firefox / Chromium for 16kHz RIFF WAV Speech Framing
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        if (!isListeningRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        mediaStreamRef.current = stream;
        loadAudioDevices().catch(() => {});

        const audioCtx = preCreatedAudioCtx || (AudioCtx ? new AudioCtx() : null);
        if (audioCtx) {
          audioContextRef.current = audioCtx;
          if (audioCtx.state === 'suspended') {
            await audioCtx.resume().catch(() => {});
          }
          const sourceNode = audioCtx.createMediaStreamSource(stream);
          const processor = audioCtx.createScriptProcessor(4096, 1, 1);
          // CRITICAL FOR FIREFOX: Store nodes in useRef so SpiderMonkey GC never collects them
          sourceNodeRef.current = sourceNode;
          processorNodeRef.current = processor;

          let pcmChunks: Float32Array[] = [];
          let totalSamples = 0;
          let speechDetectedInWindow = false;
          let lastSpeechTime = Date.now();
          let uploadChain = Promise.resolve();

          const uploadWavChunk = async (samplesToFlush: Float32Array, nativeSampleRate: number) => {
            if (!isListeningRef.current || samplesToFlush.length < nativeSampleRate * 0.35) return;
            if (Date.now() - webSpeechDeliveredRef.current < 1000) return;

            const wavBytes = encodePcmToWav(samplesToFlush, nativeSampleRate, 16000);
            const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });

            try {
              const resp = await fetch('/api/deepgram/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'audio/wav' },
                body: wavBlob,
              });
              if (resp.ok) {
                const dg = await resp.json();
                const text = dg.transcript?.trim();
                if (text && Date.now() - webSpeechDeliveredRef.current >= 800) {
                  translateEnglishSpeech(text, 'deepgram', dg.confidence ?? 0.96);
                }
              }
            } catch {
              // Ignore transient network error
            }
          };

          processor.onaudioprocess = (audioEvt) => {
            if (!isListeningRef.current) return;
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }
            const inputData = audioEvt.inputBuffer.getChannelData(0);
            const rms = computeRmsLevel(inputData);
            const scaledLevel = Math.min(100, Math.round(Math.sqrt(rms) * 190));
            setMicLevel(scaledLevel);

            const now = Date.now();
            const isSpeakingNow = rms > 0.0015;
            if (isSpeakingNow) {
              speechDetectedInWindow = true;
              lastSpeechTime = now;
            }

            if (speechDetectedInWindow) {
              const copy = new Float32Array(inputData.length);
              copy.set(inputData);
              pcmChunks.push(copy);
              totalSamples += copy.length;

              const durationSec = totalSamples / audioCtx.sampleRate;
              const silenceMs = now - lastSpeechTime;

              // Flush when speaker pauses for 420ms (after >= 0.45s speech) or reaches 2.5s phrase
              if ((durationSec >= 0.45 && silenceMs >= 420) || durationSec >= 2.5) {
                const merged = new Float32Array(totalSamples);
                let offset = 0;
                for (const c of pcmChunks) {
                  merged.set(c, offset);
                  offset += c.length;
                }
                pcmChunks = [];
                totalSamples = 0;
                speechDetectedInWindow = false;
                const rate = audioCtx.sampleRate;
                uploadChain = uploadChain
                  .then(() => uploadWavChunk(merged, rate))
                  .catch(() => {});
              }
            }
          };

          sourceNode.connect(processor);
          processor.connect(audioCtx.destination);
        }
      } catch {
        // If browser microphone permission is denied on localhost, native Linux Mint arecord listener continues in background
      }
    }
  }, [
    loadAudioDevices,
    selectedMicId,
    translateEnglishSpeech,
  ]);

  useEffect(() => {
    return () => handleStopListening();
  }, [handleStopListening]);

  const handleTestPhraseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!testInput.trim()) return;
    const phrase = testInput.trim();
    setTestInput('');
    setIsCaptionWindowOpen(true);
    translateEnglishSpeech(phrase, 'rehearsal', 1.0);
  };

  return (
    <div
      data-testid="joi-app-container"
      className="min-h-screen bg-[#E0F2F1] text-[#0F3F3C] flex flex-col justify-between"
    >
      {/* Clean Minimalist Top Header */}
      <header className="bg-[#CCFBF1] border-b border-teal-300/80 px-6 py-3 flex items-center justify-between gap-8">
        <span className="text-lg font-extrabold tracking-tight text-[#0B3B38] whitespace-nowrap shrink-0">
          JOI Subtitles 3.0
        </span>

        <div className="text-xs font-medium text-teal-800 flex items-center gap-2 whitespace-nowrap">
          <span>English Speech → Romanian Text</span>
          <span aria-hidden="true" className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Live Speech Recognition + Neural NMT</span>
          <span aria-hidden="true">·</span>
          <span>{isListening ? 'Status: Listening Live' : 'Status: Standby'}</span>
        </div>
      </header>

      {/* Simple, Uncluttered Main Control Card */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 pt-4 pb-44 flex flex-col gap-3.5">
        {/* Primary Essential Control Bar */}
        <section
          aria-label="Primary Controls"
          className="bg-[#F0FDFA] border border-teal-300 rounded-2xl p-4 shadow-xs space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-bold text-[#0B3B38]">
                Live Speech-to-Text Translation Controls
              </h1>
              <p className="text-xs text-teal-800/80">
                Lightweight Linux Mint edition. Captions render in a separate window with a
                transparent background.
              </p>
            </div>

            {/* Primary Control Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleStartListening}
                disabled={isListening}
                data-testid="start-listening-btn"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-45 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mic className="w-4 h-4" />
                <span>Start Listening</span>
              </button>

              <button
                type="button"
                onClick={handleStopListening}
                disabled={!isListening}
                data-testid="stop-listening-btn"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCaptionWindowOpen((prev) => !prev)}
                data-testid="open-close-caption-btn"
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-teal-900 hover:bg-teal-800 text-teal-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <AppWindow className="w-4 h-4" />
                <span>
                  {isCaptionWindowOpen ? 'Close Caption Window' : 'Open Caption Window'}
                </span>
              </button>
            </div>
          </div>

          {/* Microphone Selector Row + Live Input Level Meter */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2.5 border-t border-teal-200/80">
            <div className="flex items-center gap-3">
              <label
                htmlFor="microphone-select"
                className="text-xs font-semibold text-teal-900 whitespace-nowrap"
              >
                Microphone
              </label>
              {isListening && (
                <div
                  className="w-20 h-2 bg-teal-200 rounded-full overflow-hidden"
                  title="Live Microphone Input Level"
                >
                  <div
                    className="h-full bg-[#0D9488] transition-all duration-75"
                    style={{ width: `${Math.max(8, micLevel)}%` }}
                  />
                </div>
              )}
            </div>
            <select
              id="microphone-select"
              data-testid="microphone-select"
              value={selectedMicId}
              onChange={(e) => setSelectedMicId(e.target.value)}
              onClick={() => loadAudioDevices()}
              className="flex-1 max-w-md px-3 py-1.5 text-xs font-medium rounded-xl bg-white border border-teal-300 text-[#0F3F3C] focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
          </div>

          {/* Compact Subtitle Size & Background Opacity Bar (No parenthetical text) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2.5 border-t border-teal-200/80">
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="joi-font-size" className="text-xs font-semibold text-teal-900 whitespace-nowrap">
                Caption Text Size
              </label>
              <input
                id="joi-font-size"
                data-testid="caption-size-slider"
                type="range"
                min={20}
                max={54}
                value={fontSize}
                onChange={(e) => setFontSize(Number(e.target.value))}
                className="w-44 accent-[#0D9488] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <label htmlFor="joi-bg-opacity" className="text-xs font-semibold text-teal-900 whitespace-nowrap">
                Caption Backdrop Opacity
              </label>
              <input
                id="joi-bg-opacity"
                data-testid="caption-opacity-slider"
                type="range"
                min={0}
                max={90}
                value={Math.round(bgOpacity * 100)}
                onChange={(e) => setBgOpacity(Number(e.target.value) / 100)}
                className="w-36 accent-[#0D9488] cursor-pointer"
              />
            </div>
          </div>
        </section>

        {/* Simple Live Speech Input & Recent Translations */}
        <section className="bg-[#F0FDFA] border border-teal-300 rounded-2xl p-4 shadow-xs space-y-2.5">
          <form onSubmit={handleTestPhraseSubmit} className="flex items-center gap-2.5">
            <label htmlFor="english-speech-input" className="sr-only">
              Type English speech to translate to Romanian
            </label>
            <input
              id="english-speech-input"
              data-testid="english-speech-input"
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              placeholder="Speak into microphone or type English speech here to display in the Caption Window..."
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-teal-300 text-[#0F3F3C] placeholder:text-teal-700/50 focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              data-testid="translate-submit-btn"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Translate</span>
            </button>
          </form>

          <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1" data-testid="transcript-list">
            {segments
              .slice()
              .reverse()
              .map((seg) => (
                <div
                  key={seg.id}
                  onClick={() => {
                    setCurrentEnglish(seg.english);
                    setCurrentRomanian(seg.romanian);
                    setIsCaptionWindowOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#E0F2F1]/70 hover:bg-[#CCFBF1] border border-teal-300/70 cursor-pointer transition-colors"
                >
                  <p className="text-[11px] text-teal-800 truncate">{seg.english}</p>
                  <p className="text-xs font-bold text-[#0B3B38] truncate">{seg.romanian}</p>
                </div>
              ))}
          </div>
        </section>
      </main>

      {/* Separate Openable/Closeable Captioning Window with Transparent Background & Readable Outlined Text */}
      <SeparateCaptionWindow
        isOpen={isCaptionWindowOpen}
        onClose={() => setIsCaptionWindowOpen(false)}
        englishText={currentEnglish}
        romanianText={currentRomanian}
        interimEnglish={interimEnglish}
        isListening={isListening}
        isTranslating={isTranslating}
        fontSize={fontSize}
        onChangeFontSize={setFontSize}
        bgOpacity={bgOpacity}
      />
    </div>
  );
}
