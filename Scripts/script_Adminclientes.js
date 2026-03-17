import {showError,showErrorToast,showSuccess,showSuccessToast,showInfoHTML,showinfo, loadSweetAlert2} from './sweetalert2.js'
import {loadSupabase} from './supabase.js';
const Swal = await loadSweetAlert2();
const supabase = await loadSupabase();

// Estado para operaciones del cliente seleccionado
let currentClienteTelefono = null;
let currentClienteNombre = null;
let currentClienteOpView = 'deudas'; // 'deudas' | 'pagos'
let isExpandedCliente = false; // controla ver 4 vs todos

function setResponsiveDetailsOpen(open){
    if (window.innerWidth <= 1080) {
        document.body.classList.toggle('mobile-details-open', !!open);
    } else {
        document.body.classList.remove('mobile-details-open');
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

async function agregarCliente(){
        const html = `
        <div style="display:grid; gap:8px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;">
            <label class="muted" for="nombre">Nombre completo</label>
            <input class="swal2-input" type="text" id="nombre" name="nombre" placeholder="Ej: Juan Pérez" required style="width:100%; max-width:100%; box-sizing:border-box;">

            <label class="muted" for="telefono">Teléfono</label>
            <input class="swal2-input" type="tel" id="telefono" name="telefono" placeholder="264 400 9000" inputmode="tel" required style="width:100%; max-width:100%; box-sizing:border-box;">
        </div>`;

    const { value: formValues } = await Swal.fire({
        title: 'Registrar cliente',
        html: html,
        width: 'min(520px, 92vw)',
        showCancelButton: true,
        confirmButtonText: 'Registrar',
        cancelButtonText: 'Cancelar',
        focusConfirm: false,
        allowEnterKey: true,
        didOpen: () => {
            const input = Swal.getPopup().querySelector('#nombre');
            if (input) input.focus();
        },
        preConfirm: () => {
            const nombre = Swal.getPopup().querySelector('#nombre').value.trim();
            const telefonoRaw = Swal.getPopup().querySelector('#telefono').value.trim();
            const telefono = normalizePhone(telefonoRaw);
            if (!nombre) {
                Swal.showValidationMessage('Ingrese el nombre del cliente');
                return;
            }
            if (!telefono) {
                Swal.showValidationMessage('Ingrese el teléfono del cliente (solo números)');
                return;
            }
            return { nombre, telefono };
        }
    });
    if (formValues) {
        const idNegocio = getIdNegocioForWrite();
        if (idNegocio === undefined){
            await showErrorToast('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
            return;
        }
        const { data, error } = await supabase
            .from('Clientes')
            .insert([
                { Nombre: formValues.nombre, Telefono: formValues.telefono, ID_Negocio: idNegocio }
            ]);
        if (error) {
            await showErrorToast('Error al agregar el cliente: ' + error.message);
        } else {
            await showSuccessToast('Cliente agregado exitosamente');
            await verTodosClientes();
        }
    }
}
window.agregarCliente = agregarCliente;

async function verTodosClientes(){
    const {data, error} = await applyIdNegocioFilter(
        supabase
            .from('Clientes')
            .select('*')
    );
    if (error){
        showErrorToast('Error al obtener los clientes: ' + error.message);
        return;
    } else {
        renderClientesEnContenedor(data || []);
    }
}
window.verTodosClientes = verTodosClientes;
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
            <button class="botonBorrar" type="button">Borrar</button>
        </div>
    `;
    card.addEventListener('click', async () => {
        document.querySelectorAll('.client-item[aria-selected="true"]').forEach((el) => el.removeAttribute('aria-selected'));
        card.setAttribute('aria-selected', 'true');
        setResponsiveDetailsOpen(true);

        document.getElementById('nombreCliente').innerHTML = `Nombre: <br>${nombre}`;
        document.getElementById('telefonoCliente').innerHTML = `Teléfono: <br>${telefono}`;

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

        // Preparar tabs y botones para el panel del cliente
        prepararTabsOperacionesCliente();
        // Render inicial (deudas)
        await mostrarOperacionesCliente('deudas');
    });

    // Borrar cliente (evitar que dispare el click del card)
    const btnBorrar = card.querySelector('.botonBorrar');
    if (btnBorrar){
        btnBorrar.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            await borrarCliente(telefono, nombre, card);
        });
    }

    contenedor.appendChild(card);
}
async function borrarCliente(telefono, nombre, cardEl){
    const tel = normalizePhone(telefono);
    const result = await Swal.fire({
        title: 'Borrar cliente',
        text: `¿Estás seguro de que deseas borrar al cliente ${escapeHtml(nombre)}?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Borrar',
        cancelButtonText: 'Cancelar'
    });
    if (!result.isConfirmed) return;

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
    showSuccessToast('Cliente borrado correctamente');
    cerrarListaClientes();
    cerrarDetallesCliente();
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
        const tabla = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
        let q = supabase
            .from(tabla)
            .select('*')
            .eq('Telefono_cliente', currentClienteTelefono);
        q = applyIdNegocioFilter(q);
        const { data, error } = await q.order('Creado', { ascending: false });
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
    const lines = [];
    const montoRaw = item.Monto ?? item.monto ?? item.Amount ?? item.amount ?? '';
    const creadoRaw = item.Creado ?? item.creado ?? item.fecha ?? item.created_at ?? '';
    lines.push(`<strong>Monto:</strong> ${escapeHtml(String(montoRaw))}`);
    lines.push(`<strong>Fecha:</strong> ${escapeHtml(formatDate(creadoRaw))}`);

    const ignored = new Set([
        'Monto','monto','Amount','amount',
        'Creado','creado','fecha','created_at',
        'Telefono_cliente','Cliente','cliente','client'
    ]);
    Object.keys(item).forEach(k => {
        if (ignored.has(k)) return;
        const v = item[k];
        let display;
        if (v === null || v === undefined) display = '';
        else if (typeof v === 'object') { try { display = JSON.stringify(v); } catch { display = String(v); } }
        else display = String(v);
        lines.push(`<strong>${escapeHtml(String(k))}:</strong> ${escapeHtml(display)}`);
    });

    const html = lines.join('<br>');
    try{ await showInfoHTML(html); } 
    catch(e){ alert(html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')); }
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
                        <button id="modal_btn_refrescar" class="btn sm">Refrescar</button>
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
        const { value: nuevoStr } = await Swal.fire({
            title: 'Editar Deuda Activa',
            input: 'text',
            inputLabel: 'Nuevo monto (ARS)',
            inputValue: valorActual.toFixed(2),
            showCancelButton: true,
            confirmButtonText: 'Guardar',
            cancelButtonText: 'Cancelar',
            inputAttributes: { 'aria-label': 'Nuevo monto de deuda activa' },
            preConfirm: (val) => {
                if (val === null || val === undefined || val.trim() === '') {
                    return 'Ingresa un monto';
                }
                // Normalizar: reemplazar coma por punto y quitar símbolos
                const normalizado = val.replace(/[^0-9,\.]/g,'').replace(',', '.');
                const num = parseFloat(normalizado);
                if (isNaN(num) || num < 0) {
                    return 'Monto inválido';
                }
                if (num > 1_000_000_000) {
                    return 'Monto demasiado grande';
                }
                return normalizado; // devolver valor normalizado
            }
        });
        if (nuevoStr === undefined) return; // cancelado
        const nuevo = parseFloat(nuevoStr);
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
                        const confirm = await Swal.fire({
                            title: 'Eliminar deuda',
                            text: `¿Eliminar la deuda de ${formatterLocal.format(monto)} del ${fecha}?`,
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonText: 'Eliminar',
                            cancelButtonText: 'Cancelar'
                        });
                        if (!confirm.isConfirmed) return;
                        const ok = await eliminarDeudaIndiv(item, telefono);
                        if (ok){
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
        const confirm = await Swal.fire({
            title: 'Eliminar todas las deudas',
            text: '¿Eliminar TODAS las deudas de este cliente? Esta acción no se puede deshacer.',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Eliminar todas',
            cancelButtonText: 'Cancelar'
        });
        if (!confirm.isConfirmed) return;
        const ok = await eliminarDeudasCliente(telefono);
        if (ok){
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
    setResponsiveDetailsOpen(false);
    const cont = document.getElementById('lista_operaciones_cliente');
    if (cont) cont.innerHTML = 'Selecciona un cliente para ver sus operaciones.';
    const nombre = document.getElementById('nombreCliente');
    const telefono = document.getElementById('telefonoCliente');
    const totalPagado = document.getElementById('montototalPagado');
    const totalAdeudado = document.getElementById('montototalAdeudado');
    if (nombre) nombre.innerHTML = 'Nombre: <br>Cargando...';
    if (telefono) telefono.innerHTML = 'Teléfono: <br>Cargando...';
    if (totalPagado) totalPagado.textContent = '0.00';
    if (totalAdeudado) totalAdeudado.textContent = '0.00';
    document.querySelectorAll('.client-item[aria-selected="true"]').forEach((el) => el.removeAttribute('aria-selected'));
    currentClienteTelefono = null;
    currentClienteNombre = null;
}
window.cerrarDetallesCliente = cerrarDetallesCliente;

window.addEventListener('resize', () => {
    if (window.innerWidth > 1080) {
        document.body.classList.remove('mobile-details-open');
    }
});

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