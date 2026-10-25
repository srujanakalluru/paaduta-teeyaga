export const RATE = 16000;
export const MIN_HZ = 65;
export const MAX_HZ = 1100;
export const SILENCE_DB = -50;
export const YIN_THRESHOLD = 0.2;
export const ANALYSER_SIZE = 2048;

export const MAX_SECONDS = 179;
export const CONTEXT_SECONDS = 1;
export const ZOOMS = [10, 20, 40, 80, 160];
export const NBSP = String.fromCharCode(160);

export const SVG_NS = 'http://www.w3.org/2000/svg';
export const CHART_HEIGHT = 260;
export const CHART_TOP = 20;
export const CHART_BOTTOM = 28;
export const CHART_AXIS = 44;
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const LIVE_AXIS = 40;
export const NOTE_TOLERANCE = 0.7;
export const MIN_NOTE_SECONDS = 0.15;
export const NOTE_GAP_SECONDS = 0.25;
export const SARGAM = ['Sa', 'Ri♭', 'Ri', 'Ga♭', 'Ga', 'Ma', 'Ma♯', 'Pa', 'Da♭', 'Da', 'Ni♭', 'Ni'];
export const SCALE = [0, 2, 4, 5, 7, 9, 11];
// Semitones above Sa for the swarams that vary; Sa and Pa never change.
export const RAGAMS = {
  mayamalavagowla: { name: 'Mayamalavagowla', R: 1, G: 4, M: 5, D: 8, N: 11 },
  sankarabharanam: { name: 'Sankarabharanam', R: 2, G: 4, M: 5, D: 9, N: 11 },
};
export const DEFAULT_RAGAM = 'mayamalavagowla';
export const KAALAMS = [['First speed', 1], ['Second speed', 2], ['Third speed', 4]];

export const FOLD_FRAMES = 10;
export const MAX_JUMP = 7;

export const LEAD_SECONDS = 0.5;
export const VOICE_RATE = 32000;
export const VOICE_CONTROL = 64;
export const VOICE_HARMONICS = 80;
export const SOURCE_TILT = 2.3;
export const FUNDAMENTAL_BOOST = 2.6;
export const BREATH_LEVEL = 0.015;
export const GLIDE_SECONDS = 0.12;
export const TRANSITION_SECONDS = 0.06;
export const VOICING_SECONDS = 0.03;
export const SCOOP = 0.3;
export const DRIFT = 0.01;
export const VIBRATO = { depth: 0.16, rate: 5.2, delay: 0.3, rise: 0.4, rateWander: 0.06, depthWander: 0.3 };
export const JITTER = 0.015;
export const SHIMMER = 0.01;
export const OVERSHOOT = { ratio: 0.06, max: 0.2 };
export const SWELL = { floor: 0.8, seconds: 0.3 };
export const NOTE_LEVEL_SPREAD = 0.12;
export const EFFORT_TILT = 0.4;
export const RELEASE_FALL = 0.2;
export const FORMANT_WANDER = 0.02;
export const VOCAL_TRACT = 1.1;
export const PHRASE_ATTACK = 0.08;
export const PHRASE_RELEASE = 0.15;
export const REVERB_MIX = 0.08;
export const VOWELS = {
  a: [[760, 90], [1150, 100], [2700, 160], [3600, 300], [4700, 400]],
  i: [[300, 60], [2500, 140], [3100, 200], [3900, 300], [4700, 400]],
};
export const CONSONANTS = {
  s: { closure: 0.09, voice: 0, hiss: 0.1, loci: [400, 1600, 2600] },
  r: { closure: 0.03, voice: 0.35, loci: [350, 1500, 2200] },
  g: { closure: 0.04, voice: 0.2, burst: 0.05, loci: [300, 1900, 2100] },
  m: { closure: 0.07, voice: 0.45, loci: [250, 1100, 2400] },
  p: { closure: 0.05, voice: 0, burst: 0.05, loci: [400, 900, 2300] },
  d: { closure: 0.04, voice: 0.2, burst: 0.05, loci: [350, 1700, 2600] },
  n: { closure: 0.07, voice: 0.45, loci: [250, 1600, 2600] },
  '': { closure: 0, voice: 1, loci: [] },
};

export const STEP_GAP = 0.05;
export const LETTERS = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
export const STAFF_SPACE = 8;
export const STAFF_BEAT = 40;
export const STAFF_CLEF = 44;
export const STAFF_MARGIN = 4;
export const CLEFS = { treble: { glyph: '𝄞', bottom: 30, size: 5.2, baseline: 1 }, bass: { glyph: '𝄢', bottom: 18, size: 3.4, baseline: -2.1 } };
export const TREBLE_FROM = 59;
export const CYCLE_BEATS = 8;
export const LISTEN = { seconds: 1, gap: 0.3, low: 0, high: 12, rounds: 8, pass: 0.75 };
export const LADDER = { width: 320, height: 260, pad: 24, axis: 44 };
export const DEFAULT_SA = 60;
export const SA_CHOICES = 24;
export const LOWEST_SA = 48;
export const PROGRESS_KEY = 'paaduta.progress';
export const SA_KEY = 'paaduta.sa';
