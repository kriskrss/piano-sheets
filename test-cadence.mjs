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
for (const id of ["interstellar","hedwig","twinkle","mary","hotcross","oldmac","londonbridge","rowboat","wheels","sleeping","lassie","itsy","threeblind","farmer","rainrain","hickory","starwars","jurassicpark","barenecessities","hakunamatata","letitgo","marriedlife","myheartwillgoon","pinkpanther","babyshark","canthelpfalling","rememberme","hesapirate","howfarillgo","wedonttalkaboutbruno","awholenewworld","athousandyears","perfect","amilliondreams","iseethelight","hallelujah","allisfound","overtherainbow","shallow","sweden","coffindance","gummybear","fnaf","gravityfalls","silentnight","miraculous","happybirthday","allofme","diewithasmile","furelise","faded","beautifulinwhite","someonelikeyou","wellerman","peppapig","tryeverything","countonme","dancemonkey","showyourself","rewritethestars","bohemianrhapsody","riverflowsinyou","flymetothemoon","leanonme"]) {
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

// Jurassic Park: re-encoded Nov 2026 from the Betacustic beginner
// sheet (Musicnotes MN0252051, C major, 4/4, q=100), page-1 preview
// (pickup + 14 bars): dotted-quarter + eighth pickup, dotted-half
// bars answered by an eighth-note pair, dotted-quarter/eighth
// figure bars. The sheet marks q=100, so bpm is 100 (was 76).
const jp = noteTokens(tuneBlock("jurassicpark"));
assert.deepEqual(jp.slice(0, 2).map(n => n.pitch), ["C+","B"]);
assert.deepEqual(jp.slice(0, 2).map(n => n.beats), [1.5,0.5]);
assert.deepEqual(jp.slice(2, 5).map(n => n.beats), [3,0.5,0.5]);

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

// Let It Go: re-encoded Nov 2026 from the Betacustic beginner sheet
// (Musicnotes MN0230940, E minor, 4/4, q=80), page-1 preview: the
// VERSE strain (the chorus sits on the paywalled page 2). Eighth-note
// groups into a dotted-quarter G; the final bar's rest is folded into
// the C# and the low A3 pickup to page 2 is left off.
const lig = noteTokens(tuneBlock("letitgo"));
assert.deepEqual(lig.slice(0, 3).map(n => n.pitch), ["F#+","G+","B-"]);
assert.deepEqual(lig.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

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

// A Whole New World: Betacustic beginner sheet (Musicnotes
// MN0231731, D major, 4/4, q=80; link via the SLOW tutorial twin -
// the main video's description carried no sheet link), page-1
// preview (10 bars): paired-eighth phrases with slur arcs, a D#
// chromatic note in the Em6 bar, low A whole notes. Range A3-G4
// sits under the Gigglescape board, so gig plays +12.
const wn = noteTokens(tuneBlock("awholenewworld"));
assert.deepEqual(wn.slice(0, 3).map(n => n.pitch), ["F#+","E+","G+"]);
assert.deepEqual(wn.slice(0, 3).map(n => n.beats), [1,0.5,0.5]);

// A Thousand Years: Betacustic beginner sheet (Musicnotes MN0232640,
// C major, 6/8, dotted-quarter = 50, so bpm 75 in quarter beats),
// page-1 preview (15 bars): dotted-quarter pairs, a sixteenth-note
// pair in bar 2, beamed eighth-note descents; bar 13's closing rest
// is folded into the final E.
const aty = noteTokens(tuneBlock("athousandyears"));
assert.deepEqual(aty.slice(0, 4).map(n => n.pitch), ["E+","E+","E+","D+"]);
assert.deepEqual(aty.slice(0, 6).map(n => n.beats), [1.5,1.5,1.5,1,0.25,0.25]);

// Perfect: Betacustic beginner sheet (Musicnotes MN0231886,
// G major, 12/8, dotted-quarter = 54, so bpm 81 in quarter beats),
// page-1 preview (pickup + 7 bars): dotted-half holds answered by
// beamed eighth-note figures; rests folded into the preceding hold
// where the hold stays within 4 beats (bars 3, 4 and 6), omitted
// where folding would break the cap (bars 1, 2 and 5).
const pf = noteTokens(tuneBlock("perfect"));
assert.deepEqual(pf.slice(0, 4).map(n => n.pitch), ["D","E","G","G"]);
assert.deepEqual(pf.slice(0, 4).map(n => n.beats), [0.5,0.5,0.5,3]);

// A Million Dreams: the main tutorial's sheet link leads to an
// Easy grand-staff edition (MN0201058, no note names, mostly intro
// on page 1), so this uses the SLOW twin's Beginner Notes edition
// (Musicnotes MN0217678, G major, 4/4, q = 120), page-1 preview:
// the singing enters at bar 5 (B B C, then D C B C twice); the
// eighth rests after the D notes are folded into their holds.
const md = noteTokens(tuneBlock("amilliondreams"));
assert.deepEqual(md.slice(0, 3).map(n => n.pitch), ["B","B","C+"]);
assert.deepEqual(md.slice(0, 5).map(n => n.beats), [0.5,1,1,1.5,0.5]);

// I See The Light: Betacustic beginner sheet (Musicnotes MN0222534,
// C major, 4/4, q = 80), page-1 preview (10 bars), cross-checked
// against the SLOW twin's Easy edition (MN0207198): quarter-quarter-
// half phrases, beamed eighth-note descents to the low G, one
// whole-note bar. The melody dips below the gig board (G3, B3), so
// the gig version plays an octave up, with three pinned keys where
// the nearest-key rule would land on the wrong octave.
const isl = noteTokens(tuneBlock("iseethelight"));
assert.deepEqual(isl.slice(0, 3).map(n => n.pitch), ["G","F","E"]);
assert.deepEqual(isl.slice(0, 3).map(n => n.beats), [1,1,2]);

// Hallelujah: Betacustic beginner sheet (Musicnotes MN0222670,
// C major, 6/8, dotted-quarter = 60, so bpm 90 in quarter beats),
// page-1 preview (pickup + 14 bars): tied eighths merged into their
// holds in bars 2-4; bar 8 is rests plus a pickup eighth, and its
// rests (2.5 beats) are folded into bar 7's dotted D, which lands
// exactly on the 4-beat cap.
const hj = noteTokens(tuneBlock("hallelujah"));
assert.deepEqual(hj.slice(0, 3).map(n => n.pitch), ["G","G","G"]);
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
const af = noteTokens(tuneBlock("allisfound"));
assert.deepEqual(af.slice(0, 3).map(n => n.pitch), ["C+","D+","E+"]);
assert.deepEqual(af.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Somewhere Over The Rainbow: Betacustic beginner sheet
// (Musicnotes MN0235134, C major, 4/4, q = 90), page-1 preview
// (13 bars). Dotted-half F in bar 2; the dotted-quarter + eighth +
// quarter + quarter figure repeats in bars 3, 4 and 11 (several
// heads print hollow-looking; dots and bar arithmetic settle the
// values). Bar 6's opening quarter rest cannot fold into bar 5's
// whole note (cap), so it is omitted; bar 13's opening quarter rest
// folds back into bar 12's tied B (2.5 + 1 = 3.5).
const rb = noteTokens(tuneBlock("overtherainbow"));
assert.deepEqual(rb.slice(0, 3).map(n => n.pitch), ["C+","F+","D+"]);
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
const sh = noteTokens(tuneBlock("shallow"));
assert.deepEqual(sh.slice(0, 3).map(n => n.pitch), ["C+","D+","D+"]);
assert.deepEqual(sh.slice(0, 3).map(n => n.beats), [0.5,0.5,0.5]);

// Sweden (Minecraft): Betacustic beginner sheet (Musicnotes
// MN0236864, B minor / D major, 4/4, q = 44), page-1 preview
// (12 bars). Bars 1-6 are half-note pairs: the low note climbs
// G3 A3 B3 C#4, falls back to B3, C#4, each answered by D4.
// Bars 7-12 settle by beams and bar arithmetic: dotted quarters
// of 1.5 and sixteenth pairs of 0.25; bar 7's low B is a quarter
// (the bar only totals 4 that way). The gig board re-voices the
// low strain an octave up and keeps the high sparkles as written.
const swedenN = noteTokens(tuneBlock("sweden"));
assert.deepEqual(swedenN.slice(0, 3).map(n => n.pitch), ["G", "D+", "A"]);
assert.deepEqual(swedenN.slice(0, 3).map(n => n.beats), [2, 2, 2]);

// Coffin Dance (Astronomia): Betacustic beginner sheet
// (Musicnotes MN0227183, A minor, 4/4, q = 70), page-1 preview
// (10 bars, lettered heads). Bars 1-4 are straight eighth-note
// riff bars; bars 5-6 and their repeat in 9-10 mix quarters with
// beamed eighth pairs; bars 7-8 jump A4 to A5 in eighths after a
// quarter. Every bar totals 4 by beams and arithmetic.
const coffindanceN = noteTokens(tuneBlock("coffindance"));
assert.deepEqual(coffindanceN.slice(0, 3).map(n => n.pitch), ["C+", "C+", "C+"]);
assert.deepEqual(coffindanceN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// The Gummy Bear Song: Betacustic beginner sheet (Musicnotes
// MN0228066, A minor, 4/4, q = 89), page-1 preview (pickup bar
// plus 8 bars, lettered heads). The signature figure is a beamed
// eighth pair, a quarter tied to an eighth (1.5), then three
// eighths; the C bars answer with quarter + tied eighths. Every
// full bar totals 4 by beams, ties and arithmetic.
const gummybearN = noteTokens(tuneBlock("gummybear"));
assert.deepEqual(gummybearN.slice(0, 3).map(n => n.pitch), ["A", "A", "A"]);
assert.deepEqual(gummybearN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Five Nights at Freddy's (The Living Tombstone): Betacustic
// beginner sheet (Musicnotes MN0240717, A minor, 4/4, q = 100),
// page-1 preview (10 bars, lettered heads). The top strain is
// built on dotted-eighth + sixteenth pairs with half-note phrase
// ends; bars 5-10 are eighth-note arpeggio runs with an
// eighth + two-sixteenths tail figure. Bar 4 ends on G# (the
// leading tone). Every bar totals 4 by beams, dots and ties.
const fnafN = noteTokens(tuneBlock("fnaf"));
assert.deepEqual(fnafN.slice(0, 3).map(n => n.pitch), ["G+", "A+", "G+"]);
assert.deepEqual(fnafN.slice(0, 3).map(n => n.beats), [1, 0.75, 0.25]);

// Gravity Falls Theme: Betacustic beginner sheet (Musicnotes
// MN0231591, D minor, 4/4, q = 140), page-1 preview (15 bars,
// lettered heads). Bars 1-4 loop an eighth-note arpeggio riff;
// in the A-major bars every C is sharp (marked once, carries
// through the bar). Bars 5-12 are long held notes (dotted half
// + quarter, whole notes, half-note pairs); bars 13 and 15 are
// three quarters after a quarter rest. Bar totals checked
// against beams, dots and note spacing.
const gravityfallsN = noteTokens(tuneBlock("gravityfalls"));
assert.deepEqual(gravityfallsN.slice(0, 3).map(n => n.pitch), ["F+", "D+", "A"]);
assert.deepEqual(gravityfallsN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Silent Night: Betacustic beginner sheet (Musicnotes
// MN0245145, C major, 3/4, q = 80), page-1 preview (12 bars,
// lettered heads, lyrics printed). The opening figure is a
// dotted quarter + eighth + quarter; phrase ends are dotted
// halves. Bars 5, 7 and 9 pair a half note with a quarter
// (hollow head, then filled head, in all three bars).
const silentnightN = noteTokens(tuneBlock("silentnight"));
assert.deepEqual(silentnightN.slice(0, 3).map(n => n.pitch), ["G", "E", "G"]);
assert.deepEqual(silentnightN.slice(0, 3).map(n => n.beats), [1.5, 0.5, 1]);

// Miraculous Ladybug Theme: Betacustic beginner sheet
// (Musicnotes MN0234709, A minor, 4/4, q = 100), page-1
// preview (8 bars, lettered heads). Most bars open with a
// quarter + eighth rest, then a C4 C4 A3 riff figure. Bars 4
// and 8 hold a dotted quarter, then two eighths tied into one
// beat (merged here), a C4 eighth and a C4 quarter. Bar 7
// answers C4 B3 C4 A3. Every bar totals 4 by rests, beams,
// flags, dots and the tie.
const miraculousN = noteTokens(tuneBlock("miraculous"));
assert.deepEqual(miraculousN.slice(0, 3).map(n => n.pitch), ["C", "C", "A"]);
assert.deepEqual(miraculousN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.5]);

// Happy Birthday To You: Betacustic beginner sheet
// (Musicnotes MN0212901, F major, 3/4, no tempo printed -
// bpm 100 chosen as a comfortable singing speed), page-1
// preview (pickup + 11 bars, lettered heads). Each phrase
// opens with two beamed eighth-note C4 pickups; the long
// phrase notes (E4, F4) are half notes, not dotted halves,
// because the pickup pair shares their bar - every bar
// totals 3. The B in bar 7 is flat from the key signature.
const happybirthdayN = noteTokens(tuneBlock("happybirthday"));
assert.deepEqual(happybirthdayN.slice(0, 2).map(n => n.pitch), ["C", "C"]);
assert.deepEqual(happybirthdayN.slice(0, 2).map(n => n.beats), [0.5, 0.5]);


// All Of Me: Betacustic beginner sheet (Musicnotes MN0235831,
// E minor, 4/4, q=120), page-1 preview (12 bars, lettered heads).
// Bars 1-4 share one figure: dotted quarter, eighth, quarter
// rest, quarter - the rests are dropped here (the app has no
// rests), so each of those lines totals 3 beats of notes.
// Bar 5 opens with a half rest (also dropped), bar 9's quarter
// rest likewise. Values rest on flags, dots and bar arithmetic;
// head fill is not trusted.
const allofmeN = noteTokens(tuneBlock("allofme"));
assert.deepEqual(allofmeN.slice(0, 3).map(n => n.pitch), ["B", "A", "B"]);
assert.deepEqual(allofmeN.slice(0, 3).map(n => n.beats), [1.5, 0.5, 1]);


// Die With A Smile: Betacustic beginner sheet (Musicnotes
// MN0294217, C major, 6/8, dotted-q = 50, so bpm 75), page-1
// preview (12 bars, lettered heads). Long dotted holds open
// the tune; the quick figures are sixteenth pairs and
// dotted-eighth/sixteenth pairs read off the beams and dots.
// The dotted-quarter rests in bars 5, 7, 9 and 11 are dropped
// (the app has no rests). Head positions were checked against
// the measured staff lines; head fill is not trusted.
const diewithasmileN = noteTokens(tuneBlock("diewithasmile"));
assert.deepEqual(diewithasmileN.slice(0, 3).map(n => n.pitch), ["E", "E", "E+"]);
assert.deepEqual(diewithasmileN.slice(0, 3).map(n => n.beats), [3, 1.5, 1.5]);


// Fur Elise: Betacustic beginner sheet (Musicnotes MN0224232,
// A minor, 6/8, dotted-q = 46, so bpm 69), page-1 preview
// (pickup + 7 bars, lettered heads). The famous strain: the
// E-D# pickup, then bars of three beamed eighths under a
// dotted-quarter melody note. Bar 7's group is E4 C5 B4 -
// this arrangement does NOT repeat bar 3's E4 G#4 B4 figure
// (no sharp sign; the middle head measures on the C5 space).
const fureliseN = noteTokens(tuneBlock("furelise"));
assert.deepEqual(fureliseN.slice(0, 2).map(n => n.pitch), ["E+", "D#"]);
assert.deepEqual(fureliseN.slice(0, 2).map(n => n.beats), [0.5, 0.5]);


// Faded: Betacustic beginner sheet (Musicnotes MN0226206,
// A minor, 4/4, q=74), page-1 preview (9 bars, lettered
// heads). Bars 1-4 are plain quarters (the hollow-looking
// heads cannot be halves - four halves would overflow the
// bar). Bars 5 and 9 open with an eighth rest and bar 7 with
// a half + eighth rest; the rests are dropped here.
const fadedN = noteTokens(tuneBlock("faded"));
assert.deepEqual(fadedN.slice(0, 4).map(n => n.pitch), ["A", "A", "A", "C"]);
assert.deepEqual(fadedN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);


// Beautiful In White: Betacustic beginner sheet (Musicnotes
// MN0235833, C major, 4/4, q=100), page-1 preview (24 bars,
// lettered heads). Eight whole-note bars open it (one note
// per bar, no stems); bar 7 is a dotted half + quarter.
// The verse strain repeats with variations: bars 17-20
// restate bars 9-12. Quarter rests opening bars 11, 13, 15,
// 19, 21 and 23 are dropped (the app has no rests).
const beautifulinwhiteN = noteTokens(tuneBlock("beautifulinwhite"));
assert.deepEqual(beautifulinwhiteN.slice(0, 3).map(n => n.pitch), ["E", "D", "C"]);
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
const someonelikeyouN = noteTokens(tuneBlock("someonelikeyou"));
assert.deepEqual(someonelikeyouN.slice(1, 5).map(n => n.pitch), ["E", "C#", "B", "A"]);
assert.deepEqual(someonelikeyouN.slice(1, 5).map(n => n.beats), [0.5, 1.5, 0.25, 0.75]);


// Wellerman: Betacustic beginner sheet (Musicnotes
// MN0233975, A minor, 2/4, q=80), page-1 preview: an eighth
// pickup plus 7 bars, lettered heads. Every bar is eighths
// with one sixteenth pair; the sub-beam position gives the
// split (bar 1: eighth + two sixteenths, then two eighths;
// bar 7 closes sixteenth-sixteenth-eighth). Bar 4 has a
// dotted-eighth + sixteenth pair. Gig plays +12 (the tune
// dips to A3); pitch classes verified.
const wellermanN = noteTokens(tuneBlock("wellerman"));
assert.deepEqual(wellermanN.slice(0, 3).map(n => n.pitch), ["E", "A-", "A"]);
assert.deepEqual(wellermanN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 0.25]);


// Peppa Pig Theme: Betacustic beginner sheet (Musicnotes
// MN0260123, C major, 4/4, q=80), page-1 preview (lettered
// heads). The page is one two-bar phrase printed three
// times: bar 1 is quarters with an eighth pair in the
// middle (G5, E5-C5, D5, G4 - the hollow-looking heads
// cannot be halves, the bar arithmetic gives quarters),
// bar 2 runs up four eighths and lands E5-C5 in quarters.
const peppapigN = noteTokens(tuneBlock("peppapig"));
assert.deepEqual(peppapigN.slice(0, 4).map(n => n.pitch), ["G", "E", "C", "D"]);
assert.deepEqual(peppapigN.slice(0, 4).map(n => n.beats), [1, 0.5, 0.5, 1]);


// Try Everything: Betacustic beginner sheet (Musicnotes
// MN0236868, C major, 4/4, q=116), page-1 preview (13 bars,
// lettered heads). The opening chant bars are four G
// quarters (hollow-looking heads; four halves would
// overflow the bar) against whole-note holds. Bar 8 runs
// C-C-D-C-E in eighths after a quarter E and an eighth
// rest (dropped); bar 9's E is a half note tied in from
// bar 8; bar 13 opens on a dotted quarter.
const tryeverythingN = noteTokens(tuneBlock("tryeverything"));
assert.deepEqual(tryeverythingN.slice(0, 4).map(n => n.pitch), ["G", "G", "G", "G"]);
assert.deepEqual(tryeverythingN.slice(0, 4).map(n => n.beats), [1, 1, 1, 1]);


// Count On Me: Betacustic beginner sheet (Musicnotes
// MN0261377, C major, 4/4, q=176), page-1 preview (13 bars,
// lettered heads). Two intro bars of rests are skipped; the
// strain opens on the G-A-C pickup with the C tied over the
// barline (merged to 1.5). Bars 5 and 13 rock E-D in eighths
// into two quarters; bar 6s last eighth ties into bar 7s
// dotted half (merged to a 3.5 hold on the last note of
// line 4). Rests inside bars are dropped.
const countonmeN = noteTokens(tuneBlock("countonme"));
assert.deepEqual(countonmeN.slice(0, 3).map(n => n.pitch), ["G", "A", "C"]);
assert.deepEqual(countonmeN.slice(0, 3).map(n => n.beats), [0.5, 0.5, 1.5]);
assert.deepEqual(countonmeN.slice(5, 11).map(n => n.beats), [0.5, 0.5, 0.5, 0.5, 1, 1]);


// Dance Monkey: Betacustic beginner sheet (Musicnotes
// MN0236650, A minor, 4/4, q=98), page-1 preview (pickup +
// 11 bars, lettered heads, full-size preview). The strain is
// the signature riff: A-G rocking eighths with a held B4 in
// every other bar (rests dropped). Bar 9 ends on a
// sixteenth + dotted-eighth B pair (0.25 + 0.75), read from
// the sub-beam and the dot after the second head.
const dancemonkeyN = noteTokens(tuneBlock("dancemonkey"));
assert.deepEqual(dancemonkeyN.slice(0, 4).map(n => n.pitch), ["A", "G", "A", "G"]);
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
const showyourselfN = noteTokens(tuneBlock("showyourself"));
assert.deepEqual(showyourselfN.slice(0, 4).map(n => n.pitch), ["F-", "C+", "F+", "C"]);
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
const rewritethestarsN = noteTokens(tuneBlock("rewritethestars"));
assert.deepEqual(rewritethestarsN.slice(0, 5).map(n => n.pitch), ["A#", "A#", "A#", "C", "D"]);
assert.deepEqual(rewritethestarsN.slice(0, 5).map(n => n.beats), [0.5, 0.5, 0.5, 1, 1]);
assert.deepEqual(rewritethestarsN.slice(13, 16).map(n => n.beats), [1.5, 0.5, 2.5]);


// Bohemian Rhapsody: Betacustic beginner sheet (Musicnotes
// MN0227086, B-flat major, q=60), page-1 preview (8 bars,
// lettered heads, mixed meters: bar 3 is 5/4). The opening
// rocks on B-flat (A# on the gig board) in eighths into
// quarters; bar 5 ties an eighth D into a dotted quarter
// (merged to a 2-beat hold); bar 6 ends on B-flat 3, which
// the gig board folds up an octave (pitch class checked).
// Rests are dropped.
const bohemianrhapsodyN = noteTokens(tuneBlock("bohemianrhapsody"));
assert.deepEqual(bohemianrhapsodyN.slice(0, 5).map(n => n.pitch), ["A#", "A#", "A#", "A#", "A#"]);
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
const riverflowsinyouN = noteTokens(tuneBlock("riverflowsinyou"));
assert.deepEqual(riverflowsinyouN.slice(0, 4).map(n => n.pitch), ["C", "B", "C", "B"]);
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
const flymetothemoonN = noteTokens(tuneBlock("flymetothemoon"));
assert.deepEqual(flymetothemoonN.slice(0, 4).map(n => n.pitch), ["C", "B", "A", "G"]);
assert.deepEqual(flymetothemoonN.slice(0, 4).map(n => n.beats), [1.5, 0.5, 1, 1]);
assert.deepEqual(flymetothemoonN.slice(21, 25).map(n => n.pitch), ["G#", "F", "E", "D"]);
assert.deepEqual(flymetothemoonN.slice(21, 25).map(n => n.beats), [1.5, 0.5, 1, 1]);


// Lean On Me: Betacustic beginner sheet (Musicnotes
// MN0236855, C major, 4/4, q=80), page-1 preview (12 bars,
// lettered heads). The verse climbs C4-D-E-F in eighths and
// the F and C are tied over the barlines into half notes,
// merged here (F = 2.5, C = 2.5). Bar 8 starts on a dotted
// B3 (folded up an octave on the gig board; pitch class
// checked) and leaps to F5 for the high strain. Rests are
// dropped.
const leanonmeN = noteTokens(tuneBlock("leanonme"));
assert.deepEqual(leanonmeN.slice(0, 5).map(n => n.pitch), ["C-", "C-", "D", "E", "F"]);
assert.deepEqual(leanonmeN.slice(0, 5).map(n => n.beats), [1, 0.5, 0.5, 0.5, 2.5]);
assert.deepEqual(leanonmeN.slice(26, 31).map(n => n.beats), [1.5, 0.5, 0.5, 0.5, 0.5]);

// Playback + tutorial must consume the same durations
for (const sym of ["function tokenBeats", "function playTune", "function stopPlayback", "AudioContext"]) {
  assert.ok(html.includes(sym), `missing ${sym}`);
}
assert.ok(html.includes('id="playBtn"'), "missing Play button");
assert.ok(html.includes('id="tempoRange"'), "missing tempo control");

console.log("cadence ok:", bpms.length, "tunes with bpm");
