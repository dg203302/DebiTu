import {showError,showErrorToast,showSuccess,showSuccessToast,showinfo, loadSweetAlert2} from './sweetalert2.js'
import {loadSupabase} from './supabase.js';
import { openCmsSheet } from './cmsSheet.js';
const Swal = await loadSweetAlert2();
const supabase = await loadSupabase();

// Estado para operaciones del cliente seleccionado
let currentClienteTelefono = null;
let currentClienteNombre = null;
let currentClienteOpView = 'deudas'; // 'deudas' | 'pagos'
let isExpandedCliente = false; // controla ver 4 vs todos
let currentClientesFilter = 'all'; // 'all' | 'withDebt' | 'withoutDebt'
let isEditingCliente = false;
let clientStatsCharts = [];

let clientePanelSheet = null;

function isTouchDevice(){
    try{
        return ('ontouchstart' in window) || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) || (navigator.msMaxTouchPoints && navigator.msMaxTouchPoints > 0) || (window.matchMedia && window.matchMedia('(pointer:coarse)').matches);
    }catch(e){ return false; }
}

function setResponsiveDetailsOpen(open){
    // En pantallas pequeñas mostramos el panel de cliente dentro del bottom-sheet compartido.
    if (window.innerWidth <= 1080) {
        if (open) {
            document.body.classList.add('mobile-details-open');
            const section = document.getElementById('detallesCliente');
            if (!section) return;
            // Guardar padre original para restaurar luego
            if (!section._originalParent) {
                section._originalParent = section.parentNode;
                section._originalNext = section.nextSibling;
            }

            // Si ya está dentro del sheet, no hacemos nada
            const content = document.getElementById('cmsSheetContent');
            if (content && content.contains(section) && document.body.classList.contains('cms-sheet-open')) return;

            try{
                const s = openCmsSheet({ title: 'Panel de Cliente', subtitle: currentClienteNombre || '', contentHtml: '' });
                clientePanelSheet = s;
                s.els.content.innerHTML = '';
                s.els.content.appendChild(section);
                section.hidden = false;

                // Guardar estilos inline originales para restaurar luego
                section._originalStyle = {
                    position: section.style.position || '',
                    left: section.style.left || '',
                    right: section.style.right || '',
                    bottom: section.style.bottom || '',
                    transform: section.style.transform || '',
                    opacity: section.style.opacity || '',
                    visibility: section.style.visibility || '',
                    pointerEvents: section.style.pointerEvents || '',
                    maxHeight: section.style.maxHeight || '',
                    width: section.style.width || '',
                    zIndex: section.style.zIndex || '',
                    display: section.style.display || ''
                };

                // Aplicar estilos para que el panel fluya dentro del sheet
                section.style.position = 'static';
                section.style.left = '';
                section.style.right = '';
                section.style.bottom = '';
                section.style.transform = 'none';
                section.style.opacity = '1';
                section.style.visibility = 'visible';
                section.style.pointerEvents = 'auto';
                section.style.maxHeight = 'none';
                section.style.width = '100%';
                section.style.zIndex = '';

                // Ocultar el header interno y el botón X mientras se muestra como sheet
                const btnClose = section.querySelector('#btn_cerrar_detalles');
                const hdr = section.querySelector('#headerDetalles');
                if (btnClose) btnClose.style.display = 'none';
                if (hdr) hdr.style.display = 'none';

                // Mover el botón de editar al lado del nombre (dentro de .cliente-profile)
                const btnEditar = document.getElementById('btn_editar_cliente');
                if (btnEditar) {
                    if (!btnEditar._originalParent) {
                        btnEditar._originalParent = btnEditar.parentNode;
                        btnEditar._originalNext = btnEditar.nextSibling;
                    }
                    const clienteProfile = section.querySelector('.cliente-profile');
                    if (clienteProfile) {
                        clienteProfile.appendChild(btnEditar);
                        btnEditar.classList.add('inline-edit-button');
                    } else {
                        section.querySelector('.profile-copy')?.appendChild(btnEditar);
                        btnEditar.classList.add('inline-edit-button');
                    }
                }

                const btnStats = document.getElementById('btn_stats_cliente');
                if (btnStats) {
                    if (!btnStats._originalParent) {
                        btnStats._originalParent = btnStats.parentNode;
                        btnStats._originalNext = btnStats.nextSibling;
                    }
                    const clienteProfile = section.querySelector('.cliente-profile');
                    if (clienteProfile) {
                        clienteProfile.appendChild(btnStats);
                        btnStats.classList.add('inline-edit-button');
                    }
                }

                s.closed.then(() => {
                    try {
                        // Restaurar al DOM original
                        if (section._originalParent) section._originalParent.insertBefore(section, section._originalNext);
                        // Restaurar visibilidad/estilos
                        section.hidden = true;
                        if (btnClose) btnClose.style.display = '';
                        if (hdr) hdr.style.display = '';
                        // Restaurar el botón editar a su padre original
                        try {
                            const b = document.getElementById('btn_editar_cliente');
                            if (b && b._originalParent) {
                                b._originalParent.insertBefore(b, b._originalNext);
                                b.classList.remove('inline-edit-button');
                                delete b._originalParent;
                                delete b._originalNext;
                            }
                        } catch (_) {}
                        try {
                            const bStats = document.getElementById('btn_stats_cliente');
                            if (bStats && bStats._originalParent) {
                                bStats._originalParent.insertBefore(bStats, bStats._originalNext);
                                bStats.classList.remove('inline-edit-button');
                                delete bStats._originalParent;
                                delete bStats._originalNext;
                            }
                        } catch (_) {}
                        if (section._originalStyle) {
                            Object.assign(section.style, section._originalStyle);
                            delete section._originalStyle;
                        }
                    } catch (err) {
                        console.warn('Error al restaurar detallesCliente', err);
                    }
                    clientePanelSheet = null;
                    document.body.classList.remove('mobile-details-open');
                });
            }catch(e){ console.error('No se pudo abrir cms sheet para panel de cliente', e); }

        } else {
            document.body.classList.remove('mobile-details-open');
            if (clientePanelSheet){ try{ clientePanelSheet.close('close'); }catch(e){ clientePanelSheet = null; } }
        }
    } else {
        // En desktop mantenemos el comportamiento previo
        document.body.classList.remove('mobile-details-open');
        if (clientePanelSheet){ try{ clientePanelSheet.close('close'); }catch(e){} }
    }
}

function setDesktopNoClientSelected(noSelected){
    // Solo aplica a escritorio; en móvil/tablet el comportamiento es distinto.
    if (window.innerWidth > 1080) {
        document.body.classList.toggle('desktop-no-client-selected', !!noSelected);
    } else {
        document.body.classList.remove('desktop-no-client-selected');
    }
}

function syncDesktopNoClientSelected(){
    setDesktopNoClientSelected(!currentClienteTelefono);
}

function syncEditButtonVisibility(){
    const hasSelection = !!currentClienteTelefono;
    const btnEditar = document.getElementById('btn_editar_cliente');
    if (btnEditar) btnEditar.style.display = hasSelection ? '' : 'none';
    const btnStats = document.getElementById('btn_stats_cliente');
    if (btnStats) btnStats.style.display = hasSelection ? '' : 'none';
    const btnCerrar = document.getElementById('btn_cerrar_detalles');
    if (btnCerrar) btnCerrar.style.display = hasSelection ? '' : 'none';
}

function setClienteEditMode(on){
    isEditingCliente = !!on;
    const panel = document.getElementById('editarClientePanel');
    const datos = document.getElementById('datosCliente');
    const ops = document.getElementById('operacionesCliente');
    if (panel) panel.hidden = !isEditingCliente;
    if (datos) datos.style.display = isEditingCliente ? 'none' : '';
    if (ops) ops.style.display = isEditingCliente ? 'none' : '';
}

function parseMontoToNumber(input){
    if (input === undefined || input === null) return 0;
    const raw = String(input).trim();
    if (!raw) return 0;
    // Permitir formatos: "1234", "1.234", "1.234,56", "1234,56"
    const cleaned = raw.replace(/\s+/g, '').replace(/\$/g, '');
    const hasComma = cleaned.includes(',');
    const normalized = hasComma
        ? cleaned.replace(/\./g, '').replace(',', '.')
        : cleaned;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
}

async function abrirEdicionCliente(){
    if (!currentClienteTelefono){
        await showErrorToast('No hay cliente seleccionado.');
        return;
    }

    const nombreInput = document.getElementById('edit_nombre_inline');
    const telefonoInput = document.getElementById('edit_telefono_inline');
    const deudaInput = document.getElementById('edit_deuda_inline');
    if (!nombreInput || !telefonoInput || !deudaInput){
        await showErrorToast('No se encontró el formulario de edición.');
        return;
    }

    nombreInput.value = (currentClienteNombre || '').toString();
    telefonoInput.value = normalizePhone(currentClienteTelefono);

    // Cargar deuda actual desde la BD para evitar desfasajes
    const deudaActual = await calcularMontoTotalAdeudado(currentClienteTelefono);
    deudaInput.value = String(Number(deudaActual) || 0);

    setClienteEditMode(true);
    syncEditButtonVisibility();
    requestAnimationFrame(() => { try{ if (!isTouchDevice()) nombreInput.focus(); }catch(_){} });
}

function cancelarEdicionCliente(){
    setClienteEditMode(false);
}

