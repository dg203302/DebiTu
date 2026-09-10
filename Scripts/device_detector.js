// ==========================================================================
// DETECTOR DE DISPOSITIVO Y VIEWPORT (DebiTú Neo-Fintech)
// Conmuta automáticamente entre plantillas móviles y desktop según la resolución.
// Preserva query parameters (?tipo=...) y hashes (#...).
// ==========================================================================

export const DESKTOP_BREAKPOINT = 1024; // Pantallas >= 1024px usan versión Desktop

const PAIR_MAP = {
    // Móvil -> Desktop
    '/Plantillas_Renovadas/Dashboard_renov.html': '/Plantillas_Renovadas_Desktop/Dashboard_renov_desktop.html',
    '/Plantillas_Renovadas/Clientes_renov.html': '/Plantillas_Renovadas_Desktop/Clientes_renov_desktop.html',
    '/Plantillas_Renovadas/Operacion_renov.html': '/Plantillas_Renovadas_Desktop/Operacion_renov_desktop.html',
    '/Plantillas_Renovadas/Estadisticas_renov.html': '/Plantillas_Renovadas_Desktop/Estadisticas_renov_desktop.html',
    '/Plantillas_Renovadas/Config_renov.html': '/Plantillas_Renovadas_Desktop/Config_renov_desktop.html',
    '/Plantillas_Renovadas/Login_renov.html': '/Plantillas_Renovadas_Desktop/Login_renov_desktop.html',

    // Desktop -> Móvil
    '/Plantillas_Renovadas_Desktop/Dashboard_renov_desktop.html': '/Plantillas_Renovadas/Dashboard_renov.html',
    '/Plantillas_Renovadas_Desktop/Clientes_renov_desktop.html': '/Plantillas_Renovadas/Clientes_renov.html',
    '/Plantillas_Renovadas_Desktop/Operacion_renov_desktop.html': '/Plantillas_Renovadas/Operacion_renov.html',
    '/Plantillas_Renovadas_Desktop/Estadisticas_renov_desktop.html': '/Plantillas_Renovadas/Estadisticas_renov.html',
    '/Plantillas_Renovadas_Desktop/Config_renov_desktop.html': '/Plantillas_Renovadas/Config_renov.html',
    '/Plantillas_Renovadas_Desktop/Login_renov_desktop.html': '/Plantillas_Renovadas/Login_renov.html'
};

export function isDesktopViewport() {
    return window.innerWidth >= DESKTOP_BREAKPOINT;
}

export function isCurrentDesktopPage() {
    return window.location.pathname.includes('_desktop');
}

export function getEquivalentPage(targetDesktop) {
    const currentPath = window.location.pathname;
    
    // Buscar en el mapa exacto
    for (const [source, dest] of Object.entries(PAIR_MAP)) {
        if (currentPath.endsWith(source.split('/').pop())) {
            if (targetDesktop && dest.includes('_desktop')) return dest;
            if (!targetDesktop && !dest.includes('_desktop')) return dest;
        }
    }

    // Si no se encuentra, derivar según prefijo/sufijo
    if (targetDesktop && !currentPath.includes('_desktop')) {
        return currentPath.replace('/Plantillas_Renovadas/', '/Plantillas_Renovadas_Desktop/').replace('.html', '_desktop.html');
    }
    if (!targetDesktop && currentPath.includes('_desktop')) {
        return currentPath.replace('/Plantillas_Renovadas_Desktop/', '/Plantillas_Renovadas/').replace('_desktop.html', '.html');
    }

    return null;
}

export function checkAndSwitchViewport() {
    const isDesktop = isDesktopViewport();
    const isCurrentlyDesktop = isCurrentDesktopPage();

    // Si coincide el viewport con la plantilla cargada, no hacer nada
    if ((isDesktop && isCurrentlyDesktop) || (!isDesktop && !isCurrentlyDesktop)) {
        return;
    }

    const targetUrlPath = getEquivalentPage(isDesktop);
    if (!targetUrlPath) return;

    // Preservar query parameters y hash
    const fullTarget = targetUrlPath + window.location.search + window.location.hash;

    // Al cambiar de dispositivo/layout (móvil vs desktop), realizamos reemplazo de ubicación
    // para garantizar el montaje limpio del layout y estilos correspondientes
    window.location.replace(fullTarget);
}

// Escuchar redimensionamiento con debounce
let resizeTimer = null;
export function initDeviceDetector() {
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
}
