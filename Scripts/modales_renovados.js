// ==========================================================================
// MODALES Y TOASTS NATIVOS NEO-FINTECH (DebiTú)
// Sin dependencias externas ni CDN (reemplazo integral de SweetAlert2)
// 100% diseño Obsidian, Glassmorphism y acentos Volt (#ccff00) / Danger (#ff4d4f).
// ==========================================================================

let toastContainer = null;
let currentModalBackdrop = null;
let currentModalResolve = null;

function escapeHtml(text) {
    if (text === undefined || text === null) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// -------------------------------------------------------------
// 1. TOASTS NATIVOS (Success & Error)
// -------------------------------------------------------------
function ensureToastContainer() {
    if (!toastContainer || !document.body.contains(toastContainer)) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'fintech-toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

export function showSuccessToast(message) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'fintech-toast success';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');

    toast.innerHTML = `
        <span class="toast-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        </span>
        <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('is-active');
    });

    const removeToast = () => {
        toast.classList.remove('is-active');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    };

    const timer = setTimeout(removeToast, 3200);
    toast.addEventListener('click', () => {
        clearTimeout(timer);
        removeToast();
    });

    return Promise.resolve({ isConfirmed: true });
}

export function showErrorToast(message) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = 'fintech-toast error';
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');

    toast.innerHTML = `
        <span class="toast-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        </span>
        <span class="toast-msg">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('is-active');
    });

    const removeToast = () => {
        toast.classList.remove('is-active');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
    };

    const timer = setTimeout(removeToast, 3600);
    toast.addEventListener('click', () => {
        clearTimeout(timer);
        removeToast();
    });

    return Promise.resolve({ isConfirmed: true });
}

// -------------------------------------------------------------
// 2. MODALES NATIVOS (Confirmación, Mensaje, Loading)
// -------------------------------------------------------------
export function closeModal(result = false, value = undefined) {
    if (!currentModalBackdrop) return;
    const backdrop = currentModalBackdrop;
    currentModalBackdrop = null;

    backdrop.classList.remove('is-open');
    setTimeout(() => {
        if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }, 250);

    if (typeof currentModalResolve === 'function') {
        const resolve = currentModalResolve;
        currentModalResolve = null;
        resolve({ isConfirmed: !!result, value: value });
    }
}

