// Módulo compartido para bottom-sheet (drawer) usado por varias páginas
// Exporta: ensureCmsSheet, openCmsSheet, closeCmsSheet, attachSheetDragHandler,
//         showErrorToast, showSuccessToast, showInfoSheet, confirmSheet

let cmsSheetEls = null;
let cmsSheetResolve = null;
let cmsSheetAutoCloseTimer = null;
let cmsSheetId = 0;

function injectCmsSheetStyles(){
    if (document.getElementById('cmsSheetStyles')) return;
    const style = document.createElement('style');
    style.id = 'cmsSheetStyles';
    style.textContent = `
/* CMS shared bottom-sheet styles (injected) */
.cms-sheet-backdrop{position: fixed;inset: 0;background: rgba(0,0,0,0.55);opacity: 0;pointer-events: none;transition: opacity 0.2s ease;z-index: 200;}
.cms-sheet-drawer{position: fixed;left: 10px;right: 10px;bottom: calc(var(--footer-h,70px) + 34px + env(safe-area-inset-bottom, 0px));margin: 0 auto;width: min(640px, calc(100vw - 20px));max-height: min(70vh, 560px);background: var(--glass-bg, rgba(255,255,255,0.06));border: 1px solid var(--glass-border, rgba(255,255,255,0.06));border-radius: 22px;backdrop-filter: blur(var(--glass-blur,12px));-webkit-backdrop-filter: blur(var(--glass-blur,12px));box-shadow: 0 24px 40px -8px rgba(0,0,0,0.5);transform: translateY(110%);transition: transform 0.26s ease;z-index: 201;display: grid;grid-template-rows: auto auto 1fr;overflow: hidden;}
body.cms-sheet-open .cms-sheet-backdrop{ opacity: 1; pointer-events: auto; }
body.cms-sheet-open .cms-sheet-drawer{ transform: translateY(0); }
.opd-header{ padding: 0 16px; }
.opd-body{ padding: 12px 16px; overflow: auto; }
.cms-sheet-drawer #cmsSheetContent{ overflow: auto; }
.cms-sheet-actions{ margin-top: 14px; display:flex; gap:12px; justify-content:flex-end; flex-wrap:wrap; }
.sheet-handle{ display:flex; align-items:center; justify-content:center; padding:12px 12px 8px 12px; cursor: grab; -webkit-user-select: none; user-select: none; pointer-events: auto; touch-action: none; }
.sheet-handle:active{ cursor: grabbing; }
.sheet-handle-bar{ width:56px; height:6px; border-radius:999px; background: rgba(255,255,255,0.09); box-shadow: inset 0 1px 0 rgba(255,255,255,0.03); }
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

function ensureCmsSheet(){
    injectCmsSheetStyles();
    if (cmsSheetEls) return cmsSheetEls;

    let backdrop = document.getElementById('cmsSheetBackdrop');
    if (!backdrop){
        backdrop = document.createElement('div');
        backdrop.id = 'cmsSheetBackdrop';
        backdrop.className = 'cms-sheet-backdrop';
        backdrop.style.display = 'none';
        document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById('cmsSheetDrawer');
    if (!drawer){
        drawer = document.createElement('div');
        drawer.id = 'cmsSheetDrawer';
        drawer.className = 'cms-sheet-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Mensaje');
        drawer.style.display = 'none';
        drawer.innerHTML = `
            <div class="sheet-handle" id="cmsSheetHandle" aria-hidden="true"><div class="sheet-handle-bar"></div></div>
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

    function close(){ closeCmsSheet('close'); }

    backdrop.addEventListener('click', close);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCmsSheet('escape'); });

    // attach handlers (if present)
    const h = drawer.querySelector('#cmsSheetHandle');
    if (h) attachSheetDragHandler(drawer, h, closeCmsSheet);
    const hdr = drawer.querySelector('.opd-header');
    if (hdr) attachSheetDragHandler(drawer, hdr, closeCmsSheet);

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

function showCmsSheetElements(){
    const els = ensureCmsSheet();
    els.backdrop.style.display = 'block';
    els.drawer.style.display = 'grid';
    // force reflow
    els.drawer.offsetHeight;
    try{ attachSheetDragHandler(els.drawer, els.drawer.querySelector('.sheet-handle'), closeCmsSheet); attachSheetDragHandler(els.drawer, els.drawer.querySelector('.opd-header'), closeCmsSheet); }catch(e){}
    return els;
}

