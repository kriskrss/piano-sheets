// Cadence regression test: tunes must encode rhythm, not one beat per note.
// Run: node test-cadence.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

// Every tune declares a tempo
const bpms = [...html.matchAll(/bpm:\s*(\d+)/g)].map(m => +m[1]);
assert.ok(bpms.length >= 16, `expected >=16 tunes with bpm, got ${bpms.length}`);
assert.ok(bpms.every(b => b >= 40 && b <= 200), "bpm out of range");

// Tokens may carry :beats suffix (including fractions), @key pin, and ~ tie; R is rest; separators are | and -
function tuneBlock(id) {
  const i = html.indexOf(`id:"${id}"`);
  assert.ok(i >= 0, `tune ${id} missing`);
  const next = html.indexOf('{ id:"', i + 1);
  return html.slice(i, next < 0 ? html.length : next);
}
function parseBeatsStr(s) {
  if (!s) return 1;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map(Number);
    return b ? a / b : 1;
  }
  return +s;
}
function parseTokensFromLines(lines) {
  const out = [];
  for (const [text] of lines) {
    for (const tok of text.split(/\s+/).filter(Boolean)) {
      if (tok === "|" || tok === "-") continue;
      const rm = tok.match(/^R(?::(\d+(?:\.\d+)?|\d+\/\d+))?$/);
      if (rm) {
        out.push({ kind: "rest", pitch: "R", beats: parseBeatsStr(rm[1]), key: null, tied: false });
        continue;
      }
      const tied = /~$/.test(tok);
      const base = tok.replace(/~$/, "");
      const pitch = base.replace(/@\d+/g, "").replace(/:(?:\d+(?:\.\d+)?|\d+\/\d+)/g, "");
      const bm = base.match(/:(\d+(?:\.\d+)?|\d+\/\d+)/);
      const km = base.match(/@(\d+)/);
      assert.ok(/^[A-G][#b]?[+-]?\d?$/.test(pitch), `unparseable note token ${tok}`);
      out.push({ kind: "note", pitch, beats: parseBeatsStr(bm && bm[1]), key: km ? +km[1] : null, tied });
    }
  }
  return out;
}
function allTokens(block) {
  const lines = [];
  for (const m of block.matchAll(/\["([^"]*)","[^"]*"\]/g)) lines.push([m[1], ""]);
  return parseTokensFromLines(lines);
}
function noteTokens(block) {
  return allTokens(block).filter(n => n.kind === "note");
}

// ============ Engine harness (executes index.html <script> in vm) ============
function makeEl(tag = "div") {
  const classes = new Set();
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    children: [],
    listeners: {},
    innerHTML: "",
    textContent: "",
    value: "",
    min: "",
    max: "",
    step: "",
    className: "",
    classList: {
      toggle(c, force) {
        if (force === undefined) { if (classes.has(c)) classes.delete(c); else classes.add(c); }
        else if (force) classes.add(c); else classes.delete(c);
      },
      add(c) { classes.add(c); },
      remove(...cs) { cs.forEach(c => classes.delete(c)); },
      contains(c) { return classes.has(c); }
    },
    appendChild(ch) { el.children.push(ch); return ch; },
    addEventListener(ev, fn) { el.listeners[ev] = fn; },
    setAttribute() {},
    querySelector(sel) {
      if (sel === "h2" || sel === ".count" || sel === ".cardtitle" || sel === ".cardsub") return makeEl("span");
      return makeEl();
    },
    closest() { return null; },
    scrollIntoView() {}
  };
  return el;
}

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "missing <script> block");
const domMap = new Map();
for (const id of ["home","focus","fTitle","fGroup","fName","fStart","fKb","kbLeft","kbMid","kbRight","fNotes","fTip","fYt","fProgress","tempoRange","tempoVal","playBtn","followBtn","nextNoteBtn","resetBtn","wakeBtn","backBtn","prevTune","nextTune","searchInput"]) {
  domMap.set("#" + id, makeEl(id === "tempoRange" ? "input" : "div"));
}
domMap.get("#tempoRange").min = "36";
domMap.get("#tempoRange").max = "200";
domMap.get("#tempoRange").step = "1";
domMap.get("#tempoRange").value = "100";

// Browser-accurate <input type="range"> clamping/stepping simulation
{
  const tr = domMap.get("#tempoRange");
  let _val = "100";
  Object.defineProperty(tr, "value", {
    get() { return _val; },
    set(v) {
      const min = parseFloat(tr.min), max = parseFloat(tr.max), step = parseFloat(tr.step) || 1;
      let num = Math.max(min, Math.min(max, Number(v)));
      num = min + Math.round((num - min) / step) * step;
      if (num > max) num -= step;
      _val = String(num);
    }
  });
}

const sandbox = {
  console, Math, Array, Object, Set, Map, WeakMap, String, Number, parseInt, parseFloat, isNaN,
  setTimeout, clearTimeout,
  localStorage: { _m: {}, getItem(k) { return this._m[k] || null; }, setItem(k, v) { this._m[k] = String(v); } },
  navigator: {},
  window: {},
  document: {
    body: { style: {} },
    querySelector(s) { return domMap.get(s) || null; },
    querySelectorAll() { return []; },
    createElement(tag) { return makeEl(tag); },
    addEventListener() {}
  }
};
sandbox.window = sandbox;
vm.runInNewContext(scriptMatch[1] + "\nthis.__api = { TUNES, isRestToken, isTiedToken, tokenBeats, tokenPitch, tokenKey, beatsLabel, buildSequence, firstNoteLabel, casioMidi, generateGigVariant, playToneAt, ensureAudio, setTempo, tempoBpm, setAudioCtx(c, m){ audioCtx = c; masterGain = m; } };", sandbox);
const api = sandbox.__api;

function gigAllTokens(id) {
  const t = api.TUNES.find(x => x.id === id);
  assert.ok(t, `tune ${id} missing`);
  return parseTokensFromLines(api.generateGigVariant(t).lines);
}
function gigTokens(id) {
  return gigAllTokens(id).filter(n => n.kind === "note");
}
function casioAllTokens(id) {
  const t = api.TUNES.find(x => x.id === id);
  assert.ok(t, `tune ${id} missing`);
  return parseTokensFromLines(t.casio.lines);
}
function casioTokens(id) {
  return casioAllTokens(id).filter(n => n.kind === "note");
}

// Twinkle: phrase-final notes are held twice as long; pitches unchanged
const tw = gigTokens("twinkle");
assert.deepEqual(tw.slice(0, 7).map(n => n.pitch.replace(/[+-\d]/g, "")), ["C","C","G","G","A","A","G"]);
assert.equal(tw[6].beats, 2, "Twinkle line 1 final G must be held 2 beats");
assert.ok(tw.some(n => n.beats !== 1), "Twinkle must not be uniform beats");

// Mary: explicit final hold
const mary = gigTokens("mary");
assert.equal(mary[mary.length - 1].beats, 3, "Mary final note must be a long hold");

// Hot Cross Buns: quick middle run is subdivided
const hot = gigTokens("hotcross");
assert.ok(hot.some(n => n.beats === 0.5), "Hot Cross Buns must contain 0.5-beat notes");

// No tune is left with uniform 1-beat notes (the jumbled-playback bug)
for (const id of ["interstellar","hedwig","twinkle","mary","hotcross","oldmac","londonbridge","rowboat","wheels","sleeping","lassie","itsy","threeblind","farmer","rainrain","hickory","starwars","jurassicpark","barenecessities","hakunamatata","letitgo","marriedlife","myheartwillgoon","pinkpanther","babyshark","canthelpfalling","rememberme","hesapirate","howfarillgo","wedonttalkaboutbruno","awholenewworld","athousandyears","perfect","amilliondreams","iseethelight","hallelujah","allisfound","overtherainbow","shallow","sweden","coffindance","gummybear","fnaf","gravityfalls","silentnight","miraculous","happybirthday","allofme","diewithasmile","furelise","faded","beautifulinwhite","someonelikeyou","wellerman","peppapig","tryeverything","countonme","dancemonkey","showyourself","rewritethestars","bohemianrhapsody","riverflowsinyou","flymetothemoon","leanonme","amazinggrace","goldenhour","whatawonderfulworld","flowers","peaches","wearethechampions","megalovania","godzilla","thepianoduet","bloodymary","givethanks","yousay","hereiamtoworship","oceans","amongusdrip","toxic"]) {
  const notes = gigTokens(id);
  assert.ok(notes.length > 0, `${id}: no notes parsed`);
  assert.ok(notes.some(n => n.beats !== 1), `${id}: still uniform 1-beat cadence`);
  assert.ok(notes.every(n => n.beats > 0 && n.beats <= 12), `${id}: beats out of range`);
}

// Interstellar (Gigglescape): notes span two octaves, so every note must pin
// its white key explicitly. The anchor E is the 10th white key (per the tune's
// own instructions); pattern notes sit below it, the turn above it. Without
// @key the player guessed the octave per note and the melody drifted.
const inter = gigTokens("interstellar");
assert.deepEqual(inter.slice(0, 24).map(n => n.key),
  [4,6,10,6,10, 5,7,10,7,10, 6,8,10,8,10, 5,9,10,9,10, 11,12,13,12],
  "Interstellar Gigglescape notes must pin keys 4-13 with E on key 10");
assert.ok(html.includes("function tokenKey"), "missing tokenKey parser for @key pins");

// Hedwig: re-encoded from Stefan Lechner's easy arrangement
// (creativepiano.at, E minor, 3/4, supplied by Sai): pickup B, then
// E dotted-quarter / G eighth / F# quarter; the strain's signature bar
// is half + quarter (E B, F# C, A B). The score's B-flat is written
// as A# on Gigglescape.
const hedGig = gigTokens("hedwig");
const hedCasio = casioTokens("hedwig");
assert.deepEqual(hedGig.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["B","E","G","F#"]);
assert.deepEqual(hedGig.slice(0, 4).map(n => n.key), [7,10,12,11]);
assert.deepEqual(hedGig.slice(0, 4).map(n => n.beats), [1,1.5,0.5,1]);
assert.deepEqual(hedCasio.slice(0, 4).map(n => n.pitch), ["B3","E4","G4","F#4"]);
assert.deepEqual(hedCasio.slice(0, 4).map(n => n.beats), [1,1.5,0.5,1]);

