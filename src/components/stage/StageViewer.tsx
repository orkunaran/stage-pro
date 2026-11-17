import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Song, Setlist, BandMember, MemberPreferences } from '../../types/song';
import { getScaleNotes, parseChordPro, permanentlyTransposeChordPro, transposeKey } from '../../utils/chordEngine';
import { SongRenderer } from '../common/SongRenderer';
import { DrawingCanvas } from './DrawingCanvas';
import { QuickJumpModal } from './QuickJumpModal';
import { 
  Edit3, ListMusic, Check, 
  Play, Pause, PenTool, 
  Sun, SunDim, Columns2, Columns, Search, SlidersHorizontal, X,
  ChevronLeft, ChevronRight, Undo2,
} from 'lucide-react';

interface StageViewerProps {
  song?: Song;
  activeSetlist?: Setlist | null;
  songsList?: Song[];
  // Hangi şarkının düzenleneceğini artık StageViewer belirleyip parametre
  // olarak veriyor — böylece App.tsx'teki "aktif şarkı" bilgisi, setlist
  // içinde nerede olunursa olunsun her zaman doğru şarkıyı gösterir.
  onEdit: (song: Song) => void;
  onBackToLibrary: () => void;
  onUpdateSong?: (updatedSong: Song) => void;
  onSelectSongDirectly?: (song: Song) => void;
  // Setlist içindeki "hangi şarkıdayım" konumu artık App.tsx'te (kalıcı)
  // tutuluyor, StageViewer'ın kendi iç hafızasında DEĞİL. Böylece:
  //  - "Düzenle" sonrası StageViewer yeniden kurulduğunda konum sıfırlanmaz,
  //    kaldığı şarkıda kalır,
  //  - ama yeni bir setlist BAŞLATILDIĞINDA (App.tsx bunu 0'a resetler)
  //    her zaman ilk şarkıdan başlar — ikisi birbirine karışmaz.
  setlistIndex?: number;
  onSetlistIndexChange?: (index: number) => void;
  // Kişiye özel görüntüleme tercihleri (punto, çift sütun, kaydırma hızı/
  // gecikmesi). Bu cihazda "kimin görüntülediği" seçilince, o kişinin
  // Supabase'de saklı tercihleri buradan okunur; değişiklik yapıldığında
  // da yine o kişinin kaydına geri yazılır — böylece tercih HANGİ cihaza
  // girilirse girilsin o kişiyi takip eder.
  members?: BandMember[];
  activeMemberId?: string | null;
  onSelectMember?: (id: string | null) => void;
  onUpdateMemberPreferences?: (memberId: string, prefs: Partial<MemberPreferences>) => void;
}

// Cihaza özel ton: her müzisyen kendi tonunu ayarlar, grubun diğer
// üyelerini etkilemez ve şarkı başına hatırlanır. Herkes için değiştirmek
// isteyen "Kalıcı Kaydet"i kullanır.
const transposeStorageKey = (songId: string) => `stage_transpose_${songId}`;
function readPersonalTranspose(songId?: string): number {
  if (!songId) return 0;
  try {
    const v = parseInt(localStorage.getItem(transposeStorageKey(songId)) || '0', 10);
    return isNaN(v) ? 0 : Math.max(-12, Math.min(12, v));
  } catch {
    return 0;
  }
}
function writePersonalTranspose(songId: string | undefined, value: number) {
  if (!songId) return;
  try {
    if (value === 0) localStorage.removeItem(transposeStorageKey(songId));
    else localStorage.setItem(transposeStorageKey(songId), String(value));
  } catch { /* yoksay */ }
}

const SLIDE_MS = 380;