async function guardarEdicionCliente(){
    if (!currentClienteTelefono){
        await showErrorToast('No hay cliente seleccionado.');
        return;
    }

    const nombreInput = document.getElementById('edit_nombre_inline');
    const telefonoInput = document.getElementById('edit_telefono_inline');
    const deudaInput = document.getElementById('edit_deuda_inline');
    if (!nombreInput || !telefonoInput || !deudaInput){
        await showErrorToast('No se encontró el formulario de edición.');
        return;
    }

    const oldNombre = (currentClienteNombre || '').toString();
    const oldTelefono = normalizePhone(currentClienteTelefono);

    const newNombre = (nombreInput.value || '').trim();
    const newTelefono = normalizePhone((telefonoInput.value || '').trim());
    const deudaParsed = parseMontoToNumber(deudaInput.value);

    if (!newNombre){
        await showErrorToast('Ingrese el nombre del cliente.');
        nombreInput.focus();
        return;
    }
    if (!newTelefono){
        await showErrorToast('Ingrese el teléfono del cliente (solo números).');
        telefonoInput.focus();
        return;
    }
    if (!Number.isFinite(deudaParsed) || deudaParsed < 0){
        await showErrorToast('La deuda activa debe ser un número válido (>= 0).');
        deudaInput.focus();
        return;
    }

    const changedNombre = newNombre !== oldNombre;
    const changedTelefono = newTelefono !== oldTelefono;

    // Leer deuda vieja para detectar cambio real
    const oldDeuda = await calcularMontoTotalAdeudado(oldTelefono);
    const changedDeuda = Number(deudaParsed) !== Number(oldDeuda || 0);

    if (!changedNombre && !changedTelefono && !changedDeuda){
        await showinfo('Sin cambios', 'No se modificó ningún dato.');
        return;
    }

    if (changedTelefono){
        const okConfirm = await openConfirmSheet({
            title: 'Confirmar cambio de teléfono',
            subtitle: 'Esto afectará los registros asociados.',
            messageHtml: 'Esto actualizará también las <strong>deudas</strong> y <strong>pagos</strong> del cliente.',
            confirmText: 'Continuar',
            cancelText: 'Cancelar'
        });
        if (!okConfirm) return;
    }

    try {
        let upd = supabase
            .from('Clientes')
            .update({ Nombre: newNombre, Telefono: newTelefono, Deuda_Activa: Number(deudaParsed) || 0 })
            .eq('Telefono', oldTelefono);
        upd = applyIdNegocioFilter(upd);
        const { error: errCliente } = await upd;
        if (errCliente){
            await showErrorToast('No se pudo actualizar el cliente: ' + errCliente.message);
            return;
        }

        if (changedTelefono){
            let updDeudas = supabase
                .from('Deudas')
                .update({ Telefono_cliente: newTelefono })
                .eq('Telefono_cliente', oldTelefono);
            updDeudas = applyIdNegocioFilter(updDeudas);
            const { error: errDeudas } = await updDeudas;

            let updPagos = supabase
                .from('Pagos')
                .update({ Telefono_cliente: newTelefono })
                .eq('Telefono_cliente', oldTelefono);
            updPagos = applyIdNegocioFilter(updPagos);
            const { error: errPagos } = await updPagos;

            if (errDeudas || errPagos){
                // Best-effort rollback del cliente
                let rb = supabase
                    .from('Clientes')
                    .update({ Nombre: oldNombre, Telefono: oldTelefono, Deuda_Activa: Number(oldDeuda) || 0 })
                    .eq('Telefono', newTelefono);
                rb = applyIdNegocioFilter(rb);
                await rb;
                const msg = (errDeudas ? `Deudas: ${errDeudas.message}` : '') + (errPagos ? ` Pagos: ${errPagos.message}` : '');
                await showErrorToast('Se actualizó el cliente, pero falló la actualización de operaciones. Se revirtió el cambio. ' + msg);
                return;
            }
        }

        // Actualizar estado/UI
        currentClienteNombre = newNombre;
        currentClienteTelefono = newTelefono;
        const elNombre = document.getElementById('nombreCliente');
        const elTelefono = document.getElementById('telefonoCliente');
        const avatar = document.getElementById('avatarCliente');
        if (elNombre) elNombre.innerHTML = `Nombre: <br>${newNombre}`;
        if (elTelefono) elTelefono.innerHTML = `Teléfono: <br>${newTelefono}`;
        if (avatar) avatar.textContent = getAvatarLetters(newNombre);

        // Actualizar deuda visible en tarjetas
        const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
        const elAdeudado = document.getElementById('montototalAdeudado');
        if (elAdeudado) elAdeudado.textContent = formatter.format(Number(deudaParsed) || 0);

        // Mostrar toast sin bloquear el flujo (no esperar a que desaparezca)
        showSuccessToast('Cliente actualizado');

        // Refrescar lista y re-seleccionar
        await verTodosClientes();
        requestAnimationFrame(() => autoSelectClientByPhone(newTelefono));

        setClienteEditMode(false);
    } catch (err){
        console.error('Guardar edición cliente error', err);
        await showErrorToast('Error al editar el cliente');
    }
}

function renderClientesEnContenedor(clientes){
    const contenedorLista = document.getElementById('contenedorListaClientes');
    if (!contenedorLista) return;
    contenedorLista.innerHTML = '';
    if (!clientes || clientes.length === 0){
        contenedorLista.innerHTML = '<p>No hay clientes registrados.</p>';
        return;
    }
    clientes.forEach((element) => insertarClienteEnLista(element, contenedorLista));
}

// Helpers compartidos
function escapeHtml(str){
    if (str === undefined || str === null) return '';
    return String(str).replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}
