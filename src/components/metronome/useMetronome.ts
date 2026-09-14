import { useState, useEffect, useCallback } from 'react';

/**
 * Görsel (sessiz) metronom hook'u.
 *
 * NOT: Bu dosya şu an uygulama içinde kullanılmıyor — StageViewer.tsx kendi
 * dahili beat sayacını taşıyor (aşağıya bakınız). Burada duruyor olması
 * gelecekte tekrar kullanılabilmesi için; ses üretimi bilinçli olarak
 * KALDIRILDI (önceki sürümde her vuruşta Web Audio API ile bip sesi
 * çalınıyordu — artık sadece görsel beat sayacı döndürüyor).
 */
export function useMetronome(bpm: number, beatsPerMeasure: number = 4) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);

  useEffect(() => {
    if (!isPlaying) {
      setCurrentBeat(0);
      return;
    }

    const intervalMs = (60 / bpm) * 1000;

    const interval = setInterval(() => {
      setCurrentBeat((prev) => (prev + 1) % beatsPerMeasure);
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, bpm, beatsPerMeasure]);

  const toggle = useCallback(() => setIsPlaying((prev) => !prev), []);

  return { isPlaying, currentBeat, toggle, setIsPlaying };
}
