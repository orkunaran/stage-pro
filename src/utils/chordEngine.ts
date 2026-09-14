export interface ParsedLine {
  type: 'lyrics' | 'comment' | 'empty' | 'grid';
  content?: string;
  lyrics?: string;
  chords?: { chord: string; position: number }[];
  // 'grid' tipi satırlar için: her ölçünün (bar/measure) içindeki vuruş
  // belirteçleri (akor adı, "/" veya "%"). Render tarafı her ölçüyü tek
  // parça (satır sonunda bölünmeden) kutu halinde göstermek için kullanır.
  bars?: string[][];
  // İlk "|" karakterinden önceki veya son "|" karakterinden sonraki
  // (ölçü olmayan) serbest metin — örn. "x2" gibi tekrar notları.
  gridPrefix?: string;
  gridSuffix?: string;
}

const NOTES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

export function transposeNote(note: string, semitones: number): string {
  let clean = note.trim();
  let isFlat = clean.includes('b');
  let scale = isFlat ? NOTES_FLAT : NOTES_SHARP;
  
  let idx = scale.indexOf(clean);
  if (idx === -1) {
    scale = NOTES_SHARP;
    idx = scale.indexOf(clean);
  }
  if (idx === -1) {
    scale = NOTES_FLAT;
    idx = scale.indexOf(clean);
  }
  if (idx === -1) return note;

  let newIdx = (idx + semitones) % 12;
  if (newIdx < 0) newIdx += 12;
  return scale[newIdx];
}

