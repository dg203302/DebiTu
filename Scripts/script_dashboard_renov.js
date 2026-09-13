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
    chartSeries: 'comparativa', // 'comparativa' | 'cobros' | 'deudas'
    isDemoFallback: false
};

export async function initDashboard() {
    showAppLoader('Sincronizando finanzas...');
    try {
        initTimeframeSwitchers();
        initSeriesSwitchers();
        initInteractiveMetricCards();
        initChartResizeListener();
        initChartInteraction();
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

        // 4. Calcular Deuda Total Activa (Suma de Deuda_Activa de todos los clientes)
        state.totalDeudaActiva = state.clientes.reduce((acc, c) => acc + (Number(c.Deuda_Activa) || 0), 0);
        renderTotalBalance(state.totalDeudaActiva);

        const activeClientsEl = document.getElementById('metric_active_clients_num');
        if (activeClientsEl) activeClientsEl.textContent = state.clientes.length;

        // 5. Calcular e indicar "Cobrado este mes" en el badge del Hero (mes calendario actual)
        actualizarHeroBadgeCobradoMes();

        // 6. Actualizar el Resumen Estadístico con el timeframe por defecto (Mensual)
        actualizarResumenEstadistico(state.currentTimeframe);

        // 7. Renderizar lista de Movimientos Recientes
        renderizarMovimientosRecientes();

    } catch (err) {
        console.warn('Error al cargar datos desde Supabase:', err);
        cargarPerfilUsuario();
        state.clientes = [];
        state.deudas = [];
        state.pagos = [];
        state.totalDeudaActiva = 0;
        renderTotalBalance(0);
        const activeClientsFallbackEl = document.getElementById('metric_active_clients_num');
        if (activeClientsFallbackEl) activeClientsFallbackEl.textContent = 0;
        actualizarHeroBadgeCobradoMes();
        actualizarResumenEstadistico(state.currentTimeframe);
        renderizarMovimientosRecientes();
    }
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

    // Actualizar nombre en el header y sidebar
    const nameEls = document.querySelectorAll('#user_display_name, .desktop-profile-name');
    nameEls.forEach(el => { el.textContent = userName || 'Mi Negocio'; });

    // Actualizar iniciales del fallback
    const initialsEls = document.querySelectorAll('#header_avatar_initials');
    initialsEls.forEach(el => {
        el.textContent = (userName || 'D').trim().charAt(0).toUpperCase();
    });

    // Asignar y mostrar la foto de perfil
    const pfpEl = document.getElementById('pfp');
    const fallbackEl = document.getElementById('header_avatar_fallback');

    if (pfpEl) {
        if (photo && photo.trim()) {
            let photoUrl = photo.trim();
            // Forzar mayor resolución en avatars de Google (=s96-c → =s128-c)
            if (photoUrl.includes('googleusercontent.com')) {
                photoUrl = photoUrl.replace(/=s\d+-c$/, '=s128-c').replace(/=s\d+$/, '=s128');
            }
            pfpEl.onload = () => {
                pfpEl.style.display = 'block';
                if (fallbackEl) fallbackEl.style.display = 'none';
            };
            pfpEl.onerror = () => {
                pfpEl.style.display = 'none';
                if (fallbackEl) fallbackEl.style.display = 'flex';
            };
            pfpEl.src = photoUrl;
            pfpEl.style.display = 'block';
            if (fallbackEl) fallbackEl.style.display = 'none';
        } else {
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

function initSeriesSwitchers() {
    const btns = document.querySelectorAll('.chart-series-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', () => {
            const series = btn.getAttribute('data-series') || 'comparativa';
            setChartSeries(series);
        });
    });
}

function setChartSeries(series) {
    state.chartSeries = series;
    document.querySelectorAll('.chart-series-btn').forEach(b => {
        if (b.getAttribute('data-series') === series) {
            b.classList.add('active');
        } else {
            b.classList.remove('active');
        }
    });

    const cardCobros = document.getElementById('card_metric_cobros');
    const cardDeudas = document.getElementById('card_metric_deudas');
    if (cardCobros) {
        if (series === 'cobros') cardCobros.classList.add('selected-cobros');
        else cardCobros.classList.remove('selected-cobros');
    }
    if (cardDeudas) {
        if (series === 'deudas') cardDeudas.classList.add('selected-deudas');
        else cardDeudas.classList.remove('selected-deudas');
    }

    if (_ultimoChartData && typeof dibujarCurvaNeonSvg === 'function') {
        dibujarCurvaNeonSvg(
            _ultimoChartData.binsCobros,
            _ultimoChartData.binsDeudas,
            _ultimoChartData.binLabels,
            _ultimoChartData.binDetails
        );
    }
}

function initInteractiveMetricCards() {
    const cardCobros = document.getElementById('card_metric_cobros');
    const cardDeudas = document.getElementById('card_metric_deudas');

    if (cardCobros) {
        cardCobros.addEventListener('click', () => {
            if (state.chartSeries === 'cobros') {
                setChartSeries('comparativa');
            } else {
                setChartSeries('cobros');
            }
        });
    }

    if (cardDeudas) {
        cardDeudas.addEventListener('click', () => {
            if (state.chartSeries === 'deudas') {
                setChartSeries('comparativa');
            } else {
                setChartSeries('deudas');
            }
        });
    }
}

function actualizarResumenEstadistico(timeframe) {
    const now = new Date();
    let startDate, endDate, prevStartDate, prevEndDate;
    let subtitleText = '';
    let secLabelText = '';
    let binLabels = [];
    let binDetails = [];
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

        // 6 Intervalos de 4 horas
        numBins = 6;
        binLabels = ['04h', '08h', '12h', '16h', '20h', '24h'];
        binDetails = [
            '00:00 a 04:00 hs',
            '04:00 a 08:00 hs',
            '08:00 a 12:00 hs',
            '12:00 a 16:00 hs',
            '16:00 a 20:00 hs',
            '20:00 a 24:00 hs'
        ];

    } else if (timeframe === 'semanal') {
        subtitleText = 'Comportamiento de los últimos 7 días';
        secLabelText = 'Deudas de la Semana';

        numBins = 7;
        binLabels = [];
        binDetails = [];
        const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        startDate = new Date(startOfToday.getTime() - 6 * 86400000);
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

        prevEndDate = new Date(startDate.getTime() - 1);
        prevStartDate = new Date(prevEndDate.getTime() - 7 * 86400000);

        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate.getTime() + i * 86400000);
            const diaTxt = diasSemana[d.getDay()];
            const numTxt = String(d.getDate()).padStart(2, '0');
            binLabels.push(`${diaTxt} ${numTxt}`);
            binDetails.push(`${diaTxt} ${numTxt} de ${d.toLocaleDateString('es-AR', { month: 'short' })}`);
        }

    } else { // 'mensual' por defecto
        subtitleText = 'Comportamiento financiero del mes actual';
        secLabelText = 'Deudas del Mes';

        const mesNombre = now.toLocaleDateString('es-AR', { month: 'short' });
        const year = now.getFullYear();
        const month = now.getMonth();
        const diasEnMes = new Date(year, month + 1, 0).getDate();

        // Mes actual completo
        startDate = new Date(year, month, 1, 0, 0, 0, 0);
        endDate = new Date(year, month, diasEnMes, 23, 59, 59, 999);

        // Mes anterior completo
        const diasEnMesPrev = new Date(year, month, 0).getDate();
        prevStartDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
        prevEndDate = new Date(year, month - 1, diasEnMesPrev, 23, 59, 59, 999);

        numBins = 5;
        binLabels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4', 'Fin'];
        binDetails = [
            `1 al 7 de ${mesNombre}`,
            `8 al 14 de ${mesNombre}`,
            `15 al 21 de ${mesNombre}`,
            `22 al 28 de ${mesNombre}`,
            `29 al ${diasEnMes} de ${mesNombre}`
        ];
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
    const binsCobros = new Array(numBins).fill(0);
    const binsDeudas = new Array(numBins).fill(0);

    if (timeframe === 'mensual') {
        pagosPeriodo.forEach(p => {
            const day = new Date(p.Creado).getDate();
            let idx = 0;
            if (day <= 7) idx = 0;
            else if (day <= 14) idx = 1;
            else if (day <= 21) idx = 2;
            else if (day <= 28) idx = 3;
            else idx = 4;
            binsCobros[idx] += (Number(p.Monto) || 0);
        });

        deudasPeriodo.forEach(d => {
            const day = new Date(d.Creado).getDate();
            let idx = 0;
            if (day <= 7) idx = 0;
            else if (day <= 14) idx = 1;
            else if (day <= 21) idx = 2;
            else if (day <= 28) idx = 3;
            else idx = 4;
            binsDeudas[idx] += (Number(d.Monto) || 0);
        });
    } else if (timeframe === 'semanal') {
        pagosPeriodo.forEach(p => {
            const d = new Date(p.Creado);
            const diffDays = Math.floor((d.getTime() - startDate.getTime()) / 86400000);
            const idx = Math.min(6, Math.max(0, diffDays));
            binsCobros[idx] += (Number(p.Monto) || 0);
        });

        deudasPeriodo.forEach(d => {
            const f = new Date(d.Creado);
            const diffDays = Math.floor((f.getTime() - startDate.getTime()) / 86400000);
            const idx = Math.min(6, Math.max(0, diffDays));
            binsDeudas[idx] += (Number(d.Monto) || 0);
        });
    } else { // 'diario'
        pagosPeriodo.forEach(p => {
            const hour = new Date(p.Creado).getHours();
            const idx = Math.min(5, Math.floor(hour / 4));
            binsCobros[idx] += (Number(p.Monto) || 0);
        });

        deudasPeriodo.forEach(d => {
            const hour = new Date(d.Creado).getHours();
            const idx = Math.min(5, Math.floor(hour / 4));
            binsDeudas[idx] += (Number(d.Monto) || 0);
        });
    }

    // 4. Actualizar Mini Barras
    actualizarMiniBarras('metric_cobros_bars', binsCobros);
    actualizarMiniBarras('metric_secundaria_bars', binsDeudas);

    // 5. Dibujar Curva Neón SVG Dinámica & Dual
    dibujarCurvaNeonSvg(binsCobros, binsDeudas, binLabels, binDetails);
}

