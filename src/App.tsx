import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Song, Setlist, BandWorkspace, BandMember, MemberPreferences } from './types/song';
import { SongList } from './components/library/SongList';
import { SetlistManager } from './components/library/SetlistManager';
import { SongEditor } from './components/editor/SongEditor';
import { StageViewer } from './components/stage/StageViewer';
import { supabase } from './utils/supabase';
import { hashWorkspacePin, verifyWorkspacePin } from './utils/pin';
import { mergeWorkspaceData } from './utils/workspaceMerge';

const ACTIVE_WS_ID_KEY = 'stage_chordpro_active_ws_id';
// Bu cihazın katıldığı grupların kimlikleri. Açılışta yalnızca bunlar çekilir.
const JOINED_WS_IDS_KEY = 'stage_chordpro_joined_ws_ids';
// Son başarılı yüklemenin kopyası: internet yokken (örn. sahnede) salt okunur açılır.
const CACHE_KEY = 'stage_chordpro_cache_v1';

// ---------- yardımcılar ----------

// Supabase istemcisi tip üretimi olmadan kullanıldığı için tablo tipsiz ("any") ele alınıyor.
const workspacesTable = () => supabase.from('workspaces') as any;

function newWorkspaceId(): string {
  try {
    return 'ws_' + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  } catch {
    return 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
  }
}

function newSongId(): string {
  return 'song_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* depolama dolu / kapalı */ }
}