function formatDate(value){
    if (!value) return '';
    const d = new Date(value);
    if (!isNaN(d)){
        try { return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' }); }
        catch { return d.toString(); }
    }
    const n = Number(value);
    if (!Number.isNaN(n)){
        const d2 = new Date(n);
        if (!isNaN(d2)) return d2.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
    }
    return String(value);
}

// Normaliza teléfonos: deja solo dígitos y, si hay más de 10, conserva los últimos 10 (formato local)
function normalizePhone(phone){
    const digits = (phone || '').toString().replace(/\D+/g, '');
    if (digits.length > 10) return digits.slice(-10);
    return digits;
}

function getAvatarLetters(nombre){
    const raw = (nombre || '').toString().trim();
    if (!raw) return 'CP';
    const compact = raw.replace(/\s+/g, '');
    const two = compact.slice(0, 2);
    return two ? two.toUpperCase() : 'CP';
}

function autoSelectClientByPhone(phone){
    const target = normalizePhone(phone);
    if (!target) return false;
    const items = Array.from(document.querySelectorAll('#contenedorListaClientes .client-item'))
        .filter((el) => !el.classList.contains('skeleton'));
    for (const el of items){
        const meta = el.querySelector('.meta');
        const digits = normalizePhone(meta ? meta.textContent : '');
        if (digits && digits === target){
            el.click();
            return true;
        }
    }
    return false;
}

async function editarClienteActual(){
    await abrirEdicionCliente();
}

// --- Multi-tenant helper (ID_Negocio) ---
// Regla:
// - localStorage.UserID === 'N/A'  => filtrar/guardar ID_Negocio = NULL
// - caso normal                   => filtrar/guardar ID_Negocio = <UserID>
function getLocalUserId(){
    const raw = localStorage.getItem('UserID');
    if (raw === undefined || raw === null) return null;
    const v = String(raw).trim();
    return v ? v : null;
}

function getIdNegocioForWrite(){
    const userId = getLocalUserId();
    if (!userId) return undefined; // sesión ausente
    if (userId === 'N/A') return null; // caso especial
    return userId;
}

function applyIdNegocioFilter(query){
    const userId = getLocalUserId();
    if (userId === 'N/A') return query.is('ID_Negocio', null);
    if (!userId) return query.eq('ID_Negocio', '__MISSING_USERID__');
    return query.eq('ID_Negocio', userId);
}

function Regresar(){
    window.location.href = "/Plantillas/Inicio.html";
}
window.Regresar = Regresar;

let confirmSheetState = null;
let promptSheetState = null;

async function ajustarDeudaActivaCliente(telefono, delta){
    const tel = normalizePhone(telefono);
    if (!tel) return false;
    try{
        const actual = await calcularMontoTotalAdeudado(tel);
        const next = Math.max(0, (Number(actual) || 0) + (Number(delta) || 0));
        let upd = supabase
            .from('Clientes')
            .update({ Deuda_Activa: next })
            .eq('Telefono', tel);
        upd = applyIdNegocioFilter(upd);
        const { error } = await upd;
        if (error){
            await showErrorToast('No se pudo actualizar la Deuda Activa: ' + error.message);
            return false;
        }
        return true;
    }catch(e){
        console.error('ajustarDeudaActivaCliente error', e);
        await showErrorToast('Error actualizando la Deuda Activa');
        return false;
    }
}

// Abrir sheet de "Agregar cliente" usando el módulo compartido cmsSheet
async function openAddClientSheet(){
    const container = document.createElement('div');
    container.className = 'cms-addclient';
    container.innerHTML = `

        <div class="edit-grid" role="form" aria-label="Formulario registrar cliente">
            <div class="edit-field">
                <span class="edit-label">Nombre completo</span>
                <input id="addClientNombre" type="text" placeholder="Ej: Juan Pérez" autocomplete="name" />
            </div>

            <div class="edit-field">
                <span class="edit-label">Teléfono</span>
                <input id="addClientTelefono" type="tel" placeholder="264 400 9000" inputmode="tel" autocomplete="tel" />
            </div>

            <p class="add-client-validation" role="alert" aria-live="polite" hidden></p>

            <div class="action-group edit-actions">
                <button class="btn btn-primary" type="button" data-submit>Registrar</button>
            </div>
        </div>
    `;

    // Abrir drawer compartido y pegar el contenido
    const s = openCmsSheet({ title: 'Registrar cliente', subtitle: '', contentHtml: '' });
    s.els.content.innerHTML = '';
    s.els.content.appendChild(container);

    const nombreInput = container.querySelector('#addClientNombre');
    const telefonoInput = container.querySelector('#addClientTelefono');
    const validation = container.querySelector('.add-client-validation');
    const btnSubmit = container.querySelector('[data-submit]');
    const btnClose = container.querySelector('[data-close]');

    function showValidation(message){
        if (!validation) return;
        const msg = (message || '').toString().trim();
        if (!msg){ validation.hidden = true; validation.textContent = ''; return; }
        validation.textContent = msg; validation.hidden = false;
    }

    return new Promise((resolve) => {
        let finished = false;
        function cleanup(){
            if (finished) return; finished = true;
            try{ btnSubmit?.removeEventListener('click', onSubmit); btnClose?.removeEventListener('click', onCancel); }catch(e){}
            try{ container.remove(); }catch(e){}
        }

        const onSubmit = () => {
            const nombre = (nombreInput?.value || '').trim();
            const telefonoRaw = (telefonoInput?.value || '').trim();
            const telefono = normalizePhone(telefonoRaw);
            if (!nombre){ showValidation('Ingrese el nombre del cliente.'); nombreInput?.focus(); return; }
            if (!telefono){ showValidation('Ingrese el teléfono del cliente (solo números).'); telefonoInput?.focus(); return; }
            showValidation('');
            cleanup();
            try{ s.close('submit'); }catch(e){}
            resolve({ nombre, telefono });
        };

        const onCancel = () => { cleanup(); try{ s.close('cancel'); }catch(e){} resolve(null); };

        btnSubmit?.addEventListener('click', onSubmit);
        btnClose?.addEventListener('click', onCancel);

        container.addEventListener('keydown', (e) => {
            if (e.key === 'Enter'){
                const tag = (e.target?.tagName || '').toLowerCase();
                if (tag === 'input'){ e.preventDefault(); onSubmit(); }
            }
        });

        s.closed.then(() => { if (!finished){ finished = true; cleanup(); resolve(null); } });
        requestAnimationFrame(() => nombreInput?.focus());
    });
}

function ensureConfirmSheet(){
    if (confirmSheetState?.sheet && confirmSheetState?.backdrop) return confirmSheetState;

    const backdrop = document.createElement('div');
    backdrop.className = 'confirm-sheet-backdrop';
    backdrop.style.display = 'none';

    const sheet = document.createElement('section');
    sheet.className = 'glass-panel details-panel confirm-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Confirmación');
    sheet.style.display = 'none';

    sheet.innerHTML = `
        <div class="confirm-sheet__header">
            <div>
                <h2 class="section-title" data-title>Confirmar</h2>
                <p class="section-subtitle" data-subtitle>Revisá antes de continuar.</p>
            </div>
            <button type="button" class="icon-btn" data-close aria-label="Cerrar" title="Cerrar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>

        <div class="confirm-sheet__body">
            <div class="confirm-sheet__message muted" data-message></div>
            <div class="confirm-sheet__extra" data-extra></div>
            <div class="action-group confirm-sheet__actions">
                <button class="btn btn-outline subtle" type="button" data-cancel>Cancelar</button>
                <button class="btn btn-danger-soft" type="button" data-confirm>Eliminar</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const titleEl = sheet.querySelector('[data-title]');
    const subtitleEl = sheet.querySelector('[data-subtitle]');
    const messageEl = sheet.querySelector('[data-message]');
    const extraEl = sheet.querySelector('[data-extra]');
    const btnConfirm = sheet.querySelector('[data-confirm]');
    const btnCancel = sheet.querySelector('[data-cancel]');
    const btnClose = sheet.querySelector('[data-close]');

    confirmSheetState = {
        backdrop,
        sheet,
        titleEl,
        subtitleEl,
        messageEl,
        extraEl,
        btnConfirm,
        btnCancel,
        btnClose,
        sessionSeq: 0,
        activeSession: 0,
        transitionSeq: 0,
        resolve: null,
        payload: null,
        cleanup: null
    };

    function requestClose(result){
        if (typeof confirmSheetState?.cleanup === 'function'){
            try{ confirmSheetState.cleanup(); }catch{ /* ignore */ }
        }
        confirmSheetState.cleanup = null;
        const r = confirmSheetState?.resolve;
        if (typeof r === 'function'){
            confirmSheetState.resolve = null;
            r(result);
        }
        closeConfirmSheet();
    }

    backdrop.addEventListener('click', () => requestClose(false));
    btnCancel?.addEventListener('click', () => requestClose(false));
    btnClose?.addEventListener('click', () => requestClose(false));
    btnConfirm?.addEventListener('click', () => requestClose(true));

    sheet.addEventListener('keydown', (e) => {
        if (e.key === 'Escape'){
            e.preventDefault();
            requestClose(false);
            return;
        }
        if (e.key === 'Enter'){
            e.preventDefault();
            requestClose(true);
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('confirm-sheet-open')) return;
        if (e.key === 'Escape'){
            e.preventDefault();
            requestClose(false);
        }
    });

    return confirmSheetState;
}

function openConfirmSheet({ title, subtitle, messageHtml, confirmText, cancelText } = {}){
    const state = ensureConfirmSheet();
    if (!state) return Promise.resolve(false);

    state.sessionSeq += 1;
    const sessionId = state.sessionSeq;
    state.activeSession = sessionId;

    if (state.titleEl) state.titleEl.textContent = (title || 'Confirmar').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || 'Revisá antes de continuar.').toString();
    if (state.messageEl) state.messageEl.innerHTML = (messageHtml || '').toString();
    if (state.extraEl) state.extraEl.innerHTML = '';
    state.payload = null;
    if (state.btnConfirm) state.btnConfirm.textContent = (confirmText || 'Eliminar').toString();
    if (state.btnCancel) state.btnCancel.textContent = (cancelText || 'Cancelar').toString();

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'flex';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('confirm-sheet-open');

    requestAnimationFrame(() => state.btnConfirm?.focus());

    return new Promise((resolve) => {
        state.resolve = (result) => {
            if (state.activeSession !== sessionId) return;
            state.activeSession = 0;
            resolve(!!result);
        };
    });
}

function openConfirmSheetWithOption({ title, subtitle, messageHtml, confirmText, cancelText, optionLabel, optionDefault } = {}){
    const state = ensureConfirmSheet();
    if (!state) return Promise.resolve({ confirmed: false, option: false });

    state.sessionSeq += 1;
    const sessionId = state.sessionSeq;
    state.activeSession = sessionId;

    if (state.titleEl) state.titleEl.textContent = (title || 'Confirmar').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || 'Revisá antes de continuar.').toString();
    if (state.messageEl) state.messageEl.innerHTML = (messageHtml || '').toString();
    if (state.btnConfirm) state.btnConfirm.textContent = (confirmText || 'Continuar').toString();
    if (state.btnCancel) state.btnCancel.textContent = (cancelText || 'Cancelar').toString();

    const checkedDefault = !!optionDefault;
    state.payload = { option: checkedDefault };

    if (state.extraEl){
        state.extraEl.innerHTML = `
            <label class="confirm-sheet__option">
                <input type="checkbox" ${checkedDefault ? 'checked' : ''} />
                <span>${escapeHtml((optionLabel || 'Opción').toString())}</span>
            </label>
        `;
        const cb = state.extraEl.querySelector('input[type="checkbox"]');
        const onChange = () => {
            if (!state.payload) state.payload = { option: false };
            state.payload.option = !!cb?.checked;
        };
        cb?.addEventListener('change', onChange);
        state.cleanup = () => cb?.removeEventListener('change', onChange);
    }

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'flex';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('confirm-sheet-open');
    requestAnimationFrame(() => state.btnConfirm?.focus());

    return new Promise((resolve) => {
        state.resolve = (result) => {
            if (state.activeSession !== sessionId) return;
            state.activeSession = 0;
            resolve({ confirmed: !!result, option: !!state.payload?.option });
        };
    });
}

function closeConfirmSheet(){
    const state = confirmSheetState;
    if (!state?.sheet || !state?.backdrop) return;

    const sheet = state.sheet;
    const backdrop = state.backdrop;
    state.transitionSeq += 1;
    const closeId = state.transitionSeq;

    document.body.classList.remove('confirm-sheet-open');

    const finalize = () => {
        if (!confirmSheetState || confirmSheetState.transitionSeq !== closeId) return;
        sheet.style.display = 'none';
        backdrop.style.display = 'none';
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

function ensurePromptSheet(){
    if (promptSheetState?.sheet && promptSheetState?.backdrop) return promptSheetState;

    const backdrop = document.createElement('div');
    backdrop.className = 'prompt-sheet-backdrop';
    backdrop.style.display = 'none';

    const sheet = document.createElement('section');
    sheet.className = 'glass-panel details-panel prompt-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Editar valor');
    sheet.style.display = 'none';

    sheet.innerHTML = `
        <div class="prompt-sheet__header">
            <div>
                <h2 class="section-title" data-title>Editar</h2>
                <p class="section-subtitle" data-subtitle>Ingresá un valor.</p>
            </div>
            <button type="button" class="icon-btn" data-close aria-label="Cerrar" title="Cerrar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </div>

        <div class="edit-grid" role="form" aria-label="Formulario editar valor">
            <div class="edit-field">
                <span class="edit-label" data-label>Valor</span>
                <input data-input type="text" autocomplete="off" />
                <span class="muted" data-hint hidden></span>
            </div>

            <p class="prompt-sheet-validation" role="alert" aria-live="polite" hidden></p>

            <div class="action-group edit-actions">
                <button class="btn btn-outline subtle" type="button" data-cancel>Cancelar</button>
                <button class="btn btn-primary" type="button" data-confirm>Guardar</button>
            </div>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    const titleEl = sheet.querySelector('[data-title]');
    const subtitleEl = sheet.querySelector('[data-subtitle]');
    const labelEl = sheet.querySelector('[data-label]');
    const inputEl = sheet.querySelector('[data-input]');
    const hintEl = sheet.querySelector('[data-hint]');
    const validation = sheet.querySelector('.prompt-sheet-validation');
    const btnConfirm = sheet.querySelector('[data-confirm]');
    const btnCancel = sheet.querySelector('[data-cancel]');
    const btnClose = sheet.querySelector('[data-close]');

    promptSheetState = {
        backdrop,
        sheet,
        titleEl,
        subtitleEl,
        labelEl,
        inputEl,
        hintEl,
        validation,
        btnConfirm,
        btnCancel,
        btnClose,
        sessionSeq: 0,
        activeSession: 0,
        transitionSeq: 0,
        resolve: null,
        validate: null
    };

    function showValidation(message){
        if (!validation) return;
        const msg = (message || '').toString().trim();
        if (!msg){
            validation.hidden = true;
            validation.textContent = '';
            return;
        }
        validation.textContent = msg;
        validation.hidden = false;
    }

    function requestClose(result){
        const r = promptSheetState?.resolve;
        if (typeof r === 'function'){
            promptSheetState.resolve = null;
            r(result);
        }
        closePromptSheet();
    }

    function submit(){
        const raw = (inputEl?.value || '').toString();
        const validator = promptSheetState?.validate;
        const errorMsg = (typeof validator === 'function') ? validator(raw) : null;
        if (typeof errorMsg === 'string' && errorMsg.trim()){
            showValidation(errorMsg);
            inputEl?.focus();
            return;
        }
        showValidation('');
        requestClose(raw);
    }

    backdrop.addEventListener('click', () => requestClose(null));
    btnCancel?.addEventListener('click', () => requestClose(null));
    btnClose?.addEventListener('click', () => requestClose(null));
    btnConfirm?.addEventListener('click', submit);

    sheet.addEventListener('keydown', (e) => {
        if (e.key === 'Escape'){
            e.preventDefault();
            requestClose(null);
            return;
        }
        if (e.key === 'Enter'){
            const tag = (e.target?.tagName || '').toLowerCase();
            if (tag === 'input'){
                e.preventDefault();
                submit();
            }
        }
    });

    document.addEventListener('keydown', (e) => {
        if (!document.body.classList.contains('prompt-sheet-open')) return;
        if (e.key === 'Escape'){
            e.preventDefault();
            requestClose(null);
        }
    });

    return promptSheetState;
}

function openPromptSheet({ title, subtitle, label, hint, value, placeholder, inputMode, confirmText, cancelText, validate } = {}){
    const state = ensurePromptSheet();
    if (!state) return Promise.resolve(null);

    state.sessionSeq += 1;
    const sessionId = state.sessionSeq;
    state.activeSession = sessionId;
    state.validate = (typeof validate === 'function') ? validate : null;

    if (state.titleEl) state.titleEl.textContent = (title || 'Editar').toString();
    if (state.subtitleEl) state.subtitleEl.textContent = (subtitle || 'Ingresá un valor.').toString();
    if (state.labelEl) state.labelEl.textContent = (label || 'Valor').toString();
    if (state.hintEl){
        const h = (hint || '').toString().trim();
        state.hintEl.textContent = h;
        state.hintEl.hidden = !h;
    }
    if (state.inputEl){
        state.inputEl.value = (value ?? '').toString();
        state.inputEl.placeholder = (placeholder || '').toString();
        if (inputMode) state.inputEl.inputMode = String(inputMode);
    }
    if (state.validation){
        state.validation.hidden = true;
        state.validation.textContent = '';
    }
    if (state.btnConfirm) state.btnConfirm.textContent = (confirmText || 'Guardar').toString();
    if (state.btnCancel) state.btnCancel.textContent = (cancelText || 'Cancelar').toString();

    state.backdrop.style.display = 'block';
    state.sheet.style.display = 'flex';
    void state.sheet.getBoundingClientRect();
    document.body.classList.add('prompt-sheet-open');

    requestAnimationFrame(() => {
        state.inputEl?.focus();
        state.inputEl?.select?.();
    });

    return new Promise((resolve) => {
        state.resolve = (result) => {
            if (state.activeSession !== sessionId) return;
            state.activeSession = 0;
            resolve(result === null ? null : String(result));
        };
    });
}

