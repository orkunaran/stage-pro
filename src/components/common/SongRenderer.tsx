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

  // Ardışık akor tablosu (grid) satırlarını TEK bir CSS Grid tablosunda
  // birleştirip render eder — böylece her satırdaki ölçüler kendi içeriğine
  // göre değil, TÜM satırlar arasında paylaşılan sütun genişliğine göre
  // hizalanır (bir satırdaki "Em / F#m /" ölçüsü, altındaki satırdaki
  // "G / A /" ölçüsüyle aynı sütun genişliğini paylaşır, sınırlar alt alta
  // düzgünce hizalanır). Ek olarak her satırın kendi gridPrefix/gridSuffix'i
  // (örn. "x2" tekrar notu) için de sabit, paylaşılan bir sütun ayrılır.
  const renderGridRun = (gridLines: ParsedLine[], keyPrefix: string) => {
    const maxBars = Math.max(...gridLines.map(l => (l.bars || []).length));
    const hasAnyPrefix = gridLines.some(l => l.gridPrefix);
    const hasAnySuffix = gridLines.some(l => l.gridSuffix);

    // Sütun düzeni: [prefix?] [bar 1..maxBars] [suffix?]. Her hücreye
    // gridRow/gridColumn'u AÇIKÇA veriyoruz — DOM sırasına bırakılsaydı,
    // bir satırda diğerlerinden daha AZ ölçü olduğunda CSS Grid'in
    // otomatik yerleştirmesi bir sonraki satırın hücrelerini sola kaydırıp
    // tüm hizalamayı bozardı.
    const barColumnOffset = hasAnyPrefix ? 2 : 1;
    const columns = [
      ...(hasAnyPrefix ? ['max-content'] : []),
      ...Array(maxBars).fill('max-content'),
      ...(hasAnySuffix ? ['max-content'] : []),
    ].join(' ');

    return (
      <div
        key={keyPrefix}
        style={{
          display: 'grid',
          gridTemplateColumns: columns,
          columnGap: '4px',
          rowGap: '10px',
          marginBottom: '14px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          userSelect: 'none',
          pointerEvents: 'none',
          alignItems: 'center',
        }}
      >
        {gridLines.map((line, rowIdx) => {
          const gridRow = rowIdx + 1;
          const cells: React.ReactNode[] = [];

          if (hasAnyPrefix) {
            cells.push(
              <span
                key="prefix"
                style={{ gridRow, gridColumn: 1, fontSize: `${fontSize * 0.6}px`, color: '#71717a', whiteSpace: 'nowrap' }}
              >
                {line.gridPrefix || ''}
              </span>
            );
          }

          (line.bars || []).forEach((bar, barIdx) => {
            cells.push(
              <div key={`bar_${barIdx}`} style={{ gridRow, gridColumn: barColumnOffset + barIdx }}>
                {renderGridBarCell(bar, `inner_${barIdx}`)}
              </div>
            );
          });

          if (hasAnySuffix) {
            cells.push(
              <span
                key="suffix"
                style={{
                  gridRow,
                  gridColumn: barColumnOffset + maxBars,
                  fontSize: `${fontSize * 0.65}px`,
                  fontWeight: 'bold',
                  color: '#71717a',
                  background: line.gridSuffix ? '#18181b' : 'transparent',
                  border: line.gridSuffix ? '1px solid #27272a' : 'none',
                  borderRadius: '6px',
                  padding: line.gridSuffix ? '3px 10px' : 0,
                  whiteSpace: 'nowrap',
                  justifySelf: 'start',
                }}
              >
                {line.gridSuffix || ''}
              </span>
            );
          }

          return cells;
        })}
      </div>
    );
  };

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
        // Ölçüler (bars) ayrıştırılmışsa, ardışık grid satırlarını topla
        // (aralarında başka türde bir satır — boş satır, söz, başlık —
        // gelirse grup biter) ve hepsini TEK bir hizalı tabloda göster.
        if (line.bars && line.bars.length > 0) {
          const gridRun: ParsedLine[] = [];
          let runEnd = idx;
          while (
            runEnd < lineList.length &&
            lineList[runEnd].type === 'grid' &&
            lineList[runEnd].bars &&
            (lineList[runEnd].bars as string[][]).length > 0
          ) {
            gridRun.push(lineList[runEnd]);
            runEnd++;
          }

          elements.push(renderGridRun(gridRun, `${lineKey}_gridrun`));
          idx = runEnd;
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

      // Akorlu satır segmentasyonu
      const segments: { chord: string; text: string }[] = [];
      let currentPos = 0;

      if (chords[0].position > 0) {
        segments.push({
          chord: '',
          text: lyricsText.slice(0, chords[0].position),
        });
        currentPos = chords[0].position;
      }

      chords.forEach((c, cIdx) => {
        const nextPos = chords[cIdx + 1] ? chords[cIdx + 1].position : lyricsText.length;
        const textSlice = lyricsText.slice(c.position, Math.max(c.position, nextPos));

        segments.push({
          chord: c.chord,
          text: textSlice,
        });
        currentPos = nextPos;
      });

      if (currentPos < lyricsText.length) {
        segments.push({
          chord: '',
          text: lyricsText.slice(currentPos),
        });
      }

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
          {segments.map((seg, sIdx) => (
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