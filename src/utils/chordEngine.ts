export interface ParsedLine {
  type: 'lyrics' | 'comment' | 'empty' | 'grid';
  content?: string;
  // 'grid' tipi satırlar için: her ölçünün (bar/measure) içindeki vuruş
  // belirteçleri (akor adı, "/" veya "%"). Render tarafı her ölçüyü tek
  // parça (satır sonunda bölünmeden) kutu halinde göstermek için kullanır.
  bars?: string[][];
  // İlk "|" karakterinden önceki veya son "|" karakterinden sonraki
  // (ölçü olmayan) serbest metin — örn. "x2" gibi tekrar notları.
  gridPrefix?: string;
  gridSuffix?: string;
  lyrics?: string;
  chords?: { chord: string; position: number }[];
}

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_TO_PITCH: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

// Tam akor sembolü: kök + (isteğe bağlı) nitelik + (isteğe bağlı) /bas.
// "Chorus", "Bridge", "Giriş", "N.C." gibi etiketler buna UYMAZ ve
// transpoze edilmez (eskiden [Chorus] → [Dhorus] oluyordu).
const CHORD_RE =
  /^([A-G](?:#|b)?)((?:maj|min|dim|aug|sus|add|alt|m|M|\d+|\/\d+|[#b+\-°ø(),])*)(?:\/([A-G](?:#|b)?))?$/;

export function isChordSymbol(text: string): boolean {
  return CHORD_RE.test(text.trim());
}

export function noteToPitch(note: string): number {
  const p = NOTE_TO_PITCH[note.trim()];
  return p === undefined ? -1 : p;
}

export function pitchToName(pitch: number, preferFlat: boolean): string {
  const p = ((pitch % 12) + 12) % 12;
  return (preferFlat ? NOTES_FLAT : NOTES_SHARP)[p];
}

// Bemol (b) ile yazılan tonlar: F, Bb, Eb, Ab, Db majör; Dm, Gm, Cm, Fm, Bbm, Ebm minör.
const FLAT_MAJOR = new Set([5, 10, 3, 8, 1]);
const FLAT_MINOR = new Set([2, 7, 0, 5, 10, 3]);

export function keyPrefersFlat(pitch: number, isMinor: boolean): boolean {
  return (isMinor ? FLAT_MINOR : FLAT_MAJOR).has(((pitch % 12) + 12) % 12);
}

export function parseKey(key?: string): { root: string; pitch: number; isMinor: boolean } {
  const m = (key || '').trim().match(/^([A-G](?:#|b)?)(.*)$/);
  if (!m || noteToPitch(m[1]) < 0) return { root: 'A', pitch: 9, isMinor: true };
  const isMinor = /^(m(?!aj)|min|-)/.test(m[2]);
  return { root: m[1], pitch: noteToPitch(m[1]), isMinor };
}

/** Şarkının tonunu transpoze eder ve hedef tonun diyez mi bemol mü yazılacağını döndürür. */
export function transposeKey(key: string | undefined, semitones: number) {
  const k = parseKey(key);
  if (semitones === 0) {
    const preferFlat = k.root.includes('b') || (!k.root.includes('#') && keyPrefersFlat(k.pitch, k.isMinor));
    return { name: k.root + (k.isMinor ? 'm' : ''), root: k.root, isMinor: k.isMinor, preferFlat };
  }
  const pitch = (((k.pitch + semitones) % 12) + 12) % 12;
  const preferFlat = keyPrefersFlat(pitch, k.isMinor);
  const root = pitchToName(pitch, preferFlat);
  return { name: root + (k.isMinor ? 'm' : ''), root, isMinor: k.isMinor, preferFlat };
}

export function transposeNote(note: string, semitones: number, preferFlat?: boolean): string {
  const clean = note.trim();
  const pitch = noteToPitch(clean);
  if (pitch < 0) return note;
  const flat = preferFlat ?? clean.includes('b');
  return pitchToName(pitch + semitones, flat);
}

export function transposeChord(chord: string, semitones: number, preferFlat?: boolean): string {
  if (semitones === 0) return chord;
  const m = chord.trim().match(CHORD_RE);
  if (!m) return chord; // bölüm etiketi vb. → olduğu gibi bırak
  const [, root, suffix, bass] = m;
  const flat = preferFlat ?? root.includes('b');
  return transposeNote(root, semitones, flat) + suffix + (bass ? '/' + transposeNote(bass, semitones, flat) : '');
}

export function permanentlyTransposeChordPro(chordProText: string, semitones: number, preferFlat?: boolean): string {
  if (semitones === 0) return chordProText;
  return chordProText.replace(/\[(.*?)\]/g, (_, chord) => `[${transposeChord(chord, semitones, preferFlat)}]`);
}

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PITCH = [0, 2, 4, 5, 7, 9, 11];

/** Gamı doğru harflerle yazar: F majör → F G A Bb C D E (A# değil). */
export function getScaleNotes(root: string, scaleType: string): string[] {
  const intervalsMap: Record<string, number[]> = {
    'Ionian (Major)': [2, 2, 1, 2, 2, 2, 1],
    'Aeolian (Minor)': [2, 1, 2, 2, 1, 2, 2],
    'Dorian': [2, 1, 2, 2, 2, 1, 2],
    'Mixolydian': [2, 2, 1, 2, 2, 1, 2],
    'Phrygian': [1, 2, 2, 2, 1, 2, 2],
    'Phrygian Dominant': [1, 3, 1, 2, 1, 2, 2],
    'Harmonic Minor': [2, 1, 2, 2, 1, 3, 1],
    'Melodic Minor': [2, 1, 2, 2, 2, 2, 1],
    'Lydian': [2, 2, 2, 1, 2, 2, 1],
    'Locrian': [1, 2, 2, 1, 2, 2, 2],
  };
  const intervals = intervalsMap[scaleType] || intervalsMap['Aeolian (Minor)'];
  const rootPitch = noteToPitch(root);
  if (rootPitch < 0) return [root];

  const startLetter = LETTERS.indexOf(root[0]);
  const notes: string[] = [];
  let pitch = rootPitch;
  for (let i = 0; i < 7; i++) {
    const idx = (startLetter + i) % 7;
    let diff = (((pitch - LETTER_PITCH[idx]) % 12) + 12) % 12;
    if (diff > 6) diff -= 12;
    const acc = diff === 0 ? '' : diff === 1 ? '#' : diff === 2 ? '##' : diff === -1 ? 'b' : diff === -2 ? 'bb' : null;
    notes.push(acc === null ? pitchToName(pitch, false) : LETTERS[idx] + acc);
    pitch = (pitch + intervals[i]) % 12;
  }
  return notes;
}

// Köşeli parantezli akorları ve aralarındaki sözü tek bir satırdan ayıklar.
// Akor, sözdeki GERÇEK konumuna bağlanır (eskiden akor uzunluğu kadar ileri
// itiliyordu ve "[Am]O [Dm]an" satırında Dm "a" yerine "n" üstüne düşüyordu).
// Akor sözden genişse aradaki boşluğu çizim tarafı (SongRenderer) açar.
function extractLyricsAndChords(rawLine: string, semitones: number, preferFlat?: boolean) {
  let lyrics = '';
  const chords: { chord: string; position: number }[] = [];
  let inlineContent = '';
  let i = 0;

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const closeIdx = rawLine.indexOf(']', i);
      if (closeIdx !== -1) {
        const chord = rawLine.substring(i + 1, closeIdx);
        const transposed = transposeChord(chord, semitones, preferFlat);
        chords.push({ chord: transposed, position: lyrics.length });
        inlineContent += `[${transposed}]`;
        i = closeIdx + 1;
        continue;
      }
    }
    lyrics += rawLine[i];
    inlineContent += rawLine[i];
    i++;
  }

  return { lyrics, chords, content: inlineContent };
}

// {c: ...} içine alınmamış, düz yazılmış bölüm başlıkları (Verse, Chorus,
// Pre-Chorus, Bridge, Intro, Solo — isteğe bağlı numara ve iki nokta ile,
// örn. "Verse 2", "Chorus:", "Pre-Chorus 2:") otomatik tanınsın diye.
const SECTION_HEADER_REGEX = /^(verse|chorus|pre-?chorus|bridge|intro|solo)\s*\d*\s*:?\s*$/i;

// Akorlar çıkarıldıktan sonra yalnızca bu karakterler kalıyorsa satır bir
// akor tablosudur (grid). En az bir "|" ya da "/" şart; böylece "[D/F#]Söz"
// gibi slash akorla başlayan söz satırları artık grid sanılmaz.
const GRID_REST = /^[\s|/%xX×()0-9.:\-]*$/;

export function parseChordPro(text: string, semitones: number = 0, preferFlat?: boolean): ParsedLine[] {
  if (!text) return [];
  const rawLines = text.split(/\r?\n/);
  const parsedLines: ParsedLine[] = [];

  for (let li = 0; li < rawLines.length; li++) {
    const rawLine = rawLines[li];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      parsedLines.push({ type: 'empty' });
      continue;
    }

    const commentMatch = trimmed.match(/^\{(?:c|comment):\s*(.*?)\}$/i);
    if (commentMatch) {
      parsedLines.push({ type: 'comment', content: commentMatch[1] });
      continue;
    }

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      continue;
    }

    if (SECTION_HEADER_REGEX.test(trimmed)) {
      parsedLines.push({ type: 'comment', content: trimmed.replace(/:\s*$/, '') });
      continue;
    }

    if (/\[[^\]]*\]/.test(rawLine)) {
      const outsideChordBrackets = rawLine.replace(/\[[^\]]*\]/g, '').trim();
      const isGridLine =
        outsideChordBrackets.length > 0 &&
        GRID_REST.test(outsideChordBrackets) &&
        /[|/]/.test(outsideChordBrackets);

      if (isGridLine) {
        const formattedGrid = rawLine.replace(/\[(.*?)\]/g, (_, chord) => transposeChord(chord, semitones, preferFlat));

        // Satırı "|" karakterlerine göre ölçülere (bar) ayır.
        const pipeIndices: number[] = [];
        for (let idx = 0; idx < formattedGrid.length; idx++) {
          if (formattedGrid[idx] === '|') pipeIndices.push(idx);
        }

        const bars: string[][] = [];
        let gridPrefix = '';
        let gridSuffix = '';

        if (pipeIndices.length >= 2) {
          gridPrefix = formattedGrid.slice(0, pipeIndices[0]).trim();
          gridSuffix = formattedGrid.slice(pipeIndices[pipeIndices.length - 1] + 1).trim();
          for (let p = 0; p < pipeIndices.length - 1; p++) {
            const segment = formattedGrid.slice(pipeIndices[p] + 1, pipeIndices[p + 1]).trim();
            if (segment) bars.push(segment.split(/\s+/).filter(Boolean));
          }
        } else {
          gridSuffix = formattedGrid.trim();
        }

        parsedLines.push({ type: 'grid', content: formattedGrid, bars, gridPrefix, gridSuffix });
        continue;
      }

      const { lyrics, chords, content } = extractLyricsAndChords(rawLine, semitones, preferFlat);

      // "Akor-sadece" satır + altında söz satırı → tek satırda birleştir.
      const isChordOnlyLine = chords.length > 0 && lyrics.trim() === '';
      if (isChordOnlyLine) {
        const nextRaw = rawLines[li + 1];
        const nextTrimmed = nextRaw?.trim();
        const nextIsUsableLyric =
          nextRaw !== undefined &&
          !!nextTrimmed &&
          !nextTrimmed.startsWith('{') &&
          !SECTION_HEADER_REGEX.test(nextTrimmed) &&
          !nextRaw.includes('[');

        if (nextIsUsableLyric) {
          parsedLines.push({ type: 'lyrics', content: nextRaw, lyrics: nextRaw, chords });
          li++;
          continue;
        }
      }

      parsedLines.push({ type: 'lyrics', content, lyrics, chords });
    } else {
      parsedLines.push({ type: 'lyrics', content: rawLine, lyrics: rawLine, chords: [] });
    }
  }

  return parsedLines;
}

