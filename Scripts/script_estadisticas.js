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
	// Filtered or Global: sum deudas per client in the specified period (or all-time)
	const deudaPorCliente = new Map();
	for (const d of filteredDeudas) {
		const tel = getRecordTelefono(d);
		if (!tel) continue;
		deudaPorCliente.set(tel, (deudaPorCliente.get(tel) || 0) + normalizeMonto(d));
	}

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
		try { chart?.destroy(); } catch (_) { }
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
		totalDeuda = rawDeudas.reduce((acc, d) => acc + normalizeMonto(d), 0);
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

	if (isFiltered) {
		deudasSeries = groupByDay(filteredDeudas);
		pagosSeries = groupByDay(filteredPagos);
	} else {
		deudasSeries = groupByMonth(rawDeudas);
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
	if (chartTitles.length >= 1) chartTitles[0].textContent = isFiltered ? 'Evolución de deuda registrada (día a día)' : 'Evolución de deuda registrada';
	if (chartTitles.length >= 2) chartTitles[1].textContent = isFiltered ? 'Pagos registrados día a día' : 'Evolución de pagos a lo largo del tiempo';
	if (chartTitles.length >= 3) chartTitles[2].textContent = isFiltered ? 'Deuda registrada por usuario' : 'Deuda total registrada por usuario';
}

/* ── PDF Export ── */

function clampScore(val, min, max) { return Math.max(min, Math.min(max, val)); }

function calculateClientScore(tel, deudas, pagos, deudaActiva) {
	if (!tel) return '--';
	const cDeudas = deudas.filter(d => getRecordTelefono(d) === tel);
	const cPagos = pagos.filter(p => getRecordTelefono(p) === tel);

	const totalPagado = cPagos.reduce((acc, p) => acc + normalizeMonto(p), 0);
	const totalDeudaRegistrada = cDeudas.reduce((acc, d) => acc + normalizeMonto(d), 0);

	const cobertura = totalDeudaRegistrada > 0 ? clampScore(totalPagado / totalDeudaRegistrada, 0, 1.4) : (totalPagado > 0 ? 1 : 0);

	const ultimoPago = cPagos.map(p => normalizeFecha(p)).filter(Boolean).sort((a, b) => b.getTime() - a.getTime())[0] || null;
	const diasSinPagar = ultimoPago ? Math.round((Date.now() - ultimoPago.getTime()) / 86400000) : 365;
	const recencia = clampScore(1 - (diasSinPagar / 180), 0, 1);

	const deudaPresion = totalDeudaRegistrada > 0 ? clampScore((Number(deudaActiva) || 0) / totalDeudaRegistrada, 0, 1.2) : 0;

	const rawScore = 300 + (cobertura * 320) + (recencia * 200) + ((1 - deudaPresion) * 120);
	return Math.round(clampScore(rawScore, 300, 850));
}

async function loadPDFLibraries() {
	if (window.jspdf && window.jspdf.jsPDF && typeof window.jspdf.jsPDF.API.autoTable === 'function') {
		return;
	}
	return new Promise((resolve, reject) => {
		const script1 = document.createElement('script');
		script1.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
		script1.onload = () => {
			const script2 = document.createElement('script');
			script2.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";
			script2.onload = resolve;
			script2.onerror = reject;
			document.head.appendChild(script2);
		};
		script1.onerror = reject;
		document.head.appendChild(script1);
	});
}

