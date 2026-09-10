import { loadSupabase, loadSupaBseWithAuth } from './supabase.js';
import { showSuccessToast, showErrorToast, loadSweetAlert2 } from './sweetalert2.js';
import { showAppLoader, hideAppLoader } from './loader_renovado.js';

// --- Multi-Tenant Helpers ---
function getLocalUserId() {
    const raw = localStorage.getItem('UserID');
    if (raw === undefined || raw === null) return null;
    const v = String(raw).trim();
    return v ? v : null;
}

function getIdNegocioForWrite() {
    const userId = getLocalUserId();
    if (userId === null) return undefined;
    if (userId === 'N/A') return null;
    return userId;
}

function applyIdNegocioFilter(query) {
    const userId = getLocalUserId();
    if (userId === 'N/A') return query.is('ID_Negocio', null);
    if (!userId) return query;
    return query.eq('ID_Negocio', userId);
}

// Formateador de moneda en pesos argentinos
const formatCurrency = (amount) => {
    const val = Number(amount) || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    }).format(val).replace('ARS', '$').trim();
};

const formatDate = (isoString) => {
    if (!isoString) return '';
    try {
        const d = new Date(isoString);
        return d.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (_) {
        return '';
    }
};

function normalizePhone(raw) {
    if (!raw) return '';
    return String(raw).replace(/\D+/g, '');
}

// --- Estado Global del Directorio de Clientes ---
const state = {
    allClients: [],
    currentFilter: 'all', // 'all' | 'withDebt' | 'withoutDebt'
    searchTerm: '',
    selectedClient: null,
    clientDeudas: [],
    clientPagos: [],
    currentOpTab: 'deudas'
};

export async function initClientes() {
    showAppLoader('Cargando directorio de clientes...');
    try {
        initHeaderProfile();
        initSearchAndFilters();
        initModals();
        await cargarClientes();
    } catch (err) {
        console.error('Error inicializando clientes:', err);
    } finally {
        hideAppLoader();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initClientes());
} else if (!window.__SPA_ROUTER_ACTIVE__) {
    initClientes();
}

// ==========================================================================
// 1. HEADER PERFIL DE USUARIO
// ==========================================================================
async function initHeaderProfile() {
    const pfpImg = document.getElementById('pfp');
    const fallback = document.getElementById('header_avatar_fallback');
    const initialsSpan = document.getElementById('header_avatar_initials');
    const nameSpan = document.getElementById('user_display_name');

    let localPhoto = (localStorage.getItem('UserPhoto') || '').toString().trim();
    let localName = (localStorage.getItem('UserName') || '').toString().trim();

    if (!localPhoto || !localName) {
        try {
            const clientAuth = await loadSupaBseWithAuth();
            const { data: { session } } = await clientAuth.auth.getSession();
            if (session?.user) {
                const meta = session.user.user_metadata || {};
                const identity0 = Array.isArray(session.user.identities)
                    ? session.user.identities[0]?.identity_data
                    : null;

                if (!localName) {
                    localName = (meta.full_name || meta.name || meta.user_name || meta.username || session.user.email || '').toString().trim();
                    if (localName) localStorage.setItem('UserName', localName);
                }

                if (!localPhoto) {
                    localPhoto = (meta.avatar_url || meta.picture || identity0?.avatar_url || identity0?.picture || '').toString().trim();
                    if (localPhoto) localStorage.setItem('UserPhoto', localPhoto);
                }
            }
        } catch (e) {
            console.warn('No se pudo obtener la sesión auth para el perfil:', e);
        }
    }

    if (nameSpan) nameSpan.textContent = localName || 'Mi Negocio';

    const initial = (localName || 'D').trim().charAt(0).toUpperCase();
    if (initialsSpan) initialsSpan.textContent = initial;

    if (localPhoto && localPhoto.trim() && pfpImg) {
        let photoUrl = localPhoto.trim();
        if (photoUrl.includes('googleusercontent.com')) {
            photoUrl = photoUrl.replace(/=s\d+-c$/, '=s128-c').replace(/=s\d+$/, '=s128');
        }
        pfpImg.onload = () => {
            pfpImg.style.display = 'block';
            if (fallback) fallback.style.display = 'none';
        };
        pfpImg.onerror = () => {
            pfpImg.style.display = 'none';
            if (fallback) fallback.style.display = 'flex';
        };
        pfpImg.src = photoUrl;
        pfpImg.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
    } else {
        if (pfpImg) {
            pfpImg.removeAttribute('src');
            pfpImg.style.display = 'none';
        }
        if (fallback) fallback.style.display = 'flex';
    }
}

// ==========================================================================
// 2. CARGA DE CLIENTES Y MÉTRICAS DE CARTERA
// ==========================================================================
async function cargarClientes() {
    const container = document.getElementById('client_list_container');
    if (container && state.allClients.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                <div class="loader-spinner" style="margin: 0 auto 12px; width: 28px; height: 28px;"></div>
                <p style="font-size: 0.88rem;">Cargando directorio de clientes...</p>
            </div>
        `;
    }

    try {
        const client = await loadSupabase();
        let q = client.from('Clientes').select('*').order('Nombre');
        q = applyIdNegocioFilter(q);
        const { data, error } = await q;

        if (error) {
            console.error('Error al cargar clientes:', error);
            await showErrorToast('No se pudieron obtener los clientes');
            state.allClients = [];
        } else {
            state.allClients = data || [];
        }

        actualizarMetricasCartera();
        renderClientes();

    } catch (err) {
        console.error('Error en cargarClientes:', err);
        state.allClients = [];
        actualizarMetricasCartera();
        renderClientes();
    }
}

function actualizarMetricasCartera() {
    const totalClientsEl = document.getElementById('metric_total_clients');
    const withDebtEl = document.getElementById('metric_with_debt');
    const settledEl = document.getElementById('metric_settled');
    const totalDebtAmountEl = document.getElementById('metric_total_debt_amount');

    const total = state.allClients.length;
    const conDeuda = state.allClients.filter(c => (Number(c.Deuda_Activa) || 0) > 0);
    const alDia = state.allClients.filter(c => (Number(c.Deuda_Activa) || 0) <= 0);
    const totalAdeudado = conDeuda.reduce((acc, c) => acc + (Number(c.Deuda_Activa) || 0), 0);

    if (totalClientsEl) totalClientsEl.textContent = total;
    if (withDebtEl) withDebtEl.textContent = conDeuda.length;
    if (settledEl) settledEl.textContent = alDia.length;
    if (totalDebtAmountEl) totalDebtAmountEl.textContent = formatCurrency(totalAdeudado);
}

// ==========================================================================
// 3. BÚSQUEDA Y FILTRADO DE CLIENTES
// ==========================================================================
function initSearchAndFilters() {
    const searchInput = document.getElementById('client_search_input');
    const filterPills = document.querySelectorAll('.timeframe-pill');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            state.searchTerm = searchInput.value.trim().toLowerCase();
            renderClientes();
        });
    }

    filterPills.forEach(pill => {
        pill.addEventListener('click', () => {
            filterPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            state.currentFilter = pill.dataset.filter || 'all';
            renderClientes();
        });
    });

    // Botón Agregar Cliente
    const btnAdd = document.getElementById('btn_open_add_client');
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            abrirModalNuevoCliente();
        });
    }
}

function renderClientes() {
    const container = document.getElementById('client_list_container');
    if (!container) return;

    let filtered = state.allClients;

    // Filtro por tab (todos, con deuda, al día)
    if (state.currentFilter === 'withDebt') {
        filtered = filtered.filter(c => (Number(c.Deuda_Activa) || 0) > 0);
    } else if (state.currentFilter === 'withoutDebt') {
        filtered = filtered.filter(c => (Number(c.Deuda_Activa) || 0) <= 0);
    }

    // Filtro por término de búsqueda
    if (state.searchTerm) {
        filtered = filtered.filter(c => {
            const n = (c.Nombre || '').toLowerCase();
            const t = (c.Telefono || '').toLowerCase();
            return n.includes(state.searchTerm) || t.includes(state.searchTerm);
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 48px 20px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-subtle);">
                <div style="font-size: 2.2rem; margin-bottom: 8px;">👤</div>
                <h3 style="font-size: 1rem; color: var(--text-primary); margin-bottom: 4px;">Sin clientes para mostrar</h3>
                <p style="font-size: 0.8rem; margin-bottom: 16px;">${state.searchTerm ? `No hay resultados para "${escapeHtml(state.searchTerm)}"` : 'Agrega tu primer cliente al directorio comercial.'}</p>
                <button type="button" class="btn-volt-action" style="max-width: 200px; margin: 0 auto; padding: 10px 16px; font-size: 0.85rem;" onclick="window.abrirModalNuevoCliente()">
                    + Nuevo Cliente
                </button>
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    filtered.forEach(c => {
        const item = document.createElement('div');
        item.className = 'tx-item';
        item.style.cursor = 'pointer';

        const initial = (c.Nombre || c.Telefono || 'C').trim()[0].toUpperCase();
        const debt = Number(c.Deuda_Activa) || 0;
        const hasDebt = debt > 0;

        item.innerHTML = `
            <div class="tx-icon-wrap" style="border-color: ${hasDebt ? 'rgba(255, 77, 79, 0.3)' : 'rgba(204, 255, 0, 0.3)'}; color: ${hasDebt ? '#ff6b6d' : 'var(--brand-volt)'};">
                ${initial}
            </div>
            <div class="tx-info">
                <div class="tx-name">${escapeHtml(c.Nombre || 'Sin nombre')}</div>
                <div class="tx-sub">${escapeHtml(c.Telefono || 'Sin teléfono')}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
                <span class="client-debt-badge ${hasDebt ? 'has-debt' : 'settled'}">
                    ${hasDebt ? `- ${formatCurrency(debt)}` : '✓ Al día'}
                </span>
            </div>
        `;

        item.addEventListener('click', () => {
            abrirDetalleCliente(c);
        });

        container.appendChild(item);
    });
}

// ==========================================================================
// 4. MODAL / DETALLE DEL CLIENTE
// ==========================================================================
async function abrirDetalleCliente(cliente) {
    state.selectedClient = cliente;
    const modal = document.getElementById('modal_detalle_cliente');
    if (!modal) return;

    // Poblar información básica
    const initial = (cliente.Nombre || cliente.Telefono || 'C').trim()[0].toUpperCase();
    const avatarEl = document.getElementById('detail_client_avatar');
    const nameEl = document.getElementById('detail_client_name');
    const telEl = document.getElementById('detail_client_tel');
    const debtEl = document.getElementById('detail_client_debt');
    const totalPaidEl = document.getElementById('detail_client_total_paid');
    const opLinkEl = document.getElementById('detail_btn_new_op');

    if (avatarEl) avatarEl.textContent = initial;
    if (nameEl) nameEl.textContent = cliente.Nombre || 'Sin nombre';
    if (telEl) telEl.textContent = cliente.Telefono || 'Sin teléfono';
    
    const debt = Number(cliente.Deuda_Activa) || 0;
    if (debtEl) debtEl.textContent = formatCurrency(debt);
    if (totalPaidEl) totalPaidEl.textContent = 'Calculando...';

    // Link a Operacion_renov con teléfono preseleccionado
    if (opLinkEl) {
        opLinkEl.href = `/Plantillas_Renovadas/Operacion_renov.html?tipo=${debt > 0 ? 'pago' : 'deuda'}`;
    }

    // Abrir modal
    modal.classList.add('active');

    // Cargar historial de operaciones del cliente
    await cargarOperacionesCliente(cliente);
}

function cerrarDetalleCliente() {
    const modal = document.getElementById('modal_detalle_cliente');
    if (modal) modal.classList.remove('active');
}

async function cargarOperacionesCliente(cliente) {
    const listEl = document.getElementById('client_ops_list');
    const totalPaidEl = document.getElementById('detail_client_total_paid');

    if (listEl) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--text-muted);">
                <div class="loader-spinner" style="width: 22px; height: 22px; margin: 0 auto 8px;"></div>
                <span>Cargando movimientos...</span>
            </div>
        `;
    }

    try {
        const client = await loadSupabase();
        const phone = cliente.Telefono;

        let qDeudas = client.from('Deudas').select('*').order('Creado', { ascending: false });
        let qPagos = client.from('Pagos').select('*').order('Creado', { ascending: false });

        if (phone) {
            qDeudas = qDeudas.eq('Telefono_cliente', phone);
            qPagos = qPagos.eq('Telefono_cliente', phone);
        } else if (cliente.id_clie) {
            qDeudas = qDeudas.eq('ID_cliente', cliente.id_clie);
            qPagos = qPagos.eq('ID_cliente', cliente.id_clie);
        }

        qDeudas = applyIdNegocioFilter(qDeudas);
        qPagos = applyIdNegocioFilter(qPagos);

        const [resDeudas, resPagos] = await Promise.all([qDeudas, qPagos]);

        state.clientDeudas = resDeudas.data || [];
        state.clientPagos = resPagos.data || [];

        // Calcular total pagado histórico
        const totalPagado = state.clientPagos.reduce((acc, p) => acc + (Number(p.Monto) || 0), 0);
        if (totalPaidEl) totalPaidEl.textContent = formatCurrency(totalPagado);

        renderOperacionesClienteTab(state.currentOpTab);

    } catch (err) {
        console.error('Error al cargar operaciones del cliente:', err);
        if (listEl) listEl.innerHTML = '<div style="text-align: center; padding: 14px; color: var(--text-muted);">No se pudieron cargar los movimientos</div>';
        if (totalPaidEl) totalPaidEl.textContent = '$0,00';
    }
}

function renderOperacionesClienteTab(tab) {
    state.currentOpTab = tab;
    const listEl = document.getElementById('client_ops_list');
    const tabDeudas = document.getElementById('tab_ops_deudas');
    const tabPagos = document.getElementById('tab_ops_pagos');

    if (tabDeudas && tabPagos) {
        tabDeudas.classList.toggle('active', tab === 'deudas');
        tabPagos.classList.toggle('active', tab === 'pagos');
    }

    if (!listEl) return;

    const items = tab === 'deudas' ? state.clientDeudas : state.clientPagos;

    if (!items || items.length === 0) {
        listEl.innerHTML = `
            <div style="text-align: center; padding: 24px 10px; color: var(--text-muted); font-size: 0.82rem;">
                No hay registros de ${tab === 'deudas' ? 'deudas' : 'pagos'} para este cliente.
            </div>
        `;
        return;
    }

    listEl.innerHTML = '';
    items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'client-op-row';

        const monto = Number(item.Monto) || 0;
        const fecha = formatDate(item.Creado || item.created_at);
        const cat = item.Categoria || (tab === 'deudas' ? 'Deuda' : 'Pago');

        row.innerHTML = `
            <div>
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary);">${escapeHtml(cat)}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${fecha}</div>
            </div>
            <div style="font-size: 0.95rem; font-weight: 700; font-family: var(--font-mono); color: ${tab === 'deudas' ? '#ff6b6d' : 'var(--brand-volt)'};">
                ${tab === 'deudas' ? '- ' : '+ '}${formatCurrency(monto)}
            </div>
        `;

        listEl.appendChild(row);
    });
}

