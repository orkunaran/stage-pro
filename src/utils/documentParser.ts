import mammoth from 'mammoth';
import { autoConvertTextToChordPro } from './chordEngine';

export async function parseDocumentToSong(file: File): Promise<{ title: string; artist: string; baseKey: string; rawChordPro: string } | null> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  let text = '';

  if (extension === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    text = result.value;
  } else if (
    extension === 'txt' ||
    extension === 'chordpro' ||
    extension === 'pro' ||
    extension === 'chopro' ||
    extension === 'cho'
  ) {
    text = await file.text();
  } else {
    alert(`"${file.name}" yüklenemedi. Desteklenen biçimler: DOCX, TXT ve ChordPro (.cho, .chordpro, .pro). PDF için metni kopyalayıp yeni şarkıya yapıştırabilirsiniz.`);
    return null;
  }

  text = text.replace(/\r\n?/g, '\n');

  // Köşeli parantezli akor yoksa metin muhtemelen "akor satırı + söz satırı"
  // düzenindedir (internetten kopyalanmış). Otomatik ChordPro'ya çevir.
  if (!/\[[^\]]+\]/.test(text)) {
    text = autoConvertTextToChordPro(text);
  }

  const cleanTitle = file.name.replace(/\.[^/.]+$/, '').replace(/_/g, ' ');
  let title = cleanTitle;
  let artist = 'Bilinmeyen Sanatçı';
  let baseKey = 'Am';

  const titleMatch = text.match(/\{(?:title|t):\s*(.*?)\}/i);
  const artistMatch = text.match(/\{(?:artist|a):\s*(.*?)\}/i);
  const keyMatch = text.match(/\{(?:key|k):\s*(.*?)\}/i);

  if (titleMatch) title = titleMatch[1].trim();
  if (artistMatch) artist = artistMatch[1].trim();
  if (keyMatch) baseKey = keyMatch[1].trim();

  return { title, artist, baseKey, rawChordPro: text };
}
