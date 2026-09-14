import { createClient } from '@supabase/supabase-js';

// Supabase Proje Bilgileriniz
const SUPABASE_URL = 'https://cbpdmwrglwphckukkige.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNicGRtd3JnbHdwaGNrdWtraWdlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzMzM2ODcsImV4cCI6MjEwMzkwOTY4N30.1qBrtIJUjt1ir6Ev9BtBgwRb_gc2kVHwnbTyaLxt76g';

// Global nesnede tek bir instance tutarak çift oluşumu engelle
declare global {
  var __supabaseInstance: ReturnType<typeof createClient> | undefined;
}

export const supabase =
  globalThis.__supabaseInstance ||
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  });

// DÜZELTİLEN SATIR: process.env yerine import.meta.env.DEV
// (import.meta as any).env kullanarak TS tip hatasını doğrudan aşın
if ((import.meta as any).env?.DEV) {
  globalThis.__supabaseInstance = supabase;
}