// Seçili metindeki akorları "| [Akor] / / / |" ölçü (grid) notasyonuna
// çevirir. Bir ölçü HER ZAMAN 4 vuruş kabul edilir. `beatsPerChord`, her
// akorun bu 4 vuruşluk ölçü içinde kaç vuruş tuttuğunu belirtir.
export function convertChordsToGridNotation(text: string, beatsPerChord: number = 4): string {
  if (!text) return '';
  const BAR_CAPACITY = 4;
  const safeBeats = Math.max(1, Math.round(beatsPerChord));
  const chordsPerBar = Math.max(1, Math.floor(BAR_CAPACITY / safeBeats));

  return text
    .split(/\r?\n/)
    .map(line => {
      const tokens = line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(token => token.replace(/[\[\]]/g, ''));

      if (tokens.length === 0) return line;

      const bars: string[] = [];
      for (let i = 0; i < tokens.length; i += chordsPerBar) {
        const group = tokens.slice(i, i + chordsPerBar);
        const symbols = group.map(chord => [`[${chord}]`, ...Array(safeBeats - 1).fill('/')].join(' '));
        bars.push(symbols.join(' '));
      }

      return `| ${bars.join(' | ')} |`;
    })
    .join('\n');
}

// ---------- Otomatik [ ] dönüştürme ----------

