import { loadSupabase, loadSupaBseWithAuth } from './supabase.js';
import { showAppLoader, hideAppLoader } from './loader_renovado.js';

// --- Multi-tenant helper (ID_Negocio) ---
function getLocalUserId() {
    const raw = localStorage.getItem('UserID');
    if (raw === undefined || raw === null) return null;
    const v = String(raw).trim();
    return v ? v : null;
}

function applyIdNegocioFilter(query) {
    const userId = getLocalUserId();
    if (userId === 'N/A') return query.is('ID_Negocio', null);
    if (!userId) return query; // Si no hay userId en desarrollo, permite consulta general
    return query.eq('ID_Negocio', userId);
}

// Formateador de moneda en pesos argentinos / formato latino
const formatCurrency = (amount) => {
    const val = Number(amount) || 0;
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2
    }).format(val).replace('ARS', '$').trim();
};

// Estado global de datos en memoria para el Dashboard
const state = {
    clientes: [],
    deudas: [],
    pagos: [],
    totalDeudaActiva: 0,
    currentTimeframe: 'mensual',
    isDemoFallback: false
};

export async function initDashboard() {
    showAppLoader('Sincronizando finanzas...');
    try {
        initTimeframeSwitchers();
        await cargarDatosDashboard();
    } catch (err) {
        console.error('Error inicializando dashboard:', err);
    } finally {
        hideAppLoader();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initDashboard());
} else if (!window.__SPA_ROUTER_ACTIVE__) {
    initDashboard();
}

async function cargarDatosDashboard() {
    try {
        const client = await loadSupabase();
        
        // Cargar información del usuario (nombre y foto de perfil) - PRIMERO para respuesta visual inmediata
        await cargarPerfilUsuario();

        // 1. Obtener Clientes (para calcular la Deuda Total Activa)
        let qClientes = client.from('Clientes').select('id_clie, Nombre, Deuda_Activa, Telefono');
        qClientes = applyIdNegocioFilter(qClientes);

        // 2. Obtener Deudas históricas
        let qDeudas = client.from('Deudas').select('id_deuda, ID_cliente, Telefono_cliente, Monto, Categoria, Creado').order('Creado', { ascending: false });
        qDeudas = applyIdNegocioFilter(qDeudas);

        // 3. Obtener Pagos históricos
        let qPagos = client.from('Pagos').select('id_pago, ID_cliente, Telefono_cliente, Monto, Categoria, Creado').order('Creado', { ascending: false });
        qPagos = applyIdNegocioFilter(qPagos);

        const [resClientes, resDeudas, resPagos] = await Promise.all([qClientes, qDeudas, qPagos]);

        state.clientes = resClientes.data || [];
        state.deudas = resDeudas.data || [];
        state.pagos = resPagos.data || [];

        // Si la base de datos no tiene datos o está vacía, cargar dataset de muestra para visualización fluida
        if (state.clientes.length === 0 && state.pagos.length === 0 && state.deudas.length === 0) {
            cargarDatasetDemo();
        }

        // 4. Calcular Deuda Total Activa (Suma de Deuda_Activa de todos los clientes)
        state.totalDeudaActiva = state.clientes.reduce((acc, c) => acc + (Number(c.Deuda_Activa) || 0), 0);
        renderTotalBalance(state.totalDeudaActiva);

        // 5. Calcular e indicar "Cobrado este mes" en el badge del Hero (mes calendario actual)
        actualizarHeroBadgeCobradoMes();

        // 6. Actualizar el Resumen Estadístico con el timeframe por defecto (Mensual)
        actualizarResumenEstadistico(state.currentTimeframe);

        // 7. Renderizar lista de Movimientos Recientes
        renderizarMovimientosRecientes();

    } catch (err) {
        console.warn('Error al cargar datos desde Supabase, activando fallback:', err);
        cargarPerfilUsuario();
        cargarDatasetDemo();
        renderTotalBalance(state.totalDeudaActiva);
        actualizarHeroBadgeCobradoMes();
        actualizarResumenEstadistico(state.currentTimeframe);
        renderizarMovimientosRecientes();
    }
}