export const StageViewer: React.FC<StageViewerProps> = ({ 
  song: singleSong, 
  activeSetlist, 
  songsList = [], 
  onEdit, 
  onBackToLibrary,
  onUpdateSong,
  onSelectSongDirectly,
  setlistIndex,
  onSetlistIndexChange,
  members = [],
  activeMemberId,
  onSelectMember,
  onUpdateMemberPreferences,
}) => {
  // Setlist konumu artık App.tsx'ten geliyor (controlled). Prop verilmemişse
  // (örn. tekil şarkı modu) 0 kabul edilir. Değiştirmek için parent'taki
  // setter'ı çağıran küçük bir yardımcı kullanılıyor.
  const currentSetlistIndex = setlistIndex ?? 0;
  const changeSetlistIndex = (newIndex: number) => {
    if (onSetlistIndexChange) onSetlistIndexChange(newIndex);
  };

  const itemsCount = activeSetlist?.items.length || 0;
  // Setlist dışından hızlı aramayla açılan şarkı: setlistteki konum korunur.
  const [detourSongId, setDetourSongId] = useState<string | null>(null);

  let currentSong: Song | undefined = singleSong;
  let currentBreakTitle = '';
  let isMissingSong = false;

  if (activeSetlist && itemsCount > 0) {
    const currentItem = activeSetlist.items[Math.min(currentSetlistIndex, itemsCount - 1)];
    currentSong = undefined;
    if (currentItem?.type === 'break') {
      currentBreakTitle = currentItem.breakTitle || 'Konser Arası';
    } else if (currentItem?.type === 'song') {
      // Şarkı arşivden silinmişse başka bir şarkı göstermek yerine uyarı göster.
      currentSong = songsList.find(s => s.id === currentItem.songId);
      if (!currentSong) isMissingSong = true;
    }
    if (detourSongId) {
      const detour = songsList.find(s => s.id === detourSongId);
      if (detour) {
        currentSong = detour;
        currentBreakTitle = '';
        isMissingSong = false;
      }
    }
  }
  const showsSong = !!currentSong && !currentBreakTitle && !isMissingSong;

  // Setlist kısalırsa (ör. başka cihazdan öğe silindi) konumu sınırla.
  useEffect(() => {
    if (itemsCount > 0 && currentSetlistIndex > itemsCount - 1) changeSetlistIndex(itemsCount - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsCount, currentSetlistIndex]);

  const currentSongIdRef = useRef<string | undefined>(currentSong?.id);
  currentSongIdRef.current = currentSong?.id;

  // Aktif kişi (bu cihazda "kimin görüntülediği" App.tsx'te seçilir).
  // Tercihler öncelikle bu kişinin Supabase'de saklı kaydından okunur;
  // kişi seçilmemişse ya da o kişinin henüz bir tercihi yoksa, cihazın
  // kendi localStorage'ına (ya da sabit varsayılana) düşülür.
  const activeMember = members.find(m => m.id === activeMemberId) || null;

  const [transpose, setTransposeState] = useState(() => readPersonalTranspose(currentSong?.id));
  const setTranspose = (updater: number | ((prev: number) => number)) => {
    setTransposeState(prev => {
      const next = typeof updater === 'function' ? (updater as (p: number) => number)(prev) : updater;
      writePersonalTranspose(currentSongIdRef.current, next);
      return next;
    });
  };
  const [fontSize, setFontSizeState] = useState(() => {
    if (activeMember?.preferences?.fontSize !== undefined) return activeMember.preferences.fontSize;
    const saved = localStorage.getItem('stage_font_size');
    return saved ? parseInt(saved, 10) : 22;
  });
  const [isTwoColumn, setIsTwoColumnState] = useState(() => {
    if (activeMember?.preferences?.isTwoColumn !== undefined) return activeMember.preferences.isTwoColumn;
    return localStorage.getItem('stage_two_column') === 'true';
  });

  // Ekran genişliğini canlı takip ediyoruz (döndürme/pencere yeniden
  // boyutlandırma dahil) — "İki Sütun" görünümü dar (telefon) ekranlarda
  // ciddi uyum sorunlarına yol açıyordu: iki sütun içerik yüksekliğine göre
  // değil SATIR SAYISINA göre bölündüğü için, kısa bir "Intro" bloğu ile
  // uzun bir mısra farklı sütunlarda yükseklik olarak hizasız kalıyor,
  // ayrıca her sütuna ayrılan dar genişlikte akor tablosu (grid) ölçüleri
  // sığmayıp taşabiliyordu. Bu yüzden dar ekranlarda kullanıcının tercihi
  // saklı kalır ama görünüme UYGULANMAZ — ekran genişleyince (yatay mod,
  // tablet vb.) otomatik olarak geri döner.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    let settleTimer: number | null = null;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
      // Mobil tarayıcılarda `orientationchange` anında window.innerWidth
      // bazen henüz eski (döndürme öncesi) değeri veriyor — viewport tam
      // oturduktan kısa bir süre sonra tekrar okuyup emin oluyoruz.
      if (settleTimer) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => setViewportWidth(window.innerWidth), 300);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (settleTimer) window.clearTimeout(settleTimer);
    };
  }, []);
  const isNarrowScreenForColumns = viewportWidth < 820;
  const effectiveTwoColumn = isTwoColumn && !isNarrowScreenForColumns;

  const [tempo, setTempo] = useState(currentSong?.tempo || 100);
  const [tempoInput, setTempoInput] = useState(String(currentSong?.tempo || 100));
  const [timeSignature, setTimeSignature] = useState(currentSong?.timeSignature || '4/4');
  const [isMetronomeOn, setIsMetronomeOn] = useState(false);
  const [currentBeat, setCurrentBeat] = useState(0);
  const [isPulseActive, setIsPulseActive] = useState(false);

  // Yavaş Şarkı Geçiş Animasyonu Durumu
  const [slideDirection, setSlideDirection] = useState<'idle' | 'sliding-left' | 'sliding-right'>('idle');

  // Modallar
  const [isQuickJumpOpen, setIsQuickJumpOpen] = useState(false);
  const [isToolsModalOpen, setIsToolsModalOpen] = useState(false);

  // Wake Lock
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);
  const wakeLockSentinelRef = useRef<any>(null);

  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [contentHeight, setContentHeight] = useState(800);
  const [contentWidth, setContentWidth] = useState(900);

  const tapTimesRef = useRef<number[]>([]);
  const beatsPerMeasure = parseInt(timeSignature.split('/')[0]) || 4;

  // Otomatik Kaydırma ve Gecikme (Delay) State'leri
  const [isScrolling, setIsScrolling] = useState(false);
  const [isScrollWaitingDelay, setIsScrollWaitingDelay] = useState(false);
  const [scrollSpeed, setScrollSpeedState] = useState(() => {
    if (activeMember?.preferences?.scrollSpeed !== undefined) return activeMember.preferences.scrollSpeed;
    const saved = localStorage.getItem('stage_scroll_speed');
    return saved ? parseFloat(saved) : 1;
  });
  // Kaydırmaya başlamadan önceki bekleme süresi (ms) — eskiden sabit 10
  // saniyeydi ("bazen çok uzun bazen çok az" şikayeti üzerine artık
  // ayarlanabilir ve tercih kişiye göre (Supabase, yoksa localStorage'da)
  // saklanıyor.
  const [scrollStartDelay, setScrollStartDelayState] = useState(() => {
    if (activeMember?.preferences?.scrollStartDelayMs !== undefined) return activeMember.preferences.scrollStartDelayMs;
    const saved = localStorage.getItem('stage_scroll_start_delay');
    return saved ? parseInt(saved, 10) : 10000;
  });

  // Seçili kişi DEĞİŞTİĞİNDE (ilk kurulumdan sonra bile) dört tercihi de o
  // kişinin kaydından yeniden yükle — `useState`'in tembel başlatıcısı
  // sadece bileşen ilk kurulurken çalışır, kişi sonradan değiştirilirse bu
  // effect devreye girer.
  useEffect(() => {
    if (!activeMember) return;
    if (activeMember.preferences?.fontSize !== undefined) setFontSizeState(activeMember.preferences.fontSize);
    if (activeMember.preferences?.isTwoColumn !== undefined) setIsTwoColumnState(activeMember.preferences.isTwoColumn);
    if (activeMember.preferences?.scrollSpeed !== undefined) setScrollSpeedState(activeMember.preferences.scrollSpeed);
    if (activeMember.preferences?.scrollStartDelayMs !== undefined) setScrollStartDelayState(activeMember.preferences.scrollStartDelayMs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMemberId]);

  // Bu dört ayardan biri değiştiğinde: cihazda localStorage'a (kişi
  // seçilmemişse yedek olarak) yaz, kişi seçiliyse Supabase'deki kaydına
  // da geri yaz — böylece tercih hangi cihaza girilirse girilsin o kişiyi
  // takip eder.
  const persistPreference = (patch: Partial<MemberPreferences>) => {
    if (activeMemberId && onUpdateMemberPreferences) {
      onUpdateMemberPreferences(activeMemberId, patch);
    }
  };

  const setScrollSpeed = (updater: number | ((prev: number) => number)) => {
    setScrollSpeedState(prev => {
      const next = typeof updater === 'function' ? (updater as (p: number) => number)(prev) : updater;
      localStorage.setItem('stage_scroll_speed', String(next));
      persistPreference({ scrollSpeed: next });
      return next;
    });
  };

  const handleScrollStartDelayChange = (ms: number) => {
    setScrollStartDelayState(ms);
    localStorage.setItem('stage_scroll_start_delay', String(ms));
    persistPreference({ scrollStartDelayMs: ms });
  };
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentWrapperRef = useRef<HTMLDivElement>(null);
  // Yalnızca şarkı başlığı + sözleri saran kutu: not tuvalinin boyutu buradan
  // ölçülür (tuvalin kendisi ölçüme karışmaz; uzun şarkıdan kısa şarkıya
  // geçince boş kaydırma alanı kalmaz).
  const contentMeasureRef = useRef<HTMLDivElement>(null);
  const pulseTimeoutRef = useRef<number | null>(null);
  const delayTimerRef = useRef<number | null>(null);

  // Wake Lock
  const requestWakeLock = useCallback(async () => {
    if (typeof window !== 'undefined' && 'wakeLock' in navigator) {
      try {
        const lock = await (navigator as any).wakeLock.request('screen');
        wakeLockSentinelRef.current = lock;
        setIsWakeLockActive(true);
        lock.addEventListener('release', () => setIsWakeLockActive(false));
      } catch {
        setIsWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockSentinelRef.current) {
      await wakeLockSentinelRef.current.release();
      wakeLockSentinelRef.current = null;
      setIsWakeLockActive(false);
    }
  }, []);

  useEffect(() => {
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      releaseWakeLock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [requestWakeLock, releaseWakeLock]);

  const toggleWakeLock = () => {
    if (isWakeLockActive) releaseWakeLock();
    else requestWakeLock();
  };

  const toggleTwoColumn = () => {
    setIsTwoColumnState(prev => {
      const next = !prev;
      localStorage.setItem('stage_two_column', String(next));
      persistPreference({ isTwoColumn: next });
      return next;
    });
  };

  const handleFontSizeChange = useCallback((delta: number) => {
    setFontSizeState(prev => {
      const next = Math.max(12, Math.min(42, prev + delta));
      localStorage.setItem('stage_font_size', String(next));
      persistPreference({ fontSize: next });
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMemberId]);

  useEffect(() => {
    const el = contentMeasureRef.current;
    if (!el) return;
    const measure = () => {
      setContentHeight(Math.ceil(el.offsetHeight + fontSize * 5));
      setContentWidth(Math.ceil(el.offsetWidth) || 900);
    };

    // NOT: Önceden bu ölçüm sadece belirli state'ler (şarkı, ton, punto,
    // sütun modu) değişince bir useEffect ile yapılıyordu. Sorun: hangi
    // tetikleyicilerin "boyutu etkileyebileceğini" tek tek tahmin etmek
    // gerekiyordu ve ekran döndürme gibi bazı durumlar (özellikle iPad'de
    // tek sütundan iki sütuna geçerken) bu listeye tam yansımayınca ölçüm
    // eski kalıyor, kaydırılabilir alan ya gereksiz uzun (altta boşluk)
    // ya da GEREKENDEN KISA (bazı sözler görünmüyor, sayfa "belirli bir
    // yerde kalıyor") oluyordu. `ResizeObserver` ile bu tahmine hiç gerek
    // kalmıyor: içerik kutusunun GERÇEK boyutu her değiştiğinde (döndürme,
    // sütun değişimi, punto, klavye açılması, tarayıcı çubuğu vb. HER
    // sebep) otomatik ve doğru şekilde tetiklenir.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, [currentSong?.id, effectiveTwoColumn, showsSong, fontSize]);

  // ---------- Setlist gezintisi (klavye, kaydırma ve düğmeler ortak) ----------
  const goTo = (dir: 1 | -1) => {
    if (!activeSetlist || itemsCount === 0 || slideDirection !== 'idle') return;
    // Setlist dışı bir şarkıdaysak önce setlistteki yerimize dön.
    if (detourSongId) {
      setDetourSongId(null);
      return;
    }
    const target = currentSetlistIndex + dir;
    if (target < 0 || target > itemsCount - 1) return;
    setSlideDirection(dir === 1 ? 'sliding-left' : 'sliding-right');
    window.setTimeout(() => {
      changeSetlistIndex(target);
      setSlideDirection('idle');
    }, SLIDE_MS);
  };
  const canGoPrev = !!activeSetlist && itemsCount > 0 && (detourSongId ? true : currentSetlistIndex > 0);
  const canGoNext = !!activeSetlist && itemsCount > 0 && (detourSongId ? true : currentSetlistIndex < itemsCount - 1);
  const nextItemLabel = (() => {
    if (!activeSetlist) return '';
    if (detourSongId) return 'Setliste dön';
    const next = activeSetlist.items[currentSetlistIndex + 1];
    if (!next) return '';
    if (next.type === 'break') return next.breakTitle || 'Ara';
    return songsList.find(s => s.id === next.songId)?.title || 'Silinmiş şarkı';
  })();
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  // Klavye Kısayolları (Animasyonlu Şarkı Geçişi Entegre Edildi)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsQuickJumpOpen(prev => !prev);
        return;
      }
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        toggleScrolling();
      } else if (e.code === 'ArrowRight' && canGoNext) {
        e.preventDefault();
        goToRef.current(1);
      } else if (e.code === 'ArrowLeft' && canGoPrev) {
        e.preventDefault();
        goToRef.current(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSetlist, currentSetlistIndex, isScrolling, slideDirection, canGoNext, canGoPrev]);

  // Dokunmatik Jestler (Pinch Zoom ve Yavaş Swipe Geçişi)
  const touchStartXRef = useRef<number>(0);
  const touchEndXRef = useRef<number>(0);
  // Dikey hareketi de izliyoruz — SADECE X'e bakıldığında, hızlı bir aşağı
  // kaydırma sırasında parmağın biraz yana kayması bile (çok normal bir
  // durum) 70px eşiğini geçip yanlışlıkla şarkı değiştirebiliyordu. Artık
  // yatay hareket dikey hareketten BELİRGİN ŞEKİLDE baskın değilse (bkz.
  // handleTouchEnd'deki oran kontrolü) şarkı değişimi hiç tetiklenmiyor.
  const touchStartYRef = useRef<number>(0);
  const touchEndYRef = useRef<number>(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const initialFontSizeRef = useRef<number>(fontSize);
  const isTouchOnContentRef = useRef<boolean>(false);

  const getDistance = (t1: React.Touch, t2: React.Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDrawingMode || isToolsModalOpen || slideDirection !== 'idle') return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-no-swipe]')) {
      isTouchOnContentRef.current = false;
      return;
    }
    isTouchOnContentRef.current = true;

    if (e.touches.length === 2) {
      pinchStartDistRef.current = getDistance(e.touches[0], e.touches[1]);
      initialFontSizeRef.current = fontSize;
    } else if (e.touches.length === 1) {
      touchStartXRef.current = e.targetTouches[0].clientX;
      touchEndXRef.current = e.targetTouches[0].clientX;
      touchStartYRef.current = e.targetTouches[0].clientY;
      touchEndYRef.current = e.targetTouches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isTouchOnContentRef.current || isDrawingMode || isToolsModalOpen || slideDirection !== 'idle') return;

    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const currentDist = getDistance(e.touches[0], e.touches[1]);
      const diff = currentDist - pinchStartDistRef.current;
      const step = Math.round(diff / 25);
      const targetSize = Math.max(12, Math.min(42, initialFontSizeRef.current + step));
      setFontSizeState(targetSize);
      localStorage.setItem('stage_font_size', String(targetSize));
    } else if (e.touches.length === 1) {
      touchEndXRef.current = e.targetTouches[0].clientX;
      touchEndYRef.current = e.targetTouches[0].clientY;
    }
  };

  const handleTouchEnd = () => {
    if (!isTouchOnContentRef.current) return;
    const wasPinching = pinchStartDistRef.current !== null;
    pinchStartDistRef.current = null;
    if (wasPinching) {
      // Pinch-zoom sırasında her hareket tetiklemesinde Supabase'e yazmak
      // yerine, jest bittiğinde SADECE BİR KEZ nihai punto değerini
      // kişinin kaydına gönderiyoruz.
      persistPreference({ fontSize });
    }
    isTouchOnContentRef.current = false;
    // İki parmakla yakınlaştırma şarkı değiştirmesin.
    if (wasPinching) return;
    if (!activeSetlist || isDrawingMode || isToolsModalOpen || slideDirection !== 'idle') return;

    const distanceX = touchStartXRef.current - touchEndXRef.current;
    const distanceY = touchStartYRef.current - touchEndYRef.current;

    // Yalnızca belirgin (en az 80 px) ve ağırlıklı olarak YATAY bir kaydırma
    // şarkı değiştirir: yatay hareket dikeyin en az 2 katı olmalı. Sözleri
    // aşağı kaydırırken eğik giden parmak şarkıyı değiştirmez.
    if (Math.abs(distanceX) < 80 || Math.abs(distanceX) <= Math.abs(distanceY) * 2) return;
    if (distanceX > 0 && canGoNext) goTo(1);
    else if (distanceX < 0 && canGoPrev) goTo(-1);
  };

  // Şarkı Değiştiğinde Çalışacak Mantık
  useEffect(() => {
    if (currentSong) {
      const songTempo = currentSong.tempo || 100;
      setTempo(songTempo);
      setTempoInput(String(songTempo));
      setTimeSignature(currentSong.timeSignature || '4/4');
      setTransposeState(readPersonalTranspose(currentSong.id));
      setIsDrawingMode(false);

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = 0;
      }

      if (isScrolling && showsSong) {
        if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
        setIsScrollWaitingDelay(true);
        delayTimerRef.current = window.setTimeout(() => {
          setIsScrollWaitingDelay(false);
        }, scrollStartDelay);
      }
    }
  }, [currentSetlistIndex, currentSong?.id, detourSongId]);

  const toggleScrolling = () => {
    if (isScrolling) {
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      setIsScrolling(false);
      setIsScrollWaitingDelay(false);
    } else {
      setIsScrolling(true);
      setIsScrollWaitingDelay(true);
      if (delayTimerRef.current) clearTimeout(delayTimerRef.current);
      delayTimerRef.current = window.setTimeout(() => {
        setIsScrollWaitingDelay(false);
      }, scrollStartDelay);
    }
  };

  // Metronom Nabzı
  useEffect(() => {
    if (!isMetronomeOn) {
      setCurrentBeat(0);
      setIsPulseActive(false);
      return;
    }
    const intervalMs = (60 / tempo) * 1000;
    const timer = window.setInterval(() => {
      setCurrentBeat(prev => (prev + 1) % beatsPerMeasure);
      setIsPulseActive(true);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      pulseTimeoutRef.current = window.setTimeout(() => setIsPulseActive(false), 140);
    }, intervalMs);

    return () => {
      clearInterval(timer);
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    };
  }, [isMetronomeOn, tempo, beatsPerMeasure]);

  const handleTap = useCallback(() => {
    const now = performance.now();
    const times = tapTimesRef.current;
    if (times.length > 0 && now - times[times.length - 1] > 2000) {
      tapTimesRef.current = [now];
      return;
    }
    times.push(now);
    if (times.length > 4) times.shift();
    if (times.length > 1) {
      const intervals = [];
      for (let i = 1; i < times.length; i++) intervals.push(times[i] - times[i - 1]);
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / avgInterval);
      if (calculatedBpm >= 40 && calculatedBpm <= 240) {
        setTempo(calculatedBpm);
        setTempoInput(String(calculatedBpm));
      }
    }
  }, []);

  const handleTempoInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTempoInput(raw);
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val > 0) setTempo(val);
  };

  const handleTempoInputBlur = () => {
    let val = parseInt(tempoInput, 10);
    if (isNaN(val) || val < 40) val = 40;
    if (val > 240) val = 240;
    setTempo(val);
    setTempoInput(String(val));
  };

  // Otomatik Kaydırma Motoru — hız SANİYE başına piksel olarak hesaplanır;
  // 60 Hz telefon ile 120 Hz iPad aynı hızda kaydırır (eskiden kare başına
  // hesaplandığı için yüksek tazeleme hızlı ekranlarda iki kat hızlıydı).
  useEffect(() => {
    if (!isScrolling || isScrollWaitingDelay || !showsSong) return;
    let animationId = 0;
    let last: number | null = null;
    let accumulated = 0;
    const pxPerSecond = ((tempo * 0.3) / 100) * scrollSpeed * 60;

    const step = (ts: number) => {
      const el = scrollContainerRef.current;
      if (!el) return;
      if (last === null) last = ts;
      const dt = Math.min(ts - last, 100);
      last = ts;
      accumulated += (pxPerSecond * dt) / 1000;
      if (accumulated >= 1) {
        const px = Math.floor(accumulated);
        el.scrollTop += px;
        accumulated -= px;
      }
      animationId = requestAnimationFrame(step);
    };
    animationId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationId);
  }, [isScrolling, isScrollWaitingDelay, scrollSpeed, tempo, showsSong]);

  const hasChanges = Boolean(currentSong && (transpose !== 0 || tempo !== currentSong.tempo));

  const handleSavePermanently = () => {
    if (!currentSong || !hasChanges) return;

    let newBaseKey = currentSong.baseKey;
    let newRawChordPro = currentSong.rawChordPro;

    if (transpose !== 0) {
      newBaseKey = keyInfo.name;
      newRawChordPro = permanentlyTransposeChordPro(currentSong.rawChordPro, transpose, keyInfo.preferFlat);
    }

    const updatedSong: Song = {
      ...currentSong,
      baseKey: newBaseKey,
      rawChordPro: newRawChordPro,
      tempo: tempo,
      updatedAt: Date.now(),
    };

    if (onUpdateSong) onUpdateSong(updatedSong);
    setTranspose(0);
    setIsToolsModalOpen(false);
  };

  const handleSaveDrawing = (drawingJson: string) => {
    if (!currentSong || !onUpdateSong) return;
    onUpdateSong({
      ...currentSong,
      drawingData: drawingJson,
      updatedAt: Date.now(),
    });
  };

  // Hedef ton bemollü bir tonsa (F, Bb, Dm, Gm...) akorlar da bemolle yazılır.
  const keyInfo = transposeKey(currentSong?.baseKey, transpose);
  const currentKey = currentSong ? keyInfo.name : '';

  const effectiveScaleType = currentSong?.scaleType || (keyInfo.isMinor ? 'Aeolian (Minor)' : 'Ionian (Major)');
  const currentScale = getScaleNotes(keyInfo.root, effectiveScaleType);
  const parsedContent = showsSong && currentSong ? parseChordPro(currentSong.rawChordPro, transpose, keyInfo.preferFlat) : [];

  const beatColor = currentBeat === 0 ? '#fbbf24' : '#ef4444';

  return (
    <div 
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh', 
        width: '100vw',
        maxWidth: '100vw',
        backgroundColor: '#0a0a0c', 
        color: '#f3f4f6', 
        userSelect: 'none', 
        overflow: 'hidden',
        position: 'relative',
        boxShadow: isMetronomeOn && isPulseActive ? `inset 0 0 24px ${beatColor}` : 'none',
        transition: 'box-shadow 0.08s ease-out'
      }}
    >
      {/* Canlı Metronom Nabız Çubuğu */}
      {isMetronomeOn && (
        <div style={{
          height: '4px',
          width: '100%',
          backgroundColor: isPulseActive ? beatColor : '#18181b',
          boxShadow: isPulseActive ? `0 0 16px ${beatColor}` : 'none',
          transition: 'background-color 0.08s ease-out',
          zIndex: 100
        }} />
      )}

      {/* Üst Bar */}
      <div 
        data-no-swipe="true"
        style={{ 
          background: '#121216', 
          borderBottom: '1px solid #27272a', 
          padding: '8px 12px',
          paddingTop: 'max(8px, env(safe-area-inset-top))',
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          minHeight: '54px', 
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '100vw'
        }}
      >
        {/* Sol Kısım */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <button
            onClick={onBackToLibrary}
            style={{ background: '#27272a', color: '#fff', border: 'none', padding: '7px 11px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 'bold' }}
            title="Arşive Dön"
          >
            <ListMusic size={16} /> <span style={{ display: window.innerWidth < 520 ? 'none' : 'inline' }}>Arşiv</span>
          </button>

          {activeSetlist && (
            <span style={{ 
              fontSize: '12px', 
              background: '#18181b', 
              color: '#fbbf24', 
              fontWeight: 'bold', 
              padding: '5px 9px', 
              borderRadius: '6px', 
              border: '1px solid #3f3f46' 
            }}>
              {detourSongId ? 'Setlist dışı' : `#${Math.min(currentSetlistIndex, Math.max(itemsCount - 1, 0)) + 1}/${itemsCount}`}
            </span>
          )}

          <div style={{ minWidth: 0, overflow: 'hidden', paddingLeft: '2px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#fff' }}>
              {currentBreakTitle ? 'ARAYA GİRİLDİ' : isMissingSong ? 'Silinmiş şarkı' : (currentSong?.title || 'Şarkı Yok')}
            </div>
            <div style={{ fontSize: '11px', color: '#a1a1aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: '6px' }}>
              {showsSong && (
                <button
                  onClick={(e) => { e.stopPropagation(); setTranspose(t => Math.max(-12, t - 1)); }}
                  title="Yarım Ton Aşağı"
                  style={{ background: '#27272a', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', fontSize: '17px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}
                >
                  −
                </button>
              )}
              <strong style={{ color: '#fbbf24', fontSize: '13px' }}>{currentKey}</strong>
              {showsSong && (
                <button
                  onClick={(e) => { e.stopPropagation(); setTranspose(t => Math.min(12, t + 1)); }}
                  title="Yarım Ton Yukarı"
                  style={{ background: '#27272a', color: '#fff', border: 'none', width: '28px', height: '28px', borderRadius: '7px', cursor: 'pointer', fontSize: '17px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1, flexShrink: 0 }}
                >
                  +
                </button>
              )}
              {showsSong && <span>• {tempo} BPM</span>}
              {showsSong && transpose !== 0 && <span style={{ color: '#38bdf8' }}>• kişisel ton</span>}
            </div>
          </div>
        </div>

        {/* Sağ Kısım */}
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsMetronomeOn(!isMetronomeOn);
            }}
            style={{
              background: isMetronomeOn 
                ? (isPulseActive ? beatColor : '#1e1e24') 
                : '#18181b',
              color: isMetronomeOn ? (isPulseActive && currentBeat === 0 ? '#000' : '#fff') : '#a1a1aa',
              border: isMetronomeOn ? `2px solid ${beatColor}` : '1px solid #3f3f46',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: isMetronomeOn && isPulseActive ? `0 0 14px ${beatColor}` : 'none',
              transform: isMetronomeOn && isPulseActive ? 'scale(1.05)' : 'scale(1)',
              transition: 'all 0.08s ease-out'
            }}
            title="Metronomu Başlat / Durdur"
          >
            <div style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              backgroundColor: isMetronomeOn ? (isPulseActive ? '#fff' : beatColor) : '#52525b' 
            }} />
            <span>{tempo} BPM</span>
            {isMetronomeOn && (
              <span style={{ fontSize: '11px', opacity: 0.9 }}>
                ({currentBeat + 1}/{beatsPerMeasure})
              </span>
            )}
          </button>

          {/* Hızlı Punto Ayarı — Düzenle menüsündeki ayarla senkron, aynı localStorage anahtarını kullanır */}
          <div style={{ display: 'flex', alignItems: 'center', background: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => handleFontSizeChange(-2)}
              title="Yazıyı Küçült"
              style={{ background: 'transparent', color: '#fff', border: 'none', padding: '8px 7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '11px', lineHeight: 1 }}
            >
              A−
            </button>
            <div style={{ width: '1px', alignSelf: 'stretch', background: '#3f3f46' }} />
            <button
              onClick={() => handleFontSizeChange(2)}
              title="Yazıyı Büyüt"
              style={{ background: 'transparent', color: '#fff', border: 'none', padding: '8px 7px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', lineHeight: 1 }}
            >
              A+
            </button>
          </div>

          <button
            onClick={() => setIsQuickJumpOpen(true)}
            style={{ background: '#18181b', color: '#fbbf24', border: '1px solid #3f3f46', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
            title="Şarkı Bul"
          >
            <Search size={15} />
          </button>

          {/* Ton/Tempo değişince üst çubukta doğrudan kaydet imkânı — büyük
              "Düzenle" panelini açmaya gerek kalmadan tek dokunuşla kaydedilir. */}
          {hasChanges && (
            <button
              onClick={handleSavePermanently}
              title={`Yeni Tonu (${currentKey}) ve BPM'i Kalıcı Kaydet`}
              style={{
                background: '#059669',
                color: '#fff',
                border: 'none',
                padding: '8px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <Check size={15} /> <span style={{ display: window.innerWidth < 640 ? 'none' : 'inline' }}>Kaydet</span>
            </button>
          )}

          <button
            onClick={() => setIsToolsModalOpen(true)}
            style={{
              background: hasChanges ? '#059669' : '#27272a',
              color: '#fff',
              border: '1px solid #3f3f46',
              padding: '7px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <SlidersHorizontal size={14} /> Düzenle
          </button>
        </div>
      </div>

      {/* Setlist dışı şarkı uyarısı */}
      {detourSongId && activeSetlist && (
        <div
          data-no-swipe="true"
          style={{ background: '#1c1917', borderBottom: '1px solid #d97706', padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px' }}
        >
          <span style={{ color: '#fbbf24' }}>Setlist dışında bir şarkı açık. Setlistteki yeriniz korunuyor.</span>
          <button
            onClick={() => setDetourSongId(null)}
            style={{ background: '#d97706', color: '#000', border: 'none', borderRadius: '6px', padding: '4px 10px', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
          >
            <Undo2 size={13} /> Setliste dön (#{currentSetlistIndex + 1})
          </button>
        </div>
      )}

      {/* Şarkı İçeriği ve Sinematik Geçiş Efekti */}
      {currentBreakTitle || isMissingSong ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ textAlign: 'center', maxWidth: '520px' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px', color: isMissingSong ? '#ef4444' : '#fff' }}>
              {isMissingSong ? 'Bu şarkı arşivden silinmiş' : currentBreakTitle}
            </h1>
            <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.5 }}>
              {isMissingSong
                ? 'Setlistteki bu sıradaki şarkı artık repertuvarda yok. Setlist ekranından çıkarabilirsiniz.'
                : 'Sahne arası.'}
              {canGoNext && ' Sonrakine geçmek için ekranı sola kaydırın veya sağdaki oku kullanın.'}
            </p>
          </div>
        </div>
      ) : (
        <div 
          ref={scrollContainerRef} 
          style={{ 
            flex: 1, 
            overflowY: 'auto', 
            overflowX: 'hidden', 
            width: '100%', 
            maxWidth: effectiveTwoColumn ? '1400px' : '900px', 
            margin: '0 auto', 
            padding: '16px 14px', 
            boxSizing: 'border-box', 
            position: 'relative',
            touchAction: isDrawingMode ? 'none' : 'pan-y'
          }}
        >
          <div 
            ref={contentWrapperRef} 
            style={{ 
              position: 'relative', 
              width: '100%', 
              maxWidth: '100%', 
              overflowX: 'hidden',
              // --- YAVAŞ VE SİNEMATİK ŞARKI GEÇİŞİ ---
              opacity: slideDirection !== 'idle' ? 0.05 : 1,
              transform: slideDirection === 'sliding-left' 
                ? 'translateX(-60px)' 
                : slideDirection === 'sliding-right' 
                ? 'translateX(60px)' 
                : 'translateX(0)',
              transition: slideDirection !== 'idle' 
                ? 'opacity 0.4s cubic-bezier(0.25, 1, 0.5, 1), transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)' 
                : 'opacity 0.25s ease-out, transform 0.25s ease-out',
            }}
          >
            
            <div ref={contentMeasureRef}>
            {/* Şarkı Başlığı */}
            {currentSong && (
              <div style={{ 
                borderBottom: '1px solid #27272a', 
                paddingBottom: '12px', 
                marginBottom: '20px',
                textAlign: 'left'
              }}>
                <h1 style={{ 
                  margin: 0, 
                  fontSize: `${fontSize * 1.3}px`, 
                  fontWeight: 'bold', 
                  color: '#fbbf24',
                  letterSpacing: '0.5px' 
                }}>
                  {currentSong.title}
                </h1>
                <div style={{ 
                  fontSize: `${fontSize * 0.75}px`, 
                  color: '#a1a1aa', 
                  marginTop: '4px',
                  fontWeight: 'bold' 
                }}>
                  {currentSong.artist} • Ton: <span style={{ color: '#fff' }}>{currentKey}</span> • {effectiveScaleType} ({timeSignature})
                </div>
              </div>
            )}

            <SongRenderer lines={parsedContent} fontSize={fontSize} layoutMode="over" isTwoColumn={effectiveTwoColumn} />
            </div>

            {/* key: her şarkıda tuval sıfırdan kurulur; bir şarkının notları
                diğerine taşınmaz ve o şarkının kendi notları yüklenir. */}
            <DrawingCanvas
              key={currentSong?.id || 'no-song'}
              fontSize={fontSize}
              initialData={currentSong?.drawingData}
              onSave={handleSaveDrawing}
              containerHeight={contentHeight}
              containerWidth={contentWidth}
              isDrawingMode={isDrawingMode}
              onCloseDrawing={() => setIsDrawingMode(false)}
            />

            {/* +5 Satır Limit Tamponu */}
            <div style={{ height: `${fontSize * 5}px`, width: '100%' }} />
          </div>
        </div>
      )}

      {/* Setlist gezinme okları — ekranın iki yanında, dikey ortada; alttaki
          kaydırma kumandası ve kalem düğmesiyle çakışmaz. Fare, dokunmatik
          ve klavye kullanıcıları için. */}
      {activeSetlist && itemsCount > 0 && !isDrawingMode && (
        <>
          {canGoPrev && (
            <button
              data-no-swipe="true"
              onClick={() => goTo(-1)}
              title={detourSongId ? 'Setliste dön' : 'Önceki'}
              style={{ position: 'fixed', left: '4px', top: '50%', transform: 'translateY(-50%)', width: '34px', height: '64px', borderRadius: '10px', background: 'rgba(24, 24, 27, 0.6)', border: '1px solid rgba(63, 63, 70, 0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 45, opacity: 0.6, padding: 0 }}
            >
              <ChevronLeft size={22} />
            </button>
          )}
          {canGoNext && (
            <button
              data-no-swipe="true"
              onClick={() => goTo(1)}
              title={nextItemLabel ? (detourSongId ? nextItemLabel : `Sonraki: ${nextItemLabel}`) : 'Sonraki'}
              style={{ position: 'fixed', right: '4px', top: '50%', transform: 'translateY(-50%)', width: '34px', height: '64px', borderRadius: '10px', background: 'rgba(24, 24, 27, 0.6)', border: '1px solid rgba(63, 63, 70, 0.7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 45, opacity: 0.6, padding: 0 }}
            >
              <ChevronRight size={22} />
            </button>
          )}
        </>
      )}

      {/* Kalemle Not Al — SongbookPro'daki gibi ekranın üstünde yüzen, sözleri
          kapatmasın diye hafif transparan bir buton. Basılınca doğrudan çizim
          moduna geçer; "Düzenle" menüsündeki eşdeğeri de duruyor. */}
      {showsSong && !isDrawingMode && (
        <button
          data-no-swipe="true"
          onClick={() => setIsDrawingMode(true)}
          title="Kalemle Not Al"
          style={{
            position: 'fixed',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            left: '16px',
            width: '46px',
            height: '46px',
            borderRadius: '50%',
            background: 'rgba(24, 24, 27, 0.55)',
            border: '1px solid rgba(63, 63, 70, 0.65)',
            color: '#fbbf24',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            backdropFilter: 'blur(3px)',
            boxShadow: '0 6px 18px rgba(0,0,0,0.5)',
            opacity: 0.55,
            transition: 'opacity 0.15s ease',
            zIndex: 45,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.55'; }}
        >
          <PenTool size={18} />
        </button>
      )}

      {/* Otomatik Kaydırma Kumandası */}
      {showsSong && !isDrawingMode && (
        <div 
          data-no-swipe="true"
          style={{
            position: 'fixed',
            bottom: 'max(16px, env(safe-area-inset-bottom))',
            right: '16px',
            background: '#121216',
            border: '1px solid #3f3f46',
            borderRadius: '10px',
            padding: '6px 10px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.8)',
            zIndex: 50
          }}
        >
          <button
            onClick={toggleScrolling}
            style={{
              background: isScrolling 
                ? (isScrollWaitingDelay ? '#d97706' : '#ef4444') 
                : '#059669',
              color: '#fff',
              border: 'none',
              padding: '6px 12px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isScrolling ? <Pause size={14} /> : <Play size={14} />}
            {isScrolling 
              ? (isScrollWaitingDelay ? `${Math.round(scrollStartDelay / 1000)}s sonra akacak...` : 'Durdur') 
              : 'Kaydır'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderLeft: '1px solid #27272a', paddingLeft: '8px' }}>
            <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 'bold', minWidth: '30px', textAlign: 'center' }}>
              {scrollSpeed.toFixed(1)}x
            </span>
            <input
              type="range"
              min={0.2}
              max={3.0}
              step={0.1}
              value={scrollSpeed}
              onChange={(e) => setScrollSpeed(Number(e.target.value))}
              title="Kaydırma Hızı"
              style={{
                width: '90px',
                accentColor: '#fbbf24',
                cursor: 'pointer',
              }}
            />
          </div>
        </div>
      )}

      {/* POP-UP: DÜZENLEME & SAHNE AYARLARI */}
      {isToolsModalOpen && showsSong && (
        <div 
          onClick={() => setIsToolsModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(4px)',
            zIndex: 120,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '540px',
              background: '#121216',
              borderTopLeftRadius: '18px',
              borderTopRightRadius: '18px',
              border: '1px solid #3f3f46',
              padding: '20px',
              paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              boxSizing: 'border-box',
              maxHeight: '85vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
                Şarkı ve Sahne Ayarları
              </div>
              <button 
                onClick={() => setIsToolsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 0. Kimsin? — kişiye özel tercihler (punto, sütun, kaydırma
                hızı/gecikmesi) buradan seçilen kişinin Supabase kaydına
                yazılır ve okunur; hangi cihaza girerse girsin o kişiyi
                takip eder. */}
            {members.length > 0 && (
              <div style={{ background: '#18181b', padding: '12px', borderRadius: '10px', border: '1px solid #27272a' }}>
                <div style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold', marginBottom: '8px' }}>
                  Kimsin? <span style={{ fontWeight: 'normal', color: '#71717a' }}>(görüntüleme tercihlerin bu isimle kaydedilir)</span>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {members.map(m => (
                    <button
                      key={m.id}
                      onClick={() => onSelectMember && onSelectMember(m.id === activeMemberId ? null : m.id)}
                      style={{
                        background: m.id === activeMemberId ? '#38bdf8' : '#27272a',
                        color: m.id === activeMemberId ? '#0a0a0c' : '#fff',
                        border: 'none',
                        padding: '7px 14px',
                        borderRadius: '20px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        fontSize: '12px',
                      }}
                    >
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 1. Transpoze */}
            <div style={{ background: '#18181b', padding: '12px', borderRadius: '10px', border: '1px solid #27272a' }}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold', marginBottom: '8px' }}>
                Akor Tonu (Transpoze)
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button 
                  onClick={() => setTranspose(t => Math.max(-12, t - 1))}
                  style={{ background: '#27272a', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
                >
                  -
                </button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#fbbf24' }}>{currentKey}</div>
                  <div style={{ fontSize: '10px', color: '#71717a' }}>{transpose > 0 ? `+${transpose}` : transpose} yarım ton</div>
                </div>
                <button 
                  onClick={() => setTranspose(t => Math.min(12, t + 1))}
                  style={{ background: '#27272a', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}
                >
                  +
                </button>
              </div>

              <div style={{ fontSize: '11px', color: '#71717a', marginTop: '8px', lineHeight: 1.4 }}>
                Bu ton yalnızca bu cihazda geçerli ve şarkı başına hatırlanır; grubun diğer üyelerini etkilemez.
                Herkes için değiştirmek isterseniz "Kalıcı Kaydet" düğmesini kullanın.
              </div>

              <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid #27272a', display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: 'bold' }}>Gam ({effectiveScaleType}):</span>
                {currentScale.map((n, idx) => (
                  <span key={idx} style={{ background: '#0a0a0c', padding: '2px 5px', borderRadius: '4px', fontSize: '10px', color: '#38bdf8', fontFamily: 'monospace' }}>
                    {n}
                  </span>
                ))}
              </div>
            </div>

            {/* 2. Tempo & Metronom */}
            <div style={{ background: '#18181b', padding: '12px', borderRadius: '10px', border: '1px solid #27272a' }}>
              <div style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold', marginBottom: '8px' }}>
                Tempo (BPM) & Ölçü ({timeSignature})
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input 
                  type="text" 
                  inputMode="numeric"
                  value={tempoInput} 
                  onChange={handleTempoInputChange}
                  onBlur={handleTempoInputBlur}
                  style={{ width: '60px', background: '#0a0a0c', border: '1px solid #3f3f46', color: '#ef4444', textAlign: 'center', fontWeight: 'bold', borderRadius: '8px', fontSize: '16px', padding: '6px' }}
                />
                <button 
                  onClick={handleTap}
                  style={{ background: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '8px 14px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  TAP TEMPO
                </button>
                <div style={{ flex: 1, display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  {Array.from({ length: beatsPerMeasure }).map((_, b) => (
                    <div 
                      key={b} 
                      style={{
                        width: '12px', height: '12px', borderRadius: '50%',
                        backgroundColor: isMetronomeOn && currentBeat === b ? beatColor : '#27272a',
                        boxShadow: isMetronomeOn && currentBeat === b ? `0 0 8px ${beatColor}` : 'none'
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Görünüm */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div style={{ background: '#18181b', padding: '10px', borderRadius: '10px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 'bold' }}>Yazı Boyutu (Pinch Zoom)</span>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <button onClick={() => handleFontSizeChange(-2)} style={{ background: '#27272a', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>A-</button>
                  <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fbbf24' }}>{fontSize}px</span>
                  <button onClick={() => handleFontSizeChange(2)} style={{ background: '#27272a', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold' }}>A+</button>
                </div>
              </div>

              <div style={{ background: '#18181b', padding: '10px', borderRadius: '10px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 'bold' }}>Sayfa Düzeni</span>
                <button 
                  onClick={toggleTwoColumn}
                  style={{ background: '#27272a', color: isTwoColumn ? '#38bdf8' : '#fff', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  {isTwoColumn ? <Columns2 size={15} /> : <Columns size={15} />}
                  {isTwoColumn ? '2 Sütun' : 'Tek Sütun'}
                </button>
                {isTwoColumn && isNarrowScreenForColumns && (
                  <span style={{ fontSize: '10px', color: '#a1a1aa', lineHeight: 1.4 }}>
                    Ekran dar olduğu için şu an tek sütun gösteriliyor — telefonu yatay çevirin ya da tablet/bilgisayarda 2 sütun otomatik uygulanır. Tercihiniz kayıtlı kaldı.
                  </span>
                )}
              </div>
            </div>

            {/* 3b. Otomatik Kaydırma Ayarları */}
            <div style={{ background: '#18181b', padding: '10px', borderRadius: '10px', border: '1px solid #27272a', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: '#a1a1aa', fontWeight: 'bold' }}>Kaydırmaya Başlama Süresi</span>
                <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#fbbf24' }}>
                  {scrollStartDelay === 0 ? 'Anında' : `${(scrollStartDelay / 1000).toFixed(0)} sn`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={20000}
                step={1000}
                value={scrollStartDelay}
                onChange={(e) => handleScrollStartDelayChange(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#fbbf24', cursor: 'pointer' }}
              />
              <span style={{ fontSize: '10px', color: '#71717a', lineHeight: 1.4 }}>
                "Kaydır"a bastıktan sonra sözlerin kaymaya başlaması için beklenecek süre. 0'a çekerseniz hemen başlar.
              </span>
            </div>

            {/* 4. Ek Özellikler */}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setIsToolsModalOpen(false);
                  setIsDrawingMode(true);
                }}
                style={{ flex: 1, background: '#18181b', color: '#fbbf24', border: '1px solid #27272a', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <PenTool size={15} /> Kalemle Not Al
              </button>

              <button
                onClick={toggleWakeLock}
                style={{ flex: 1, background: '#18181b', color: isWakeLockActive ? '#059669' : '#a1a1aa', border: '1px solid #27272a', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                {isWakeLockActive ? <Sun size={15} /> : <SunDim size={15} />}
                {isWakeLockActive ? 'Ekran Açık' : 'Normal'}
              </button>
            </div>

            <button
              onClick={() => {
                setIsToolsModalOpen(false);
                if (currentSong) onEdit(currentSong);
              }}
              style={{ background: '#27272a', color: '#38bdf8', border: '1px solid #3f3f46', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
            >
              <Edit3 size={15} /> Şarkı Sözlerini & Akorları Düzenle
            </button>

            {hasChanges && (
              <button
                onClick={handleSavePermanently}
                style={{ background: '#059669', color: '#fff', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Check size={16} /> Tonu ({currentKey}) ve BPM'i herkes için Kalıcı Kaydet
              </button>
            )}
          </div>
        </div>
      )}

      {/* Hızlı Şarkı Arama Modalı */}
      <QuickJumpModal
        isOpen={isQuickJumpOpen}
        onClose={() => setIsQuickJumpOpen(false)}
        songs={songsList}
        onSelectSong={(selectedSong) => {
          if (activeSetlist) {
            // Şarkı setlistteyse oraya git (önce ileride olanı tercih et);
            // değilse setlistten çıkmadan geçici olarak aç.
            const items = activeSetlist.items;
            const forward = items.findIndex((it, i) => i >= currentSetlistIndex && it.type === 'song' && it.songId === selectedSong.id);
            const any = items.findIndex(it => it.type === 'song' && it.songId === selectedSong.id);
            const idx = forward >= 0 ? forward : any;
            if (idx >= 0) {
              setDetourSongId(null);
              changeSetlistIndex(idx);
            } else {
              setDetourSongId(selectedSong.id);
            }
          } else if (onSelectSongDirectly) {
            onSelectSongDirectly(selectedSong);
          }
        }}
      />
    </div>
  );
};