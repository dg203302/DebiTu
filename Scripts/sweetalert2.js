// ==========================================================================
// SWEETALERT2 COMPATIBILITY LAYER -> MODALES NATIVOS NEO-FINTECH
// Reemplaza por completo SweetAlert2 y scripts externos de CDN.
// 100% nativo, rápido y estilizado con la identidad visual Obsidian / Volt.
// ==========================================================================

export {
    Swal,
    loadSweetAlert2,
    showSuccess,
    showError,
    showSuccessToast,
    showErrorToast,
    showInfo,
    showInfo as showinfo,
    showInfoHTML,
    openModal,
    closeModal
} from './modales_renovados.js';

import {
    Swal,
    loadSweetAlert2
} from './modales_renovados.js';

if (typeof window !== 'undefined') {
    window.Swal = Swal;
    window.loadSweetAlert2 = loadSweetAlert2;
}