import { loadSupaBseWithAuth } from './supabase.js';
import { showErrorToast } from './sweetalert2.js';
import { showAppLoader, hideAppLoader } from './loader_renovado.js';

// Tema siempre oscuro
document.documentElement.dataset.theme = 'dark';

let client = null;

export async function initLogin() {
    showAppLoader('Verificando credenciales...');
    try {
        initAppMeta();

        try {
            client = await loadSupaBseWithAuth();
            await verificarSesionExistente();
        } catch (err) {
            console.warn('Error inicializando Supabase en login:', err);
        }

        initGoogleLogin();
    } catch (err) {
        console.error('Error inicializando login:', err);
    } finally {
        hideAppLoader();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initLogin());
} else if (!window.__SPA_ROUTER_ACTIVE__) {
    initLogin();
}

function initAppMeta() {
    const anioEl = document.getElementById('anio');
    if (anioEl) {
        anioEl.textContent = new Date().getFullYear();
    }
}

async function verificarSesionExistente() {
    const userId = localStorage.getItem('UserID');
    if (userId && userId !== 'N/A') {
        window.location.href = '/Plantillas_Renovadas/Dashboard_renov.html';
        return;
    }

    if (client && client.auth) {
        try {
            const { data: { session } } = await client.auth.getSession();
            if (session?.user) {
                localStorage.setItem('UserID', session.user.id);
                const meta = session.user.user_metadata || {};
                const name = meta.full_name || meta.name || session.user.email || 'Mi Negocio';
                localStorage.setItem('UserName', name);
                const photo = meta.avatar_url || meta.picture || '';
                if (photo) localStorage.setItem('UserPhoto', photo);

                window.location.href = '/Plantillas_Renovadas/Dashboard_renov.html';
            }
        } catch (e) {
            console.warn('Error verificando sesión previa:', e);
        }
    }
}

function initGoogleLogin() {
    const btnGoogle = document.getElementById('btn_google');
    if (!btnGoogle) return;

    btnGoogle.addEventListener('click', async (e) => {
        e.preventDefault();

        const originalContent = btnGoogle.innerHTML;
        btnGoogle.disabled = true;
        btnGoogle.style.opacity = '0.8';
        btnGoogle.innerHTML = `
            <div class="loader-spinner" style="width: 18px; height: 18px; border-width: 2px; border-color: #12161d; border-top-color: transparent;"></div>
            <span>Conectando con Google...</span>
        `;

        try {
            if (!client) client = await loadSupaBseWithAuth();

            const redirectTarget = window.location.origin + '/';
            const { error } = await client.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectTarget
                }
            });

            if (error) {
                console.error('Error en signInWithOAuth:', error);
                await showErrorToast('Error al conectar con Google: ' + (error.message || 'Intente nuevamente.'));
                btnGoogle.disabled = false;
                btnGoogle.style.opacity = '1';
                btnGoogle.innerHTML = originalContent;
            }
        } catch (err) {
            console.error('Excepción al iniciar sesión:', err);
            await showErrorToast('Ocurrió un error inesperado al conectar.');
            btnGoogle.disabled = false;
            btnGoogle.style.opacity = '1';
            btnGoogle.innerHTML = originalContent;
        }
    });
}