function hideCmsSheetElementsAfterTransition(localId){
    const els = ensureCmsSheet();
    const drawer = els.drawer;
    const onEnd = (e) => {
        if (e.target !== drawer) return;
        if (e.propertyName !== 'transform') return;
        drawer.removeEventListener('transitionend', onEnd);
        if (cmsSheetId !== localId) return;
        if (document.body.classList.contains('cms-sheet-open')) return;
        els.drawer.style.display = 'none';
        els.backdrop.style.display = 'none';
    };
    drawer.addEventListener('transitionend', onEnd);
}

function closeCmsSheet(reason, immediate){
    document.body.classList.remove('cms-sheet-open');
    if (immediate) {
        try{
            const els = ensureCmsSheet();
            if (els.drawer) { els.drawer.style.display = 'none'; els.drawer.style.transform = ''; els.drawer.style.transition = ''; }
            if (els.backdrop) { els.backdrop.style.display = 'none'; els.backdrop.style.opacity = ''; }
        }catch(e){}
    } else {
        hideCmsSheetElementsAfterTransition(cmsSheetId);
    }
    if (cmsSheetAutoCloseTimer){ clearTimeout(cmsSheetAutoCloseTimer); cmsSheetAutoCloseTimer = null; }
    if (typeof cmsSheetResolve === 'function'){ const r = cmsSheetResolve; cmsSheetResolve = null; r({ action: reason || 'close' }); }
}

