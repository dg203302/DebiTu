import { loadSupabase } from './supabase.js';

let supabaseClient = null;
let charts = [];

/* ── Cached raw data ── */
let rawClientes = [];
let rawDeudas = [];
let rawPagos = [];
let selectedMonth = 'all'; // 'all' | 'YYYY-MM'

function getLocalUserId() {
	const raw = localStorage.getItem('UserID');
	if (raw === undefined || raw === null) return null;
	const value = String(raw).trim();
	return value ? value : null;
}

function applyIdNegocioFilter(query) {
	const userId = getLocalUserId();
	if (userId === 'N/A') return query.is('ID_Negocio', null);
	if (!userId) return query.eq('ID_Negocio', '__MISSING_USERID__');
	return query.eq('ID_Negocio', userId);
}

function formatCurrency(value) {
	return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value) || 0);
}

function normalizeDateValue(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function formatMonthLabel(date) {
	return date.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
}

function formatLongDate(value) {
	const date = normalizeDateValue(value);
	if (!date) return 'Sin fecha';
	return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDayLabel(date) {
	return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

async function fetchAllClientes() {
	const { data, error } = await applyIdNegocioFilter(
		supabaseClient
			.from('Clientes')
			.select('*')
	);
	if (error) {
		throw new Error('Error al obtener los clientes: ' + error.message);
	}
	return data || [];
}

async function fetchAllDeudas() {
	const { data, error } = await applyIdNegocioFilter(
		supabaseClient
			.from('Deudas')
			.select('*')
	);
	if (error) {
		throw new Error('Error al obtener las deudas: ' + error.message);
	}
	return data || [];
}

async function fetchAllPagos() {
	const { data, error } = await applyIdNegocioFilter(
		supabaseClient
			.from('Pagos')
			.select('*')
	);
	if (error) {
		throw new Error('Error al obtener los pagos: ' + error.message);
	}
	return data || [];
}

function normalizeMonto(item) {
	const value = item?.Monto ?? item?.monto ?? item?.Amount ?? item?.amount ?? 0;
	const number = Number(value);
	return Number.isFinite(number) ? number : 0;
}

function normalizeFecha(item) {
	const raw = item?.Creado ?? item?.creado ?? item?.fecha ?? item?.created_at ?? item?.updated_at ?? null;
	return normalizeDateValue(raw);
}

function getClienteNombre(cliente) {
	return String(cliente?.Nombre ?? cliente?.nombre ?? cliente?.Cliente ?? cliente?.client ?? cliente?.Telefono ?? cliente?.telefono ?? 'Sin nombre').trim();
}

function getClienteTelefono(cliente) {
	return String(cliente?.Telefono ?? cliente?.telefono ?? '').trim();
}

function getRecordTelefono(record) {
	return String(record?.Telefono_cliente ?? record?.telefono_cliente ?? '').trim();
}

function getMonthKey(date) {
	if (!date) return null;
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/* ── Grouping helpers ── */

function groupByMonth(records) {
	const buckets = new Map();
	for (const record of records) {
		const date = normalizeFecha(record);
		if (!date) continue;
		const key = getMonthKey(date);
		const label = formatMonthLabel(date);
		const current = buckets.get(key) || { label, total: 0, date };
		current.total += normalizeMonto(record);
		current.date = date;
		buckets.set(key, current);
	}
	return Array.from(buckets.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([, entry]) => entry);
}

function groupByDay(records) {
	const buckets = new Map();
	for (const record of records) {
		const date = normalizeFecha(record);
		if (!date) continue;
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
		const label = formatDayLabel(date);
		const current = buckets.get(key) || { label, total: 0, date };
		current.total += normalizeMonto(record);
		current.date = date;
		buckets.set(key, current);
	}
	return Array.from(buckets.entries())
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(([, entry]) => entry);
}

/* ── Filter helpers ── */

function filterByMonth(records, monthKey) {
	if (monthKey === 'all') return records;
	return records.filter((record) => {
		const date = normalizeFecha(record);
		return date && getMonthKey(date) === monthKey;
	});
}

function getUniqueClientPhones(deudas, pagos) {
	const phones = new Set();
	for (const d of deudas) {
		const tel = getRecordTelefono(d);
		if (tel) phones.add(tel);
	}
	for (const p of pagos) {
		const tel = getRecordTelefono(p);
		if (tel) phones.add(tel);
	}
	return phones;
}

/* ── Debt per user for a given set of records ── */

function buildDebtPerUserSeries(clientes, filteredDeudas, filteredPagos, isFiltered) {
	if (!isFiltered) {
		// Global: use Deuda_Activa from Clientes (current snapshot)
		return (clientes || [])
			.map((cliente) => ({
				label: getClienteNombre(cliente),
				value: Number(cliente?.Deuda_Activa ?? cliente?.deuda_activa ?? cliente?.deudaActiva ?? 0) || 0,
			}))
			.sort((a, b) => b.value - a.value);
	}

	// Filtered: sum deudas per client in the filtered period
	const deudaPorCliente = new Map();
	for (const d of filteredDeudas) {
		const tel = getRecordTelefono(d);
		if (!tel) continue;
		deudaPorCliente.set(tel, (deudaPorCliente.get(tel) || 0) + normalizeMonto(d));
	}
	// Also add pagos as negative? No — keep it simple, show deudas only per user
	// Map phone → nombre from clientes
	const phoneToName = new Map();
	for (const c of clientes) {
		const tel = getClienteTelefono(c);
		if (tel) phoneToName.set(tel, getClienteNombre(c));
	}

	return Array.from(deudaPorCliente.entries())
		.map(([tel, total]) => ({
			label: phoneToName.get(tel) || tel,
			value: total,
		}))
		.sort((a, b) => b.value - a.value);
}

/* ── Available months from data ── */

function extractAvailableMonths(deudas, pagos) {
	const monthMap = new Map();
	const allRecords = [...deudas, ...pagos];
	for (const record of allRecords) {
		const date = normalizeFecha(record);
		if (!date) continue;
		const key = getMonthKey(date);
		if (!monthMap.has(key)) {
			monthMap.set(key, {
				key,
				label: date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
				date,
			});
		}
	}
	return Array.from(monthMap.values()).sort((a, b) => a.key.localeCompare(b.key));
}

/* ── Month filter UI ── */

function renderMonthFilter(months) {
	const container = document.getElementById('month_filter');
	if (!container) return;

	// Keep "Todos" pill, remove dynamic pills
	const existing = container.querySelectorAll('.month-pill[data-month]:not([data-month="all"])');
	existing.forEach((el) => el.remove());

	for (const month of months) {
		const pill = document.createElement('button');
		pill.type = 'button';
		pill.className = 'month-pill';
		pill.dataset.month = month.key;
		pill.textContent = month.label;
		if (month.key === selectedMonth) pill.classList.add('active');
		container.appendChild(pill);
	}

	// Mark "Todos" active if needed
	const allPill = container.querySelector('[data-month="all"]');
	if (allPill) {
		allPill.classList.toggle('active', selectedMonth === 'all');
	}

	// Scroll active pill into view
	requestAnimationFrame(() => {
		const active = container.querySelector('.month-pill.active');
		if (active) {
			active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
		}
	});
}

function setupMonthFilterListeners() {
	const container = document.getElementById('month_filter');
	if (!container) return;

	container.addEventListener('click', (e) => {
		const pill = e.target.closest('.month-pill');
		if (!pill) return;

		const month = pill.dataset.month;
		if (month === selectedMonth) return; // already active

		selectedMonth = month;

		// Update active state
		container.querySelectorAll('.month-pill').forEach((p) => p.classList.remove('active'));
		pill.classList.add('active');

		// Re-render with filter
		renderWithFilter();
	});
}

/* ── Chart infrastructure ── */

function destroyCharts() {
	for (const chart of charts) {
		try { chart?.destroy(); } catch (_) {}
	}
	charts = [];
}

function buildChart(canvasId, config) {
	const canvas = document.getElementById(canvasId);
	if (!canvas) return null;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	const ChartLib = window.Chart;
	if (!ChartLib) return null;
	const chart = new ChartLib(ctx, config);
	charts.push(chart);
	return chart;
}

function setStatus(message, tone = 'neutral') {
	const el = document.getElementById('stats_status');
	if (!el) return;
	el.textContent = message;
	el.dataset.tone = tone;
}

function setMetric(id, value) {
	const el = document.getElementById(id);
	if (el) el.textContent = value;
}

async function loadChartLibrary() {
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

function buildLineConfig(labels, data, color, gradientId, pointColor) {
	return {
		type: 'line',
		data: {
			labels,
			datasets: [{
				label: 'Monto',
				data,
				borderColor: color,
				backgroundColor: gradientId,
				pointBackgroundColor: pointColor,
				pointBorderColor: pointColor,
				pointRadius: 3,
				pointHoverRadius: 5,
				tension: 0.35,
				fill: true,
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: 'index', intersect: false },
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label(context) {
							return ` ${formatCurrency(context.parsed.y)}`;
						},
					},
				},
			},
			scales: {
				x: {
					ticks: { color: 'rgba(255,255,255,0.72)' },
					grid: { color: 'rgba(255,255,255,0.08)' },
				},
				y: {
					ticks: {
						color: 'rgba(255,255,255,0.72)',
						callback(value) {
							return formatCurrency(value);
						},
					},
					grid: { color: 'rgba(255,255,255,0.08)' },
				},
			},
		},
	};
}

function buildBarConfig(labels, data) {
	const minHeight = Math.max(360, labels.length * 28);
	const canvas = document.getElementById('chart_deuda_por_usuario');
	if (canvas) canvas.height = minHeight;
	return {
		type: 'bar',
		data: {
			labels,
			datasets: [{
				label: 'Deuda total',
				data,
				borderWidth: 1,
				borderRadius: 8,
				backgroundColor: 'rgba(244, 63, 94, 0.72)',
				hoverBackgroundColor: 'rgba(244, 63, 94, 0.9)',
			}],
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			indexAxis: 'y',
			plugins: {
				legend: { display: false },
				tooltip: {
					callbacks: {
						label(context) {
							return ` ${formatCurrency(context.parsed.x)}`;
						},
					},
				},
			},
			scales: {
				x: {
					ticks: {
						color: 'rgba(255,255,255,0.72)',
						callback(value) {
							return formatCurrency(value);
						},
					},
					grid: { color: 'rgba(255,255,255,0.08)' },
				},
				y: {
					ticks: { color: 'rgba(255,255,255,0.78)' },
					grid: { display: false },
				},
			},
		},
	};
}

function createGradient(canvas, startColor, endColor) {
	const ctx = canvas?.getContext?.('2d');
	if (!ctx) return startColor;
	const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 320);
	gradient.addColorStop(0, startColor);
	gradient.addColorStop(1, endColor);
	return gradient;
}

/* ── Active Debt Evolution ── */

function buildActiveDebtSeries(deudas, pagos, isFiltered, selectedMonth) {
	const events = [];
	for (const d of deudas) {
		const date = normalizeFecha(d);
		const tel = getRecordTelefono(d);
		if (date && tel) events.push({ date, amount: normalizeMonto(d), type: 'deuda', tel });
	}
	for (const p of pagos) {
		const date = normalizeFecha(p);
		const tel = getRecordTelefono(p);
		if (date && tel) events.push({ date, amount: normalizeMonto(p), type: 'pago', tel });
	}
	events.sort((a, b) => a.date - b.date);

	const clientBalances = new Map();
	const monthBuckets = new Map();
	const dayBuckets = new Map();

	for (const ev of events) {
		let bal = clientBalances.get(ev.tel) || 0;
		if (ev.type === 'deuda') bal += ev.amount;
		if (ev.type === 'pago') bal -= ev.amount;
		if (bal < 0) bal = 0; // clamp per client
		clientBalances.set(ev.tel, bal);

		let runningTotal = 0;
		for (const val of clientBalances.values()) {
			runningTotal += val;
		}

		const mKey = getMonthKey(ev.date);
		const mLabel = formatMonthLabel(ev.date);
		monthBuckets.set(mKey, { label: mLabel, total: runningTotal, date: ev.date });

		const dKey = `${ev.date.getFullYear()}-${String(ev.date.getMonth() + 1).padStart(2, '0')}-${String(ev.date.getDate()).padStart(2, '0')}`;
		const dLabel = formatDayLabel(ev.date);
		dayBuckets.set(dKey, { label: dLabel, total: runningTotal, date: ev.date, monthKey: mKey });
	}

	if (!isFiltered) {
		return Array.from(monthBuckets.entries())
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map(([, entry]) => entry);
	} else {
		return Array.from(dayBuckets.values())
			.filter(entry => entry.monthKey === selectedMonth)
			.sort((a, b) => a.date - b.date);
	}
}

/* ── Render with current filter ── */

function renderWithFilter() {
	const isFiltered = selectedMonth !== 'all';
	const filteredDeudas = filterByMonth(rawDeudas, selectedMonth);
	const filteredPagos = filterByMonth(rawPagos, selectedMonth);

	// KPIs
	let totalDeuda, totalPagos, userCount;

	if (isFiltered) {
		totalDeuda = filteredDeudas.reduce((acc, d) => acc + normalizeMonto(d), 0);
		totalPagos = filteredPagos.reduce((acc, p) => acc + normalizeMonto(p), 0);
		// Active clients for the month
		const activePhones = getUniqueClientPhones(filteredDeudas, filteredPagos);
		userCount = activePhones.size;
	} else {
		totalDeuda = rawClientes.reduce((acc, cliente) => acc + (Number(cliente?.Deuda_Activa ?? cliente?.deuda_activa ?? cliente?.deudaActiva ?? 0) || 0), 0);
		totalPagos = rawPagos.reduce((acc, pago) => acc + normalizeMonto(pago), 0);
		userCount = rawClientes.length;
	}

	setMetric('stats_total_usuarios', String(userCount));
	setMetric('stats_total_deuda', formatCurrency(totalDeuda));
	setMetric('stats_total_pagos', formatCurrency(totalPagos));

	// Update subtitle based on filter
	const titleEl = document.querySelector('.stats-report__title');
	if (titleEl) {
		if (isFiltered) {
			const months = extractAvailableMonths(rawDeudas, rawPagos);
			const monthData = months.find((m) => m.key === selectedMonth);
			titleEl.textContent = monthData ? monthData.label : selectedMonth;
		} else {
			titleEl.textContent = 'Resumen global de clientes';
		}
	}

	if (isFiltered && filteredDeudas.length === 0 && filteredPagos.length === 0) {
		setStatus('Sin actividad en este mes', 'warning');
	} else {
		setStatus('Datos cargados correctamente', 'success');
	}

	// Charts
	destroyCharts();

	// Line charts: monthly view → show all months; filtered → show daily breakdown
	let deudasSeries, pagosSeries;

	deudasSeries = buildActiveDebtSeries(rawDeudas, rawPagos, isFiltered, selectedMonth);

	if (isFiltered) {
		pagosSeries = groupByDay(filteredPagos);
	} else {
		pagosSeries = groupByMonth(rawPagos);
	}

	const deudaPorUsuario = buildDebtPerUserSeries(rawClientes, filteredDeudas, filteredPagos, isFiltered);

	const deudasCanvas = document.getElementById('chart_deudas_tiempo');
	const pagosCanvas = document.getElementById('chart_pagos_tiempo');

	if (deudasCanvas) {
		const gradient = createGradient(deudasCanvas, 'rgba(244, 63, 94, 0.46)', 'rgba(244, 63, 94, 0.05)');
		buildChart('chart_deudas_tiempo', buildLineConfig(
			deudasSeries.map((item) => item.label),
			deudasSeries.map((item) => item.total),
			'rgba(244, 63, 94, 0.92)',
			gradient,
			'rgba(244, 63, 94, 1)'
		));
	}

	if (pagosCanvas) {
		const gradient = createGradient(pagosCanvas, 'rgba(16, 185, 129, 0.45)', 'rgba(16, 185, 129, 0.05)');
		buildChart('chart_pagos_tiempo', buildLineConfig(
			pagosSeries.map((item) => item.label),
			pagosSeries.map((item) => item.total),
			'rgba(16, 185, 129, 0.92)',
			gradient,
			'rgba(16, 185, 129, 1)'
		));
	}

	const barCanvas = document.getElementById('chart_deuda_por_usuario');
	if (barCanvas) {
		buildChart('chart_deuda_por_usuario', buildBarConfig(
			deudaPorUsuario.map((item) => item.label),
			deudaPorUsuario.map((item) => item.value)
		));
	}

	// Update chart card subtitles based on filter
	const badges = document.querySelectorAll('.chart-card__badge');
	if (badges.length >= 1) badges[0].textContent = isFiltered ? 'Mes seleccionado' : 'Todos los usuarios';
	if (badges.length >= 2) badges[1].textContent = isFiltered ? 'Mes seleccionado' : 'Todos los usuarios';
	if (badges.length >= 3) badges[2].textContent = isFiltered ? 'Mes seleccionado' : 'Ordenado de mayor a menor';

	// Update chart card h3 titles based on filter
	const chartTitles = document.querySelectorAll('.chart-card__head h3');
	if (chartTitles.length >= 1) chartTitles[0].textContent = isFiltered ? 'Evolución de deuda activa (día a día)' : 'Evolución de deuda activa';
	if (chartTitles.length >= 2) chartTitles[1].textContent = isFiltered ? 'Pagos registrados día a día' : 'Evolución de pagos a lo largo del tiempo';
	if (chartTitles.length >= 3) chartTitles[2].textContent = isFiltered ? 'Deuda registrada por usuario' : 'Deuda total por usuario';
}

/* ── Main data load ── */

async function renderStatistics() {
	setStatus('Cargando datos...');
	destroyCharts();

	const [clientes, deudas, pagos] = await Promise.all([
		fetchAllClientes(),
		fetchAllDeudas(),
		fetchAllPagos(),
	]);

	// Cache raw data
	rawClientes = clientes;
	rawDeudas = deudas;
	rawPagos = pagos;

	// Build & render month filter
	const availableMonths = extractAvailableMonths(deudas, pagos);
	renderMonthFilter(availableMonths);

	// Render with current filter (defaults to 'all')
	renderWithFilter();

	if (clientes.length === 0) {
		setStatus('No hay usuarios para mostrar', 'warning');
	}
}

async function init() {
	try {
		supabaseClient = await loadSupabase();
		await loadChartLibrary();
		setupMonthFilterListeners();
		await renderStatistics();
	} catch (error) {
		console.error(error);
		setStatus('No se pudieron cargar los datos', 'error');
	} finally {
        const loader = document.getElementById('global-loader');
        if (loader) loader.classList.add('hidden');
    }
}

init();

window.addEventListener('scroll', () => {
    const headerEl = document.querySelector('.header-text');
    if (headerEl) {
        if (window.scrollY > 10) {
            headerEl.classList.add('scrolled');
        } else {
            headerEl.classList.remove('scrolled');
        }
    }
});
