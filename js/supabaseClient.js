import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jrtkiymvewzpugyqvkoo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpydGtpeW12ZXd6cHVneXF2a29vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NzU5NDIsImV4cCI6MjA5ODU1MTk0Mn0.3HIn8yF3Y-laRTTrFZ3afMl3rOk2uPGE-di3ZX81yoM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
