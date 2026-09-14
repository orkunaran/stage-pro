export interface Song {
  id: string;
  title: string;
  artist: string;
  baseKey: string;
  scaleType?: string;
  tempo: number;
  timeSignature: string;
  rawChordPro: string;
  drawingData?: string; // Canvas çizgi/çizim JSON verisi
  updatedAt: number;
}

export interface SetlistItem {
  type: 'song' | 'break';
  songId?: string;
  breakTitle?: string;
}

export interface Setlist {
  id: string;
  name: string;
  items: SetlistItem[];
}

export interface BandWorkspace {
  id: string;
  name: string;
  songs: Song[];
  setlists: Setlist[];
  pinHash?: string | null;   // ← YENİ
}

export interface BandMember {
  id: string;
  name: string;
  role?: string; // enstrüman / rol, isteğe bağlı
}

export interface BandWorkspace {
  // ...mevcut alanlar
  members: BandMember[];
}