// London Bridge: the published score opens with a dotted rhythm - G held
// 1.5 beats, A squeezed into 0.5 - on lines 1/3. Line 2 has no quick pair:
// both "fall-ing down" halves are two quarters into a held note (F, then G).
const lon = gigTokens("londonbridge");
assert.deepEqual(lon.slice(0, 7).map(n => n.beats), [1.5,0.5,1,1,1,1,2]);
assert.deepEqual(lon.slice(7, 13).map(n => n.beats), [1,1,2,1,1,2]);
// Line 4 ("my fair la-dy"): the score holds D and G for 2 beats each
// (PrintableGarden / tonalics readings of the published score).
assert.deepEqual(lon.slice(20, 24).map(n => n.pitch.replace(/[+-]/g, "")), ["D","G","E","C"]);
assert.deepEqual(lon.slice(20, 24).map(n => n.beats), [2,2,1,2]);

// Three Blind Mice: the three long lines all climb the same figure
// (G C+ C+ B A B C+ ...) and the song ends on low C, not a held high C.
const tbm = gigTokens("threeblind");
assert.deepEqual(tbm.slice(14, 47).map(n => n.pitch.replace(/[+-]/g, "")),
  ["G","C","C","B","A","B", "C","G","G", "G","C","C","C","B",
   "A","B","C","G","G", "G","C","C","C","B","A","B", "C","G","G","G",
   "E","D","C"],
  "Three Blind Mice middle/ending must follow the published figure");
assert.equal(tbm[46].beats, 3, "Three Blind Mice final low C must be held");

// Farmer in the Dell: "Heigh-ho" descends G G A G E C and the last line
// starts on D (D E E D D C), per published letter-note editions.
const frm = gigTokens("farmer");
assert.deepEqual(frm.slice(12, 24).map(n => n.pitch.replace(/[+-\d]/g, "")),
  ["G","G","A","G","E","C","D","E","E","D","D","C"],
  "Farmer lines 3-4 must match the published melody");

// Rain, Rain: running-eighths standard, every line totals exactly 4 beats
const rain = gigTokens("rainrain");
const rainLines = [[0,5],[5,12],[12,19],[19,26]];
for (const [a,b] of rainLines) {
  const total = rain.slice(a,b).reduce((s,n) => s + n.beats, 0);
  assert.equal(total, 4, `rainrain notes ${a}-${b} must total 4 beats, got ${total}`);
}
assert.deepEqual(rain.slice(0,5).map(n => n.beats), [1,1,0.5,0.5,1]);

// Star Wars: the opening figure is an eighth-note triplet (3 notes in 1
// beat, encoded 0.33 each) - Hoffman Academy's scored lesson counts the
// first phrase as triplet + two half notes; the Edexcel GCSE analysis of
// the orchestral score gives bars 2-4 as triplet quavers + tied minim +
// crotchet. Pitches: Hoffman Academy's G-major lesson transposed to C.
const sw = gigTokens("starwars");
assert.deepEqual(sw.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["G","G","G","C","G"]);
assert.deepEqual(sw.slice(0, 5).map(n => n.beats), [0.33,0.33,0.33,2,2]);
assert.deepEqual(sw.slice(5, 10).map(n => n.beats), [0.33,0.33,0.33,2,1]);

// Jurassic Park: re-encoded Nov 2026 from the Betacustic beginner
// sheet (Musicnotes MN0252051, C major, 4/4, q=100), page-1 preview
// (pickup + 14 bars): dotted-quarter + eighth pickup, dotted-half
// bars answered by an eighth-note pair, dotted-quarter/eighth
// figure bars. The sheet marks q=100, so bpm is 100 (was 76).
const jp = gigTokens("jurassicpark");
assert.deepEqual(jp.slice(0, 2).map(n => n.pitch.replace(/[+-]/g, "")), ["C","B"]);
assert.deepEqual(jp.slice(0, 2).map(n => n.beats), [1.5,0.5]);
assert.deepEqual(jp.slice(2, 5).map(n => n.beats), [3,0.5,0.5]);

// Bare Necessities: rhythm from the published piano/vocal score (the
// SheetMusic-Free PVG engraving of the Gilkyson original): "Look for
// the" are three quarter-note pickups, "bare" is a half note, and
// "si-ties" is an eighth-note pair. Pitches: C-major transcription
// (mypianonotes), Eb written as D#.
const bn = gigTokens("barenecessities");
assert.deepEqual(bn.slice(0, 10).map(n => n.pitch.replace(/[+-]/g, "")), ["G","A","C","D#","E","D#","E","D","C","A"]);
assert.deepEqual(bn.slice(0, 10).map(n => n.beats), [1,1,1,2,1,1,0.5,0.5,1,2]);
assert.equal(bn[9].beats, 2, "Bare Necessities line 1 must end on a held A");

// Hakuna Matata: rhythm from the official Lion King songbook
// (Wonderland Music, piano/vocal): the title phrase is chanted in
// eighth notes and quarter-note triplets (triplets approximated as 0.5
// notes), final note held 1.5. Pitches: AmosDoll/ChordU tutorial,
// Eb written as D# for the gig parser.
const hk = gigTokens("hakunamatata");
assert.deepEqual(hk.slice(0, 6).map(n => n.pitch.replace(/[+-]/g, "")), ["D","D#","D","D#","D","C"]);
assert.deepEqual(hk.slice(0, 6).map(n => n.beats), [0.5,0.5,0.5,0.5,0.5,1.5]);