async function exportToPDF() {
	const btn = document.getElementById('btnExportarPDF');
	if (!btn) return;
	const oldHTML = btn.innerHTML;
	btn.disabled = true;

	try {
		// Mostrar pantalla de carga en el botón
		btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid white;border-right-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle;"></span>Cargando BD...';

		// 1. Obtener datos frescos desde Supabase según el periodo seleccionado
		const isFiltered = selectedMonth !== 'all';
		let freshDeudas = [];
		let freshPagos = [];

		try {
			let qDeudas = supabaseClient.from('Deudas').select('*');
			let qPagos = supabaseClient.from('Pagos').select('*');

			qDeudas = applyIdNegocioFilter(qDeudas);
			qPagos = applyIdNegocioFilter(qPagos);

			if (isFiltered) {
				const start = new Date(selectedMonth + '-01T00:00:00.000-03:00');
				const end = new Date(start);
				end.setMonth(end.getMonth() + 1);

				qDeudas = qDeudas.gte('Creado', start.toISOString()).lt('Creado', end.toISOString());
				qPagos = qPagos.gte('Creado', start.toISOString()).lt('Creado', end.toISOString());
			}

			const [resD, resP] = await Promise.all([qDeudas, qPagos]);
			if (resD.error) throw resD.error;
			if (resP.error) throw resP.error;

			freshDeudas = resD.data || [];
			freshPagos = resP.data || [];
		} catch (err) {
			console.warn('Error fetching fresh data, falling back to cache:', err);
			freshDeudas = filterByMonth(rawDeudas, selectedMonth);
			freshPagos = filterByMonth(rawPagos, selectedMonth);
		}

		btn.innerHTML = '<span style="width:14px;height:14px;border:2px solid white;border-right-color:transparent;border-radius:50%;display:inline-block;animation:spin 1s linear infinite;margin-right:8px;vertical-align:middle;"></span>Generando PDF...';

		await loadPDFLibraries();
		const { jsPDF } = window.jspdf;
		const doc = new jsPDF();

		if (typeof doc.autoTable !== 'function' && window.jspdf.autoTable) {
			doc.autoTable = window.jspdf.autoTable;
		}

		// 1.5. Configurar fondo gris para todas las páginas
		const originalAddPage = doc.addPage.bind(doc);
		doc.addPage = function() {
			originalAddPage();
			doc.setFillColor(26, 29, 36); // Gris oscuro profesional
			doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), 'F');
		};
		// Fondo para la primera página
		doc.setFillColor(26, 29, 36);
		doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), 'F');

		// 2. Diseño Corporativo DebiTú (Header)
		doc.setFillColor(112, 0, 255); // Color primario DebiTu
		doc.rect(0, 0, doc.internal.pageSize.getWidth(), 28, 'F');

		doc.setTextColor(255, 255, 255);
		doc.setFont('helvetica', 'bold');
		doc.setFontSize(22);
		// Icono DebiTu real
		const base64Icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAB9AAAAfQCAIAAAAVWlMuAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAF5WlUWHRYTUw6Y29tLmFkb2JlLnhtcAAAAAAAPD94cGFja2V0IGJlZ2luPSfvu78nIGlkPSdXNU0wTXBDZWhpSHpyZVN6TlRjemtjOWQnPz4KPHg6eG1wbWV0YSB4bWxuczp4PSdhZG9iZTpuczptZXRhLyc+CjxyZGY6UkRGIHhtbG5zOnJkZj0naHR0cDovL3d3dy53My5vcmcvMTk5OS8wMi8yMi1yZGYtc3ludGF4LW5zIyc+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpBdHRyaWI9J2h0dHA6Ly9ucy5hdHRyaWJ1dGlvbi5jb20vYWRzLzEuMC8nPgogIDxBdHRyaWI6QWRzPgogICA8cmRmOlNlcT4KICAgIDxyZGY6bGkgcmRmOnBhcnNlVHlwZT0nUmVzb3VyY2UnPgogICAgIDxBdHRyaWI6Q3JlYXRlZD4yMDI2LTA0LTE2PC9BdHRyaWI6Q3JlYXRlZD4KICAgICA8QXR0cmliOkRhdGE+eyZxdW90O2RvYyZxdW90OzomcXVvdDtEQUhFbUxuMGh5YyZxdW90OywmcXVvdDt1c2VyJnF1b3Q7OiZxdW90O1VBR1VPaDloV3JVJnF1b3Q7LCZxdW90O2JyYW5kJnF1b3Q7OiZxdW90O0JBR1VPcVc5Z21NJnF1b3Q7LCZxdW90O3RlbXBsYXRlJnF1b3Q7OiZxdW90O0JsYWNrIGFuZCBXaGl0ZSBNaW5pbWFsaXN0IEJyYW5kIExvZ28mcXVvdDt9PC9BdHRyaWI6RGF0YT4KICAgICA8QXR0cmliOkV4dElkPjEzMzYwNjRhLTQzM2EtNDU5Yi1hNDdkLThmNWU2ZTRlYzk2YzwvQXR0cmliOkV4dElkPgogICAgIDxBdHRyaWI6RmJJZD41MjUyNjU5MTQxNzk1ODA8L0F0dHJpYjpGYklkPgogICAgIDxBdHRyaWI6VG91Y2hUeXBlPjI8L0F0dHJpYjpUb3VjaFR5cGU+CiAgICA8L3JkZjpsaT4KICAgPC9yZGY6U2VxPgogIDwvQXR0cmliOkFkcz4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6ZGM9J2h0dHA6Ly9wdXJsLm9yZy9kYy9lbGVtZW50cy8xLjEvJz4KICA8ZGM6dGl0bGU+CiAgIDxyZGY6QWx0PgogICAgPHJkZjpsaSB4bWw6bGFuZz0neC1kZWZhdWx0Jz5Mb2dvdGlwbyBFc3R1ZGlvIGRlIERpc2XDsW8gR3LDoWZpY28gTWluaW1hbGlzdGEgQmVpZ2UgLSAxPC9yZGY6bGk+CiAgIDwvcmRmOkFsdD4KICA8L2RjOnRpdGxlPgogPC9yZGY6RGVzY3JpcHRpb24+CgogPHJkZjpEZXNjcmlwdGlvbiByZGY6YWJvdXQ9JycKICB4bWxuczpwZGY9J2h0dHA6Ly9ucy5hZG9iZS5jb20vcGRmLzEuMy8nPgogIDxwZGY6QXV0aG9yPkRHIDIwMzwvcGRmOkF1dGhvcj4KIDwvcmRmOkRlc2NyaXB0aW9uPgoKIDxyZGY6RGVzY3JpcHRpb24gcmRmOmFib3V0PScnCiAgeG1sbnM6eG1wPSdodHRwOi8vbnMuYWRvYmUuY29tL3hhcC8xLjAvJz4KICA8eG1wOkNyZWF0b3JUb29sPkNhbnZhIChSZW5kZXJlcikgZG9jPURBSEVtTG4waHljIHVzZXI9VUFHVU9oOWhXclUgYnJhbmQ9QkFHVU9xVzlnbU0gdGVtcGxhdGU9QmxhY2sgYW5kIFdoaXRlIE1pbmltYWxpc3QgQnJhbmQgTG9nbzwveG1wOkNyZWF0b3JUb29sPgogPC9yZGY6RGVzY3JpcHRpb24+CjwvcmRmOlJERj4KPC94OnhtcG1ldGE+Cjw/eHBhY2tldCBlbmQ9J3InPz6X/8/mAAAATmVYSWZNTQAqAAAACAAEARoABQAAAAEAAAA+ARsABQAAAAEAAABGASgAAwAAAAEAAgAAAhMAAwAAAAEAAQAAAAAAAAAAAGAAAAABAAAAYAAAAAF3Bd/nAADZ6ElEQVR4nOzYwQkAIRDAwPP673ktwoAgMxXknTUzHwAAAAAAcOa/HQAAAAAAAC8w3AEAAAAAIGC4AwAAAABAwHAHAAAAAICA4Q4AAAAAAAHDHQAAAAAAAoY7AAAAAAAEDHcAAAAAAAgY7gAAAAAAEDDcAQAAAAAgYLgDAAAAAEDAcAcAAAAAgIDhDgAAAAAAAcMdAAAAAAAChjsAAAAAAAQMdwAAAAAACBjuAAAAAAAQMNwBAAAAACBguAMAAAAAQMBwBwAAAACAgOEOAAAAAAABwx0AAAAAAAKGOwAAAAAABAx3AAAAAAAIGO4AAAAAABAw3AEAAAAAIGC4AwAAAABAwHAHAAAAAICA4Q4AAAAAAAHDHQAAAAAAAoY7AAAAAAAEDHcAAAAAAAgY7gAAAAAAEDDcAQAAAAAgYLgDAAAAAEDAcAcAAAAAgIDhDgAAAAAAAcMdAAAAAAAChjsAAAAAAAQMdwAAAAAACBjuAAAAAAAQMNwBAAAAACBguAMAAAAAQGADAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsA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AAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCAAD//+zYsQAAAADAIH/rSewsjIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADAIAAP//7NixAAAAAMAgf+tJ7CyMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///s2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMAgAA///t2LEAAAAAwCB/60nsLIyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAyEOwAAAAAADIQ7AAAAAAAMhDsAAAAAAAwCyeONRL9SJWQAAAAASUVORK5CYII=';
		if (base64Icon !== "BASE64_PLACEHOLDER") {
			doc.addImage(base64Icon, 'PNG', 14, 8, 12, 12);
		}
		
		doc.setTextColor(255, 255, 255);
		doc.setFontSize(22);
		doc.text('DebiTú', 30, 20);

		doc.setFont('helvetica', 'normal');
		doc.setFontSize(13);
		doc.text('Reporte Financiero y Estadístico', 70, 19);

		doc.setTextColor(220, 220, 225); // Texto claro para el fondo oscuro
		doc.setFontSize(12);

		let subtitleText = '';
		if (isFiltered) {
			const months = extractAvailableMonths(rawDeudas, rawPagos);
			const m = months.find((x) => x.key === selectedMonth);
			subtitleText = m ? 'Periodo Analizado: ' + m.label : 'Periodo Analizado: ' + selectedMonth;
		} else {
			subtitleText = 'Periodo Analizado: Histórico Global';
		}
		doc.text(subtitleText, 14, 35);

		// 3. KPIs usando datos frescos
		let totalDeuda, totalPagos, userCount;
		if (isFiltered) {
			totalDeuda = freshDeudas.reduce((acc, d) => acc + normalizeMonto(d), 0);
			totalPagos = freshPagos.reduce((acc, p) => acc + normalizeMonto(p), 0);
			userCount = getUniqueClientPhones(freshDeudas, freshPagos).size;
		} else {
			totalDeuda = freshDeudas.reduce((acc, d) => acc + normalizeMonto(d), 0);
			totalPagos = freshPagos.reduce((acc, p) => acc + normalizeMonto(p), 0);
			userCount = rawClientes.length;
		}

		doc.setFontSize(11);
		doc.text(`Total Usuarios Activos: ${userCount}`, 14, 45);
		doc.text(`Total Deuda Registrada: ${formatCurrency(totalDeuda)}`, 14, 52);
		doc.text(`Total Pagos Recibidos: ${formatCurrency(totalPagos)}`, 14, 59);

		let currentY = 75;

		// 4. Capturar e insertar gráficos
		const chartIds = ['chart_deudas_tiempo', 'chart_pagos_tiempo', 'chart_deuda_por_usuario'];
		for (const id of chartIds) {
			const c = document.getElementById(id);
			if (c) {
				const tc = document.createElement('canvas');
				tc.width = c.width;
				tc.height = c.height;
				const ctx = tc.getContext('2d');
				// NO llenamos el fondo para mantener transparencia PNG
				ctx.drawImage(c, 0, 0);

				const imgData = tc.toDataURL('image/png'); // Exportar como PNG

				// Gráficos más chicos: usamos el 75% del ancho de la página y lo centramos
				const pdfWidth = (doc.internal.pageSize.getWidth() - 28) * 0.75;
				const xPos = (doc.internal.pageSize.getWidth() - pdfWidth) / 2;
				const ratio = tc.height / tc.width;
				const pdfHeight = pdfWidth * ratio;

				if (currentY + pdfHeight > doc.internal.pageSize.getHeight() - 14) {
					doc.addPage();
					currentY = 20;
				}

				doc.addImage(imgData, 'PNG', xPos, currentY, pdfWidth, pdfHeight);
				currentY += pdfHeight + 12;
			}
		}

		currentY += 8;
		if (currentY > doc.internal.pageSize.getHeight() - 40) {
			doc.addPage();
			currentY = 20;
		}

		// 3. Tabla de Clientes
		let headCols = [];
		let tableBody = [];
		let index = 1;

		if (isFiltered) {
			headCols = [['#', 'Cliente', 'Teléfono', 'Score', 'Deuda del mes', 'Pagos del mes']];
			const phones = Array.from(getUniqueClientPhones(freshDeudas, freshPagos));

			const rows = [];
			for (const tel of phones) {
				const clienteObj = rawClientes.find(c => getClienteTelefono(c) === tel);
				const nombre = clienteObj ? getClienteNombre(clienteObj) : 'Desconocido';

				const d = freshDeudas.filter(x => getRecordTelefono(x) === tel).reduce((acc, x) => acc + normalizeMonto(x), 0);
				const p = freshPagos.filter(x => getRecordTelefono(x) === tel).reduce((acc, x) => acc + normalizeMonto(x), 0);

				const deudaAct = clienteObj ? (Number(clienteObj.Deuda_Activa ?? clienteObj.deuda_activa ?? 0) || 0) : 0;
				const score = calculateClientScore(tel, rawDeudas, rawPagos, deudaAct);

				rows.push({
					rawDeudaMes: d,
					row: [index++, nombre, tel || 'N/A', String(score), formatCurrency(d), formatCurrency(p)]
				});
			}
			rows.sort((a, b) => b.rawDeudaMes - a.rawDeudaMes);
			// Reasign index
			rows.forEach((r, i) => r.row[0] = i + 1);
			tableBody = rows.map(r => r.row);

		} else {
			headCols = [['#', 'Cliente', 'Teléfono', 'Score', 'Deuda Activa', 'Total Pagado']];
			const sorted = [...rawClientes].sort((a, b) => {
				const valA = Number(a.Deuda_Activa ?? a.deuda_activa ?? 0) || 0;
				const valB = Number(b.Deuda_Activa ?? b.deuda_activa ?? 0) || 0;
				return valB - valA;
			});
			for (const c of sorted) {
				const tel = getClienteTelefono(c);
				const nombre = getClienteNombre(c);
				const deudaAct = Number(c.Deuda_Activa ?? c.deuda_activa ?? 0) || 0;
				const p = freshPagos.filter(x => getRecordTelefono(x) === tel).reduce((acc, x) => acc + normalizeMonto(x), 0);
				const score = calculateClientScore(tel, rawDeudas, rawPagos, deudaAct);

				tableBody.push([
					index++,
					nombre,
					tel || 'N/A',
					String(score),
					formatCurrency(deudaAct),
					formatCurrency(p)
				]);
			}
		}

		doc.autoTable({
			startY: currentY,
			head: headCols,
			body: tableBody,
			theme: 'grid',
			headStyles: { fillColor: [112, 0, 255], textColor: [255, 255, 255] },
			bodyStyles: { fillColor: [30, 34, 43], textColor: [220, 220, 225] },
			alternateRowStyles: { fillColor: [36, 40, 50] },
			styles: { fontSize: 9, lineColor: [60, 64, 75] },
			margin: { left: 14, right: 14 }
		});

		// 6. Detalle de operaciones (Para todos los periodos)
		if (freshDeudas.length > 0 || freshPagos.length > 0) {
			const operaciones = [
				...freshDeudas.map(d => ({ ...d, tipo: 'Deuda' })),
				...freshPagos.map(p => ({ ...p, tipo: 'Pago' }))
			].sort((a, b) => {
				const da = normalizeFecha(a);
				const db = normalizeFecha(b);
				return (da ? da.getTime() : 0) - (db ? db.getTime() : 0);
			});

			const opBody = operaciones.map(op => {
				const fechaNorm = normalizeFecha(op);
				return [
					fechaNorm ? formatLongDate(fechaNorm) : 'Sin fecha',
					op.tipo,
					getRecordTelefono(op),
					formatCurrency(normalizeMonto(op))
				];
			});

			if (doc.lastAutoTable.finalY + 20 > doc.internal.pageSize.getHeight()) {
				doc.addPage();
				doc.text('Detalle de Operaciones (Cronológico)', 14, 20);
				doc.autoTable({
					startY: 25,
					head: [['Fecha', 'Tipo', 'Tel. Cliente', 'Monto']],
					body: opBody,
					theme: 'striped',
					headStyles: { fillColor: [41, 128, 185] },
					styles: { fontSize: 9 },
					margin: { left: 14, right: 14 }
				});
			} else {
				doc.text('Detalle de Operaciones (Cronológico)', 14, doc.lastAutoTable.finalY + 14);
				doc.autoTable({
					startY: doc.lastAutoTable.finalY + 18,
					head: [['Fecha', 'Tipo', 'Tel. Cliente', 'Monto']],
					body: opBody,
					theme: 'striped',
					headStyles: { fillColor: [41, 128, 185] },
					styles: { fontSize: 9 },
					margin: { left: 14, right: 14 }
				});
			}
		}

		doc.save(`Reporte_DebiTu_${isFiltered ? selectedMonth : 'Global'}.pdf`);
	} catch (err) {
		console.error('Error generando PDF', err);
		alert('Ocurrió un error al generar el PDF. Revisa la consola.');
	} finally {
		btn.innerHTML = oldHTML;
		btn.disabled = false;
	}
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

		const btnPdf = document.getElementById('btnExportarPDF');
		if (btnPdf) btnPdf.addEventListener('click', exportToPDF);

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