function actualizarMiniBarras(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const realMax = Math.max(...values, 0);
    container.innerHTML = values.map(val => {
        if (realMax > 0 && val > 0) {
            const heightPct = Math.max(20, Math.round((val / realMax) * 100));
            const isActive = val === realMax;
            return `<div class="mini-bar ${isActive ? 'active' : ''}" style="height: ${heightPct}%;" title="${formatCurrency(val)}"></div>`;
        } else {
            return `<div class="mini-bar" style="height: 6%; opacity: 0.25;" title="${formatCurrency(val)}"></div>`;
        }
    }).join('');
}

let _ultimoChartData = null;
let _chartPointsInfo = null;

function initChartResizeListener() {
    if (window._chartResizeAttached) return;
    window._chartResizeAttached = true;
    window.addEventListener('resize', () => {
        clearTimeout(window._chartResizeDebounce);
        window._chartResizeDebounce = setTimeout(() => {
            if (_ultimoChartData && typeof dibujarCurvaNeonSvg === 'function') {
                dibujarCurvaNeonSvg(
                    _ultimoChartData.binsCobros,
                    _ultimoChartData.binsDeudas,
                    _ultimoChartData.binLabels,
                    _ultimoChartData.binDetails
                );
            }
        }, 120);
    });
}

function formatCompactCurrency(amount) {
    const val = Number(amount) || 0;
    if (val >= 1000000) {
        return '$' + (val / 1000000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M';
    }
    if (val >= 1000) {
        return '$' + (val / 1000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'k';
    }
    return '$' + Math.round(val);
}

function buildSmoothBezierPath(pts) {
    if (!pts || pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
    let d = `M ${pts[0].x},${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const midX = (p0.x + p1.x) / 2;
        d += ` C ${midX},${p0.y} ${midX},${p1.y} ${p1.x},${p1.y}`;
    }
    return d;
}

function dibujarCurvaNeonSvg(binsCobros, binsDeudas, binLabels, binDetails) {
    const glowPathCobros = document.getElementById('chart_glow_path');
    const areaPathCobros = document.getElementById('chart_area_path');
    const glowPathDeudas = document.getElementById('chart_glow_deuda_path');
    const areaPathDeudas = document.getElementById('chart_area_deuda_path');
    const nodesGroupCobros = document.getElementById('chart_nodes_group');
    const nodesGroupDeudas = document.getElementById('chart_nodes_deuda_group');
    const gridGroup = document.getElementById('chart_grid_group');
    const labelsGroup = document.getElementById('chart_labels_group');
    const crosshairGroup = document.getElementById('chart_crosshair_group');
    const svgEl = document.getElementById('chart_svg');

    if (!glowPathCobros || !areaPathCobros || !svgEl) return;

    // Cachear datos
    _ultimoChartData = { binsCobros, binsDeudas, binLabels, binDetails };

    // Limpiar crosshair activo al redibujar
    if (crosshairGroup) crosshairGroup.innerHTML = '';

    // Medir dimensiones físicas reales
    const rect = svgEl.getBoundingClientRect();
    const parent = svgEl.parentElement;
    const parentRect = parent ? parent.getBoundingClientRect() : null;

    let width = Math.round(rect.width || (parentRect ? parentRect.width : 0));
    let height = Math.round(rect.height || (parentRect ? parentRect.height : 0));

    if (!width || width < 120) {
        width = window.innerWidth >= 1024 ? 800 : 340;
    }
    if (!height || height < 60) {
        height = window.innerWidth >= 1024 ? 170 : 130;
    }

    svgEl.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svgEl.removeAttribute('preserveAspectRatio');

    const hasLabels = Array.isArray(binLabels) && binLabels.length > 0;
    const padX = Math.min(36, Math.max(18, Math.round(width * 0.04)));
    const padTop = Math.max(22, Math.round(height * 0.16));
    const padBottom = hasLabels 
        ? Math.max(height - 28, Math.round(height * 0.78))
        : Math.max(height - 18, Math.round(height * 0.85));

    const availableW = width - (padX * 2);
    const numPoints = Math.max(binsCobros.length, 1);
    const stepX = numPoints > 1 ? (availableW / (numPoints - 1)) : availableW;

    const maxCobro = Math.max(...binsCobros, 0);
    const maxDeuda = Math.max(...binsDeudas, 0);
    let realMax = Math.max(maxCobro, maxDeuda, 0);

    const showCobros = state.chartSeries === 'comparativa' || state.chartSeries === 'cobros';
    const showDeudas = state.chartSeries === 'comparativa' || state.chartSeries === 'deudas';

    if (state.chartSeries === 'cobros') realMax = maxCobro;
    if (state.chartSeries === 'deudas') realMax = maxDeuda;

    const hasData = realMax > 0;

    // Líneas de guía horizontales con valores de escala monetaria
    if (gridGroup) {
        const gridY1 = Math.round(padTop);
        const gridY2 = Math.round((padTop + padBottom) / 2);
        const topLabel = hasData ? formatCompactCurrency(realMax) : '$0';
        const midLabel = hasData ? formatCompactCurrency(realMax / 2) : '';

        gridGroup.innerHTML = `
            <line x1="${padX}" y1="${gridY1}" x2="${width - padX}" y2="${gridY1}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="3,3" />
            <text x="${width - padX}" y="${gridY1 - 4}" text-anchor="end" fill="rgba(255,255,255,0.22)" font-size="9" font-family="monospace">${topLabel}</text>
            <line x1="${padX}" y1="${gridY2}" x2="${width - padX}" y2="${gridY2}" stroke="rgba(255,255,255,0.06)" stroke-width="1" stroke-dasharray="3,3" />
            ${midLabel ? `<text x="${width - padX}" y="${gridY2 - 4}" text-anchor="end" fill="rgba(255,255,255,0.22)" font-size="9" font-family="monospace">${midLabel}</text>` : ''}
            <line x1="${padX}" y1="${padBottom}" x2="${width - padX}" y2="${padBottom}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />
            <text x="${width - padX}" y="${padBottom - 4}" text-anchor="end" fill="rgba(255,255,255,0.22)" font-size="9" font-family="monospace">$0</text>
        `;
    }

    // Coordenadas calculadas
    const pointsCobros = binsCobros.map((val, i) => {
        const x = Math.round(padX + i * stepX);
        let ratio = (hasData && realMax > 0) ? (val / realMax) : 0;
        ratio = Math.max(0, Math.min(1, ratio));
        const y = hasData ? Math.round(padBottom - (ratio * (padBottom - padTop))) : padBottom;
        return { x, y, val, label: binLabels[i], detail: binDetails[i] };
    });

    const pointsDeudas = binsDeudas.map((val, i) => {
        const x = Math.round(padX + i * stepX);
        let ratio = (hasData && realMax > 0) ? (val / realMax) : 0;
        ratio = Math.max(0, Math.min(1, ratio));
        const y = hasData ? Math.round(padBottom - (ratio * (padBottom - padTop))) : padBottom;
        return { x, y, val, label: binLabels[i], detail: binDetails[i] };
    });

    // Guardar información para interacción de cursor / toque
    _chartPointsInfo = {
        pointsCobros,
        pointsDeudas,
        binsCobros,
        binsDeudas,
        binLabels,
        binDetails,
        padX,
        padBottom,
        stepX,
        width,
        height
    };

    // 1. RENDERIZAR SERIE DE DEUDAS (Coral Neón)
    if (showDeudas && glowPathDeudas && areaPathDeudas) {
        glowPathDeudas.style.opacity = '1';
        areaPathDeudas.style.opacity = '1';

        if (maxDeuda > 0) {
            const dDeudas = buildSmoothBezierPath(pointsDeudas);
            const areaDDeudas = `${dDeudas} L ${pointsDeudas[pointsDeudas.length - 1].x},${height} L ${pointsDeudas[0].x},${height} Z`;
            glowPathDeudas.setAttribute('d', dDeudas);
            glowPathDeudas.style.strokeDasharray = 'none';
            areaPathDeudas.setAttribute('d', areaDDeudas);

            if (nodesGroupDeudas) {
                nodesGroupDeudas.innerHTML = pointsDeudas.map(p => {
                    const isMax = p.val === maxDeuda && maxDeuda > 0;
                    const r = isMax ? 5 : 3.5;
                    const fill = isMax ? '#ffffff' : '#ff4d4f';
                    return `
                        <circle cx="${p.x}" cy="${p.y}" r="${r}" 
                            fill="${fill}" 
                            stroke="#0a0c0f" stroke-width="2" 
                            style="cursor: pointer;" />
                    `;
                }).join('');
            }
        } else {
            glowPathDeudas.setAttribute('d', `M ${pointsDeudas[0].x},${padBottom} L ${pointsDeudas[pointsDeudas.length - 1].x},${padBottom}`);
            glowPathDeudas.style.strokeDasharray = '3,3';
            glowPathDeudas.style.stroke = 'rgba(255, 77, 79, 0.3)';
            areaPathDeudas.setAttribute('d', '');
            if (nodesGroupDeudas) nodesGroupDeudas.innerHTML = '';
        }
    } else if (glowPathDeudas && areaPathDeudas) {
        glowPathDeudas.style.opacity = '0';
        areaPathDeudas.style.opacity = '0';
        if (nodesGroupDeudas) nodesGroupDeudas.innerHTML = '';
    }

    // 2. RENDERIZAR SERIE DE COBROS (Volt Neón)
    if (showCobros) {
        glowPathCobros.style.opacity = '1';
        areaPathCobros.style.opacity = '1';

        if (maxCobro > 0) {
            const dCobros = buildSmoothBezierPath(pointsCobros);
            const areaDCobros = `${dCobros} L ${pointsCobros[pointsCobros.length - 1].x},${height} L ${pointsCobros[0].x},${height} Z`;
            glowPathCobros.setAttribute('d', dCobros);
            glowPathCobros.style.stroke = '#ccff00';
            glowPathCobros.style.strokeDasharray = 'none';
            areaPathCobros.setAttribute('d', areaDCobros);

            if (nodesGroupCobros) {
                nodesGroupCobros.innerHTML = pointsCobros.map(p => {
                    const isMax = p.val === maxCobro && maxCobro > 0;
                    const r = isMax ? 5.5 : 4;
                    const fill = isMax ? '#ffffff' : '#ccff00';
                    return `
                        <circle cx="${p.x}" cy="${p.y}" r="${r}" 
                            fill="${fill}" 
                            stroke="#0a0c0f" stroke-width="2" 
                            style="cursor: pointer;" />
                    `;
                }).join('');
            }
        } else {
            glowPathCobros.setAttribute('d', `M ${pointsCobros[0].x},${padBottom} L ${pointsCobros[pointsCobros.length - 1].x},${padBottom}`);
            glowPathCobros.style.strokeDasharray = '4,4';
            glowPathCobros.style.stroke = 'rgba(255,255,255,0.18)';
            areaPathCobros.setAttribute('d', '');
            if (nodesGroupCobros) nodesGroupCobros.innerHTML = '';
        }
    } else {
        glowPathCobros.style.opacity = '0';
        areaPathCobros.style.opacity = '0';
        if (nodesGroupCobros) nodesGroupCobros.innerHTML = '';
    }

    // 3. ETIQUETAS DE TIEMPO
    if (labelsGroup && hasLabels) {
        const textY = Math.min(height - 4, padBottom + 18);
        labelsGroup.innerHTML = pointsCobros.map(p => {
            if (!p.label) return '';
            return `
                <text x="${p.x}" y="${textY}" 
                    text-anchor="middle" 
                    fill="#6c7a9c" 
                    font-size="11" 
                    font-weight="600" 
                    font-family="inherit"
                    style="user-select: none;">
                    ${p.label}
                </text>
            `;
        }).join('');
    }
}

// -------------------------------------------------------------
// Interacción Táctil y con Cursor (Crosshair + Tooltip Flotante)
// -------------------------------------------------------------
function initChartInteraction() {
    const container = document.getElementById('chart_container_el') || document.querySelector('.chart-container');
    const svg = document.getElementById('chart_svg');
    const tooltip = document.getElementById('chart_tooltip');
    if (!container || !svg) return;

    const handlePointer = (e) => {
        if (!_chartPointsInfo) return;
        const crosshairGroup = document.getElementById('chart_crosshair_group');
        const rect = svg.getBoundingClientRect();
        if (rect.width <= 0) return;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const relX = clientX - rect.left;

        const svgW = _chartPointsInfo.width;
        const svgScale = svgW / rect.width;
        const xInSvg = relX * svgScale;

        const { padX, stepX, pointsCobros, pointsDeudas, binDetails, binsCobros, binsDeudas } = _chartPointsInfo;
        const num = pointsCobros.length;
        let closestIdx = Math.round((xInSvg - padX) / stepX);
        closestIdx = Math.max(0, Math.min(num - 1, closestIdx));

        const pCobro = pointsCobros[closestIdx];
        const pDeuda = pointsDeudas[closestIdx];

        if (crosshairGroup) {
            crosshairGroup.innerHTML = `
                <line x1="${pCobro.x}" y1="8" x2="${pCobro.x}" y2="${_chartPointsInfo.padBottom}" 
                    stroke="rgba(255,255,255,0.4)" stroke-width="1.5" stroke-dasharray="3,3" />
                <circle cx="${pCobro.x}" cy="${pCobro.y}" r="6" fill="#ccff00" stroke="#0a0c0f" stroke-width="2.5" />
                <circle cx="${pDeuda.x}" cy="${pDeuda.y}" r="6" fill="#ff4d4f" stroke="#0a0c0f" stroke-width="2.5" />
            `;
        }

        if (tooltip) {
            const titleEl = document.getElementById('chart_tooltip_title');
            const cobrosEl = document.getElementById('chart_tooltip_cobros');
            const deudasEl = document.getElementById('chart_tooltip_deudas');
            const netEl = document.getElementById('chart_tooltip_net');

            if (titleEl) titleEl.textContent = binDetails[closestIdx] || `Período ${closestIdx + 1}`;
            if (cobrosEl) cobrosEl.textContent = formatCurrency(binsCobros[closestIdx]);
            if (deudasEl) deudasEl.textContent = formatCurrency(binsDeudas[closestIdx]);

            const net = binsCobros[closestIdx] - binsDeudas[closestIdx];
            if (netEl) {
                netEl.textContent = (net >= 0 ? '+ ' : '') + formatCurrency(net);
                netEl.className = net >= 0 ? 'positive' : 'negative';
            }

            tooltip.classList.add('visible');

            const containerRect = container.getBoundingClientRect();
            const pixelX = (pCobro.x / svgScale);
            const clampedX = Math.max(85, Math.min(containerRect.width - 85, pixelX));
            tooltip.style.left = `${clampedX}px`;
        }
    };

    const handleLeave = () => {
        const crosshairGroup = document.getElementById('chart_crosshair_group');
        if (crosshairGroup) crosshairGroup.innerHTML = '';
        if (tooltip) tooltip.classList.remove('visible');
    };

    svg.addEventListener('pointermove', handlePointer);
    svg.addEventListener('pointerdown', handlePointer);
    svg.addEventListener('pointerleave', handleLeave);
    svg.addEventListener('touchend', () => setTimeout(handleLeave, 2500));
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
            <div class="tx-item" onclick="window.irAOperacion()">
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
    let finalUrl = url;
    if (window.location.pathname.includes('_desktop')) {
        finalUrl = finalUrl.replace('/Plantillas_Renovadas/', '/Plantillas_Renovadas_Desktop/').replace('.html', '_desktop.html');
    }
    if (typeof window.spaNavigate === 'function') {
        window.spaNavigate(finalUrl);
    } else {
        window.location.href = finalUrl;
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