// Let It Go: re-encoded Nov 2026 from the Betacustic beginner sheet
// (Musicnotes MN0230940, E minor, 4/4, q=80), page-1 preview: the
// VERSE strain (the chorus sits on the paywalled page 2). Eighth-note
// groups into a dotted-quarter G; the final bar's rest is folded into
// the C# and the low A3 pickup to page 2 is left off.
const lig = gigTokens("letitgo");
assert.deepEqual(lig.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["F#","G","B"]);
assert.deepEqual(lig.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Itsy Bitsy Spider: rhythm from the engraved PianoLessons4Children
// C-major score (4/4, lyrics underlaid): the whole tune lilts in
// dotted-eighth + sixteenth pairs (0.75/0.25); "spi" and phrase peaks
// are quarters, phrase-final notes carry the score's quarter rest in
// their hold. Gig line totals: 8.5 / 8 / 8 / 7 / 4.75.
const its = gigTokens("itsy");
const itsAll = gigAllTokens("itsy");
assert.deepEqual(its.slice(0, 12).map(n => n.beats),
  [0.5,0.75,0.25,0.75,0.25,1,0.75,0.25,0.75,0.25,1,1]);
assert.deepEqual(itsAll.slice(11, 13).map(n => [n.kind, n.beats]), [["note", 1], ["rest", 1]]);
for (const [a, b, tot] of [[0,13,8.5],[13,24,8],[24,35,8],[35,46,7],[46,50,4.75]]) {
  const total = itsAll.slice(a, b).reduce((sum, n) => sum + n.beats, 0);
  assert.ok(Math.abs(total - tot) < 0.01, `itsy gig tokens ${a}-${b} must total ${tot}, got ${total}`);
}

// Married Life (Up): Betacustic beginner sheet (Musicnotes MN0233977,
// F major, 3/4, q=100), main strain bars 5-10: dotted-half F opening,
// F A G eighth-note answer, rests folded into the preceding hold.
const ml = gigTokens("marriedlife");
assert.deepEqual(ml.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["F","F","A","G"]);
assert.deepEqual(ml.slice(0, 4).map(n => n.beats), [3,0.5,0.5,0.5]);
assert.equal(ml[8].beats, 2, "Married Life C+ is a half note before its unfolded eighth rest");
const mlAll = gigAllTokens("marriedlife");
assert.deepEqual(mlAll.slice(11, 13).map(n => [n.kind, n.beats]), [["note", 2], ["rest", 0.5]]);

// My Heart Will Go On: Betacustic beginner sheet (Musicnotes MN0226803,
// F major, 4/4, q=70): dotted-quarter + eighth F figure opens each
// verse line; rests folded into the preceding hold.
const mh = gigTokens("myheartwillgoon");
assert.deepEqual(mh.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["F","F","F","F"]);
assert.deepEqual(mh.slice(0, 4).map(n => n.beats), [1.5,0.5,1,1]);

// Pink Panther: Betacustic beginner sheet (Musicnotes MN0221798,
// E minor, 4/4): the riff is a grace-note pickup (encoded 0.5) into a
// dotted-long E and a short F#; statement 3 turns the grace note to
// Eb and the short note to D natural, landing on a held C.
const pp = gigTokens("pinkpanther");
assert.deepEqual(pp.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["D#","E","F#"]);
assert.deepEqual(pp.slice(0, 3).map(n => n.beats), [0.5,2.5,0.5]);

// Baby Shark: Betacustic beginner sheet (Musicnotes MN0225122,
// G major, 4/4, q=80): half-note name line, then the doo run in
// eighths with a sixteenth pair and a tied note (merged here).
const bs = gigTokens("babyshark");
assert.deepEqual(bs.slice(0, 2).map(n => n.beats), [2,2]);
assert.deepEqual(bs.slice(2, 9).map(n => n.beats), [0.5,0.5,0.5,0.25,0.5,0.25,0.5]);

// Can't Help Falling In Love: Betacustic beginner sheet (Musicnotes
// MN0233374, G major, 4/4, q=64): half-note pairs, a dotted-half D
// with an eighth-note answer, and a quarter-note triplet climb
// A B C encoded at 0.67 beats each.
const ch = gigTokens("canthelpfalling");
assert.deepEqual(ch.slice(0, 2).map(n => n.pitch.replace(/[+-]/g, "")), ["D","D"]);
assert.deepEqual(ch.slice(0, 2).map(n => n.beats), [2,2]);
assert.deepEqual(ch.slice(12, 15).map(n => n.beats), [0.67,0.67,0.67]);

// Remember Me: Betacustic beginner sheet (Musicnotes MN0231732,
// C major, 4/4, q=60), page-1 preview (9 bars): title phrase in
// quarters with a held C, eighth-note runs, rests folded into the
// preceding holds; the C7 bar's last note is G# leading back to A.
const rm = gigTokens("rememberme");
assert.deepEqual(rm.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["D","E","C"]);
assert.deepEqual(rm.slice(0, 3).map(n => n.beats), [1,1,2]);

// He's A Pirate: Betacustic beginner sheet (Musicnotes MN0226291,
// D minor, 6/8, dotted-quarter = 80, so bpm 120 in quarter beats):
// the D gallop bars, then the D-D-E / F-F-G / E-E-D-C answer.
// The low A3 sits under the Gigglescape board, so gig plays +12.
const hp = gigTokens("hesapirate");
assert.deepEqual(hp.slice(0, 4).map(n => n.beats), [1,0.5,1,0.5]);
assert.deepEqual(hp.slice(27, 31).map(n => n.pitch.replace(/[+-]/g, "")), ["D","D","D","E"]);
assert.deepEqual(hp.slice(27, 31).map(n => n.beats), [1,1,0.5,0.5]);

// How Far I'll Go: Betacustic beginner sheet (Musicnotes MN0222533,
// F major, 4/4, q=70), full page-1 preview (10 bars): syncopated
// sixteenth figures; rests folded into the preceding holds (the
// bar-1 F takes the sixteenth rest, bar-5 C the eighth rest).
const hf = gigTokens("howfarillgo");
const hfAll = gigAllTokens("howfarillgo");
assert.deepEqual(hf.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["F","C","F"]);
assert.deepEqual(hf.slice(0, 3).map(n => n.beats), [1,0.5,0.5]);
assert.equal(hfAll[3].kind, "rest");
assert.equal(hfAll[3].beats, 0.25);

// We Don't Talk About Bruno: Betacustic beginner sheet (Musicnotes
// MN0248513, C minor, 4/4, q=104), page-1 preview bars 1-10 (Pepa's
// verse): title figure over low A3, tied notes split across lines,
// rests folded into holds. Range F3-Bb4 sits under the Gigglescape
// board, so gig plays +12 (Eb written D# there, Bb written A#).
const br = gigTokens("wedonttalkaboutbruno");
assert.deepEqual(br.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["D#","A","D#"]);
assert.deepEqual(br.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// A Whole New World: Betacustic beginner sheet (Musicnotes
// MN0231731, D major, 4/4, q=80; link via the SLOW tutorial twin -
// the main video's description carried no sheet link), page-1
// preview (10 bars): paired-eighth phrases with slur arcs, a D#
// chromatic note in the Em6 bar, low A whole notes. Range A3-G4
// sits under the Gigglescape board, so gig plays +12.
const wn = gigTokens("awholenewworld");
assert.deepEqual(wn.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["F#","E","G"]);
assert.deepEqual(wn.slice(0, 3).map(n => n.beats), [1,0.5,0.5]);

// A Thousand Years: Betacustic beginner sheet (Musicnotes MN0232640,
// C major, 6/8, dotted-quarter = 50, so bpm 75 in quarter beats),
// page-1 preview (15 bars): dotted-quarter pairs, a sixteenth-note
// pair in bar 2, beamed eighth-note descents; bar 13's closing rest
// is folded into the final E.
const aty = gigTokens("athousandyears");
assert.deepEqual(aty.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["E","E","E","D"]);
assert.deepEqual(aty.slice(0, 6).map(n => n.beats), [1.5,1.5,1.5,1,0.25,0.25]);

// Perfect: Betacustic beginner sheet (Musicnotes MN0231886,
// G major, 12/8, dotted-quarter = 54, so bpm 81 in quarter beats),
// page-1 preview (pickup + 7 bars): dotted-half holds answered by
// beamed eighth-note figures; rests folded into the preceding hold
// where the hold stays within 4 beats (bars 3, 4 and 6), omitted
// where folding would break the cap (bars 1, 2 and 5).
const pf = gigTokens("perfect");
assert.deepEqual(pf.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["D","E","G","G"]);
assert.deepEqual(pf.slice(0, 4).map(n => n.beats), [0.5,0.5,0.5,3]);

// A Million Dreams: the main tutorial's sheet link leads to an
// Easy grand-staff edition (MN0201058, no note names, mostly intro
// on page 1), so this uses the SLOW twin's Beginner Notes edition
// (Musicnotes MN0217678, G major, 4/4, q = 120), page-1 preview:
// the singing enters at bar 5 (B B C, then D C B C twice); the
// eighth rests after the D notes are folded into their holds.
const md = gigTokens("amilliondreams");
const mdAll = gigAllTokens("amilliondreams");
assert.deepEqual(md.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["B","B","C"]);
assert.deepEqual(md.slice(0, 5).map(n => n.beats), [0.5,1,1,1,0.5]);
assert.equal(mdAll[4].kind, "rest");
assert.equal(mdAll[4].beats, 0.5);

// I See The Light: Betacustic beginner sheet (Musicnotes MN0222534,
// C major, 4/4, q = 80), page-1 preview (10 bars), cross-checked
// against the SLOW twin's Easy edition (MN0207198): quarter-quarter-
// half phrases, beamed eighth-note descents to the low G, one
// whole-note bar. The melody dips below the gig board (G3, B3), so
// the gig version plays an octave up, with three pinned keys where
// the nearest-key rule would land on the wrong octave.
const isl = gigTokens("iseethelight");
assert.deepEqual(isl.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G","F","E"]);
assert.deepEqual(isl.slice(0, 3).map(n => n.beats), [1,1,2]);

// Hallelujah: Betacustic beginner sheet (Musicnotes MN0222670,
// C major, 6/8, dotted-quarter = 60, so bpm 90 in quarter beats),
// page-1 preview (pickup + 14 bars): tied eighths merged into their
// holds in bars 2-4; bar 8 is rests plus a pickup eighth, and its
// rests (2.5 beats) are folded into bar 7's dotted D, which lands
// exactly on the 4-beat cap.
const hj = gigTokens("hallelujah");
assert.deepEqual(hj.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G","G","G"]);
assert.deepEqual(hj.slice(0, 3).map(n => n.beats), [0.5,1,0.5]);

// All Is Found: Betacustic beginner sheet (Musicnotes MN0231590,
// A minor, 4/4, q = 70), page-1 preview (pickup + 7 bars). Head
// fill is unreliable in this preview (D, G and dotted C heads print
// hollow-looking), so values rest on beams, flags, dots and bar
// arithmetic: dotted quarters of 1.5 in bars 1-3, a sixteenth pair
// in bar 4. Rests fold into the preceding hold (bars 1-4; bar 6's
// opening eighth rest folds back into bar 5's C, 2 + 0.5 = 2.5).
// Ties merge within bars 4 and 7; the bar 1-2 and bar 6-7 ties stay
// as paired eighths across the line break.
const af = gigTokens("allisfound");
assert.deepEqual(af.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C","D","E"]);
assert.deepEqual(af.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Somewhere Over The Rainbow: Betacustic beginner sheet
// (Musicnotes MN0235134, C major, 4/4, q = 90), page-1 preview
// (13 bars). Dotted-half F in bar 2; the dotted-quarter + eighth +
// quarter + quarter figure repeats in bars 3, 4 and 11 (several
// heads print hollow-looking; dots and bar arithmetic settle the
// values). Bar 6's opening quarter rest cannot fold into bar 5's
// whole note (cap), so it is omitted; bar 13's opening quarter rest
// folds back into bar 12's tied B (2.5 + 1 = 3.5).
const rb = gigTokens("overtherainbow");
assert.deepEqual(rb.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C","F","D"]);
assert.deepEqual(rb.slice(0, 3).map(n => n.beats), [4,3,1]);

// Shallow: Betacustic beginner sheet (Musicnotes MN0232318,
// E minor, 4/4, q = 96), page-1 preview (15 bars). Quarter rests
// open bars 1, 3, 5, 7 and are omitted at line starts; the B of
// bars 1-2 is an eighth tied to a half note (2.5) with the bar-2
// half rest folded up to the 4 cap. Bars 4 and 8 settle by bar
// arithmetic as C eighth, B quarter, A eighth tied to A half
// (2.5); several heads print hollow-looking. Bar 12's tied A pair
// merges (0.5 + 0.5) and its last G eighth ties into bar 13's G
// half, giving G 2.5 inside line 9.
const sh = gigTokens("shallow");
assert.deepEqual(sh.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C","D","D"]);
assert.deepEqual(sh.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Sweden (Minecraft): Betacustic beginner sheet (Musicnotes
// MN0236864, B minor / D major, 4/4, q = 44), page-1 preview
// (12 bars). Bars 1-6 are half-note pairs: the low note climbs
// G3 A3 B3 C#4, falls back to B3, C#4, each answered by D4.
// Bars 7-12 settle by beams and bar arithmetic: dotted quarters
// of 1.5 and sixteenth pairs of 0.25; bar 7's low B is a quarter
// (the bar only totals 4 that way). The gig board re-voices the
// low strain an octave up and keeps the high sparkles as written.
const swedenN = gigTokens("sweden");
assert.deepEqual(swedenN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "D", "A"]);
assert.deepEqual(swedenN.slice(0, 3).map(n => n.beats), [2, 2, 2]);

// Coffin Dance (Astronomia): Betacustic beginner sheet
// (Musicnotes MN0227183, A minor, 4/4, q = 70), page-1 preview
// (10 bars, lettered heads). Bars 1-4 are straight eighth-note
// riff bars; bars 5-6 and their repeat in 9-10 mix quarters with
// beamed eighth pairs; bars 7-8 jump A4 to A5 in eighths after a
// quarter. Every bar totals 4 by beams and arithmetic.
const coffindanceN = gigTokens("coffindance");
assert.deepEqual(coffindanceN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "C", "C"]);
assert.deepEqual(coffindanceN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// The Gummy Bear Song: Betacustic beginner sheet (Musicnotes
// MN0228066, A minor, 4/4, q = 89), page-1 preview (pickup bar
// plus 8 bars, lettered heads). The signature figure is a beamed
// eighth pair, a quarter tied to an eighth (1.5), then three
// eighths; the C bars answer with quarter + tied eighths. Every
// full bar totals 4 by beams, ties and arithmetic.
const gummybearN = gigTokens("gummybear");
assert.deepEqual(gummybearN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "A", "A"]);
assert.deepEqual(gummybearN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Five Nights at Freddy's (The Living Tombstone): Betacustic
// beginner sheet (Musicnotes MN0240717, A minor, 4/4, q = 100),
// page-1 preview (10 bars, lettered heads). The top strain is
// built on dotted-eighth + sixteenth pairs with half-note phrase
// ends; bars 5-10 are eighth-note arpeggio runs with an
// eighth + two-sixteenths tail figure. Bar 4 ends on G# (the
// leading tone). Every bar totals 4 by beams, dots and ties.
const fnafN = gigTokens("fnaf");
assert.deepEqual(fnafN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "A", "G"]);
assert.deepEqual(fnafN.slice(0, 3).map(n => n.beats), [1, 0.75, 0.25]);

// Gravity Falls Theme: Betacustic beginner sheet (Musicnotes
// MN0231591, D minor, 4/4, q = 140), page-1 preview (15 bars,
// lettered heads). Bars 1-4 loop an eighth-note arpeggio riff;
// in the A-major bars every C is sharp (marked once, carries
// through the bar). Bars 5-12 are long held notes (dotted half
// + quarter, whole notes, half-note pairs); bars 13 and 15 are
// three quarters after a quarter rest. Bar totals checked
// against beams, dots and note spacing.
const gravityfallsN = gigTokens("gravityfalls");
assert.deepEqual(gravityfallsN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["F", "D", "A"]);
assert.deepEqual(gravityfallsN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Silent Night: Betacustic beginner sheet (Musicnotes
// MN0245145, C major, 3/4, q = 80), page-1 preview (12 bars,
// lettered heads, lyrics printed). The opening figure is a
// dotted quarter + eighth + quarter; phrase ends are dotted
// halves. Bars 5, 7 and 9 pair a half note with a quarter
// (hollow head, then filled head, in all three bars).
const silentnightN = gigTokens("silentnight");
assert.deepEqual(silentnightN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "E", "G"]);
assert.deepEqual(silentnightN.slice(0, 3).map(n => n.beats), [1.5, 0.5, 1]);

// Miraculous Ladybug Theme: Betacustic beginner sheet
// (Musicnotes MN0234709, A minor, 4/4, q = 100), page-1
// preview (8 bars, lettered heads). Most bars open with a
// quarter + eighth rest, then a C4 C4 A3 riff figure. Bars 4
// and 8 hold a dotted quarter, then two eighths tied into one
// beat (merged here), a C4 eighth and a C4 quarter. Bar 7
// answers C4 B3 C4 A3. Every bar totals 4 by rests, beams,
// flags, dots and the tie.
const miraculousN = gigTokens("miraculous");
assert.deepEqual(miraculousN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "C", "A"]);
assert.deepEqual(miraculousN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Happy Birthday To You: Betacustic beginner sheet
// (Musicnotes MN0212901, F major, 3/4, no tempo printed -
// bpm 100 chosen as a comfortable singing speed), page-1
// preview (pickup + 11 bars, lettered heads). Each phrase
// opens with two beamed eighth-note C4 pickups; the long
// phrase notes (E4, F4) are half notes, not dotted halves,
// because the pickup pair shares their bar - every bar
// totals 3. The B in bar 7 is flat from the key signature.
const happybirthdayN = gigTokens("happybirthday");
assert.deepEqual(happybirthdayN.slice(0, 2).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "C"]);
assert.deepEqual(happybirthdayN.slice(0, 2).map(n => n.beats), [0.5, 0.5]);


// All Of Me: Betacustic beginner sheet (Musicnotes MN0235831,
// E minor, 4/4, q=120), page-1 preview (12 bars, lettered heads).
// Bars 1-4 share one figure: dotted quarter, eighth, quarter
// rest, quarter - the rests are dropped here (the app has no
// rests), so each of those lines totals 3 beats of notes.
// Bar 5 opens with a half rest (also dropped), bar 9's quarter
// rest likewise. Values rest on flags, dots and bar arithmetic;
// head fill is not trusted.
const allofmeN = gigTokens("allofme");
assert.deepEqual(allofmeN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["B", "A", "B"]);
assert.deepEqual(allofmeN.slice(0, 3).map(n => n.beats), [1.5, 0.5, 1]);


// Die With A Smile: Betacustic beginner sheet (Musicnotes
// MN0294217, C major, 6/8, dotted-q = 50, so bpm 75), page-1
// preview (12 bars, lettered heads). Long dotted holds open
// the tune; the quick figures are sixteenth pairs and
// dotted-eighth/sixteenth pairs read off the beams and dots.
// The dotted-quarter rests in bars 5, 7, 9 and 11 are dropped
// (the app has no rests). Head positions were checked against
// the measured staff lines; head fill is not trusted.
const diewithasmileN = gigTokens("diewithasmile");
assert.deepEqual(diewithasmileN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "E", "E"]);
assert.deepEqual(diewithasmileN.slice(0, 3).map(n => n.beats), [3, 1.5, 1.5]);


// Fur Elise: Betacustic beginner sheet (Musicnotes MN0224232,
// A minor, 6/8, dotted-q = 46, so bpm 69), page-1 preview
// (pickup + 7 bars, lettered heads). The famous strain: the
// E-D# pickup, then bars of three beamed eighths under a
// dotted-quarter melody note. Bar 7's group is E4 C5 B4 -
// this arrangement does NOT repeat bar 3's E4 G#4 B4 figure
// (no sharp sign; the middle head measures on the C5 space).
const fureliseN = gigTokens("furelise");
assert.deepEqual(fureliseN.slice(0, 2).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "D#"]);
assert.deepEqual(fureliseN.slice(0, 2).map(n => n.beats), [0.5, 0.5]);


// Faded: Betacustic beginner sheet (Musicnotes MN0226206,
// A minor, 4/4, q=74), page-1 preview (9 bars, lettered
// heads). Bars 1-4 are plain quarters (the hollow-looking
// heads cannot be halves - four halves would overflow the
// bar). Bars 5 and 9 open with an eighth rest and bar 7 with
// a half + eighth rest; the rests are dropped here.
const fadedN = gigTokens("faded");
assert.deepEqual(fadedN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "A", "A", "C"]);
assert.deepEqual(fadedN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);


// Beautiful In White: Betacustic beginner sheet (Musicnotes
// MN0235833, C major, 4/4, q=100), page-1 preview (24 bars,
// lettered heads). Eight whole-note bars open it (one note
// per bar, no stems); bar 7 is a dotted half + quarter.
// The verse strain repeats with variations: bars 17-20
// restate bars 9-12. Quarter rests opening bars 11, 13, 15,
// 19, 21 and 23 are dropped (the app has no rests).
const beautifulinwhiteN = gigTokens("beautifulinwhite");
assert.deepEqual(beautifulinwhiteN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "D", "C"]);
assert.deepEqual(beautifulinwhiteN.slice(0, 3).map(n => n.beats), [4, 4, 4]);


// Someone Like You: Betacustic beginner sheet (Musicnotes
// MN0236859, A major, 4/4, q=68), page-1 preview (11 bars,
// lettered heads below the staff). The rocking cell is a
// sixteenth + dotted eighth pair, then a dotted fall B-A;
// bar 5 closes with a quarter-note triplet (0.67 each) and
// bar 9 opens with an eighth triplet (0.33 each). Ties are
// merged into single holds (bar 4 C# pair = 1, bar 6 C# =
// 1.75, bar 8 A pair = 1). Quarter rests opening most bars
// are dropped. Gig plays +12 (the tune sits A3-F#4, below
// the gig board's home octave); pitch classes verified.
const someonelikeyouN = gigTokens("someonelikeyou");
assert.deepEqual(someonelikeyouN.slice(1, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "C#", "B", "A"]);
assert.deepEqual(someonelikeyouN.slice(1, 5).map(n => n.beats), [0.5, 1.5, 0.25, 0.75]);


// Wellerman: Betacustic beginner sheet (Musicnotes
// MN0233975, A minor, 2/4, q=80), page-1 preview: an eighth
// pickup plus 7 bars, lettered heads. Every bar is eighths
// with one sixteenth pair; the sub-beam position gives the
// split (bar 1: eighth + two sixteenths, then two eighths;
// bar 7 closes sixteenth-sixteenth-eighth). Bar 4 has a
// dotted-eighth + sixteenth pair. Gig plays +12 (the tune
// dips to A3); pitch classes verified.
const wellermanN = gigTokens("wellerman");
assert.deepEqual(wellermanN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "A", "A"]);
assert.deepEqual(wellermanN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.25]);


// Peppa Pig Theme: Betacustic beginner sheet (Musicnotes
// MN0260123, C major, 4/4, q=80), page-1 preview (lettered
// heads). The page is one two-bar phrase printed three
// times: bar 1 is quarters with an eighth pair in the
// middle (G5, E5-C5, D5, G4 - the hollow-looking heads
// cannot be halves, the bar arithmetic gives quarters),
// bar 2 runs up four eighths and lands E5-C5 in quarters.
const peppapigN = gigTokens("peppapig");
assert.deepEqual(peppapigN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "E", "C", "D"]);
assert.deepEqual(peppapigN.slice(0, 4).map(n => n.beats), [1, 0.5, 0.5, 1]);


// Try Everything: Betacustic beginner sheet (Musicnotes
// MN0236868, C major, 4/4, q=116), page-1 preview (13 bars,
// lettered heads). The opening chant bars are four G
// quarters (hollow-looking heads; four halves would
// overflow the bar) against whole-note holds. Bar 8 runs
// C-C-D-C-E in eighths after a quarter E and an eighth
// rest (dropped); bar 9's E is a half note tied in from
// bar 8; bar 13 opens on a dotted quarter.
const tryeverythingN = gigTokens("tryeverything");
assert.deepEqual(tryeverythingN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "G", "G", "G"]);
assert.deepEqual(tryeverythingN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);


