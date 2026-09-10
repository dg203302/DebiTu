// ==========================================================================
// ROUTER SPA CLIENT-SIDE (DebiTú Neo-Fintech)
// Permite navegación fluida e instantánea entre plantillas sin recargas de página.
// Coordina la pantalla de carga con la consulta y formateo de datos.
// ==========================================================================

import { showAppLoader, hideAppLoader } from './loader_renovado.js';

window.__SPA_ROUTER_ACTIVE__ = true;

// Mapeo de rutas a módulos de vista (Móvil y Desktop)
const ROUTE_HANDLERS = {
    // Móvil
    'Dashboard_renov.html': {
        module: '/Scripts/script_dashboard_renov.js',
        init: 'initDashboard',
        loadingMsg: 'Sincronizando finanzas...'
    },
    'Clientes_renov.html': {
        module: '/Scripts/script_clientes_renov.js',
        init: 'initClientes',
        loadingMsg: 'Cargando directorio de clientes...'
    },
    'Operacion_renov.html': {
        module: '/Scripts/script_operacion_renov.js',
        init: 'initOperacion',
        loadingMsg: 'Cargando operaciones y clientes...'
    },
    'Estadisticas_renov.html': {
        module: '/Scripts/script_estadisticas_renov.js',
        init: 'initEstadisticas',
        loadingMsg: 'Calculando métricas y estadísticas...'
    },
    'Config_renov.html': {
        module: '/Scripts/script_config_renov.js',
        init: 'initConfig',
        loadingMsg: 'Cargando ajustes y cuenta...'
    },
    'Login_renov.html': {
        module: '/Scripts/script_login_renov.js',
        init: 'initLogin',
        loadingMsg: 'Verificando credenciales...'
    },

    // Desktop
    'Dashboard_renov_desktop.html': {
        module: '/Scripts/script_dashboard_renov.js',
        init: 'initDashboard',
        loadingMsg: 'Sincronizando finanzas en escritorio...'
    },
    'Clientes_renov_desktop.html': {
        module: '/Scripts/script_clientes_renov.js',
        init: 'initClientes',
        loadingMsg: 'Cargando directorio de clientes...'
    },
    'Operacion_renov_desktop.html': {
        module: '/Scripts/script_operacion_renov.js',
        init: 'initOperacion',
        loadingMsg: 'Cargando operaciones...'
    },
    'Estadisticas_renov_desktop.html': {
        module: '/Scripts/script_estadisticas_renov.js',
        init: 'initEstadisticas',
        loadingMsg: 'Calculando analíticas y estadísticas...'
    },
    'Config_renov_desktop.html': {
        module: '/Scripts/script_config_renov.js',
        init: 'initConfig',
        loadingMsg: 'Cargando ajustes...'
    },
    'Login_renov_desktop.html': {
        module: '/Scripts/script_login_renov.js',
        init: 'initLogin',
        loadingMsg: 'Verificando credenciales...'
    }
};

function getRouteKey(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const filename = segments[segments.length - 1] || 'index.html';
    return filename;
}

function findRouteHandler(pathname) {
    const routeKey = getRouteKey(pathname).toLowerCase();
    for (const [key, handler] of Object.entries(ROUTE_HANDLERS)) {
        if (key.toLowerCase() === routeKey) {
            return handler;
        }
    }
    return null;
}

