// ==========================================================================
// CONTROLADOR DE SLIDER DE CARGA SUPERIOR (Top Progress Slider)
// 100% no invasivo. Barra superior neón Volt + Píldora flotante con texto dinámico.
// No rompe los layouts ni bloquea la vista de las plantillas.
// ==========================================================================

let sliderWrapEl = null;
let safetyTimeout = null;

function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function ensureAppLoader(defaultMessage = 'Sincronizando...') {
    sliderWrapEl = document.getElementById('app_page_loader');
    if (!sliderWrapEl) {
        sliderWrapEl = document.createElement('div');
        sliderWrapEl.id = 'app_page_loader';
        sliderWrapEl.className = 'app-loader-slider-wrap is-hidden';
        sliderWrapEl.setAttribute('role', 'progressbar');
        sliderWrapEl.setAttribute('aria-label', 'Cargando datos');

        sliderWrapEl.innerHTML = `
            <div class="app-loader-veil"></div>
            <div class="app-loader-slider-track">
                <div class="app-loader-slider-bar"></div>
            </div>
            <div class="app-loader-slider-pill">
                <span class="app-loader-slider-dot"></span>
                <span id="app_loader_status" class="app-loader-slider-text">${escapeHtml(defaultMessage)}</span>
            </div>
        `;
        document.body.appendChild(sliderWrapEl);
    }
    return sliderWrapEl;
}

export function showAppLoader(message = 'Sincronizando...') {
    const el = ensureAppLoader(message);
    const textEl = el.querySelector('#app_loader_status');
    if (textEl && message) {
        textEl.textContent = message;
    }

    el.classList.remove('is-hidden');

    if (safetyTimeout) clearTimeout(safetyTimeout);
    safetyTimeout = setTimeout(() => {
        hideAppLoader();
    }, 10000);
}

export function updateAppLoader(message) {
    const el = document.getElementById('app_page_loader');
    if (el) {
        const textEl = el.querySelector('#app_loader_status');
        if (textEl) textEl.textContent = message;
    }
}

export function hideAppLoader() {
    if (safetyTimeout) {
        clearTimeout(safetyTimeout);
        safetyTimeout = null;
    }
    const el = document.getElementById('app_page_loader');
    if (el) {
        el.classList.add('is-hidden');
    }
}

// Exponer globalmente en window
if (typeof window !== 'undefined') {
    window.showAppLoader = showAppLoader;
    window.hideAppLoader = hideAppLoader;
    window.updateAppLoader = updateAppLoader;
}