function closePromptSheet(){
    const state = promptSheetState;
    if (!state?.sheet || !state?.backdrop) return;

    const sheet = state.sheet;
    const backdrop = state.backdrop;
    state.transitionSeq += 1;
    const closeId = state.transitionSeq;

    document.body.classList.remove('prompt-sheet-open');

    const finalize = () => {
        if (!promptSheetState || promptSheetState.transitionSeq !== closeId) return;
        sheet.style.display = 'none';
        backdrop.style.display = 'none';
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

async function agregarCliente(){
    const formValues = await openAddClientSheet();
    if (formValues) {
        const idNegocio = getIdNegocioForWrite();
        if (idNegocio === undefined){
            await showErrorToast('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
            return;
        }
        try {
            const payload = {
                nombre: formValues.nombre,
                telefono: formValues.telefono,
            };
            const {error} = await supabase
                .from('Clientes')
                .insert({ Nombre: payload.nombre, Telefono: payload.telefono, ID_Negocio: idNegocio });
            if (error){
                showErrorToast('Error al agregar el cliente: ' + error.message);
                return;
            }
            showSuccessToast('Cliente agregado');
            window.location.reload();
        } catch (err){
            console.error('Agregar cliente error', err);
            showErrorToast('Error al agregar el cliente');
        }
    }
}
window.agregarCliente = agregarCliente;

async function verTodosClientes(){
    const data = await fetchAllClientes();
    if (!data) return;
    renderClientesEnContenedor(filtrarClientes(data, currentClientesFilter));
}
window.verTodosClientes = verTodosClientes;

async function fetchAllClientes(){
    const {data, error} = await applyIdNegocioFilter(
        supabase
            .from('Clientes')
            .select('*')
    );
    if (error){
        showErrorToast('Error al obtener los clientes: ' + error.message);
        return null;
    }
    return data || [];
}

function getDeudaActivaFromCliente(cliente){
    const v = cliente?.Deuda_Activa ?? cliente?.deuda_activa ?? cliente?.deudaActiva ?? 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function filtrarClientes(clientes, filter){
    if (!Array.isArray(clientes)) return [];
    if (filter === 'withDebt'){
        return clientes.filter((c) => getDeudaActivaFromCliente(c) > 0);
    }
    if (filter === 'withoutDebt'){
        return clientes.filter((c) => getDeudaActivaFromCliente(c) <= 0);
    }
    return clientes;
}

async function aplicarFiltroClientes(filter){
    currentClientesFilter = filter || 'all';

    // UX simple: al filtrar se parte del universo completo (sin búsqueda)
    const input = document.getElementById('buscarClienteInput');
    if (input) input.value = '';

    // Estado visual del chip activo
    document.querySelectorAll('.filters-wrap .chip').forEach((btn) => {
        const f = btn.dataset.filter;
        btn.classList.toggle('is-active', f === currentClientesFilter);
    });

    const data = await fetchAllClientes();
    if (!data) return;
    renderClientesEnContenedor(filtrarClientes(data, currentClientesFilter));
    cerrarDetallesCliente();
}

function initFiltrosClientes(){
    const wrap = document.querySelector('.filters-wrap');
    if (!wrap) return;
    const chips = Array.from(wrap.querySelectorAll('.chip'));
    for (const chip of chips){
        const label = (chip.textContent || '').toString().trim().toLowerCase();
        let filter = 'all';
        if (label.includes('con') && label.includes('deuda')) filter = 'withDebt';
        else if (label.includes('sin') && label.includes('deuda')) filter = 'withoutDebt';
        else if (label.includes('todos')) filter = 'all';
        chip.dataset.filter = filter;
        chip.addEventListener('click', () => {
            aplicarFiltroClientes(filter);
        });
    }

    // Dejar el estado inicial consistente con el marcado en HTML
    const initialActive = chips.find((c) => c.classList.contains('is-active'));
    if (initialActive?.dataset?.filter) currentClientesFilter = initialActive.dataset.filter;
    document.querySelectorAll('.filters-wrap .chip').forEach((btn) => {
        btn.classList.toggle('is-active', btn.dataset.filter === currentClientesFilter);
    });
}
function cerrarListaClientes(){
    const input = document.getElementById('buscarClienteInput');
    if (input) input.value = '';
    verTodosClientes();
}
window.cerrarListaClientes = cerrarListaClientes;

function insertarClienteEnLista(cliente, contenedor){
    const nombre = cliente.Nombre ?? cliente.nombre ?? '';
    const telefono = normalizePhone(cliente.Telefono ?? cliente.telefono ?? '');

    const card = document.createElement('div');
    card.className = 'client-item';
    card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%;">
            <div>
                <div style="font-weight:600; color:var(--heading)">${escapeHtml(nombre)}</div>
                <div class="meta" style="font-size:0.9rem">${escapeHtml(telefono)}</div>
            </div>
        </div>
    `;
    card.addEventListener('click', async () => {
        // Si estaba en modo edición, volver al modo detalle al seleccionar otro cliente
        if (isEditingCliente) setClienteEditMode(false);

        document.querySelectorAll('.client-item[aria-selected="true"]').forEach((el) => el.removeAttribute('aria-selected'));
        card.setAttribute('aria-selected', 'true');
        setResponsiveDetailsOpen(true);
        setDesktopNoClientSelected(false);

        document.getElementById('nombreCliente').innerHTML = `Nombre: <br>${nombre}`;
        document.getElementById('telefonoCliente').innerHTML = `Teléfono: <br>${telefono}`;
        const avatar = document.getElementById('avatarCliente');
        if (avatar) avatar.textContent = getAvatarLetters(nombre);

        // Formatear totales como ARS
        const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
        const totalPagado = await calcularMontoTotalPagado(telefono);
        const totalAdeudado = cliente.Deuda_Activa !== undefined ? Number(cliente.Deuda_Activa) || 0 : 0;
        document.getElementById('montototalPagado').innerHTML = formatter.format(totalPagado);
        document.getElementById('montototalAdeudado').innerHTML = formatter.format(totalAdeudado);

        // Guardar estado del cliente actual
        currentClienteTelefono = telefono;
        currentClienteNombre = nombre;
        currentClienteOpView = 'deudas';
        isExpandedCliente = false;
        syncEditButtonVisibility();

        // Preparar tabs y botones para el panel del cliente
        prepararTabsOperacionesCliente();
        // Render inicial (deudas)
        await mostrarOperacionesCliente('deudas');
    });

    contenedor.appendChild(card);
}

async function borrarClienteActual(){
    if (!currentClienteTelefono){
        await showErrorToast('No hay cliente seleccionado.');
        return;
    }
    const selectedCard = document.querySelector('.client-item[aria-selected="true"]');
    await borrarCliente(currentClienteTelefono, currentClienteNombre || '', selectedCard);
}
async function borrarCliente(telefono, nombre, cardEl){
    const tel = normalizePhone(telefono);

    const ok = await openConfirmSheet({
        title: 'Borrar cliente',
        subtitle: 'Esta acción no se puede deshacer.',
        messageHtml: `¿Estás seguro de que deseas borrar al cliente <strong>${escapeHtml(nombre)}</strong>?`,
        confirmText: 'Borrar',
        cancelText: 'Cancelar'
    });
    if (!ok) return;

    let del = supabase
        .from('Clientes')
        .delete()
        .eq('Telefono', tel);
    del = applyIdNegocioFilter(del);
    const { error } = await del;
    if (error){
        await showErrorToast('Error al borrar cliente: ' + error.message);
        return;
    }
    let delDeudas = supabase
        .from('Deudas')
        .delete()
        .eq('Telefono_cliente', tel);
    delDeudas = applyIdNegocioFilter(delDeudas);
    await delDeudas;
    let delPagos = supabase
        .from('Pagos')
        .delete()
        .eq('Telefono_cliente', tel);
    delPagos = applyIdNegocioFilter(delPagos);
    await delPagos;
    showSuccessToast('Cliente borrado correctamente');
    window.location.reload();
}
async function calcularMontoTotalPagado(telefono){
    let q = supabase
        .from('Pagos')
        .select('Monto')
        .eq('Telefono_cliente', telefono);
    q = applyIdNegocioFilter(q);
    const {data, error} = await q;
    if (error) {
        showErrorToast('Error al obtener los pagos: ' + error.message);
        return 0;
    }
    return (data || []).reduce((total, pago) => total + (Number(pago.Monto) || 0), 0);
}

async function calcularMontoTotalAdeudado(telefono){
    let q = supabase
        .from('Clientes')
        .select('Deuda_Activa')
        .eq('Telefono', telefono)
        .maybeSingle();
    q = applyIdNegocioFilter(q);
    const { data, error } = await q;
    if (error) {
        showErrorToast('Error al obtener la deuda activa: ' + error.message);
        return 0;
    }
    return Number(data?.Deuda_Activa) || 0;
}

// -------- Operaciones del cliente seleccionado (tabs, lista, expandir, detalle) --------
function prepararTabsOperacionesCliente(){
    const btnDeudas = document.getElementById('btn_ver_deudas_cliente');
    const btnPagos = document.getElementById('btn_ver_pagos_cliente');
    if (!btnDeudas || !btnPagos) return;

    // Vincular por asignación directa para evitar listeners duplicados
    btnDeudas.onclick = async () => {
        if (currentClienteOpView === 'deudas') return;
        setActiveTabCliente('deudas');
        await mostrarOperacionesCliente('deudas');
    };
    btnPagos.onclick = async () => {
        if (currentClienteOpView === 'pagos') return;
        setActiveTabCliente('pagos');
        await mostrarOperacionesCliente('pagos');
    };

    // Preparar/crear botón Expandir/Contraer si no existe
    const opsSection = document.getElementById('operacionesCliente');
    if (opsSection && !document.getElementById('btn_expandir_cliente')){
        const btn = document.createElement('button');
        btn.id = 'btn_expandir_cliente';
        btn.textContent = 'Expandir';
        btn.className = 'btn';
        btn.onclick = () => expandirTablaCliente();
        opsSection.insertBefore(btn, document.getElementById('lista_operaciones_cliente'));
    } else {
        const btn = document.getElementById('btn_expandir_cliente');
        if (btn) btn.textContent = 'Expandir';
    }

    // Wire botones Refrescar
    const btnRefrescar = document.getElementById('btn_refrescar_cliente');
    if (btnRefrescar) btnRefrescar.onclick = () => refrescarOperacionesCliente();

    // Activar estado visual de tabs
    setActiveTabCliente(currentClienteOpView);
}

function setActiveTabCliente(tipo){
    currentClienteOpView = tipo;
    const btnDeudas = document.getElementById('btn_ver_deudas_cliente');
    const btnPagos = document.getElementById('btn_ver_pagos_cliente');
    if (btnDeudas && btnPagos){
        btnDeudas.classList.toggle('active', tipo === 'deudas');
        btnDeudas.setAttribute('aria-selected', String(tipo === 'deudas'));
        btnPagos.classList.toggle('active', tipo === 'pagos');
        btnPagos.setAttribute('aria-selected', String(tipo === 'pagos'));
    }
}

async function mostrarOperacionesCliente(tipo){
    const cont = document.getElementById('lista_operaciones_cliente');
    if (!cont || !currentClienteTelefono) return;
    cont.textContent = 'Cargando...';
    try{
        const { data, error } = await fetchOperacionesClienteByTipo(tipo, currentClienteTelefono, false);
        if (error){
            showErrorToast(error.message);
            cont.textContent = 'Error al cargar.';
            return;
        }
        renderListaOperacionesCliente(cont, data || [], tipo);
    }catch(err){
        console.error(err);
        showErrorToast('No se pudieron cargar las operaciones');
        cont.textContent = 'Error al cargar.';
    }
}

async function fetchOperacionesClienteByTipo(tipo, telefono, asc = true){
    const tabla = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
    let q = supabase
        .from(tabla)
        .select('*')
        .eq('Telefono_cliente', telefono);
    q = applyIdNegocioFilter(q);
    return await q.order('Creado', { ascending: !!asc });
}

function normalizeMontoOperacion(item){
    const montoRaw = item?.Monto ?? item?.monto ?? item?.Amount ?? item?.amount ?? 0;
    const monto = Number(montoRaw);
    return Number.isFinite(monto) ? monto : 0;
}

function normalizeFechaOperacion(item){
    const raw = item?.Creado ?? item?.creado ?? item?.fecha ?? item?.created_at ?? null;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date){
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date){
    return date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
}

function buildMonthlySeries(items){
    const bucket = new Map();
    for (const item of (items || [])) {
        const date = normalizeFechaOperacion(item);
        if (!date) continue;
        const key = monthKey(date);
        const current = bucket.get(key) || { date, label: monthLabel(date), total: 0 };
        current.total += normalizeMontoOperacion(item);
        bucket.set(key, current);
    }
    return Array.from(bucket.values()).sort((a, b) => a.date - b.date);
}

function clamp(value, min, max){
    return Math.max(min, Math.min(max, value));
}

function computePaymentIndicators({ pagos, deudas, deudaActiva }){
    const totalPagado = (pagos || []).reduce((acc, item) => acc + normalizeMontoOperacion(item), 0);
    const totalDeudaRegistrada = (deudas || []).reduce((acc, item) => acc + normalizeMontoOperacion(item), 0);
    const cobertura = totalDeudaRegistrada > 0 ? clamp(totalPagado / totalDeudaRegistrada, 0, 1.4) : (totalPagado > 0 ? 1 : 0);

    const ultimoPago = (pagos || [])
        .map((item) => normalizeFechaOperacion(item))
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;
    const diasSinPagar = ultimoPago ? Math.round((Date.now() - ultimoPago.getTime()) / 86400000) : 365;
    const recencia = clamp(1 - (diasSinPagar / 180), 0, 1);
    const deudaPresion = totalDeudaRegistrada > 0 ? clamp((Number(deudaActiva) || 0) / totalDeudaRegistrada, 0, 1.2) : 0;

    const rawScore = 300 + (cobertura * 320) + (recencia * 200) + ((1 - deudaPresion) * 120);
    const score = Math.round(clamp(rawScore, 300, 850));
    const probabilidad = Math.round(clamp(((score - 300) / 550) * 100, 0, 99));

    let tone = 'low';
    let label = 'Riesgo alto';
    if (probabilidad >= 70) {
        tone = 'high';
        label = 'Perfil estable';
    } else if (probabilidad >= 45) {
        tone = 'mid';
        label = 'Riesgo medio';
    }

    return { score, probabilidad, tone, label, totalPagado, totalDeudaRegistrada, diasSinPagar };
}

function destroyClientStatsCharts(){
    for (const chart of clientStatsCharts) {
        try { chart?.destroy(); } catch (_) {}
    }
    clientStatsCharts = [];
}

async function ensureChartJs(){
    if (window.Chart) return window.Chart;
    await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-lib="chartjs"]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')));
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.async = true;
        script.defer = true;
        script.dataset.lib = 'chartjs';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
        document.head.appendChild(script);
    });
    return window.Chart;
}

function pushLineChart(canvasId, labels, values, color, fillA, fillB){
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 220);
    gradient.addColorStop(0, fillA);
    gradient.addColorStop(1, fillB);
    const chart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: color,
                backgroundColor: gradient,
                pointRadius: 2.5,
                pointHoverRadius: 5,
                tension: 0.34,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx2) => ` ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ctx2.parsed.y || 0)}`,
                    },
                },
            },
            scales: {
                x: { ticks: { color: 'rgba(255,255,255,0.72)' }, grid: { color: 'rgba(255,255,255,0.08)' } },
                y: {
                    ticks: {
                        color: 'rgba(255,255,255,0.72)',
                        callback: (v) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(v),
                    },
                    grid: { color: 'rgba(255,255,255,0.08)' },
                },
            },
        },
    });
    clientStatsCharts.push(chart);
}

let clientStatsDrawerEls = null;

function ensureClientStatsDrawer(){
    if (clientStatsDrawerEls) return clientStatsDrawerEls;

    let backdrop = document.getElementById('clientStatsBackdrop');
    let drawer = document.getElementById('clientStatsDrawer');

    if (!backdrop) {
        backdrop = document.createElement('div');
        backdrop.id = 'clientStatsBackdrop';
        backdrop.className = 'op-detail-backdrop client-stats-backdrop';
        document.body.appendChild(backdrop);
    }

    if (!drawer) {
        drawer = document.createElement('div');
        drawer.id = 'clientStatsDrawer';
        drawer.className = 'op-detail-drawer client-stats-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Estadísticas individuales');
        drawer.innerHTML = `
            <div class="op-detail-drawer__header">
                <div>
                    <h3 class="op-detail-drawer__title" id="clientStatsTitle">Estadísticas individuales</h3>
                    <div class="op-detail-drawer__subtitle" id="clientStatsSubtitle">—</div>
                </div>
                <button type="button" class="icon-btn" id="clientStatsClose" aria-label="Cerrar" title="Cerrar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            <div class="op-detail-drawer__body" id="clientStatsBody"></div>
        `;
        document.body.appendChild(drawer);
    }

    const close = () => closeClientStatsDrawer();
    backdrop.addEventListener('click', close);
    drawer.querySelector('#clientStatsClose')?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeClientStatsDrawer();
    });

    clientStatsDrawerEls = {
        backdrop,
        drawer,
        title: drawer.querySelector('#clientStatsTitle'),
        subtitle: drawer.querySelector('#clientStatsSubtitle'),
        body: drawer.querySelector('#clientStatsBody'),
    };
    return clientStatsDrawerEls;
}

function closeClientStatsDrawer(){
    document.body.classList.remove('client-stats-open');
    destroyClientStatsCharts();
}

async function abrirEstadisticasCliente(){
    if (!currentClienteTelefono) {
        await showErrorToast('Selecciona un cliente primero.');
        return;
    }

    const currency = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const els = ensureClientStatsDrawer();
    if (els.title) els.title.textContent = 'Estadísticas individuales';
    if (els.subtitle) els.subtitle.textContent = currentClienteNombre ? `Cliente: ${currentClienteNombre}` : 'Cliente seleccionado';
    if (els.body) {
        els.body.innerHTML = `
            <div class="client-stats-sheet">
                <div class="client-stats-summary">
                    <article class="client-stats-kpi">
                        <span class="client-stats-kpi__label">Probabilidad de pagar</span>
                        <div class="client-stats-kpi__value" id="client_stats_prob">--%</div>
                        <div class="client-stats-kpi__meta">Estimación basada en su historial de pagos/deudas.</div>
                    </article>
                    <article class="client-stats-kpi">
                        <span class="client-stats-kpi__label">Score de pago</span>
                        <div class="client-stats-kpi__value" id="client_stats_score">--</div>
                        <div class="client-stats-kpi__meta"><span class="client-stats-badge" id="client_stats_badge" data-tone="mid">Analizando...</span></div>
                    </article>
                </div>

                <article class="client-stats-chart">
                    <h4>Evolución de la deuda del cliente</h4>
                    <div class="client-stats-canvas-wrap"><canvas id="chart_cliente_deudas"></canvas></div>
                </article>

                <article class="client-stats-chart">
                    <h4>Evolución de los pagos del cliente</h4>
                    <div class="client-stats-canvas-wrap"><canvas id="chart_cliente_pagos"></canvas></div>
                </article>
            </div>
        `;
    }

    document.body.classList.add('client-stats-open');

    try {
        await ensureChartJs();
        destroyClientStatsCharts();

        const [resDeudas, resPagos, deudaActiva] = await Promise.all([
            fetchOperacionesClienteByTipo('deudas', currentClienteTelefono, true),
            fetchOperacionesClienteByTipo('pagos', currentClienteTelefono, true),
            calcularMontoTotalAdeudado(currentClienteTelefono),
        ]);

        if (resDeudas.error) throw new Error(resDeudas.error.message || 'No se pudieron cargar deudas');
        if (resPagos.error) throw new Error(resPagos.error.message || 'No se pudieron cargar pagos');

        const deudas = (resDeudas.data || []);
        const pagos = (resPagos.data || []);
        const serieDeuda = buildMonthlySeries(deudas);
        const seriePago = buildMonthlySeries(pagos);
        const indicadores = computePaymentIndicators({ pagos, deudas, deudaActiva });

        const probEl = document.getElementById('client_stats_prob');
        const scoreEl = document.getElementById('client_stats_score');
        const badgeEl = document.getElementById('client_stats_badge');
        if (probEl) probEl.textContent = `${indicadores.probabilidad}%`;
        if (scoreEl) scoreEl.textContent = `${indicadores.score} / 850`;
        if (badgeEl) {
            badgeEl.textContent = indicadores.label;
            badgeEl.dataset.tone = indicadores.tone;
            badgeEl.title = `Pagado: ${currency.format(indicadores.totalPagado)} • Deuda registrada: ${currency.format(indicadores.totalDeudaRegistrada)} • Días sin pagar: ${indicadores.diasSinPagar}`;
        }

        pushLineChart('chart_cliente_deudas', serieDeuda.map((x) => x.label), serieDeuda.map((x) => x.total), 'rgba(244, 63, 94, 0.95)', 'rgba(244, 63, 94, 0.42)', 'rgba(244, 63, 94, 0.04)');
        pushLineChart('chart_cliente_pagos', seriePago.map((x) => x.label), seriePago.map((x) => x.total), 'rgba(16, 185, 129, 0.95)', 'rgba(16, 185, 129, 0.42)', 'rgba(16, 185, 129, 0.04)');
    } catch (err) {
        console.error(err);
        await showErrorToast('No se pudieron cargar las estadísticas del cliente.');
    }
}

function renderListaOperacionesCliente(container, items, tipo){
    container.innerHTML = '';
    if (!items || items.length === 0){
        const empty = document.createElement('div');
        empty.textContent = 'No hay registros.';
        container.appendChild(empty);
        return;
    }
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const visibleItems = isExpandedCliente ? items.slice(0,50) : items.slice(0,3);
    visibleItems.forEach(item => {
        const fechaRaw = item.Creado || item.creado || item.fecha || item.created_at || '';
        const fecha = formatDate(fechaRaw);
        const montoRaw = item.Monto ?? item.monto ?? item.Amount ?? item.amount ?? 0;
        const monto = Number(montoRaw) || 0;
        const card = document.createElement('div');
        card.className = 'op-item';
        card.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div>
                    <div style="font-weight:600; color:${tipo==='deudas' ? 'var(--danger)' : 'var(--success)'}">${tipo==='deudas' ? 'Deuda' : 'Pago'}</div>
                    <div class="muted" style="font-size:0.85rem;">${escapeHtml(String(fecha))}</div>
                </div>
                <div style="font-weight:700;">${formatter.format(monto)}</div>
            </div>
        `;
        card.addEventListener('click', () => showOperacionDetalleCliente(item, tipo));
        container.appendChild(card);
    });
    if (!isExpandedCliente && items.length > 3){
        const more = document.createElement('div');
        more.className = 'more-indicator';
        more.textContent = `Mostrar ${items.length - 3} registros más`;
        more.addEventListener('click', () => expandirTablaCliente());
        container.appendChild(more);
    }
}

