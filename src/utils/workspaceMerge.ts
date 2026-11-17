import type { Song, Setlist, BandMember } from '../types/song';

/**
 * Üç yönlü birleştirme (3-way merge).
 *
 * Konum: src/utils/workspaceMerge.ts
 *
 * İki kişi aynı grubu aynı anda değiştirdiğinde, eskiden son kaydeden
 * diğerinin değişikliğini tamamen siliyordu. Artık kayıt sırasında
 * "başkası bu arada değiştirmiş" durumu fark edilir ve:
 *   base   = bu cihazın en son gördüğü bulut hali
 *   mine   = bu cihazdaki güncel hal
 *   theirs = buluttaki yeni hal (başkasının kaydı)
 * şarkı ve setlist bazında birleştirilir.
 *
 * Kurallar (her şarkı / setlist için, id'ye göre):
 *  - Yalnızca bir taraf değiştirdiyse o tarafın hali alınır.
 *  - İki taraf da aynı öğeyi değiştirdiyse bu cihazın hali kazanır.
 *  - Bir taraf sildi, diğeri dokunmadıysa silinir.
 *  - Bir taraf sildi, diğeri düzenlediyse düzenlenmiş hal korunur
 *    (veri kaybetmektense fazlası iyidir).
 */

export interface WorkspaceData {
  name: string;
  songs: Song[];
  setlists: Setlist[];
  members: BandMember[];
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mergeById<T extends { id: string }>(base: T[], mine: T[], theirs: T[]): T[] {
  const B = new Map(base.map(x => [x.id, x]));
  const M = new Map(mine.map(x => [x.id, x]));
  const T = new Map(theirs.map(x => [x.id, x]));

  // Sıra: önce sadece karşı tarafın eklediği yeni öğeler (uygulama yeni
  // öğeleri listenin başına ekliyor), sonra bu cihazdaki sıra.
  const theirAdditions = theirs.filter(x => !M.has(x.id) && !B.has(x.id)).map(x => x.id);
  const order = [...theirAdditions, ...mine.map(x => x.id), ...theirs.map(x => x.id)];

  const result: T[] = [];
  const seen = new Set<string>();

  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);
    const b = B.get(id);
    const m = M.get(id);
    const t = T.get(id);

    if (m && t) {
      const mineChanged = !b || !same(b, m);
      result.push(mineChanged ? m : t);
    } else if (m && !t) {
      // Ya ben ekledim ya da karşı taraf sildi.
      if (b && same(b, m)) continue; // karşı taraf sildi, ben dokunmadım → sil
      result.push(m);
    } else if (!m && t) {
      // Ya karşı taraf ekledi ya da ben sildim.
      if (b && same(b, t)) continue; // ben sildim, karşı taraf dokunmadı → sil
      result.push(t);
    }
  }
  return result;
}

export function mergeWorkspaceData(base: WorkspaceData, mine: WorkspaceData, theirs: WorkspaceData): WorkspaceData {
  return {
    name: mine.name !== base.name ? mine.name : theirs.name,
    songs: mergeById(base.songs || [], mine.songs || [], theirs.songs || []),
    setlists: mergeById(base.setlists || [], mine.setlists || [], theirs.setlists || []),
    members: mergeById(base.members || [], mine.members || [], theirs.members || []),
  };
}