// ==========================================================================
// SINCRONIZACIÓN CENTRALIZADA DEL PERFIL DE USUARIO
// Aplica nombre, foto, iniciales, email e ID a todos los elementos del DOM
// tanto en vista móvil como en barra lateral de escritorio.
// ==========================================================================
export async function syncUserProfile() {
    let photo = (localStorage.getItem('UserPhoto') || '').toString().trim();
    let userName = (localStorage.getItem('UserName') || '').toString().trim();
    let userId = (localStorage.getItem('UserID') || '').toString().trim();
    let userEmail = (localStorage.getItem('UserEmail') || '').toString().trim();

    // Si falta alguno de los datos clave en localStorage, consultar sesión activa en Supabase
    if (!photo || !userName || !userId || !userEmail) {
        try {
            const { loadSupaBseWithAuth } = await import('./supabase.js');
            const clientAuth = await loadSupaBseWithAuth();
            const { data: { session } } = await clientAuth.auth.getSession();
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
                if (!photo) {
                    photo = (meta.avatar_url || meta.picture || identity0?.avatar_url || identity0?.picture || '').toString().trim();
                    if (photo) localStorage.setItem('UserPhoto', photo);
                }
            }
        } catch (e) {
            console.warn('Error sincronizando sesión en router:', e);
        }
    }

    const displayName = userName || 'Mi Negocio';
    const displayInitial = (displayName.charAt(0) || 'D').toUpperCase();

    // 1. Nombre de usuario (headers, sidebars y tarjetas de perfil)
    document.querySelectorAll('#user_display_name, .desktop-profile-name').forEach(el => {
        el.textContent = displayName;
    });
    const configUserName = document.getElementById('config_user_name');
    if (configUserName) configUserName.textContent = displayName;

    // 2. Email de usuario (tarjeta de configuración)
    const configUserEmail = document.getElementById('config_user_email');
    if (configUserEmail) {
        configUserEmail.textContent = userEmail || 'Conectado con Google';
    }

    // 3. ID de usuario (tarjeta de configuración y badges)
    const configUserId = document.getElementById('config_user_id');
    if (configUserId) {
        if (userId && userId !== 'N/A') {
            const shortId = userId.length > 14 ? `${userId.slice(0, 6)}...${userId.slice(-4)}` : userId;
            configUserId.textContent = `ID: ${shortId}`;
        } else {
            configUserId.textContent = 'Modo Local';
        }
    }

    // 4. Iniciales de fallback (header móvil, sidebar desktop y hero config)
    document.querySelectorAll('#header_avatar_initials, #hero_avatar_initials, .header-avatar-fallback span, .config-avatar-fallback-huge span').forEach(el => {
        el.textContent = displayInitial;
    });

    // 5. Fotos de avatar
    if (photo && photo.trim()) {
        const photoUrlHeader = photo.includes('googleusercontent.com')
            ? photo.replace(/=s\d+-c$/, '=s128-c').replace(/=s\d+$/, '=s128')
            : photo;
        const photoUrlHero = photo.includes('googleusercontent.com')
            ? photo.replace(/=s\d+-c$/, '=s256-c').replace(/=s\d+$/, '=s256')
            : photo;

        // Header y Sidebar avatars
        document.querySelectorAll('#pfp, .header-avatar-img').forEach(pfpEl => {
            const fallback = pfpEl.parentElement ? pfpEl.parentElement.querySelector('.header-avatar-fallback') : document.getElementById('header_avatar_fallback');
            pfpEl.onload = () => {
                pfpEl.style.display = 'block';
                if (fallback) fallback.style.display = 'none';
            };
            pfpEl.onerror = () => {
                pfpEl.style.display = 'none';
                if (fallback) fallback.style.display = 'flex';
            };
            pfpEl.src = photoUrlHeader;
            pfpEl.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
        });

        // Hero avatar en pantalla de Configuración
        const heroPfp = document.getElementById('hero_pfp');
        const heroFallback = document.getElementById('hero_avatar_fallback');
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
        document.querySelectorAll('#pfp, .header-avatar-img').forEach(pfpEl => {
            pfpEl.removeAttribute('src');
            pfpEl.style.display = 'none';
            const fallback = pfpEl.parentElement ? pfpEl.parentElement.querySelector('.header-avatar-fallback') : document.getElementById('header_avatar_fallback');
            if (fallback) fallback.style.display = 'flex';
        });
        const heroPfp = document.getElementById('hero_pfp');
        const heroFallback = document.getElementById('hero_avatar_fallback');
        if (heroPfp) {
            heroPfp.removeAttribute('src');
            heroPfp.style.display = 'none';
        }
        if (heroFallback) heroFallback.style.display = 'flex';
    }

    // 6. Actualizar año en pie de página
    const anioEl = document.getElementById('anio');
    if (anioEl) anioEl.textContent = new Date().getFullYear();
}

