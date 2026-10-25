import { decode, startRecording, wav } from './audio.js';
import { CONTEXT_SECONDS, DEFAULT_SA, LEAD_SECONDS, LOWEST_SA, MAX_SECONDS, NBSP, KAALAMS, PROGRESS_KEY, SA_CHOICES, SA_KEY, STEP_GAP, VOICE_RATE, ZOOMS } from './constants.js';
import { drawChart, drawLive } from './chart.js';
import { AKARAM, CHAPTERS, LESSONS, STAGES, SYLLABLES } from './lessons.js';
import { drawStaff, westernName } from './staff.js';
import { startListen, stopListen } from './listen.js';
import { sing } from './voice.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const API_BASE = $('meta[name="api-base"]').content;

const state = { reference: null, user: null, takes: [], current: 0, request: null, zoom: 2, cursor: 0, keyShift: null, live: { reference: [], user: [] }, lesson: null, tonic: null, scale: null, speed: 1, akaram: false };
const players = { reference: new Audio(), user: new Audio() };
let chart, stopRecording, recordTimer, playback, staffNotes = [];

function stored(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const progress = stored(PROGRESS_KEY, { last: null, lessons: {} });
const hasPassed = (lesson) => Boolean(progress.lessons[lesson.id]?.passed);
const clean = (r) => r.status === 'ok' && !r.issues.length && !r.warnings.some((w) => w.code === 'possible_key_mismatch');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function remember(lesson, result, fresh) {
  const entry = progress.lessons[lesson.id] ?? { attempts: 0, passed: false };
  progress.lessons[lesson.id] = { attempts: entry.attempts + (fresh ? 1 : 0), passed: entry.passed || clean(result), moments: result.issues.length, at: Date.now() };
  progress.last = lesson.id;
  store(PROGRESS_KEY, progress);
}
const nextLesson = () => LESSONS[LESSONS.indexOf(state.lesson) + 1];

function rememberScore(lesson, passed, misses) {
  const entry = progress.lessons[lesson.id] ?? { attempts: 0, passed: false };
  progress.lessons[lesson.id] = { attempts: entry.attempts + 1, passed: entry.passed || passed, moments: misses, at: Date.now() };
  progress.last = lesson.id;
  store(PROGRESS_KEY, progress);
}

const seconds = (s) => `${s.toFixed(1)}${NBSP}s`;
const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null);

function interval(s) {
  const size = Math.abs(s);
  let amount = 'an octave';
  if (size !== 12) amount = size === 1 ? '1 semitone' : `${size} semitones`;
  return `${amount} ${s < 0 ? 'lower' : 'higher'}`;
}

const element = (tag, props = {}, ...children) => {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...children);
  return el;
};
const button = (label, onclick, className = 'secondary') => element('button', { className, onclick, textContent: label });
const row = (...children) => element('div', { className: 'row' }, ...children);
const contours = () => state.takes[state.current].result.contours;
const attemptAt = (t) => contours().attempt_time_seconds[Math.max(0, contours().time_seconds.findLastIndex((x) => x <= t))];
const referenceAt = (u) => contours().time_seconds[Math.max(0, contours().attempt_time_seconds.findLastIndex((x) => x <= u))];

function show(view) {
  $$('.view').forEach((v) => (v.hidden = v.id !== view));
  window.scrollTo(0, 0);
}

function toast(message, action) {
  const box = $('#toast');
  box.replaceChildren(element('span', { textContent: message }));
  if (action) box.append(button(action.label, () => { box.hidden = true; action.run(); }, 'link'));
  box.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (box.hidden = true), action ? 15000 : 7000);
}