function expandirTablaCliente(){
    isExpandedCliente = !isExpandedCliente;
    const btn = document.getElementById('btn_expandir_cliente');
    if (btn) btn.textContent = isExpandedCliente ? 'Contraer' : 'Expandir';
    const cont = document.getElementById('lista_operaciones_cliente');
    if (cont) cont.classList.toggle('collapsed', !isExpandedCliente);
    // Re-render con la vista actual
    mostrarOperacionesCliente(currentClienteOpView);
}

async function showOperacionDetalleCliente(item, tipo){
    openOperacionDetalleDrawer(item, tipo);
}

// --- Drawer: detalle de deuda/pago (sin SweetAlert) ---
let opDrawerEls = null;

function ensureOperacionDetalleDrawer(){
    if (opDrawerEls) return opDrawerEls;

    let backdrop = document.getElementById('opDetailBackdrop');
    let drawer = document.getElementById('opDetailDrawer');
    if (!backdrop){
        backdrop = document.createElement('div');
        backdrop.id = 'opDetailBackdrop';
        backdrop.className = 'op-detail-backdrop';
        document.body.appendChild(backdrop);
    }
    if (!drawer){
        drawer = document.createElement('div');
        drawer.id = 'opDetailDrawer';
        drawer.className = 'op-detail-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Detalle de operación');
        drawer.innerHTML = `
            <div class="op-detail-drawer__header">
                <div>
                    <h3 class="op-detail-drawer__title" id="opDetailTitle">Detalle</h3>
                    <div class="op-detail-drawer__subtitle" id="opDetailSubtitle">—</div>
                </div>
                <button type="button" class="icon-btn" id="opDetailClose" aria-label="Cerrar" title="Cerrar">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            </div>
            <div class="op-detail-drawer__body">
                <div class="op-detail-grid" id="opDetailGrid"></div>
                <div class="op-detail-actions">
                    <button type="button" class="btn btn-danger-soft" id="opDetailDelete">Eliminar registro</button>
                </div>
            </div>
        `;
        document.body.appendChild(drawer);
    }

    const close = () => closeOperacionDetalleDrawer();
    backdrop.addEventListener('click', close);
    const closeBtn = drawer.querySelector('#opDetailClose');
    closeBtn?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeOperacionDetalleDrawer();
    });

    opDrawerEls = {
        backdrop,
        drawer,
        title: drawer.querySelector('#opDetailTitle'),
        subtitle: drawer.querySelector('#opDetailSubtitle'),
        grid: drawer.querySelector('#opDetailGrid'),
        deleteBtn: drawer.querySelector('#opDetailDelete'),
        currentItem: null,
        currentTipo: null
    };
    return opDrawerEls;
}

