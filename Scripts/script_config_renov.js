import { loadSupaBseWithAuth } from './supabase.js';
import { loadSweetAlert2, showSuccessToast, showErrorToast } from './sweetalert2.js';
import { showAppLoader, hideAppLoader } from './loader_renovado.js';

// --- Forzar siempre tema oscuro ---
document.documentElement.dataset.theme = 'dark';

// --- Estado y Cliente Supabase ---
let client = null;

export async function initConfig() {
    showAppLoader('Cargando ajustes y cuenta...');
    try {
        initAppMeta();

        try {
            client = await loadSupaBseWithAuth();
        } catch (err) {
            console.warn('Error inicializando Supabase en configuración:', err);
        }

        await loadUserProfile();
        initAccountActions();
    } catch (err) {
        console.error('Error inicializando configuración:', err);
    } finally {
        hideAppLoader();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initConfig());
} else if (!window.__SPA_ROUTER_ACTIVE__) {
    initConfig();
}

// ==========================================================================
// 1. CARGA DE PERFIL DE USUARIO & FOTO DE GOOGLE
// ==========================================================================
async function loadUserProfile() {
    const headerPfp = document.getElementById('pfp');
    const headerFallback = document.getElementById('header_avatar_fallback');
    const headerInitials = document.getElementById('header_avatar_initials');

    const heroPfp = document.getElementById('hero_pfp');
    const heroFallback = document.getElementById('hero_avatar_fallback');
    const heroInitials = document.getElementById('hero_avatar_initials');

    const userNameEl = document.getElementById('config_user_name');
    const userEmailEl = document.getElementById('config_user_email');
    const userIdEl = document.getElementById('config_user_id');

    let photo = (localStorage.getItem('UserPhoto') || '').toString().trim();
    let userName = (localStorage.getItem('UserName') || '').toString().trim();
    let userId = (localStorage.getItem('UserID') || '').toString().trim();
    let userEmail = (localStorage.getItem('UserEmail') || '').toString().trim();

    // Sincronizar con Supabase Auth si falta algún dato o para actualizar la foto de Google
    try {
        if (!client) client = await loadSupaBseWithAuth();
        const { data: { session } } = await client.auth.getSession();
        if (session?.user) {
            const meta = session.user.user_metadata || {};
            const identity0 = Array.isArray(session.user.identities)
                ? session.user.identities[0]?.identity_data
                : null;

            if (!userId || userId === 'N/A') {
                userId = session.user.id;
                localStorage.setItem('UserID', userId);
            }

            if (!userName) {
                userName = (meta.full_name || meta.name || meta.user_name || meta.username || session.user.email || '').toString().trim();
                if (userName) localStorage.setItem('UserName', userName);
            }

            if (!userEmail) {
                userEmail = (session.user.email || meta.email || '').toString().trim();
                if (userEmail) localStorage.setItem('UserEmail', userEmail);
            }

            // Google OAuth almacena el avatar en avatar_url o picture
            const sessionPhoto = (meta.avatar_url || meta.picture || identity0?.avatar_url || identity0?.picture || '').toString().trim();
            if (sessionPhoto && (!photo || photo !== sessionPhoto)) {
                photo = sessionPhoto;
                localStorage.setItem('UserPhoto', photo);
            }
        }
    } catch (e) {
        console.warn('Error sincronizando perfil con sesión Supabase:', e);
    }

    const displayName = userName || 'Mi Negocio';
    const displayInitial = (displayName.charAt(0) || 'D').toUpperCase();

    // Actualizar nombre
    if (userNameEl) userNameEl.textContent = displayName;
    const headerTitleEl = document.getElementById('user_display_name');
    if (headerTitleEl) headerTitleEl.textContent = displayName;

    // Actualizar email o badge
    if (userEmailEl) {
        userEmailEl.textContent = userEmail || 'Conectado con Google';
    }

    // Actualizar ID
    if (userIdEl) {
        if (userId && userId !== 'N/A') {
            const shortId = userId.length > 14 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;
            userIdEl.textContent = `ID: ${shortId}`;
        } else {
            userIdEl.textContent = 'Modo Local';
        }
    }

    // Iniciales en fallbacks
    if (headerInitials) headerInitials.textContent = displayInitial;
    if (heroInitials) heroInitials.textContent = displayInitial;

    // Asignar y mostrar fotos si existen
    if (photo && photo.trim()) {
        // Enlaces de Google: generar versiones de alta resolución
        const photoUrlHeader = photo.replace(/=s\d+-c$/, '=s128-c').replace(/=s\d+$/, '=s128');
        const photoUrlHero = photo.replace(/=s\d+-c$/, '=s256-c').replace(/=s\d+$/, '=s256');

        if (headerPfp) {
            headerPfp.onload = () => {
                headerPfp.style.display = 'block';
                if (headerFallback) headerFallback.style.display = 'none';
            };
            headerPfp.onerror = () => {
                headerPfp.style.display = 'none';
                if (headerFallback) headerFallback.style.display = 'flex';
            };
            headerPfp.src = photoUrlHeader;
            headerPfp.style.display = 'block';
            if (headerFallback) headerFallback.style.display = 'none';
        }

        if (heroPfp) {
            heroPfp.onload = () => {
                heroPfp.style.display = 'block';
                if (heroFallback) heroFallback.style.display = 'none';
            };
            heroPfp.onerror = () => {
                heroPfp.style.display = 'none';
                if (heroFallback) heroFallback.style.display = 'flex';
            };
            heroPfp.src = photoUrlHero;
            heroPfp.style.display = 'block';
            if (heroFallback) heroFallback.style.display = 'none';
        }
    } else {
        if (headerPfp) {
            headerPfp.removeAttribute('src');
            headerPfp.style.display = 'none';
        }
        if (headerFallback) headerFallback.style.display = 'flex';

        if (heroPfp) {
            heroPfp.removeAttribute('src');
            heroPfp.style.display = 'none';
        }
        if (heroFallback) heroFallback.style.display = 'flex';
    }
}

