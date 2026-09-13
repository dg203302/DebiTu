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
    currentOpTab: 'deudas',
    selectedOpItem: null,
    selectedOpTipo: null,
    clientStatsCharts: []
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
        const isDesktop = window.location.pathname.includes('_desktop') || (typeof window !== 'undefined' && window.innerWidth >= 1024);
        const basePath = isDesktop 
            ? '/Plantillas_Renovadas_Desktop/Operacion_renov_desktop.html' 
            : '/Plantillas_Renovadas/Operacion_renov.html';
        opLinkEl.href = `${basePath}?tipo=${debt > 0 ? 'pago' : 'deuda'}`;
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

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeFechaOperacion(item) {
    const raw = item?.Creado ?? item?.creado ?? item?.fecha ?? item?.created_at ?? null;
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
}

function computePaymentIndicators({ pagos, deudas, deudaActiva }) {
    const totalPagado = (pagos || []).reduce((acc, item) => acc + (Number(item?.Monto ?? item?.monto ?? 0) || 0), 0);
    const totalDeudaRegistrada = (deudas || []).reduce((acc, item) => acc + (Number(item?.Monto ?? item?.monto ?? 0) || 0), 0);
    const cobertura = totalDeudaRegistrada > 0 ? clamp(totalPagado / totalDeudaRegistrada, 0, 1.4) : (totalPagado > 0 ? 1 : 0);

    const ultimoPago = (pagos || [])
        .map(item => normalizeFechaOperacion(item))
        .filter(Boolean)
        .sort((a, b) => b - a)[0] || null;

    const diasSinPagar = ultimoPago ? Math.round((Date.now() - ultimoPago.getTime()) / 86400000) : (deudas.length > 0 ? 90 : 0);
    const recencia = clamp(1 - (diasSinPagar / 180), 0, 1);
    const deudaPresion = totalDeudaRegistrada > 0 ? clamp((Number(deudaActiva) || 0) / totalDeudaRegistrada, 0, 1.2) : 0;

    const rawScore = 300 + (cobertura * 320) + (recencia * 200) + ((1 - deudaPresion) * 120);
    const score = Math.round(clamp(rawScore, 300, 850));
    const probabilidad = Math.round(clamp(((score - 300) / 550) * 100, 0, 99));

    let tone = 'low';
    let label = 'Riesgo Alto';
    if (score >= 685 || probabilidad >= 70) {
        tone = 'high';
        label = 'Perfil Estable';
    } else if (score >= 548 || probabilidad >= 45) {
        tone = 'mid';
        label = 'Riesgo Medio';
    }

    return {
        score,
        probabilidad,
        tone,
        label,
        totalPagado,
        totalDeudaRegistrada,
        diasSinPagar,
        ultimoPago,
        coberturaPorcentaje: Math.round(cobertura * 100)
    };
}