function loadJoinedWorkspaceIds(): string[] {
  try {
    const raw = safeGet(JOINED_WS_IDS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const merged = new Set(Array.isArray(list) ? list : []);
    // Eski sürümden gelen cihazlar: önceden yalnızca aktif grup tutuluyordu.
    const legacyActive = safeGet(ACTIVE_WS_ID_KEY);
    if (legacyActive) merged.add(legacyActive);
    return Array.from(merged);
  } catch {
    return [];
  }
}

function saveJoinedWorkspaceIds(ids: string[]) {
  safeSet(JOINED_WS_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function normalizeSong(s: any): Song {
  return {
    ...s,
    id: String(s?.id || newSongId()),
    title: s?.title || 'İsimsiz Şarkı',
    artist: s?.artist || 'Bilinmeyen Sanatçı',
    baseKey: s?.baseKey || 'Am',
    tempo: Number(s?.tempo) || 100,
    timeSignature: s?.timeSignature || '4/4',
    rawChordPro: s?.rawChordPro || '',
    updatedAt: Number(s?.updatedAt) || Date.now(),
  };
}

function normalizeSetlists(list: any): Setlist[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter(s => s && s.id)
    .map(s => ({ ...s, name: s.name || 'Setlist', items: Array.isArray(s.items) ? s.items : [] }));
}

function rowToWorkspace(row: any): BandWorkspace {
  return {
    id: row.id,
    name: row.name || 'Grup',
    songs: Array.isArray(row.data?.songs) ? row.data.songs.map(normalizeSong) : [],
    setlists: normalizeSetlists(row.data?.setlists),
    members: Array.isArray(row.data?.members) ? row.data.members : [],
    pinHash: row.pin_hash ?? null,
  };
}

type ServerSnap = { updatedAt: string | null; name: string; songs: Song[]; setlists: Setlist[]; members: BandMember[] };

function snapFromRow(row: any): ServerSnap {
  const ws = rowToWorkspace(row);
  return { updatedAt: row.updated_at ?? null, name: ws.name, songs: ws.songs, setlists: ws.setlists, members: ws.members };
}

const toData = (ws: { songs: Song[]; setlists: Setlist[]; members: BandMember[] }) => ({
  songs: ws.songs,
  setlists: ws.setlists,
  members: ws.members || [],
});

function sameTime(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return !isNaN(ta) && ta === tb;
}

function readCache(): BandWorkspace[] | null {
  try {
    const raw = safeGet(CACHE_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw);
    return Array.isArray(list) && list.length > 0 ? list : null;
  } catch {
    return null;
  }
}

export type JoinResult = { success: boolean; requiresPin?: boolean; error?: string };

type EditorState = { song: Song; isNew: boolean; returnTo: 'library' | 'stage' } | null;

// ---------- uygulama ----------

export default function App() {
  const [workspaces, setWorkspacesState] = useState<BandWorkspace[]>([]);
  const workspacesRef = useRef<BandWorkspace[]>([]);
  // Tüm yerel değişiklikler buradan geçer; ref her zaman en güncel hali tutar.
  const replaceWorkspaces = useCallback((fn: (prev: BandWorkspace[]) => BandWorkspace[]) => {
    const next = fn(workspacesRef.current);
    workspacesRef.current = next;
    setWorkspacesState(next);
  }, []);

  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOfflineCache, setIsOfflineCache] = useState(false);
  const isOfflineCacheRef = useRef(false);
  isOfflineCacheRef.current = isOfflineCache || !!loadError;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [joinedWorkspaceIds, setJoinedWorkspaceIds] = useState<string[]>(() => loadJoinedWorkspaceIds());
  const joinedRef = useRef(joinedWorkspaceIds);
  joinedRef.current = joinedWorkspaceIds;

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => safeGet(ACTIVE_WS_ID_KEY) || '');
  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  // Setlist içindeki konum App'te tutulur: "Düzenle" sonrası sahne yeniden
  // açıldığında kaybolmaz; yeni setlist başlatılınca 0'a döner.
  const [setlistIndex, setSetlistIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'library' | 'setlists' | 'stage' | 'editor'>('library');
  const [editor, setEditor] = useState<EditorState>(null);

  // Bulut senkronizasyon durumu
  const serverSnapRef = useRef<Record<string, ServerSnap>>({});
  const dirtyRef = useRef<Set<string>>(new Set());
  const savingRef = useRef<Set<string>>(new Set());
  const retryTimersRef = useRef<Record<string, number>>({});

  const setJoined = useCallback((fn: (prev: string[]) => string[]) => {
    const next = Array.from(new Set(fn(joinedRef.current)));
    joinedRef.current = next;
    saveJoinedWorkspaceIds(next);
    setJoinedWorkspaceIds(next);
  }, []);

  const canWrite = useCallback(() => {
    if (isOfflineCacheRef.current) {
      alert('Çevrimdışı moddasınız: repertuvar sadece okunabilir. İnternet gelince değişiklik yapabilirsiniz.');
      return false;
    }
    return true;
  }, []);

  // ---------- kayıt motoru ----------
  // Aynı gruba yazmalar sıraya girer; her yazma o anki EN GÜNCEL yerel hali
  // gönderir. Bulut bu arada başkası tarafından değiştirildiyse (updated_at
  // tutmuyorsa) yazma reddedilir, buluttaki hal çekilip birleştirilir ve
  // tekrar denenir. Böylece ne hızlı tıklamalar ne de eşzamanlı düzenleme
  // veri kaybettirir.

  const writeWithMerge = useCallback(async (wsId: string): Promise<boolean> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const local = workspacesRef.current.find(w => w.id === wsId);
      if (!local) return true;
      const base = serverSnapRef.current[wsId];
      const updatedAt = new Date().toISOString();
      const payload = {
        name: local.name,
        data: toData(local),
        updated_at: updatedAt,
      };

      let rows: any[] | null = null;
      let error: { message: string } | null = null;
      try {
        if (!base) {
          const r = await workspacesTable().upsert({ id: wsId, ...payload }).select('id, updated_at');
          rows = r.data; error = r.error;
        } else {
          let q = workspacesTable().update(payload).eq('id', wsId);
          q = base.updatedAt ? q.eq('updated_at', base.updatedAt) : q.is('updated_at', null);
          const r = await q.select('id, updated_at');
          rows = r.data; error = r.error;
        }
      } catch (e: any) {
        error = { message: e?.message || 'Bağlantı hatası' };
      }

      if (error) {
        console.error('Buluta kayıt hatası:', error.message);
        setSaveError(error.message);
        return false;
      }

      if (rows && rows.length > 0) {
        serverSnapRef.current[wsId] = {
          updatedAt: rows[0].updated_at ?? updatedAt,
          name: local.name,
          ...toData(local),
        };
        setSaveError(null);
        return true;
      }

      // Çakışma: bulut başkası tarafından değiştirilmiş.
      const r = await workspacesTable().select('*').eq('id', wsId).single();
      if (r.error || !r.data) {
        setSaveError('Grup bulutta bulunamadı.');
        return false;
      }
      const theirsSnap = snapFromRow(r.data);
      const latestLocal = workspacesRef.current.find(w => w.id === wsId) || local;
      const merged = mergeWorkspaceData(
        base || theirsSnap,
        { name: latestLocal.name, ...toData(latestLocal) },
        theirsSnap,
      );
      serverSnapRef.current[wsId] = theirsSnap;
      replaceWorkspaces(prev => prev.map(w => (w.id === wsId ? { ...w, ...merged, pinHash: (r.data as any).pin_hash ?? null } : w)));
    }
    setSaveError('Kayıt birkaç denemede tamamlanamadı.');
    return false;
  }, [replaceWorkspaces]);

  const scheduleSave = useCallback((wsId: string) => {
    dirtyRef.current.add(wsId);
    if (savingRef.current.has(wsId)) return;

    const flush = async () => {
      savingRef.current.add(wsId);
      try {
        while (dirtyRef.current.has(wsId)) {
          dirtyRef.current.delete(wsId);
          const ok = await writeWithMerge(wsId);
          if (!ok) {
            // Değişiklik kaybolmasın: kirli olarak işaretle, 5 sn sonra tekrar dene.
            dirtyRef.current.add(wsId);
            if (!retryTimersRef.current[wsId]) {
              retryTimersRef.current[wsId] = window.setTimeout(() => {
                delete retryTimersRef.current[wsId];
                if (dirtyRef.current.has(wsId)) {
                  dirtyRef.current.delete(wsId);
                  scheduleSaveRef.current(wsId);
                }
              }, 5000);
            }
            break;
          }
        }
      } finally {
        savingRef.current.delete(wsId);
      }
    };
    flush();
  }, [writeWithMerge]);
  const scheduleSaveRef = useRef(scheduleSave);
  scheduleSaveRef.current = scheduleSave;

  // Kaydedilmemiş değişiklik varken sekme kapatılırsa uyar.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current.size > 0 || savingRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  const mutateWorkspace = useCallback((wsId: string, fn: (ws: BandWorkspace) => BandWorkspace): boolean => {
    if (!canWrite()) return false;
    let changed = false;
    replaceWorkspaces(prev => prev.map(w => {
      if (w.id !== wsId) return w;
      changed = true;
      return fn(w);
    }));
    if (changed) scheduleSave(wsId);
    return changed;
  }, [canWrite, replaceWorkspaces, scheduleSave]);

  // ---------- açılışta yükleme ----------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      await new Promise(r => setTimeout(r, 0));
      if (cancelled) return;

      const ids = joinedRef.current;
      let rows: any[] = [];

      if (ids.length > 0) {
        let data: any[] | null = null;
        let error: { message: string } | null = null;
        try {
          const r = await workspacesTable().select('*').in('id', ids);
          data = r.data; error = r.error;
        } catch (e: any) {
          error = { message: e?.message || 'Bağlantı kurulamadı' };
        }
        if (cancelled) return;

        if (error) {
          console.error('Buluttan veri çekilemedi:', error.message);
          const cached = readCache();
          if (cached) {
            replaceWorkspaces(() => cached);
            setActiveWorkspaceId(prev => (cached.some(w => w.id === prev) ? prev : cached[0].id));
            setIsOfflineCache(true);
          }
          setLoadError(error.message);
          setIsLoaded(true);
          return;
        }
        rows = data || [];
      }

      let list = rows.map(rowToWorkspace);
      rows.forEach(row => { serverSnapRef.current[row.id] = snapFromRow(row); });

      // Artık bulutta olmayan grupları bu cihazın listesinden çıkar.
      const foundIds = new Set(list.map(w => w.id));
      if (ids.some(id => !foundIds.has(id))) {
        setJoined(prev => prev.filter(id => foundIds.has(id)));
      }

      if (list.length === 0) {
        // İlk açılış: herkesin paylaştığı sabit bir grup yerine bu cihaza
        // özel, tahmin edilemez kimlikli yeni bir grup oluştur.
        const id = newWorkspaceId();
        const updatedAt = new Date().toISOString();
        const r = await workspacesTable()
          .insert({ id, name: 'Ana Repertuvar', data: { songs: [], setlists: [], members: [] }, pin_hash: null, updated_at: updatedAt })
          .select('id, updated_at');
        if (cancelled) return;
        if (r.error) {
          setLoadError(r.error.message);
          setIsLoaded(true);
          return;
        }
        const ws: BandWorkspace = { id, name: 'Ana Repertuvar', songs: [], setlists: [], members: [], pinHash: null };
        serverSnapRef.current[id] = { updatedAt: (r.data as any[] | null)?.[0]?.updated_at ?? updatedAt, name: ws.name, songs: [], setlists: [], members: [] };
        list = [ws];
        setJoined(prev => [...prev, id]);
      }

      replaceWorkspaces(() => list);
      setActiveWorkspaceId(prev => (list.some(w => w.id === prev) ? prev : list[0].id));
      setLoadError(null);
      setIsOfflineCache(false);
      setIsLoaded(true);
    })();

    return () => { cancelled = true; };
  }, [reloadKey, replaceWorkspaces, setJoined]);

  const reload = useCallback(() => {
    setIsLoaded(false);
    setLoadError(null);
    setIsOfflineCache(false);
    setReloadKey(k => k + 1);
  }, []);

  // İnternet geri gelince otomatik yeniden bağlan.
  useEffect(() => {
    const onOnline = () => { if (loadError) reload(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [loadError, reload]);

  // Son başarılı hali çevrimdışı kullanım için sakla.
  useEffect(() => {
    if (!isLoaded || isOfflineCache || loadError || workspaces.length === 0) return;
    const t = window.setTimeout(() => safeSet(CACHE_KEY, JSON.stringify(workspaces)), 500);
    return () => window.clearTimeout(t);
  }, [workspaces, isLoaded, isOfflineCache, loadError]);

  // ---------- gerçek zamanlı eşitleme ----------
  const removeWorkspaceLocally = useCallback((id: string) => {
    dirtyRef.current.delete(id);
    delete serverSnapRef.current[id];
    replaceWorkspaces(prev => prev.filter(w => w.id !== id));
    setJoined(prev => prev.filter(x => x !== id));
  }, [replaceWorkspaces, setJoined]);

  const handleRealtime = useCallback(async (payload: any) => {
    if (payload.eventType === 'DELETE') {
      const id = payload.old?.id;
      if (id) removeWorkspaceLocally(id);
      return;
    }
    const incoming = payload.new;
    const id = incoming?.id;
    if (!id) return;
    // Bu cihazın kaydı sürüyorsa yok say: kayıt motoru çakışmayı zaten birleştirir.
    if (dirtyRef.current.has(id) || savingRef.current.has(id)) return;
    // Kendi kaydımızın yankısı → yok say (eskiden daha yeni yerel hali eziyordu).
    if (sameTime(incoming.updated_at, serverSnapRef.current[id]?.updatedAt)) return;

    let row = incoming;
    // Supabase, 1 MB'ı aşan bildirimlerde büyük alanları (data) göndermez.
    // O durumda boş repertuvar sanmak yerine satırı ayrıca çek.
    if (!incoming.data || !Array.isArray(incoming.data.songs) || !Array.isArray(incoming.data.setlists)) {
      const r = await workspacesTable().select('*').eq('id', id).single();
      if (r.error || !r.data) return;
      row = r.data;
      if (dirtyRef.current.has(id) || savingRef.current.has(id)) return;
    }

    serverSnapRef.current[id] = snapFromRow(row);
    const ws = rowToWorkspace(row);
    replaceWorkspaces(prev => (prev.some(w => w.id === id) ? prev.map(w => (w.id === id ? ws : w)) : prev));
  }, [removeWorkspaceLocally, replaceWorkspaces]);

  useEffect(() => {
    if (!isLoaded || isOfflineCache || loadError) return;
    const ids = joinedWorkspaceIds;
    if (ids.length === 0) return;

    const channel = supabase.channel('workspaces-' + ids.join('_').slice(0, 80));
    ids.forEach(id => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspaces', filter: `id=eq.${id}` },
        (payload: any) => { handleRealtime(payload); }
      );
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isLoaded, isOfflineCache, loadError, joinedWorkspaceIds.join(','), handleRealtime]);

  // ---------- aktif grup ----------
  const activeWorkspace: BandWorkspace | undefined =
    workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];

  // Kayıtlı aktif grup artık listede yoksa, ekranda görünen grubu aktif yap
  // (eskiden başka grubun şarkıları görünüp kayıt yanlış kimliğe gidiyordu).
  useEffect(() => {
    if (activeWorkspace && activeWorkspace.id !== activeWorkspaceId) {
      setActiveWorkspaceId(activeWorkspace.id);
    }
  }, [activeWorkspace?.id, activeWorkspaceId]);

  useEffect(() => {
    if (activeWorkspaceId) safeSet(ACTIVE_WS_ID_KEY, activeWorkspaceId);
  }, [activeWorkspaceId]);

  const songs = activeWorkspace ? activeWorkspace.songs : [];
  const setlists = activeWorkspace ? activeWorkspace.setlists : [];

  const updateActiveWorkspace = useCallback((fn: (ws: BandWorkspace) => BandWorkspace) => {
    const ws = workspacesRef.current.find(w => w.id === activeWorkspaceId) || workspacesRef.current[0];
    if (!ws) return false;
    return mutateWorkspace(ws.id, fn);
  }, [activeWorkspaceId, mutateWorkspace]);

  // ---------- grup işlemleri ----------
  const handleJoinWorkspace = useCallback(async (workspaceId: string, pin?: string): Promise<JoinResult> => {
    const cleanId = workspaceId.trim();
    if (!cleanId) return { success: false, error: 'Grup kodu boş olamaz.' };

    const { data, error } = await workspacesTable().select('*').eq('id', cleanId).single();
    const row = data as any;
    if (error || !row) {
      return { success: false, error: 'Bu koda ait bir grup bulunamadı.' };
    }

    const pinOk = await verifyWorkspacePin(cleanId, pin || '', row.pin_hash ?? null);
    if (!pinOk) return { success: false, requiresPin: true, error: 'PIN hatalı ya da eksik.' };

    const joinedWs = rowToWorkspace(row);
    serverSnapRef.current[joinedWs.id] = snapFromRow(row);
    replaceWorkspaces(prev =>
      prev.some(w => w.id === joinedWs.id) ? prev.map(w => (w.id === joinedWs.id ? joinedWs : w)) : [...prev, joinedWs]
    );
    setJoined(prev => [...prev, joinedWs.id]);
    setActiveWorkspaceId(joinedWs.id);
    return { success: true };
  }, [replaceWorkspaces, setJoined]);

  const insertNewWorkspace = useCallback(async (ws: BandWorkspace): Promise<boolean> => {
    const updatedAt = new Date().toISOString();
    const r = await workspacesTable()
      .insert({
        id: ws.id,
        name: ws.name,
        data: toData(ws),
        pin_hash: ws.pinHash ?? null,
        updated_at: updatedAt,
      })
      .select('id, updated_at');
    if (r.error) {
      alert('Grup oluşturulamadı: ' + r.error.message);
      return false;
    }
    serverSnapRef.current[ws.id] = {
      updatedAt: (r.data as any[] | null)?.[0]?.updated_at ?? updatedAt,
      name: ws.name,
      ...toData(ws),
    };
    replaceWorkspaces(prev => [...prev, ws]);
    setJoined(prev => [...prev, ws.id]);
    setActiveWorkspaceId(ws.id);
    return true;
  }, [replaceWorkspaces, setJoined]);

  const handleCreateWorkspace = async () => {
    if (!canWrite()) return;
    const name = prompt('Yeni grup / çalışma alanı adı:');
    if (!name || !name.trim()) return;

    const pin = prompt('Bu grup için isteğe bağlı bir PIN belirleyin (en az 4 karakter). Boş bırakırsanız grup PIN\'siz olur:');
    const cleanPin = (pin || '').trim();
    if (cleanPin.length > 0 && cleanPin.length < 4) {
      alert('PIN en az 4 karakter olmalı. Grup PIN\'siz oluşturulacak; Paylaş menüsünden sonra ekleyebilirsiniz.');
    }

    const id = newWorkspaceId();
    const pinHash = cleanPin.length >= 4 ? await hashWorkspacePin(id, cleanPin) : null;
    await insertNewWorkspace({ id, name: name.trim(), songs: [], setlists: [], members: [], pinHash });
  };

  const handleRenameWorkspace = () => {
    if (!activeWorkspace) return;
    const name = prompt('Grubun yeni adı:', activeWorkspace.name);
    if (!name || !name.trim() || name.trim() === activeWorkspace.name) return;
    mutateWorkspace(activeWorkspace.id, ws => ({ ...ws, name: name.trim() }));
  };

  const handleLeaveWorkspace = () => {
    if (!activeWorkspace) return;
    const ws = activeWorkspace;
    if (dirtyRef.current.has(ws.id) || savingRef.current.has(ws.id)) {
      alert('Bu gruptaki son değişiklikler hâlâ kaydediliyor. Birkaç saniye sonra tekrar deneyin.');
      return;
    }
    if (!confirm(`"${ws.name}" grubu bu cihazdan kaldırılsın mı?\n\nGrup silinmez; diğer üyeler kullanmaya devam eder. Grup koduyla tekrar katılabilirsiniz (kod: ${ws.id}).`)) return;
    removeWorkspaceLocally(ws.id);
    if (workspacesRef.current.length === 0) reload();
  };

  const handleDeleteWorkspace = async () => {
    if (!activeWorkspace || !canWrite()) return;
    const ws = activeWorkspace;
    if (ws.pinHash) {
      const pin = prompt('Grubu silmek için grup PIN\'ini girin:');
      if (pin === null) return;
      if (!(await verifyWorkspacePin(ws.id, pin, ws.pinHash))) {
        alert('PIN yanlış. Grup silinmedi.');
        return;
      }
    }
    const typed = prompt(
      `DİKKAT: "${ws.name}" grubu (${ws.songs.length} şarkı, ${ws.setlists.length} setlist) TÜM üyeler için kalıcı olarak silinecek.\n\nOnaylamak için grubun adını aynen yazın:`
    );
    if (typed === null) return;
    if (typed.trim() !== ws.name.trim()) {
      alert('Grup adı eşleşmedi. Grup silinmedi.');
      return;
    }
    const r = await workspacesTable().delete().eq('id', ws.id).select('id');
    if (r.error) {
      alert('Grup silinemedi: ' + r.error.message);
      return;
    }
    if (!r.data || r.data.length === 0) {
      alert('Grup silinemedi (veritabanı izin vermedi).');
      return;
    }
    removeWorkspaceLocally(ws.id);
    if (workspacesRef.current.length === 0) reload();
  };

  // ---------- grup üyeleri ve kişiye özel tercihler ----------
  const handleUpdateWorkspaceMembers = (workspaceId: string, members: BandMember[]) => {
    mutateWorkspace(workspaceId, ws => ({ ...ws, members }));
  };

  // Kişinin görüntüleme tercihleri (punto, çift sütun, kaydırma hızı/
  // gecikmesi) gruptaki kaydına yazılır; hangi cihaza girerse girsin o kişiyi takip eder.
  const handleUpdateMemberPreferences = (memberId: string, prefs: Partial<MemberPreferences>) => {
    if (isOfflineCacheRef.current) return; // çevrimdışıyken sessizce yalnızca cihazda kalır
    updateActiveWorkspace(ws => ({
      ...ws,
      members: (ws.members || []).map(m => (m.id === memberId ? { ...m, preferences: { ...m.preferences, ...prefs } } : m)),
    }));
  };

  // Bu cihazda "kimin görüntülediği" grup başına cihazda hatırlanır.
  const [activeMemberId, setActiveMemberIdState] = useState<string | null>(null);
  useEffect(() => {
    if (!activeWorkspaceId) return;
    setActiveMemberIdState(safeGet(`active_member_${activeWorkspaceId}`) || null);
  }, [activeWorkspaceId]);

  const handleSelectMember = (memberId: string | null) => {
    setActiveMemberIdState(memberId);
    try {
      if (memberId) localStorage.setItem(`active_member_${activeWorkspaceId}`, memberId);
      else localStorage.removeItem(`active_member_${activeWorkspaceId}`);
    } catch { /* yoksay */ }
  };

  // PIN yalnızca pin_hash sütununu değiştirir; repertuvar verisine dokunmaz.
  const handleSetWorkspacePin = async (currentPin: string, newPin: string): Promise<JoinResult> => {
    const ws = activeWorkspace;
    if (!ws) return { success: false, error: 'Aktif grup bulunamadı.' };
    if (isOfflineCacheRef.current) return { success: false, error: 'Çevrimdışıyken PIN değiştirilemez.' };

    const currentOk = await verifyWorkspacePin(ws.id, currentPin, ws.pinHash ?? null);
    if (!currentOk) return { success: false, error: 'Mevcut PIN yanlış.' };

    const trimmedNew = newPin.trim();
    if (trimmedNew.length > 0 && trimmedNew.length < 4) {
      return { success: false, error: 'Yeni PIN en az 4 karakter olmalı.' };
    }
    const newHash = trimmedNew.length > 0 ? await hashWorkspacePin(ws.id, trimmedNew) : null;

    const r = await workspacesTable().update({ pin_hash: newHash }).eq('id', ws.id).select('id');
    if (r.error || !r.data || r.data.length === 0) {
      return { success: false, error: 'PIN kaydedilirken bir hata oluştu.' };
    }
    replaceWorkspaces(prev => prev.map(w => (w.id === ws.id ? { ...w, pinHash: newHash } : w)));
    return { success: true };
  };

  const handleExportWorkspace = () => {
    if (!activeWorkspace) return;
    // PIN hash'i yedeğe yazılmaz.
    const { pinHash: _omit, ...exportable } = activeWorkspace;
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportable, null, 2));
    const a = document.createElement('a');
    a.setAttribute('href', dataStr);
    a.setAttribute('download', `${activeWorkspace.name.toLowerCase().replace(/\s+/g, '_')}_repertuvar.json`);
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Yedek her zaman YENİ bir grup olarak eklenir; aynı kimlikli mevcut grubun
  // (bandın güncel repertuvarının) üzerine yazılmaz.
  const handleImportWorkspace = async (imported: BandWorkspace) => {
    if (!canWrite()) return;
    const ws: BandWorkspace = {
      id: newWorkspaceId(),
      name: `${imported.name || 'Grup'} (yedek)`,
      songs: Array.isArray(imported.songs) ? imported.songs.map(normalizeSong) : [],
      setlists: normalizeSetlists(imported.setlists),
      members: Array.isArray((imported as any).members) ? (imported as any).members : [],
      pinHash: null,
    };
    await insertNewWorkspace(ws);
  };

  // ---------- şarkı işlemleri ----------
  const activeSong = songs.find(s => s.id === activeSongId) || songs[0];

  const handleCreateSong = () => {
    if (!canWrite()) return;
    const draft: Song = {
      id: newSongId(),
      title: 'Yeni Şarkı',
      artist: 'Sanatçı',
      baseKey: 'C',
      tempo: 120,
      timeSignature: '4/4',
      rawChordPro: `{c: Verse 1}\n[C]Akorla [G]başla`,
      updatedAt: Date.now(),
    };
    // Taslak buluta yazılmaz; yalnızca "Kaydet"e basılınca eklenir.
    setEditor({ song: draft, isNew: true, returnTo: 'library' });
    setViewMode('editor');
  };

  const openEditor = (song: Song, returnTo: 'library' | 'stage') => {
    setEditor({ song, isNew: false, returnTo });
    setViewMode('editor');
  };

  const handleEditorSave = (updated: Song) => {
    if (!editor) return;
    const ok = editor.isNew
      ? updateActiveWorkspace(ws => ({ ...ws, songs: [updated, ...ws.songs] }))
      : updateActiveWorkspace(ws => ({ ...ws, songs: ws.songs.map(s => (s.id === updated.id ? updated : s)) }));
    if (!ok) return;
    setActiveSongId(updated.id);
    setViewMode(editor.returnTo);
    setEditor(null);
  };

  const handleEditorCancel = () => {
    setViewMode(editor?.returnTo || 'library');
    setEditor(null);
  };

  // Sahneden gelen güncellemeler (çizim, kalıcı ton/BPM): ekran değişmez.
  const handleUpdateSongInPlace = (updated: Song) => {
    updateActiveWorkspace(ws => ({ ...ws, songs: ws.songs.map(s => (s.id === updated.id ? updated : s)) }));
  };

  const removeSongsEverywhere = (ids: string[]) =>
    updateActiveWorkspace(ws => ({
      ...ws,
      songs: ws.songs.filter(s => !ids.includes(s.id)),
      setlists: ws.setlists.map(sl => ({
        ...sl,
        items: sl.items.filter(it => !(it.type === 'song' && it.songId && ids.includes(it.songId))),
      })),
    }));

  const handleDeleteSong = (id: string) => {
    const inSetlists = setlists.filter(sl => sl.items.some(it => it.type === 'song' && it.songId === id)).length;
    const extra = inSetlists > 0 ? `\n\nŞarkı ${inSetlists} setlistten de çıkarılacak.` : '';
    if (!confirm('Bu şarkıyı silmek istediğinize emin misiniz?' + extra)) return;
    removeSongsEverywhere([id]);
  };

  const handleBulkDeleteSongs = (ids: string[]) => {
    removeSongsEverywhere(ids);
  };

  const handleSaveSetlist = (setlist: Setlist) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      setlists: ws.setlists.some(s => s.id === setlist.id)
        ? ws.setlists.map(s => (s.id === setlist.id ? setlist : s))
        : [setlist, ...ws.setlists],
    }));
  };

  // Arşivden bir şarkıyı doğrudan bir setliste ekler.
  const handleAddSongToSetlist = (setlistId: string, songId: string) => {
    updateActiveWorkspace(ws => ({
      ...ws,
      setlists: ws.setlists.map(sl =>
        sl.id === setlistId ? { ...sl, items: [...sl.items, { type: 'song' as const, songId }] } : sl
      ),
    }));
  };

  const handleDeleteSetlist = (id: string) => {
    updateActiveWorkspace(ws => ({ ...ws, setlists: ws.setlists.filter(s => s.id !== id) }));
  };

  // ---------- ekranlar ----------
  if (!isLoaded) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#0a0a0c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
        Bulut verileri yükleniyor...
      </div>
    );
  }

  if ((loadError && !isOfflineCache) || !activeWorkspace) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#0a0a0c', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px', padding: '24px', boxSizing: 'border-box', textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#ef4444' }}>Repertuvar yüklenemedi</div>
        <div style={{ fontSize: '14px', color: '#a1a1aa', maxWidth: '420px', lineHeight: 1.5 }}>
          Buluta bağlanılamadı ve bu cihazda kayıtlı bir kopya yok. Verileriniz güvende; yanlışlıkla silinmesin diye bağlantı gelene kadar düzenleme kapalı.
        </div>
        {loadError && <div style={{ fontSize: '12px', color: '#52525b', fontFamily: 'monospace' }}>{loadError}</div>}
        <button
          onClick={reload}
          style={{ background: '#059669', color: '#fff', border: 'none', padding: '12px 22px', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
        >
          Tekrar Dene
        </button>
      </div>
    );
  }

  const statusBanner = (isOfflineCache || saveError) && (
    <div
      data-no-swipe="true"
      style={{
        position: 'fixed',
        // Alt orta, sahnedeki kaydırma/gezinme düğmelerinin üstünde:
        // hiçbir düğmenin üstüne binmez.
        bottom: 'calc(max(16px, env(safe-area-inset-bottom)) + 56px)',
        left: '50%',
        transform: 'translateX(-50%)',
        whiteSpace: 'nowrap',
        zIndex: 200,
        background: isOfflineCache ? '#422006' : '#450a0a',
        border: `1px solid ${isOfflineCache ? '#d97706' : '#ef4444'}`,
        color: '#fff',
        borderRadius: '10px',
        padding: '6px 10px',
        fontSize: '12px',
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        maxWidth: 'calc(100vw - 24px)',
        boxShadow: '0 6px 18px rgba(0,0,0,0.6)',
      }}
    >
      <span>{isOfflineCache ? 'Çevrimdışı · salt okunur' : 'Kaydedilemedi, tekrar denenecek'}</span>
      {isOfflineCache && (
        <button
          onClick={reload}
          style={{ background: '#d97706', color: '#000', border: 'none', borderRadius: '6px', padding: '3px 8px', fontWeight: 'bold', fontSize: '11px', cursor: 'pointer' }}
        >
          Bağlan
        </button>
      )}
    </div>
  );

  let view: ReactNode;

  if (viewMode === 'editor' && editor) {
    view = (
      <SongEditor
        key={editor.song.id}
        song={editor.song}
        isNew={editor.isNew}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
      />
    );
  } else if (viewMode === 'setlists') {
    view = (
      <SetlistManager
        setlists={setlists}
        songs={songs}
        onSaveSetlist={handleSaveSetlist}
        onDeleteSetlist={handleDeleteSetlist}
        onStartShow={(setlist) => {
          setActiveSetlistId(setlist.id);
          setSetlistIndex(0);
          setViewMode('stage');
        }}
        onOpenSongAt={(setlist, itemIndex) => {
          setActiveSetlistId(setlist.id);
          setSetlistIndex(itemIndex);
          setViewMode('stage');
        }}
        onBackToLibrary={() => setViewMode('library')}
      />
    );
  } else if (viewMode === 'stage') {
    const activeSetlist = activeSetlistId ? setlists.find(s => s.id === activeSetlistId) || null : null;
    view = (
      <StageViewer
        song={activeSong}
        activeSetlist={activeSetlist}
        songsList={songs}
        setlistIndex={setlistIndex}
        onSetlistIndexChange={setSetlistIndex}
        onEdit={(s) => {
          if (!activeSetlist) setActiveSongId(s.id);
          openEditor(s, 'stage');
        }}
        onBackToLibrary={() => setViewMode(activeSetlist ? 'setlists' : 'library')}
        onUpdateSong={handleUpdateSongInPlace}
        onSelectSongDirectly={(selectedSong) => {
          setActiveSongId(selectedSong.id);
          setActiveSetlistId(null);
        }}
        members={activeWorkspace.members || []}
        activeMemberId={activeMemberId}
        onSelectMember={handleSelectMember}
        onUpdateMemberPreferences={handleUpdateMemberPreferences}
      />
    );
  } else {
    view = (
      <SongList
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspace.id}
        onSelectWorkspace={setActiveWorkspaceId}
        onCreateWorkspace={handleCreateWorkspace}
        onRenameWorkspace={handleRenameWorkspace}
        onLeaveWorkspace={handleLeaveWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        onExportWorkspace={handleExportWorkspace}
        onImportWorkspace={handleImportWorkspace}
        onJoinWorkspace={handleJoinWorkspace}
        onSetWorkspacePin={handleSetWorkspacePin}
        onUpdateWorkspaceMembers={handleUpdateWorkspaceMembers}
        pendingBandCode={new URLSearchParams(window.location.search).get('band')}
        songs={songs}
        setlists={setlists}
        onSelectSong={(song) => {
          setActiveSongId(song.id);
          setActiveSetlistId(null);
          setViewMode('stage');
        }}
        onEditSong={(song) => openEditor(song, 'library')}
        onCreateSong={handleCreateSong}
        onDeleteSong={handleDeleteSong}
        onDeleteSongs={handleBulkDeleteSongs}
        onOpenSetlists={() => setViewMode('setlists')}
        onAddSongToSetlist={handleAddSongToSetlist}
        onAddSong={(newSong) => { updateActiveWorkspace(ws => ({ ...ws, songs: [newSong, ...ws.songs] })); }}
        onAddSongs={(newSongs) => { updateActiveWorkspace(ws => ({ ...ws, songs: [...newSongs, ...ws.songs] })); }}
      />
    );
  }

  return (
    <>
      {view}
      {statusBanner}
    </>
  );
}
