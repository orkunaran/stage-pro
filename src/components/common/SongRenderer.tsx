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

  // Bir tek grid satırının bar hücrelerini üretir. NOT: `whiteSpace:'nowrap'`
  // kaldırıldı ve token'lar kendi içinde `flexWrap` ile sarılabiliyor.
  // Sebep: bazı ölçülere (örn. "Gm Am C Bbmaj7 /") tek satırda birden çok
  // akor sığdırılıyor; bu tek ölçü kendi başına dar bir telefon ekranına
  // hiç sığmayabiliyordu ve satırlar arası kaydırma (bars arasındaki
  // flexWrap) bu durumda hiçbir işe yaramıyordu — tek bir ölçü kendi
  // içinde bölünemediği için doğrudan ekran dışına taşıyordu. Artık gerekli
  // olursa ölçü kutusunun kendisi (kenarlıkları bozulmadan) iki satıra
  // uzayabiliyor; bölünme SADECE token'lar (akor/"/") arasında olur, hiçbir
  // akorun kendisi asla ortadan bölünmez.
  const renderGridBarCell = (bar: string[], key: React.Key) => (
    <div
      key={key}
      style={{
        display: 'inline-flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${fontSize * 0.4}px`,
        padding: `${fontSize * 0.15}px ${fontSize * 0.55}px`,
        borderLeft: '2px solid #71717a',
        borderRight: '2px solid #71717a',
        maxWidth: '100%',
        boxSizing: 'border-box',
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
            whiteSpace: 'nowrap',
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

      wordRanges.forEach(([wStart, wEnd], wIdx) => {
        // NOT: Bir akorun konumu (özellikle "akor-sadece satır" birleşiminden
        // gelenlerde — bkz. chordEngine.ts) gerçek kelime aralıklarıyla tam
        // örtüşmeyebilir; bazı akorlar iki kelime ARASINDAKİ boşluğa denk
        // gelebilir. Önceden bu akorlar "hiçbir kelimeye ait değil" sayılıp
        // SESSİZCE KAYBOLUYORDU. Artık her kelime, bir SONRAKİ kelimenin
        // başlangıcına kadarki boşluğu da "yakalıyor" — böylece aralarda
        // kalan hiçbir akor kaybolmuyor (en kötü ihtimalle kelimenin hemen
        // sonuna, boşluk üzerine yerleşiyor ama görünür kalıyor). İlk kelime
        // için yakalama, satırın en başına (0) kadar genişletiliyor ki
        // baştaki girinti boşluğuna denk gelen bir akor da kaybolmasın.
        const captureStart = wIdx === 0 ? 0 : wStart;
        const isLastWord = wIdx === wordRanges.length - 1;
        const captureEnd = wordRanges[wIdx + 1] ? wordRanges[wIdx + 1][0] : lyricsText.length;
        // NOT: Son kelime için üst sınır dahil (<=) tutuluyor — satırın en
        // sonunda, hiç söz gelmeyen bir akor (örn. "sensin[Em]") tam olarak
        // metnin bittiği noktaya (lyricsText.length) denk gelir. Ortadaki
        // kelimeler için sıkı "<" kullanılmaya devam ediyor; aksi halde bir
        // sonraki kelimenin başına denk gelen bir akor HEM bu kelimeye HEM
        // bir sonrakine yakalanıp iki kez görünürdü.
        const chordsInWord = chords.filter(c =>
          c.position >= captureStart && (isLastWord ? c.position <= captureEnd : c.position < captureEnd)
        );
        const wordSegs: { chord: string; text: string }[] = [];

        if (chordsInWord.length === 0 || chordsInWord[0].position > captureStart) {
          const pieceEnd = chordsInWord.length > 0 ? chordsInWord[0].position : captureEnd;
          const leadText = lyricsText.slice(captureStart, pieceEnd);
          if (leadText || wIdx === 0) {
            wordSegs.push({ chord: '', text: leadText });
          }
        }
        chordsInWord.forEach((c, cIdx) => {
          const pieceEnd = chordsInWord[cIdx + 1] ? chordsInWord[cIdx + 1].position : captureEnd;
          wordSegs.push({ chord: c.chord, text: lyricsText.slice(c.position, pieceEnd) });
        });

        if (wordSegs.length > 0) {
          wordUnits.push({ segments: wordSegs });
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
    // NOT: Önceden satırlar SAYIYA göre ikiye bölünüyordu — bu, kısa bir
    // "Intro" bloğuyla uzun bir mısranın farklı sütunlarda yükseklik
    // olarak hizasız kalmasına yol açıyordu (ör. iPad'de "sayfa belirli
    // bir yerde kalıyor" şikayeti). Şimdi iki şeyi birden yapıyoruz:
    //  1) Her satıra, gerçek render yüksekliğine yakın bir TAHMİNİ AĞIRLIK
    //     veriyoruz (başlık, boş satır, akorlu söz, akor tablosu farklı
    //     ağırlıklarda) — böylece bölünme SAYIYA değil YÜKSEKLİĞE göre
    //     dengeleniyor.
    //  2) Bölünme noktasını, toplamın yarısına en yakın BÖLÜM BAŞLIĞINA
    //     (Verse/Chorus/vb.) "yapıştırıyoruz" — böylece bir bölüm asla
    //     ortadan kesilmiyor, ikinci sütun her zaman yeni bir başlıkla
    //     başlıyor.
    const estimateWeight = (line: ParsedLine): number => {
      if (line.type === 'comment') return 3;
      if (line.type === 'empty') return 1;
      if (line.type === 'grid') {
        const barCount = (line.bars || []).length || 1;
        // Dar bir sütunda bir sıraya kabaca 3 ölçü sığar varsayımıyla,
        // taşan ölçülerin alt satıra kayacağını da ağırlığa yansıtıyoruz.
        return Math.max(1, Math.ceil(barCount / 3)) * 2;
      }
      return (line.chords && line.chords.length > 0) ? 2 : 1;
    };

    const weights = lines.map(estimateWeight);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    const target = totalWeight / 2;

    // Bölüm başlığı satırlarının indekslerini topla — bunlar aday
    // bölünme noktaları (bir başlık, kendinden önceki bölümün bittiği,
    // yeni bölümün başladığı yer demektir).
    const sectionStartIndices = lines
      .map((line, i) => (line.type === 'comment' ? i : -1))
      .filter(i => i > 0); // İlk satırın kendisi başlıksa bölünme noktası olamaz (sol sütun boş kalır).

    let splitIndex: number;

    if (sectionStartIndices.length > 0) {
      // Kümülatif ağırlığı yarıya en yakın olan bölüm başlangıcını seç.
      let cumulative = 0;
      let bestIdx = sectionStartIndices[0];
      let bestDiff = Infinity;
      let sIdxPos = 0;
      for (let i = 0; i < lines.length; i++) {
        cumulative += weights[i];
        if (sIdxPos < sectionStartIndices.length && sectionStartIndices[sIdxPos] === i + 1) {
          const diff = Math.abs(cumulative - target);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestIdx = i + 1;
          }
          sIdxPos++;
        }
      }
      splitIndex = bestIdx;
    } else {
      // Bölüm başlığı hiç yoksa, en azından ağırlığa göre dengeli böl
      // (satır sayısına göre değil).
      let cumulative = 0;
      splitIndex = Math.ceil(lines.length / 2);
      for (let i = 0; i < lines.length; i++) {
        cumulative += weights[i];
        if (cumulative >= target) {
          splitIndex = i + 1;
          break;
        }
      }
    }

    // Bir sütun tamamen boş kalmasın diye sınırla.
    splitIndex = Math.max(1, Math.min(lines.length - 1, splitIndex));

    const leftLines = lines.slice(0, splitIndex);
    const rightLines = lines.slice(splitIndex);

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