function actualizarEstadoCrediticioUI(ind) {
    const scoreEl = document.getElementById('detail_client_score');
    const badgeEl = document.getElementById('detail_client_badge');
    const probEl = document.getElementById('detail_client_prob');
    const probBarEl = document.getElementById('detail_client_prob_bar');
    const recenciaEl = document.getElementById('detail_client_recencia');
    const coberturaEl = document.getElementById('detail_client_cobertura');

    if (scoreEl) scoreEl.textContent = `${ind.score} / 850`;
    if (badgeEl) {
        badgeEl.textContent = ind.label;
        badgeEl.dataset.tone = ind.tone;
    }
    if (probEl) {
        probEl.textContent = `${ind.probabilidad}%`;
        probEl.style.color = ind.tone === 'high' ? 'var(--brand-volt)' : (ind.tone === 'mid' ? '#fbbf24' : '#ff6b6d');
    }
    if (probBarEl) {
        probBarEl.style.width = `${ind.probabilidad}%`;
        probBarEl.style.background = ind.tone === 'high' ? 'var(--brand-volt)' : (ind.tone === 'mid' ? '#fbbf24' : '#ff6b6d');
    }
    if (recenciaEl) {
        recenciaEl.textContent = ind.ultimoPago
            ? `Último abono: hace ${ind.diasSinPagar === 0 ? 'hoy' : `${ind.diasSinPagar} d`}`
            : (state.clientDeudas.length > 0 ? 'Sin abonos registrados' : 'Sin deuda pendiente');
    }
    if (coberturaEl) {
        coberturaEl.textContent = `Cobrado: ${ind.coberturaPorcentaje}%`;
    }
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

        // Calcular e inyectar Indicadores Crediticios
        const indicators = computePaymentIndicators({
            pagos: state.clientPagos,
            deudas: state.clientDeudas,
            deudaActiva: cliente.Deuda_Activa
        });
        actualizarEstadoCrediticioUI(indicators);

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
        const cat = item.Categoria || item.categoria || (tab === 'deudas' ? 'Deuda' : 'Pago');

        row.innerHTML = `
            <div style="flex: 1; min-width: 0;">
                <div style="font-size: 0.88rem; font-weight: 600; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(cat)}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 2px;">${fecha}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 10px; flex: none;">
                <div style="font-size: 0.95rem; font-weight: 700; font-family: var(--font-mono); color: ${tab === 'deudas' ? '#ff6b6d' : 'var(--brand-volt)'};">
                    ${tab === 'deudas' ? '- ' : '+ '}${formatCurrency(monto)}
                </div>
                <button type="button" class="op-delete-btn" title="Eliminar este registro" aria-label="Eliminar registro">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;

        // Clic en la fila -> abre modal con detalle de la operación
        row.addEventListener('click', (e) => {
            if (e.target.closest('.op-delete-btn')) return;
            abrirDetalleOperacionIndiv(item, tab);
        });

        // Clic en el botón eliminar de la fila -> confirmación directa
        const delBtn = row.querySelector('.op-delete-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmarYEliminarOperacion(item, tab);
            });
        }

        listEl.appendChild(row);
    });
}

// ==========================================================================
// DETALLE DE OPERACIÓN INDIVIDUAL Y ELIMINACIÓN
// ==========================================================================
function abrirDetalleOperacionIndiv(item, tipo) {
    state.selectedOpItem = item;
    state.selectedOpTipo = tipo;
    const modal = document.getElementById('modal_detalle_op_indiv');
    const titleEl = document.getElementById('op_detail_title');
    const contentEl = document.getElementById('op_detail_content');
    if (!modal || !contentEl) return;

    const esDeuda = tipo === 'deudas';
    if (titleEl) titleEl.textContent = esDeuda ? 'Detalle de Deuda' : 'Detalle de Pago';

    const monto = Number(item.Monto ?? item.monto ?? 0) || 0;
    const fecha = formatDate(item.Creado ?? item.created_at);
    const cat = item.Categoria || item.categoria || (esDeuda ? 'Deuda' : 'Abono');

    contentEl.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            <span style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase;">Monto:</span>
            <span style="font-family: var(--font-mono); font-size: 1.25rem; font-weight: 800; color: ${esDeuda ? '#ff6b6d' : 'var(--brand-volt)'};">
                ${esDeuda ? '- ' : '+ '}${formatCurrency(monto)}
            </span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            <span style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase;">Fecha:</span>
            <span style="font-size: 0.88rem; color: var(--text-primary); font-weight: 500;">${fecha}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 8px;">
            <span style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase;">Categoría:</span>
            <span style="font-size: 0.88rem; color: var(--text-primary); font-weight: 600;">${escapeHtml(cat)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 0.76rem; color: var(--text-secondary); text-transform: uppercase;">Cliente:</span>
            <span style="font-size: 0.88rem; color: var(--text-primary); font-weight: 600;">${escapeHtml(state.selectedClient?.Nombre || 'Cliente')}</span>
        </div>
    `;

    modal.classList.add('active');
}

function cerrarDetalleOperacionIndiv() {
    const modal = document.getElementById('modal_detalle_op_indiv');
    if (modal) modal.classList.remove('active');
    state.selectedOpItem = null;
    state.selectedOpTipo = null;
}

