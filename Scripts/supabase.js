var supabase_promise = null;

function ensureSupabase() {
    if (typeof window !== 'undefined' && window.supabase) {
        return Promise.resolve(window.supabase);
    }
    if (supabase_promise) return supabase_promise;
    supabase_promise = new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-lib="supabase"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.supabase));
            existing.addEventListener('error', () => reject(new Error('Failed to load Supabase script.')));
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.async = true;
        script.defer = true;
        script.dataset.lib = 'supabase';
        script.onload = () => resolve(window.supabase);
        script.onerror = (error) => {
            console.error('Error loading Supabase:', error);
            reject(new Error('Failed to load Supabase script.'));
        };
        document.head.appendChild(script);
    });
    return supabase_promise;
}
export async function loadSupabase() {
    const supabaseClientModule = await ensureSupabase();

    const supabaseUrl = 'https://mypinjltofzmlscantol.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cGluamx0b2Z6bWxzY2FudG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTg5MzIsImV4cCI6MjA3Nzc3NDkzMn0.uCuim1q0Id86pBR0BIj2IwBcQyd4TznT5G6n727kVtw';

    const client = supabaseClientModule.createClient(supabaseUrl, supabaseKey); 
    
    return client;
}
export async function loadSupaBseWithAuth() {
    const supabaseClientModule = await ensureSupabase();
    const supabaseUrl = 'https://mypinjltofzmlscantol.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cGluamx0b2Z6bWxzY2FudG9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxOTg5MzIsImV4cCI6MjA3Nzc3NDkzMn0.uCuim1q0Id86pBR0BIj2IwBcQyd4TznT5G6n727kVtw';

    const client = supabaseClientModule.createClient(supabaseUrl, supabaseKey, { auth: {persistSession: true,autoRefreshToken: false, storage: localStorage}}, {admin: true});
    return client;
}