// Count On Me: Betacustic beginner sheet (Musicnotes
// MN0261377, C major, 4/4, q=176), page-1 preview (13 bars,
// lettered heads). Two intro bars of rests are skipped; the
// strain opens on the G-A-C pickup with the C tied over the
// barline (merged to 1.5). Bars 5 and 13 rock E-D in eighths
// into two quarters; bar 6s last eighth ties into bar 7s
// dotted half (merged to a 3.5 hold on the last note of
// line 4). Rests inside bars are dropped.
const countonmeN = gigTokens("countonme");
assert.deepEqual(countonmeN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["G", "A", "C"]);
assert.deepEqual(countonmeN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 1.5]);
assert.deepEqual(countonmeN.slice(5, 11).map(n => n.beats), [0.5, 0.5, 0.5, 0.5, 1, 1]);


// Dance Monkey: Betacustic beginner sheet (Musicnotes
// MN0236650, A minor, 4/4, q=98), page-1 preview (pickup +
// 11 bars, lettered heads, full-size preview). The strain is
// the signature riff: A-G rocking eighths with a held B4 in
// every other bar (rests dropped). Bar 9 ends on a
// sixteenth + dotted-eighth B pair (0.25 + 0.75), read from
// the sub-beam and the dot after the second head.
const dancemonkeyN = gigTokens("dancemonkey");
assert.deepEqual(dancemonkeyN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "G", "A", "G"]);
assert.deepEqual(dancemonkeyN.slice(0, 4).map(n => n.beats), [0.5, 0.5, 0.5, 0.5]);
assert.deepEqual(dancemonkeyN.slice(54, 56).map(n => n.beats), [0.25, 0.75]);


