import React, { useState, useEffect, useRef } from 'react';
import type { Song } from '../../types/song';
import { Search, Music, X } from 'lucide-react';

interface QuickJumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  onSelectSong: (song: Song) => void;
}

export const QuickJumpModal: React.FC<QuickJumpModalProps> = ({
  isOpen,
  onClose,
  songs,
  onSelectSong,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = songs.filter(s =>
    s.title.toLowerCase().includes(query.toLowerCase()) ||
    s.artist.toLowerCase().includes(query.toLowerCase()) ||
    (s.baseKey && s.baseKey.toLowerCase().includes(query.toLowerCase()))
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev < filtered.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onSelectSong(filtered[selectedIndex]);
        onClose();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '100px',
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '540px',
          maxWidth: '90vw',
          backgroundColor: '#121216',
          border: '1px solid #3f3f46',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Arama Input Alanı */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid #27272a', gap: '10px' }}>
          <Search size={20} color="#fbbf24" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Şarkı adı, sanatçı veya ton ara... (↑ ↓ ile gez, Enter ile aç)"
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '16px',
              outline: 'none',
            }}
          />
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Şarkı Listesi */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '8px' }}>
          {filtered.length === 0 ? (
            <div style={{ color: '#71717a', textAlign: 'center', padding: '30px', fontSize: '14px' }}>
              Eşleşen şarkı bulunamadı.
            </div>
          ) : (
            filtered.map((song, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={song.id}
                  onClick={() => {
                    onSelectSong(song);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background: isSelected ? '#1e1e24' : 'transparent',
                    border: isSelected ? '1px solid #fbbf24' : '1px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ color: isSelected ? '#fbbf24' : '#71717a' }}>
                      <Music size={18} />
                    </div>
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 'bold', color: isSelected ? '#fff' : '#e4e4e7' }}>
                        {song.title}
                      </div>
                      <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
                        {song.artist}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', background: '#27272a', padding: '2px 6px', borderRadius: '4px', color: '#fbbf24', fontWeight: 'bold' }}>
                      {song.baseKey}
                    </span>
                    <span style={{ fontSize: '11px', color: '#71717a' }}>
                      {song.tempo} BPM
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};