// Akor satırında akor dışında bulunabilecek işaretler: | / % - x2 2x (x2) : .
const BAR_TOKEN = /^(?:\|{1,2}:?|:?\|{1,2}|\/+|%|-+|\.{1,3}|[xX×]\d*|\d+[xX×]?|\d+\.|\(|\)|\(?[xX×]\d+\)?)$/;

function isChordLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('{') || /\[[^\]]*\]/.test(t)) return false;
  let chords = 0;
  for (const tok of t.split(/\s+/)) {
    if (CHORD_RE.test(tok)) chords++;
    else if (!BAR_TOKEN.test(tok)) return false; // tek bir söz kelimesi bile varsa akor satırı değil
  }
  return chords > 0;
}

function isLyricLine(line: string | undefined): boolean {
  if (line === undefined) return false;
  const t = line.trim();
  return (
    t.length > 0 &&
    !t.startsWith('{') &&
    !SECTION_HEADER_REGEX.test(t) &&
    !isChordLine(line) &&
    !/\[[^\]]*\]/.test(t)
  );
}

/** "Akor satırı + altında söz satırı" düzenini, sütun hizasını koruyarak satır içi ChordPro'ya çevirir. */
function mergeChordLineIntoLyrics(chordLine: string, lyricLine: string): string {
  const chords: { col: number; chord: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine))) {
    if (CHORD_RE.test(m[0])) chords.push({ col: m.index, chord: m[0] });
  }
  let result = lyricLine.replace(/\s+$/, '');
  const maxCol = Math.max(...chords.map(c => c.col));
  if (result.length < maxCol) result = result.padEnd(maxCol, ' ');
  for (let k = chords.length - 1; k >= 0; k--) {
    const { col, chord } = chords[k];
    result = result.slice(0, col) + `[${chord}]` + result.slice(col);
  }
  return result;
}

/**
 * Düz metindeki akorları [ ] içine alır.
 * - Sadece TAMAMEN akor (ve | / x2 gibi işaretler) içeren satırlara dokunur;
 *   söz satırlarındaki büyük harfler ("Aşkın", "I Am A...") akor sanılmaz.
 * - Akor satırının hemen altında söz satırı varsa ikisini sütun hizasına
 *   göre birleştirir (internetten kopyalanan akorlu sözler).
 */
export function autoConvertTextToChordPro(text: string): string {
  if (!text) return '';
  const lines = text.split(/\r?\n/).map(l => l.replace(/\t/g, '    '));
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (!line.includes('|') && isLyricLine(next)) {
        out.push(mergeChordLineIntoLyrics(line, next!));
        i++;
        continue;
      }
      out.push(line.replace(/\S+/g, tok => (CHORD_RE.test(tok) ? `[${tok}]` : tok)));
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
