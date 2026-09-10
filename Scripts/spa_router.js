// ==========================================================================
// ROUTER SPA CLIENT-SIDE (DebiTú Neo-Fintech)
// Permite navegación fluida e instantánea entre plantillas sin recargas de página.
// Coordina la pantalla de carga con la consulta y formateo de datos.
// ==========================================================================

import { showAppLoader, hideAppLoader } from './loader_renovado.js';

window.__SPA_ROUTER_ACTIVE__ = true;

// Mapeo de rutas a módulos de vista
const ROUTE_HANDLERS = {
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
    }
};

function getRouteKey(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const filename = segments[segments.length - 1] || 'index.html';
    return filename;
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

        const handlerConfig = ROUTE_HANDLERS[routeKey];

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

        // Actualizar Contenedor Principal (.app-viewport)
        const currentViewport = document.querySelector('.app-viewport');
        const newViewport = newDoc.querySelector('.app-viewport');

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

        // Sincronizar dock inferior activo
        updateActiveDock(targetUrl.pathname);

        // Scroll al tope
        window.scrollTo({ top: 0, behavior: 'instant' });

        // Ejecutar inicialización de la vista
        if (handlerConfig && handlerConfig.module) {
            try {
                // Importar módulo de la vista (la caché de ESM previene doble descarga)
                const mod = await import(`${handlerConfig.module}?v=${Date.now()}`);
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

    } catch (err) {
        console.error('Error en navegación SPA:', err);
        hideAppLoader();
        window.location.href = url;
    }
}

function updateActiveDock(pathname) {
    const currentFile = getRouteKey(pathname);
    const navLinks = document.querySelectorAll('.bottom-nav-bar .nav-link, .dock-item');
    navLinks.forEach(item => {
        const href = item.getAttribute('href') || '';
        if (href.includes(currentFile)) {
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

if (typeof window !== 'undefined') {
    window.spaNavigate = spaNavigate;
}