export function openModal(options = {}) {
    closeModal(false);

    const {
        title = 'Atención',
        text = '',
        html = '',
        icon = 'question', // 'question' | 'warning' | 'danger' | 'success' | 'info' | 'loading'
        showCancelButton = false,
        showConfirmButton = true,
        confirmButtonText = 'Aceptar',
        cancelButtonText = 'Cancelar',
        confirmButtonColor = '',
        allowOutsideClick = true,
        allowEscapeKey = true,
        didOpen = null
    } = options;

    const isDanger = icon === 'warning' || icon === 'danger' || String(confirmButtonColor).includes('#ff4d4f') || String(confirmButtonColor).includes('red');

    const backdrop = document.createElement('div');
    backdrop.className = 'fintech-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    // SVG de icono según tipo
    let iconSvg = '';
    let iconClass = icon;
    if (isDanger) iconClass = 'danger';

    if (icon === 'loading') {
        iconSvg = `<div class="loader-spinner" style="width: 38px; height: 38px; border-width: 3px; border-color: rgba(204, 255, 0, 0.2); border-top-color: var(--brand-volt);"></div>`;
    } else if (isDanger) {
        iconSvg = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        `;
    } else if (icon === 'success') {
        iconSvg = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
        `;
    } else if (icon === 'question') {
        iconSvg = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
            </svg>
        `;
    } else {
        iconSvg = `
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
        `;
    }

    const modalContent = html || (text ? `<p class="fintech-modal-desc">${escapeHtml(text)}</p>` : '');
    const hasActions = (showConfirmButton || showCancelButton) && icon !== 'loading';

    backdrop.innerHTML = `
        <div class="fintech-modal-card ${isDanger ? 'is-danger' : ''}">
            <div class="fintech-modal-icon-wrap ${iconClass}">
                ${iconSvg}
            </div>

            <div>
                <h3 class="fintech-modal-title">${escapeHtml(title)}</h3>
                ${modalContent}
            </div>

            ${hasActions ? `
                <div class="fintech-modal-actions ${!showCancelButton || !showConfirmButton ? 'single' : ''}">
                    ${showCancelButton ? `<button type="button" class="fintech-modal-btn ghost" data-action="cancel">${escapeHtml(cancelButtonText)}</button>` : ''}
                    ${showConfirmButton ? `<button type="button" class="fintech-modal-btn ${isDanger ? 'danger' : 'primary'}" data-action="confirm">${escapeHtml(confirmButtonText)}</button>` : ''}
                </div>
            ` : ''}
        </div>
    `;

    document.body.appendChild(backdrop);
    currentModalBackdrop = backdrop;

    requestAnimationFrame(() => {
        backdrop.classList.add('is-open');
    });

    if (allowOutsideClick) {
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeModal(false);
        });
    }

    const btnConfirm = backdrop.querySelector('[data-action="confirm"]');
    const btnCancel = backdrop.querySelector('[data-action="cancel"]');

    return new Promise((resolve) => {
        currentModalResolve = (res) => {
            resolve(res);
        };

        if (btnConfirm) {
            btnConfirm.addEventListener('click', async () => {
                let val = undefined;
                if (typeof options.preConfirm === 'function') {
                    try {
                        val = await options.preConfirm();
                        if (val === false) return;
                    } catch (e) {
                        console.error('Error en preConfirm:', e);
                        return;
                    }
                }
                closeModal(true, val);
            });
            btnConfirm.focus();
        }

        if (btnCancel) {
            btnCancel.addEventListener('click', () => closeModal(false));
        }

        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && allowEscapeKey && allowOutsideClick) {
                document.removeEventListener('keydown', handleKeyDown);
                closeModal(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        if (typeof didOpen === 'function') {
            try { didOpen(backdrop); } catch (_) {}
        }
    });
}

// -------------------------------------------------------------
// 3. DROP-IN PROXY (Compatibilidad sin SweetAlert)
// -------------------------------------------------------------
export const Swal = {
    fire: (options = {}) => {
        if (typeof options === 'string') {
            return openModal({ title: options });
        }
        return openModal(options);
    },
    close: () => closeModal(false),
    getPopup: () => currentModalBackdrop ? currentModalBackdrop.querySelector('.fintech-modal-card') : null,
    getContainer: () => currentModalBackdrop,
    showLoading: () => {
        if (!currentModalBackdrop) return;
        const wrap = currentModalBackdrop.querySelector('.fintech-modal-icon-wrap');
        if (wrap) {
            wrap.className = 'fintech-modal-icon-wrap loading';
            wrap.innerHTML = `<div class="loader-spinner" style="width: 38px; height: 38px; border-width: 3px; border-color: rgba(204, 255, 0, 0.2); border-top-color: var(--brand-volt);"></div>`;
        }
        const actions = currentModalBackdrop.querySelector('.fintech-modal-actions');
        if (actions) actions.style.display = 'none';
    },
    mixin: (baseOpts = {}) => {
        return {
            fire: (opts = {}) => {
                const combined = { ...baseOpts, ...opts };
                if (combined.toast) {
                    const msg = combined.title || combined.text || '';
                    if (combined.icon === 'error') {
                        return showErrorToast(msg);
                    }
                    return showSuccessToast(msg);
                }
                return openModal(combined);
            }
        };
    }
};

export function loadSweetAlert2() {
    return Promise.resolve(Swal);
}

export function showSuccess(titleOrMsg, text = '') {
    if (text) {
        return openModal({ title: titleOrMsg, text, icon: 'success' });
    }
    return openModal({ title: 'Éxito', text: titleOrMsg, icon: 'success' });
}

export function showError(titleOrMsg, text = '') {
    if (text) {
        return openModal({ title: titleOrMsg, text, icon: 'danger' });
    }
    return openModal({ title: 'Error', text: titleOrMsg, icon: 'danger' });
}

export function showInfo(titleOrMsg, text = '') {
    if (text) {
        return openModal({ title: titleOrMsg, text, icon: 'info' });
    }
    return openModal({ title: 'Información', text: titleOrMsg, icon: 'info' });
}

export function showInfoHTML(titleOrHtml, html = '') {
    if (html) {
        return openModal({ title: titleOrHtml, html, icon: 'info' });
    }
    return openModal({ title: 'Información', html: titleOrHtml, icon: 'info' });
}

if (typeof window !== 'undefined') {
    window.Swal = Swal;
    window.loadSweetAlert2 = loadSweetAlert2;
}
