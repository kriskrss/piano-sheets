// Cadence regression test: tunes must encode rhythm, not one beat per note.
// Run: node test-cadence.mjs
import { readFileSync } from "node:fs";
import assert from "node:assert";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Every tune declares a tempo
const bpms = [...html.matchAll(/bpm:\s*(\d+)/g)].map(m => +m[1]);
assert.ok(bpms.length >= 16, `expected >=16 tunes with bpm, got ${bpms.length}`);
assert.ok(bpms.every(b => b >= 40 && b <= 200), "bpm out of range");

// Tokens may carry :beats suffix, e.g. G:2 or C:0.5 ; separators are | and -
function tuneBlock(id) {
  const i = html.indexOf(`id:"${id}"`);
  assert.ok(i >= 0, `tune ${id} missing`);
  const next = html.indexOf('{ id:"', i + 1);
  return html.slice(i, next < 0 ? html.length : next);
}
function noteTokens(block) {
  const out = [];
  for (const m of block.matchAll(/\["([^"]*)","[^"]*"\]/g)) {
    {
      for (const tok of m[1].split(/\s+/).filter(Boolean)) {
        if (tok === "|" || tok === "-") continue;
        const mm = tok.match(/^([A-G][#b]?[+-]?\d?|[A-G][#b]?\d?)(?::(\d+(?:\.\d+)?))?(?:@(\d+))?$/);
        assert.ok(mm, `unparseable note token ${tok}`);
        out.push({ pitch: mm[1], beats: mm[2] ? +mm[2] : 1, key: mm[3] ? +mm[3] : null });
      }
    }
  }
  return out;
}

// Twinkle: phrase-final notes are held twice as long; pitches unchanged
const tw = noteTokens(tuneBlock("twinkle"));
assert.deepEqual(tw.slice(0, 7).map(n => n.pitch.replace(/\d/g, "")), ["C","C","G","G","A","A","G"]);
assert.equal(tw[6].beats, 2, "Twinkle line 1 final G must be held 2 beats");
assert.ok(tw.some(n => n.beats !== 1), "Twinkle must not be uniform beats");

// Mary: explicit final hold
const mary = noteTokens(tuneBlock("mary"));
assert.equal(mary[mary.length - 1].beats, 3, "Mary final note must be a long hold");

// Hot Cross Buns: quick middle run is subdivided
const hot = noteTokens(tuneBlock("hotcross"));
assert.ok(hot.some(n => n.beats === 0.5), "Hot Cross Buns must contain 0.5-beat notes");

// No tune is left with uniform 1-beat notes (the jumbled-playback bug)
for (const id of ["interstellar","hedwig","twinkle","mary","hotcross","oldmac","londonbridge","rowboat","wheels","sleeping","lassie","itsy","threeblind","farmer","rainrain","hickory","starwars","jurassicpark","barenecessities","hakunamatata","letitgo"]) {
  const notes = noteTokens(tuneBlock(id));
  assert.ok(notes.length > 0, `${id}: no notes parsed`);
  assert.ok(notes.some(n => n.beats !== 1), `${id}: still uniform 1-beat cadence`);
  assert.ok(notes.every(n => n.beats > 0 && n.beats <= 4), `${id}: beats out of range`);
}

// Interstellar (Gigglescape): notes span two octaves, so every note must pin
// its white key explicitly. The anchor E is the 10th white key (per the tune's
// own instructions); pattern notes sit below it, the turn above it. Without
// @key the player guessed the octave per note and the melody drifted.
const inter = noteTokens(tuneBlock("interstellar"));
assert.deepEqual(inter.slice(0, 24).map(n => n.key),
  [4,6,10,6,10, 5,7,10,7,10, 6,8,10,8,10, 5,9,10,9,10, 11,12,13,12],
  "Interstellar Gigglescape notes must pin keys 4-13 with E on key 10");
assert.ok(html.includes("function tokenKey"), "missing tokenKey parser for @key pins");

// Hedwig (Gigglescape): plain notes are the lower half (keys 1-7), + notes the
// higher half (keys 8-14). Line 3 must restart on low B (key 7), not drift to
// the high B after the previous phrase.
const hed = noteTokens(tuneBlock("hedwig"));
assert.deepEqual(hed.slice(0, 23).map(n => n.key),
  [3,6,8,7,6, 10,9,14,13, 7,10,12,11,10, 14,13,11, 10,12,11,9,11,7],
  "Hedwig Gigglescape notes must pin lower/higher-half keys with line 3 on low B (key 7)");

// London Bridge: the published score opens with a dotted rhythm - G held
// 1.5 beats, A squeezed into 0.5 - on lines 1/3. Line 2 has no quick pair:
// both "fall-ing down" halves are two quarters into a held note (F, then G).
const lon = noteTokens(tuneBlock("londonbridge"));
assert.deepEqual(lon.slice(0, 7).map(n => n.beats), [1.5,0.5,1,1,1,1,2]);
assert.deepEqual(lon.slice(7, 13).map(n => n.beats), [1,1,2,1,1,2]);
// Line 4 ("my fair la-dy"): the score holds D and G for 2 beats each
// (PrintableGarden / tonalics readings of the published score).
assert.deepEqual(lon.slice(20, 24).map(n => n.pitch), ["D","G","E","C"]);
assert.deepEqual(lon.slice(20, 24).map(n => n.beats), [2,2,1,2]);

// Three Blind Mice: the three long lines all climb the same figure
// (G C+ C+ B A B C+ ...) and the song ends on low C, not a held high C.
const tbm = noteTokens(tuneBlock("threeblind"));
assert.deepEqual(tbm.slice(14, 47).map(n => n.pitch),
  ["G","C+","C+","B","A","B", "C+","G","G", "G","C+","C+","C+","B",
   "A","B","C+","G","G", "G","C+","C+","C+","B","A","B", "C+","G","G","G",
   "E","D","C"],
  "Three Blind Mice middle/ending must follow the published figure");
assert.equal(tbm[46].beats, 3, "Three Blind Mice final low C must be held");

// Farmer in the Dell: "Heigh-ho" descends G G A G E C and the last line
// starts on D (D E E D D C), per published letter-note editions.
const frm = noteTokens(tuneBlock("farmer"));
assert.deepEqual(frm.slice(12, 24).map(n => n.pitch.replace(/\d/g, "")),
  ["G","G","A","G","E","C","D","E","E","D","D","C"],
  "Farmer lines 3-4 must match the published melody");

// Rain, Rain: running-eighths standard, every line totals exactly 4 beats
const rain = noteTokens(tuneBlock("rainrain"));
const rainLines = [[0,5],[5,12],[12,19],[19,26]];
for (const [a,b] of rainLines) {
  const total = rain.slice(a,b).reduce((s,n) => s + n.beats, 0);
  assert.equal(total, 4, `rainrain notes ${a}-${b} must total 4 beats, got ${total}`);
}
assert.deepEqual(rain.slice(0,5).map(n => n.beats), [1,1,0.5,0.5,1]);

// Star Wars: the triplet pickup becomes three quick Gs, then two held
// notes (Hoffman Academy's G-major lesson transposed to C; La Touche
// Musicale's C-major letter notes agree on the pitches).
const sw = noteTokens(tuneBlock("starwars"));
assert.deepEqual(sw.slice(0, 5).map(n => n.pitch), ["G","G","G","C+","G"]);
assert.deepEqual(sw.slice(0, 5).map(n => n.beats), [0.5,0.5,0.5,2,2]);

// Jurassic Park: slow held-note theme; La Touche Musicale and
// pianoletternotes C-major letter notes agree on this pitch sequence.
const jp = noteTokens(tuneBlock("jurassicpark"));
assert.deepEqual(jp.slice(0, 3).map(n => n.pitch), ["C+","B","C+"]);
assert.deepEqual(jp.slice(0, 3).map(n => n.beats), [2,1,2]);

// Bare Necessities: C-major transcription (mypianonotes) with the Eb blue
// note written as D#; a guitar tab transcription agrees on the chorus motif.
const bn = noteTokens(tuneBlock("barenecessities"));
assert.deepEqual(bn.slice(0, 10).map(n => n.pitch), ["G","A","C+","D#","E+","D#","E+","D","C+","A"]);
assert.deepEqual(bn.slice(0, 2).map(n => n.beats), [0.5,0.5]);
assert.equal(bn[9].beats, 2, "Bare Necessities line 1 must end on a held A");

// Hakuna Matata: chorus pitches from the AmosDoll/ChordU tutorial
// (D Eb D Eb D C / A C D Eb D C), Eb written as D# for the gig parser.
const hk = noteTokens(tuneBlock("hakunamatata"));
assert.deepEqual(hk.slice(0, 6).map(n => n.pitch), ["D","D#","D","D#","D","C"]);
assert.deepEqual(hk.slice(0, 6).map(n => n.beats), [1,0.5,0.5,1,1,2]);

// Let It Go: chorus only, in C major. Hoffman Academy's lesson and
// musicpandit's letter notes agree: A B C / G G D, rising to G5 on
// "I don't care".
const lig = noteTokens(tuneBlock("letitgo"));
assert.deepEqual(lig.slice(0, 3).map(n => n.pitch), ["A","B","C+"]);
assert.deepEqual(lig.slice(0, 3).map(n => n.beats), [0.5,0.5,3]);

// Playback + tutorial must consume the same durations
for (const sym of ["function tokenBeats", "function playTune", "function stopPlayback", "AudioContext"]) {
  assert.ok(html.includes(sym), `missing ${sym}`);
}
assert.ok(html.includes('id="playBtn"'), "missing Play button");
assert.ok(html.includes('id="tempoRange"'), "missing tempo control");

console.log("cadence ok:", bpms.length, "tunes with bpm");
