import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hslToHex,
  hexToHsl,
  hexToRgba,
  wheelCoordsToHs,
  hsToWheelCoords,
  getContrastRatio,
  buildGoogleGtxUrl,
  parseGoogleGtxResponse,
  cleanNeuralTranslationOutput,
  buildMyMemoryUrl,
  normalizeSpeechChunk,
  TranslationLruCache,
  fallbackEnglishToRomanian,
  appendTranscriptSegment,
  formatSrtTimestamp,
  generateSrtSubtitles,
  generateLinuxMintLauncherScript,
  DEFAULT_CUSTOMIZATION,
  type TranscriptSegment,
} from './translationLogic';

test('JOI Subtitles 3.0 defaults use light teal theme and transparent caption background', () => {
  assert.equal(DEFAULT_CUSTOMIZATION.appBgColor, '#E0F2F1');
  assert.equal(DEFAULT_CUSTOMIZATION.subtitleOpacity, 0);
  assert.equal(hexToRgba(DEFAULT_CUSTOMIZATION.subtitleBgColor, DEFAULT_CUSTOMIZATION.subtitleOpacity), 'rgba(6, 36, 34, 0)');
});

test('Google Neural Translation URL builder and response parser extract Romanian text from dict-chrome-ex and nested formats', () => {
  const url = buildGoogleGtxUrl('Hello everyone. Let us begin the presentation.');
  assert.ok(url.includes('client=dict-chrome-ex'));
  assert.ok(url.includes('sl=en'));
  assert.ok(url.includes('tl=ro'));

  const directArrayPayload = ['Salutare tuturor. Să începem prezentarea.'];
  assert.equal(
    parseGoogleGtxResponse(directArrayPayload),
    'Salutare tuturor. Să începem prezentarea.'
  );

  const mockGtxPayload = [
    [
      ['Salutare tuturor. ', 'Hello everyone. ', null, null, 10],
      ['Să începem prezentarea.', 'Let us begin the presentation.', null, null, 10],
    ],
    null,
    'en',
  ];
  const parsed = parseGoogleGtxResponse(mockGtxPayload);
  assert.equal(parsed, 'Salutare tuturor. Să începem prezentarea.');
  assert.equal(cleanNeuralTranslationOutput('"Salutare tuturor."'), 'Salutare tuturor.');
});

test('Color Wheel HSL <-> Hex conversion round-trips accurately', () => {
  const redHex = hslToHex(0, 100, 50);
  assert.equal(redHex, '#FF0000');

  const greenHsl = hexToHsl('#00FF00');
  assert.equal(greenHsl.h, 120);
  assert.equal(greenHsl.s, 100);
  assert.equal(greenHsl.l, 50);

  const rgba = hexToRgba('#090D16', 0.85);
  assert.equal(rgba, 'rgba(9, 13, 22, 0.85)');
});

test('Color Wheel 2D coordinate mapping computes hue and saturation', () => {
  // Center of wheel => saturation 0
  const center = wheelCoordsToHs(80, 80, 80, 80, 75);
  assert.equal(center.s, 0);

  // Right edge => hue 0, saturation 100
  const rightEdge = wheelCoordsToHs(155, 80, 80, 80, 75);
  assert.equal(rightEdge.h, 0);
  assert.equal(rightEdge.s, 100);

  // Round-trip hsToWheelCoords
  const coords = hsToWheelCoords(90, 100, 80, 80, 75);
  assert.equal(coords.x, 80);
  assert.equal(coords.y, 155);
});

test('Contrast ratio calculation identifies readable subtitle pairings', () => {
  const highContrast = getContrastRatio('#FEF08A', '#090D16');
  assert.ok(highContrast >= 12, `Expected high contrast >= 12, got ${highContrast}`);

  const lowContrast = getContrastRatio('#222222', '#111111');
  assert.ok(lowContrast < 2, `Expected low contrast < 2, got ${lowContrast}`);
});

test('MyMemory URL builder formats en|ro query and optional email', () => {
  const url = buildMyMemoryUrl('  hello world  ', 'presenter@linuxmint.org');
  assert.ok(url.includes('langpair=en%7Cro'));
  assert.ok(url.includes('q=Hello+world'));
  assert.ok(url.includes('de=presenter%40linuxmint.org'));
});

test('TranslationLruCache evicts oldest entry when capacity is exceeded', () => {
  const cache = new TranslationLruCache(10);
  for (let i = 0; i < 12; i++) {
    cache.set(`phrase ${i}`, `fraza ${i}`);
  }
  assert.equal(cache.size, 10);
  assert.equal(cache.get('phrase 0'), undefined);
  assert.equal(cache.get('phrase 11'), 'fraza 11');
});

test('Fallback English to Romanian translates presentation sentences', () => {
  const ro = fallbackEnglishToRomanian(
    "Welcome everyone to today's presentation on system architecture and performance."
  );
  assert.ok(ro.includes('Bun venit tuturor'));
  assert.ok(ro.includes('prezentarea'));
});

test('Transcript ring buffer caps visible DOM segments for Celeron N2940 efficiency', () => {
  let segments: TranscriptSegment[] = [];
  for (let i = 1; i <= 10; i++) {
    const res = appendTranscriptSegment(
      segments,
      {
        id: `seg-${i}`,
        english: `Sentence ${i}`,
        romanian: `Propoziția ${i}`,
        startTimeMs: i * 1000,
        endTimeMs: i * 1000 + 900,
        confidence: 0.98,
        source: 'deepgram',
        cached: false,
        latencyMs: 120,
      },
      5
    );
    segments = res.allSegments;
    if (i === 10) {
      assert.equal(res.allSegments.length, 10);
      assert.equal(res.visibleSegments.length, 5);
      assert.equal(res.archivedCount, 5);
      assert.equal(res.visibleSegments[0].id, 'seg-6');
    }
  }
});

test('SRT subtitle generator formats timestamps and bilingual lines accurately', () => {
  assert.equal(formatSrtTimestamp(3661250), '01:01:01,250');
  const srt = generateSrtSubtitles([
    {
      id: '1',
      english: 'Good morning everyone',
      romanian: 'Bună dimineața tuturor',
      startTimeMs: 1000,
      endTimeMs: 3500,
      confidence: 0.99,
      source: 'deepgram',
      cached: false,
      latencyMs: 95,
    },
  ]);
  assert.ok(srt.includes('00:00:01,000 --> 00:00:03,500'));
  assert.ok(srt.includes('Bună dimineața tuturor'));
  assert.ok(srt.includes('[Good morning everyone]'));
});

test('Linux Mint Always-on-Top script generator outputs wmctrl command', () => {
  const script = generateLinuxMintLauncherScript('http://localhost:3000');
  assert.ok(script.includes('wmctrl -r'));
  assert.ok(script.includes('add,above,sticky'));
  assert.ok(script.includes('http://localhost:3000/?overlay=1'));
});
