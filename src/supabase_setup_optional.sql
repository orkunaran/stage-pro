-- OPSIYONEL / İLERİ SEVİYE — istemci tarafı PIN kontrolüne ek olarak
-- gerçek sunucu taraflı koruma istiyorsanız (Supabase SQL editöründe çalıştırın).
--
-- Mevcut app kodu PIN hash'ini `workspaces.pin_hash` sütununda tutar ve
-- karşılaştırmayı tarayıcıda yapar. Bu, sıradan "linkten göz atma"yı
-- engeller ama anon key'i bilen biri tabloyu doğrudan sorgulayıp
-- pin_hash'i okuyup çevrimdışı deneyebilir. Aşağıdaki adımlar bunu urlanır:

-- 1) pin_hash sütunu yoksa ekleyin:
alter table workspaces add column if not exists pin_hash text;

-- 2) RLS'yi açın ve anon rolünün tabloyu DOĞRUDAN okumasını/yazmasını kapatın.
alter table workspaces enable row level security;
drop policy if exists "public read" on workspaces;
drop policy if exists "public write" on workspaces;

-- 3) Sadece bu RPC fonksiyonları üzerinden erişim sağlayın (pin_hash asla
--    doğrudan client'a dönmez):
create or replace function get_workspace(p_id text, p_pin text default null)
returns table (id text, name text, data jsonb, has_pin boolean)
language plpgsql security definer as $$
begin
  return query
  select w.id, w.name, w.data, (w.pin_hash is not null)
  from workspaces w
  where w.id = p_id
    and (w.pin_hash is null or w.pin_hash = encode(digest(p_id || '::' || coalesce(p_pin, ''), 'sha256'), 'hex'));
end;
$$;

create or replace function upsert_workspace(p_id text, p_name text, p_data jsonb, p_current_pin text default null, p_new_pin text default null)
returns boolean
language plpgsql security definer as $$
declare
  existing_hash text;
begin
  select pin_hash into existing_hash from workspaces where id = p_id;

  if existing_hash is not null and existing_hash <> encode(digest(p_id || '::' || coalesce(p_current_pin, ''), 'sha256'), 'hex') then
    return false; -- yanlış PIN, yazmaya izin verme
  end if;

  insert into workspaces (id, name, data, pin_hash, updated_at)
  values (
    p_id, p_name, p_data,
    case when p_new_pin is not null and length(trim(p_new_pin)) >= 4
         then encode(digest(p_id || '::' || trim(p_new_pin), 'sha256'), 'hex')
         else existing_hash end,
    now()
  )
  on conflict (id) do update set
    name = excluded.name,
    data = excluded.data,
    pin_hash = excluded.pin_hash,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

grant execute on function get_workspace(text, text) to anon;
grant execute on function upsert_workspace(text, text, jsonb, text, text) to anon;
