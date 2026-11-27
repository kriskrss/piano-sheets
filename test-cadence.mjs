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
for (const id of ["interstellar","hedwig","twinkle","mary","hotcross","oldmac","londonbridge","rowboat","wheels","sleeping","lassie","itsy","threeblind","farmer","rainrain","hickory","starwars","jurassicpark","barenecessities","hakunamatata","letitgo","marriedlife","myheartwillgoon","pinkpanther","babyshark","canthelpfalling","rememberme","hesapirate","howfarillgo","wedonttalkaboutbruno"]) {
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

// Hedwig: re-encoded from Stefan Lechner's easy arrangement
// (creativepiano.at, E minor, 3/4, supplied by Sai): pickup B, then
// E dotted-quarter / G eighth / F# quarter; the strain's signature bar
// is half + quarter (E B, F# C, A B). The score's B-flat is written
// as A# (the gig parser has no flats).
const hed = noteTokens(tuneBlock("hedwig"));
assert.deepEqual(hed.slice(0, 4).map(n => n.pitch), ["B","E+","G+","F#+"]);
assert.deepEqual(hed.slice(0, 4).map(n => n.beats), [1,1.5,0.5,1]);
assert.deepEqual(hed.slice(21, 25).map(n => n.pitch), ["B3","E4","G4","F#4"]);
assert.deepEqual(hed.slice(21, 25).map(n => n.beats), [1,1.5,0.5,1]);

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

// Star Wars: the opening figure is an eighth-note triplet (3 notes in 1
// beat, encoded 0.33 each) - Hoffman Academy's scored lesson counts the
// first phrase as triplet + two half notes; the Edexcel GCSE analysis of
// the orchestral score gives bars 2-4 as triplet quavers + tied minim +
// crotchet. Pitches: Hoffman Academy's G-major lesson transposed to C.
const sw = noteTokens(tuneBlock("starwars"));
assert.deepEqual(sw.slice(0, 5).map(n => n.pitch), ["G","G","G","C+","G"]);
assert.deepEqual(sw.slice(0, 5).map(n => n.beats), [0.33,0.33,0.33,2,2]);
assert.deepEqual(sw.slice(5, 10).map(n => n.beats), [0.33,0.33,0.33,2,1]);

// Jurassic Park: rhythm from the timed letter-grid transcription of the
// theme (onset spacing in the MuseScore-derived grid, 16th-note units):
// two quick notes into a dotted-half hold. Pitches: La Touche Musicale
// and pianoletternotes C-major letter notes.
const jp = noteTokens(tuneBlock("jurassicpark"));
assert.deepEqual(jp.slice(0, 3).map(n => n.pitch), ["C+","B","C+"]);
assert.deepEqual(jp.slice(0, 3).map(n => n.beats), [0.5,0.5,3]);

// Bare Necessities: rhythm from the published piano/vocal score (the
// SheetMusic-Free PVG engraving of the Gilkyson original): "Look for
// the" are three quarter-note pickups, "bare" is a half note, and
// "si-ties" is an eighth-note pair. Pitches: C-major transcription
// (mypianonotes), Eb written as D#.
const bn = noteTokens(tuneBlock("barenecessities"));
assert.deepEqual(bn.slice(0, 10).map(n => n.pitch), ["G","A","C+","D#","E+","D#","E+","D","C+","A"]);
assert.deepEqual(bn.slice(0, 10).map(n => n.beats), [1,1,1,2,1,1,0.5,0.5,1,2]);
assert.equal(bn[9].beats, 2, "Bare Necessities line 1 must end on a held A");

// Hakuna Matata: rhythm from the official Lion King songbook
// (Wonderland Music, piano/vocal): the title phrase is chanted in
// eighth notes and quarter-note triplets (triplets approximated as 0.5
// notes), final note held 1.5. Pitches: AmosDoll/ChordU tutorial,
// Eb written as D# for the gig parser.
const hk = noteTokens(tuneBlock("hakunamatata"));
assert.deepEqual(hk.slice(0, 6).map(n => n.pitch), ["D","D#","D","D#","D","C"]);
assert.deepEqual(hk.slice(0, 6).map(n => n.beats), [0.5,0.5,0.5,0.5,0.5,1.5]);

// Let It Go: chorus only, in C major. Rhythm from the engraved score in
// Hal Leonard's "Really Easy Piano: 40 Disney Songs" (chorus bars):
// quick pickup runs into held notes; the final line runs in eighths.
// Pitches: Hoffman Academy's lesson and musicpandit's letter notes.
const lig = noteTokens(tuneBlock("letitgo"));
assert.deepEqual(lig.slice(0, 3).map(n => n.pitch), ["A","B","C+"]);
assert.deepEqual(lig.slice(0, 3).map(n => n.beats), [0.5,0.5,3]);

// Itsy Bitsy Spider: rhythm from the engraved PianoLessons4Children
// C-major score (4/4, lyrics underlaid): the whole tune lilts in
// dotted-eighth + sixteenth pairs (0.75/0.25); "spi" and phrase peaks
// are quarters, phrase-final notes carry the score's quarter rest in
// their hold. Gig line totals: 8.5 / 8 / 8 / 7 / 4.75.
const its = noteTokens(tuneBlock("itsy"));
assert.deepEqual(its.slice(0, 12).map(n => n.beats),
  [0.5,0.75,0.25,0.75,0.25,1,0.75,0.25,0.75,0.25,1,2]);
for (const [a, b, tot] of [[0,12,8.5],[12,22,8],[22,33,8],[33,43,7],[43,47,4.75]]) {
  const total = its.slice(a, b).reduce((sum, n) => sum + n.beats, 0);
  assert.ok(Math.abs(total - tot) < 0.01, `itsy gig notes ${a}-${b} must total ${tot}, got ${total}`);
}

// Married Life (Up): Betacustic beginner sheet (Musicnotes MN0233977,
// F major, 3/4, q=100), main strain bars 5-10: dotted-half F opening,
// F A G eighth-note answer, rests folded into the preceding hold.
const ml = noteTokens(tuneBlock("marriedlife"));
assert.deepEqual(ml.slice(0, 4).map(n => n.pitch), ["F+","F+","A+","G+"]);
assert.deepEqual(ml.slice(0, 4).map(n => n.beats), [3,0.5,0.5,0.5]);
assert.equal(ml[8].beats, 2.5, "Married Life C+ must carry the score's rest in its hold");

// My Heart Will Go On: Betacustic beginner sheet (Musicnotes MN0226803,
// F major, 4/4, q=70): dotted-quarter + eighth F figure opens each
// verse line; rests folded into the preceding hold.
const mh = noteTokens(tuneBlock("myheartwillgoon"));
assert.deepEqual(mh.slice(0, 4).map(n => n.pitch), ["F","F","F","F"]);
assert.deepEqual(mh.slice(0, 4).map(n => n.beats), [1.5,0.5,1,1]);

// Pink Panther: Betacustic beginner sheet (Musicnotes MN0221798,
// E minor, 4/4): the riff is a grace-note pickup (encoded 0.5) into a
// dotted-long E and a short F#; statement 3 turns the grace note to
// Eb and the short note to D natural, landing on a held C.
const pp = noteTokens(tuneBlock("pinkpanther"));
assert.deepEqual(pp.slice(0, 3).map(n => n.pitch), ["D#","E","F#"]);
assert.deepEqual(pp.slice(0, 3).map(n => n.beats), [0.5,2.5,0.5]);

// Baby Shark: Betacustic beginner sheet (Musicnotes MN0225122,
// G major, 4/4, q=80): half-note name line, then the doo run in
// eighths with a sixteenth pair and a tied note (merged here).
const bs = noteTokens(tuneBlock("babyshark"));
assert.deepEqual(bs.slice(0, 2).map(n => n.beats), [2,2]);
assert.deepEqual(bs.slice(2, 9).map(n => n.beats), [0.5,0.5,0.5,0.25,0.5,0.25,0.5]);

// Can't Help Falling In Love: Betacustic beginner sheet (Musicnotes
// MN0233374, G major, 4/4, q=64): half-note pairs, a dotted-half D
// with an eighth-note answer, and a quarter-note triplet climb
// A B C encoded at 0.67 beats each.
const ch = noteTokens(tuneBlock("canthelpfalling"));
assert.deepEqual(ch.slice(0, 2).map(n => n.pitch), ["D","D+"]);
assert.deepEqual(ch.slice(0, 2).map(n => n.beats), [2,2]);
assert.deepEqual(ch.slice(12, 15).map(n => n.beats), [0.67,0.67,0.67]);

// Remember Me: Betacustic beginner sheet (Musicnotes MN0231732,
// C major, 4/4, q=60), page-1 preview (9 bars): title phrase in
// quarters with a held C, eighth-note runs, rests folded into the
// preceding holds; the C7 bar's last note is G# leading back to A.
const rm = noteTokens(tuneBlock("rememberme"));
assert.deepEqual(rm.slice(0, 3).map(n => n.pitch), ["D+","E+","C+"]);
assert.deepEqual(rm.slice(0, 3).map(n => n.beats), [1,1,2]);

// He's A Pirate: Betacustic beginner sheet (Musicnotes MN0226291,
// D minor, 6/8, dotted-quarter = 80, so bpm 120 in quarter beats):
// the D gallop bars, then the D-D-E / F-F-G / E-E-D-C answer.
// The low A3 sits under the Gigglescape board, so gig plays +12.
const hp = noteTokens(tuneBlock("hesapirate"));
assert.deepEqual(hp.slice(0, 4).map(n => n.beats), [1,0.5,1,0.5]);
assert.deepEqual(hp.slice(27, 31).map(n => n.pitch), ["D+","D+","D+","E+"]);
assert.deepEqual(hp.slice(27, 31).map(n => n.beats), [1,1,0.5,0.5]);

// How Far I'll Go: Betacustic beginner sheet (Musicnotes MN0222533,
// F major, 4/4, q=70), full page-1 preview (10 bars): syncopated
// sixteenth figures; rests folded into the preceding holds (the
// bar-1 F takes the sixteenth rest, bar-5 C the eighth rest).
const hf = noteTokens(tuneBlock("howfarillgo"));
assert.deepEqual(hf.slice(0, 3).map(n => n.pitch), ["F","C","F"]);
assert.deepEqual(hf.slice(0, 3).map(n => n.beats), [1,0.5,0.75]);

// We Don't Talk About Bruno: Betacustic beginner sheet (Musicnotes
// MN0248513, C minor, 4/4, q=104), page-1 preview bars 1-10 (Pepa's
// verse): title figure over low A3, tied notes split across lines,
// rests folded into holds. Range F3-Bb4 sits under the Gigglescape
// board, so gig plays +12 (Eb written D# there, Bb written A#).
const br = noteTokens(tuneBlock("wedonttalkaboutbruno"));
assert.deepEqual(br.slice(0, 3).map(n => n.pitch), ["D#+","A","D#+"]);
assert.deepEqual(br.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Playback + tutorial must consume the same durations
for (const sym of ["function tokenBeats", "function playTune", "function stopPlayback", "AudioContext"]) {
  assert.ok(html.includes(sym), `missing ${sym}`);
}
assert.ok(html.includes('id="playBtn"'), "missing Play button");
assert.ok(html.includes('id="tempoRange"'), "missing tempo control");

console.log("cadence ok:", bpms.length, "tunes with bpm");
