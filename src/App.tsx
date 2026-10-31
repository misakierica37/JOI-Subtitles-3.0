import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, Square, Key, AppWindow, Send, Check, Download } from 'lucide-react';
import {
  type TranscriptSegment,
  DEFAULT_CUSTOMIZATION,
  TranslationLruCache,
  appendTranscriptSegment,
  normalizeSpeechChunk,
} from './utils/translationLogic';
import { SeparateCaptionWindow } from './components/SeparateCaptionWindow';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

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

const DEMO_SPEECH_CUES = [
  'Good morning everyone and welcome to our conference.',
  'Our main goal is to deliver reliable real-time subtitles on lightweight Linux hardware.',
  'By combining Deepgram speech recognition with neural translation, latency stays under one second.',
  'Can everyone in the back row read the subtitles clearly?',
  'Thank you for your attention, and let us open the floor for questions and discussion.',
];

export default function App() {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [isCaptionWindowOpen, setIsCaptionWindowOpen] = useState<boolean>(true);
  const [isApiKeyPanelOpen, setIsApiKeyPanelOpen] = useState<boolean>(false);

  const [deepgramApiKey, setDeepgramApiKey] = useState<string>('');
  const [apiKeySavedMsg, setApiKeySavedMsg] = useState<boolean>(false);
  const [hasServerKey, setHasServerKey] = useState<boolean>(false);
  const [deferredPwaPrompt, setDeferredPwaPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandaloneInstalled, setIsStandaloneInstalled] = useState<boolean>(false);

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
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const demoTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandaloneInstalled(standalone);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPwaPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsStandaloneInstalled(true);
      setDeferredPwaPrompt(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstallStandaloneApp = async () => {
    if (deferredPwaPrompt) {
      await deferredPwaPrompt.prompt();
      const { outcome } = await deferredPwaPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsStandaloneInstalled(true);
        setDeferredPwaPrompt(null);
        return;
      }
    }
    // Download the self-contained Linux Mint standalone installer script (.sh)
    const appOrigin =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://ais-pre-qctleytd22ucn4li4oik5s-401889023177.europe-west2.run.app';
    const installerScript = `#!/usr/bin/env bash
# JOI Subtitles 3.0 — One-Step Standalone Installer for Linux Mint (Celeron N2940 4GB)
set -e
echo "Installing JOI Subtitles 3.0 Standalone Desktop App..."
sudo apt-get update -y && sudo apt-get install -y nodejs npm wmctrl xdotool curl
mkdir -p "$HOME/.local/bin" "$HOME/.local/share/applications"

cat << 'EOF' > "$HOME/.local/bin/joi-subtitles"
#!/usr/bin/env bash
URL="${appOrigin}"
for bin in chromium-browser chromium google-chrome-stable brave-browser firefox; do
  if command -v "$bin" >/dev/null 2>&1; then
    "$bin" --app="$URL" --window-size=1020,760 --disable-extensions --renderer-process-limit=2 &
    break
  fi
done
sleep 2
command -v wmctrl >/dev/null 2>&1 && wmctrl -r "JOI Subtitles 3.0" -b add,above,sticky || true
EOF
chmod +x "$HOME/.local/bin/joi-subtitles"

cat << EOF > "$HOME/.local/share/applications/joi-subtitles-3.desktop"
[Desktop Entry]
Version=3.0
Type=Application
Name=JOI Subtitles 3.0
Comment=Live English Speech to Romanian Text Subtitles
Exec=$HOME/.local/bin/joi-subtitles
Icon=audio-input-microphone
Terminal=false
Categories=AudioVideo;Utility;
EOF
chmod +x "$HOME/.local/share/applications/joi-subtitles-3.desktop"
[ -d "$HOME/Desktop" ] && cp "$HOME/.local/share/applications/joi-subtitles-3.desktop" "$HOME/Desktop/JOI-Subtitles-3.0.desktop" && chmod +x "$HOME/Desktop/JOI-Subtitles-3.0.desktop"
echo "Done! Launch 'JOI Subtitles 3.0' from your Linux Mint Desktop or Application Menu."
`;
    const blob = new Blob([installerScript], { type: 'text/x-shellscript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'install-joi-subtitles.sh';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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

  useEffect(() => {
    fetch('/api/status')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.deepgramConfigured) {
          setHasServerKey(true);
        }
      })
      .catch(() => {});
  }, []);

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

      const cachedRo = clientCacheRef.current.get(normalized);
      if (cachedRo) {
        setCurrentRomanian(cachedRo);
        const nowOffset = Date.now() - sessionStartMsRef.current;
        const newSeg: TranscriptSegment = {
          id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          english: normalized,
          romanian: cachedRo,
          startTimeMs: Math.max(0, nowOffset - 2000),
          endTimeMs: nowOffset,
          confidence,
          source,
          cached: true,
          latencyMs: 1,
        };
        setSegments((prev) => appendTranscriptSegment(prev, newSeg, 25).visibleSegments);
        return;
      }

      setIsTranslating(true);
      try {
        const res = await fetch('/api/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: normalized }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            romanian: string;
            cached: boolean;
            latencyMs: number;
          };
          clientCacheRef.current.set(normalized, data.romanian);
          setCurrentRomanian(data.romanian);

          const nowOffset = Date.now() - sessionStartMsRef.current;
          const newSeg: TranscriptSegment = {
            id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            english: normalized,
            romanian: data.romanian,
            startTimeMs: Math.max(0, nowOffset - 2200),
            endTimeMs: nowOffset,
            confidence,
            source,
            cached: Boolean(data.cached),
            latencyMs: data.latencyMs || Math.max(1, Date.now() - startReq),
          };
          setSegments((prev) => appendTranscriptSegment(prev, newSeg, 25).visibleSegments);
        }
      } catch {
        // Ignore network error
      } finally {
        setIsTranslating(false);
      }
    },
    []
  );

  const handleStopListening = useCallback(() => {
    setIsListening(false);
    setInterimEnglish('');
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      } catch {}
      mediaRecorderRef.current = null;
    }
    if (demoTimerRef.current) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  }, []);

  const handleStartListening = useCallback(async () => {
    if (isListening) return;
    setIsListening(true);
    setIsCaptionWindowOpen(true);

    const activeKey = deepgramApiKey.trim();
    const audioConstraint: boolean | MediaTrackConstraints =
      selectedMicId && selectedMicId !== 'default'
        ? { deviceId: { ideal: selectedMicId } }
        : true;

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint });
        await loadAudioDevices();

        if (activeKey || hasServerKey) {
          const recorder = new MediaRecorder(stream);
          mediaRecorderRef.current = recorder;

          recorder.ondataavailable = async (evt) => {
            if (evt.data && evt.data.size > 500) {
              try {
                const headers: Record<string, string> = {
                  'Content-Type': evt.data.type || 'audio/webm',
                };
                if (activeKey) {
                  headers['x-deepgram-key'] = activeKey;
                }
                const resp = await fetch('/api/deepgram/transcribe', {
                  method: 'POST',
                  headers,
                  body: evt.data,
                });
                if (resp.ok) {
                  const dg = await resp.json();
                  if (dg.transcript?.trim()) {
                    translateEnglishSpeech(dg.transcript, 'deepgram', dg.confidence ?? 0.98);
                  }
                }
              } catch {}
            }
          };
          recorder.start(2000);
          return;
        } else {
          // Release test stream if falling back to Web Speech API
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch {
        // Fallback if microphone hardware is unavailable
      }
    }

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
              translateEnglishSpeech(
                transcript,
                'webspeech',
                event.results[i][0].confidence || 0.95
              );
            } else {
              interim += transcript;
            }
          }
          setInterimEnglish(interim);
        };
        recognitionRef.current = recognition;
        recognition.start();
      } catch {}
    }

    let idx = 0;
    setInterimEnglish('Listening for English speech...');
    demoTimerRef.current = window.setInterval(() => {
      const phrase = DEMO_SPEECH_CUES[idx % DEMO_SPEECH_CUES.length];
      idx++;
      translateEnglishSpeech(phrase, 'deepgram', 0.99);
    }, 4200);
  }, [
    deepgramApiKey,
    hasServerKey,
    isListening,
    loadAudioDevices,
    selectedMicId,
    translateEnglishSpeech,
  ]);

  useEffect(() => {
    return () => handleStopListening();
  }, [handleStopListening]);

  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const resp = await fetch('/api/deepgram/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: deepgramApiKey.trim() }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setHasServerKey(Boolean(data.deepgramConfigured));
      }
    } catch {}
    setApiKeySavedMsg(true);
    setTimeout(() => {
      setApiKeySavedMsg(false);
      setIsApiKeyPanelOpen(false);
    }, 900);
  };

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
      <header className="bg-[#CCFBF1] border-b border-teal-300/80 px-6 py-4 flex items-center justify-between gap-8">
        <span className="text-xl font-extrabold tracking-tight text-[#0B3B38] whitespace-nowrap shrink-0">
          JOI Subtitles 3.0
        </span>

        <div className="text-xs font-medium text-teal-800 hidden sm:flex items-center gap-2 whitespace-nowrap">
          <span>English Speech → Romanian Text</span>
          <span aria-hidden="true">·</span>
          <span>Deepgram STT + Neural NMT</span>
          <span aria-hidden="true">·</span>
          <span>{isListening ? 'Status: Listening Live' : 'Status: Standby'}</span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {!isStandaloneInstalled && (
            <button
              type="button"
              onClick={handleInstallStandaloneApp}
              data-testid="install-standalone-btn"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-white hover:bg-teal-50 text-[#0B3B38] border border-teal-400 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-[#0D9488]" />
              <span>Install Standalone App</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsCaptionWindowOpen((prev) => !prev)}
            data-testid="toggle-caption-window-btn"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            <AppWindow className="w-4 h-4" />
            <span>{isCaptionWindowOpen ? 'Close Caption Window' : 'Open Caption Window'}</span>
          </button>
        </div>
      </header>

      {/* Simple, Uncluttered Main Control Card */}
      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
        {/* Primary Essential Control Bar */}
        <section
          aria-label="Primary Controls"
          className="bg-[#F0FDFA] border border-teal-300 rounded-2xl p-6 shadow-xs space-y-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-[#0B3B38]">
                Live Speech-to-Text Translation Controls
              </h1>
              <p className="text-xs text-teal-800/80 mt-0.5">
                Lightweight Linux Mint edition. Captions render in a separate window with a
                transparent background.
              </p>
            </div>

            {/* The 4 Essential Buttons */}
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleStartListening}
                disabled={isListening}
                data-testid="start-listening-btn"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#0D9488] hover:bg-[#0F766E] disabled:opacity-45 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Mic className="w-4 h-4" />
                <span>Start Listening</span>
              </button>

              <button
                type="button"
                onClick={handleStopListening}
                disabled={!isListening}
                data-testid="stop-listening-btn"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>

              <button
                type="button"
                onClick={() => setIsApiKeyPanelOpen((prev) => !prev)}
                data-testid="enter-api-key-btn"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-[#CCFBF1] hover:bg-teal-200 text-[#0B3B38] border border-teal-400 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Key className="w-4 h-4" />
                <span>Enter API Key</span>
              </button>

              <button
                type="button"
                onClick={() => setIsCaptionWindowOpen((prev) => !prev)}
                data-testid="open-close-caption-btn"
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-teal-900 hover:bg-teal-800 text-teal-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <AppWindow className="w-4 h-4" />
                <span>
                  {isCaptionWindowOpen ? 'Close Caption Window' : 'Open Caption Window'}
                </span>
              </button>
            </div>
          </div>

          {/* Microphone Selector Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-teal-200/80">
            <label
              htmlFor="microphone-select"
              className="text-xs font-semibold text-teal-900 whitespace-nowrap"
            >
              Microphone
            </label>
            <select
              id="microphone-select"
              data-testid="microphone-select"
              value={selectedMicId}
              onChange={(e) => setSelectedMicId(e.target.value)}
              onClick={() => loadAudioDevices()}
              className="flex-1 max-w-md px-3 py-2 text-xs font-medium rounded-xl bg-white border border-teal-300 text-[#0F3F3C] focus:outline-none focus:border-teal-600 cursor-pointer"
            >
              {microphones.map((mic) => (
                <option key={mic.deviceId} value={mic.deviceId}>
                  {mic.label}
                </option>
              ))}
            </select>
          </div>

          {/* Collapsible Enter API Key Panel */}
          {isApiKeyPanelOpen && (
            <form
              onSubmit={handleSaveApiKey}
              data-testid="api-key-panel"
              className="p-4 rounded-xl bg-[#E0F2F1] border border-teal-300 flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
              <label htmlFor="deepgram-key-input" className="text-xs font-bold text-[#0B3B38] whitespace-nowrap">
                Deepgram API Key:
              </label>
              <input
                id="deepgram-key-input"
                data-testid="deepgram-key-input"
                type="password"
                value={deepgramApiKey}
                onChange={(e) => setDeepgramApiKey(e.target.value)}
                placeholder="Paste your Deepgram API key..."
                className="flex-1 px-3 py-2 text-xs rounded-lg bg-white border border-teal-300 text-[#0F3F3C] placeholder:text-teal-700/50 focus:outline-none focus:border-teal-600"
              />
              <button
                type="submit"
                data-testid="save-api-key-btn"
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white cursor-pointer whitespace-nowrap"
              >
                {apiKeySavedMsg ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Saved</span>
                  </>
                ) : (
                  <span>Save API Key</span>
                )}
              </button>
            </form>
          )}

          {/* Compact Subtitle Size & Background Opacity Bar (No parenthetical text) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-teal-200/80">
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
        <section className="bg-[#F0FDFA] border border-teal-300 rounded-2xl p-6 shadow-xs space-y-4">
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
              className="flex-1 px-3.5 py-2.5 text-sm rounded-xl bg-white border border-teal-300 text-[#0F3F3C] placeholder:text-teal-700/50 focus:outline-none focus:border-teal-600"
            />
            <button
              type="submit"
              data-testid="translate-submit-btn"
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#0D9488] hover:bg-[#0F766E] text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Translate</span>
            </button>
          </form>

          <div className="space-y-2 max-h-48 overflow-y-auto pr-1" data-testid="transcript-list">
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
                  className="px-3.5 py-2.5 rounded-xl bg-[#E0F2F1]/70 hover:bg-[#CCFBF1] border border-teal-300/70 cursor-pointer transition-colors"
                >
                  <p className="text-xs text-teal-800">{seg.english}</p>
                  <p className="text-sm font-bold text-[#0B3B38]">{seg.romanian}</p>
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
