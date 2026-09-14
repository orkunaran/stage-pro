import React, { useState, useRef } from 'react';
import type { Song } from '../../types/song';
import { autoConvertTextToChordPro, convertChordsToGridNotation } from '../../utils/chordEngine';
import { Save, ArrowLeft, Wand2, Rows3 } from 'lucide-react';

interface SongEditorProps {
  song: Song;
  onSave: (updated: Song) => void;
  onCancel: () => void;
}

const SCALE_OPTIONS = [
  'Aeolian (Minor)',
  'Ionian (Major)',
  'Dorian',
  'Mixolydian',
  'Phrygian',
  'Phrygian Dominant',
  'Harmonic Minor',
  'Melodic Minor',
  'Lydian',
  'Locrian',
];

const TIME_SIGNATURES = ['4/4', '3/4', '6/8', '2/4', '12/8', '5/8', '7/8', '9/8'];

export const SongEditor: React.FC<SongEditorProps> = ({ song, onSave, onCancel }) => {
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist);
  const [baseKey, setBaseKey] = useState(song.baseKey || 'Am');
  const [scaleType, setScaleType] = useState(song.scaleType || 'Aeolian (Minor)');
  const [tempo, setTempo] = useState(song.tempo || 100);
  const [timeSignature, setTimeSignature] = useState(song.timeSignature || '4/4');
  const [rawChordPro, setRawChordPro] = useState(song.rawChordPro);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // "Her akor kaç vuruş sürsün?" — grid'e çevirirken her akordan sonra
  // eklenecek "/" sayısını belirler (beatsPerBar=4 → "Akor / / /").
  const [beatsPerBar, setBeatsPerBar] = useState(4);

  const handleAutoFormatChords = () => {
    const formatted = autoConvertTextToChordPro(rawChordPro);
    setRawChordPro(formatted);
  };

  // Metin kutusunda SEÇİLİ olan akor satır(lar)ını "| Akor / / / |" ölçü
  // notasyonuna çevirir. Seçim yoksa kullanıcıyı uyarır — tüm metne
  // otomatik uygulamak, aralarında söz olan satırları da bozabileceği
  // için bilerek yapılmıyor.
  const handleConvertSelectionToGrid = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    if (selectionStart === selectionEnd) {
      alert('Önce dönüştürmek istediğiniz akor satırını (satırlarını) metin kutusunda seçin, sonra bu düğmeye basın.');
      return;
    }

    // NOT: React, kontrollü bir textarea'nın `value`'sunu programatik olarak
    // güncellediğinde tarayıcı `scrollTop`'u sıfırlayabiliyor — bu da
    // "sayfa başına dönme" hissi veren asıl sebepti (aslında sayfa değil,
    // metin kutusunun kendi iç kaydırması sıfırlanıyordu). Önceki kaydırma
    // konumunu saklayıp state güncellemesinden SONRA geri yüklüyoruz.
    const scrollTopBeforeUpdate = textarea.scrollTop;

    const selectedText = rawChordPro.slice(selectionStart, selectionEnd);
    const converted = convertChordsToGridNotation(selectedText, beatsPerBar);
    const updated = rawChordPro.slice(0, selectionStart) + converted + rawChordPro.slice(selectionEnd);
    setRawChordPro(updated);

    // Yeni metni tekrar seçili bırak ve kaydırma konumunu geri yükle,
    // kullanıcı sonucu bulunduğu yerde hemen görsün.
    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
      textarea.setSelectionRange(selectionStart, selectionStart + converted.length);
      textarea.scrollTop = scrollTopBeforeUpdate;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...song,
      title: title.trim() || 'İsimsiz Şarkı',
      artist: artist.trim() || 'Bilinmeyen Sanatçı',
      baseKey,
      scaleType,
      tempo: Number(tempo) || 100,
      timeSignature,
      rawChordPro,
      updatedAt: Date.now(),
    });
  };

  return (
    <div style={{ height: '100vh', backgroundColor: '#0a0a0c', color: '#f3f4f6', display: 'flex', flexDirection: 'column' }}>
      {/* Üst Bar */}
      <div style={{ background: '#121216', borderBottom: '1px solid #27272a', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{ background: '#27272a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          <ArrowLeft size={16} /> Vazgeç
        </button>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Şarkıyı Düzenle</h2>
        <button
          type="button"
          onClick={handleSubmit}
          style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}
        >
          <Save size={16} /> Kaydet
        </button>
      </div>

      {/* Form Alanı */}
      <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', gap: '20px', padding: '24px', overflow: 'hidden' }}>
        {/* Sol Panel: Meta Bilgiler */}
        <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#121216', padding: '20px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <div>
            <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Şarkı Adı</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Sanatçı</label>
            <input
              type="text"
              value={artist}
              onChange={e => setArtist(e.target.value)}
              style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Kök Ton</label>
              <input
                type="text"
                value={baseKey}
                onChange={e => setBaseKey(e.target.value)}
                placeholder="Örn: Am, C#"
                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fbbf24', fontWeight: 'bold', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Ölçü (Time Sig.)</label>
              <select
                value={timeSignature}
                onChange={e => setTimeSignature(e.target.value)}
                style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box', fontWeight: 'bold' }}
              >
                {TIME_SIGNATURES.map(ts => (
                  <option key={ts} value={ts}>{ts}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Gam (Scale Modu)</label>
            <select
              value={scaleType}
              onChange={e => setScaleType(e.target.value)}
              style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#38bdf8', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box', fontWeight: 'bold' }}
            >
              {SCALE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Tempo (BPM)</label>
            <input
              type="number"
              min="40"
              max="240"
              value={tempo}
              onChange={e => setTempo(Number(e.target.value))}
              style={{ width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#ef4444', fontWeight: 'bold', padding: '10px', borderRadius: '8px', marginTop: '6px', boxSizing: 'border-box' }}
            />
          </div>
        </div>

        {/* Sağ Panel: Şarkı İçeriği ve Akıllı Format Butonu */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#121216', padding: '20px', borderRadius: '12px', border: '1px solid #27272a' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
              Şarkı İçeriği (ChordPro Formatı)
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleAutoFormatChords}
                style={{
                  background: '#18181b',
                  color: '#fbbf24',
                  border: '1px solid #3f3f46',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                }}
                title="Düz yazılmış akorları otomatik olarak [Akor] içine alır"
              >
                <Wand2 size={15} /> Akorları Otomatik [ ] İçine Al
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', padding: '4px 4px 4px 10px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', whiteSpace: 'nowrap' }}>Akor başına vuruş:</span>
                <input
                  type="number"
                  min={1}
                  max={16}
                  value={beatsPerBar}
                  onChange={e => setBeatsPerBar(Math.max(1, Math.min(16, Number(e.target.value) || 1)))}
                  style={{
                    width: '40px',
                    background: '#0a0a0c',
                    border: '1px solid #3f3f46',
                    color: '#fbbf24',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    padding: '5px 4px',
                    borderRadius: '6px',
                    fontSize: '12px',
                  }}
                />
                <button
                  type="button"
                  onClick={handleConvertSelectionToGrid}
                  style={{
                    background: '#27272a',
                    color: '#38bdf8',
                    border: 'none',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Metin kutusunda seçtiğiniz akor satırını '| Akor / / / |' ölçü notasyonuna çevirir"
                >
                  <Rows3 size={14} /> Seçimi Ölçüye Çevir
                </button>
              </div>
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={rawChordPro}
            onChange={e => setRawChordPro(e.target.value)}
            placeholder="Örn: | Gm Am C Bbmaj7 / | x 2 yazıp yukarıdaki 'Akorları Otomatik [ ] İçine Al' butonuna basabilirsiniz."
            style={{
              flex: 1,
              background: '#0a0a0c',
              border: '1px solid #3f3f46',
              color: '#f3f4f6',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: '15px',
              lineHeight: 1.6,
              padding: '16px',
              borderRadius: '8px',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>
      </form>
    </div>
  );
};