export async function spaNavigate(url, isPopState = false) {
    try {
        const targetUrl = new URL(url, window.location.origin);

        // Si es hacia un host distinto, usar navegación normal
        if (targetUrl.origin !== window.location.origin) {
            window.location.href = url;
            return;
        }

        const routeKey = getRouteKey(targetUrl.pathname);

        // Si la navegación es al índice raíz o index.html, permitir carga completa para verificación de sesión
        if (routeKey === 'index.html' || targetUrl.pathname === '/' || targetUrl.pathname === '/index.html') {
            window.location.href = targetUrl.href;
            return;
        }

        const handlerConfig = findRouteHandler(targetUrl.pathname);

        const loadingMsg = handlerConfig?.loadingMsg || 'Sincronizando datos...';
        showAppLoader(loadingMsg);

        // Descargar nuevo HTML
        const response = await fetch(targetUrl.href, {
            headers: { 'X-Requested-With': 'SPA-Router' }
        });

        if (!response.ok) {
            console.warn('Fallo fetch SPA, recargando página normal:', response.status);
            window.location.href = targetUrl.href;
            return;
        }

        const htmlText = await response.text();
        const parser = new DOMParser();
        const newDoc = parser.parseFromString(htmlText, 'text/html');

        // Actualizar título del documento
        if (newDoc.title) {
            document.title = newDoc.title;
        }

        // Actualizar URL en historial si no proviene de popstate
        if (!isPopState) {
            history.pushState({ spa: true, url: targetUrl.href }, '', targetUrl.href);
        }

        // Si cambia el tipo de layout (Móvil vs Desktop), hacer navegación completa para montar estructura correcta
        const currentIsDesktop = Boolean(document.querySelector('.desktop-app-layout'));
        const newIsDesktop = Boolean(newDoc.querySelector('.desktop-app-layout'));
        if (currentIsDesktop !== newIsDesktop) {
            window.location.href = targetUrl.href;
            return;
        }

        // Actualizar Contenedor Principal (.desktop-main-wrap o .app-viewport)
        const currentViewport = document.querySelector('.desktop-main-wrap') || document.querySelector('.app-viewport');
        const newViewport = newDoc.querySelector('.desktop-main-wrap') || newDoc.querySelector('.app-viewport');

        if (currentViewport && newViewport) {
            currentViewport.innerHTML = newViewport.innerHTML;
            currentViewport.classList.remove('spa-view-enter');
            // Forzar reflow para reiniciar animación
            void currentViewport.offsetWidth;
            currentViewport.classList.add('spa-view-enter');
        } else {
            // Fallback si no hay .app-viewport
            document.body.innerHTML = newDoc.body.innerHTML;
        }

        // Sincronizar modales que existan fuera del viewport en newDoc
        document.querySelectorAll('body > .neo-modal-overlay, body > .fintech-modal-overlay').forEach(m => m.remove());
        newDoc.querySelectorAll('body > .neo-modal-overlay, body > .fintech-modal-overlay').forEach(m => {
            document.body.appendChild(document.importNode(m, true));
        });

        // Sincronizar dock inferior o sidebar activo
        updateActiveDock(targetUrl.pathname);

        // Scroll al tope
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Ejecutar inicialización de la vista
        if (handlerConfig && handlerConfig.module) {
            try {
                // Importar módulo de la vista usando URL fija para respetar la caché ESM.
                // IMPORTANTE: NO usar ?v=Date.now() — eso crea instancias duplicadas del módulo
                // en cada navegación, causando condiciones de carrera con listeners stale.
                const mod = await import(handlerConfig.module);
                if (typeof mod[handlerConfig.init] === 'function') {
                    await mod[handlerConfig.init]();
                } else {
                    hideAppLoader();
                }
            } catch (err) {
                console.error(`Error ejecutando ${handlerConfig.init}:`, err);
                hideAppLoader();
            }
        } else {
            hideAppLoader();
        }

        // Re-sincronizar perfil DESPUÉS de que init*() completó,
        // para asegurar que cualquier nodo reconstruido tenga los datos correctos.
        syncUserProfile();

    } catch (err) {
        console.error('Error en navegación SPA:', err);
        hideAppLoader();
        window.location.href = url;
    }
}

function updateActiveDock(pathname) {
    const currentFile = getRouteKey(pathname);
    const cleanCurrent = currentFile.toLowerCase().replace('_desktop.html', '').replace('.html', '').replace('_renov', '');
    const navLinks = document.querySelectorAll('.bottom-nav-bar .nav-link, .dock-item, .desktop-nav-link');
    navLinks.forEach(item => {
        const href = (item.getAttribute('href') || '').toLowerCase();
        if (cleanCurrent && href.includes(cleanCurrent)) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
}

// Interceptar clics en enlaces
function initLinkInterceptor() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        // Ignorar descargas, nueva pestaña o protocolos externos
        if (link.target === '_blank' || link.hasAttribute('download')) return;
        const href = link.getAttribute('href');
        if (!href) return;

        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('tel:') || href.startsWith('mailto:') || href.startsWith('https://wa.me')) {
            return;
        }

        try {
            const urlObj = new URL(href, window.location.origin);
            if (urlObj.origin !== window.location.origin) return;

            // Es enlace interno de nuestra app
            e.preventDefault();
            spaNavigate(urlObj.href);
        } catch (_) {
            // URL no válida, permitir comportamiento estándar
        }
    });
}

// Soporte de botones Atrás / Adelante del navegador
function initHistoryListener() {
    window.addEventListener('popstate', (e) => {
        spaNavigate(window.location.href, true);
    });
}

// Inicialización del router
initLinkInterceptor();
initHistoryListener();

// Sincronización inmediata al cargar el script
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => syncUserProfile());
} else {
    syncUserProfile();
}

if (typeof window !== 'undefined') {
    window.spaNavigate = spaNavigate;
    window.syncUserProfile = syncUserProfile;
}