// Show Yourself: Betacustic beginner sheet (Musicnotes
// MN0232553, F major, 4/4, q=120), page-1 preview (18 bars,
// lettered heads). Six bars rock F4-C5-F5-C5 in quarters;
// bars 8, 12 and 16 squeeze quarter-note triplets (0.67)
// into the line, and bar 9 holds a dotted-half B-flat
// (written A# on the gig board). Ties are merged (the bar
// 13 F into bar 14 = 2.5; bar 15 second A = 2.5; bar 18
// G = 2.5). Rests are dropped.
const showyourselfN = gigTokens("showyourself");
assert.deepEqual(showyourselfN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["F", "C", "F", "C"]);
assert.deepEqual(showyourselfN.slice(29, 33).map(n => n.beats), [0.5, 0.67, 0.67, 0.67]);


// Rewrite The Stars: Betacustic beginner sheet (Musicnotes
// MN0223543, B-flat major, 4/4, q=110), page-1 preview
// (8 bars, lettered heads) - the edition linked from the
// regular tutorial; the SLOW twin links an Easy grand
// staff (MN0207225) instead. The strain is a three-eighth
// B-flat call (A# on the gig board) into C and D quarters;
// the D is tied over a whole-note bar, written as 1 + 4
// beats because a single token caps at 4. Bar 4 merges the
// tied B-flat (1.5) and the tied E-flat pair (0.5 + 2 = 2.5,
// D# low on the gig board).
const rewritethestarsN = gigTokens("rewritethestars");
assert.deepEqual(rewritethestarsN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["A#", "A#", "A#", "C", "D"]);
assert.deepEqual(rewritethestarsN.slice(0, 5).map(n => n.beats), [0.5, 0.5, 0.5, 1, 1]);
assert.equal(rewritethestarsN[4].tied, true);
assert.deepEqual(rewritethestarsN.slice(13, 17).map(n => n.beats), [0.5, 1, 0.5, 2.5]);


// Bohemian Rhapsody: Betacustic beginner sheet (Musicnotes
// MN0227086, B-flat major, q=60), page-1 preview (8 bars,
// lettered heads, mixed meters: bar 3 is 5/4). The opening
// rocks on B-flat (A# on the gig board) in eighths into
// quarters; bar 5 ties an eighth D into a dotted quarter
// (merged to a 2-beat hold); bar 6 ends on B-flat 3, which
// the gig board folds up an octave (pitch class checked).
// Rests are dropped.
const bohemianrhapsodyN = gigTokens("bohemianrhapsody");
assert.deepEqual(bohemianrhapsodyN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["A#", "A#", "A#", "A#", "A#"]);
assert.deepEqual(bohemianrhapsodyN.slice(0, 5).map(n => n.beats), [0.5, 0.5, 0.5, 1, 1]);
assert.deepEqual(bohemianrhapsodyN.slice(24, 29).map(n => n.beats), [0.5, 0.5, 0.5, 2, 0.5]);


// River Flows In You: Betacustic beginner sheet (Musicnotes
// MN0232497, A minor, 4/4, q=100), page-1 preview (14 bars,
// lettered heads). The opening motif rocks C5-B4 in
// quarters - the C heads print hollow on the preview, but
// four heads to a 4/4 bar makes them quarters by bar
// arithmetic (the bar-3 F really is a half note, tied from
// bar 2 and merged to a 3-beat hold). Bars 10-11 dip to
// B3 and G3; the gig board folds those two up an octave
// (pitch classes checked). Rests are dropped.
const riverflowsinyouN = gigTokens("riverflowsinyou");
assert.deepEqual(riverflowsinyouN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "B", "C", "B"]);
assert.deepEqual(riverflowsinyouN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);
assert.deepEqual(riverflowsinyouN.slice(4, 10).map(n => n.beats), [1, 1, 1, 3, 0.5, 0.5]);


// Fly Me To The Moon: Betacustic beginner sheet (Musicnotes
// MN0233978, A minor, 4/4, q=80), page-1 preview (14 bars,
// lettered heads). Every phrase walks down in the same
// dotted pattern (dotted quarter, eighth, two quarters);
// bars 4 and 11 are whole notes. Bar 7 sharpens the G
// (E major chord), bar 8 holds a dotted-half C4 into a C#
// quarter, and bar 12's B3 folds up an octave on the gig
// board (pitch class checked). Rests are dropped.
const flymetothemoonN = gigTokens("flymetothemoon");
assert.deepEqual(flymetothemoonN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "B", "A", "G"]);
assert.deepEqual(flymetothemoonN.slice(0, 4).map(n => n.beats), [1.5, 0.5, 1, 1]);
assert.deepEqual(flymetothemoonN.slice(21, 25).map(n => n.pitch.replace(/[+-]/g, "")), ["G#", "F", "E", "D"]);
assert.deepEqual(flymetothemoonN.slice(21, 25).map(n => n.beats), [1.5, 0.5, 1, 1]);


// Lean On Me: Betacustic beginner sheet (Musicnotes
// MN0236855, C major, 4/4, q=80), page-1 preview (12 bars,
// lettered heads). The verse climbs C4-D-E-F in eighths and
// the F and C are tied over the barlines into half notes,
// merged here (F = 2.5, C = 2.5). Bar 8 starts on a dotted
// B3 (folded up an octave on the gig board; pitch class
// checked) and leaps to F5 for the high strain. Rests are
// dropped.
const leanonmeN = gigTokens("leanonme");
assert.deepEqual(leanonmeN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "C", "D", "E", "F"]);
assert.deepEqual(leanonmeN.slice(0, 5).map(n => n.beats), [1, 0.5, 0.5, 0.5, 2.5]);
assert.deepEqual(leanonmeN.slice(26, 31).map(n => n.beats), [1.5, 0.5, 0.5, 0.5, 0.5]);


// Amazing Grace (Betacustic beginner sheet MN0216748, F major,
// 3/4, no tempo printed - bpm 80 chosen), page-1 preview: pickup
// + 8 bars, lettered heads. Half-note pickup C; bars pair a half
// note with two eighths or a quarter; the closing A is a dotted
// half tied to a quarter, merged to a single 4-beat hold.
const amazinggraceN = gigTokens("amazinggrace");
assert.deepEqual(amazinggraceN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "F", "A", "F"]);
assert.deepEqual(amazinggraceN.slice(0, 4).map(n => n.beats), [2, 2, 0.5, 0.5]);
assert.equal(amazinggraceN[15].beats, 4, "Amazing Grace closing tied A must merge to 4 beats");


// Golden Hour (Betacustic beginner sheet MN0269535, C major,
// 6/8, dotted-quarter = 60, so bpm 90), page-1 preview: eight
// bars of sixteenth-note arpeggios (0.25 each), four shapes
// played twice - D E G A / C E G A / C D F G / B C D E.
const goldenhourN = gigTokens("goldenhour");
assert.deepEqual(goldenhourN.slice(0, 6).map(n => n.pitch.replace(/[+-]/g, "")), ["D", "E", "G", "A", "G", "E"]);
assert.ok(goldenhourN.slice(0, 96).every(n => n.beats === 0.25), "Golden Hour gig must be all sixteenths");
assert.deepEqual(goldenhourN.slice(72, 78).map(n => n.pitch.replace(/[+-]/g, "")), ["B", "C", "D", "E", "D", "C"]);


