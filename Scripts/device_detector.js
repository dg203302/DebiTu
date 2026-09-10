// ==========================================================================
// DETECTOR DE DISPOSITIVO Y VIEWPORT (DebiTú Neo-Fintech)
// Conmuta automáticamente entre plantillas móviles y desktop según la resolución.
// Preserva query parameters (?tipo=...) y hashes (#...).
// ==========================================================================

export const DESKTOP_BREAKPOINT = 1024; // Pantallas >= 1024px usan versión Desktop

const PAGE_PAIRS = {
    dashboard: {
        mobile: '/Plantillas_Renovadas/Dashboard_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Dashboard_renov_desktop.html'
    },
    clientes: {
        mobile: '/Plantillas_Renovadas/Clientes_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Clientes_renov_desktop.html'
    },
    operacion: {
        mobile: '/Plantillas_Renovadas/Operacion_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Operacion_renov_desktop.html'
    },
    estadisticas: {
        mobile: '/Plantillas_Renovadas/Estadisticas_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Estadisticas_renov_desktop.html'
    },
    config: {
        mobile: '/Plantillas_Renovadas/Config_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Config_renov_desktop.html'
    },
    login: {
        mobile: '/Plantillas_Renovadas/Login_renov.html',
        desktop: '/Plantillas_Renovadas_Desktop/Login_renov_desktop.html'
    }
};

export function isDesktopViewport() {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= DESKTOP_BREAKPOINT;
}

export function isCurrentDesktopPage() {
    if (typeof window === 'undefined') return false;
    return window.location.pathname.includes('_desktop');
}

/**
 * Resuelve la ruta canónica (/Plantillas_Renovadas/... vs /Plantillas_Renovadas_Desktop/...)
 * según el viewport objetivo (móvil o desktop), tolerando clean URLs (sin .html), parámetros y mayúsculas/minúsculas.
 */
export function resolveResponsivePath(pathname, isDesktop = isDesktopViewport()) {
    if (!pathname) return pathname;

    const cleanPath = pathname.split('?')[0].split('#')[0];
    if (cleanPath === '/' || cleanPath === '/index.html' || cleanPath === 'index.html') {
        return pathname;
    }

    const segments = cleanPath.split('/').filter(Boolean);
    const filename = (segments[segments.length - 1] || '').toLowerCase().replace(/\.html$/, '');

    // 1. Coincidencia directa en pares de páginas conocidas
    for (const [key, pair] of Object.entries(PAGE_PAIRS)) {
        if (filename.includes(key)) {
            return isDesktop ? pair.desktop : pair.mobile;
        }
    }

    // 2. Derivación heurística para rutas dinámicas o no estándar
    if (isDesktop) {
        if (cleanPath.includes('/Plantillas_Renovadas/') && !cleanPath.includes('_desktop')) {
            return cleanPath.replace('/Plantillas_Renovadas/', '/Plantillas_Renovadas_Desktop/').replace(/(\.html)?$/, '_desktop.html');
        }
    } else {
        if (cleanPath.includes('/Plantillas_Renovadas_Desktop/')) {
            return cleanPath.replace('/Plantillas_Renovadas_Desktop/', '/Plantillas_Renovadas/').replace(/_desktop(\.html)?$/, '.html');
        }
    }

    return pathname;
}

/**
 * Normaliza y resuelve un objeto URL o string de URL a la variante responsive correspondiente (Móvil vs Desktop).
 * Preserva origen, query params y hashes.
 */
export function resolveResponsiveUrl(urlInput, isDesktop = isDesktopViewport()) {
    try {
        const origin = (typeof window !== 'undefined' && window.location?.origin)
            ? window.location.origin
            : 'http://localhost';

        const urlObj = (typeof urlInput === 'string')
            ? new URL(urlInput, origin)
            : new URL(urlInput.href || urlInput.toString(), origin);

        if (origin && urlObj.origin !== origin) {
            return urlObj;
        }

        const newPath = resolveResponsivePath(urlObj.pathname, isDesktop);
        if (newPath && newPath !== urlObj.pathname) {
            urlObj.pathname = newPath;
        }
        return urlObj;
    } catch (_) {
        return urlInput;
    }
}

export function getEquivalentPage(targetDesktop) {
    const currentPath = window.location.pathname;
    const resolved = resolveResponsivePath(currentPath, targetDesktop);
    return (resolved !== currentPath) ? resolved : null;
}

export function checkAndSwitchViewport() {
    if (typeof window === 'undefined') return;

    const isDesktop = isDesktopViewport();
    const isCurrentlyDesktop = isCurrentDesktopPage();

    // Si coincide el viewport con la plantilla cargada, no hacer nada
    if ((isDesktop && isCurrentlyDesktop) || (!isDesktop && !isCurrentlyDesktop)) {
        return;
    }

    const targetUrlPath = resolveResponsivePath(window.location.pathname, isDesktop);
    if (!targetUrlPath || targetUrlPath === window.location.pathname) return;

    // Preservar query parameters y hash
    const fullTarget = targetUrlPath + window.location.search + window.location.hash;

    // Al cambiar de dispositivo/layout (móvil vs desktop), realizamos reemplazo de ubicación
    // para garantizar el montaje limpio del layout y estilos correspondientes
    window.location.replace(fullTarget);
}

// Escuchar redimensionamiento con debounce
let resizeTimer = null;
export function initDeviceDetector() {
    if (typeof window === 'undefined') return;

    // Verificación inicial inmediata
    checkAndSwitchViewport();

    window.addEventListener('resize', () => {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            checkAndSwitchViewport();
        }, 150);
    });
}

// Auto-arranque
initDeviceDetector();

if (typeof window !== 'undefined') {
    window.checkAndSwitchViewport = checkAndSwitchViewport;
    window.resolveResponsivePath = resolveResponsivePath;
    window.resolveResponsiveUrl = resolveResponsiveUrl;
    window.isDesktopViewport = isDesktopViewport;
}
