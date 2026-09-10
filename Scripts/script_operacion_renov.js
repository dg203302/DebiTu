import { loadSupabase } from './supabase.js';
import { showSuccessToast, showErrorToast } from './sweetalert2.js';
import { showAppLoader, hideAppLoader } from './loader_renovado.js';

// --- Helpers Multi-Tenant (ID_Negocio) ---
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

// Formateador de moneda en pesos
const formatCurrency = (amount) => {
    const val = Number(amount) || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    }).format(val).replace('ARS', '$').trim();
};

const formatNumberClean = (num) => {
    const val = Number(num) || 0;
    return new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    }).format(val);
};

// --- Estado Global del Formulario ---
const state = {
    tipo: 'deuda', // 'deuda' o 'pago'
    selectedClient: null,
    allClients: [],
    expression: '0',
    totalAmount: 0,
    showingResult: false
};

export async function initOperacion() {
    showAppLoader('Cargando operaciones y clientes...');
    try {
        initHeaderProfile();
        initTipoOperacionToggle();
        initQuickCategories();
        initFintechCalculator();
        initClientSearch();
        await cargarClientes();
    } catch (err) {
        console.error('Error inicializando operación:', err);
    } finally {
        hideAppLoader();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initOperacion());
} else if (!window.__SPA_ROUTER_ACTIVE__) {
    initOperacion();
}

// ==========================================================================
// 1. CARGA DE PERFIL EN HEADER FLOTANTE
// ==========================================================================
async function initHeaderProfile() {
    const pfpImg = document.getElementById('pfp');
    const fallback = document.getElementById('header_avatar_fallback');
    const initialsSpan = document.getElementById('header_avatar_initials');
    const nameSpan = document.getElementById('user_display_name');

    const localPhoto = localStorage.getItem('UserPhoto');
    const localName = localStorage.getItem('UserName') || 'Mi Negocio';

    if (nameSpan) nameSpan.textContent = localName;

    const initial = (localName.trim()[0] || 'D').toUpperCase();
    if (initialsSpan) initialsSpan.textContent = initial;

    if (localPhoto && localPhoto.trim() && pfpImg) {
        let photoUrl = localPhoto.trim();
        if (photoUrl.includes('googleusercontent.com') && photoUrl.includes('=s96-c')) {
            photoUrl = photoUrl.replace('=s96-c', '=s128-c');
        }
        pfpImg.src = photoUrl;
    } else {
        if (pfpImg) pfpImg.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
    }
}

// ==========================================================================
// 2. TOGGLE DE TIPO DE OPERACIÓN (CARGAR DEUDA VS REGISTRAR PAGO)
// ==========================================================================
function initTipoOperacionToggle() {
    const btnDeuda = document.getElementById('btn_type_deuda');
    const btnPago = document.getElementById('btn_type_pago');
    const submitBtn = document.getElementById('btn_submit_op');
    const submitLabel = document.getElementById('submit_btn_label');

    if (!btnDeuda || !btnPago || !submitBtn) return;

    btnDeuda.addEventListener('click', () => {
        state.tipo = 'deuda';
        btnDeuda.className = 'op-type-btn active-deuda';
        btnPago.className = 'op-type-btn';
        submitBtn.className = 'btn-volt-action btn-deuda-mode';
        updateSubmitButton();
    });

    btnPago.addEventListener('click', () => {
        state.tipo = 'pago';
        btnPago.className = 'op-type-btn active-pago';
        btnDeuda.className = 'op-type-btn';
        submitBtn.className = 'btn-volt-action';
        updateSubmitButton();
    });

    // Leer parámetro ?tipo=pago o ?tipo=deuda desde la URL
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const tipoParam = urlParams.get('tipo');
        if (tipoParam === 'pago') {
            btnPago.click();
        } else if (tipoParam === 'deuda') {
            btnDeuda.click();
        }
    } catch (_) { }
}

function updateSubmitButton() {
    const submitLabel = document.getElementById('submit_btn_label');
    const submitIcon = document.getElementById('submit_btn_icon');
    if (!submitLabel) return;

    const formatted = formatCurrency(state.totalAmount);
    if (state.tipo === 'deuda') {
        submitLabel.textContent = state.totalAmount > 0 
            ? `Cargar Deuda • ${formatted}` 
            : 'Cargar Deuda';
        if (submitIcon) {
            submitIcon.innerHTML = `
                <line x1="12" y1="19" x2="12" y2="5"></line>
                <polyline points="5 12 12 5 19 12"></polyline>
            `;
        }
    } else {
        submitLabel.textContent = state.totalAmount > 0 
            ? `Registrar Pago • ${formatted}` 
            : 'Registrar Pago';
        if (submitIcon) {
            submitIcon.innerHTML = `
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
            `;
        }
    }
}