async function api(path, form, signal) {
  let response;
  try {
    response = await fetch(API_BASE + path, { method: 'POST', body: form, signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    const where = API_BASE ? ` at ${API_BASE}` : '';
    throw new Error(`Can't reach the analysis service${where}. Is it running?`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? `The analysis service returned an error (${response.status}).`);
  return body;
}

const listNotes = (card, warnings) => $('.notes', card).replaceChildren(...warnings.map((w) => element('li', { textContent: w.message })));

function resetUser() {
  const card = $('#user'), audio = $('audio', card);
  $('.record', card).classList.remove('nudge');
  state.user = null;
  state.live.user = [];
  $('canvas', card).hidden = true;
  audio.hidden = true;
  audio.removeAttribute('src');
  listNotes(card, []);
  $('#analyse').disabled = true;
}

async function load(slot, blob, analysed = blob) {
  const card = $(`#${slot}`);
  let samples;
  try {
    samples = await decode(analysed);
  } catch {
    return toast("That recording couldn't be read. Please record again.");
  }
  if (slot === 'reference') {
    state.takes = [];
    state.keyShift = null;
  }
  const clip = (state[slot] = { wav: wav(samples), url: URL.createObjectURL(blob) });
  const audio = $('audio', card);
  audio.src = clip.url;
  audio.hidden = false;
  if (slot === 'reference' && state.autoplay) {
    state.autoplay = false;
    audio.play().catch(() => {});
  }
  listNotes(card, []);
  $('#analyse').disabled = !(state.reference && state.user);

  const form = new FormData();
  form.append('audio', clip.wav, `${slot}.wav`);
  form.append('track', slot);
  api('/api/validate', form).then((r) => state[slot] === clip && listNotes(card, r.warnings), () => {});
}

function ago(time) {
  const minutes = Math.round((time - Date.now()) / 60000), format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (minutes > -60) return format.format(minutes, 'minute');
  if (minutes > -1440) return format.format(Math.round(minutes / 60), 'hour');
  return format.format(Math.round(minutes / 1440), 'day');
}

function outcome(entry) {
  if (entry.passed) return 'passed';
  return entry.moments ? `${plural(entry.moments, 'moment')} to practise last time` : 'not passed yet';
}

// From the home page one tap goes straight into the next lesson to practise.
function renderContinue() {
  const next = progress.last && LESSONS.find((l) => !hasPassed(l)), choice = $('#home-continue');
  choice.hidden = !next;
  $('[data-go="#/tutor"]').className = next ? 'secondary' : 'primary';
  if (next) Object.assign(choice, { textContent: `Continue: ${next.name}`, onclick: () => openLesson(next) });
}

function renderResume() {
  const last = LESSONS.find((l) => l.id === progress.last), entry = last && progress.lessons[last.id];
  $('#resume').hidden = !entry;
  if (!entry) return;
  const after = LESSONS.slice(LESSONS.indexOf(last) + 1).find((l) => !hasPassed(l));
  $('#resume .eyebrow').textContent = `Last practised ${ago(entry.at)}`;
  $('#resume h3').textContent = last.name;
  $('#resume .hint').textContent = `Chapter ${CHAPTERS.indexOf(last.chapter) + 1} · ${last.chapter.title} · ${plural(entry.attempts, 'attempt')} · ${outcome(entry)}`;
  $('#resume-go').onclick = () => openLesson(last);
  $('#resume-next').hidden = !(entry.passed && after);
  if (after) Object.assign($('#resume-next'), { textContent: `Next: ${after.name}`, onclick: () => openLesson(after) });
}

function lessonButton(lesson, next) {
  const entry = progress.lessons[lesson.id];
  const choice = button(`${entry?.passed ? '✓ ' : ''}${lesson.name}`, () => openLesson(lesson), lesson === next ? 'primary' : 'secondary');
  choice.classList.toggle('tried', Boolean(entry && !entry.passed));
  return choice;
}

function chapterCard(section, next) {
  const lessons = LESSONS.filter((l) => l.chapter === section);
  return element('article', { className: 'card chapter' },
    element('p', { className: 'eyebrow', textContent: `Chapter ${CHAPTERS.indexOf(section) + 1} · ${lessons.filter(hasPassed).length} of ${lessons.length} passed` }),
    element('h3', { textContent: section.title }),
    element('p', { className: 'hint', textContent: section.hint }),
    element('div', { className: 'lesson-grid' }, ...lessons.map((l) => lessonButton(l, next))));
}

// Only the stage being worked on starts open, so a beginner sees one small step rather than the whole syllabus.
function showLessons(chapter) {
  show('lessons');
  renderResume();
  const next = LESSONS.find((l) => !hasPassed(l)), target = CHAPTERS[chapter - 1];
  $('#chapters').replaceChildren(...STAGES.map((stage, k) => {
    const lessons = LESSONS.filter((l) => l.chapter.stage === stage), passed = lessons.filter(hasPassed).length;
    return element('details', { className: 'stage', open: (target ?? next?.chapter)?.stage === stage },
      element('summary', {},
        element('span', {},
          element('span', { className: 'eyebrow', textContent: `Stage ${k + 1} · ${passed === lessons.length ? 'complete' : `${passed} of ${lessons.length} passed`}` }),
          element('span', { className: 'stage-title', textContent: stage.title }),
          element('span', { className: 'hint', textContent: stage.about }))),
      ...stage.chapters.map((section) => chapterCard(section, next)));
  }));
  if (target) $$('#chapters .chapter')[chapter - 1]?.scrollIntoView({ block: 'start' });
}

function startLesson(lesson) {
  const card = $('#reference');
  state.lesson = lesson;
  state.tonic = Number($('#sa').value);
  if (lesson.listen) {
    const autoplay = state.autoplay;
    state.autoplay = false;
    return startListen(lesson, state.tonic, {
      autoplay,
      done: (passed, misses) => rememberScore(lesson, passed, misses),
      next: () => openLesson(nextLesson()),
      hasNext: () => Boolean(nextLesson()),
    });
  }
  resetUser();
  state.scale = lesson.scale;
  const seconds = (state.seconds = lesson.seconds / state.speed);
  $('h3', card).textContent = lesson.name;
  Object.assign($('.ragam', card), { hidden: false, textContent: `Ragam ${lesson.ragam}` });
  $('.options', card).hidden = false;
  renderOptions(lesson);
  Object.assign($('#setup .theory'), { hidden: !lesson.theory });
  $('#setup .theory p:last-child').textContent = lesson.theory ?? '';
  $('.row', card).hidden = true;
  const phrase = lesson.steps.map((step) => ({ ...step, note: state.tonic + step.note }));
  $('.swaras', card).replaceChildren(...phrase.map((step) => element('li', {},
    element('span', { textContent: step.swara + ' ,'.repeat(step.beats - 1) }), element('small', { textContent: westernName(step.note) }))));
  const staff = $('.staff', card);
  staff.removeAttribute('hidden');
  staffNotes = drawStaff(staff, lesson.steps, seconds, state.tonic, lesson.cycle);
  let beat = 0;
  state.live.reference = phrase.flatMap(({ note, beats }) => {
    const start = LEAD_SECONDS + beat * seconds, end = start + beats * seconds;
    beat += beats;
    return [[start, note], [end - STEP_GAP, note], [end, null]];
  });
  drawLiveFor('reference');
  const voice = sing(state.akaram ? phrase.map((step) => ({ ...step, syllable: AKARAM })) : phrase, seconds);
  load('reference', wav(voice.wet, VOICE_RATE), wav(voice.dry, VOICE_RATE));
}

// Every exercise can be sung in three speeds, and on 'aa' (akaram) instead of the swara names.
function renderOptions(lesson) {
  const choices = (host, options, current, pick) => $(host).replaceChildren(...options.map(([label, value]) => {
    const choice = button(label, () => pick(value), '');
    choice.setAttribute('aria-pressed', value === current);
    return choice;
  }));
  const restart = () => {
    stopPlayback();
    startLesson(lesson);
  };
  choices('#kaalam', KAALAMS, state.speed, (speed) => { state.speed = speed; restart(); });
  choices('#voicing', [['Swaras', false], ['Akaram', true]], state.akaram, (akaram) => { state.akaram = akaram; restart(); });
}

function clearSession() {
  const card = $('#reference'), audio = $('audio', card);
  Object.assign(state, { lesson: null, tonic: null, scale: null, reference: null, takes: [], keyShift: null });
  $('#reference .ragam').hidden = true;
  $('#reference .options').hidden = true;
  state.live.reference = [];
  $('h3', card).textContent = 'Reference';
  $('.row', card).hidden = false;
  $('.swaras', card).replaceChildren();
  $('#setup .theory').hidden = true;
  $('.staff', card).setAttribute('hidden', '');
  staffNotes = [];
  $('canvas', card).hidden = true;
  audio.hidden = true;
  audio.removeAttribute('src');
  listNotes(card, []);
  resetUser();
}

const lessonPath = (lesson) => `#/lessons/${lesson.id}`;
const setupPath = () => (state.lesson ? lessonPath(state.lesson) : '#/tutor');
const resultsPath = () => `${setupPath()}/results`;

function go(path) {
  if (location.hash === path) route();
  else location.hash = path;
}

// Opening a lesson is always a tap, so its sound may start straight away without a second tap on Play.
function openLesson(lesson) {
  state.autoplay = true;
  state.opening = true;
  startLesson(lesson);
  go(lessonPath(lesson));
}

function renderCrumbs(trail) {
  $('.bar').hidden = trail.length < 2;
  $('#crumbs').replaceChildren(...trail.map(([label, href], k) => {
    if (k < trail.length - 1) return element('li', {}, element('a', { href, textContent: label }));
    const current = element('span', { textContent: label });
    current.setAttribute('aria-current', 'page');
    return element('li', {}, current);
  }));
  $('#crumbs').scrollLeft = $('#crumbs').scrollWidth;
}

function cancelWork() {
  stopPlayback();
  stopListen();
  state.request?.abort();
  if (!stopRecording) return;
  const stop = stopRecording;
  stopRecording = null;
  clearInterval(recordTimer);
  stop();
  $$('.record').forEach((b) => {
    b.disabled = false;
    b.classList.remove('on');
    b.setAttribute('aria-pressed', 'false');
  });
  $$('.timer').forEach((t) => (t.textContent = ''));
}

function showStep(trail, results) {
  if (results && !state.takes.length) return location.replace(setupPath());
  renderCrumbs(results ? [...trail, ['Results']] : trail);
  if (results) return renderResults();
  $('#skip').hidden = !(state.lesson && nextLesson());
  show('setup');
}

function route() {
  if (state.opening) state.opening = false;
  else cancelWork();
  const [section, id, step] = location.hash.slice(2).split('/'), home = ['Home', '#/'];
  $('#reset').hidden = section !== 'tutor';
  $('#start-over').hidden = section !== 'lessons';
  if (section === 'tutor') {
    if (state.lesson) clearSession();
    return showStep([home, ['Practise with a tutor', '#/tutor']], id === 'results');
  }
  const lesson = LESSONS.find((l) => l.id === id);
  if (section === 'lessons' && lesson) {
    if (state.lesson !== lesson || state.tonic !== Number($('#sa').value)) startLesson(lesson);
    const chapter = CHAPTERS.indexOf(lesson.chapter) + 1, trail = [home, ['Lessons', '#/lessons'], [lesson.chapter.title, `#/lessons/chapter-${chapter}`], [lesson.name, lessonPath(lesson)]];
    if (lesson.listen) {
      renderCrumbs(trail);
      return show('listen');
    }
    return showStep([home, ['Lessons', '#/lessons'], [lesson.chapter.title, `#/lessons/chapter-${chapter}`], [lesson.name, lessonPath(lesson)]], step === 'results');
  }
  if (section === 'lessons') {
    renderCrumbs([home, ['Lessons']]);
    return showLessons(Number(id?.replace('chapter-', '')));
  }
  renderCrumbs([home]);
  renderContinue();
  show('home');
}

function followSwaras() {
  const audio = $('#reference audio');
  const beat = (audio.currentTime - LEAD_SECONDS) / (state.seconds ?? 1);
  let start = 0;
  const now = audio.paused || !state.lesson || beat < 0 ? -1 : state.lesson.steps.findIndex((step) => beat < (start += step.beats));
  $$('#reference .swaras li').forEach((chip, i) => chip.classList.toggle('on', i === now));
  staffNotes.forEach((note, i) => note.classList.toggle('on', i === now));
  if (!audio.paused) requestAnimationFrame(followSwaras);
}

function drawLiveFor(slot) {
  const canvas = $(`#${slot} canvas`), first = (points) => points.find(([, m]) => m != null)?.[0] ?? 0;
  canvas.hidden = false;
  const reference = { points: state.live.reference, shift: 0, color: '--ref', width: 4, labelled: slot === 'reference' };
  if (slot === 'reference') return drawLive(canvas, [reference], state.tonic, state.scale);
  const points = state.live.user;
  drawLive(canvas, [reference, { points, shift: first(state.live.reference) - first(points), transpose: -(state.keyShift ?? 0), color: '--you', width: 2.5, labelled: true }], state.tonic, state.scale);
}

async function toggleRecording(slot) {
  const card = $(`#${slot}`), record = $('.record', card), timer = $('.timer', card), buttons = $$('.record');
  buttons.forEach((b) => (b.disabled = true));
  if (stopRecording) {
    const stop = stopRecording;
    stopRecording = null;
    clearInterval(recordTimer);
    record.classList.remove('on');
    record.setAttribute('aria-pressed', 'false');
    timer.textContent = '';
    const blob = await stop();
    buttons.forEach((b) => (b.disabled = false));
    $('#analyse').disabled = !(state.reference && state.user);
    return load(slot, blob);
  }
  if (slot === 'reference') {
    state.live.user = [];
    $('#user canvas').hidden = true;
  }
  state.live[slot] = [];
  try {
    stopRecording = await startRecording((t, m) => {
      state.live[slot].push([t, m]);
      drawLiveFor(slot);
    });
  } catch (e) {
    buttons.forEach((b) => (b.disabled = false));
    return toast(e.name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser’s site settings.' : 'No microphone is available.');
  }
  record.disabled = false;
  record.classList.remove('nudge');
  $('#analyse').disabled = true;
  record.classList.add('on');
  record.setAttribute('aria-pressed', 'true');
  const started = Date.now();
  timer.textContent = '0:00';
  recordTimer = setInterval(() => {
    const elapsed = (Date.now() - started) / 1000;
    timer.textContent = `${Math.floor(elapsed / 60)}:${String(Math.floor(elapsed % 60)).padStart(2, '0')}`;
    if (elapsed >= MAX_SECONDS) toggleRecording(slot);
  }, 200);
}

async function analyse(take, params = {}) {
  const form = new FormData();
  form.append('reference_audio', state.reference.wav, 'reference.wav');
  form.append('user_audio', (take?.user ?? state.user).wav, 'user.wav');
  Object.entries(params).forEach(([k, v]) => v != null && form.append(k, v));
  const back = take ? 'results' : 'setup';
  state.request = new AbortController();
  stopPlayback();
  show('analysing');
  try {
    const result = await api('/api/analyze', form, state.request.signal), fresh = !take;
    if (fresh) {
      take = { user: state.user };
      state.takes.push(take);
    }
    Object.assign(take, { result, params });
    if (state.lesson) remember(state.lesson, result, fresh);
    state.current = state.takes.indexOf(take);
    go(resultsPath());
  } catch (e) {
    if (e.name === 'AbortError') return;
    show(back);
    toast(e.message, { label: 'Retry', run: () => analyse(take, params) });
  }
}

function compareIn(take, keyShift) {
  state.keyShift = keyShift;
  analyse(take, { ...take.params, key_shift_semitones: keyShift });
}

function describe(issue) {
  const span = seconds(issue.end_seconds - issue.start_seconds);
  if (issue.type === 'timing') {
    const gap = Math.abs(issue.onset_difference_seconds).toFixed(2);
    return issue.direction === 'late' ? ['Came in late', `Started ${gap} s after the reference.`] : ['Came in early', `Started ${gap} s before the reference.`];
  }
  if (issue.type === 'missed') return ['Not sung', 'The reference sings here, but the attempt is silent.'];
  if (issue.type === 'extra') return ['Extra singing', 'The attempt sings here while the reference rests.'];
  if (issue.type === 'unsteady') return ['Pitch wavered', `The pitch wandered around the reference for ${span}.`];
  const cents = Math.abs(issue.median_deviation_cents);
  let size = `About ${Math.round(cents / 100)} semitones`;
  if (cents < 100) size = 'A little';
  else if (cents < 150) size = 'About a semitone';
  return [`${size} ${issue.direction}`, `About ${cents} cents ${issue.direction === 'flat' ? 'below' : 'above'} the reference for ${span}.`];
}

function tip(issue) {
  const at = seconds(issue.start_seconds);
  return {
    flat: `Around ${at}, sing the phrase slowly on “ah” and match the reference’s first note before adding the words. Aim a touch higher.`,
    sharp: `Around ${at}, relax and aim slightly lower. Let the note settle instead of pushing up to it.`,
    late: `Before ${at}, breathe a little earlier and count one beat in, so you are ready to enter.`,
    early: `At ${at}, wait for the reference’s first syllable before you come in.`,
    missed: `Around ${at}, sing along with the reference a few times until this part comes naturally.`,
    extra: `Around ${at}, hold the rest and let the reference’s pause pass before singing again.`,
    unsteady: `Around ${at}, sustain the note on one open vowel with steady breath, without pushing.`,
  }[issue.direction ?? issue.type];
}

function issueCard(issue, k) {
  const [title, observation] = describe(issue);
  return element('article', { className: 'card issue' },
    element('div', { className: 'card-head' },
      element('span', { className: 'badge', textContent: k + 1 }),
      element('span', { className: 'eyebrow', textContent: `${seconds(issue.start_seconds)} – ${seconds(issue.end_seconds)}` }),
      element('span', { className: 'meta', textContent: `${Math.round(issue.confidence * 100)}% confidence` })),
    element('h3', { textContent: title }),
    element('p', { textContent: observation }),
    row(button('▶ Reference', () => playIssue('reference', issue)), button('▶ Attempt', () => playIssue('user', issue)), button('▶ Both', () => playIssue('both', issue))));
}

function headline(r, pending) {
  const n = r.issues.length;
  if (r.status !== 'ok') return 'Not enough clear singing to compare';
  if (pending) return 'Was the attempt in another key?';
  if (!n) return 'Nothing stood out';
  return n === 1 ? '1 moment worth practising' : `${n} moments worth practising`;
}

function renderResults() {
  const take = state.takes[state.current], r = take.result, n = r.issues.length;
  const pending = r.warnings.some((w) => w.code === 'possible_key_mismatch');
  show('results');
  players.reference.src = state.reference.url;
  players.user.src = take.user.url;
  state.cursor = 0;

  const tabs = $('#takes');
  tabs.hidden = state.takes.length < 2;
  tabs.replaceChildren(...state.takes.map((_, k) => {
    const tab = button(`Take ${k + 1}`, () => { state.current = k; renderResults(); }, '');
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', k === state.current);
    return tab;
  }));

  $('#confidence').textContent = `${r.summary.pitch_comparison_confidence} confidence`;
  $('#headline').textContent = headline(r, pending);
  const done = state.lesson && clean(r);
  if (done) $('#headline').textContent = 'Lesson passed';
  $('#lesson-actions').hidden = !state.lesson;
  $('#next-lesson').hidden = !(done && nextLesson());
  $('#retry').className = done ? 'secondary' : 'primary';
  $('#again').hidden = Boolean(state.lesson);
  $('#next-bottom').hidden = !(state.lesson && nextLesson());
  const own = r.key_shift_semitones || r.detected_key_shift_semitones;
  $('#keys').hidden = !own;
  $('#keys').replaceChildren(...[[0, 'Same key'], [own, `Attempt’s key, ${interval(own)}`]].map(([value, label]) => {
    const choice = button(label, () => compareIn(take, value), '');
    choice.setAttribute('aria-pressed', !pending && r.key_shift_semitones === value);
    return choice;
  }));
  $('#warnings').replaceChildren(...r.warnings.filter((w) => w.code !== 'possible_key_mismatch').map((w) => element('li', { textContent: w.message })));
  $('.legend .you').textContent = r.key_shift_semitones ? `Attempt, drawn ${interval(-r.key_shift_semitones)}` : 'Attempt';

  drawResultsChart();
  $('#issues').replaceChildren(...r.issues.map(issueCard));
  $('#tips').hidden = !n;
  $('#tips ol').replaceChildren(...[...r.issues].sort((a, b) => b.confidence - a.confidence).slice(0, 3).map((i) => element('li', { textContent: tip(i) })));
  renderProgress();
  $('#key').value = take.params.key_shift_semitones ?? '';
}

function drawResultsChart() {
  const r = state.takes[state.current].result;
  chart = drawChart($('#chart'), r, {
    pxPerSecond: ZOOMS[state.zoom],
    tonic: state.tonic,
    scale: state.scale,
    onSelect: (t) => {
      state.cursor = t;
      chart.playhead(t);
    },
  });
}

function renderProgress() {
  const box = $('#progress');
  box.hidden = state.current === 0;
  if (box.hidden) return;
  const before = state.takes[state.current - 1].result, after = state.takes[state.current].result;
  const cents = (v) => (v == null ? 'not compared' : `${Math.round(v)}${NBSP}cents`.replace('-', '−'));
  const typical = (r) => median(r.contours.deviation_cents.filter((v) => v != null).map(Math.abs));
  const around = (r, issue) => median(r.contours.deviation_cents.filter((v, i) =>
    v != null && r.contours.time_seconds[i] >= issue.start_seconds && r.contours.time_seconds[i] < issue.end_seconds));
  const rows = [
    ['Moments flagged', `${before.issues.length} → ${after.issues.length}`],
    ['Typical distance from the reference pitch', `${cents(typical(before))} → ${cents(typical(after))}`],
    ...before.issues.filter((i) => i.type === 'pitch_deviation')
      .map((i) => [`Moment at ${seconds(i.start_seconds)}`, `${cents(i.median_deviation_cents)} → ${cents(around(after, i))}`]),
  ];
  $('h3', box).textContent = `Take ${state.current} → Take ${state.current + 1}`;
  $('dl', box).replaceChildren(...rows.map(([term, value]) => element('div', {}, element('dt', { textContent: term }), element('dd', { textContent: value }))));
}

const markPlaying = () => $$('[data-play]').forEach((b) => b.classList.toggle('playing', b.dataset.play === playback?.which));

function stopPlayback() {
  Object.values(players).forEach((p) => p.pause());
  cancelAnimationFrame(playback?.frame);
  clearTimeout(playback?.delay);
  playback = null;
  markPlaying();
}

function play(which, from, to = Infinity) {
  stopPlayback();
  const lead = which === 'user' ? players.user : players.reference, toReference = which === 'user' ? referenceAt : (t) => t;
  const start = Math.max(0, from);
  lead.currentTime = start;
  lead.play();
  playback = { which };
  if (which === 'both') {
    const at = attemptAt(start) || start + state.takes[state.current].result.alignment.offset_seconds;
    playback.delay = setTimeout(() => {
      players.user.currentTime = Math.max(0, at);
      players.user.play();
    }, Math.max(0, -at) * 1000);
  }
  const tick = () => {
    if (lead.paused || lead.currentTime >= to) return stopPlayback();
    chart.playhead(toReference(lead.currentTime));
    playback.frame = requestAnimationFrame(tick);
  };
  playback.frame = requestAnimationFrame(tick);
  markPlaying();
}

function playIssue(which, issue) {
  state.cursor = issue.start_seconds;
  const [from, to] = which === 'user' ? [issue.attempt_start_seconds, issue.attempt_end_seconds] : [issue.start_seconds, issue.end_seconds];
  play(which, from - CONTEXT_SECONDS, to + CONTEXT_SECONDS);
}

$$('[data-go]').forEach((b) => (b.onclick = () => go(b.dataset.go)));
$('#reset').onclick = () => {
  cancelWork();
  clearSession();
  go('#/tutor');
};
$('#start-over').onclick = () => {
  if (!confirm('Start the lessons again from the first one? Your lesson progress will be cleared.')) return;
  cancelWork();
  Object.assign(progress, { last: null, lessons: {} });
  store(PROGRESS_KEY, progress);
  openLesson(LESSONS[0]);
};
// Next lesson is offered everywhere in a lesson, so nobody is held back by a result.
$('#next-lesson').onclick = $('#next-bottom').onclick = $('#skip').onclick = $('#listen-skip').onclick = () => openLesson(nextLesson());
$('#sa').append(...Array.from({ length: SA_CHOICES }, (_, k) => LOWEST_SA + k).map((m) => new Option(westernName(m), m)));
$('#sa').value = stored(SA_KEY, DEFAULT_SA);
$('#sa').onchange = () => store(SA_KEY, Number($('#sa').value));
$('#hear-sa').onclick = () => new Audio(URL.createObjectURL(wav(sing([{ note: Number($('#sa').value), syllable: SYLLABLES.Sa, beats: 1 }], 1.5).wet, VOICE_RATE))).play();
['play', 'pause'].forEach((type) => $('#reference audio').addEventListener(type, followSwaras));
// When a lesson's reference finishes, point to the record button so the next tap is obvious.
$('#reference audio').addEventListener('ended', () => {
  if (!state.lesson || state.user || stopRecording) return;
  $('#user .record').classList.add('nudge');
  $('#user').scrollIntoView({ behavior: 'smooth', block: 'center' });
});
$$('.record').forEach((b) => (b.onclick = () => toggleRecording(b.closest('.slot').id)));
$('#analyse').onclick = () => analyse(null, state.keyShift == null ? {} : { key_shift_semitones: state.keyShift });
$('#cancel').onclick = () => route();
$('#again').onclick = $('#retry').onclick = () => {
  resetUser();
  go(setupPath());
};
$('#zoom-out').onclick = () => { state.zoom = Math.max(0, state.zoom - 1); drawResultsChart(); };
$('#zoom-in').onclick = () => { state.zoom = Math.min(ZOOMS.length - 1, state.zoom + 1); drawResultsChart(); };
$$('[data-play]').forEach((b) => (b.onclick = () => {
  const which = b.dataset.play;
  if (playback?.which === which) {
    stopPlayback();
    return;
  }
  play(which, which === 'user' ? attemptAt(state.cursor) : state.cursor);
}));
$('#key').append(...Array.from({ length: 25 }, (_, k) => k - 12).map((s) => new Option(s ? interval(s).replace(/^./, (c) => c.toUpperCase()) : 'Same key as the reference', s)));
$('#reanalyse').onclick = () => {
  const key = $('#key').value;
  state.keyShift = key === '' ? null : Number(key);
  analyse(state.takes[state.current], { key_shift_semitones: state.keyShift });
};
addEventListener('resize', () => {
  if (!$('#results').hidden) drawResultsChart();
  if (!$('#setup').hidden) ['reference', 'user'].filter((slot) => state.live[slot].length).forEach((slot) => drawLiveFor(slot));
});
addEventListener('hashchange', route);
route();
