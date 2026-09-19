import { useState, useEffect, useCallback } from 'react';
import type { Song, Setlist, BandWorkspace, MemberPreferences } from './types/song';
import { SongList } from './components/library/SongList';
import { SetlistManager } from './components/library/SetlistManager';
import { SongEditor } from './components/editor/SongEditor';
import { StageViewer } from './components/stage/StageViewer';
import { supabase } from './utils/supabase';
import { hashWorkspacePin, verifyWorkspacePin } from './utils/pin';

const ACTIVE_WS_ID_KEY = 'stage_chordpro_active_ws_id';
// Bu cihazın katıldığı (PIN doğrulaması yapılmış) grup ID'lerinin listesi.
// Artık uygulama açıldığında Supabase'deki TÜM gruplar değil, sadece bu
// listede olan gruplar çekiliyor — böylece başka bandların repertuvarı
// cihazınıza hiç inmiyor.
const JOINED_WS_IDS_KEY = 'stage_chordpro_joined_ws_ids';

const defaultWorkspaces: BandWorkspace[] = [
  {
    id: 'ws_default_1',
    name: 'Ana Repertuvar',
    songs: [],
    setlists: [],
    members: [],
    pinHash: null,
  }
];

function loadJoinedWorkspaceIds(): string[] {
  try {
    const raw = localStorage.getItem(JOINED_WS_IDS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    // Geriye dönük uyumluluk: daha önce sadece ACTIVE_WS_ID_KEY tutuluyordu.
    const legacyActive = localStorage.getItem(ACTIVE_WS_ID_KEY);
    const merged = new Set(list);
    if (legacyActive) merged.add(legacyActive);
    if (merged.size === 0) merged.add(defaultWorkspaces[0].id);
    return Array.from(merged);
  } catch {
    return [defaultWorkspaces[0].id];
  }
}

function saveJoinedWorkspaceIds(ids: string[]) {
  localStorage.setItem(JOINED_WS_IDS_KEY, JSON.stringify(Array.from(new Set(ids))));
}

function rowToWorkspace(row: any): BandWorkspace {
  return {
    id: row.id,
    name: row.name,
    songs: row.data?.songs || [],
    setlists: row.data?.setlists || [],
    members: row.data?.members || [],
    pinHash: row.pin_hash ?? null,
  };
}

export type JoinResult = { success: boolean; requiresPin?: boolean; error?: string };

export default function App() {
  const [workspaces, setWorkspaces] = useState<BandWorkspace[]>(defaultWorkspaces);
  const [isLoaded, setIsLoaded] = useState(false);
  const [joinedWorkspaceIds, setJoinedWorkspaceIds] = useState<string[]>(() => loadJoinedWorkspaceIds());

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    return localStorage.getItem(ACTIVE_WS_ID_KEY) || defaultWorkspaces[0].id;
  });

  const [activeSongId, setActiveSongId] = useState<string | null>(null);
  const [activeSetlist, setActiveSetlist] = useState<Setlist | null>(null);
  // Aktif setlist içinde hangi şarkıda olunduğu artık burada (App.tsx'te)
  // tutuluyor — StageViewer'ın kendi iç hafızasında değil. Böylece
  // "Düzenle" için StageViewer geçici olarak kapanıp açıldığında bu konum
  // KAYBOLMAZ; ama yeni bir setlist başlatıldığında (onStartShow) bilinçli
  // olarak 0'a resetlenir. İkisi birbirine karışmaz.
  const [setlistIndex, setSetlistIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'library' | 'setlists' | 'stage' | 'editor'>('library');
  // Editöre "Ana Repertuar" listesinden mi yoksa "Sahne"den mi girildiğini
  // hatırlar. "Vazgeç" veya "Kaydet" sonrası her zaman geldiğiniz ekrana
  // dönmek için kullanılır (önceden her zaman sahneye dönüyordu, bu da
  // repertuvar listesinden düzenleme yapanlar için yanlıştı).
  const [editorOrigin, setEditorOrigin] = useState<'library' | 'stage'>('stage');

  const addJoinedWorkspaceId = useCallback((id: string) => {
    setJoinedWorkspaceIds(prev => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      saveJoinedWorkspaceIds(next);
      return next;
    });
  }, []);

  // Bir grubun kodunu (ve varsa PIN'ini) kullanarak o gruba katılma / senkronize olma.
  // PIN korumalıysa doğru PIN girilmeden grup verisi state'e alınmaz.
  const handleJoinWorkspace = useCallback(async (workspaceId: string, pin?: string): Promise<JoinResult> => {
    const cleanId = workspaceId.trim();
    if (!cleanId) return { success: false, error: 'Grup kodu boş olamaz.' };

    const { data, error } = await supabase
      .from('workspaces')
      .select('*')
      .eq('id', cleanId)
      .single();

    const row = data as any;
    if (error || !row) {
      console.error('Grup bulunamadı:', error?.message);
      return { success: false, error: 'Bu koda ait bir grup bulunamadı.' };
    }

    const pinOk = await verifyWorkspacePin(cleanId, pin || '', row.pin_hash ?? null);
    if (!pinOk) {
      return { success: false, requiresPin: true, error: 'PIN hatalı ya da eksik.' };
    }

    const joinedWs = rowToWorkspace(row);

    setWorkspaces(prev => {
      const exists = prev.some(w => w.id === joinedWs.id);
      if (exists) {
        return prev.map(w => w.id === joinedWs.id ? joinedWs : w);
      }
      return [...prev, joinedWs];
    });

    addJoinedWorkspaceId(joinedWs.id);
    setActiveWorkspaceId(joinedWs.id);
    return { success: true };
  }, [addJoinedWorkspaceId]);

  // Sayfa açıldığında: sadece bu cihazın daha önce katıldığı grupları çek.
  // URL'de `?band=ID` varsa (ve henüz katılınmamışsa) PIN akışını tetikle.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bandParam = params.get('band');

    const fetchWorkspacesFromCloud = async () => {
      const idsToFetch = joinedWorkspaceIds;

      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .in('id', idsToFetch);

      if (error) {
        console.error('Buluttan veri çekilemedi:', error.message);
        setIsLoaded(true);
        return;
      }

      if (data && data.length > 0) {
        const cloudWorkspaces: BandWorkspace[] = data.map(rowToWorkspace);
        setWorkspaces(cloudWorkspaces);
      } else {
        // Bu cihaz için hiç kayıtlı grup yoksa varsayılan grubu oluştur.
        for (const ws of defaultWorkspaces) {
          await (supabase.from('workspaces') as any).upsert({
            id: ws.id,
            name: ws.name,
            data: { songs: ws.songs, setlists: ws.setlists, members: ws.members || [] },
            pin_hash: null,
            updated_at: new Date().toISOString()
          });
        }
      }

      // Linkle gelindiyse ve o gruba henüz katılınmamışsa, PIN akışı
      // SongList/BandShareModal tarafında `?band=` parametresi görülünce
      // otomatik açılır (bkz. SongList.tsx). Burada zorla katılmıyoruz,
      // çünkü grup PIN korumalı olabilir.

      setIsLoaded(true);
    };

    fetchWorkspacesFromCloud();

    // Gerçek Zamanlı Supabase Dinleyicisi (Realtime Sync)
    // Sadece bu cihazın katıldığı gruplar için dinleniyor — tüm tabloyu
    // dinlemek (filtresiz) diğer bandların değişikliklerini de cihaza
    // sızdırırdı.
    if (joinedWorkspaceIds.length === 0) return;

    const channel = supabase.channel('workspaces-joined');
    joinedWorkspaceIds.forEach(id => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'workspaces', filter: `id=eq.${id}` },
        (payload) => {
          const newRow = payload.new as any;
          if (newRow && newRow.id) {
            const updatedWs = rowToWorkspace(newRow);
            setWorkspaces(prev => {
              const index = prev.findIndex(w => w.id === updatedWs.id);
              if (index >= 0) {
                const copy = [...prev];
                copy[index] = updatedWs;
                return copy;
              }
              return [...prev, updatedWs];
            });
          }
        }
      );
    });
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // bandParam sadece SongList üzerinden manuel katılım tetiklemek için okunuyor,
    // efekti yeniden tetiklemesine gerek yok.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinedWorkspaceIds.join(',')]);

  useEffect(() => {
    localStorage.setItem(ACTIVE_WS_ID_KEY, activeWorkspaceId);
  }, [activeWorkspaceId]);

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0] || defaultWorkspaces[0];
  const songs = activeWorkspace ? activeWorkspace.songs : [];
  const setlists = activeWorkspace ? activeWorkspace.setlists : [];

  const updateActiveWorkspace = async (newSongs: Song[], newSetlists: Setlist[], customName?: string) => {
    const wsName = customName || activeWorkspace.name;

    setWorkspaces(prev => prev.map(w => {
      if (w.id === activeWorkspaceId) {
        return {
          ...w,
          name: wsName,
          songs: [...newSongs],
          setlists: [...newSetlists]
        };
      }
      return w;
    }));

    const { error } = await (supabase.from('workspaces') as any).upsert({
      id: activeWorkspaceId,
      name: wsName,
      data: { songs: newSongs, setlists: newSetlists, members: activeWorkspace.members || [] },
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Buluta kayıt hatası:', error.message);
    }
  };

  const handleCreateWorkspace = async () => {
    const name = prompt('Yeni grup / çalışma alanı adı:');
    if (!name) return;

    const pin = prompt('Bu grup için isteğe bağlı bir PIN belirleyin (grubun yöneticisi olarak, en az 4 karakter). Boş bırakırsanız grup herkese açık kalır:');
    if (pin !== null && pin.trim().length > 0 && pin.trim().length < 4) {
      alert('PIN en az 4 karakter olmalı. Grup PIN\'siz oluşturulacak, dilerseniz Paylaş menüsünden sonra ekleyebilirsiniz.');
    }

    const newWsId = 'ws_' + Date.now();
    const pinHash = pin && pin.trim().length >= 4 ? await hashWorkspacePin(newWsId, pin.trim()) : null;

    const newWs: BandWorkspace = {
      id: newWsId,
      name,
      songs: [],
      setlists: [],
      members: [],
      pinHash,
    };

    setWorkspaces(prev => [...prev, newWs]);
    addJoinedWorkspaceId(newWsId);
    setActiveWorkspaceId(newWsId);

    await (supabase.from('workspaces') as any).upsert({
      id: newWsId,
      name,
      data: { songs: [], setlists: [], members: [] },
      pin_hash: pinHash,
      updated_at: new Date().toISOString()
    });
  };

  // Aktif grubun üye (kişi) listesini günceller — hem yerel state'i hem de
  // Supabase'deki `data.members` alanını günceller. Şarkı/setlist verisine
  // dokunmadan sadece üyeler değişir.
  const handleUpdateWorkspaceMembers = async (workspaceId: string, members: BandWorkspace['members']) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (!ws) return;

    setWorkspaces(prev => prev.map(w => w.id === workspaceId ? { ...w, members } : w));

    const { error } = await (supabase.from('workspaces') as any).upsert({
      id: workspaceId,
      name: ws.name,
      data: { songs: ws.songs, setlists: ws.setlists, members },
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Üye listesi güncellenemedi:', error.message);
    }
  };

  // Belirli bir kişinin görüntüleme tercihlerini (punto, çift sütun,
  // kaydırma hızı/gecikmesi) günceller. Tercih o kişinin Supabase'deki
  // kaydına yazılır — böylece HANGİ cihaza girerse girsin o kişiyi takip
  // eder, sadece bu cihaza özel kalmaz.
  const handleUpdateMemberPreferences = async (memberId: string, prefs: Partial<MemberPreferences>) => {
    const ws = activeWorkspace;
    if (!ws) return;

    const updatedMembers = (ws.members || []).map(m =>
      m.id === memberId ? { ...m, preferences: { ...m.preferences, ...prefs } } : m
    );

    setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, members: updatedMembers } : w));

    const { error } = await (supabase.from('workspaces') as any).upsert({
      id: ws.id,
      name: ws.name,
      data: { songs: ws.songs, setlists: ws.setlists, members: updatedMembers },
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('Tercihler kaydedilemedi:', error.message);
    }
  };

  // Bu cihazda "kimin görüntülediği" — grup başına ayrı hatırlanır
  // (localStorage). Kişinin KENDİSİ değil, sadece "bu cihazda hangi
  // kişiyim" bilgisi cihaza özeldir; tercihlerin kendisi Supabase'de
  // kişiye bağlı olarak saklanır.
  const [activeMemberId, setActiveMemberIdState] = useState<string | null>(null);
  useEffect(() => {
    if (!activeWorkspaceId) return;
    const saved = localStorage.getItem(`active_member_${activeWorkspaceId}`);
    setActiveMemberIdState(saved || null);
  }, [activeWorkspaceId]);

  const handleSelectMember = (memberId: string | null) => {
    setActiveMemberIdState(memberId);
    if (memberId) {
      localStorage.setItem(`active_member_${activeWorkspaceId}`, memberId);
    } else {
      localStorage.removeItem(`active_member_${activeWorkspaceId}`);
    }
  };

  // Aktif grubun PIN'ini belirler / değiştirir / kaldırır.
  // Grupta zaten bir PIN varsa, değiştirmek için doğru mevcut PIN gerekir
  // (PIN'i bilen = grup yöneticisi kabul edilir).
  const handleSetWorkspacePin = async (currentPin: string, newPin: string): Promise<JoinResult> => {
    const ws = activeWorkspace;
    if (!ws) return { success: false, error: 'Aktif grup bulunamadı.' };

    const currentOk = await verifyWorkspacePin(ws.id, currentPin, ws.pinHash ?? null);
    if (!currentOk) {
      return { success: false, error: 'Mevcut PIN yanlış.' };
    }

    const trimmedNew = newPin.trim();
    if (trimmedNew.length > 0 && trimmedNew.length < 4) {
      return { success: false, error: 'Yeni PIN en az 4 karakter olmalı.' };
    }

    const newHash = trimmedNew.length > 0 ? await hashWorkspacePin(ws.id, trimmedNew) : null;

    setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, pinHash: newHash } : w));

    const { error } = await (supabase.from('workspaces') as any).upsert({
      id: ws.id,
      name: ws.name,
      data: { songs: ws.songs, setlists: ws.setlists, members: ws.members || [] },
      pin_hash: newHash,
      updated_at: new Date().toISOString()
    });

    if (error) {
      console.error('PIN güncellenemedi:', error.message);
      return { success: false, error: 'PIN kaydedilirken bir hata oluştu.' };
    }

    return { success: true };
  };

  const handleExportWorkspace = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(activeWorkspace, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${activeWorkspace.name.toLowerCase().replace(/\s+/g, '_')}_repertuvar.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportWorkspace = async (importedWs: BandWorkspace) => {
    setWorkspaces(prev => {
      const exists = prev.some(w => w.id === importedWs.id);
      if (exists) {
        return prev.map(w => w.id === importedWs.id ? importedWs : w);
      }
      return [...prev, importedWs];
    });
    addJoinedWorkspaceId(importedWs.id);
    setActiveWorkspaceId(importedWs.id);

    await (supabase.from('workspaces') as any).upsert({
      id: importedWs.id,
      name: importedWs.name,
      data: { songs: importedWs.songs, setlists: importedWs.setlists, members: importedWs.members || [] },
      pin_hash: importedWs.pinHash ?? null,
      updated_at: new Date().toISOString()
    });
  };

  const activeSong = songs.find(s => s.id === activeSongId) || songs[0];

  const handleCreateSong = () => {
    const newSong: Song = {
      id: 'song_' + Date.now(),
      title: 'Yeni Şarkı',
      artist: 'Sanatçı',
      baseKey: 'C',
      tempo: 120,
      timeSignature: '4/4',
      rawChordPro: `{c: Verse 1}\n[C]Akorde [G]başla`,
      updatedAt: Date.now()
    };
    const updatedSongs = [newSong, ...songs];
    updateActiveWorkspace(updatedSongs, setlists);
    setActiveSongId(newSong.id);
    setEditorOrigin('library');
    setViewMode('editor');
  };

  const handleSaveSong = (updated: Song) => {
    const newSongs = songs.map(s => s.id === updated.id ? updated : s);
    updateActiveWorkspace(newSongs, setlists);
    setViewMode(editorOrigin === 'library' ? 'library' : 'stage');
  };

  const handleDeleteSong = (id: string) => {
    if (!confirm('Bu şarkıyı silmek istediğinize emin misiniz?')) return;
    const newSongs = songs.filter(s => s.id !== id);
    updateActiveWorkspace(newSongs, setlists);
  };

  const handleBulkDeleteSongs = (ids: string[]) => {
    const newSongs = songs.filter(s => !ids.includes(s.id));
    updateActiveWorkspace(newSongs, setlists);
  };

  const handleSaveSetlist = (setlist: Setlist) => {
    const exists = setlists.some(s => s.id === setlist.id);
    const newSetlists = exists
      ? setlists.map(s => s.id === setlist.id ? setlist : s)
      : [setlist, ...setlists];
    updateActiveWorkspace(songs, newSetlists);
  };

  // Repertuvar Arşivi ekranından bir şarkıyı doğrudan (SetlistManager'ı
  // açmaya gerek kalmadan) belirli bir setlist'e ekler.
  const handleAddSongToSetlist = (setlistId: string, songId: string) => {
    const targetSetlist = setlists.find(s => s.id === setlistId);
    if (!targetSetlist) return;

    const updated: Setlist = {
      ...targetSetlist,
      items: [...targetSetlist.items, { type: 'song', songId }],
    };
    handleSaveSetlist(updated);
  };

  const handleDeleteSetlist = (id: string) => {
    const newSetlists = setlists.filter(s => s.id !== id);
    updateActiveWorkspace(songs, newSetlists);
  };

  if (!isLoaded) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#0a0a0c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px' }}>
        Bulut verileri yükleniyor...
      </div>
    );
  }

  if (viewMode === 'library') {
    return (
      <SongList
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        onSelectWorkspace={setActiveWorkspaceId}
        onCreateWorkspace={handleCreateWorkspace}
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
          setActiveSetlist(null);
          setViewMode('stage');
        }}
        onEditSong={(song) => {
          setActiveSongId(song.id);
          setEditorOrigin('library');
          setViewMode('editor');
        }}
        onCreateSong={handleCreateSong}
        onDeleteSong={handleDeleteSong}
        onDeleteSongs={handleBulkDeleteSongs}
        onOpenSetlists={() => setViewMode('setlists')}
        onAddSongToSetlist={handleAddSongToSetlist}
        onAddSong={(newSong) => {
          const updatedSongs = [newSong, ...songs];
          updateActiveWorkspace(updatedSongs, setlists);
        }}
        onAddSongs={(newSongs) => {
          const updatedSongs = [...newSongs, ...songs];
          updateActiveWorkspace(updatedSongs, setlists);
        }}
      />
    );
  }

  if (viewMode === 'setlists') {
    return (
      <SetlistManager
        setlists={setlists}
        songs={songs}
        onSaveSetlist={handleSaveSetlist}
        onDeleteSetlist={handleDeleteSetlist}
        onStartShow={(setlist) => {
          setActiveSetlist(setlist);
          setSetlistIndex(0);
          setViewMode('stage');
        }}
        onOpenSongAt={(setlist, itemIndex) => {
          setActiveSetlist(setlist);
          setSetlistIndex(itemIndex);
          setViewMode('stage');
        }}
        onBackToLibrary={() => setViewMode('library')}
      />
    );
  }

  if (viewMode === 'editor') {
    return (
      <SongEditor
        song={activeSong}
        onSave={handleSaveSong}
        onCancel={() => setViewMode(editorOrigin === 'library' ? 'library' : 'stage')}
      />
    );
  }

  return (
    <StageViewer
      song={activeSong}
      activeSetlist={activeSetlist}
      songsList={songs}
      onEdit={(song) => {
        setActiveSongId(song.id);
        setEditorOrigin('stage');
        setViewMode('editor');
      }}
      onBackToLibrary={() => setViewMode(activeSetlist ? 'setlists' : 'library')}
      onUpdateSong={handleSaveSong}
      onSelectSongDirectly={(selectedSong) => {
        setActiveSongId(selectedSong.id);
        setActiveSetlist(null);
      }}
      setlistIndex={setlistIndex}
      onSetlistIndexChange={setSetlistIndex}
      members={activeWorkspace?.members || []}
      activeMemberId={activeMemberId}
      onSelectMember={handleSelectMember}
      onUpdateMemberPreferences={handleUpdateMemberPreferences}
    />
  );
}