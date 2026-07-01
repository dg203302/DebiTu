// Módulo compartido para bottom-sheet (drawer) usado por varias páginas
// Exporta: ensureCmsSheet, openCmsSheet, closeCmsSheet, attachSheetDragHandler,
//         showErrorToast, showSuccessToast, showInfoSheet, confirmSheet

let cmsSheetEls = null;
let cmsSheetResolve = null;
let cmsSheetAutoCloseTimer = null;
let cmsSheetId = 0;

function injectCmsSheetStyles() {
    if (document.getElementById('cmsSheetStyles')) return;
    const style = document.createElement('style');
    style.id = 'cmsSheetStyles';
    style.textContent = `
/* CMS shared bottom-sheet styles (injected) */
.cms-sheet-backdrop{position: fixed;inset: 0;background: rgba(0,0,0,0.55);opacity: 0;pointer-events: none;transition: opacity 0.2s ease;z-index: 200;}
.cms-sheet-drawer{position: fixed;left: 10px;right: 10px;bottom: calc(var(--footer-h,70px) + 34px + env(safe-area-inset-bottom, 0px));margin: 0 auto;width: min(640px, calc(100vw - 20px));max-height: min(70vh, 560px);background: var(--glass-bg, rgba(255,255,255,0.06));border: 1px solid var(--glass-border, rgba(255,255,255,0.06));border-radius: 22px;backdrop-filter: blur(var(--glass-blur,12px));-webkit-backdrop-filter: blur(var(--glass-blur,12px));box-shadow: 0 24px 40px -8px rgba(0,0,0,0.5);transform: translateY(110%);transition: transform 0.26s ease;z-index: 201;display: grid;grid-template-rows: auto auto 1fr;overflow: hidden; overscroll-behavior: contain;}
body.cms-sheet-open, body.opd-open, body.op-detail-open, body.client-stats-open { overflow: hidden !important; }
body.cms-sheet-open .cms-sheet-backdrop{ opacity: 1; pointer-events: auto; }
body.cms-sheet-open .cms-sheet-drawer{ transform: translateY(0); }
.opd-header{ padding: 0 16px; }
.opd-body{ padding: 12px 16px; overflow: auto; overscroll-behavior: contain; }
.cms-sheet-drawer #cmsSheetContent{ overflow: auto; overscroll-behavior: contain; }
.cms-sheet-actions{ margin-top: 14px; display:flex; gap:12px; justify-content:flex-end; flex-wrap:wrap; }
.cms-sheet-top-bar{ display:flex; justify-content:center; padding: 12px 16px 0; }
.cms-sheet-close-btn{ background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.05); height: 32px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 8px; color: var(--text, #fff); font-size: 0.9rem; font-weight: 600; letter-spacing: 0.02em; cursor: pointer; transition: background 0.2s; padding: 0 16px; white-space: nowrap; flex-shrink: 0; min-width: 80px; }
.cms-sheet-close-btn:hover{ background: rgba(255,255,255,0.16); }
@media (max-width:480px){ .cms-sheet-actions{ justify-content: stretch; } .cms-sheet-actions > button{ flex: 1; } }
/* Mobile overrides to ensure taller sheet and sticky submit */
@media (max-width:720px){
    .cms-sheet-drawer{ bottom: 0; left: 0; right: 0; width: 100%; border-radius: 14px 14px 0 0; max-height: calc(98vh - env(safe-area-inset-top, 0px)); margin: 0; }
    .cms-sheet-drawer .opd-body{ display: flex; flex-direction: column; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); overflow: hidden; }
    .cms-sheet-drawer #cmsSheetContent > section, .cms-sheet-drawer #cmsSheetContent > .glass-panel, .cms-sheet-drawer #cmsSheetContent .op-reg{ display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; overflow: auto; }
    .cms-sheet-drawer #cmsSheetContent{ flex: 1 1 auto; min-height: 0; overflow: auto; }
    .cms-sheet-drawer #cmsSheetContent .op-submit{ position: sticky; bottom: 0; background: linear-gradient(180deg, rgba(0,0,0,0), var(--glass-bg)); padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px)); z-index: 5; }
    .cms-sheet-drawer #cmsSheetContent .op-submit .btn{ width: 100%; }
}
    `;
    document.head.appendChild(style);
}