// ==========================================================================
// 3. SELECCIÓN Y BÚSQUEDA DE CLIENTES
// ==========================================================================
async function cargarClientes() {
    try {
        const client = await loadSupabase();
        let q = client.from('Clientes').select('id_clie, Nombre, Telefono, Deuda_Activa').order('Nombre');
        q = applyIdNegocioFilter(q);
        const { data, error } = await q;

        if (error) {
            console.warn('Error al cargar clientes:', error);
            state.allClients = [];
        } else {
            state.allClients = data || [];
        }

        renderQuickClientsCarousel(state.allClients.slice(0, 10));
    } catch (err) {
        console.warn('Error en cargarClientes:', err);
    }
}

function renderQuickClientsCarousel(clients) {
    const container = document.getElementById('quick_clients_container');
    if (!container) return;

    if (!clients || clients.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'flex';
    container.innerHTML = '';

    clients.forEach(c => {
        const initial = (c.Nombre || c.Telefono || 'C').trim()[0].toUpperCase();
        const pill = document.createElement('button');
        pill.type = 'button';
        pill.className = 'quick-client-pill';
        pill.title = `${c.Nombre || ''} (${c.Telefono || ''})`;
        pill.innerHTML = `
            <div class="quick-client-avatar">${initial}</div>
            <span class="quick-client-name">${escapeHtml(c.Nombre || c.Telefono || 'Cliente')}</span>
        `;
        pill.addEventListener('click', () => {
            selectClient(c);
        });
        container.appendChild(pill);
    });
}

function initClientSearch() {
    const input = document.getElementById('op_client_search');
    const dropdown = document.getElementById('client_search_dropdown');
    const cardSelected = document.getElementById('selected_client_card');
    const btnRemove = document.getElementById('btn_remove_client');

    if (!input || !dropdown || !cardSelected || !btnRemove) return;

    let debounceTimer = null;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const term = input.value.trim().toLowerCase();
        if (!term) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
            return;
        }

        debounceTimer = setTimeout(() => {
            const matches = state.allClients.filter(c => {
                const n = (c.Nombre || '').toLowerCase();
                const t = (c.Telefono || '').toLowerCase();
                return n.includes(term) || t.includes(term);
            });

            renderDropdownResults(matches, term);
        }, 180);
    });

    // Cerrar dropdown al clickear fuera
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    btnRemove.addEventListener('click', () => {
        deselectClient();
    });
}