async function eliminarOperacionEnBD(item, tipo) {
    try {
        const client = await loadSupabase();
        const table = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
        const candidateKeys = (tipo === 'deudas')
            ? ['id_deuda', 'idDeuda', 'id', 'ID', 'Id']
            : ['id_pago', 'idPago', 'id', 'ID', 'Id'];

        let usedKey = null;
        let idVal = null;
        for (const k of candidateKeys) {
            if (item && item[k] !== undefined && item[k] !== null) {
                usedKey = k;
                idVal = item[k];
                break;
            }
        }

        let delRes = null;
        if (usedKey) {
            // Eliminar por clave primaria
            delRes = await client.from(table).delete().eq(usedKey, idVal).select();
        }

        // Si no se encontró clave primaria o no afectó filas, fallback por campos coincidentes
        if (!delRes || !delRes.data || delRes.data.length === 0) {
            let del = client.from(table).delete();
            const phone = item.Telefono_cliente || state.selectedClient?.Telefono;
            if (phone) del = del.eq('Telefono_cliente', phone);

            const monto = Number(item.Monto ?? item.monto);
            if (!isNaN(monto)) del = del.eq('Monto', monto);

            const fecha = item.Creado ?? item.created_at ?? item.creado;
            if (fecha) del = del.eq('Creado', fecha);

            delRes = await del.select();
        }

        if (delRes?.error) {
            console.error('Error eliminando registro:', delRes.error);
            await showErrorToast('No se pudo eliminar el registro: ' + delRes.error.message);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Excepción en eliminarOperacionEnBD:', e);
        await showErrorToast('Error al conectar con la base de datos');
        return false;
    }
}

async function ajustarDeudaActivaCliente(cliente, delta) {
    if (!cliente) return false;
    try {
        const client = await loadSupabase();
        const currentDebt = Number(cliente.Deuda_Activa) || 0;
        const newDebt = parseFloat(Math.max(0, currentDebt + (Number(delta) || 0)).toFixed(2));

        let updRes = null;
        if (cliente.id_clie) {
            updRes = await client.from('Clientes').update({ Deuda_Activa: newDebt }).eq('id_clie', cliente.id_clie).select();
        }
        if ((!updRes || !updRes.data || updRes.data.length === 0) && cliente.Telefono) {
            updRes = await client.from('Clientes').update({ Deuda_Activa: newDebt }).eq('Telefono', cliente.Telefono).select();
        }

        if (updRes?.error) {
            console.error('Error actualizando Deuda_Activa:', updRes.error);
            await showErrorToast('No se pudo actualizar la Deuda Activa: ' + updRes.error.message);
            return false;
        }

        // Sincronizar en memoria
        cliente.Deuda_Activa = newDebt;
        if (state.selectedClient) {
            state.selectedClient.Deuda_Activa = newDebt;
        }
        const clIdx = state.allClients.findIndex(c => (c.id_clie && c.id_clie === cliente.id_clie) || (c.Telefono && c.Telefono === cliente.Telefono));
        if (clIdx >= 0) {
            state.allClients[clIdx].Deuda_Activa = newDebt;
        }

        // Actualizar UI
        const debtEl = document.getElementById('detail_client_debt');
        if (debtEl) debtEl.textContent = formatCurrency(newDebt);

        actualizarMetricasCartera();
        renderClientes();

        return true;
    } catch (e) {
        console.error('Excepción en ajustarDeudaActivaCliente:', e);
        return false;
    }
}

async function confirmarYEliminarOperacion(item, tipo) {
    if (!item || !tipo || !state.selectedClient) return;

    const Swal = await loadSweetAlert2();
    const monto = Number(item.Monto ?? item.monto ?? 0) || 0;
    const fecha = formatDate(item.Creado ?? item.created_at);
    const esDeuda = tipo === 'deudas';
    let deseoAjustarDeuda = esDeuda;

    const result = await Swal.fire({
        title: esDeuda ? '¿Eliminar deuda?' : '¿Eliminar pago?',
        html: `
            <div style="text-align: left; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">
                Vas a eliminar el registro de <strong>${esDeuda ? 'deuda' : 'pago'}</strong> por 
                <span style="font-family: var(--font-mono); font-weight: 700; color: ${esDeuda ? '#ff6b6d' : 'var(--brand-volt)'};">${formatCurrency(monto)}</span> 
                del <strong>${fecha}</strong>.
            </div>
            <div class="swal-chk-container" style="margin-top: 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; text-align: left;">
                <input type="checkbox" id="swal_chk_ajustar_deuda" ${esDeuda ? 'checked' : ''} style="margin-top: 2px; width: 18px; height: 18px; accent-color: var(--brand-volt); cursor: pointer;">
                <label for="swal_chk_ajustar_deuda" style="font-size: 0.82rem; color: #ffffff; cursor: pointer; user-select: none; line-height: 1.3;">
                    ${esDeuda 
                        ? '<strong>Restar este monto</strong> de la Deuda Total (Deuda Activa) del cliente.' 
                        : '<strong>Sumar este monto</strong> a la Deuda Total (anular el abono recibido).'
                    }
                </label>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff4d4f',
        cancelButtonColor: '#252b38',
        background: '#141820',
        color: '#ffffff',
        didOpen: (popup) => {
            const chk = popup ? popup.querySelector('#swal_chk_ajustar_deuda') : document.getElementById('swal_chk_ajustar_deuda');
            if (chk) {
                deseoAjustarDeuda = chk.checked;
                chk.addEventListener('change', () => {
                    deseoAjustarDeuda = chk.checked;
                });
            }
            const container = popup ? popup.querySelector('.swal-chk-container') : null;
            if (container && chk) {
                container.addEventListener('click', (e) => {
                    if (e.target !== chk && e.target.tagName !== 'LABEL') {
                        chk.checked = !chk.checked;
                        deseoAjustarDeuda = chk.checked;
                    }
                });
            }
        },
        preConfirm: () => {
            const chk = document.getElementById('swal_chk_ajustar_deuda');
            if (chk) {
                deseoAjustarDeuda = chk.checked;
            }
            return { ajustarDeuda: deseoAjustarDeuda === true };
        }
    });

    if (!result || !result.isConfirmed) return;

    showAppLoader('Eliminando registro...');
    try {
        const ok = await eliminarOperacionEnBD(item, tipo);
        if (!ok) return;

        // Evaluar con certeza si el usuario dejó marcado o desmarcó el checkbox
        let ajustar = false;
        if (result.value && typeof result.value.ajustarDeuda === 'boolean') {
            ajustar = result.value.ajustarDeuda;
        } else {
            ajustar = (deseoAjustarDeuda === true);
        }

        if (ajustar) {
            await ajustarDeudaActivaCliente(state.selectedClient, esDeuda ? -monto : monto);
        }

        // Remover de listas locales
        if (esDeuda) {
            state.clientDeudas = state.clientDeudas.filter(d => d !== item && (d.id_deuda ? d.id_deuda !== item.id_deuda : true));
        } else {
            state.clientPagos = state.clientPagos.filter(p => p !== item && (p.id_pago ? p.id_pago !== item.id_pago : true));
            const nuevoTotalPagado = state.clientPagos.reduce((acc, p) => acc + (Number(p.Monto) || 0), 0);
            const paidEl = document.getElementById('detail_client_total_paid');
            if (paidEl) paidEl.textContent = formatCurrency(nuevoTotalPagado);
        }

        // Re-render lista operaciones
        renderOperacionesClienteTab(state.currentOpTab);

        // Recalcular estado crediticio
        const ind = computePaymentIndicators({
            pagos: state.clientPagos,
            deudas: state.clientDeudas,
            deudaActiva: state.selectedClient.Deuda_Activa
        });
        actualizarEstadoCrediticioUI(ind);

        cerrarDetalleOperacionIndiv();
        if (ajustar) {
            await showSuccessToast(`${esDeuda ? 'Deuda eliminada y descontada del saldo' : 'Pago anulado y restituido al saldo'}`);
        } else {
            await showSuccessToast(`${esDeuda ? 'Registro de deuda eliminado (saldo total sin cambios)' : 'Registro de pago eliminado (saldo total sin cambios)'}`);
        }

    } catch (err) {
        console.error('Error en confirmarYEliminarOperacion:', err);
        await showErrorToast('Ocurrió un error al procesar la eliminación');
    } finally {
        hideAppLoader();
    }
}

// Función directa para Saldar / Eliminar la Deuda Activa del cliente a $0
async function saldarOEliminarDeudaActivaCliente() {
    if (!state.selectedClient) return;
    const debt = Number(state.selectedClient.Deuda_Activa) || 0;

    const Swal = await loadSweetAlert2();
    const result = await Swal.fire({
        title: '¿Eliminar Deuda Activa?',
        html: `
            <div style="text-align: left; font-size: 0.88rem; color: var(--text-secondary); line-height: 1.5;">
                Vas a saldar y poner en <strong>$0,00</strong> la <strong>Deuda Activa</strong> de <strong>${escapeHtml(state.selectedClient.Nombre || 'Cliente')}</strong>.
                ${debt > 0 ? `<br><span style="display:inline-block; margin-top: 6px; font-family: var(--font-mono); font-weight: 700; color: #ff6b6d; font-size: 1.05rem;">Saldo a eliminar: ${formatCurrency(debt)}</span>` : ''}
            </div>
            <div style="margin-top: 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 12px; display: flex; align-items: flex-start; gap: 10px; cursor: pointer; text-align: left;">
                <input type="checkbox" id="swal_chk_eliminar_historial_deudas" checked style="margin-top: 2px; width: 18px; height: 18px; accent-color: var(--brand-volt); cursor: pointer;">
                <label for="swal_chk_eliminar_historial_deudas" style="font-size: 0.82rem; color: #ffffff; cursor: pointer; user-select: none; line-height: 1.3;">
                    <strong>También eliminar los registros</strong> del historial de deudas de este cliente.
                </label>
            </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, poner deuda en $0',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#ff4d4f',
        cancelButtonColor: '#252b38',
        background: '#141820',
        color: '#ffffff',
        preConfirm: () => {
            const popup = Swal.getPopup();
            const chk = popup ? popup.querySelector('#swal_chk_eliminar_historial_deudas') : document.getElementById('swal_chk_eliminar_historial_deudas');
            return { eliminarRegistros: chk ? chk.checked : true };
        }
    });

    if (!result.isConfirmed) return;

    showAppLoader('Saldando deuda activa...');
    try {
        const client = await loadSupabase();

        // 1. Poner Deuda_Activa en 0 usando id_clie con fallback a Telefono
        let updRes = null;
        if (state.selectedClient.id_clie) {
            updRes = await client.from('Clientes').update({ Deuda_Activa: 0 }).eq('id_clie', state.selectedClient.id_clie).select();
        }
        if ((!updRes || !updRes.data || updRes.data.length === 0) && state.selectedClient.Telefono) {
            updRes = await client.from('Clientes').update({ Deuda_Activa: 0 }).eq('Telefono', state.selectedClient.Telefono).select();
        }

        if (updRes?.error) {
            console.error('Error al actualizar Deuda_Activa:', updRes.error);
            await showErrorToast('No se pudo saldar la deuda activa: ' + updRes.error.message);
            return;
        }

        // 2. Si se solicitó eliminar los registros de deudas del historial
        if (result.value?.eliminarRegistros) {
            const tel = state.selectedClient.Telefono;
            const idClie = state.selectedClient.id_clie;

            if (tel) {
                await client.from('Deudas').delete().eq('Telefono_cliente', tel);
            }
            if (idClie) {
                await client.from('Deudas').delete().eq('ID_cliente', idClie);
            }
            state.clientDeudas = [];
        }

        // 3. Sincronizar en memoria
        state.selectedClient.Deuda_Activa = 0;
        const clIdx = state.allClients.findIndex(c => (c.id_clie && c.id_clie === state.selectedClient.id_clie) || (c.Telefono && c.Telefono === state.selectedClient.Telefono));
        if (clIdx >= 0) {
            state.allClients[clIdx].Deuda_Activa = 0;
        }

        // 4. Actualizar UI
        const debtEl = document.getElementById('detail_client_debt');
        if (debtEl) debtEl.textContent = formatCurrency(0);

        actualizarMetricasCartera();
        renderClientes();
        renderOperacionesClienteTab(state.currentOpTab);

        // Recalcular estado crediticio
        const ind = computePaymentIndicators({
            pagos: state.clientPagos,
            deudas: state.clientDeudas,
            deudaActiva: 0
        });
        actualizarEstadoCrediticioUI(ind);

        await showSuccessToast('Deuda activa eliminada y saldo en $0,00');

    } catch (err) {
        console.error('Error saldando deuda activa:', err);
        await showErrorToast('Ocurrió un error al saldar la deuda');
    } finally {
        hideAppLoader();
    }
}

// ==========================================================================
// ESTADÍSTICAS INDIVIDUALES DEL CLIENTE Y CHART.JS
// ==========================================================================
async function ensureChartJs() {
    if (window.Chart) return window.Chart;
    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-lib="chartjs"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Chart));
            existing.addEventListener('error', reject);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
        script.dataset.lib = 'chartjs';
        script.onload = () => resolve(window.Chart);
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function destroyClientStatsCharts() {
    if (state.clientStatsCharts && state.clientStatsCharts.length) {
        state.clientStatsCharts.forEach(c => {
            try { c?.destroy(); } catch (_) { }
        });
    }
    state.clientStatsCharts = [];
}