export function transposeChord(chord: string, semitones: number): string {
  if (semitones === 0) return chord;
  return chord.replace(/([A-G][#b]?)/g, (match) => transposeNote(match, semitones));
}

export function permanentlyTransposeChordPro(chordProText: string, semitones: number): string {
  if (semitones === 0) return chordProText;
  return chordProText.replace(/\[(.*?)\]/g, (_, chord) => `[${transposeChord(chord, semitones)}]`);
}

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
  const notes = [root];
  let currentNote = root;

  for (let i = 0; i < intervals.length - 1; i++) {
    currentNote = transposeNote(currentNote, intervals[i]);
    notes.push(currentNote);
  }
  return notes;
}

// Köşeli parantezli akorları ve aralarındaki sözü tek bir satırdan ayıklar.
// Hem normal (akor+söz iç içe) satırlar hem de "akor-sadece" satırların
// tespiti (aşağıya bakınız) için ortak olarak kullanılır.
function extractLyricsAndChords(rawLine: string, semitones: number) {
  let lyrics = '';
  const chords: { chord: string; position: number }[] = [];
  let inlineContent = '';
  let i = 0;
  let lastChordEndPos = 0;

  while (i < rawLine.length) {
    if (rawLine[i] === '[') {
      const closeIdx = rawLine.indexOf(']', i);
      if (closeIdx !== -1) {
        const chord = rawLine.substring(i + 1, closeIdx);
        const transposed = transposeChord(chord, semitones);

        let pos = Math.max(lyrics.length, lastChordEndPos);
        chords.push({ chord: transposed, position: pos });
        lastChordEndPos = pos + transposed.length + 1;

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

export function parseChordPro(text: string, semitones: number = 0): ParsedLine[] {
  if (!text) return [];
  const rawLines = text.split(/\r?\n/);
  const parsedLines: ParsedLine[] = [];

  for (let li = 0; li < rawLines.length; li++) {
    let rawLine = rawLines[li];
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

    // {c: ...} yazılmamış ama tanıdık bir bölüm adı olan satırları da
    // (Verse, Chorus, Pre-Chorus, Bridge, Intro, Solo) başlık gibi göster.
    if (SECTION_HEADER_REGEX.test(trimmed)) {
      parsedLines.push({ type: 'comment', content: trimmed.replace(/:\s*$/, '') });
      continue;
    }

    if (rawLine.includes('[') && rawLine.includes(']')) {
      // "Bu satır bir akor tablosu (grid, örn. '| Am / / / |') mu yoksa
      // içinde akor geçen normal bir söz satırı mı?" kontrolü.
      //
      // NOT: Önceki hali `rawLine.includes('/')` ile satırın HERHANGİ bir
      // yerinde "/" var mı diye bakıyordu. Bu, "Bbm/F#" gibi bir SLASH
      // AKORU içeren ve akorla başlayan normal söz satırlarını da grid
      // sanıyordu (çünkü akorun içindeki "/" de sayılıyordu) — sonuç
      // olarak o satırın tüm sözleri kayboluyor, StageViewer'da bomboş bir
      // akor bloğu görünüyordu. Şimdi köşeli parantez içindeki akorları
      // tamamen çıkarıp SADECE dışarıda kalan metne bakıyoruz: dışarıda
      // gerçek harf/söz varsa bu kesinlikle bir söz satırıdır; ayrıca
      // gerçek bir grid için en az bir "|" ya da "/" bulunması şart
      // koşuluyor (yalnızca boşluk kalması artık grid saymaya yetmiyor —
      // bu durum aşağıdaki "akor-sadece satır" birleştirmesine bırakılıyor).
      // Parantezler de ("(x2)" gibi tekrar notları için) izinli karakterler
      // arasında — yoksa örn. "| [G] / / / | (x2)" satırı, parantezler
      // yüzünden grid sayılmayıp akorlar sahte bir "söz" üzerine yanlış
      // konumlandırılıyordu.
      const outsideChordBrackets = rawLine.replace(/\[[^\]]*\]/g, '').trim();
      const isGridLine =
        outsideChordBrackets.length > 0 &&
        /^[\s|/%x()0-9]*$/i.test(outsideChordBrackets) &&
        /[|/]/.test(outsideChordBrackets);

      if (isGridLine) {
        const formattedGrid = rawLine.replace(/\[(.*?)\]/g, (_, chord) => {
          return transposeChord(chord, semitones);
        });

        // Satırı "|" karakterlerine göre ölçülere (bar) ayır. Sadece iki
        // "|" arasında kalan bölümler gerçek ölçü kutusu olarak render
        // edilir; ilk "|"'den önceki veya son "|"'den sonraki serbest metin
        // (örn. "x2" tekrar notu) ayrı tutulur ve kutulanmaz.
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
            if (segment) {
              bars.push(segment.split(/\s+/).filter(Boolean));
            }
          }
        } else {
          gridSuffix = formattedGrid.trim();
        }

        parsedLines.push({
          type: 'grid',
          content: formattedGrid,
          bars,
          gridPrefix,
          gridSuffix,
        });
        continue;
      }

      const { lyrics, chords, content } = extractLyricsAndChords(rawLine, semitones);

      // "Akor-sadece" satır tespiti: satırda köşeli parantezli akor(lar)
      // var ama etraflarında boşluk dışında hiçbir söz/harf yok — yani bu,
      // dışarıdan yapıştırılan klasik "akorlar üstte, ayrı bir satırda söz
      // altta" formatının köşeli-parantez haline çevrilmiş hali (örn.
      // "Akorları Otomatik [ ] İçine Al" düğmesiyle). Bu durumda akorları,
      // hemen altındaki asıl söz satırıyla BİRLEŞTİRİYORUZ; aksi halde
      // akor satırı kendi başına, altı boş bir satır olarak render edilip
      // gerçek söze göre fazladan bir satır yüksekliğinde boşluk bırakıyordu.
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
          parsedLines.push({
            type: 'lyrics',
            content: nextRaw,
            lyrics: nextRaw,
            chords,
          });
          li++; // Söz satırını da tükettik, tekrar işlenmesin diye atla.
          continue;
        }
      }

      parsedLines.push({
        type: 'lyrics',
        content,
        lyrics,
        chords,
      });
    } else {
      parsedLines.push({
        type: 'lyrics',
        content: rawLine,
        lyrics: rawLine,
        chords: [],
      });
    }
  }

  return parsedLines;
}

// Seçili metindeki akorları "| [Akor] / / / |" ölçü (grid) notasyonuna
// çevirir. Bir ölçü HER ZAMAN 4 vuruş kabul edilir — kapanış "|" işaretleri
// her zaman 4'ün katlarında çıkar. `beatsPerChord`, her akorun bu 4 vuruşluk
// ölçü içinde kaç vuruş tuttuğunu belirtir; her akor konumu fark etmeksizin
// kendi `beatsPerChord - 1` kadar "/" işaretini alır:
//   - beatsPerChord = 4  → her akor kendi ölçüsünü tek başına doldurur
//     ("| [F#m] / / / |").
//   - beatsPerChord = 2  → bir ölçüyü İKİ akor paylaşır, ikisi de kendi
//     "/"ini alır (örn. "G A" için "| [G] / [A] / |").
//   - beatsPerChord = 1  → bir ölçüyü DÖRT akor paylaşır, hiçbiri "/" almaz
//     ("| [C] [G] [Am] [F] |").
// 4'e tam bölünmeyen değerler (örn. 3) için son ölçü tam dolmayabilir —
// bu durumda sonucu elle küçük bir düzeltmeyle tamamlamanız gerekebilir.
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
        const symbols = group.map(chord =>
          [`[${chord}]`, ...Array(safeBeats - 1).fill('/')].join(' ')
        );
        bars.push(symbols.join(' '));
      }

      return `| ${bars.join(' | ')} |`;
    })
    .join('\n');
}