function closeOperacionDetalleDrawer(){
    document.body.classList.remove('op-detail-open');
    const els = ensureOperacionDetalleDrawer();
    els.currentItem = null;
    els.currentTipo = null;
}

function renderOpDetailRow(label, value, opts = {}){
    const amount = !!opts.amount;
    const safeValue = (value === null || value === undefined || value === '') ? '—' : String(value);
    return `
        <div class="op-detail-row">
            <div class="op-detail-label">${escapeHtml(label)}</div>
            <div class="op-detail-value ${amount ? 'op-detail-amount' : ''}">${escapeHtml(safeValue)}</div>
        </div>
    `;
}

function openOperacionDetalleDrawer(item, tipo){
    const els = ensureOperacionDetalleDrawer();
    els.currentItem = item;
    els.currentTipo = tipo;

    const isDeuda = tipo === 'deudas';
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const montoRaw = item?.Monto ?? item?.monto ?? item?.Amount ?? item?.amount ?? 0;
    const monto = Number(montoRaw) || 0;
    const creadoRaw = item?.Creado ?? item?.creado ?? item?.fecha ?? item?.created_at ?? '';
    const fecha = formatDate(creadoRaw);
    const categoria = item?.Categoria ?? item?.categoria ?? item?.Concepto ?? item?.concepto ?? '';

    if (els.title) els.title.textContent = isDeuda ? 'Detalle de Deuda' : 'Detalle de Pago';
    if (els.subtitle) els.subtitle.textContent = currentClienteNombre ? `Cliente: ${currentClienteNombre}` : '—';

    const rows = [];
    rows.push(renderOpDetailRow('Monto', formatter.format(monto), { amount: true }));
    rows.push(renderOpDetailRow('Fecha', fecha));
    rows.push(renderOpDetailRow('Categoría', categoria || '—'));

    // Mostrar solo campos no sensibles/no IDs (embellecido y sin ids)
    const ignoredKeys = new Set([
        'Monto','monto','Amount','amount',
        'Creado','creado','fecha','created_at',
        'Telefono_cliente','Cliente','cliente','client',
        'ID_Negocio','id_negocio','idNegocio'
    ]);
    const idLike = (k) => /^id(_|$)/i.test(String(k)) || /_id$/i.test(String(k));
    Object.keys(item || {}).forEach((k) => {
        if (ignoredKeys.has(k)) return;
        if (idLike(k)) return; // elimina id_deuda / id_pago / id
        if (k === 'Categoria' || k === 'categoria' || k === 'Concepto' || k === 'concepto') return;
        const v = item[k];
        if (v === null || v === undefined || v === '') return;
        let display;
        if (typeof v === 'object') { try { display = JSON.stringify(v); } catch { display = String(v); } }
        else display = String(v);
        rows.push(renderOpDetailRow(String(k), display));
    });

    if (els.grid) els.grid.innerHTML = rows.join('');

    if (els.deleteBtn){
        els.deleteBtn.textContent = 'Eliminar registro';
        els.deleteBtn.onclick = async () => {
            await confirmarYEliminarOperacionDesdeDrawer();
        };
    }

    document.body.classList.add('op-detail-open');
}

async function eliminarOperacionIndiv(item, tipo, telefono){
    try{
        const table = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
        const candidates = (tipo === 'deudas')
            ? ['id_deuda','idDeuda','id','ID','Id']
            : ['id_pago','idPago','id','ID','Id'];

        let usedKey = null;
        let idVal = null;
        for (const k of candidates){
            if (item && item[k] !== undefined && item[k] !== null){ usedKey = k; idVal = item[k]; break; }
        }

        let del = supabase.from(table).delete();
        if (usedKey){
            del = del.eq(usedKey, idVal);
        } else {
            const matchObj = { };
            if (telefono) matchObj['Telefono_cliente'] = telefono;
            const monto = (item?.Monto ?? item?.monto);
            if (monto !== undefined) matchObj['Monto'] = Number(monto) || 0;
            const fecha = (item?.Creado ?? item?.created_at ?? item?.fecha ?? item?.creado);
            if (fecha !== undefined) matchObj['Creado'] = fecha;
            del = del.match(matchObj);
        }
        del = applyIdNegocioFilter(del);
        const { error } = await del;
        if (error){ await showErrorToast('No se pudo eliminar el registro: ' + error.message); return false; }
        return true;
    }catch(err){
        console.error('Eliminar operacion indiv error', err);
        await showErrorToast('Error eliminando el registro');
        return false;
    }
}

async function confirmarYEliminarOperacionDesdeDrawer(){
    const els = ensureOperacionDetalleDrawer();
    const item = els.currentItem;
    const tipo = els.currentTipo;
    if (!item || !tipo){
        await showErrorToast('No hay operación seleccionada.');
        return;
    }
    if (!currentClienteTelefono){
        await showErrorToast('No hay cliente seleccionado.');
        return;
    }

    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const monto = Number(item?.Monto ?? item?.monto ?? 0) || 0;
    const fecha = formatDate(item?.Creado ?? item?.created_at ?? item?.fecha ?? item?.creado ?? '');
    const titulo = (tipo === 'deudas') ? 'Eliminar deuda' : 'Eliminar pago';

    let shouldAdjustDeuda = false;
    if (tipo === 'deudas'){
        const res = await openConfirmSheetWithOption({
            title: titulo,
            subtitle: 'Este registro es solo archivo.',
            messageHtml: `Vas a eliminar <strong>un registro</strong> (archivo) de deuda por <strong>${escapeHtml(formatter.format(monto))}</strong> del <strong>${escapeHtml(String(fecha))}</strong>.<br><br><span class="muted">Por defecto, la Deuda Activa del cliente no cambia.</span>`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            optionLabel: 'Restar este monto de la Deuda Activa del cliente',
            optionDefault: false
        });
        if (!res.confirmed) return;
        shouldAdjustDeuda = !!res.option;
    } else {
        const okConfirm = await openConfirmSheet({
            title: titulo,
            subtitle: 'Solo se eliminará el registro.',
            messageHtml: `Al eliminar el pago <strong>solo se elimina el registro</strong>.<br><br><span class="muted">Los totales se recalculan por historial.</span>`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });
        if (!okConfirm) return;
    }

    const ok = await eliminarOperacionIndiv(item, tipo, currentClienteTelefono);
    if (!ok) return;

    if (tipo === 'deudas' && shouldAdjustDeuda){
        await ajustarDeudaActivaCliente(currentClienteTelefono, -monto);
        // Recargar la interfaz de clientes para reflejar la nueva Deuda_Activa
        try{
            window.location.reload();
        }catch(e){
            console.warn('No se pudo recargar la lista de clientes:', e);
        }
    }

    // refrescar panel
    try{
        const formatter2 = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
        const totalPagado = await calcularMontoTotalPagado(currentClienteTelefono);
        const elPagado = document.getElementById('montototalPagado');
        if (elPagado) elPagado.innerHTML = formatter2.format(totalPagado);
        // deuda activa viene de Clientes; no se toca
        await mostrarOperacionesCliente(currentClienteOpView);
    }catch(e){
        console.warn('Refresco post-eliminar falló', e);
    }

    closeOperacionDetalleDrawer();
    await showSuccessToast(`${(tipo === 'deudas') ? 'Deuda' : 'Pago'} eliminado (${formatter.format(monto)} • ${fecha})`);
}