function cargarDatasetDemo() {
    state.isDemoFallback = true;
    const now = new Date();
    
    // Generar fechas recientes coherentes para demo
    const haceHoras = (h) => new Date(now.getTime() - h * 3600000).toISOString();
    const haceDias = (d) => new Date(now.getTime() - d * 86400000).toISOString();

    state.clientes = [
        { id_clie: 1, Nombre: 'María Fernández', Deuda_Activa: 2400.00 },
        { id_clie: 2, Nombre: 'Carlos Mendoza', Deuda_Activa: 1850.50 },
        { id_clie: 3, Nombre: 'Juan Rodríguez', Deuda_Activa: 1200.00 },
        { id_clie: 4, Nombre: 'Sofía Romero', Deuda_Activa: 873.99 }
    ];
    state.totalDeudaActiva = 6324.49;

    state.pagos = [
        { id_pago: 1, Monto: 1500.00, Categoria: 'Abono en efectivo', Creado: haceHoras(2) },
        { id_pago: 2, Monto: 850.00, Categoria: 'Transferencia bancaria', Creado: haceHoras(6) },
        { id_pago: 3, Monto: 1200.00, Categoria: 'Cobro por tarjeta', Creado: haceDias(2) },
        { id_pago: 4, Monto: 650.50, Categoria: 'Abono parcial', Creado: haceDias(4) },
        { id_pago: 5, Monto: 2100.00, Categoria: 'Cancelación total', Creado: haceDias(10) },
        { id_pago: 6, Monto: 950.00, Categoria: 'Abono mensual', Creado: haceDias(18) }
    ];

    state.deudas = [
        { id_deuda: 1, Monto: 2400.00, Categoria: 'Venta mercadería', Creado: haceHoras(4) },
        { id_deuda: 2, Monto: 1850.50, Categoria: 'Crédito en cuotas', Creado: haceDias(1) },
        { id_deuda: 3, Monto: 1200.00, Categoria: 'Servicios', Creado: haceDias(3) },
        { id_deuda: 4, Monto: 3100.00, Categoria: 'Pedido mayorista', Creado: haceDias(12) }
    ];
}

async function cargarPerfilUsuario() {
    let photo = (localStorage.getItem('UserPhoto') || '').toString().trim();
    let userName = (localStorage.getItem('UserName') || '').toString().trim();

    // Si aún no están en localStorage, recuperarlos de la sesión activa de Supabase Auth
    if (!photo || !userName) {
        try {
            const clientAuth = await loadSupaBseWithAuth();
            const { data: { session } } = await clientAuth.auth.getSession();
            if (session?.user) {
                const meta = session.user.user_metadata || {};
                const identity0 = Array.isArray(session.user.identities)
                    ? session.user.identities[0]?.identity_data
                    : null;

                if (!userName) {
                    userName = (meta.full_name || meta.name || meta.user_name || meta.username || session.user.email || '').toString().trim();
                    if (userName) localStorage.setItem('UserName', userName);
                }

                if (!photo) {
                    // Google OAuth guarda la foto en avatar_url o picture
                    photo = (meta.avatar_url || meta.picture || identity0?.avatar_url || identity0?.picture || '').toString().trim();
                    if (photo) localStorage.setItem('UserPhoto', photo);
                }
            }
        } catch (e) {
            console.warn('No se pudo obtener la sesión auth para el perfil:', e);
        }
    }

    // Actualizar nombre en el header
    const nameEl = document.getElementById('user_display_name');
    if (nameEl) nameEl.textContent = userName || 'Mi Negocio';

    // Actualizar iniciales del fallback
    const initialsEl = document.getElementById('header_avatar_initials');
    if (initialsEl) {
        initialsEl.textContent = (userName || 'D').trim().charAt(0).toUpperCase();
    }

    // Asignar la foto — el onload/onerror del HTML maneja la visibilidad
    const pfpEl = document.getElementById('pfp');
    const fallbackEl = document.getElementById('header_avatar_fallback');

    if (pfpEl) {
        if (photo) {
            // Forzar tamaño mayor en URLs de Google (=s96-c → =s128-c)
            const photoUrl = photo.replace(/=s\d+-c$/, '=s128-c').replace(/=s\d+$/, '=s128');
            pfpEl.src = photoUrl;
            // La visibilidad la controlará onload: si carga → muestra img, si falla → muestra fallback
        } else {
            // Sin foto: mostrar fallback directamente
            pfpEl.removeAttribute('src');
            pfpEl.style.display = 'none';
            if (fallbackEl) fallbackEl.style.display = 'flex';
        }
    }
}