// ==========================================================================
// 5. AGREGAR NUEVO CLIENTE
// ==========================================================================
function abrirModalNuevoCliente() {
    const modal = document.getElementById('modal_nuevo_cliente');
    const form = document.getElementById('form_nuevo_cliente');
    if (form) form.reset();
    if (modal) modal.classList.add('active');
    setTimeout(() => {
        const inp = document.getElementById('add_client_nombre');
        if (inp) inp.focus();
    }, 150);
}

function cerrarModalNuevoCliente() {
    const modal = document.getElementById('modal_nuevo_cliente');
    if (modal) modal.classList.remove('active');
}

async function guardarNuevoCliente(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const btn = document.getElementById('btn_submit_add_client');
    const nombreInput = document.getElementById('add_client_nombre');
    const telInput = document.getElementById('add_client_tel');
    const deudaInput = document.getElementById('add_client_deuda');

    const nombre = (nombreInput ? nombreInput.value : '').trim();
    const telefono = normalizePhone(telInput ? telInput.value : '');
    const deudaInicial = parseFloat(deudaInput ? deudaInput.value : '0') || 0;

    if (!nombre) {
        await showErrorToast('Ingresa el nombre del cliente');
        if (nombreInput) nombreInput.focus();
        return;
    }

    if (!telefono) {
        await showErrorToast('Ingresa el teléfono del cliente');
        if (telInput) telInput.focus();
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const client = await loadSupabase();
        const idNegocio = getIdNegocioForWrite();

        if (idNegocio === undefined) {
            await showErrorToast('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
            return;
        }

        // 1. Insertar cliente
        const payload = {
            Nombre: nombre,
            Telefono: telefono,
            Deuda_Activa: deudaInicial,
            ID_Negocio: idNegocio
        };

        const { data, error } = await client.from('Clientes').insert(payload).select().single();

        if (error) {
            console.error('Error insertando cliente:', error);
            await showErrorToast('Error al agregar: ' + (error.message || error));
            return;
        }

        // 2. Si tenía deuda inicial > 0, registrarla en Deudas
        if (deudaInicial > 0) {
            await client.from('Deudas').insert({
                Monto: deudaInicial,
                Categoria: 'Saldo inicial',
                Telefono_cliente: telefono,
                ID_Negocio: idNegocio
            });
        }

        await showSuccessToast('Cliente agregado con éxito');
        cerrarModalNuevoCliente();
        await cargarClientes();

    } catch (err) {
        console.error('Error general al agregar cliente:', err);
        await showErrorToast('Ocurrió un error al agregar el cliente');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ==========================================================================
// 6. EDITAR CLIENTE
// ==========================================================================
function abrirModalEditarCliente() {
    if (!state.selectedClient) return;
    const modal = document.getElementById('modal_editar_cliente');
    const nombreInput = document.getElementById('edit_client_nombre');
    const telInput = document.getElementById('edit_client_tel');
    const deudaInput = document.getElementById('edit_client_deuda');

    if (nombreInput) nombreInput.value = state.selectedClient.Nombre || '';
    if (telInput) telInput.value = state.selectedClient.Telefono || '';
    if (deudaInput) deudaInput.value = Number(state.selectedClient.Deuda_Activa) || 0;

    if (modal) modal.classList.add('active');
}

function cerrarModalEditarCliente() {
    const modal = document.getElementById('modal_editar_cliente');
    if (modal) modal.classList.remove('active');
}

async function guardarEdicionCliente(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (!state.selectedClient) return;

    const btn = document.getElementById('btn_submit_edit_client');
    const nombreInput = document.getElementById('edit_client_nombre');
    const telInput = document.getElementById('edit_client_tel');
    const deudaInput = document.getElementById('edit_client_deuda');

    const newNombre = (nombreInput ? nombreInput.value : '').trim();
    const newTelefono = normalizePhone(telInput ? telInput.value : '');
    const newDeuda = parseFloat(deudaInput ? deudaInput.value : '0') || 0;

    if (!newNombre) {
        await showErrorToast('Ingresa el nombre del cliente');
        return;
    }

    if (btn) btn.disabled = true;

    try {
        const client = await loadSupabase();
        let query = client
            .from('Clientes')
            .update({
                Nombre: newNombre,
                Telefono: newTelefono,
                Deuda_Activa: newDeuda
            });

        if (state.selectedClient.id_clie) {
            query = query.eq('id_clie', state.selectedClient.id_clie);
        } else {
            query = query.eq('Telefono', state.selectedClient.Telefono);
        }

        query = applyIdNegocioFilter(query);
        const { error } = await query;

        if (error) {
            console.error('Error editando cliente:', error);
            await showErrorToast('No se pudo actualizar el cliente');
            return;
        }

        // Actualizar estado local
        state.selectedClient.Nombre = newNombre;
        state.selectedClient.Telefono = newTelefono;
        state.selectedClient.Deuda_Activa = newDeuda;

        // Actualizar vista de detalle
        const nameEl = document.getElementById('detail_client_name');
        const telEl = document.getElementById('detail_client_tel');
        const debtEl = document.getElementById('detail_client_debt');
        if (nameEl) nameEl.textContent = newNombre;
        if (telEl) telEl.textContent = newTelefono;
        if (debtEl) debtEl.textContent = formatCurrency(newDeuda);

        await showSuccessToast('Cliente actualizado correctamente');
        cerrarModalEditarCliente();
        await cargarClientes();

    } catch (err) {
        console.error('Error general al editar cliente:', err);
        await showErrorToast('Ocurrió un error al editar');
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ==========================================================================
// 7. ELIMINAR CLIENTE
// ==========================================================================
async function confirmarEliminarCliente() {
    if (!state.selectedClient) return;
    const Swal = await loadSweetAlert2();

    const result = await Swal.fire({
        title: '¿Eliminar cliente?',
        text: `¿Estás seguro de eliminar a ${state.selectedClient.Nombre}? Esta acción no se puede deshacer.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff4d4f',
        cancelButtonColor: '#252b38',
        background: '#141820',
        color: '#ffffff'
    });

    if (result.isConfirmed) {
        try {
            const client = await loadSupabase();
            let query = client.from('Clientes').delete();
            if (state.selectedClient.id_clie) {
                query = query.eq('id_clie', state.selectedClient.id_clie);
            } else {
                query = query.eq('Telefono', state.selectedClient.Telefono);
            }
            query = applyIdNegocioFilter(query);

            const { error } = await query;
            if (error) {
                await showErrorToast('No se pudo eliminar el cliente: ' + error.message);
                return;
            }

            await showSuccessToast('Cliente eliminado');
            cerrarDetalleCliente();
            await cargarClientes();

        } catch (err) {
            console.error('Error al eliminar cliente:', err);
            await showErrorToast('Error al eliminar cliente');
        }
    }
}

// ==========================================================================
// 8. MODAL Y ENVÍO DE MENSAJE WHATSAPP
// ==========================================================================
function abrirModalWhatsApp() {
    if (!state.selectedClient) return;
    const modal = document.getElementById('modal_whatsapp');
    if (modal) modal.classList.add('active');
}

function cerrarModalWhatsApp() {
    const modal = document.getElementById('modal_whatsapp');
    if (modal) modal.classList.remove('active');
}

function enviarWhatsAppDirecto() {
    if (!state.selectedClient) return;

    const tipo = document.querySelector('.wa-choice-pill.active[data-wa-type]')?.dataset.waType || 'resumen';
    const debt = Number(state.selectedClient.Deuda_Activa) || 0;
    const nombre = state.selectedClient.Nombre || 'Cliente';
    const tel = normalizePhone(state.selectedClient.Telefono);

    if (!tel) {
        showErrorToast('El cliente no tiene un teléfono válido registrado.');
        return;
    }

    let mensaje = `Hola ${nombre}, te compartimos el resumen de tu cuenta en DebiTú.\n\n`;

    if (tipo === 'resumen') {
        mensaje += `📋 *Estado de Cuenta Actual*\n`;
        mensaje += debt > 0 
            ? `Saldo adeudado: *${formatCurrency(debt)}*\n\nPor favor contáctanos para coordinar el abono.` 
            : `Tu cuenta se encuentra actualmente *Al día* ($0.00). ¡Muchas gracias!`;
    } else if (tipo === 'deudas') {
        mensaje += `📋 *Detalle de Cargos Recientes*\n`;
        if (state.clientDeudas.length === 0) {
            mensaje += `No tienes deudas registradas.\n`;
        } else {
            state.clientDeudas.slice(0, 8).forEach(d => {
                mensaje += `• ${formatDate(d.Creado)}: ${formatCurrency(d.Monto)} (${d.Categoria || 'Deuda'})\n`;
            });
            mensaje += `\nTotal saldo adeudado: *${formatCurrency(debt)}*`;
        }
    } else if (tipo === 'pagos') {
        mensaje += `📋 *Comprobantes de Pagos Recibidos*\n`;
        if (state.clientPagos.length === 0) {
            mensaje += `No tienes pagos registrados recientemente.\n`;
        } else {
            state.clientPagos.slice(0, 8).forEach(p => {
                mensaje += `• ${formatDate(p.Creado)}: ${formatCurrency(p.Monto)} (${p.Categoria || 'Abono'})\n`;
            });
        }
    }

    mensaje += `\n\nGracias por tu confianza.`;

    const url = `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank');
    cerrarModalWhatsApp();
}

// ==========================================================================
// 9. INICIALIZACIÓN DE MODALES Y EVENTOS
// ==========================================================================
function initModals() {
    // Cerrar modales con botones de cerrar o backdrop
    document.querySelectorAll('.neo-modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    document.querySelectorAll('.modal-close-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const overlay = btn.closest('.neo-modal-overlay');
            if (overlay) overlay.classList.remove('active');
        });
    });

    // Detalle Cliente - Tabs Deudas / Pagos
    const tabDeudas = document.getElementById('tab_ops_deudas');
    const tabPagos = document.getElementById('tab_ops_pagos');
    if (tabDeudas) tabDeudas.addEventListener('click', () => renderOperacionesClienteTab('deudas'));
    if (tabPagos) tabPagos.addEventListener('click', () => renderOperacionesClienteTab('pagos'));

    // Detalle Cliente - Botones de Acción
    const btnWa = document.getElementById('detail_btn_whatsapp');
    const btnEdit = document.getElementById('detail_btn_edit');
    const btnDelete = document.getElementById('detail_btn_delete');
    if (btnWa) btnWa.addEventListener('click', abrirModalWhatsApp);
    if (btnEdit) btnEdit.addEventListener('click', abrirModalEditarCliente);
    if (btnDelete) btnDelete.addEventListener('click', confirmarEliminarCliente);

    // Formularios
    const formAdd = document.getElementById('form_nuevo_cliente');
    if (formAdd) formAdd.addEventListener('submit', guardarNuevoCliente);

    const formEdit = document.getElementById('form_editar_cliente');
    if (formEdit) formEdit.addEventListener('submit', guardarEdicionCliente);

    // WhatsApp pills selector
    const waPills = document.querySelectorAll('.wa-choice-pill[data-wa-type]');
    waPills.forEach(pill => {
        pill.addEventListener('click', () => {
            waPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
        });
    });

    const btnSendWa = document.getElementById('btn_send_wa_action');
    if (btnSendWa) btnSendWa.addEventListener('click', enviarWhatsAppDirecto);
}

// Exponer globalmente para bindings de HTML inline si se requiere
window.abrirModalNuevoCliente = abrirModalNuevoCliente;
window.cerrarModalNuevoCliente = cerrarModalNuevoCliente;
window.abrirDetalleCliente = abrirDetalleCliente;
window.cerrarDetalleCliente = cerrarDetalleCliente;
window.abrirModalEditarCliente = abrirModalEditarCliente;
window.cerrarModalEditarCliente = cerrarModalEditarCliente;
window.abrirModalWhatsApp = abrirModalWhatsApp;
window.cerrarModalWhatsApp = cerrarModalWhatsApp;

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
