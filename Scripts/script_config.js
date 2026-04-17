import {loadSupaBseWithAuth} from './supabase.js'

// --- Tema (modo oscuro/claro) ---
const THEME_STORAGE_KEY = 'CMS_THEME'

function getStoredTheme(){
    const raw = (localStorage.getItem(THEME_STORAGE_KEY) || '').toString().trim().toLowerCase()
    if (raw === 'light' || raw === 'claro') return 'light'
    return 'dark'
}

function applyTheme(theme){
    const normalized = theme === 'light' ? 'light' : 'dark'
    document.documentElement.dataset.theme = normalized

    const btn = document.getElementById('modo-oscuro-btn')
    if (btn){
        btn.setAttribute('aria-checked', String(normalized === 'dark'))
    }
}

function toggleTheme(){
    const current = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'
    const next = current === 'dark' ? 'light' : 'dark'
    localStorage.setItem(THEME_STORAGE_KEY, next)
    applyTheme(next)
    return next
}

// Aplicar tema lo antes posible (evita flash si el usuario eligió claro)
applyTheme(getStoredTheme())

const client= await loadSupaBseWithAuth();

function escapeHtml(str){
    return (str ?? '').toString().replace(/[&<>\"]/g, (ch) => {
        switch (ch){
            case '&': return '&amp;'
            case '<': return '&lt;'
            case '>': return '&gt;'
            case '"': return '&quot;'
            default: return ch
        }
    })
}

// --- UI: sheets (bottom-sheet) + toast (sin SweetAlert) ---
let cfgSheetState = null;
let cfgToastState = null;

function ensureCfgToast(){
    if (cfgToastState?.el) return cfgToastState;
    const el = document.createElement('div');
    el.className = 'cfg-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.display = 'none';
    document.body.appendChild(el);
    cfgToastState = { el, timer: null };
    return cfgToastState;
}

function showToast(message, variant = 'info'){
    const state = ensureCfgToast();
    if (!state?.el) return;
    const el = state.el;

    if (state.timer) window.clearTimeout(state.timer);
    el.classList.remove('is-success', 'is-error', 'is-info');
    el.classList.add(variant === 'error' ? 'is-error' : variant === 'success' ? 'is-success' : 'is-info');
    el.textContent = (message || '').toString();
    el.style.display = 'block';
    // reflow
    void el.getBoundingClientRect();
    el.classList.add('is-open');

    state.timer = window.setTimeout(() => {
        el.classList.remove('is-open');
        window.setTimeout(() => {
            el.style.display = 'none';
        }, 240);
    }, 2400);
}