function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
    return date.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
}

function buildMonthlySeries(items) {
    const bucket = new Map();
    for (const item of (items || [])) {
        const date = normalizeFechaOperacion(item);
        if (!date) continue;
        const key = monthKey(date);
        const current = bucket.get(key) || { date, label: monthLabel(date), total: 0 };
        current.total += Number(item.Monto || item.monto || 0);
        bucket.set(key, current);
    }
    const list = Array.from(bucket.values()).sort((a, b) => a.date - b.date);
    if (list.length === 0) {
        return [{ label: 'Sin datos', total: 0 }];
    }
    return list;
}

function pushLineChart(canvasId, labels, values, borderColor, fillGradientA, fillGradientB) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !window.Chart) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
    gradient.addColorStop(0, fillGradientA);
    gradient.addColorStop(1, fillGradientB);

    const chart = new window.Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: values,
                borderColor: borderColor,
                backgroundColor: gradient,
                pointBackgroundColor: borderColor,
                pointBorderColor: '#0a0c0f',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                borderWidth: 2.4,
                tension: 0.35,
                fill: true,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#12161f',
                    borderColor: 'rgba(255,255,255,0.15)',
                    borderWidth: 1,
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    displayColors: false,
                    callbacks: {
                        label: (ctx2) => ` ${formatCurrency(ctx2.parsed.y || 0)}`
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: 'rgba(255,255,255,0.65)', font: { size: 11 } },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                },
                y: {
                    ticks: {
                        color: 'rgba(255,255,255,0.65)',
                        font: { size: 11 },
                        callback: (v) => `$${Number(v).toLocaleString('es-AR')}`
                    },
                    grid: { color: 'rgba(255,255,255,0.06)' }
                }
            }
        }
    });
    state.clientStatsCharts.push(chart);
    return chart;
}