// ==========================================================================
// 2. METADATOS DE LA APLICACIÓN (Año dinámico)
// ==========================================================================
function initAppMeta() {
    const anioEl = document.getElementById('anio');
    if (anioEl) {
        anioEl.textContent = new Date().getFullYear();
    }
}

// ==========================================================================
// 3. ACCIONES DE SEGURIDAD Y CUENTA (Cerrar sesión & Eliminar cuenta)
// ==========================================================================
function initAccountActions() {
    // 1. Cerrar Sesión (botón en el header)
    const btnLogout = document.getElementById('btn_header_logout') || document.getElementById('btn_cerrar_sesion');
    if (btnLogout) {
        btnLogout.addEventListener('click', cerrarSesionModal);
    }

    // 2. Eliminar Cuenta
    const btnDelete = document.getElementById('btn_eliminar_cuenta');
    if (btnDelete) {
        btnDelete.addEventListener('click', eliminarCuentaModal);
    }
}

async function cerrarSesionModal() {
    try {
        const Swal = await loadSweetAlert2();
        const res = await Swal.fire({
            title: '¿Cerrar sesión?',
            text: 'Tendrás que iniciar sesión nuevamente para acceder a tu panel.',
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: 'Cerrar sesión',
            cancelButtonText: 'Cancelar',
            reverseButtons: true,
            background: '#12161d',
            color: '#f0f2f8',
            confirmButtonColor: '#202632',
            cancelButtonColor: 'rgba(255, 255, 255, 0.08)'
        });

        if (!res.isConfirmed) return;

        if (client && client.auth) {
            try {
                await client.auth.signOut();
            } catch (e) {
                console.warn('Error en signOut:', e);
            }
        }

        localStorage.clear();
        window.location.href = '/index.html';

    } catch (err) {
        console.error('Error cerrando sesión:', err);
        localStorage.clear();
        window.location.href = '/index.html';
    }
}

async function eliminarCuentaModal() {
    try {
        let userId = (localStorage.getItem('UserID') || '').trim();

        if (!userId || userId === 'N/A') {
            if (client && client.auth) {
                const { data } = await client.auth.getUser();
                userId = data?.user?.id;
            }
        }

        if (!userId || userId === 'N/A') {
            await showErrorToast('No se encontró un usuario autenticado para eliminar.');
            return;
        }

        const Swal = await loadSweetAlert2();
        const res = await Swal.fire({
            title: '¿Eliminar tu cuenta permanentemente?',
            text: 'Esta acción es irreversible. Se eliminarán permanentemente tus clientes, registros de deudas, cobros y credenciales de acceso.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sí, eliminar definitivamente',
            cancelButtonText: 'Cancelar',
            reverseButtons: true,
            background: '#12161d',
            color: '#f0f2f8',
            confirmButtonColor: '#ff4d4f',
            cancelButtonColor: '#202632'
        });

        if (!res.isConfirmed) return;

        Swal.fire({
            title: 'Eliminando cuenta...',
            text: 'Por favor aguarda un instante mientras se eliminan todos tus registros.',
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            background: '#12161d',
            color: '#f0f2f8',
            didOpen: () => {
                Swal.showLoading();
            }
        });

        let accessToken = null;
        if (client && client.auth) {
            try {
                const sessRes = await client.auth.getSession();
                accessToken = sessRes?.data?.session?.access_token;
            } catch (_) { }
        }

        if (accessToken) {
            try {
                const apiRes = await fetch('/api/delete-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + accessToken
                    },
                    body: JSON.stringify({ userId })
                });

                if (!apiRes.ok) {
                    let errData = null;
                    try { errData = await apiRes.json(); } catch (_) { errData = { error: await apiRes.text() }; }
                    console.warn('Fallo en endpoint delete-user:', errData);
                }
            } catch (netErr) {
                console.warn('Error de red al invocar /api/delete-user:', netErr);
            }
        }

        if (client && client.auth) {
            try { await client.auth.signOut(); } catch (_) { }
        }

        localStorage.clear();
        await Swal.fire({
            title: 'Cuenta eliminada',
            text: 'Tu cuenta y sus datos han sido eliminados correctamente.',
            icon: 'success',
            confirmButtonText: 'Aceptar',
            background: '#12161d',
            color: '#f0f2f8',
            confirmButtonColor: '#ccff00'
        });

        window.location.href = '/index.html';

    } catch (err) {
        console.error('Error al eliminar cuenta:', err);
        await showErrorToast('Ocurrió un error inesperado al procesar la solicitud.');
    }
}
