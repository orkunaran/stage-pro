import React, { useState, useEffect } from 'react';
import type { Setlist, Song, SetlistItem } from '../../types/song';
import { 
  ArrowLeft, Plus, Play, Trash2, ChevronUp, ChevronDown, 
  Coffee, Music, Search, ListMusic, Menu, X, Check
} from 'lucide-react';

interface SetlistManagerProps {
  setlists: Setlist[];
  songs: Song[];
  onSaveSetlist: (setlist: Setlist) => void;
  onDeleteSetlist: (id: string) => void;
  onStartShow: (setlist: Setlist) => void;
  onBackToLibrary: () => void;
  // Setlist'teki BELİRLİ bir şarkıya doğrudan tıklanınca, tüm setlist'i
  // baştan başlatmadan, o şarkının bulunduğu konumdan sahneye açar.
  onOpenSongAt: (setlist: Setlist, itemIndex: number) => void;
}

export const SetlistManager: React.FC<SetlistManagerProps> = ({
  setlists,
  songs,
  onSaveSetlist,
  onDeleteSetlist,
  onStartShow,
  onBackToLibrary,
  onOpenSongAt,
}) => {
  const [activeSetlistId, setActiveSetlistId] = useState<string>(() => {
    return setlists[0]?.id || '';
  });

  const [searchSongQuery, setSearchSongQuery] = useState('');
  
  // Mobil Duyarlılık ve Modal/Drawer Durumları
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 1024);
  const [isLeftDrawerOpen, setIsLeftDrawerOpen] = useState(false);
  const [isAddSongModalOpen, setIsAddSongModalOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024;
      setIsMobile(mobile);
      if (!mobile) {
        setIsLeftDrawerOpen(false);
        setIsAddSongModalOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeSetlist = setlists.find(s => s.id === activeSetlistId) || setlists[0];

  const handleCreateNewSetlist = () => {
    const name = prompt('Yeni Setlist / Konser Adı:');
    if (!name || !name.trim()) return;

    const newSetlist: Setlist = {
      id: 'setlist_' + Date.now(),
      name: name.trim(),
      items: [],
    };

    onSaveSetlist(newSetlist);
    setActiveSetlistId(newSetlist.id);
    if (isMobile) setIsLeftDrawerOpen(false);
  };

  const handleAddSongToSetlist = (songId: string) => {
    if (!activeSetlist) return;

    const newItem: SetlistItem = {
      type: 'song',
      songId,
    };

    const updated: Setlist = {
      ...activeSetlist,
      items: [...activeSetlist.items, newItem],
    };

    onSaveSetlist(updated);
  };

  const handleRemoveSongById = (songId: string) => {
    if (!activeSetlist) return;
    const index = activeSetlist.items.findIndex(i => i.type === 'song' && i.songId === songId);
    if (index !== -1) {
      handleRemoveItem(index);
    }
  };

  const handleAddBreak = () => {
    if (!activeSetlist) return;
    const title = prompt('Ara / Mola Başlığı (Örn: 15 Dk Ara, Akustik Bölüm):', 'Konser Arası');
    if (title === null) return;

    const newItem: SetlistItem = {
      type: 'break',
      breakTitle: title.trim() || 'Konser Arası',
    };

    const updated: Setlist = {
      ...activeSetlist,
      items: [...activeSetlist.items, newItem],
    };

    onSaveSetlist(updated);
  };

  const handleRemoveItem = (index: number) => {
    if (!activeSetlist) return;
    const updatedItems = activeSetlist.items.filter((_, idx) => idx !== index);
    onSaveSetlist({
      ...activeSetlist,
      items: updatedItems,
    });
  };

  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    if (!activeSetlist) return;
    const items = [...activeSetlist.items];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;

    if (targetIdx < 0 || targetIdx >= items.length) return;

    const temp = items[index];
    items[index] = items[targetIdx];
    items[targetIdx] = temp;

    onSaveSetlist({
      ...activeSetlist,
      items,
    });
  };

  const filteredAvailableSongs = songs.filter(s => 
    s.title.toLowerCase().includes(searchSongQuery.toLowerCase()) ||
    s.artist.toLowerCase().includes(searchSongQuery.toLowerCase())
  );

  // Ortak Şarkı Arama ve Ekleme Paneli İçeriği
  const renderSongPicker = () => (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ position: 'relative', marginBottom: '14px' }}>
        <Search size={15} color="#71717a" style={{ position: 'absolute', left: '10px', top: '10px' }} />
        <input
          type="text"
          placeholder="Şarkı veya sanatçı ara..."
          value={searchSongQuery}
          onChange={e => setSearchSongQuery(e.target.value)}
          style={{
            width: '100%',
            background: '#18181b',
            border: '1px solid #27272a',
            color: '#fff',
            padding: '8px 10px 8px 34px',
            borderRadius: '8px',
            fontSize: '13px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredAvailableSongs.length === 0 ? (
          <div style={{ color: '#71717a', fontSize: '13px', textAlign: 'center', marginTop: '20px' }}>Şarkı bulunamadı.</div>
        ) : (
          filteredAvailableSongs.map(s => {
            const countInSetlist = activeSetlist?.items.filter(i => i.type === 'song' && i.songId === s.id).length || 0;
            return (
              <div
                key={s.id}
                style={{
                  background: '#18181b',
                  border: countInSetlist > 0 ? '1px solid #fbbf24' : '1px solid #27272a',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.title}</div>
                  <div style={{ fontSize: '11px', color: '#a1a1aa' }}>{s.artist} • {s.baseKey}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {countInSetlist > 0 && (
                    <>
                      <span style={{ fontSize: '11px', background: '#27272a', color: '#fbbf24', padding: '2px 6px', borderRadius: '4px' }}>
                        {countInSetlist}x
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSongById(s.id)}
                        style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }}
                        title="Listeden Çıkar"
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAddSongToSetlist(s.id)}
                    style={{ background: '#27272a', color: '#38bdf8', border: 'none', padding: '4px 6px', borderRadius: '6px', cursor: 'pointer' }}
                    title="Listeye Ekle"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      width: '100vw',
      backgroundColor: '#0a0a0c', 
      color: '#f3f4f6',
      overflow: 'hidden',
      position: 'relative'
    }}>
      
      {/* Mobil Sol Drawer Karartması */}
      {isMobile && isLeftDrawerOpen && (
        <div 
          onClick={() => setIsLeftDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', zIndex: 90 }}
        />
      )}

      {/* Sol Panel: Setlistler (Mobilde Çekmece) */}
      <div style={{ 
        width: '280px', 
        maxWidth: '85vw',
        background: '#121216', 
        borderRight: '1px solid #27272a', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '20px',
        boxSizing: 'border-box',
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: isMobile ? 100 : 'auto',
        transform: isMobile && !isLeftDrawerOpen ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
        paddingTop: isMobile ? 'max(20px, env(safe-area-inset-top))' : '20px',
        paddingBottom: isMobile ? 'max(20px, env(safe-area-inset-bottom))' : '20px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <button
            onClick={onBackToLibrary}
            style={{
              background: '#18181b',
              color: '#fff',
              border: '1px solid #27272a',
              padding: '8px 12px',
              borderRadius: '10px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontWeight: 'bold',
              fontSize: '12px',
            }}
          >
            <ArrowLeft size={15} /> Arşiv
          </button>

          {isMobile && (
            <button 
              onClick={() => setIsLeftDrawerOpen(false)}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', padding: '4px', cursor: 'pointer' }}
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', marginBottom: '14px', fontSize: '14px', fontWeight: 'bold' }}>
          <ListMusic size={18} /> Kayıtlı Setlistler
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {setlists.length === 0 ? (
            <div style={{ color: '#71717a', fontSize: '13px', textAlign: 'center', marginTop: '30px' }}>Henüz setlist yok.</div>
          ) : (
            setlists.map(sl => (
              <div
                key={sl.id}
                onClick={() => {
                  setActiveSetlistId(sl.id);
                  if (isMobile) setIsLeftDrawerOpen(false);
                }}
                style={{
                  background: sl.id === activeSetlistId ? '#1e1e24' : '#18181b',
                  border: sl.id === activeSetlistId ? '1px solid #fbbf24' : '1px solid #27272a',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: sl.id === activeSetlistId ? 'bold' : 'normal', color: sl.id === activeSetlistId ? '#fff' : '#d4d4d8', fontSize: '14px' }}>
                    {sl.name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
                    {sl.items.filter(i => i.type === 'song').length} şarkı
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`"${sl.name}" listesini silmek istediğinize emin misiniz?`)) {
                      onDeleteSetlist(sl.id);
                    }
                  }}
                  style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer', padding: '4px' }}
                  title="Listeyi Sil"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>

        <button
          onClick={handleCreateNewSetlist}
          style={{
            background: '#27272a',
            color: '#38bdf8',
            border: '1px dashed #3f3f46',
            padding: '10px',
            borderRadius: '10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '12px',
          }}
        >
          <Plus size={16} /> Yeni Konser Listesi
        </button>
      </div>

      {/* Orta Panel: Aktif Setlist Akışı */}
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        background: '#0a0a0c', 
        minWidth: 0,
        overflow: 'hidden'
      }}>
        {activeSetlist ? (
          <>
            {/* Üst Bar */}
            <div style={{ 
              padding: isMobile ? '16px 14px' : '24px 32px', 
              paddingTop: isMobile ? 'max(16px, env(safe-area-inset-top))' : '24px',
              borderBottom: '1px solid #27272a', 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'stretch' : 'center',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {isMobile && (
                  <button
                    onClick={() => setIsLeftDrawerOpen(true)}
                    style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#fff', padding: '8px', borderRadius: '8px', cursor: 'pointer' }}
                    title="Setlist Listesini Aç"
                  >
                    <Menu size={18} />
                  </button>
                )}
                <div>
                  <h1 style={{ margin: 0, fontSize: isMobile ? '20px' : '24px', fontWeight: 'bold' }}>{activeSetlist.name}</h1>
                  <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#a1a1aa' }}>
                    {activeSetlist.items.filter(i => i.type === 'song').length} Şarkı • {activeSetlist.items.filter(i => i.type === 'break').length} Mola
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {/* Mobilde Pop-up açan buton */}
                {isMobile && (
                  <button
                    onClick={() => setIsAddSongModalOpen(true)}
                    style={{
                      background: '#18181b',
                      color: '#38bdf8',
                      border: '1px solid #3f3f46',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      flex: 1,
                      justifyContent: 'center'
                    }}
                  >
                    <Plus size={15} /> Şarkı Ekle
                  </button>
                )}

                <button
                  onClick={handleAddBreak}
                  style={{
                    background: '#27272a',
                    color: '#fbbf24',
                    border: '1px solid #3f3f46',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flex: isMobile ? 1 : 'none',
                    justifyContent: 'center'
                  }}
                >
                  <Coffee size={14} /> Mola
                </button>

                <button
                  disabled={activeSetlist.items.length === 0}
                  onClick={() => onStartShow(activeSetlist)}
                  style={{
                    background: activeSetlist.items.length === 0 ? '#27272a' : '#059669',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: '8px',
                    cursor: activeSetlist.items.length === 0 ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flex: isMobile ? '100%' : 'none',
                    justifyContent: 'center'
                  }}
                >
                  <Play size={14} /> Konseri Başlat
                </button>
              </div>
            </div>

            {/* Setlist Akışı */}
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: isMobile ? '14px' : '24px 32px', 
              paddingBottom: isMobile ? 'max(20px, env(safe-area-inset-bottom))' : '24px',
              display: 'flex', 
              flexDirection: 'column', 
              gap: '10px' 
            }}>
              {activeSetlist.items.length === 0 ? (
                <div style={{ color: '#71717a', textAlign: 'center', marginTop: '60px', fontSize: '14px' }}>
                  Bu setlist henüz boş. {isMobile ? 'Yukarıdaki "+ Şarkı Ekle" butonuna basarak şarkı seçin.' : 'Sağ panelden şarkı ekleyin.'}
                </div>
              ) : (
                activeSetlist.items.map((item, idx) => {
                  if (item.type === 'break') {
                    return (
                      <div
                        key={idx}
                        style={{
                          background: '#1c1917',
                          border: '1px dashed #fbbf24',
                          padding: '10px 14px',
                          borderRadius: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 'bold' }}>#{idx + 1}</span>
                          <Coffee size={16} color="#fbbf24" style={{ flexShrink: 0 }} />
                          <span style={{ fontWeight: 'bold', color: '#fbbf24', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.breakTitle || 'Konser Arası'}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                          <button
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(idx, 'up')}
                            style={{ background: '#27272a', color: idx === 0 ? '#52525b' : '#fff', border: 'none', padding: '5px', borderRadius: '6px', cursor: idx === 0 ? 'default' : 'pointer' }}
                          >
                            <ChevronUp size={15} />
                          </button>
                          <button
                            disabled={idx === activeSetlist.items.length - 1}
                            onClick={() => handleMoveItem(idx, 'down')}
                            style={{ background: '#27272a', color: idx === activeSetlist.items.length - 1 ? '#52525b' : '#fff', border: 'none', padding: '5px', borderRadius: '6px', cursor: idx === activeSetlist.items.length - 1 ? 'default' : 'pointer' }}
                          >
                            <ChevronDown size={15} />
                          </button>
                          <button
                            onClick={() => handleRemoveItem(idx)}
                            style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '5px', borderRadius: '6px', cursor: 'pointer', marginLeft: '4px' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    );
                  }

                  const song = songs.find(s => s.id === item.songId);
                  return (
                    <div
                      key={idx}
                      onClick={() => song && onOpenSongAt(activeSetlist, idx)}
                      style={{
                        background: '#121216',
                        border: '1px solid #27272a',
                        padding: '10px 14px',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        cursor: song ? 'pointer' : 'default',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                        <span style={{ fontSize: '12px', color: '#71717a', fontWeight: 'bold' }}>#{idx + 1}</span>
                        <div style={{ background: '#18181b', padding: '6px', borderRadius: '6px', color: '#fbbf24', flexShrink: 0 }}>
                          <Music size={15} />
                        </div>
                        <div style={{ minWidth: 0, overflow: 'hidden' }}>
                          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song ? song.title : 'Silinmiş Şarkı'}
                          </div>
                          <div style={{ fontSize: '11px', color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {song ? `${song.artist} • Ton: ${song.baseKey} • ${song.tempo} BPM` : '—'}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                        {song && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onOpenSongAt(activeSetlist, idx); }}
                            title="Bu şarkıyı doğrudan aç"
                            style={{ background: '#059669', color: '#fff', border: 'none', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', marginRight: '2px' }}
                          >
                            <Play size={14} />
                          </button>
                        )}
                        <button
                          disabled={idx === 0}
                          onClick={(e) => { e.stopPropagation(); handleMoveItem(idx, 'up'); }}
                          style={{ background: '#27272a', color: idx === 0 ? '#52525b' : '#fff', border: 'none', padding: '5px', borderRadius: '6px', cursor: idx === 0 ? 'default' : 'pointer' }}
                        >
                          <ChevronUp size={15} />
                        </button>
                        <button
                          disabled={idx === activeSetlist.items.length - 1}
                          onClick={(e) => { e.stopPropagation(); handleMoveItem(idx, 'down'); }}
                          style={{ background: '#27272a', color: idx === activeSetlist.items.length - 1 ? '#52525b' : '#fff', border: 'none', padding: '5px', borderRadius: '6px', cursor: idx === activeSetlist.items.length - 1 ? 'default' : 'pointer' }}
                        >
                          <ChevronDown size={15} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveItem(idx); }}
                          style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '5px', borderRadius: '6px', cursor: 'pointer', marginLeft: '4px' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', padding: '20px', textAlign: 'center' }}>
            {isMobile ? (
              <button 
                onClick={() => setIsLeftDrawerOpen(true)}
                style={{ background: '#27272a', color: '#fff', border: '1px solid #3f3f46', padding: '10px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
              >
                Setlist Seç veya Oluştur
              </button>
            ) : (
              'Sol menüden bir setlist seçin veya yeni oluşturun.'
            )}
          </div>
        )}
      </div>

      {/* Masaüstü Sağ Panel (Mobilde Gizli) */}
      {!isMobile && (
        <div style={{ width: '320px', background: '#121216', borderLeft: '1px solid #27272a', display: 'flex', flexDirection: 'column', padding: '20px', boxSizing: 'border-box' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#38bdf8', marginBottom: '12px' }}>
            Arşivden Şarkı Ekle
          </div>
          {renderSongPicker()}
        </div>
      )}

      {/* Mobil Pop-Up (Modal): Şarkı Ekle & Çıkar */}
      {isMobile && isAddSongModalOpen && (
        <div 
          onClick={() => setIsAddSongModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.8)',
            backdropFilter: 'blur(5px)',
            zIndex: 110,
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%',
              maxHeight: '85vh',
              background: '#121216',
              borderTopLeftRadius: '16px',
              borderTopRightRadius: '16px',
              border: '1px solid #27272a',
              padding: '16px',
              paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
              display: 'flex',
              flexDirection: 'column',
              boxSizing: 'border-box',
              gap: '12px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#38bdf8' }}>
                Setlist'e Şarkı Ekle ({activeSetlist?.items.filter(i => i.type === 'song').length || 0})
              </div>
              <button
                onClick={() => setIsAddSongModalOpen(false)}
                style={{
                  background: '#059669',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontWeight: 'bold',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Check size={14} /> Tamam
              </button>
            </div>

            <div style={{ height: '60vh' }}>
              {renderSongPicker()}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};