function renderTotalBalance(monto) {
    const formatted = formatCurrency(monto);
    const parts = formatted.split(',');
    const balanceIntEl = document.getElementById('balance_integer');
    const balanceCentsEl = document.getElementById('balance_cents');

    if (balanceIntEl && balanceCentsEl && parts.length === 2) {
        balanceIntEl.textContent = parts[0];
        balanceCentsEl.textContent = `,${parts[1]}`;
    } else if (balanceIntEl) {
        balanceIntEl.textContent = formatted;
        if (balanceCentsEl) balanceCentsEl.textContent = '';
    }
}

// -------------------------------------------------------------
// Indicador Hero: "Cobrado este mes" (Mes Calendario Actual)
// -------------------------------------------------------------
function actualizarHeroBadgeCobradoMes() {
    const badgeEl = document.getElementById('hero_badge_text');
    if (!badgeEl) return;

    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);

    // Filtrar pagos que pertenezcan estrictamente al mes en curso
    const pagosMesActual = state.pagos.filter(p => {
        const fecha = new Date(p.Creado);
        return fecha >= startOfCurrentMonth && fecha < endOfCurrentMonth;
    });

    const totalCobradoMes = pagosMesActual.reduce((acc, p) => acc + (Number(p.Monto) || 0), 0);
    badgeEl.textContent = `+ ${formatCurrency(totalCobradoMes)} Cobrado este mes`;
}

// -------------------------------------------------------------
// Control y Alternancia del Resumen Estadístico (Mensual, Semanal, Diario)
// -------------------------------------------------------------
function initTimeframeSwitchers() {
    const pills = document.querySelectorAll('.timeframe-pill');
    pills.forEach(pill => {
        pill.addEventListener('click', () => {
            if (pill.classList.contains('active')) return;

            pills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            const timeframe = pill.getAttribute('data-timeframe') || 'mensual';
            state.currentTimeframe = timeframe;
            actualizarResumenEstadistico(timeframe);
        });
    });
}

