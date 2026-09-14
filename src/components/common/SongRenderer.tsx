import React from 'react';
import type { ParsedLine } from '../../utils/chordEngine';

interface SongRendererProps {
  lines: ParsedLine[];
  fontSize?: number;
  layoutMode?: 'over' | 'inline';
  isTwoColumn?: boolean;
}

export const SongRenderer: React.FC<SongRendererProps> = ({
  lines,
  fontSize = 22,
  isTwoColumn = false,
}) => {
  if (!lines || lines.length === 0) {
    return (
      <div style={{ color: '#71717a', textAlign: 'center', marginTop: '40px' }}>
        Şarkı içeriği boş.
      </div>
    );
  }

  const isRepeatToken = (token: string) => token === '/' || token === '%';

  // Bir tek grid satırının bar hücrelerini üretir (hem grup-içi CSS Grid
  // hücreleri hem de tekil/eski düşme durumu için ortak kullanılır).
  const renderGridBarCell = (bar: string[], key: React.Key) => (
    <div
      key={key}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: `${fontSize * 0.4}px`,
        padding: `${fontSize * 0.15}px ${fontSize * 0.55}px`,
        borderLeft: '2px solid #3f3f46',
        borderRight: '2px solid #3f3f46',
        whiteSpace: 'nowrap',
      }}
    >
      {bar.map((token, tokenIdx) => (
        <span
          key={tokenIdx}
          style={{
            fontSize: isRepeatToken(token) ? `${fontSize * 0.75}px` : `${fontSize * 0.95}px`,
            fontWeight: isRepeatToken(token) ? 'normal' : 'bold',
            color: isRepeatToken(token) ? '#52525b' : '#fbbf24',
            textShadow: isRepeatToken(token) ? 'none' : '0 0 8px rgba(251, 191, 36, 0.25)',
          }}
        >
          {token}
        </span>
      ))}
    </div>
  );

  // Ardışık akor tablosu (grid) satırlarını render eder. NOT: Daha önce
  // burada satırlar arası ölçü hizalaması için sabit sütunlu bir CSS Grid
  // kullanılıyordu — ama sabit sütun sayısı ekrana sığmadığında (özellikle
  // dar telefon ekranlarında) taşan ölçüler alt satıra kaymak yerine
  // EKRANIN DIŞINA taşıyordu. Bunun yerine her satır kendi içinde
  // `flexWrap` kullanıyor: sığmayan ölçüler otomatik olarak alt satıra
  // geçer, hiçbir şey ekran dışında kalmaz. Bunun bedeli, farklı
  // satırlardaki ölçülerin artık piksel piksel hizalı olmaması.
  const renderGridLine = (line: ParsedLine, key: React.Key) => (
    <div
      key={key}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: '4px',
        rowGap: '10px',
        marginBottom: '14px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        userSelect: 'none',
        pointerEvents: 'none',
        maxWidth: '100%',
      }}
    >
      {line.gridPrefix && (
        <span style={{ fontSize: `${fontSize * 0.6}px`, color: '#71717a', whiteSpace: 'nowrap' }}>
          {line.gridPrefix}
        </span>
      )}

      {(line.bars || []).map((bar, barIdx) => renderGridBarCell(bar, barIdx))}

      {line.gridSuffix && (
        <span
          style={{
            fontSize: `${fontSize * 0.65}px`,
            fontWeight: 'bold',
            color: '#71717a',
            background: '#18181b',
            border: '1px solid #27272a',
            borderRadius: '6px',
            padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          {line.gridSuffix}
        </span>
      )}
    </div>
  );

  const renderLineBlock = (lineList: ParsedLine[], keyPrefix = '') => {
    const elements: React.ReactNode[] = [];
    let idx = 0;

    while (idx < lineList.length) {
      const line = lineList[idx];
      const lineKey = `${keyPrefix}_${idx}`;

      if (line.type === 'comment') {
        elements.push(
          <div
            key={lineKey}
            style={{
              color: '#38bdf8',
              fontWeight: 'bold',
              fontSize: `${fontSize * 0.85}px`,
              marginTop: '18px',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              borderLeft: '3px solid #38bdf8',
              paddingLeft: '10px',
              wordBreak: 'break-word',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {line.content}
          </div>
        );
        idx++;
        continue;
      }

      if (line.type === 'empty') {
        elements.push(<div key={lineKey} style={{ height: `${fontSize * 0.9}px` }} />);
        idx++;
        continue;
      }

      if (line.type === 'grid') {
        // Ölçüler (bars) ayrıştırılmışsa, taşan ölçülerin otomatik alt
        // satıra kaymasını sağlayan (ekran dışına taşırmayan) render'ı
        // kullan. Eski/olağandışı formatlı satırlarda (bars boşsa) eski
        // düz metin gösterimine geri dön.
        if (line.bars && line.bars.length > 0) {
          elements.push(renderGridLine(line, lineKey));
          idx++;
          continue;
        }

        // Eski/olağandışı formatlı satırlarda (bars boşsa) eski düz metin
        // gösterimine geri dön.
        elements.push(
          <div
            key={lineKey}
            style={{
              fontSize: `${fontSize}px`,
              color: '#fbbf24',
              fontWeight: 'bold',
              letterSpacing: '1px',
              marginBottom: '10px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              textShadow: '0 0 8px rgba(251, 191, 36, 0.25)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {line.content}
          </div>
        );
        idx++;
        continue;
      }

      const chords = line.chords || [];
      const lyricsText = line.lyrics !== undefined ? line.lyrics : (line.content || '');

      // Düz söz satırı
      if (chords.length === 0) {
        elements.push(
          <div
            key={lineKey}
            style={{
              fontSize: `${fontSize}px`,
              color: '#f3f4f6',
              marginBottom: '6px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              lineHeight: 1.5,
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          >
            {lyricsText || ' '}
          </div>
        );
        idx++;
        continue;
      }

      // Akorlu satır segmentasyonu — önce KELİME aralıklarını bul, sonra
      // her kelimenin içine düşen akorları o kelimeye göre böl. Böylece
      // bir akor tam kelimenin ortasına denk gelse bile (örn.
      // "gülle[Bbmaj7]rim"), o kelimenin tüm parçaları TEK bir bölünmez
      // blok halinde gruplanır — satır kaydırma (wrap) SADECE gerçek
      // kelime aralarında (boşluklarda) olabilir, kelimenin ortasında asla.
      const wordRanges: [number, number][] = [];
      const wordRegex = /\S+/g;
      let wm: RegExpExecArray | null;
      while ((wm = wordRegex.exec(lyricsText)) !== null) {
        wordRanges.push([wm.index, wm.index + wm[0].length]);
      }
      if (wordRanges.length === 0) {
        // Tamamen boşluktan oluşan bir "lyrics" (örn. birleştirilemeyen bir
        // akor-sadece satırın kalıntısı) — en azından hiçbir şey kaybolmasın.
        wordRanges.push([0, lyricsText.length]);
      }

      type WordUnit = { segments: { chord: string; text: string }[] };
      const wordUnits: WordUnit[] = [];
      const leadingGap = lyricsText.slice(0, wordRanges[0][0]);
      if (leadingGap) {
        wordUnits.push({ segments: [{ chord: '', text: leadingGap }] });
      }

      wordRanges.forEach(([wStart, wEnd], wIdx) => {
        const chordsInWord = chords.filter(c => c.position >= wStart && c.position < wEnd);
        const wordSegs: { chord: string; text: string }[] = [];

        if (chordsInWord.length === 0 || chordsInWord[0].position > wStart) {
          const pieceEnd = chordsInWord.length > 0 ? chordsInWord[0].position : wEnd;
          wordSegs.push({ chord: '', text: lyricsText.slice(wStart, pieceEnd) });
        }
        chordsInWord.forEach((c, cIdx) => {
          const pieceEnd = chordsInWord[cIdx + 1] ? chordsInWord[cIdx + 1].position : wEnd;
          wordSegs.push({ chord: c.chord, text: lyricsText.slice(c.position, pieceEnd) });
        });

        wordUnits.push({ segments: wordSegs });

        // Bu kelimeyle bir sonraki kelime arasındaki boşluk — burada satır
        // kaydırma SERBEST (doğal kelime arası boşluk).
        const nextStart = wordRanges[wIdx + 1] ? wordRanges[wIdx + 1][0] : lyricsText.length;
        const gap = lyricsText.slice(wEnd, nextStart);
        if (gap) {
          wordUnits.push({ segments: [{ chord: '', text: gap }] });
        }
      });

      elements.push(
        <div
          key={lineKey}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            marginBottom: '10px',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineHeight: 1.2,
            overflow: 'visible',           // Tarayıcının iç kaydırma ekseni türetmesini engeller
            pointerEvents: 'none',          // Dokunmatik olayların akor elemanına takılmasını engeller
            userSelect: 'none',
            transform: 'translateZ(0)',    // GPU üzerinde tek bir katman olarak kilitler
          }}
        >
          {wordUnits.map((unit, uIdx) => (
            <div
              key={uIdx}
              style={{
                display: 'inline-flex',
                alignItems: 'flex-end',
                whiteSpace: 'pre',
              }}
            >
              {unit.segments.map((seg, sIdx) => (
                <div
                  key={sIdx}
                  style={{
                    display: 'inline-flex',
                    flexDirection: 'column',
                    whiteSpace: 'pre',
                    verticalAlign: 'bottom',
                    overflow: 'visible',
                  }}
                >
                  {/* Akor */}
                  <span
                    style={{
                      fontSize: `${fontSize * 0.9}px`,
                      color: '#fbbf24',
                      fontWeight: 'bold',
                      height: `${fontSize * 1.15}px`,
                      display: 'flex',
                      alignItems: 'flex-end',
                      textShadow: '0 0 8px rgba(251, 191, 36, 0.3)',
                      overflow: 'visible',
                    }}
                  >
                    {seg.chord || ' '}
                  </span>

                  {/* Hece / Söz */}
                  <span
                    style={{
                      fontSize: `${fontSize}px`,
                      color: '#f3f4f6',
                      minHeight: `${fontSize}px`,
                      overflow: 'visible',
                    }}
                  >
                    {seg.text || ' '}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );
      idx++;
    }

    return elements;
  };

  if (isTwoColumn) {
    const half = Math.ceil(lines.length / 2);
    const leftLines = lines.slice(0, half);
    const rightLines = lines.slice(half);

    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: '24px',
          width: '100%',
        }}
      >
        <div style={{ minWidth: 0 }}>{renderLineBlock(leftLines, 'col_left')}</div>
        <div style={{ minWidth: 0 }}>{renderLineBlock(rightLines, 'col_right')}</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%' }}>
      {renderLineBlock(lines, 'single_col')}
    </div>
  );
};