function ensureCmsSheet() {
    injectCmsSheetStyles();

    // Si los elementos existen en memoria pero el Router SPA los eliminó del body, descartarlos
    if (cmsSheetEls && !document.body.contains(cmsSheetEls.backdrop)) {
        cmsSheetEls = null;
    }

    if (cmsSheetEls) return cmsSheetEls;

    let backdrop = document.getElementById('cmsSheetBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'cmsSheetBackdrop';
        backdrop.className = 'cms-sheet-backdrop';
        backdrop.style.display = 'none';
        document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById('cmsSheetDrawer');
    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'cmsSheetDrawer';
        drawer.className = 'cms-sheet-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Mensaje');
        drawer.style.display = 'none';
        drawer.innerHTML = `
            <div class="cms-sheet-top-bar">
                <button type="button" class="cms-sheet-close-btn" id="cmsSheetCloseTop" aria-label="Cerrar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px;">
                        <path d="M9 14 4 9l5-5"/>
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
                    </svg>
                    <span>Cerrar</span>
                </button>
            </div>
            <div class="opd-header">
                <div class="opd-title">
                    <h3 id="cmsSheetTitle">Mensaje</h3>
                    <p id="cmsSheetSubtitle"></p>
                </div>
            </div>
            <div class="opd-body">
                <div id="cmsSheetContent"></div>
                <div id="cmsSheetActions" class="cms-sheet-actions"></div>
            </div>
        `;
        document.body.appendChild(drawer);
    }

    function close() { closeCmsSheet('close'); }

    backdrop.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCmsSheet('escape'); });

    // close button listener
    const closeBtn = drawer.querySelector('#cmsSheetCloseTop');
    if (closeBtn) closeBtn.addEventListener('click', close);

    cmsSheetEls = {
        backdrop,
        drawer,
        title: drawer.querySelector('#cmsSheetTitle'),
        subtitle: drawer.querySelector('#cmsSheetSubtitle'),
        content: drawer.querySelector('#cmsSheetContent'),
        actions: drawer.querySelector('#cmsSheetActions'),
    };
    return cmsSheetEls;
}

function showCmsSheetElements() {
    const els = ensureCmsSheet();
    els.backdrop.style.display = 'block';
    els.drawer.style.display = 'grid';
    // Limpiar estilos inline atascados de drag anterior
    els.drawer.style.transform = '';
    els.drawer.style.transition = '';
    els.backdrop.style.opacity = '';
    // force reflow
    els.drawer.offsetHeight;
    // No drag handlers anymore
    return els;
}

function hideCmsSheetElementsAfterTransition(localId) {
    const els = ensureCmsSheet();
    const drawer = els.drawer;
    let finished = false;
    const onEnd = (e) => {
        if (e && e.target !== drawer) return;
        if (e && e.propertyName && e.propertyName !== 'transform') return;
        if (finished) return; finished = true;
        drawer.removeEventListener('transitionend', onEnd);
        if (cmsSheetId !== localId) return;
        if (document.body.classList.contains('cms-sheet-open')) return;
        els.drawer.style.display = 'none';
        els.backdrop.style.display = 'none';
    };
    drawer.addEventListener('transitionend', onEnd);
    // Fallback de seguridad
    setTimeout(() => { if (!finished) onEnd({ target: drawer, propertyName: 'transform' }); }, 350);
}

function closeCmsSheet(reason, immediate) {
    document.body.classList.remove('cms-sheet-open');
    if (immediate) {
        try {
            const els = ensureCmsSheet();
            if (els.drawer) { els.drawer.style.display = 'none'; els.drawer.style.transform = ''; els.drawer.style.transition = ''; }
            if (els.backdrop) { els.backdrop.style.display = 'none'; els.backdrop.style.opacity = ''; }
        } catch (e) { }
    } else {
        hideCmsSheetElementsAfterTransition(cmsSheetId);
    }
    if (cmsSheetAutoCloseTimer) { clearTimeout(cmsSheetAutoCloseTimer); cmsSheetAutoCloseTimer = null; }
    if (typeof cmsSheetResolve === 'function') { const r = cmsSheetResolve; cmsSheetResolve = null; r({ action: reason || 'close' }); }
}

