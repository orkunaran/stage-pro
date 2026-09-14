import React, { useRef, useState, useEffect } from 'react';
import type { Song, BandWorkspace, Setlist, BandMember } from '../../types/song';
import { parseDocumentToSong } from '../../utils/documentParser';
import { BandShareModal } from './BandShareModal';
import { WorkspaceMembersModal } from './WorkspaceMembersModal';
import { 
  Plus, Music, Trash2, Play, ListMusic, Users, 
  Download, Upload, FolderPlus, Files, Edit3, 
  CheckSquare, Square, Share2, Menu, X,
  UserCog, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';

interface SongListProps {
  workspaces: BandWorkspace[];
  activeWorkspaceId: string;
  onSelectWorkspace: (id: string) => void;
  onCreateWorkspace: () => void;
  onExportWorkspace: () => void;
  onImportWorkspace: (importedWorkspace: BandWorkspace) => void;
  onJoinWorkspace: (workspaceId: string, pin?: string) => Promise<{ success: boolean; requiresPin?: boolean; error?: string }>;
  onSetWorkspacePin: (currentPin: string, newPin: string) => Promise<{ success: boolean; error?: string }>;
  onUpdateWorkspaceMembers: (workspaceId: string, members: BandMember[]) => void;
  pendingBandCode?: string | null;
  songs: Song[];
  setlists?: Setlist[];
  onSelectSong: (song: Song) => void;
  onEditSong: (song: Song) => void;
  onCreateSong: () => void;
  onDeleteSong: (id: string) => void;
  onDeleteSongs?: (ids: string[]) => void;
  onOpenSetlists: () => void;
  onAddSong: (song: Song) => void;
  onAddSongs?: (songs: Song[]) => void;
}

export const SongList: React.FC<SongListProps> = ({
  workspaces,
  activeWorkspaceId,
  onSelectWorkspace,
  onCreateWorkspace,
  onExportWorkspace,
  onImportWorkspace,
  onJoinWorkspace,
  onSetWorkspacePin,
  onUpdateWorkspaceMembers,
  pendingBandCode,
  songs,
  onSelectSong,
  onEditSong,
  onCreateSong,
  onDeleteSong,
  onDeleteSongs,
  onOpenSetlists,
  onAddSong,
  onAddSongs,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const [selectedSongIds, setSelectedSongIds] = useState<string[]>([]);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [membersModalWorkspaceId, setMembersModalWorkspaceId] = useState<string | null>(null);

  // Mobil ekran tespiti ve sol çekmece state'i
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Masaüstünde sol menüyü gizle/göster — tercih localStorage'da saklanır.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('stage_chordpro_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('stage_chordpro_sidebar_collapsed', next ? '1' : '0');
      } catch {
        // localStorage kullanılamıyorsa sessizce yoksay
      }
      return next;
    });
  };

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsDrawerOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const activeWs = workspaces.find(w => w.id === activeWorkspaceId) || workspaces[0];
  const membersModalWorkspace = workspaces.find(w => w.id === membersModalWorkspaceId) || null;

  // `?band=KOD` linkiyle açıldıysak ve bu gruba henüz katılınmadıysa,
  // paylaşım modalını "Katıl" sekmesiyle otomatik aç.
  useEffect(() => {
    if (pendingBandCode && !workspaces.some(w => w.id === pendingBandCode)) {
      setIsShareModalOpen(true);
    }
  }, [pendingBandCode, workspaces]);

  const handleWorkspaceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        if (data.id && data.name && Array.isArray(data.songs)) {
          onImportWorkspace(data);
          alert(`"${data.name}" grubu başarıyla yüklendi!`);
        } else {
          alert('Geçersiz grup JSON dosyası.');
        }
      } catch {
        alert('Dosya okunurken bir hata oluştu.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const parsedSongs: Song[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const parsedData = await parseDocumentToSong(file);
        if (parsedData) {
          parsedSongs.push({
            id: 'song_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substring(2, 6),
            title: parsedData.title,
            artist: parsedData.artist,
            baseKey: parsedData.baseKey || 'Am',
            tempo: 100,
            timeSignature: '4/4',
            rawChordPro: parsedData.rawChordPro,
            updatedAt: Date.now(),
          });
        }
      } catch (err) {
        console.error(`"${file.name}" ayrıştırılırken hata:`, err);
      }
    }

    if (parsedSongs.length > 0) {
      if (onAddSongs) {
        onAddSongs(parsedSongs);
      } else {
        parsedSongs.forEach(s => onAddSong(s));
      }
      alert(`${parsedSongs.length} adet şarkı arşive başarıyla eklendi!`);
    }

    if (docInputRef.current) docInputRef.current.value = '';
  };

  const toggleSelectSong = (id: string) => {
    setSelectedSongIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedSongIds.length === songs.length) {
      setSelectedSongIds([]);
    } else {
      setSelectedSongIds(songs.map(s => s.id));
    }
  };

  const handleBulkDelete = () => {
    if (selectedSongIds.length === 0) return;

    const confirmed = window.confirm(
      `${selectedSongIds.length} şarkıyı kalıcı olarak silmek istediğinizden emin misiniz?`
    );

    if (!confirmed) return;

    if (onDeleteSongs) {
      onDeleteSongs(selectedSongIds);
    }

    setSelectedSongIds([]);
  };

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
      
      {/* Mobil Çekmece Arka Plan Karartması */}
      {isMobile && isDrawerOpen && (
        <div 
          onClick={() => setIsDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(3px)',
            zIndex: 90
          }}
        />
      )}

      {/* Sol Menü / Çekmece */}
      <div style={{ 
        width: !isMobile && isSidebarCollapsed ? '0px' : '300px', 
        maxWidth: '85vw',
        background: '#121216', 
        borderRight: !isMobile && isSidebarCollapsed ? 'none' : '1px solid #27272a', 
        display: 'flex', 
        flexDirection: 'column', 
        padding: !isMobile && isSidebarCollapsed ? '20px 0' : '20px',
        boxSizing: 'border-box',
        position: isMobile ? 'fixed' : 'relative',
        top: 0,
        bottom: 0,
        left: 0,
        zIndex: isMobile ? 100 : 'auto',
        transform: isMobile && !isDrawerOpen ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), width 0.22s ease, padding 0.22s ease',
        paddingTop: isMobile ? 'max(20px, env(safe-area-inset-top))' : '20px',
        paddingBottom: isMobile ? 'max(20px, env(safe-area-inset-bottom))' : '20px',
        overflow: !isMobile && isSidebarCollapsed ? 'hidden' : 'visible',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '15px', fontWeight: 'bold' }}>
            <Users size={18} /> Gruplar & Ekipler
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setIsShareModalOpen(true)}
              style={{
                background: '#18181b',
                color: '#fbbf24',
                border: '1px solid #3f3f46',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
              title="Grubu Paylaş veya Katıl"
            >
              <Share2 size={13} /> Paylaş
            </button>

            {isMobile && (
              <button 
                onClick={() => setIsDrawerOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', padding: '4px', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            )}

            {!isMobile && (
              <button
                onClick={toggleSidebarCollapsed}
                title="Sol Menüyü Gizle"
                style={{ background: 'transparent', border: 'none', color: '#a1a1aa', padding: '4px', cursor: 'pointer', display: 'flex' }}
              >
                <PanelLeftClose size={18} />
              </button>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
          {workspaces.map(w => (
            <div
              key={w.id}
              onClick={() => {
                onSelectWorkspace(w.id);
                setSelectedSongIds([]);
                if (isMobile) setIsDrawerOpen(false);
              }}
              style={{
                background: w.id === activeWorkspaceId ? '#1e1e24' : '#18181b',
                border: w.id === activeWorkspaceId ? '1px solid #fbbf24' : '1px solid #27272a',
                padding: '12px 14px',
                borderRadius: '10px',
                cursor: 'pointer',
                fontWeight: w.id === activeWorkspaceId ? 'bold' : 'normal',
                color: w.id === activeWorkspaceId ? '#fff' : '#a1a1aa',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {w.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span style={{ fontSize: '11px', background: '#27272a', padding: '2px 6px', borderRadius: '6px', color: '#fbbf24', minWidth: '35px', textAlign: 'center' }}>
                  {w.songs.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setMembersModalWorkspaceId(w.id);
                  }}
                  title="Kişileri Ekle / Düzenle"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: w.id === activeWorkspaceId ? '#38bdf8' : '#71717a',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                >
                  <UserCog size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={onCreateWorkspace}
          style={{ background: '#27272a', color: '#38bdf8', border: '1px dashed #3f3f46', padding: '10px', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '10px' }}
        >
          <FolderPlus size={16} /> Yeni Grup Oluştur
        </button>

        <div style={{ borderTop: '1px solid #27272a', marginTop: '16px', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#71717a', textTransform: 'uppercase', fontWeight: 'bold' }}>Yedekleme & Dosya</span>
          <button
            onClick={onExportWorkspace}
            style={{ background: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={14} color="#38bdf8" /> Grubu Dışa Aktar (.json)
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ background: '#18181b', color: '#fff', border: '1px solid #27272a', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={14} color="#fbbf24" /> Grubu İçe Aktar
          </button>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleWorkspaceFileChange} 
            accept=".json" 
            style={{ display: 'none' }} 
          />
        </div>
      </div>

      {/* Masaüstünde Sol Menü Kapalıyken Görünen "Göster" Butonu */}
      {!isMobile && isSidebarCollapsed && (
        <button
          onClick={toggleSidebarCollapsed}
          title="Sol Menüyü Göster"
          style={{
            position: 'fixed',
            top: '20px',
            left: '16px',
            background: '#18181b',
            border: '1px solid #3f3f46',
            color: '#38bdf8',
            padding: '8px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            zIndex: 50,
            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
          }}
        >
          <PanelLeftOpen size={18} />
        </button>
      )}

      {/* Sağ Ana Alan: Şarkılar */}
      <div style={{ 
        flex: 1, 
        padding: isMobile ? '16px 14px' : '40px', 
        paddingTop: isMobile ? 'max(16px, env(safe-area-inset-top))' : '40px',
        paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom))' : '40px',
        overflowY: 'auto',
        minWidth: 0,
        boxSizing: 'border-box'
      }}>
        {/* Başlık ve Mobil Menü Butonu */}
        <div style={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          alignItems: isMobile ? 'stretch' : 'center', 
          gap: '14px',
          marginBottom: '20px' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {isMobile && (
              <button
                onClick={() => setIsDrawerOpen(true)}
                style={{
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Grupları Aç"
              >
                <Menu size={20} />
              </button>
            )}

            <div>
              <h1 style={{ fontSize: isMobile ? '22px' : '28px', margin: 0, fontWeight: 'bold' }}>Repertuvar Arşivi</h1>
              <p style={{ color: '#a1a1aa', fontSize: '13px', margin: '3px 0 0 0' }}>
                Aktif Grup: <strong style={{ color: '#fbbf24' }}>{activeWs?.name}</strong>
              </p>
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            gap: '8px', 
            flexWrap: 'wrap',
            justifyContent: isMobile ? 'flex-start' : 'flex-end'
          }}>
            <button
              onClick={() => docInputRef.current?.click()}
              style={{ background: '#18181b', color: '#38bdf8', border: '1px solid #3f3f46', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Files size={15} /> Dosya Yükle
            </button>
            <input 
              type="file" 
              ref={docInputRef} 
              onChange={handleDocUpload} 
              multiple 
              accept=".pdf,.docx,.txt,.cho,.chordpro,.pro,.chopro" 
              style={{ display: 'none' }} 
            />

            <button
              onClick={onOpenSetlists}
              style={{ background: '#27272a', color: '#38bdf8', border: '1px solid #3f3f46', padding: '8px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <ListMusic size={15} /> Setlistler
            </button>
            <button
              onClick={onCreateSong}
              style={{ background: '#fbbf24', color: '#000', border: 'none', padding: '8px 14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
            >
              <Plus size={15} /> Yeni Şarkı
            </button>
          </div>
        </div>

        {/* Toplu Silme Barı */}
        {songs.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#121216', border: '1px solid #27272a', padding: '10px 14px', borderRadius: '10px', marginBottom: '14px' }}>
            <button
              onClick={handleSelectAll}
              style={{ background: 'transparent', border: 'none', color: '#a1a1aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            >
              {selectedSongIds.length === songs.length && songs.length > 0 ? (
                <CheckSquare size={16} color="#fbbf24" />
              ) : (
                <Square size={16} />
              )}
              Tümü ({selectedSongIds.length}/{songs.length})
            </button>

            {selectedSongIds.length > 0 && (
              <button
                onClick={handleBulkDelete}
                style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '5px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Trash2 size={13} /> Sil ({selectedSongIds.length})
              </button>
            )}
          </div>
        )}

        {/* Şarkı Kartları */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {songs.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#71717a', marginTop: '60px', fontSize: '14px' }}>
              Bu grupta henüz şarkı yok. Yeni şarkı ekleyin veya sol menüden ekibinizin ortak grubuna bağlanın.
            </div>
          ) : (
            songs.map(song => {
              const isSelected = selectedSongIds.includes(song.id);
              return (
                <div
                  key={song.id}
                  style={{
                    background: isSelected ? '#1c1917' : '#121216',
                    border: isSelected ? '1px solid #fbbf24' : '1px solid #27272a',
                    padding: isMobile ? '12px 14px' : '16px 20px',
                    borderRadius: '12px',
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'stretch' : 'center',
                    gap: isMobile ? '12px' : '16px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <button
                      onClick={() => toggleSelectSong(song.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: isSelected ? '#fbbf24' : '#52525b' }}
                    >
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                    </button>

                    <div style={{ background: '#18181b', padding: '10px', borderRadius: '8px', color: '#fbbf24', flexShrink: 0 }}>
                      <Music size={18} />
                    </div>
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <h3 style={{ margin: 0, fontSize: '16px', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {song.title}
                      </h3>
                      <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#a1a1aa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {song.artist} • Ton: <strong style={{ color: '#fbbf24' }}>{song.baseKey}</strong> • {song.tempo} BPM
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', justifyContent: isMobile ? 'flex-end' : 'flex-start' }}>
                    <button
                      onClick={() => onSelectSong(song)}
                      style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', flex: isMobile ? 1 : 'none', justifyContent: 'center' }}
                    >
                      <Play size={14} /> Sahne
                    </button>
                    <button
                      onClick={() => onEditSong(song)}
                      style={{ background: '#27272a', color: '#38bdf8', border: '1px solid #3f3f46', padding: '6px 12px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                      title="Şarkıyı Düzenle"
                    >
                      <Edit3 size={14} /> Düzenle
                    </button>
                    <button
                      onClick={() => onDeleteSong(song.id)}
                      style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer' }}
                      title="Şarkıyı Sil"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Band Sync Modal */}
      <BandShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        activeWorkspaceId={activeWorkspaceId}
        activeWorkspaceName={activeWs?.name || 'Grup'}
        hasPin={!!activeWs?.pinHash}
        onJoinWorkspace={onJoinWorkspace}
        onSetWorkspacePin={onSetWorkspacePin}
        initialJoinCode={pendingBandCode}
      />

      {/* Grup Üyeleri Modal */}
      <WorkspaceMembersModal
        isOpen={!!membersModalWorkspace}
        onClose={() => setMembersModalWorkspaceId(null)}
        workspaceName={membersModalWorkspace?.name || ''}
        members={membersModalWorkspace?.members || []}
        onSave={(members) => {
          if (membersModalWorkspace) {
            onUpdateWorkspaceMembers(membersModalWorkspace.id, members);
          }
        }}
      />
    </div>
  );
};