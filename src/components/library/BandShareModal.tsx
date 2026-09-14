import React, { useState, useEffect } from 'react';
import { X, Copy, Check, Users, LogIn, Lock, ShieldCheck } from 'lucide-react';

interface JoinResult {
  success: boolean;
  requiresPin?: boolean;
  error?: string;
}

interface BandShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeWorkspaceId: string;
  activeWorkspaceName: string;
  hasPin: boolean;
  onJoinWorkspace: (workspaceId: string, pin?: string) => Promise<JoinResult>;
  onSetWorkspacePin: (currentPin: string, newPin: string) => Promise<JoinResult>;
  // Sayfa `?band=KOD` linkiyle açıldıysa, "Katıl" sekmesini bu kodla önceden doldurur.
  initialJoinCode?: string | null;
}

export const BandShareModal: React.FC<BandShareModalProps> = ({
  isOpen,
  onClose,
  activeWorkspaceId,
  activeWorkspaceName,
  hasPin,
  onJoinWorkspace,
  onSetWorkspacePin,
  initialJoinCode,
}) => {
  const [activeTab, setActiveTab] = useState<'share' | 'join' | 'pin'>('share');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinPinInput, setJoinPinInput] = useState('');
  const [joinNeedsPin, setJoinNeedsPin] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const [pinCurrentInput, setPinCurrentInput] = useState('');
  const [pinNewInput, setPinNewInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinSuccess, setPinSuccess] = useState('');
  const [isSavingPin, setIsSavingPin] = useState(false);

  useEffect(() => {
    if (isOpen && initialJoinCode) {
      setJoinCodeInput(initialJoinCode);
      setActiveTab('join');
    }
  }, [isOpen, initialJoinCode]);

  if (!isOpen) return null;

  const shareUrl = `${window.location.origin}${window.location.pathname}?band=${activeWorkspaceId}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeWorkspaceId);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = joinCodeInput.trim();
    if (!clean) return;

    setIsJoining(true);
    setJoinError('');

    const result = await onJoinWorkspace(clean, joinPinInput.trim() || undefined);
    setIsJoining(false);

    if (result.success) {
      alert('Gruba başarıyla katıldınız!');
      setJoinCodeInput('');
      setJoinPinInput('');
      setJoinNeedsPin(false);
      onClose();
    } else if (result.requiresPin) {
      setJoinNeedsPin(true);
      setJoinError(joinPinInput ? 'PIN hatalı.' : 'Bu grup PIN korumalı. Lütfen PIN girin.');
    } else {
      setJoinError(result.error || 'Bu koda ait bir grup bulunamadı veya bağlantı kurulamadı.');
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');
    setIsSavingPin(true);

    const result = await onSetWorkspacePin(pinCurrentInput, pinNewInput);
    setIsSavingPin(false);

    if (result.success) {
      setPinSuccess(pinNewInput.trim() ? 'PIN güncellendi.' : 'PIN kaldırıldı, grup artık herkese açık.');
      setPinCurrentInput('');
      setPinNewInput('');
    } else {
      setPinError(result.error || 'PIN güncellenemedi.');
    }
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
        zIndex: 100,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '500px',
          maxWidth: '92vw',
          background: '#121216',
          border: '1px solid #3f3f46',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.9)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Başlık ve Kapat */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 'bold', fontSize: '17px' }}>
            <Users size={20} /> Ekip Senkronizasyonu (Band Sync)
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#71717a', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Sekmeler */}
        <div style={{ display: 'flex', background: '#18181b', borderRadius: '10px', padding: '4px', border: '1px solid #27272a' }}>
          <button
            type="button"
            onClick={() => setActiveTab('share')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              background: activeTab === 'share' ? '#27272a' : 'transparent',
              color: activeTab === 'share' ? '#fbbf24' : '#a1a1aa',
            }}
          >
            Bu Grubu Paylaş
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('join')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              background: activeTab === 'join' ? '#27272a' : 'transparent',
              color: activeTab === 'join' ? '#38bdf8' : '#a1a1aa',
            }}
          >
            Koda Göre Katıl
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pin')}
            style={{
              flex: 1,
              padding: '8px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
              background: activeTab === 'pin' ? '#27272a' : 'transparent',
              color: activeTab === 'pin' ? '#4ade80' : '#a1a1aa',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
            }}
          >
            <Lock size={12} /> PIN Yönetimi
          </button>
        </div>

        {/* 1. Sekme: Paylaş */}
        {activeTab === 'share' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                Aktif Grup
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#fff' }}>
                  {activeWorkspaceName}
                </div>
                {hasPin && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', background: '#052e1a', color: '#4ade80', padding: '2px 8px', borderRadius: '999px', fontWeight: 'bold' }}>
                    <Lock size={10} /> PIN korumalı
                  </span>
                )}
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                Grup Senkronizasyon Kodu
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="text"
                  readOnly
                  value={activeWorkspaceId}
                  style={{
                    flex: 1,
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    color: '#fbbf24',
                    fontFamily: 'monospace',
                    fontWeight: 'bold',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyCode}
                  style={{
                    background: copiedCode ? '#059669' : '#27272a',
                    color: '#fff',
                    border: '1px solid #3f3f46',
                    padding: '0 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                  }}
                >
                  {copiedCode ? <Check size={16} /> : <Copy size={16} />}
                  {copiedCode ? 'Kopyalandı' : 'Kodu Al'}
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                Doğrudan Davet Bağlantısı
              </label>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  style={{
                    flex: 1,
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    color: '#38bdf8',
                    fontFamily: 'monospace',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    fontSize: '12px',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  style={{
                    background: copiedLink ? '#059669' : '#38bdf8',
                    color: copiedLink ? '#fff' : '#000',
                    border: 'none',
                    padding: '0 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontWeight: 'bold',
                    fontSize: '13px',
                  }}
                >
                  {copiedLink ? <Check size={16} /> : <Copy size={16} />}
                  {copiedLink ? 'Kopyalandı' : 'Linki Kopyala'}
                </button>
              </div>
              <p style={{ fontSize: '12px', color: '#71717a', margin: '8px 0 0 0', lineHeight: 1.4 }}>
                Bu linki veya kodu grubunuzdaki diğer müzisyenlere gönderin.
                {hasPin
                  ? ' Grup PIN korumalı olduğu için, katılmaları için PIN\'i de ayrıca (örn. WhatsApp\'tan) paylaşmanız gerekir.'
                  : ' Bu grup PIN korumalı değil; linki veya kodu bilen herkes katılabilir. "PIN Yönetimi" sekmesinden bir PIN ekleyebilirsiniz.'}
              </p>
            </div>
          </div>
        )}

        {/* 2. Sekme: Katıl */}
        {activeTab === 'join' && (
          <form onSubmit={handleJoinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                Müzisyen Arkadaşınızdan Aldığınız Grup Kodu
              </label>
              <input
                type="text"
                placeholder="Örn: ws_1725... veya grup ID"
                value={joinCodeInput}
                onChange={e => {
                  setJoinCodeInput(e.target.value);
                  setJoinError('');
                }}
                style={{
                  width: '100%',
                  background: '#18181b',
                  border: '1px solid #3f3f46',
                  color: '#fff',
                  fontFamily: 'monospace',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  marginTop: '6px',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            </div>

            {joinNeedsPin && (
              <div>
                <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Lock size={12} /> Grup PIN'i
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  placeholder="Yöneticiden aldığınız PIN"
                  value={joinPinInput}
                  onChange={e => {
                    setJoinPinInput(e.target.value);
                    setJoinError('');
                  }}
                  style={{
                    width: '100%',
                    background: '#18181b',
                    border: '1px solid #3f3f46',
                    color: '#fff',
                    fontFamily: 'monospace',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    marginTop: '6px',
                    boxSizing: 'border-box',
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {joinError && (
              <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 'bold' }}>
                {joinError}
              </div>
            )}

            <button
              type="submit"
              disabled={isJoining || !joinCodeInput.trim()}
              style={{
                background: joinCodeInput.trim() ? '#059669' : '#27272a',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                cursor: joinCodeInput.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginTop: '6px',
              }}
            >
              <LogIn size={16} /> {isJoining ? 'Bağlanıyor...' : 'Gruba Katıl ve Eşitle'}
            </button>
          </form>
        )}

        {/* 3. Sekme: PIN Yönetimi (sadece aktif grup için) */}
        {activeTab === 'pin' && (
          <form onSubmit={handlePinSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <p style={{ fontSize: '12px', color: '#71717a', margin: 0, lineHeight: 1.5 }}>
              PIN'i bilen kişi bu grubun yöneticisi kabul edilir. {hasPin
                ? 'Değiştirmek veya kaldırmak için önce mevcut PIN\'i girin.'
                : 'Bu grupta henüz PIN yok — aşağıya yeni bir PIN yazıp kaydedebilirsiniz.'}
            </p>

            {hasPin && (
              <div>
                <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>Mevcut PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinCurrentInput}
                  onChange={e => { setPinCurrentInput(e.target.value); setPinError(''); setPinSuccess(''); }}
                  style={{
                    width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff',
                    fontFamily: 'monospace', padding: '12px 14px', borderRadius: '8px', fontSize: '14px',
                    marginTop: '6px', boxSizing: 'border-box', outline: 'none',
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: '12px', color: '#a1a1aa', fontWeight: 'bold' }}>
                Yeni PIN {hasPin ? '(kaldırmak için boş bırakın)' : '(en az 4 karakter)'}
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={pinNewInput}
                onChange={e => { setPinNewInput(e.target.value); setPinError(''); setPinSuccess(''); }}
                style={{
                  width: '100%', background: '#18181b', border: '1px solid #3f3f46', color: '#fff',
                  fontFamily: 'monospace', padding: '12px 14px', borderRadius: '8px', fontSize: '14px',
                  marginTop: '6px', boxSizing: 'border-box', outline: 'none',
                }}
              />
            </div>

            {pinError && <div style={{ color: '#ef4444', fontSize: '13px', fontWeight: 'bold' }}>{pinError}</div>}
            {pinSuccess && <div style={{ color: '#4ade80', fontSize: '13px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}><ShieldCheck size={14} /> {pinSuccess}</div>}

            <button
              type="submit"
              disabled={isSavingPin || (hasPin && !pinCurrentInput)}
              style={{
                background: '#059669',
                color: '#fff',
                border: 'none',
                padding: '12px',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Lock size={16} /> {isSavingPin ? 'Kaydediliyor...' : 'PIN\'i Kaydet'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