async function abrirEstadisticasCliente() {
    if (!state.selectedClient) {
        await showErrorToast('Selecciona un cliente primero');
        return;
    }
    const modal = document.getElementById('modal_estadisticas_cliente');
    if (!modal) return;

    const subEl = document.getElementById('stats_client_subtitle');
    if (subEl) subEl.textContent = `Cliente: ${state.selectedClient.Nombre || 'Sin nombre'} (${state.selectedClient.Telefono || '—'})`;

    const ind = computePaymentIndicators({
        pagos: state.clientPagos,
        deudas: state.clientDeudas,
        deudaActiva: state.selectedClient.Deuda_Activa
    });

    const probEl = document.getElementById('stats_modal_prob');
    const scoreEl = document.getElementById('stats_modal_score');
    const badgeEl = document.getElementById('stats_modal_badge');
    const totDeudaEl = document.getElementById('stats_modal_total_deuda');
    const totPagosEl = document.getElementById('stats_modal_total_pagos');

    if (probEl) {
        probEl.textContent = `${ind.probabilidad}%`;
        probEl.style.color = ind.tone === 'high' ? 'var(--brand-volt)' : (ind.tone === 'mid' ? '#fbbf24' : '#ff6b6d');
    }
    if (scoreEl) scoreEl.textContent = `${ind.score} / 850`;
    if (badgeEl) {
        badgeEl.textContent = ind.label;
        badgeEl.dataset.tone = ind.tone;
    }
    if (totDeudaEl) totDeudaEl.textContent = formatCurrency(ind.totalDeudaRegistrada);
    if (totPagosEl) totPagosEl.textContent = formatCurrency(ind.totalPagado);

    modal.classList.add('active');

    try {
        await ensureChartJs();
        destroyClientStatsCharts();

        const serieDeuda = buildMonthlySeries(state.clientDeudas);
        const seriePago = buildMonthlySeries(state.clientPagos);

        pushLineChart(
            'chart_cliente_deudas',
            serieDeuda.map(x => x.label),
            serieDeuda.map(x => x.total),
            '#ff6b6d',
            'rgba(255, 107, 109, 0.35)',
            'rgba(255, 107, 109, 0.02)'
        );

        pushLineChart(
            'chart_cliente_pagos',
            seriePago.map(x => x.label),
            seriePago.map(x => x.total),
            '#ccff00',
            'rgba(204, 255, 0, 0.35)',
            'rgba(204, 255, 0, 0.02)'
        );
    } catch (err) {
        console.error('Error inicializando gráficos de cliente:', err);
    }
}