function setCmsSheetActions(actions) {
    const els = ensureCmsSheet();
    if (!els.actions) return;
    const list = Array.isArray(actions) ? actions : [];
    if (list.length === 0) { els.actions.innerHTML = ''; return; }
    els.actions.innerHTML = '';
    list.forEach((a) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = String(a?.label ?? 'OK');
        btn.className = a?.className || 'btn btn-primary';
        btn.addEventListener('click', () => { const value = a?.value ?? 'ok'; closeCmsSheet(value); });
        els.actions.appendChild(btn);
    });
}

function openCmsSheet(opts) {
    cmsSheetId++;
    const localId = cmsSheetId;

    // Forzar limpieza del estado previo para evitar bloqueos
    document.body.classList.remove('cms-sheet-open');
    if (cmsSheetEls && cmsSheetEls.drawer) {
        cmsSheetEls.drawer.offsetHeight; // force reflow
    }

    const els = showCmsSheetElements();
    const title = String(opts?.title ?? 'Mensaje');
    const subtitle = String(opts?.subtitle ?? '');
    const contentHtml = String(opts?.contentHtml ?? '');
    const actions = opts?.actions;
    const autoCloseMs = Number(opts?.autoCloseMs ?? 0);
    if (els.title) els.title.textContent = title;
    if (els.subtitle) els.subtitle.textContent = subtitle;
    if (els.content) els.content.innerHTML = contentHtml;
    setCmsSheetActions(actions);

    // Abrir de forma segura tras resetear
    requestAnimationFrame(() => {
        document.body.classList.add('cms-sheet-open');
    });

    if (cmsSheetAutoCloseTimer) { clearTimeout(cmsSheetAutoCloseTimer); cmsSheetAutoCloseTimer = null; }
    const closed = new Promise((resolve) => { cmsSheetResolve = resolve; });
    if (Number.isFinite(autoCloseMs) && autoCloseMs > 0) { cmsSheetAutoCloseTimer = setTimeout(() => closeCmsSheet('auto'), autoCloseMs); }
    return {
        els,
        closed,
        setTitle: (t) => { if (els.title) els.title.textContent = String(t ?? ''); },
        setSubtitle: (s) => { if (els.subtitle) els.subtitle.textContent = String(s ?? ''); },
        setContent: (html) => { if (els.content) els.content.innerHTML = String(html ?? ''); },
        setActions: (a) => setCmsSheetActions(a),
        close: (reason) => { if (cmsSheetId !== localId) return; closeCmsSheet(reason); },
    };
}

// Función de arrastre eliminada

function sheetText(message, tone) {
    const cls = tone === 'success' ? 'opd-value--success' : tone === 'error' ? 'opd-value--danger' : '';
    return `
        <div class="opd-list">
            <div class="opd-item">
                <div>
                    <h4>Mensaje</h4>
                    <small>—</small>
                </div>
                <div class="opd-value ${cls}" style="white-space:normal; text-align:left; margin-left:0; width:100%;">${escapeHtml(String(message ?? ''))}</div>
            </div>
        </div>
    `;
}

async function showErrorToast(message) {
    const s = openCmsSheet({ title: 'Error', subtitle: '', contentHtml: sheetText(message, 'error'), actions: [], autoCloseMs: 1800, });
    await s.closed;
}

async function showSuccessToast(message) {
    const s = openCmsSheet({ title: 'Listo', subtitle: '', contentHtml: sheetText(message, 'success'), actions: [], autoCloseMs: 1400, });
    await s.closed;
}

async function showInfoSheet(message, title) {
    const s = openCmsSheet({ title: title || 'Información', subtitle: '', contentHtml: sheetText(message, 'info'), actions: [{ label: 'OK', value: 'ok', className: 'btn btn-primary' }], });
    await s.closed;
}

async function confirmSheet(message, opts) {
    const s = openCmsSheet({ title: opts?.title || 'Confirmar', subtitle: opts?.subtitle || '', contentHtml: sheetText(message, opts?.tone || 'info'), actions: [{ label: opts?.cancelText || 'Cancelar', value: 'cancel', className: 'btn-clear secondary' }, { label: opts?.confirmText || 'Aceptar', value: 'confirm', className: 'btn btn-primary' },], });
    const res = await s.closed;
    return res?.action === 'confirm';
}

// Helpers used by sheetText
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": "&#39;" }[c]; }); }

export { ensureCmsSheet, openCmsSheet, closeCmsSheet, showErrorToast, showSuccessToast, showInfoSheet, confirmSheet };
