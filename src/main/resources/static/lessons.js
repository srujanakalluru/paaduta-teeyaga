// The curriculum lives in lessons.json so teachers can edit it without touching code. Swaras are written in the shorthand
// of a Carnatic notebook: S R G M P D N, ' for the upper octave (tara sthayi), . for the lower octave (mandra sthayi),
// a comma to hold the previous swara for one more beat and | between lines. A stage or chapter may name its ragam.
import { DEFAULT_RAGAM, RAGAMS } from './constants.js';

const SWARAS = { S: 'Sa', R: 'Ri', G: 'Ga', M: 'Ma', P: 'Pa', D: 'Da', N: 'Ni' };
const FIXED = { S: 0, P: 7 };
const OCTAVES = { "'": ['̇', 12, '2'], '.': ['̣', -12, '0'], '': ['', 0, ''] };
const CONSONANT = { Sa: 's', Ri: 'r', Ga: 'g', Ma: 'm', Pa: 'p', Da: 'd', Ni: 'n' };
export const SYLLABLES = Object.fromEntries(Object.entries(CONSONANT).map(([name, c]) => [name, [c, name[1]]]));
export const AKARAM = ['', 'a'];

// The swara name sung at each semitone above Sa in a ragam, used to label pitch lines.
const scaleOf = (ragam) => Object.fromEntries(Object.entries(SWARAS).map(([letter, name]) => [FIXED[letter] ?? RAGAMS[ragam][letter], name]));

function parse(text, where, ragam) {
  return text.split(/\s+/).filter((token) => token && token !== '|').reduce((steps, token) => {
    if (token === ',') {
      if (!steps.length) throw new Error(`${where}: a comma needs a swaram before it.`);
      steps.at(-1).beats++;
      return steps;
    }
    if (!SWARAS[token[0]] || !OCTAVES[token.slice(1)]) throw new Error(`${where}: "${token}" is not a swaram. Use S R G M P D N, with ' above or . below.`);
    const name = SWARAS[token[0]], degree = FIXED[token[0]] ?? RAGAMS[ragam][token[0]], [dot, octave, id] = OCTAVES[token.slice(1)];
    steps.push({ swara: name[0] + dot + name.slice(1), note: degree + octave, syllable: SYLLABLES[name], id: name.toLowerCase() + id, beats: 1 });
    return steps;
  }, []);
}

const curriculum = await (await fetch(new URL('lessons.json', import.meta.url))).json();

export const STAGES = curriculum.stages;
export const CHAPTERS = STAGES.flatMap((stage) => stage.chapters.map((chapter) => Object.assign(chapter, { stage })));

export const LESSONS = CHAPTERS.flatMap((chapter) => chapter.lessons.map((lesson) => {
  if (lesson.listen) {
    if (!lesson.title) throw new Error(`${chapter.title}: a listening lesson needs a title.`);
    return { id: lesson.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-'), name: lesson.title, chapter, theory: lesson.theory, listen: lesson.listen, steps: [] };
  }
  const ragam = chapter.ragam ?? chapter.stage.ragam ?? DEFAULT_RAGAM;
  if (!RAGAMS[ragam]) throw new Error(`${chapter.title}: "${ragam}" is not a known ragam. Use ${Object.keys(RAGAMS).join(' or ')}.`);
  const steps = parse(lesson.swaras, `${chapter.title}, ${lesson.title ?? lesson.swaras}`, ragam);
  return {
    id: lesson.title ? lesson.title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-') : steps.map((step) => step.id).join('-'),
    name: lesson.title ?? steps.map((step) => step.swara).join(' '),
    theory: lesson.theory,
    chapter,
    steps,
    ragam: RAGAMS[ragam].name,
    scale: scaleOf(ragam),
    seconds: chapter.secondsPerBeat,
    cycle: lesson.beatsPerLine ?? chapter.beatsPerLine,
  };
}));

const seen = new Set();
LESSONS.forEach((lesson) => {
  if (seen.has(lesson.id)) throw new Error(`${lesson.chapter.title}, ${lesson.name}: another lesson already has this name. Give one of them a title.`);
  seen.add(lesson.id);
});