function actualizarResumenEstadistico(timeframe) {
    const now = new Date();
    let startDate, endDate, prevStartDate, prevEndDate;
    let subtitleText = '';
    let secLabelText = '';
    let binLabels = [];
    let numBins = 5;

    if (timeframe === 'diario') {
        subtitleText = 'Movimientos del día de hoy';
        secLabelText = 'Deudas de Hoy';

        // Hoy desde las 00:00:00 hasta 23:59:59
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        // Período previo: Ayer
        prevStartDate = new Date(startDate.getTime() - 86400000);
        prevEndDate = new Date(endDate.getTime() - 86400000);

        // 6 Intervalos de 4 horas: 00-04h, 04-08h, 08-12h, 12-16h, 16-20h, 20-24h
        numBins = 6;
        binLabels = ['04h', '08h', '12h', '16h', '20h', '24h'];

    } else if (timeframe === 'semanal') {
        subtitleText = 'Comportamiento de los últimos 7 días';
        secLabelText = 'Deudas de la Semana';

        // Últimos 7 días
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        startDate = new Date(endDate.getTime() - 7 * 86400000);

        // Período previo: 7 días anteriores
        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - 7 * 86400000);

        // 7 días
        numBins = 7;
        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        binLabels = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(endDate.getTime() - i * 86400000);
            binLabels.push(diasSemana[d.getDay()]);
        }

    } else { // 'mensual' por defecto
        subtitleText = 'Comportamiento financiero del mes actual';
        secLabelText = 'Deudas del Mes';

        // Mes actual completo
        startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        // Mes anterior completo
        prevStartDate = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
        prevEndDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

        numBins = 5; // 5 semanas / segmentos del mes
        binLabels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Fin'];
    }

    // Actualizar subtítulo descriptivo
    const subEl = document.getElementById('timeframe_subtitle');
    if (subEl) subEl.textContent = subtitleText;

    // Filtrar Pagos en el período actual y en el período anterior
    const pagosPeriodo = state.pagos.filter(p => {
        const d = new Date(p.Creado);
        return d >= startDate && d <= endDate;
    });

    const pagosPrevios = state.pagos.filter(p => {
        const d = new Date(p.Creado);
        return d >= prevStartDate && d <= prevEndDate;
    });

    // Filtrar Deudas en el período actual
    const deudasPeriodo = state.deudas.filter(d => {
        const f = new Date(d.Creado);
        return f >= startDate && f <= endDate;
    });

    const totalCobros = pagosPeriodo.reduce((acc, p) => acc + (Number(p.Monto) || 0), 0);
    const totalCobrosPrevios = pagosPrevios.reduce((acc, p) => acc + (Number(p.Monto) || 0), 0);
    const totalDeudas = deudasPeriodo.reduce((acc, d) => acc + (Number(d.Monto) || 0), 0);

    // 1. Tarjeta Métrica: Cobros Recibidos
    const cobrosValEl = document.getElementById('metric_cobros_total');
    if (cobrosValEl) cobrosValEl.textContent = formatCurrency(totalCobros);

    const cobrosTagEl = document.getElementById('metric_cobros_tag');
    if (cobrosTagEl) {
        if (totalCobrosPrevios > 0) {
            const diffPct = Math.round(((totalCobros - totalCobrosPrevios) / totalCobrosPrevios) * 100);
            if (diffPct >= 0) {
                cobrosTagEl.className = 'metric-tag positive';
                cobrosTagEl.textContent = `▲ +${diffPct}% vs anterior`;
            } else {
                cobrosTagEl.className = 'metric-tag negative';
                cobrosTagEl.textContent = `▼ ${diffPct}% vs anterior`;
            }
        } else if (totalCobros > 0) {
            cobrosTagEl.className = 'metric-tag positive';
            cobrosTagEl.textContent = `▲ Nuevo récord`;
        } else {
            cobrosTagEl.className = 'metric-tag neutral';
            cobrosTagEl.textContent = `● Sin cobros`;
        }
    }

    // 2. Tarjeta Métrica Secundaria: Deudas Emitidas
    const secLabelEl = document.getElementById('metric_secundaria_label');
    if (secLabelEl) secLabelEl.textContent = secLabelText;

    const secValEl = document.getElementById('metric_secundaria_val');
    if (secValEl) secValEl.textContent = formatCurrency(totalDeudas);

    const secTagEl = document.getElementById('metric_secundaria_tag');
    if (secTagEl) {
        secTagEl.textContent = `${deudasPeriodo.length} registros`;
    }

    // 3. Generar distribución por bines para la curva Neón y las mini-barras
    const binDuration = (endDate.getTime() - startDate.getTime()) / numBins;
    const binsCobros = new Array(numBins).fill(0);
    const binsDeudas = new Array(numBins).fill(0);

    pagosPeriodo.forEach(p => {
        const t = new Date(p.Creado).getTime();
        const index = Math.min(numBins - 1, Math.max(0, Math.floor((t - startDate.getTime()) / binDuration)));
        binsCobros[index] += (Number(p.Monto) || 0);
    });

    deudasPeriodo.forEach(d => {
        const t = new Date(d.Creado).getTime();
        const index = Math.min(numBins - 1, Math.max(0, Math.floor((t - startDate.getTime()) / binDuration)));
        binsDeudas[index] += (Number(d.Monto) || 0);
    });

    // 4. Actualizar Mini Barras
    actualizarMiniBarras('metric_cobros_bars', binsCobros);
    actualizarMiniBarras('metric_secundaria_bars', binsDeudas);

    // 5. Dibujar Curva Neón SVG Dinámica
    dibujarCurvaNeonSvg(binsCobros, binLabels);
}

function actualizarMiniBarras(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const maxVal = Math.max(...values, 1);
    container.innerHTML = values.map(val => {
        const heightPct = val > 0 ? Math.max(25, Math.round((val / maxVal) * 100)) : 18;
        const isActive = val === maxVal && val > 0;
        return `<div class="mini-bar ${isActive ? 'active' : ''}" style="height: ${heightPct}%;" title="${formatCurrency(val)}"></div>`;
    }).join('');
}