function ensureCfgSheet(){
    if (cfgSheetState?.sheet && cfgSheetState?.backdrop) return cfgSheetState;

    const backdrop = document.createElement('div');
    backdrop.className = 'cfg-sheet-backdrop';
    backdrop.style.display = 'none';

    const sheet = document.createElement('section');
    sheet.className = 'cfg-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.style.display = 'none';

    sheet.innerHTML = `
        <div class="cfg-sheet__header">
            <div>
                <h2 class="cfg-sheet__title" data-title></h2>
                <p class="cfg-sheet__subtitle" data-subtitle></p>
            </div>
            <button type="button" class="cfg-sheet__close" data-close aria-label="Cerrar" title="Cerrar">×</button>
        </div>
        <div class="cfg-sheet__body">
            <div class="cfg-sheet__spinner" data-spinner aria-hidden="true"></div>
            <div class="cfg-sheet__message" data-message></div>
            <div class="cfg-sheet__actions" data-actions>
                <button type="button" class="cfg-btn cfg-btn--ghost" data-cancel>Cancelar</button>
                <button type="button" class="cfg-btn cfg-btn--danger" data-confirm>Confirmar</button>
                <button type="button" class="cfg-btn cfg-btn--primary" data-ok>Aceptar</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const titleEl = sheet.querySelector('[data-title]');
    const subtitleEl = sheet.querySelector('[data-subtitle]');
    const messageEl = sheet.querySelector('[data-message]');
    const spinnerEl = sheet.querySelector('[data-spinner]');
    const actionsEl = sheet.querySelector('[data-actions]');
    const btnCancel = sheet.querySelector('[data-cancel]');
    const btnConfirm = sheet.querySelector('[data-confirm]');
    const btnOk = sheet.querySelector('[data-ok]');
    const btnClose = sheet.querySelector('[data-close]');

    cfgSheetState = {
        backdrop,
        sheet,
        titleEl,
        subtitleEl,
        messageEl,
        spinnerEl,
        actionsEl,
        btnCancel,
        btnConfirm,
        btnOk,
        btnClose,
        sessionSeq: 0,
        activeSession: 0,
        transitionSeq: 0,
        resolve: null,
        mode: 'message',
        dismissable: true
    };

    function requestClose(result){
        const r = cfgSheetState?.resolve;
        if (typeof r === 'function'){
            cfgSheetState.resolve = null;
            r(result);
        }
        closeCfgSheet();
    }

    backdrop.addEventListener('click', () => {
        if (!cfgSheetState?.dismissable) return;
        requestClose(false);
    });
    btnClose?.addEventListener('click', () => {
        if (!cfgSheetState?.dismissable) return;
        requestClose(false);
    });
    btnCancel?.addEventListener('click', () => requestClose(false));
    btnConfirm?.addEventListener('click', () => requestClose(true));
    btnOk?.addEventListener('click', () => requestClose(true));

    sheet.addEventListener('keydown', (e) => {
        if (e.key === 'Escape'){
            if (!cfgSheetState?.dismissable) return;
            e.preventDefault();
            requestClose(false);
            return;
        }
        if (e.key === 'Enter'){
            e.preventDefault();
            // Enter confirma en confirm/message; en loading no hace nada
            if (cfgSheetState?.mode === 'loading') return;
            if (cfgSheetState?.mode === 'confirm') requestClose(true);
            else requestClose(true);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('cfg-sheet-open')) return;
        if (e.key === 'Escape'){
            if (!cfgSheetState?.dismissable) return;
            e.preventDefault();
            requestClose(false);
        }
    });

    return cfgSheetState;
}

function openCfgConfirm({ title, subtitle, messageHtml, confirmText, cancelText } = {}){
    const state = ensureCfgSheet();
    if (!state) return Promise.resolve(false);

    state.mode = 'confirm';
    state.dismissable = true;
    state.sessionSeq += 1;
    const sessionId = state.sessionSeq;
    state.activeSession = sessionId;

    state.sheet.setAttribute('aria-label', (title || 'Confirmación').toString());
    if (state.titleEl) state.titleEl.textContent = (title || 'Confirmación').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || '').toString();
    if (state.messageEl) state.messageEl.innerHTML = (messageHtml || '').toString();
    if (state.btnConfirm) state.btnConfirm.textContent = (confirmText || 'Confirmar').toString();
    if (state.btnCancel) state.btnCancel.textContent = (cancelText || 'Cancelar').toString();

    if (state.spinnerEl) state.spinnerEl.style.display = 'none';
    if (state.btnConfirm) state.btnConfirm.style.display = '';
    if (state.btnCancel) state.btnCancel.style.display = '';
    if (state.btnOk) state.btnOk.style.display = 'none';

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'block';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('cfg-sheet-open');
    requestAnimationFrame(() => state.btnConfirm?.focus());

    return new Promise((resolve) => {
        state.resolve = (result) => {
            if (state.activeSession !== sessionId) return;
            state.activeSession = 0;
            resolve(!!result);
        };
    });
}

function openCfgMessage({ title, subtitle, messageHtml, okText } = {}){
    const state = ensureCfgSheet();
    if (!state) return Promise.resolve(false);

    state.mode = 'message';
    state.dismissable = true;
    state.sessionSeq += 1;
    const sessionId = state.sessionSeq;
    state.activeSession = sessionId;

    state.sheet.setAttribute('aria-label', (title || 'Mensaje').toString());
    if (state.titleEl) state.titleEl.textContent = (title || 'Mensaje').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || '').toString();
    if (state.messageEl) state.messageEl.innerHTML = (messageHtml || '').toString();
    if (state.btnOk) state.btnOk.textContent = (okText || 'Aceptar').toString();

    if (state.spinnerEl) state.spinnerEl.style.display = 'none';
    if (state.btnConfirm) state.btnConfirm.style.display = 'none';
    if (state.btnCancel) state.btnCancel.style.display = 'none';
    if (state.btnOk) state.btnOk.style.display = '';

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'block';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('cfg-sheet-open');
    requestAnimationFrame(() => state.btnOk?.focus());

    return new Promise((resolve) => {
        state.resolve = () => {
            if (state.activeSession !== sessionId) return;
            state.activeSession = 0;
            resolve(true);
        };
    });
}

function openCfgLoading({ title, subtitle, messageHtml } = {}){
    const state = ensureCfgSheet();
    if (!state) return;

    state.mode = 'loading';
    state.dismissable = false;
    state.sessionSeq += 1;
    state.activeSession = state.sessionSeq;

    state.sheet.setAttribute('aria-label', (title || 'Cargando').toString());
    if (state.titleEl) state.titleEl.textContent = (title || 'Cargando…').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || '').toString();
    if (state.messageEl) state.messageEl.innerHTML = (messageHtml || '').toString();

    if (state.spinnerEl) state.spinnerEl.style.display = 'inline-block';
    if (state.btnConfirm) state.btnConfirm.style.display = 'none';
    if (state.btnCancel) state.btnCancel.style.display = 'none';
    if (state.btnOk) state.btnOk.style.display = 'none';

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'block';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('cfg-sheet-open');
}

function closeCfgSheet(){
    const state = cfgSheetState;
    if (!state?.sheet || !state?.backdrop) return;

    const sheet = state.sheet;
    const backdrop = state.backdrop;
    state.transitionSeq += 1;
    const closeId = state.transitionSeq;

    document.body.classList.remove('cfg-sheet-open');

    const finalize = () => {
        if (!cfgSheetState || cfgSheetState.transitionSeq !== closeId) return;
        sheet.style.display = 'none';
        backdrop.style.display = 'none';
        state.dismissable = true;
    };

    let done = false;
    const onEnd = (e) => {
        if (done) return;
        if (e.target !== sheet) return;
        if (e.propertyName && e.propertyName !== 'transform' && e.propertyName !== 'opacity') return;
        done = true;
        sheet.removeEventListener('transitionend', onEnd);
        finalize();
    };

    sheet.addEventListener('transitionend', onEnd);
    window.setTimeout(() => {
        if (done) return;
        done = true;
        sheet.removeEventListener('transitionend', onEnd);
        finalize();
    }, 420);
}

async function getCurrentUserId(){
    const fromStorage = (localStorage.getItem('UserID') || '').toString().trim()
    if (fromStorage && fromStorage !== 'N/A') return fromStorage

    try{
        const { data, error } = await client.auth.getUser()
        if (error) return null
        return data?.user?.id || null
    }catch{
        return null
    }
}

async function eliminarCuenta(){
    const userId = await getCurrentUserId()
    if (!userId){
        showToast('No se encontró un usuario autenticado.', 'error')
        return
    }

    const ok = await openCfgConfirm({
        title: 'Eliminar cuenta',
        subtitle: 'Esta acción es irreversible.',
        messageHtml: '¿Querés continuar con la eliminación permanente de tu cuenta?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
    })

    if (!ok) return

    openCfgLoading({
        title: 'Eliminando…',
        subtitle: 'Por favor espera',
        messageHtml: 'Estamos eliminando tu cuenta y cerrando sesión.'
    })

    try{
        // Llamada al endpoint server-side que usa la service_role (no exponer la clave al cliente)
        // Extraer token de sesión del cliente y enviarlo al endpoint para validación
        let accessToken = null
        try{
            const sessRes = await client.auth.getSession()
            if (sessRes && sessRes.data && sessRes.data.session && sessRes.data.session.access_token) {
                accessToken = sessRes.data.session.access_token
            }
        }catch(e){ /* ignore */ }

        try{
            if (!accessToken){
                showToast('No se pudo obtener el token de sesión. Cerrando sesión localmente...', 'error')
            } else {
                const res = await fetch('/api/delete-user', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + accessToken
                    },
                    body: JSON.stringify({ userId })
                })

                if (!res.ok){
                    let payload = null
                    try{ payload = await res.json() } catch { payload = { error: await res.text() } }
                    showToast('Error al eliminar la cuenta en el servidor: ' + (payload?.error || payload?.detail || res.status), 'error')
                } else {
                    showToast('Cuenta eliminada. Cerrando sesión...', 'success')
                }
            }
        }catch(e){
            showToast('Error de red al comunicarse con el servidor. Cerrando sesión localmente...', 'error')
        }finally{
            try { await client.auth.signOut() } catch { /* ignore */ }
            localStorage.clear()
            closeCfgSheet()
            window.location.href = '/index.html'
        }
    }
    catch(e){
        closeCfgSheet()
        showToast('Ocurrió un error inesperado. Por favor, intenta nuevamente.', 'error')
    }
}

window.onload = function() {
    const anioEl = document.getElementById('anio')
    if (anioEl) anioEl.textContent = new Date().getFullYear()

    const pfpEl = document.getElementById('pfp')
    const photo = (localStorage.getItem('UserPhoto') || '').toString().trim()
    if (pfpEl){
        if (photo) pfpEl.src = photo
        else pfpEl.removeAttribute('src')
    }

    const datos = document.getElementById('Datos_cuenta')
    if (datos){
        const userName = (localStorage.getItem('UserName') || '').toString().trim()
        datos.textContent = 'Nombre de usuario: ' + (userName || '—')
    }
}

window.cerrarSesion=function() {
    localStorage.clear()
    window.location.href = '/index.html'
}

const idiomaBtn = document.getElementById('idioma-btn')
if (idiomaBtn){
    idiomaBtn.addEventListener('click', async () => {
        await openCfgMessage({
            title: 'Próximamente',
            messageHtml: 'Esta opción estará disponible en una próxima actualización.',
            okText: 'Aceptar'
        })
    })
}

const modoOscuroBtn = document.getElementById('modo-oscuro-btn')
if (modoOscuroBtn){
    modoOscuroBtn.addEventListener('click', async () => {
        const next = toggleTheme()
        showToast(next === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado', 'success')
    })
}

const transparenciaBtn = document.getElementById('transparencia-btn')
if (transparenciaBtn){
    transparenciaBtn.addEventListener('click', async () => {
        await openCfgMessage({
            title: 'Próximamente',
            messageHtml: 'Esta opción estará disponible en una próxima actualización.',
            okText: 'Aceptar'
        })
    })
}

const eliminarCuentaBtn = document.getElementById('eliminar-cuenta-btn')
if (eliminarCuentaBtn){
    eliminarCuentaBtn.addEventListener('click', async () => {
        await eliminarCuenta()
    })
}