/**
 * Grup PIN'lerini hash'lemek için basit yardımcı fonksiyonlar.
 *
 * Konum önerisi: src/utils/pin.ts
 *
 * ÖNEMLİ SINIRLAMA: Bu proje sadece Supabase anon key + istemci tarafı
 * mantığıyla çalıştığı için, buradaki hash istemci tarafında üretilip
 * `workspaces` tablosuna yazılıyor ve karşılaştırma da istemci tarafında
 * yapılıyor. Bu, PIN'i "tesadüfen görme / tahmin etme" karşısında korur
 * ve normal kullanım akışında PIN'siz gruplara göz atmayı engeller.
 * Ancak anon key'i bilen biri Supabase REST API'sine doğrudan istek atıp
 * pin_hash sütununu okuyup çevrimdışı kaba kuvvet deneyebilir. Gerçek
 * (sunucu taraflı) koruma için depoda paylaşılan `supabase_setup.sql`
 * dosyasındaki RLS + RPC fonksiyonlarını uygulamanızı öneririm.
 */

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Aynı PIN'in farklı gruplarda aynı hash'i üretmemesi için grup ID'sini
// tuz (salt) olarak karışıma katıyoruz.
export async function hashWorkspacePin(workspaceId: string, pin: string): Promise<string> {
  const normalized = pin.trim();
  return sha256Hex(`${workspaceId}::${normalized}`);
}

export async function verifyWorkspacePin(
  workspaceId: string,
  pin: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  // PIN belirlenmemiş gruplar herkese açık kalır (geriye dönük uyumluluk).
  if (!storedHash) return true;
  if (!pin) return false;
  const candidate = await hashWorkspacePin(workspaceId, pin);
  return candidate === storedHash;
}