function renderDropdownResults(matches, term) {
    const dropdown = document.getElementById('client_search_dropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';
    if (matches.length === 0) {
        const item = document.createElement('div');
        item.className = 'client-dropdown-item';
        item.innerHTML = `
            <div class="client-dropdown-info">
                <div class="client-dropdown-avatar" style="background: rgba(204, 255, 0, 0.15); border-color: var(--brand-volt); color: var(--brand-volt); font-size: 1.1rem;">+</div>
                <div>
                    <div class="client-dropdown-name">Usar "${escapeHtml(term)}"</div>
                    <div class="client-dropdown-tel">Asociar como destinatario</div>
                </div>
            </div>
            <div class="client-dropdown-debt" style="color: var(--brand-volt); font-size: 0.72rem;">Nuevo</div>
        `;
        item.addEventListener('click', () => {
            const digits = (term.match(/\d+/g) || []).join('');
            selectClient({
                Nombre: digits.length >= 6 ? term : term,
                Telefono: digits.length >= 6 ? digits : null,
                Deuda_Activa: 0
            });
            dropdown.style.display = 'none';
        });
        dropdown.appendChild(item);
        dropdown.style.display = 'flex';
        return;
    }

    matches.slice(0, 8).forEach(c => {
        const item = document.createElement('div');
        item.className = 'client-dropdown-item';
        const initial = (c.Nombre || c.Telefono || 'C').trim()[0].toUpperCase();
        const debt = Number(c.Deuda_Activa) || 0;

        item.innerHTML = `
            <div class="client-dropdown-info">
                <div class="client-dropdown-avatar">${initial}</div>
                <div>
                    <div class="client-dropdown-name">${escapeHtml(c.Nombre || 'Sin nombre')}</div>
                    <div class="client-dropdown-tel">${escapeHtml(c.Telefono || 'Sin teléfono')}</div>
                </div>
            </div>
            <div class="client-dropdown-debt">${debt > 0 ? formatCurrency(debt) : '<span style="color: var(--brand-volt); font-size: 0.72rem;">Al día</span>'}</div>
        `;

        item.addEventListener('click', () => {
            selectClient(c);
            dropdown.style.display = 'none';
        });

        dropdown.appendChild(item);
    });

    dropdown.style.display = 'flex';
}

function selectClient(client) {
    state.selectedClient = client;

    const searchBox = document.getElementById('client_search_box');
    const cardSelected = document.getElementById('selected_client_card');
    const input = document.getElementById('op_client_search');
    const dropdown = document.getElementById('client_search_dropdown');

    const nameEl = document.getElementById('selected_client_name');
    const telEl = document.getElementById('selected_client_tel');
    const avatarEl = document.getElementById('selected_client_avatar');
    const badgeEl = document.getElementById('selected_client_badge');

    if (input) input.value = '';
    if (dropdown) dropdown.style.display = 'none';
    if (searchBox) searchBox.style.display = 'none';

    if (nameEl) nameEl.textContent = client.Nombre || 'Cliente sin nombre';
    if (telEl) telEl.textContent = client.Telefono || 'Sin teléfono';
    if (avatarEl) avatarEl.textContent = (client.Nombre || client.Telefono || 'C').trim()[0].toUpperCase();
    
    const debt = Number(client.Deuda_Activa) || 0;
    if (badgeEl) {
        if (debt > 0) {
            badgeEl.textContent = `Deuda actual: ${formatCurrency(debt)}`;
            badgeEl.style.background = 'rgba(255, 77, 79, 0.15)';
            badgeEl.style.color = '#ff6b6d';
        } else {
            badgeEl.textContent = 'Al día ($0.00)';
            badgeEl.style.background = 'var(--brand-volt-glow-subtle)';
            badgeEl.style.color = 'var(--brand-volt)';
        }
    }

    if (cardSelected) cardSelected.style.display = 'flex';
}

function deselectClient() {
    state.selectedClient = null;
    const searchBox = document.getElementById('client_search_box');
    const cardSelected = document.getElementById('selected_client_card');
    const input = document.getElementById('op_client_search');

    if (cardSelected) cardSelected.style.display = 'none';
    if (searchBox) searchBox.style.display = 'flex';
    if (input) {
        input.value = '';
        input.focus();
    }
}

// ==========================================================================
// 4. PASTILLAS DE CONCEPTO / CATEGORÍA
// ==========================================================================
function initQuickCategories() {
    const input = document.getElementById('op_category_input');
    const chips = document.querySelectorAll('.category-chip');

    chips.forEach(chip => {
        chip.addEventListener('click', () => {
            chips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            const val = chip.dataset.cat || chip.textContent.trim();
            if (input) {
                input.value = val;
                input.focus();
            }
        });
    });

    if (input) {
        input.addEventListener('input', () => {
            chips.forEach(c => c.classList.remove('active'));
        });
    }
}

// ==========================================================================
// 5. CALCULADORA Y TECLADO FINTECH
// ==========================================================================
function initFintechCalculator() {
    const displayInput = document.getElementById('op_amount_input');
    const calcPreview = document.getElementById('amount_calc_preview');
    const keys = document.querySelectorAll('.calc-btn-key');
    const quickIncrements = document.querySelectorAll('.quick-amt-pill');

    function updateDisplay() {
        if (displayInput) {
            displayInput.value = toDisplayExpr(state.expression);
        }
        if (calcPreview) {
            // Si la expresión tiene operadores, mostrar el cálculo en vivo
            if (/[+\-*/]/.test(state.expression.slice(1))) {
                const tempRes = evaluateExpression(state.expression);
                if (Number.isFinite(tempRes)) {
                    calcPreview.textContent = `= ${formatCurrency(tempRes)}`;
                } else {
                    calcPreview.textContent = '';
                }
            } else {
                calcPreview.textContent = '';
            }
        }
        updateSubmitButton();
    }

    function setTotal(num) {
        state.totalAmount = Math.max(0, Number.isFinite(num) ? roundMoney(num) : 0);
        updateSubmitButton();
    }

    // Teclas del teclado
    keys.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.dataset.key;
            const op = btn.dataset.op;
            const action = btn.dataset.action;

            if (key) {
                handleKeyInput(key);
            } else if (op) {
                handleOperatorInput(op);
            } else if (action === 'backspace') {
                handleBackspace();
            } else if (action === 'clear') {
                handleClear();
            } else if (action === 'equals') {
                handleEquals();
            }
            updateDisplay();
        });
    });

    // Pastillas rápidas (+$500, +$1.000, etc.)
    quickIncrements.forEach(pill => {
        pill.addEventListener('click', () => {
            const addVal = Number(pill.dataset.add) || 0;
            const current = evaluateExpression(state.expression);
            const base = Number.isFinite(current) ? current : state.totalAmount;
            const next = roundMoney(base + addVal);
            state.expression = String(next);
            state.totalAmount = next;
            state.showingResult = true;
            updateDisplay();
        });
    });

    // Edición manual por teclado físico
    if (displayInput) {
        displayInput.addEventListener('input', () => {
            const raw = fromDisplayExpr(displayInput.value).replace(/[^0-9+\-*/.]/g, '');
            state.expression = raw || '0';
            const num = evaluateExpression(state.expression);
            if (Number.isFinite(num)) {
                setTotal(num);
            }
            updateDisplay();
        });

        displayInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleEquals();
                updateDisplay();
            }
        });
    }

    // Inicializar botón de submit
    const submitBtn = document.getElementById('btn_submit_op');
    if (submitBtn) {
        submitBtn.addEventListener('click', registrarOperacion);
    }
}