// Mostrar detalles del cliente en un modal que replica la UI/funcionalidad del div de detalles
async function mostrarDetallesClienteModal(cliente){
    if (!cliente) return;
    const nombre = cliente.Nombre ?? cliente.nombre ?? '';
    const telefono = normalizePhone(cliente.Telefono ?? cliente.telefono ?? '');

    // actualizar estado global
    currentClienteTelefono = telefono;
    currentClienteNombre = nombre;
    currentClienteOpView = 'deudas';
    isExpandedCliente = true; // mostrar todo directamente

    ensureClienteModalStyles();

    // Si ya existe, primero eliminar para recrear limpio
    const old = document.getElementById('clienteModalOverlay');
    if (old) old.remove();

    const overlay = document.createElement('div');
    overlay.id = 'clienteModalOverlay';
    overlay.innerHTML = `
        <div class="cliente-modal" role="dialog" aria-modal="true" aria-label="Detalles del cliente">
            <div class="cliente-modal__header">
                <h2 class="cliente-modal__title">${escapeHtml(nombre)}</h2>
                <button type="button" class="cliente-modal__close" aria-label="Cerrar" id="clienteModalCloseBtn">×</button>
            </div>
            <div class="cliente-modal__body">
                <div class="cliente-modal__info">
                    <div class="cliente-modal__dato"><strong>Teléfono:</strong> <span>${escapeHtml(telefono)}</span></div>
                    <div class="cliente-modal__total">
                        <span class="label">Deuda Activa</span>
                        <div id="modal_montototalAdeudado" class="total-number">$ 0</div>
                    </div>
                </div>
                <div class="cliente-modal__toolbar">
                    <div class="tabs" role="tablist">
                        <button id="modal_btn_ver_deudas" class="tab active" type="button">Deudas</button>
                        <button id="modal_btn_ver_pagos" class="tab" type="button">Pagos</button>
                    </div>
                    <div class="actions">
                        <button id="modal_btn_whatsapp" class="btn sm alt">WhatsApp</button>
                        <button id="modal_btn_refrescar" class="icon-btn btn sm" aria-label="Refrescar" title="Refrescar">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                        </button>
                        <button id="modal_btn_eliminar_todas" class="btn sm" style="background:#d33;color:#fff;border-color:transparent;">Eliminar Deudas</button>
                    </div>
                </div>
                <div id="modal_lista_operaciones" class="cliente-modal__lista">Cargando...</div>
            </div>
            <div class="cliente-modal__footer">
                <span class="hint">Click fuera o ESC para cerrar</span>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    const elTotalAdeudado = overlay.querySelector('#modal_montototalAdeudado');
    const btnWhats = overlay.querySelector('#modal_btn_whatsapp');
    const btnRefrescar = overlay.querySelector('#modal_btn_refrescar');
    const btnEliminarTodas = overlay.querySelector('#modal_btn_eliminar_todas');
    const btnDeudas = overlay.querySelector('#modal_btn_ver_deudas');
    const btnPagos = overlay.querySelector('#modal_btn_ver_pagos');
    const listaCont = overlay.querySelector('#modal_lista_operaciones');
    const btnClose = overlay.querySelector('#clienteModalCloseBtn');

    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    let modalView = 'deudas';

    async function updateTotals(){
        try{
            let q = supabase
                .from('Clientes')
                .select('Deuda_Activa')
                .eq('Telefono', telefono);
            q = applyIdNegocioFilter(q);
            const { data, error } = await q.single();
            let adeudado = 0;
            if (!error) {
                adeudado = Number(data?.Deuda_Activa) || 0;
                cliente.Deuda_Activa = adeudado;
            }
            if (elTotalAdeudado) elTotalAdeudado.textContent = formatter.format(adeudado);
        }catch(err){
            console.error('updateTotals error', err);
        }
    }

    // Permitir edición manual de Deuda Activa al hacer click en el monto
    elTotalAdeudado?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const valorActual = Number(cliente.Deuda_Activa) || 0;
        const nuevoStr = await openPromptSheet({
            title: 'Editar Deuda Activa',
            subtitle: 'Nuevo monto (ARS)',
            label: 'Nuevo monto (ARS)',
            hint: 'Se guardará como Deuda Activa del cliente.',
            value: valorActual.toFixed(2),
            placeholder: '0.00',
            inputMode: 'decimal',
            confirmText: 'Guardar',
            cancelText: 'Cancelar',
            validate: (val) => {
                if (val === null || val === undefined || String(val).trim() === '') return 'Ingresa un monto';
                const normalizado = String(val).replace(/[^0-9,\.]/g,'').replace(',', '.');
                const num = parseFloat(normalizado);
                if (Number.isNaN(num) || num < 0) return 'Monto inválido';
                if (num > 1_000_000_000) return 'Monto demasiado grande';
                return null;
            }
        });
        if (nuevoStr === null) return; // cancelado
        const normalizado = String(nuevoStr).replace(/[^0-9,\.]/g,'').replace(',', '.');
        const nuevo = parseFloat(normalizado);
        if (isNaN(nuevo)) return;
        try {
            let upd = supabase
                .from('Clientes')
                .update({ Deuda_Activa: nuevo })
                .eq('Telefono', telefono);
            upd = applyIdNegocioFilter(upd);
            const { error: updErr } = await upd;
            if (updErr){
                await showErrorToast('Error al actualizar deuda: ' + updErr.message);
                return;
            }
            cliente.Deuda_Activa = nuevo;
            if (elTotalAdeudado) elTotalAdeudado.textContent = formatter.format(nuevo);
            await showSuccessToast('Deuda actualizada');
        }catch(err){
            console.error('Error actualizando deuda activa', err);
            await showErrorToast('Error inesperado al actualizar');
        }
    });
    // Indicador visual de que se puede editar
    if (elTotalAdeudado) {
        elTotalAdeudado.style.cursor = 'pointer';
        elTotalAdeudado.title = 'Click para editar Deuda Activa';
    }

    async function loadOps(view){
        if (!listaCont) return;
        listaCont.textContent = 'Cargando...';
        try {
            const tabla = (view === 'deudas') ? 'Deudas' : 'Pagos';
            let q = supabase.from(tabla)
                .select('*')
                .eq('Telefono_cliente', telefono);
            q = applyIdNegocioFilter(q);
            const { data, error } = await q.order('Creado', { ascending: false });
            if (error){
                listaCont.textContent = 'Error al cargar.';
                return;
            }
            const items = data || [];
            listaCont.innerHTML = '';
            const formatterLocal = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
            if (items.length === 0){
                listaCont.textContent = 'No hay registros.';
                return;
            }
            items.slice(0,200).forEach(item => { // hard cap para no congelar UI
                const fecha = formatDate(item.Creado || item.fecha || item.creado || '');
                const monto = Number(item.Monto ?? item.monto ?? 0) || 0;
                const card = document.createElement('div');
                card.className = 'op-item';
                card.tabIndex = 0;
                card.innerHTML = `<div class="op-row">
                    <div>
                        <div class="op-kind ${view==='deudas' ? 'neg' : 'pos'}">${view==='deudas' ? 'Deuda' : 'Pago'}</div>
                        <div class="op-date">${escapeHtml(String(fecha))}</div>
                    </div>
                    <div class="op-monto">${formatterLocal.format(monto)}</div>
                </div>`;
                card.addEventListener('click', () => showOperacionDetalleCliente(item, view));
                card.addEventListener('keypress', (e)=>{ if(e.key==='Enter') showOperacionDetalleCliente(item, view); });

                // Acciones individuales (solo para deudas): eliminar y WhatsApp
                if (view === 'deudas'){
                    const actions = document.createElement('div');
                    actions.className = 'op-actions';
                    actions.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:6px;';

                    const delBtn = document.createElement('button');
                    delBtn.className = 'btn sm';
                    delBtn.textContent = 'Eliminar';
                    delBtn.style.cssText = 'background:#d33;color:#fff;border-color:transparent;';
                    delBtn.addEventListener('click', async (ev) => {
                        ev.stopPropagation();
                        const res = await openConfirmSheetWithOption({
                            title: 'Eliminar deuda',
                            subtitle: 'Este registro es solo archivo.',
                            messageHtml: `Vas a eliminar <strong>un registro</strong> (archivo) de deuda por <strong>${escapeHtml(formatterLocal.format(monto))}</strong> del <strong>${escapeHtml(String(fecha))}</strong>.<br><br><span class="muted">Por defecto, la Deuda Activa del cliente no cambia.</span>`,
                            confirmText: 'Eliminar',
                            cancelText: 'Cancelar',
                            optionLabel: 'Restar este monto de la Deuda Activa del cliente',
                            optionDefault: false
                        });
                        if (!res.confirmed) return;
                        const ok = await eliminarDeudaIndiv(item, telefono);
                        if (ok){
                            if (res.option){
                                await ajustarDeudaActivaCliente(telefono, -monto);
                            }
                            await updateTotals();
                            await loadOps(view);
                            await showSuccessToast('Deuda eliminada');
                        }
                    });

                    const waBtn = document.createElement('button');
                    waBtn.className = 'btn sm alt';
                    waBtn.textContent = 'WhatsApp';
                    waBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const mensaje = `Hola ${currentClienteNombre || ''}, deuda registrada: ${formatterLocal.format(monto)} el ${fecha}.`;
                        const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
                        window.open(url, '_blank');
                    });

                    actions.appendChild(delBtn);
                    actions.appendChild(waBtn);
                    card.appendChild(actions);
                }
                listaCont.appendChild(card);
            });
            if (items.length > 200){
                const more = document.createElement('div');
                more.className = 'more-indicator';
                more.textContent = `Mostrando 200 de ${items.length} registros (filtra para ver menos)`;
                listaCont.appendChild(more);
            }
        } catch(err){
            console.error(err);
            listaCont.textContent = 'Error al cargar.';
        }
    }

    function setActiveTabs(){
        btnDeudas?.classList.toggle('active', modalView==='deudas');
        btnPagos?.classList.toggle('active', modalView==='pagos');
    }

    // Eventos
    btnWhats?.addEventListener('click', () => {
        const mensaje = `Hola ${currentClienteNombre}, tu deuda total es de ${elTotalAdeudado ? elTotalAdeudado.textContent : ''}.`;
        const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
        window.open(url, '_blank');
    });
    btnRefrescar?.addEventListener('click', async () => { await updateTotals(); await loadOps(modalView); });
    btnDeudas?.addEventListener('click', async () => { modalView = 'deudas'; setActiveTabs(); await loadOps(modalView); });
    btnPagos?.addEventListener('click', async () => { modalView = 'pagos'; setActiveTabs(); await loadOps(modalView); });
    btnEliminarTodas?.addEventListener('click', async () => {
        if (modalView !== 'deudas') return;
        // Intentar calcular el total de registros a eliminar (para la opción de ajustar Deuda Activa)
        let totalMonto = 0;
        let count = 0;
        let countKnown = false;
        try{
            let q = supabase
                .from('Deudas')
                .select('Monto')
                .eq('Telefono_cliente', telefono);
            q = applyIdNegocioFilter(q);
            const { data, error } = await q;
            if (!error){
                const arr = data || [];
                count = arr.length;
                totalMonto = arr.reduce((acc, d) => acc + (Number(d?.Monto) || 0), 0);
                countKnown = true;
            }
        }catch(e){
            // best-effort; si falla, igual permitimos borrar
            console.warn('No se pudo calcular el total de deudas para ajustar Deuda Activa', e);
        }

        if (countKnown && count === 0){
            await showinfo('Sin deudas', 'No hay deudas para eliminar.');
            return;
        }

        let shouldAdjust = false;
        if (countKnown){
            const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
            const res = await openConfirmSheetWithOption({
                title: 'Eliminar todas las deudas',
                subtitle: 'Estos registros son solo archivo.',
                messageHtml: `Vas a eliminar <strong>${escapeHtml(String(count))}</strong> registros (archivo) de deudas por un total de <strong>${escapeHtml(formatter.format(totalMonto))}</strong>.<br><br><span class="muted">Por defecto, la Deuda Activa del cliente no cambia.</span>`,
                confirmText: 'Eliminar todas',
                cancelText: 'Cancelar',
                optionLabel: 'Restar este total de la Deuda Activa del cliente',
                optionDefault: false
            });
            if (!res.confirmed) return;
            shouldAdjust = !!res.option;
        } else {
            const okConfirm = await openConfirmSheet({
                title: 'Eliminar todas las deudas',
                subtitle: 'Estos registros son solo archivo.',
                messageHtml: '¿Eliminar <strong>TODAS</strong> las deudas de este cliente?<br><br><span class="muted">Por defecto, la Deuda Activa del cliente no cambia.</span>',
                confirmText: 'Eliminar todas',
                cancelText: 'Cancelar'
            });
            if (!okConfirm) return;
        }

        const ok = await eliminarDeudasCliente(telefono);
        if (ok){
            if (shouldAdjust){
                await ajustarDeudaActivaCliente(telefono, -totalMonto);
            }
            await updateTotals();
            await loadOps(modalView);
            await showSuccessToast('Deudas eliminadas');
        }
    });
    btnClose?.addEventListener('click', closeModalCliente);
    overlay.addEventListener('click', (e)=>{ if(e.target === overlay) closeModalCliente(); });
    document.addEventListener('keydown', escListenerOnce);

    async function init(){
        setActiveTabs();
        await updateTotals();
        await loadOps(modalView);
    }
    init();
}

function escListenerOnce(e){
    if (e.key === 'Escape'){
        closeModalCliente();
    }
}

function closeModalCliente(){
    const overlay = document.getElementById('clienteModalOverlay');
    if (overlay){
        overlay.remove();
    }
    document.removeEventListener('keydown', escListenerOnce);
}

function ensureClienteModalStyles(){
    if (document.getElementById('clienteModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'clienteModalStyles';
    style.textContent = `
    #clienteModalOverlay{position:fixed;inset:0;background:rgba(0,0,0,.42);display:flex;align-items:flex-start;justify-content:center;z-index:9999;padding:32px 20px;overflow-y:auto;}
    /* Asegurar que SweetAlert2 quede por encima del overlay del cliente */
    .swal2-container{z-index:10050 !important;}
    .cliente-modal{background:var(--bg-elev);color:var(--text);width:840px;max-width:100%;border-radius:14px;border:1px solid var(--border);box-shadow:0 8px 28px -4px rgba(0,0,0,.28);display:flex;flex-direction:column;font-size:14px;}
    .cliente-modal__header{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 8px 20px;border-bottom:1px solid var(--border);}
    .cliente-modal__title{margin:0;font-size:1.25rem;line-height:1.2;color:var(--heading);}
    .cliente-modal__close{background:transparent;border:none;font-size:24px;line-height:1;cursor:pointer;color:var(--muted);padding:4px 8px;}
    .cliente-modal__body{padding:8px 20px 16px 20px;display:flex;flex-direction:column;gap:16px;color:var(--text);}
    .cliente-modal__info{display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start;}
    .cliente-modal__dato{min-width:200px;}
    .cliente-modal__total{padding:8px 12px;border:1px solid var(--border);border-radius:8px;min-width:220px;background:var(--input);}
    .cliente-modal__total .total-number{font-weight:700;margin-top:4px;color:var(--danger);font-size:1.15rem;}
    .cliente-modal__toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;color:var(--text);}
    .cliente-modal__toolbar .tabs{display:flex;gap:6px;background:var(--input);border:1px solid var(--border);border-radius:12px;padding:4px;}
    .cliente-modal__toolbar .actions{display:flex;gap:6px;flex-wrap:wrap;}
    .cliente-modal__lista{display:flex;flex-direction:column;gap:6px;max-height:60vh;overflow-y:auto;overflow-x:hidden;padding-right:4px;}
    .op-item{border:1px solid var(--border);border-radius:12px;padding:12px;background:var(--input);transition:background .12s ease, box-shadow .12s ease;}
    .op-item:hover{background:rgba(255,255,255,0.03);box-shadow:0 2px 4px -2px rgba(0,0,0,.18);}
    .op-row{display:flex;align-items:center;justify-content:space-between;gap:12px;}
    .op-kind{font-weight:600;margin-bottom:2px;}
    .op-kind.neg{color:var(--danger);} .op-kind.pos{color:var(--success);}
    .op-date{font-size:.75rem;color:var(--muted);}
    .op-monto{font-weight:700;}
    .cliente-modal .tab{appearance:none;background:transparent;color:var(--text);border:0;border-radius:10px;padding:8px 12px;font-weight:600;cursor:pointer;}
    .cliente-modal .tab:hover{background:rgba(255,255,255,0.04);}
    .cliente-modal .tab.active{background:var(--primary);color:#fff;}
    .btn.sm{font-size:.75rem;padding:6px 10px;}
    .btn.alt{background:var(--success);border-color:transparent;color:#fff;}
    .more-indicator{font-size:.8rem;text-align:center;padding:8px;margin-top:4px;color:var(--muted);}
    .cliente-modal__footer{padding:8px 16px 14px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;color:var(--muted);}
    .cliente-modal__footer .hint{font-size:.7rem;}
    @media (max-width:900px){.cliente-modal{width:100%;border-radius:0;min-height:100%;}.cliente-modal__lista{max-height:50vh;}}
    `;
    document.head.appendChild(style);
}


// Refrescar operaciones y totales del cliente visible
async function refrescarOperacionesCliente(){
    if (!currentClienteTelefono) return;
    await mostrarOperacionesCliente(currentClienteOpView);
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    const totalPagado = await calcularMontoTotalPagado(currentClienteTelefono);
    const totalAdeudado = await calcularMontoTotalAdeudado(currentClienteTelefono);
    const elPagado = document.getElementById('montototalPagado');
    const elAdeudado = document.getElementById('montototalAdeudado');
    if (elPagado) elPagado.textContent = formatter.format(totalPagado);
    if (elAdeudado) elAdeudado.textContent = formatter.format(totalAdeudado);
}

// Cerrar contenedor de detalles del cliente
function cerrarDetallesCliente(){
    // Si estamos editando, el botón de cerrar debe cerrar SOLO la edición
    // (volver a la vista de detalle) sin perder el cliente seleccionado.
    if (isEditingCliente){
        setClienteEditMode(false);
        return;
    }
    setResponsiveDetailsOpen(false);
    const cont = document.getElementById('lista_operaciones_cliente');
    if (cont) cont.innerHTML = 'Selecciona un cliente para ver sus operaciones.';
    const nombre = document.getElementById('nombreCliente');
    const telefono = document.getElementById('telefonoCliente');
    const avatar = document.getElementById('avatarCliente');
    const totalPagado = document.getElementById('montototalPagado');
    const totalAdeudado = document.getElementById('montototalAdeudado');
    if (nombre) nombre.innerHTML = 'Nombre: <br>Cargando...';
    if (telefono) telefono.innerHTML = 'Teléfono: <br>Cargando...';
    if (avatar) avatar.textContent = 'CP';
    if (totalPagado) totalPagado.textContent = '0.00';
    if (totalAdeudado) totalAdeudado.textContent = '0.00';
    document.querySelectorAll('.client-item[aria-selected="true"]').forEach((el) => el.removeAttribute('aria-selected'));
    currentClienteTelefono = null;
    currentClienteNombre = null;
    setClienteEditMode(false);
    syncDesktopNoClientSelected();
    syncEditButtonVisibility();
}
window.cerrarDetallesCliente = cerrarDetallesCliente;

window.addEventListener('resize', () => {
    if (window.innerWidth > 1080) {
        document.body.classList.remove('mobile-details-open');
    }
    syncDesktopNoClientSelected();
    syncEditButtonVisibility();
});

// Wire UI actions
const btnEditarCliente = document.getElementById('btn_editar_cliente');
if (btnEditarCliente){
    btnEditarCliente.addEventListener('click', editarClienteActual);
}

const btnStatsCliente = document.getElementById('btn_stats_cliente');
if (btnStatsCliente){
    btnStatsCliente.addEventListener('click', abrirEstadisticasCliente);
}

const btnBorrarCliente = document.getElementById('btn_borrar_cliente');
if (btnBorrarCliente){
    btnBorrarCliente.addEventListener('click', borrarClienteActual);
}

const btnGuardarCliente = document.getElementById('btn_guardar_cliente');
if (btnGuardarCliente){
    btnGuardarCliente.addEventListener('click', guardarEdicionCliente);
}

const btnCancelarEdicion = document.getElementById('btn_cancelar_edicion');
if (btnCancelarEdicion){
    btnCancelarEdicion.addEventListener('click', cancelarEdicionCliente);
}

document.getElementById('buscarClienteInput').addEventListener('input', async (e) => {
    const query = (e.target.value || '').trim();
    if (query.length === 0){
        await verTodosClientes();
        return;
    }

    // Construir filtro OR para: parte del nombre contiene query, o teléfono contiene query
    const digits = query.replace(/\D+/g, '');
    const orParts = [
        `Nombre.ilike.%${query}%`
    ];
    // Si hay dígitos, buscar por teléfono también con esos dígitos; si no, usar query completo por si pega tal cual
    if (digits.length >= 3) {
        orParts.push(`Telefono.ilike.%${digits}%`);
    } else if (query.length >= 3) {
        orParts.push(`Telefono.ilike.%${query}%`);
    }
    const orFilter = orParts.join(',');

    let q = supabase
        .from('Clientes')
        .select('*')
        .or(orFilter)
        .limit(50);
    q = applyIdNegocioFilter(q);
    const { data, error } = await q;
    if (error){
        showErrorToast('Error al obtener los clientes: ' + error.message);
        return;
    }

    // Opcional: priorizar coincidencias donde el nombre completo esté contenido en el query
    const qLower = query.toLowerCase();
    const ordered = (data || []).slice().sort((a, b) => {
        const aName = String(a.Nombre || '').toLowerCase();
        const bName = String(b.Nombre || '').toLowerCase();
        const aFullInQ = qLower.includes(aName) ? 1 : 0;
        const bFullInQ = qLower.includes(bName) ? 1 : 0;
        return bFullInQ - aFullInQ; // primero los que estén completamente contenidos
    });

    // Filtrado adicional por tokens en cualquier orden (nombre y teléfono)
    const tokens = qLower.split(/\s+/).filter(Boolean);
    const normalize = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const onlyDigits = (s) => (s || '').toString().replace(/\D+/g, '');
    const filtered = ordered.filter(row => {
        const nameNorm = normalize(row.Nombre || '');
        const phoneDigits = onlyDigits(row.Telefono || '');
        const haystack = `${nameNorm} ${phoneDigits}`;
        return tokens.every(t => {
            const tDigits = onlyDigits(t);
            if (tDigits.length > 0) return haystack.includes(tDigits);
            return haystack.includes(normalize(t));
        });
    });

    renderClientesEnContenedor(filtered || []);
});

// Carga inicial para el layout actual (lista visible por defecto)
verTodosClientes();
syncDesktopNoClientSelected();
syncEditButtonVisibility();
initFiltrosClientes();

function enviarDeudaTotal(){
    if (!currentClienteTelefono || !currentClienteNombre) {
        showErrorToast('No hay cliente seleccionado.');
        return;
    }
    const deudaTot = calcularMontoTotalAdeudado(currentClienteTelefono);
    deudaTot.then((monto) => {
        if (monto <= 0) {
            showErrorToast('El cliente no tiene deudas pendientes.');
            return;
        }
        const numero = normalizePhone(currentClienteTelefono);
        const mensaje = `Hola ${currentClienteNombre}, tu deuda total es de ${monto}.`;
        const mensajeCodificado = encodeURIComponent(mensaje);
        const urlWhatsApp = `https://wa.me/${numero}?text=${mensajeCodificado}`;
        window.open(urlWhatsApp, '_blank'); 
    });
}
window.enviarDeudaTotal = enviarDeudaTotal