export function autoConvertTextToChordPro(text: string): string {
  if (!text) return '';
  // NOT: Sondaki `\b` yerine `(?![A-Za-z0-9])` kullanılıyor. `\b`, "#" gibi
  // harf olmayan bir karakterle bitip hemen ardından boşluk/satır sonu gelen
  // akorlarda (örn. "F#") yanlış geri çekiliyor ve sadece "F" kısmını
  // parantez içine alıyordu (çünkü "#" -> boşluk arasında \b sağlanamıyor,
  // motor "#"'i hiç almadan harf->boşluk sınırında duruyor). Bemollerde
  // ("Bb", "Eb") iki karakter de harf olduğundan bu sorun yaşanmıyordu.
  //
  // `(?:\([^)\n]*\))?` grubu ise akora BOŞLUKSUZ bitişik parantezli ek
  // tonları (örn. "F#m(b9)", "Cmaj7(#11)", "G7(b9,#5)") akorun bir parçası
  // sayıp birlikte parantez içine alır. Akordan sonra boşluk varsa (örn.
  // "Am (tekrar)" gibi notlar) bu grup eşleşmez, parantez dışarıda kalır —
  // böylece söz/tekrar notları yanlışlıkla akor sanılmaz.
  //
  // ÖNEMLİ: Sondaki dışlama kümesine Türkçe harfler de (çÇ ğĞ ıİ öÖ şŞ üÜ)
  // eklendi. Önceden yalnızca [A-Za-z0-9] içeriyordu; bu da "Aşka" gibi bir
  // kelimede "A"dan hemen sonra gelen "ş" harfini tanımadığından, "A"yı
  // orada biten TEK BAŞINA bir akormuş gibi algılayıp yanlışlıkla [A]
  // içine alıyordu (aynı sorun "Güzel", "Gördüm" gibi G ile başlayan
  // kelimelerde de oluyordu). Artık akordan hemen sonra bir Türkçe harf
  // gelirse bu, akorun değil bir kelimenin devamı sayılır.
  const chordRegex = /\b([A-G][#b]?(?:m(?:aj|in)?|M|dim|aug|sus[24]?|add[29]?|[0-9]+|-5|\+5|b5|#5|b9|#9)*(?:\([^)\n]*\))?(?:\/[A-G][#b]?)?)(?![A-Za-z0-9çÇğĞıİöÖşŞüÜ])/g;

  return text
    .split(/\r?\n/)
    .map(line => {
      if (line.trim().startsWith('{')) return line;

      return line.replace(chordRegex, (match, chord, offset, fullString) => {
        const before = fullString.slice(0, offset);
        const after = fullString.slice(offset + match.length);
        if (before.lastIndexOf('[') > before.lastIndexOf(']') && after.indexOf(']') !== -1) {
          return match;
        }
        return `[${chord}]`;
      });
    })
    .join('\n');
}