// What A Wonderful World (Betacustic beginner sheet MN0233693,
// F major, 12/8, quarter = 90), page-1 preview: pickup + 11 bars,
// lettered heads. Values settled by 12-eighth bar arithmetic
// (several quarter heads print hollow). Bar 4's F eighth ties
// into a dotted quarter (merged, 2 beats); bar 6's closing A
// eighth ties through bar 7's two dotted halves - merged to
// 3.5 + 3 across the line break, total preserved. Rests dropped.
const wonderfulN = gigTokens("whatawonderfulworld");
assert.deepEqual(wonderfulN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "D", "F", "F", "C"]);
assert.deepEqual(wonderfulN.slice(0, 5).map(n => n.beats), [1, 0.5, 1, 0.5, 3]);
assert.deepEqual(wonderfulN.slice(5, 9).map(n => n.beats), [0.5, 1, 0.5, 3]);
assert.equal(wonderfulN[29].beats, 3.5, "Wonderful World bar 6-7 tied A must total 3.5 + 3");


// Flowers (Betacustic beginner sheet MN0270788, A minor, 4/4,
// q = 110), page-1 preview: intro bar + 7 bars, lettered heads.
// Every phrase is tied over its barline and merged (eighth +
// quarter = 1.5; the E into bar 4's half note = 2.5); rests are
// dropped. The strain sits E3-C4, below the gig board, so the
// gig plays it a uniform octave up - pitch classes must match.
const flowersN = gigTokens("flowers");
assert.deepEqual(flowersN.slice(0, 3).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "B", "A"]);
assert.deepEqual(flowersN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 1.5]);
assert.deepEqual(flowersN.slice(6, 13).map(n => n.beats), [0.5, 0.5, 1.5, 0.5, 1, 1, 2.5]);


// Peaches (Betacustic beginner sheet MN0274727, C major, 4/4,
// q = 92), page-1 preview: 8 bars, lettered heads. Values settled
// by bar arithmetic (hollow heads are halves in bars 2, 4 and 6
// but a quarter in bar 1). Ties merged: bar 1's C pair, bars 3
// and 7's D pairs, bar 8's A pair, and bar 5's B eighth into
// bar 6's half note (2.5). The strain sits E3-E4, so the gig
// plays it a uniform octave up - pitch classes must match.
const peachesN = gigTokens("peaches");
assert.deepEqual(peachesN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "F", "C", "A", "F"]);
assert.deepEqual(peachesN.slice(0, 5).map(n => n.beats), [1, 0.5, 1, 0.5, 1]);
assert.equal(peachesN[19].beats, 2.5, "Peaches bar 5-6 tied B must merge to 2.5 beats");


// We Are The Champions (Betacustic beginner sheet MN0235840,
// A minor, 12/8, dotted-quarter = 64, so bpm 96), page-1
// preview: pickup + 9 bars, lettered heads. The verse pattern
// is a dotted-half hold plus three eighths per bar; bar 3's
// rests leave the bar an eighth short on paper (notes are all
// eighths, rests dropped). Bar 7 alternates eighths and
// quarters up to G5 (its hollow C is a quarter by bar
// arithmetic); bar 8 is a 6/8 bar with one dotted G; bar 9
// rocks A-G in quarter/eighth pairs into a dotted quarter.
const championsN = gigTokens("wearethechampions");
assert.deepEqual(championsN.slice(0, 7).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "G", "A", "A", "E", "G", "B"]);
assert.deepEqual(championsN.slice(0, 7).map(n => n.beats), [0.5, 0.5, 0.5, 3, 0.5, 0.5, 0.5]);
assert.deepEqual(championsN.slice(38, 45).map(n => n.beats), [1, 0.5, 1, 0.5, 1, 0.5, 1.5]);


// Megalovania (Betacustic beginner sheet MN0235130, D minor,
// quarter = 80), page-1 preview: the full 8-bar riff loop,
// lettered heads. Beamed opening pairs print hollow but are
// eighths (bar arithmetic); the sheet writes G# as Ab, and
// bars 5/7 move the pair to B natural / Bb below middle C.
const megaN = gigTokens("megalovania");
assert.deepEqual(megaN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["D", "D", "D", "A", "G#"]);
assert.deepEqual(megaN.slice(0, 5).map(n => n.beats), [0.5, 0.5, 1, 1, 1]);
assert.deepEqual(megaN.slice(35, 40).map(n => n.beats), [1, 1, 0.5, 0.5, 0.5]);


// Godzilla Theme (Betacustic beginner sheet MN0233375),
// page-1 preview: the slow chromatic creep (marked 90) and
// the march (marked 150; the app's single bpm uses 150).
// Bar 4's B half note ties through bar 5, merged and split
// at the line break as 4 + 2; bar 8 is a full-bar rest and
// is skipped. Everything below C4 folds +12 on the gig board.
const godzillaN = gigTokens("godzilla");
const godzillaAll = gigAllTokens("godzilla");
assert.deepEqual(godzillaN.slice(0, 5).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "G#", "D", "D#", "A"]);
assert.deepEqual(godzillaN.slice(0, 5).map(n => n.beats), [4, 1, 1, 1, 1]);
assert.equal(godzillaN[8].tied, true);
assert.equal(godzillaN[8].beats, 2);
assert.equal(godzillaN[9].beats, 4);
assert.ok(godzillaAll.some(t => t.kind === "rest" && t.beats === 4), "Godzilla bar 8 rest must be restored");
assert.deepEqual(godzillaN.slice(24, 30).map(n => n.beats), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);


// The Piano Duet (Betacustic beginner sheet MN0251056,
// C major, 6/8, quarter = 120), page-1 preview: the opening
// strain, bars 1-15, lettered heads. Values settle by 6/8
// bar arithmetic (quarter + eighth pairs); ties merged in
// bars 4, 7, 9 and 13; bars 14-15 are lone dotted-half A's.
const duetN = gigTokens("thepianoduet");
assert.deepEqual(duetN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "D", "E", "F"]);
assert.deepEqual(duetN.slice(0, 4).map(n => n.beats), [1, 0.5, 1, 0.5]);
assert.deepEqual(duetN.slice(46, 50).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "B", "A", "G#"]);
assert.deepEqual(duetN.slice(46, 50).map(n => n.beats), [1, 1, 0.5, 0.5]);


// Bloody Mary (Betacustic beginner sheet MN0268544, A minor,
// quarter = 103), page-1 preview: 8 bars, lettered heads.
// Bars 1-7 are eighth notes each followed by an eighth rest
// (rests dropped); bars 5-7 repeat 1-3 per the repeat sign.
// Bar 8's A run reads quarter + eighths, then an eighth and
// two sixteenths by the beaming.
const bloodyN = gigTokens("bloodymary");
assert.deepEqual(bloodyN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["E", "E", "C", "E"]);
assert.deepEqual(bloodyN.slice(0, 4).map(n => n.beats), [0.5, 0.5, 0.5, 0.5]);
assert.deepEqual(bloodyN.slice(28, 35).map(n => n.beats), [0.5, 1, 0.5, 0.5, 0.5, 0.25, 0.25]);

// Give Thanks (Betacustic beginner sheet MN0226175, F major,
// quarter = 84), page-1 preview: eighth pickup + 11 bars,
// lettered heads. Every bar settles by 4/4 arithmetic: dotted
// halves take beamed eighth pairs, and ties merge in bars 2,
// 4, 5 (half note into an eighth) and 10. Bar 4's A is A3,
// below the gig board, and folds up an octave there.
const givethanksN = gigTokens("givethanks");
assert.deepEqual(givethanksN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "A", "G", "F"]);
assert.deepEqual(givethanksN.slice(0, 4).map(n => n.beats), [0.5, 3, 0.5, 0.5]);
const givethanksC = casioTokens("givethanks");
assert.deepEqual(givethanksC.slice(0, 4).map(n => n.pitch), ["A4", "A4", "G4", "F4"]);
assert.deepEqual(givethanksC.slice(0, 4).map(n => n.beats), [0.5, 3, 0.5, 0.5]);

// You Say (Betacustic beginner sheet MN0231469, F major,
// quarter = 60), page-1 preview: ten bars. The filled heads
// carry white letters, so values settle by stems and beams:
// pedal quarters in bars 1-4 and 7-8 (F, E, F, D), beamed
// eighth runs low down in bars 5, 6, 9 and 10. Bar 10's lone
// G is a quarter - the only split that makes the bar sum to 4.
const yousayN = gigTokens("yousay");
assert.deepEqual(yousayN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["F", "F", "F", "F"]);
assert.deepEqual(yousayN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);
assert.deepEqual(yousayN.slice(16, 24).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "A", "A", "A", "A", "A", "A", "C"]);
assert.deepEqual(yousayN.slice(16, 24).map(n => n.beats), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
assert.deepEqual(casioTokens("yousay").slice(0, 4).map(n => n.pitch), ["F4", "F4", "F4", "F4"]);

// Here I Am To Worship (Betacustic beginner sheet MN0233844,
// D major, quarter = 70), page-1 preview: verse and chorus
// start, ten bars. The six-note figure (quarter, two beamed
// eighths, quarter, two beamed eighths) opens bars 1, 3, 5
// and 7; bars 4 and 8 are whole-note Ds; bar 6's dotted F#
// is a dotted quarter - the flag, beam and final quarter
// leave it no other value. Bar 9's half rest is not a token:
// the line starts on the A, as in earlier tunes with rests.
const worshipN = gigTokens("hereiamtoworship");
assert.deepEqual(worshipN.slice(0, 6).map(n => n.pitch.replace(/[+-]/g, "")), ["F#", "F#", "A", "E", "E", "F#"]);
assert.deepEqual(worshipN.slice(0, 6).map(n => n.beats), [1, 0.5, 0.5, 1, 0.5, 0.5]);
assert.deepEqual(worshipN.slice(24, 29).map(n => n.pitch.replace(/[+-]/g, "")), ["F#", "F#", "D", "D", "D"]);
assert.deepEqual(worshipN.slice(24, 29).map(n => n.beats), [1.5, 0.5, 0.5, 0.5, 1]);
assert.deepEqual(casioTokens("hereiamtoworship").slice(0, 6).map(n => n.pitch), ["F#4", "F#4", "A4", "E4", "E4", "F#4"]);

// Oceans (Where Feet May Fail) (Betacustic Beginner Notes
// sheet MN0228185, D major, quarter = 64), page-1 preview:
// four intro bars (repeat sign on the sheet) and the verse,
// bars 5-10. Values settle by bar arithmetic: dotted-half +
// quarter in bar 1, whole notes in bars 2-4, and the verse's
// dotted-eighth + sixteenth pairs (0.75 + 0.25) with 16th
// pickups after dotted rests. Bar 9 repeats bar 5's figure;
// its dotted heads are B3, a step below the C#4 that closes
// the figure (ledger line through the C# head only).
const oceansN = gigTokens("oceans");
assert.deepEqual(oceansN.slice(0, 2).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "D"]);
assert.deepEqual(oceansN.slice(0, 2).map(n => n.beats), [3, 1]);
assert.deepEqual(oceansN.slice(5, 12).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "B", "A", "B", "A", "C#", "D"]);
assert.deepEqual(oceansN.slice(5, 12).map(n => n.beats), [0.25, 0.75, 0.25, 0.75, 0.25, 0.75, 0.25]);
assert.deepEqual(casioTokens("oceans").slice(0, 2).map(n => n.pitch), ["A4", "D5"]);

