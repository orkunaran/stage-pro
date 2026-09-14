import React, { useState, useEffect } from 'react';
import { X, Users, UserPlus, Pencil, Trash2, Check, X as XIcon } from 'lucide-react';
import type { BandMember } from '../../types/song';

interface WorkspaceMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceName: string;
  members: BandMember[];
  onSave: (members: BandMember[]) => void;
}

export const WorkspaceMembersModal: React.FC<WorkspaceMembersModalProps> = ({
  isOpen,
  onClose,
  workspaceName,
  members,
  onSave,
}) => {
  const [localMembers, setLocalMembers] = useState<BandMember[]>(members);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState('');

  useEffect(() => {
    if (isOpen) {
      setLocalMembers(members);
      setNewName('');
      setNewRole('');
      setEditingId(null);
    }
  }, [isOpen, members]);

  if (!isOpen) return null;

  const persist = (updated: BandMember[]) => {
    setLocalMembers(updated);
    onSave(updated);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;

    const newMember: BandMember = {
      id: 'member_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: cleanName,
      role: newRole.trim() || undefined,
    };

    persist([...localMembers, newMember]);
    setNewName('');
    setNewRole('');
  };

  const startEdit = (member: BandMember) => {
    setEditingId(member.id);
    setEditName(member.name);
    setEditRole(member.role || '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
    setEditRole('');
  };

  const saveEdit = (id: string) => {
    const cleanName = editName.trim();
    if (!cleanName) {
      cancelEdit();
      return;
    }
    const updated = localMembers.map(m =>
      m.id === id ? { ...m, name: cleanName, role: editRole.trim() || undefined } : m
    );
    persist(updated);
    cancelEdit();
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('Bu kişiyi gruptan çıkarmak istediğinize emin misiniz?')) return;
    persist(localMembers.filter(m => m.id !== id));
    if (editingId === id) cancelEdit();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(5px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: '16px',
        boxSizing: 'border-box',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '480px',
          maxWidth: '92vw',
          background: '#121216',
          border: '1px solid #3f3f46',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.9)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Başlık ve Kapat */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 'bold', fontSize: '17px' }}>
              <Users size={20} /> Grup Üyeleri
            </div>
            <span style={{ fontSize: '12px', color: '#71717a' }}>{workspaceName}</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Üye Listesi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {localMembers.length === 0 ? (
            <div style={{ color: '#71717a', fontSize: '13px', textAlign: 'center', padding: '18px 0' }}>
              Bu grupta henüz kayıtlı kişi yok. Aşağıdan ekleyebilirsiniz.
            </div>
          ) : (
            localMembers.map(member => {
              const isEditing = editingId === member.id;
              return (
                <div
                  key={member.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    background: '#18181b',
                    border: '1px solid #27272a',
                    borderRadius: '10px',
                    padding: '10px 12px',
                  }}
                >
                  {isEditing ? (
                    <div style={{ display: 'flex', gap: '8px', flex: 1, minWidth: 0 }}>
                      <input
                        autoFocus
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        placeholder="İsim"
                        style={{
                          flex: 1, minWidth: 0, background: '#0a0a0c', border: '1px solid #3f3f46', color: '#fff',
                          padding: '8px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                      <input
                        type="text"
                        value={editRole}
                        onChange={e => setEditRole(e.target.value)}
                        placeholder="Enstrüman / Rol"
                        style={{
                          flex: 1, minWidth: 0, background: '#0a0a0c', border: '1px solid #3f3f46', color: '#a1a1aa',
                          padding: '8px 10px', borderRadius: '6px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ) : (
                    <div style={{ minWidth: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {member.name}
                      </div>
                      {member.role && (
                        <div style={{ fontSize: '12px', color: '#fbbf24', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {member.role}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {isEditing ? (
                      <>
                        <button
                          onClick={() => saveEdit(member.id)}
                          title="Kaydet"
                          style={{ background: '#059669', color: '#fff', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
                        >
                          <Check size={14} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          title="Vazgeç"
                          style={{ background: '#27272a', color: '#a1a1aa', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
                        >
                          <XIcon size={14} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => startEdit(member)}
                          title="Düzenle"
                          style={{ background: '#27272a', color: '#38bdf8', border: '1px solid #3f3f46', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(member.id)}
                          title="Kişiyi Sil"
                          style={{ background: '#27272a', color: '#ef4444', border: 'none', padding: '6px', borderRadius: '6px', cursor: 'pointer', display: 'flex' }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Yeni Kişi Ekle */}
        <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid #27272a', paddingTop: '16px' }}>
          <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Yeni Kişi Ekle</label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="İsim (zorunlu)"
              style={{
                flex: '1 1 160px', background: '#18181b', border: '1px solid #3f3f46', color: '#fff',
                padding: '10px 12px', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <input
              type="text"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              placeholder="Enstrüman / Rol (isteğe bağlı)"
              style={{
                flex: '1 1 160px', background: '#18181b', border: '1px solid #3f3f46', color: '#fff',
                padding: '10px 12px', borderRadius: '8px', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <button
            type="submit"
            disabled={!newName.trim()}
            style={{
              background: newName.trim() ? '#fbbf24' : '#27272a',
              color: newName.trim() ? '#000' : '#71717a',
              border: 'none',
              padding: '10px',
              borderRadius: '8px',
              cursor: newName.trim() ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <UserPlus size={15} /> Kişiyi Ekle
          </button>
        </form>
      </div>
    </div>
  );
};