// Eliminar una deuda individual
async function eliminarDeudaIndiv(item, telefono){
    try{
        // Detectar llave primaria probable
        const idKeys = ['id_deuda','idDeuda','id','ID','Id'];
        let usedKey = null; let idVal = null;
        for (const k of idKeys){
            if (item && item[k] !== undefined && item[k] !== null){ usedKey = k; idVal = item[k]; break; }
        }
        let del = supabase.from('Deudas').delete();
        if (usedKey){
            del = del.eq(usedKey, idVal);
        } else {
            // Fallback: usar coincidencia por teléfono + monto + fecha si existen
            const matchObj = { };
            if (telefono) matchObj['Telefono_cliente'] = telefono;
            const monto = (item.Monto ?? item.monto);
            if (monto !== undefined) matchObj['Monto'] = Number(monto) || 0;
            const fecha = (item.Creado ?? item.created_at ?? item.fecha ?? item.creado);
            if (fecha !== undefined) matchObj['Creado'] = fecha;
            del = del.match(matchObj);
        }
        del = applyIdNegocioFilter(del);
        const { error } = await del;
        if (error){ await showErrorToast('No se pudo eliminar la deuda: ' + error.message); return false; }
        return true;
    }catch(err){
        console.error('Eliminar deuda indiv error', err);
        await showErrorToast('Error eliminando la deuda');
        return false;
    }
}

// Eliminar todas las deudas del cliente (sin borrar al cliente)
async function eliminarDeudasCliente(telefono){
    try{
        const tel = normalizePhone(telefono || currentClienteTelefono || '');
        if (!tel){ await showErrorToast('Teléfono inválido'); return false; }
        let del = supabase
            .from('Deudas')
            .delete()
            .eq('Telefono_cliente', tel);
        del = applyIdNegocioFilter(del);
        const { error } = await del;
        if (error){ await showErrorToast('No se pudieron eliminar las deudas: ' + error.message); return false; }
        return true;
    }catch(err){
        console.error('Eliminar todas deudas error', err);
        await showErrorToast('Error eliminando deudas');
        return false;
    }
}
window.cerrarSesion=function() {
    localStorage.clear();
    window.location.href = "/index.html";
}