// Among Us Drip Theme (Betacustic beginner sheet MN0251247,
// A minor, quarter = 100), page-1 preview: the full riff in
// eight bars. The six eighth notes after the quarter rest are
// pinned here; bars 4 and 8 hold an Eb for two beats and run
// two eighth-note triplets (0.33 each, as in the Star Wars
// pin). The Eb heads print solid black and get a fresh flat
// sign at every figure; the E naturals keep the plain
// lettered heads, so the dip always comes back to E natural.
const amongusN = gigTokens("amongusdrip");
assert.deepEqual(amongusN.slice(0, 6).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "C", "E", "D#", "E", "C"]);
assert.deepEqual(amongusN.slice(0, 6).map(n => n.beats), [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
assert.deepEqual(amongusN.slice(16, 23).map(n => n.pitch.replace(/[+-]/g, "")), ["D#", "D#", "E", "C", "D#", "E", "C"]);
assert.deepEqual(amongusN.slice(16, 23).map(n => n.beats), [2, 0.33, 0.33, 0.33, 0.33, 0.33, 0.33]);
assert.deepEqual(casioTokens("amongusdrip").slice(0, 6).map(n => n.pitch), ["A4", "C5", "E5", "Eb5", "E5", "C5"]);

// Toxic (BoyWithUke) (Betacustic beginner sheet MN0253792,
// A minor, cut time with the half note at 90 - the app runs
// at 180 quarter beats), page-1 preview: all eighteen bars.
// The opening four C quarters, the G sharp pair in bar 5
// (the sharp prints once and carries within the bar), and
// bar 10's climb to the tied G are pinned here.
const toxicN = gigTokens("toxic");
assert.deepEqual(toxicN.slice(0, 4).map(n => n.pitch.replace(/[+-]/g, "")), ["C", "C", "C", "C"]);
assert.deepEqual(toxicN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);
assert.deepEqual(toxicN.slice(16, 20).map(n => n.pitch.replace(/[+-]/g, "")), ["B", "A", "G#", "G#"]);
assert.deepEqual(toxicN.slice(37, 42).map(n => n.pitch.replace(/[+-]/g, "")), ["A", "C", "F", "F", "G"]);
assert.deepEqual(toxicN.slice(37, 42).map(n => n.beats), [1, 0.5, 0.5, 0.5, 1]);
assert.deepEqual(casioTokens("toxic").slice(0, 4).map(n => n.pitch), ["C5", "C5", "C5", "C5"]);

// Playback + tutorial must consume the same durations
for (const sym of ["function tokenBeats", "function playTune", "function stopPlayback", "AudioContext"]) {
  assert.ok(html.includes(sym), `missing ${sym}`);
}
assert.ok(html.includes('id="playBtn"'), "missing Play button");
assert.ok(html.includes('id="tempoRange"'), "missing tempo control");

// YouTube tutorial links (Nov 27, 2026, Sai's word: a video link for each
// tune). Every yt value must be a canonical watch URL, and every tune in
// the app must carry one - the intended set is the full tune set.
const ytRe = /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/;
const ytPairs = [...html.matchAll(/\{ id:"([^"]+)",[^\n]*?yt:"([^"]+)"/g)];
for (const [tid, url] of ytPairs.map(m => [m[1], m[2]])) {
  assert.ok(ytRe.test(url), `${tid}: malformed yt link ${url}`);
}
const allTuneIds = [...html.matchAll(/\{ id:"([^"]+)"/g)].map(m => m[1]);
assert.equal(ytPairs.length, allTuneIds.length,
  `yt links on ${ytPairs.length} of ${allTuneIds.length} tunes`);
assert.deepEqual(ytPairs.map(m => m[1]).sort(), [...allTuneIds].sort(),
  "the set of tunes carrying yt must equal the full tune set");
assert.ok(tuneBlock("hedwig").includes('yt:"https://www.youtube.com/watch?v=XEo6eeTTaDQ"'),
  "Hedwig yt link must stay Sai's chosen SLOW Betacustic tutorial");
assert.ok(tuneBlock("interstellar").includes('yt:"https://www.youtube.com/watch?v=OQeUvNHR0Ac"'),
  "Interstellar yt link must stay the reference video Sai sent");

// Rest & tie token unit tests
assert.equal(api.isRestToken("R"), true);
assert.equal(api.isRestToken("R:0.5"), true);
assert.equal(api.isRestToken("R:1.5"), true);
assert.equal(api.isRestToken("R:1/3"), true);
assert.equal(api.isRestToken("C4"), false);
assert.equal(api.isRestToken("D5:1~"), false);

assert.equal(api.isTiedToken("D5:1~"), true);
assert.equal(api.isTiedToken("C+:0.5@8~"), true);
assert.equal(api.isTiedToken("D5:1"), false);

assert.equal(api.tokenPitch("F@4:2~"), "F");
assert.equal(api.tokenBeats("F@4:2~"), 2);
assert.equal(api.tokenKey("F@4:2~"), 4);
assert.equal(api.tokenPitch("C5:0.5~"), "C5");
assert.equal(api.tokenBeats("C5:0.5~"), 0.5);
assert.ok(Math.abs(api.tokenBeats("G4:0.33") - 1/3) < 1e-9);
assert.ok(Math.abs(api.tokenBeats("A4:0.67") - 2/3) < 1e-9);
assert.equal(api.tokenBeats("R:1.5"), 1.5);
assert.equal(api.tokenBeats("R"), 1);

// buildSequence handles rests without mutating prev MIDI and merges ties
{
  const restSeq = api.buildSequence({ startKey: 8, lines: [["E5:1 R:1 C5:1", ""]] }, "gig");
  assert.equal(restSeq.length, 3);
  assert.equal(restSeq[0].kind, "note");
  assert.equal(restSeq[1].kind, "rest");
  assert.equal(restSeq[1].midi, null);
  assert.equal(restSeq[1].beats, 1);
  assert.equal(restSeq[2].kind, "note");
  assert.equal(restSeq[2].midi, 72);

  const tieSeq = api.buildSequence({ startKey: 9, lines: [["D5:1~", ""], ["D5:4", ""]] }, "casio");
  assert.equal(tieSeq.length, 2);
  assert.equal(tieSeq[0].tied, true);
  assert.equal(tieSeq[0].tiedContinuation, false);
  assert.equal(tieSeq[0].totalBeats, 5);
  assert.equal(tieSeq[1].tiedContinuation, true);

  const restFirstLabel = api.firstNoteLabel({ casio: { startKey: 8, lines: [["R:1.5 C4:0.5", ""]] }, gig: { startKey: 8, lines: [["R:1.5 C:0.5", ""]] } });
  assert.ok(restFirstLabel === "Starts on C4" || restFirstLabel === "Starts on C");
}

// Bar-sum validation across TUNES (56 complete tunes pass strict bar-sum checks)
const NEEDS_SOURCE_CHECK = new Set([
  "countonme","flowers","itsy","leanonme","peaches","pinkpanther",
  "riverflowsinyou","showyourself","someonelikeyou","wearethechampions",
  "whatawonderfulworld"
]);
const LEGACY_UNMETERED = new Set([
  "interstellar","mary","oldmac","londonbridge","rowboat","wheels",
  "sleeping","lassie","threeblind","farmer","hickory","barenecessities","hakunamatata"
]);

assert.equal(api.TUNES.length, 80, "must have all 80 tunes");
let barValidatedCount = 0;
for (const t of api.TUNES) {
  assert.ok(Array.isArray(t.meter) && t.meter.length === 2, `${t.id}: missing meter`);
  if (NEEDS_SOURCE_CHECK.has(t.id) || LEGACY_UNMETERED.has(t.id)) continue;
  barValidatedCount++;
  const barBeats = t.meter[0] * (4 / t.meter[1]);
  const pickup = t.pickup || 0;
  let total = 0, hasComplementaryEnd = false;
  t.casio.lines.forEach((line, li) => {
    const toks = line[0].split(/\s+/).filter(x => x && x !== "|" && x !== "-");
    const sum = toks.reduce((a, x) => a + api.tokenBeats(x), 0);
    total += sum;
    const expectedBar = (t.barMeters && t.barMeters[li]) || barBeats;
    if (li === 0 && pickup > 0) {
      assert.ok(Math.abs((sum - pickup) % expectedBar) < 1e-4 || Math.abs(((sum - pickup) % expectedBar) - expectedBar) < 1e-4,
        `${t.id} line 0 (${sum}) minus pickup (${pickup}) not multiple of ${expectedBar}`);
    } else if (li === t.casio.lines.length - 1 && pickup > 0 && Math.abs(((sum + pickup) % expectedBar)) < 1e-4) {
      hasComplementaryEnd = true;
    } else {
      const rem = sum % expectedBar;
      assert.ok(sum > 0 && (rem < 1e-4 || Math.abs(rem - expectedBar) < 1e-4),
        `${t.id} line ${li} sum ${sum} not multiple of ${expectedBar}`);
    }
  });
  const totCheck = hasComplementaryEnd ? total : (total - pickup);
  const totRem = totCheck % barBeats;
  const hasBarOverride = !!t.barMeters;
  if (!hasBarOverride) {
    assert.ok(totRem < 1e-4 || Math.abs(totRem - barBeats) < 1e-4,
      `${t.id} total ${total} (pickup ${pickup}, compEnd=${hasComplementaryEnd}) not multiple of ${barBeats}`);
  }
}
assert.equal(barValidatedCount, 56, "expected 56 bar-sum validated tunes");

// Verify restored rests & ties on key tunes
for (const tid of ["bloodymary","allofme","miraculous","oceans","faded","beautifulinwhite","rewritethestars","bohemianrhapsody","hereiamtoworship","toxic","tryeverything","gravityfalls","fnaf","amongusdrip","amilliondreams","athousandyears","hallelujah","allisfound","overtherainbow","shallow","perfect","howfarillgo","hesapirate","awholenewworld","canthelpfalling","diewithasmile","flymetothemoon","letitgo","megalovania","dancemonkey","godzilla","marriedlife","myheartwillgoon","wedonttalkaboutbruno"]) {
  const t = api.TUNES.find(x => x.id === tid);
  const seq = api.buildSequence(t.casio, "casio");
  assert.ok(seq.some(e => e.kind === "rest"), `${tid} must contain restored rest tokens`);
}
for (const tid of ["oceans","rewritethestars","toxic","tryeverything","allisfound","shallow","godzilla"]) {
  const t = api.TUNES.find(x => x.id === tid);
  const seq = api.buildSequence(t.casio, "casio");
  assert.ok(seq.some(e => e.tiedContinuation), `${tid} must contain merged cross-bar ties`);
}

// ============ Envelope tests (mock AudioContext) ============
{
  const makeMockCtx = () => {
    const gains = [];
    const oscs = [];
    const ctx = {
      currentTime: 0,
      state: "running",
      destination: {},
      createGain() {
        const events = [];
        const node = {
          events,
          gain: {
            value: 1,
            events,
            setValueAtTime(v, t) { events.push({ op: "set", v, t }); },
            linearRampToValueAtTime(v, t) { events.push({ op: "lin", v, t }); },
            exponentialRampToValueAtTime(v, t) { events.push({ op: "exp", v, t }); },
            cancelScheduledValues() {}
          },
          connect() {}
        };
        gains.push(node);
        return node;
      },
      createOscillator() {
        const osc = {
          type: "sine",
          frequency: { value: 440 },
          started: null,
          stopped: null,
          connect() {},
          start(t) { osc.started = t; },
          stop(t) { osc.stopped = t; }
        };
        oscs.push(osc);
        return osc;
      }
    };
    return { ctx, gains, oscs };
  };

  function evalGainAt(events, t) {
    let prev = events[0];
    for (let i = 1; i < events.length; i++) {
      const cur = events[i];
      if (t <= cur.t) {
        const frac = (t - prev.t) / (cur.t - prev.t);
        if (cur.op === "lin") return prev.v + (cur.v - prev.v) * frac;
        if (cur.op === "exp") return prev.v * Math.pow(cur.v / prev.v, frac);
        return cur.v;
      }
      prev = cur;
    }
    return prev.v;
  }

  // Test 1: 4-beat whole note at 60 bpm (slotSec = 4.0) stays audible at 50% and 90%
  const m1 = makeMockCtx();
  api.setAudioCtx(m1.ctx, m1.ctx.createGain());
  api.playToneAt(69, 0, 4.0);
  const env1 = m1.gains[1].events; // [0]=master, [1]=g, [2]=g2
  assert.ok(evalGainAt(env1, 0.005) >= 0.89, "attack must reach peak by 5ms");
  assert.ok(evalGainAt(env1, 2.0) >= 0.30, `50% hold gain too low: ${evalGainAt(env1, 2.0)}`);
  assert.ok(evalGainAt(env1, 3.6) >= 0.25, `90% hold gain too low: ${evalGainAt(env1, 3.6)}`);
  const gateEnd1 = env1[env1.length - 1].t;
  assert.ok(gateEnd1 > 3.9 && gateEnd1 <= 4.0, `gateEnd1 expected ~3.955, got ${gateEnd1}`);
  assert.equal(env1[env1.length - 1].v, 0.0001);

  // Test 2: Fast 16th note at 180 bpm (slotSec = 0.0833s) detaches before next onset
  const m2 = makeMockCtx();
  api.setAudioCtx(m2.ctx, m2.ctx.createGain());
  const slot16 = (60 / 180) * 0.25;
  api.playToneAt(72, 0, slot16);
  const env2 = m2.gains[1].events;
  const gateEnd2 = env2[env2.length - 1].t;
  assert.ok(gateEnd2 < slot16, `16th note gateEnd ${gateEnd2} must be < slotSec ${slot16}`);
  assert.ok(m2.oscs[0].stopped <= slot16 + 0.02, "16th note oscillator must stop cleanly");
}

// ============ Tempo honesty tests (Rank 4) ============
{
  const tempoAttrMatch = html.match(/<input[^>]*id="tempoRange"[^>]*>/);
  assert.ok(tempoAttrMatch, "missing #tempoRange input");
  const minM = tempoAttrMatch[0].match(/min="(\d+)"/);
  const maxM = tempoAttrMatch[0].match(/max="(\d+)"/);
  const stepM = tempoAttrMatch[0].match(/step="(\d+)"/);
  assert.ok(minM && +minM[1] <= 40, `tempoRange min must be <= 40, got ${minM && minM[1]}`);
  assert.ok(maxM && +maxM[1] >= 200, `tempoRange max must be >= 200, got ${maxM && maxM[1]}`);
  assert.ok(stepM && +stepM[1] === 1, `tempoRange step must be 1, got ${stepM && stepM[1]}`);

  const tr = domMap.get("#tempoRange");
  const tv = domMap.get("#tempoVal");
  for (const t of api.TUNES) {
    api.setTempo(t.bpm);
    assert.equal(api.tempoBpm(), t.bpm, `${t.id}: tempoBpm() must match written ${t.bpm}`);
    assert.equal(tr.value, String(t.bpm), `${t.id}: slider value must equal written ${t.bpm}`);
    assert.equal(tv.textContent, `${t.bpm} bpm`, `${t.id}: #tempoVal must equal "${t.bpm} bpm"`);
  }
  for (const [tid, expected] of [["sweden",44],["furelise",69],["athousandyears",75],["diewithasmile",75],["perfect",81],["gummybear",89],["bloodymary",103],["countonme",176],["toxic",180]]) {
    const t = api.TUNES.find(x => x.id === tid);
    api.setTempo(t.bpm);
    assert.equal(api.tempoBpm(), expected, `${tid} tempo honesty check failed`);
  }
}

// ============ Gigglescape generation parity tests (Step 5) ============
assert.ok(!/gig:\{/.test(html), "hand-authored gig variants must be removed");
{
  const WIDE_SPAN_TUNES = new Set(["interstellar","sweden","fnaf","leanonme","megalovania","oceans"]);
  const LETTERS = ["C","D","E","F","G","A","B"];
  for (const t of api.TUNES) {
    const gig = api.generateGigVariant(t);
    const casioSeq = api.buildSequence(t.casio, "casio");
    const gigSeq = api.buildSequence(gig, "gig");
    assert.equal(gigSeq.length, casioSeq.length, `${t.id}: gig/casio sequence length mismatch`);

    const casioMidis = casioSeq.filter(e => e.kind === "note").map(e => e.midi);
    const minM = Math.min(...casioMidis), maxM = Math.max(...casioMidis);
    const expectedShift = (minM < 60 && maxM + 12 <= 84) ? 12 : (maxM > 84 && minM - 12 >= 60) ? -12 : 0;

    let firstGigKey = null;
    for (let i = 0; i < casioSeq.length; i++) {
      const c = casioSeq[i], g = gigSeq[i];
      assert.equal(g.kind, c.kind, `${t.id}[${i}]: kind mismatch`);
      assert.ok(Math.abs(g.beats - c.beats) < 1e-9, `${t.id}[${i}]: beats mismatch`);
      assert.equal(g.tied, c.tied, `${t.id}[${i}]: tied mismatch`);
      assert.equal(g.tiedContinuation, c.tiedContinuation, `${t.id}[${i}]: tiedContinuation mismatch`);
      assert.ok(Math.abs(g.totalBeats - c.totalBeats) < 1e-9, `${t.id}[${i}]: totalBeats mismatch`);
      if (c.kind === "note") {
        if (firstGigKey === null) firstGigKey = g.key;
        assert.ok(g.midi >= 60 && g.midi <= 84, `${t.id}[${i}]: gig midi ${g.midi} out of range 60..84`);
        assert.ok(g.key >= 1 && g.key <= 15, `${t.id}[${i}]: gig key ${g.key} out of range 1..15`);
        assert.equal(g.pitch[0], LETTERS[(g.key - 1) % 7], `${t.id}[${i}]: key ${g.key} does not match letter ${g.pitch}`);
        assert.equal(((g.midi % 12) + 12) % 12, ((c.midi % 12) + 12) % 12, `${t.id}[${i}]: pitch class mismatch`);
        if (!WIDE_SPAN_TUNES.has(t.id)) {
          assert.equal(g.midi - c.midi, expectedShift, `${t.id}[${i}]: octave inversion (${c.midi} -> ${g.midi}, shift=${expectedShift})`);
        } else {
          if (c.midi >= 60 && c.midi <= 84) assert.equal(g.midi, c.midi, `${t.id}[${i}]: in-range note shifted`);
          else assert.equal((g.midi - c.midi) % 12, 0, `${t.id}[${i}]: folded note not octave equivalent`);
        }
      }
    }
    assert.equal(gig.startKey, firstGigKey, `${t.id}: startKey must equal first note's key`);
  }
}

console.log("cadence ok:", bpms.length, "tunes with bpm");