function handleKeyInput(k) {
    if (state.showingResult) {
        state.expression = '0';
        state.showingResult = false;
    }

    if (k === '.') {
        if (currentNumberHasDot(state.expression)) return;
        const last = state.expression.slice(-1);
        if (state.expression === '0' || state.expression === '') {
            state.expression = '0.';
        } else if (isOperator(last)) {
            state.expression += '0.';
        } else {
            state.expression += '.';
        }
    } else {
        if (state.expression === '0') {
            state.expression = k;
        } else {
            state.expression += k;
        }
    }

    // Si es un número directo, actualizar totalAmount
    const evaluated = evaluateExpression(state.expression);
    if (Number.isFinite(evaluated)) {
        state.totalAmount = roundMoney(evaluated);
    }
}

function handleOperatorInput(op) {
    if (state.showingResult) {
        state.showingResult = false;
        state.expression = String(roundMoney(state.totalAmount));
    }

    if (state.expression === '' || state.expression === '-') return;

    const last = state.expression.slice(-1);
    if (isOperator(last)) {
        state.expression = state.expression.slice(0, -1) + op;
    } else {
        state.expression += op;
    }
}

function handleBackspace() {
    if (state.showingResult) {
        state.showingResult = false;
        state.expression = String(roundMoney(state.totalAmount));
    }
    if (state.expression.length > 1) {
        state.expression = state.expression.slice(0, -1);
    } else {
        state.expression = '0';
    }

    const evaluated = evaluateExpression(state.expression);
    state.totalAmount = Number.isFinite(evaluated) ? roundMoney(evaluated) : 0;
}

function handleClear() {
    state.expression = '0';
    state.totalAmount = 0;
    state.showingResult = false;
}

function handleEquals() {
    if (!state.expression || isOperator(state.expression.slice(-1))) return;
    const res = evaluateExpression(state.expression);
    if (Number.isFinite(res)) {
        const rounded = roundMoney(res);
        state.totalAmount = rounded;
        state.expression = String(rounded);
        state.showingResult = true;
    }
}

// Helpers de cálculo de expresión
function isOperator(ch) {
    return ch === '+' || ch === '-' || ch === '*' || ch === '/';
}

function currentNumberHasDot(expr) {
    const parts = expr.split(/[+\-*/]/);
    const last = parts[parts.length - 1];
    return last ? last.includes('.') : false;
}

function toDisplayExpr(normalized) {
    return String(normalized)
        .replace(/\*/g, '×')
        .replace(/\//g, '÷');
}

function fromDisplayExpr(display) {
    return String(display)
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/,/g, '.')
        .replace(/\s+/g, '');
}

function roundMoney(n) {
    return parseFloat(Number(n).toFixed(2));
}