function setCmsSheetActions(actions){
    const els = ensureCmsSheet();
    if (!els.actions) return;
    const list = Array.isArray(actions) ? actions : [];
    if (list.length === 0){ els.actions.innerHTML = ''; return; }
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

function openCmsSheet(opts){
    cmsSheetId++;
    const localId = cmsSheetId;
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
    document.body.classList.add('cms-sheet-open');
    if (cmsSheetAutoCloseTimer){ clearTimeout(cmsSheetAutoCloseTimer); cmsSheetAutoCloseTimer = null; }
    const closed = new Promise((resolve) => { cmsSheetResolve = resolve; });
    if (Number.isFinite(autoCloseMs) && autoCloseMs > 0){ cmsSheetAutoCloseTimer = setTimeout(() => closeCmsSheet('auto'), autoCloseMs); }
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

function attachSheetDragHandler(drawer, handle, closeFn){
    if (!drawer || !handle) return;
    if (handle._dragHandlerAttached) return;
    let dragging = false; let startY = 0; let currentY = 0; let pointerId = null;
    function isVerticalMode(){ try{ const r = drawer.getBoundingClientRect(); return r.top > (window.innerHeight * 0.25); }catch(e){ return true; } }
    function onPointerDown(e){
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // Permitir arrastrar siempre si el evento proviene del handle/header proporcionado,
        // incluso si el drawer está en una posición no "vertical" (ej. muy arriba).
        let fromHandle = false;
        try{ fromHandle = !!(e && e.target && handle && typeof handle.contains === 'function' && handle.contains(e.target)); }catch(_) { fromHandle = false; }
        if (!isVerticalMode() && !fromHandle) return;
        try{
            if (e && e.target && typeof e.target.closest === 'function'){
                const interactive = e.target.closest && e.target.closest('button, a, input, textarea, select, [role="button"]');
                if (interactive) return;
            }
        }catch(_){}
        const clientY = (typeof e.clientY === 'number') ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || 0;
        try{ if (e.preventDefault) e.preventDefault(); }catch(_){ }
        try{ if (typeof e.pointerId === 'number') handle.setPointerCapture(e.pointerId); }catch(_){ }
        pointerId = (typeof e.pointerId === 'number') ? e.pointerId : null; dragging = true; startY = clientY; currentY = startY; drawer.style.transition = 'none'; drawer.style.willChange = 'transform'; document.body.classList.add('sheet-dragging');
    }
    function onPointerMove(e){ if (!dragging) return; const clientY = (typeof e.clientY === 'number') ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY) || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || currentY; if (typeof e.pointerId === 'number' && pointerId != null && e.pointerId !== pointerId) return; currentY = clientY; const delta = Math.max(0, currentY - startY); drawer.style.transform = `translateY(${delta}px)`; const backdropId = (drawer.id === 'cmsSheetDrawer') ? 'cmsSheetBackdrop' : 'opdBackdrop'; const backdrop = document.getElementById(backdropId); if (backdrop){ const h = drawer.getBoundingClientRect().height || window.innerHeight; const ratio = Math.max(0, Math.min(1, 1 - (delta / (h * 0.8)))); backdrop.style.opacity = String(0.55 * ratio); } }
    function endDrag(e){ if (!dragging) return; if (e && typeof e.pointerId === 'number' && pointerId != null && e.pointerId !== pointerId) return; dragging = false; try{ if (e && typeof e.pointerId === 'number') handle.releasePointerCapture(e.pointerId); }catch(_){ } pointerId = null; const endClientY = (e && (typeof e.clientY === 'number')) ? e.clientY : (e && e.changedTouches && e.changedTouches[0] && e.changedTouches[0].clientY) || currentY; const delta = Math.max(0, endClientY - startY); drawer.style.willChange = ''; const h = drawer.getBoundingClientRect().height || window.innerHeight; const threshold = Math.min(160, Math.max(80, h * 0.25)); const backdropId = (drawer.id === 'cmsSheetDrawer') ? 'cmsSheetBackdrop' : 'opdBackdrop'; const backdrop = document.getElementById(backdropId);
        if (delta > threshold){ const finalY = Math.max(h + 24, window.innerHeight); drawer.style.transition = 'transform 0.26s ease'; requestAnimationFrame(() => { drawer.style.transform = `translateY(${finalY}px)`; }); const onEnd = function(ev){ if (ev && ev.propertyName && ev.propertyName !== 'transform') return; drawer.removeEventListener('transitionend', onEnd); try{ if (typeof closeFn === 'function') closeFn('drag', true); }catch(e){ console.error(e); } }; drawer.addEventListener('transitionend', onEnd); } else { drawer.style.transition = 'transform 0.26s ease'; requestAnimationFrame(() => { drawer.style.transform = ''; }); if (backdrop) backdrop.style.opacity = ''; }
        document.body.classList.remove('sheet-dragging');
    }
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    handle.addEventListener('touchstart', function(ev){ onPointerDown(ev); }, { passive: false });
    window.addEventListener('touchmove', function(ev){ onPointerMove(ev); }, { passive: false });
    window.addEventListener('touchend', function(ev){ endDrag(ev); });
    handle.addEventListener('mousedown', function(ev){ if (ev.button !== 0) return; onPointerDown(ev); });
    window.addEventListener('mousemove', function(ev){ onPointerMove(ev); });
    window.addEventListener('mouseup', function(ev){ endDrag(ev); });
    handle._dragHandlerAttached = true;
}

function sheetText(message, tone){
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

async function showErrorToast(message){
    const s = openCmsSheet({ title: 'Error', subtitle: '', contentHtml: sheetText(message, 'error'), actions: [], autoCloseMs: 1800, });
    await s.closed;
}

async function showSuccessToast(message){
    const s = openCmsSheet({ title: 'Listo', subtitle: '', contentHtml: sheetText(message, 'success'), actions: [], autoCloseMs: 1400, });
    await s.closed;
}

async function showInfoSheet(message, title){
    const s = openCmsSheet({ title: title || 'Información', subtitle: '', contentHtml: sheetText(message, 'info'), actions: [{ label: 'OK', value: 'ok', className: 'btn btn-primary' }], });
    await s.closed;
}

async function confirmSheet(message, opts){
    const s = openCmsSheet({ title: opts?.title || 'Confirmar', subtitle: opts?.subtitle || '', contentHtml: sheetText(message, opts?.tone || 'info'), actions: [ { label: opts?.cancelText || 'Cancelar', value: 'cancel', className: 'btn-clear secondary' }, { label: opts?.confirmText || 'Aceptar', value: 'confirm', className: 'btn btn-primary' }, ], });
    const res = await s.closed;
    return res?.action === 'confirm';
}

// Helpers used by sheetText
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }

export { ensureCmsSheet, openCmsSheet, closeCmsSheet, attachSheetDragHandler, showErrorToast, showSuccessToast, showInfoSheet, confirmSheet };