function cerrarEstadisticasCliente() {
    const modal = document.getElementById('modal_estadisticas_cliente');
    if (modal) modal.classList.remove('active');
    destroyClientStatsCharts();
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
        let updRes = null;
        if (state.selectedClient.id_clie) {
            updRes = await client
                .from('Clientes')
                .update({
                    Nombre: newNombre,
                    Telefono: newTelefono,
                    Deuda_Activa: newDeuda
                })
                .eq('id_clie', state.selectedClient.id_clie)
                .select();
        }
        if ((!updRes || !updRes.data || updRes.data.length === 0) && state.selectedClient.Telefono) {
            updRes = await client
                .from('Clientes')
                .update({
                    Nombre: newNombre,
                    Telefono: newTelefono,
                    Deuda_Activa: newDeuda
                })
                .eq('Telefono', state.selectedClient.Telefono)
                .select();
        }

        if (updRes?.error) {
            console.error('Error editando cliente:', updRes.error);
            await showErrorToast('No se pudo actualizar el cliente: ' + updRes.error.message);
            return;
        }

        // Si cambió el teléfono, actualizar en cascada en Deudas y Pagos
        if (newTelefono && newTelefono !== state.selectedClient.Telefono) {
            const oldTel = state.selectedClient.Telefono;
            if (oldTel) {
                await client.from('Deudas').update({ Telefono_cliente: newTelefono }).eq('Telefono_cliente', oldTel);
                await client.from('Pagos').update({ Telefono_cliente: newTelefono }).eq('Telefono_cliente', oldTel);
            }
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
    const btnStats = document.getElementById('detail_btn_stats');
    const btnEdit = document.getElementById('detail_btn_edit');
    const btnDelete = document.getElementById('detail_btn_delete');
    if (btnWa) btnWa.addEventListener('click', abrirModalWhatsApp);
    if (btnStats) btnStats.addEventListener('click', abrirEstadisticasCliente);
    if (btnEdit) btnEdit.addEventListener('click', abrirModalEditarCliente);
    if (btnDelete) btnDelete.addEventListener('click', confirmarEliminarCliente);

    // Botón eliminar dentro del modal de detalle de operación
    const btnDeleteFromDetail = document.getElementById('btn_delete_from_op_detail');
    if (btnDeleteFromDetail) {
        btnDeleteFromDetail.addEventListener('click', () => {
            if (state.selectedOpItem && state.selectedOpTipo) {
                confirmarYEliminarOperacion(state.selectedOpItem, state.selectedOpTipo);
            }
        });
    }

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
window.abrirEstadisticasCliente = abrirEstadisticasCliente;
window.cerrarEstadisticasCliente = cerrarEstadisticasCliente;
window.abrirDetalleOperacionIndiv = abrirDetalleOperacionIndiv;
window.cerrarDetalleOperacionIndiv = cerrarDetalleOperacionIndiv;
window.confirmarYEliminarOperacion = confirmarYEliminarOperacion;
window.saldarOEliminarDeudaActivaCliente = saldarOEliminarDeudaActivaCliente;

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