function evaluateExpression(str) {
    try {
        const clean = str.replace(/[^0-9+\-*/.]/g, '');
        if (!clean || isOperator(clean.slice(-1))) return NaN;
        // Evaluar de manera segura con Function en formato matemático puro
        // Solo contiene dígitos y operadores básicos
        const fn = new Function(`return (${clean});`);
        const res = fn();
        return Number.isFinite(res) ? res : NaN;
    } catch (_) {
        return NaN;
    }
}

// ==========================================================================
// 6. REGISTRAR OPERACIÓN EN SUPABASE
// ==========================================================================
async function registrarOperacion() {
    const submitBtn = document.getElementById('btn_submit_op');
    const categoryInput = document.getElementById('op_category_input');

    // Asegurar que si hay una operación pendiente de igualar, se evalúe
    handleEquals();

    const monto = state.totalAmount;
    if (!monto || monto <= 0) {
        await showErrorToast('Ingresa un monto válido mayor a $0');
        return;
    }

    if (!state.selectedClient) {
        await showErrorToast('Selecciona un cliente para registrar la operación');
        const searchInput = document.getElementById('op_client_search');
        if (searchInput) searchInput.focus();
        return;
    }

    const phoneValue = state.selectedClient.Telefono ?? null;
    const categoria = (categoryInput ? categoryInput.value.trim() : '') || (state.tipo === 'deuda' ? 'Nueva deuda' : 'Pago de cuota');

    submitBtn.disabled = true;
    const originalLabel = submitBtn.innerHTML;
    submitBtn.innerHTML = `
        <div class="loader-spinner" style="width: 20px; height: 20px; border-width: 2.5px; border-color: currentColor; border-top-color: transparent;"></div>
        <span>Registrando...</span>
    `;

    try {
        const client = await loadSupabase();
        const idNegocio = getIdNegocioForWrite();

        if (idNegocio === undefined) {
            await showErrorToast('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
            return;
        }

        const payload = {
            Monto: monto,
            Categoria: categoria,
            Telefono_cliente: phoneValue,
            ID_Negocio: idNegocio
        };

        const table = state.tipo === 'deuda' ? 'Deudas' : 'Pagos';
        const { error: insertError } = await client.from(table).insert(payload);

        if (insertError) {
            console.error('Error insertando operación:', insertError);
            await showErrorToast('Error al registrar: ' + (insertError.message || insertError));
            return;
        }

        // Actualizar la Deuda_Activa del cliente en la tabla Clientes
        if (phoneValue) {
            let qClient = client
                .from('Clientes')
                .select('Deuda_Activa')
                .eq('Telefono', phoneValue);
            qClient = applyIdNegocioFilter(qClient);
            const { data: clientData, error: selectError } = await qClient.single();

            if (!selectError && clientData) {
                const currentDebt = Number(clientData.Deuda_Activa ?? 0) || 0;
                const newDebt = state.tipo === 'deuda'
                    ? parseFloat((currentDebt + monto).toFixed(2))
                    : parseFloat(Math.max(0, currentDebt - monto).toFixed(2));

                let upd = client
                    .from('Clientes')
                    .update({ Deuda_Activa: newDebt })
                    .eq('Telefono', phoneValue);
                upd = applyIdNegocioFilter(upd);
                await upd;

                // Actualizar estado local del cliente
                state.selectedClient.Deuda_Activa = newDebt;
                const badgeEl = document.getElementById('selected_client_badge');
                if (badgeEl) {
                    if (newDebt > 0) {
                        badgeEl.textContent = `Deuda actual: ${formatCurrency(newDebt)}`;
                        badgeEl.style.background = 'rgba(255, 77, 79, 0.15)';
                        badgeEl.style.color = '#ff6b6d';
                    } else {
                        badgeEl.textContent = 'Al día ($0.00)';
                        badgeEl.style.background = 'var(--brand-volt-glow-subtle)';
                        badgeEl.style.color = 'var(--brand-volt)';
                    }
                }
            }
        }

        // Mostrar confirmación
        await showSuccessToast(
            state.tipo === 'deuda' 
                ? `¡Deuda de ${formatCurrency(monto)} cargada con éxito!` 
                : `¡Pago de ${formatCurrency(monto)} registrado con éxito!`
        );

        // Reset de montos y conceptos
        handleClear();
        if (categoryInput) categoryInput.value = '';
        document.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));

        // Recargar la lista de clientes en memoria para que los datos estén frescos
        await cargarClientes();

    } catch (err) {
        console.error('Error general al registrar operación:', err);
        await showErrorToast('Ocurrió un error inesperado al registrar');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalLabel;
        updateSubmitButton();
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