function dibujarCurvaNeonSvg(values, labels) {
    const glowPath = document.getElementById('chart_glow_path');
    const areaPath = document.getElementById('chart_area_path');
    const nodesGroup = document.getElementById('chart_nodes_group');
    if (!glowPath || !areaPath) return;

    const width = 320;
    const height = 120;
    const padX = 15;
    const padTop = 25;
    const padBottom = 100;
    const availableW = width - (padX * 2);
    const stepX = availableW / (values.length - 1);

    const maxVal = Math.max(...values, 1);

    // Coordenadas calculadas
    const points = values.map((val, i) => {
        const x = Math.round(padX + i * stepX);
        // Si no hay valores, se crea una ondulación suave sutil
        const ratio = val > 0 ? (val / maxVal) : 0.08;
        const y = Math.round(padBottom - (ratio * (padBottom - padTop)));
        return { x, y, val, label: labels[i] || '' };
    });

    // Generar línea suavizada Bézier (curva cúbica fluida)
    let d = `M ${points[0].x},${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const midX = (p0.x + p1.x) / 2;
        d += ` C ${midX},${p0.y} ${midX},${p1.y} ${p1.x},${p1.y}`;
    }

    const areaD = `${d} L ${points[points.length - 1].x},${height} L ${points[0].x},${height} Z`;

    glowPath.setAttribute('d', d);
    areaPath.setAttribute('d', areaD);

    // Crear nodos interactivos en puntos destacados
    if (nodesGroup) {
        nodesGroup.innerHTML = points.map((p, idx) => {
            const isHighest = p.val === maxVal && p.val > 0;
            const r = isHighest ? 5 : (idx === points.length - 1 ? 4.5 : 3.5);
            return `
                <circle cx="${p.x}" cy="${p.y}" r="${r}" 
                    fill="${isHighest ? '#ffffff' : '#ccff00'}" 
                    stroke="#0a0c0f" stroke-width="2.5" 
                    title="${p.label}: ${formatCurrency(p.val)}"
                    style="cursor: pointer; transition: transform 0.2s;" />
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// Movimientos Recientes
// -------------------------------------------------------------
function renderizarMovimientosRecientes() {
    const listContainer = document.getElementById('lista_movimientos_recientes');
    if (!listContainer) return;

    let items = [];
    state.deudas.forEach(d => items.push({ ...d, tipo: 'deuda', fecha: new Date(d.Creado) }));
    state.pagos.forEach(p => items.push({ ...p, tipo: 'pago', fecha: new Date(p.Creado) }));

    items.sort((a, b) => b.fecha - a.fecha);

    if (items.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 24px; color: var(--text-secondary); font-size: 0.85rem;">
                No hay movimientos registrados recientemente.
            </div>
        `;
        return;
    }

    listContainer.innerHTML = items.slice(0, 5).map(item => {
        const isPago = item.tipo === 'pago';
        const inicial = (item.Categoria || (isPago ? 'P' : 'D')).charAt(0).toUpperCase();
        const titulo = item.Categoria || (isPago ? 'Pago recibido' : 'Deuda registrada');
        const fechaTxt = item.fecha ? item.fecha.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' }) : 'Reciente';
        const sign = isPago ? '+' : '-';
        const amountClass = isPago ? 'positive' : 'negative';

        return `
            <div class="tx-item" onclick="if(window.spaNavigate){window.spaNavigate('/Plantillas_Renovadas/Operacion_renov.html');}else{window.location.href='/Plantillas_Renovadas/Operacion_renov.html';}">
                <div class="tx-icon-wrap" style="${isPago ? 'color: var(--brand-volt); border-color: rgba(204,255,0,0.3);' : ''}">
                    ${inicial}
                </div>
                <div class="tx-info">
                    <div class="tx-name">${titulo}</div>
                    <div class="tx-sub">${isPago ? 'Abono de Cliente' : 'Cargo a Cliente'} • ${fechaTxt}</div>
                </div>
                <div class="tx-amount ${amountClass}">
                    ${sign} ${formatCurrency(item.monto || item.Monto)}
                </div>
            </div>
        `;
    }).join('');
}

// Accesos globales
const navHelper = (url) => {
    if (typeof window.spaNavigate === 'function') {
        window.spaNavigate(url);
    } else {
        window.location.href = url;
    }
};

window.irAOperacion = (tipo = 'deuda') => {
    navHelper(`/Plantillas_Renovadas/Operacion_renov.html?tipo=${tipo}`);
};
window.irAClientes = () => {
    navHelper('/Plantillas_Renovadas/Clientes_renov.html');
};
window.irAEstadisticas = () => {
    navHelper('/Plantillas_Renovadas/Estadisticas_renov.html');
};
window.irAConfiguracion = () => {
    navHelper('/Plantillas_Renovadas/Config_renov.html');
};
