import { loadSupabase } from './supabase.js';

let supabaseClient = null;
let charts = [];

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

function groupByMonth(records) {
	const buckets = new Map();
	for (const record of records) {
		const date = normalizeFecha(record);
		if (!date) continue;
		const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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

function buildDebtPerUserSeries(clientes) {
	return (clientes || [])
		.map((cliente) => ({
			label: getClienteNombre(cliente),
			value: Number(cliente?.Deuda_Activa ?? cliente?.deuda_activa ?? cliente?.deudaActiva ?? 0) || 0,
		}))
		.sort((a, b) => b.value - a.value);
}

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

async function renderStatistics() {
	setStatus('Cargando datos...');
	destroyCharts();

	const [clientes, deudas, pagos] = await Promise.all([
		fetchAllClientes(),
		fetchAllDeudas(),
		fetchAllPagos(),
	]);

	const totalDeuda = clientes.reduce((acc, cliente) => acc + (Number(cliente?.Deuda_Activa ?? cliente?.deuda_activa ?? cliente?.deudaActiva ?? 0) || 0), 0);
	const totalPagos = pagos.reduce((acc, pago) => acc + normalizeMonto(pago), 0);

	setMetric('stats_total_usuarios', String(clientes.length));
	setMetric('stats_total_deuda', formatCurrency(totalDeuda));
	setMetric('stats_total_pagos', formatCurrency(totalPagos));
	setStatus('Datos cargados correctamente', 'success');

	const deudasMensuales = groupByMonth(deudas);
	const pagosMensuales = groupByMonth(pagos);
	const deudaPorUsuario = buildDebtPerUserSeries(clientes);

	const deudasCanvas = document.getElementById('chart_deudas_tiempo');
	const pagosCanvas = document.getElementById('chart_pagos_tiempo');
	if (deudasCanvas) {
		const gradient = createGradient(deudasCanvas, 'rgba(244, 63, 94, 0.46)', 'rgba(244, 63, 94, 0.05)');
		buildChart('chart_deudas_tiempo', buildLineConfig(
			deudasMensuales.map((item) => item.label),
			deudasMensuales.map((item) => item.total),
			'rgba(244, 63, 94, 0.92)',
			gradient,
			'rgba(244, 63, 94, 1)'
		));
	}

	if (pagosCanvas) {
		const gradient = createGradient(pagosCanvas, 'rgba(16, 185, 129, 0.45)', 'rgba(16, 185, 129, 0.05)');
		buildChart('chart_pagos_tiempo', buildLineConfig(
			pagosMensuales.map((item) => item.label),
			pagosMensuales.map((item) => item.total),
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

	if (clientes.length === 0) {
		setStatus('No hay usuarios para mostrar', 'warning');
	}
}

async function init() {
	try {
		supabaseClient = await loadSupabase();
		await loadChartLibrary();
		await renderStatistics();
	} catch (error) {
		console.error(error);
		setStatus('No se pudieron cargar los datos', 'error');
	}
}

document.addEventListener('DOMContentLoaded', init);
