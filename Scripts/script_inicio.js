import {loadSupabase} from './supabase.js'
import { ensureCmsSheet, openCmsSheet, closeCmsSheet, attachSheetDragHandler, showErrorToast, showSuccessToast, showInfoSheet, confirmSheet } from './cmsSheet.js';
const client= await loadSupabase();
let currentOpView = 'deudas'; // 'deudas' | 'pagos'
let isExpanded = false; // controls whether list shows all items or limited
let operacionIngresoInit = false;
// Bottom-sheet functionality moved to Scripts/cmsSheet.js

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

window.onload = async function() {
    /*if (!localStorage.getItem('UserID')) {
        window.location.href = '/index.html';
    }*/
    document.getElementById("bienvenida").textContent = textoB();
    const pfp = document.getElementById("pfp");
    if (pfp) pfp.src = localStorage.getItem("UserPhoto") || '';
    await cargarMontoAdeudadoMensual();
    prepararOperacionIngreso();
    prepararTabsOperaciones();
    await mostrarOperaciones('deudas');
};
window.cerrarSesion=function() {
    localStorage.clear();
    window.location.href = "/index.html";
}
// Toggle expand/collapse of operations list. Bound to the Expandir button in HTML.
window.expandirTabla = function(){
    isExpanded = !isExpanded;
    // update button label (keep icon)
    const btn = document.getElementById('btn_expandir_ops') || document.querySelector('button[onclick="expandirTabla()"]');
    if (btn) {
        const label = btn.querySelector('.btn-label');
        if (label) label.textContent = isExpanded ? 'Contraer' : 'Expandir';
        btn.setAttribute('aria-expanded', String(isExpanded));
        btn.setAttribute('aria-label', isExpanded ? 'Contraer operaciones' : 'Expandir operaciones');
        btn.title = isExpanded ? 'Contraer' : 'Expandir';
    }
    // toggle collapsed class for optional CSS visual
    const cont = document.getElementById('lista_operaciones');
    if (cont) cont.classList.toggle('collapsed', !isExpanded);
    // re-render current view
    mostrarOperaciones(currentOpView);
}

// Función invocada desde el enlace "Realizar Operación" en el HTML.
// Ahora solo oculta/muestra la sección embebida #Operacion-ingreso.
window.realizarOperacion = function(e){
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    const section = document.getElementById('Operacion-ingreso');
    if (!section) return;

    // Guardar referencia al padre original para restaurar al cerrar
    if (!section._originalParent) {
        section._originalParent = section.parentNode;
        section._originalNext = section.nextSibling;
    }

    // Asegurar el sheet
    const els = ensureCmsSheet();
    const content = els.content;

    // Si la sección ya está dentro del sheet, cerrar
    if (content.contains(section) && document.body.classList.contains('cms-sheet-open')){
        closeCmsSheet('close');
        return;
    }

    // Abrir el sheet y mover la sección dentro
    const s = openCmsSheet({ title: 'Registrar Operación', subtitle: '', contentHtml: '' });
    // limpiar contenido y mover el nodo
    content.innerHTML = '';
    content.appendChild(section);
    section.hidden = false;

    // Actualizar botón visual (aria-expanded)
    const btn = document.getElementById('btn_realiz_op');
    if (btn) btn.setAttribute('aria-expanded', 'true');

    // Inicializar comportamientos del formulario
    prepararOperacionIngreso();
    const input = document.getElementById('op_clientSearch');
    if (input) setTimeout(() => input.focus(), 0);

    // Al cerrar el sheet, restaurar la sección a su posición original y ocultarla
    s.closed.then(() => {
        try {
            if (section._originalParent) {
                section._originalParent.insertBefore(section, section._originalNext);
            }
            section.hidden = true;
            if (btn) btn.setAttribute('aria-expanded', 'false');
        } catch (err) {
            console.warn('Error al restaurar sección Operacion-ingreso', err);
        }
    });
}

function prepararOperacionIngreso(){
    if (operacionIngresoInit) return;
    const section = document.getElementById('Operacion-ingreso');
    if (!section) return;

    const input = document.getElementById('op_clientSearch');
    const matches = document.getElementById('op_clientMatches');
    const catInput = document.getElementById('op_category');
    const totalAmount = document.getElementById('op_total_amount');
    const totalAmountValue = document.getElementById('op_total_amount_value');
    const amount = document.getElementById('op_amount');
    const chkPago = document.getElementById('op_chkPago');
    const chkDeuda = document.getElementById('op_chkDeuda');
    const btnRegistrar = document.getElementById('op_registrar');

    const calc = document.getElementById('op_calc');
    const eq = document.getElementById('op_calc_eq');
    const clear = document.getElementById('op_calc_clear');
    const back = document.getElementById('op_calc_back');

    const calcShell = document.getElementById('op_calc_shell');

    if (!input || !matches || !catInput || !totalAmount || !totalAmountValue || !amount || !chkPago || !chkDeuda || !btnRegistrar || !calc || !eq || !clear || !back) {
        console.warn('No se pudo inicializar Operacion-ingreso: faltan elementos del formulario.');
        return;
    }

    operacionIngresoInit = true;

    // --- Búsqueda de clientes ---
    let debounceTimer = null;

    async function loadMatches(term){
        matches.innerHTML = '';
        matches.selectedClient = null;
        if (!term) return;
        try{
            const orQuery = `Nombre.ilike.%${term}%,Telefono.ilike.%${term}%`;
            let q = client
                .from('Clientes')
                .select('Nombre, Telefono')
                .or(orQuery)
                .limit(50);
            q = applyIdNegocioFilter(q);
            const { data, error } = await q;
            if (error) {
                console.error(error);
                matches.innerHTML = '<div class="muted">Error de búsqueda</div>';
                return;
            }
            if (!data || data.length === 0) {
                matches.innerHTML = '<div class="muted">No hay coincidencias</div>';
                return;
            }

            data.forEach(c => {
                const div = document.createElement('div');
                div.className = 'match-item';
                div.innerHTML = `<strong>${escapeHtml(c.Nombre ?? '')}</strong><br><small class="muted">${escapeHtml(c.Telefono ?? '')}</small>`;
                div.addEventListener('click', () => {
                    input.value = (c.Nombre ?? '').trim() || (c.Telefono ?? '');
                    matches.selectedClient = c;
                    matches.innerHTML = '';
                    input.focus();
                });
                matches.appendChild(div);
            });
        }catch(err){
            console.error('Busqueda clientes error', err);
            matches.innerHTML = '<div class="muted">Error de búsqueda</div>';
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => loadMatches(input.value.trim()), 250);
    });

    // --- LÓGICA DE CALCULADORA (expresión completa) ---
    const btns = calc.querySelectorAll('.calc-btn');
    const ops = calc.querySelectorAll('.calc-op');

    let expr = '0'; // expresión normalizada: 0-9.+-*/ (sin espacios, sin × ÷)
    let lastResult = 0;
    let showingResult = false; // si el display muestra "... = ..."
    let syncingFromCode = false;

    function parseNumberInput(s){
        const v = String(s ?? '').trim().replace(/\s+/g, '').replace(/,/g, '.');
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : NaN;
    }

    function toDisplayExpr(normalized){
        return String(normalized)
            .replace(/\*/g, '×')
            .replace(/\//g, '÷');
    }

    function fromDisplayExpr(display){
        return String(display)
            .replace(/×/g, '*')
            .replace(/÷/g, '/')
            .replace(/,/g, '.')
            .replace(/\s+/g, '');
    }

    function isOperatorChar(ch){
        return ch === '+' || ch === '-' || ch === '*' || ch === '/';
    }

    function roundMoney(n){
        return parseFloat(Number(n).toFixed(2));
    }

    function formatMoney(n){
        if (!Number.isFinite(n)) return 'Error';
        const s = roundMoney(n).toFixed(2);
        if (s.endsWith('.00')) return s.slice(0, -3);
        if (s.endsWith('0')) return s.slice(0, -1);
        return s;
    }

    function formatAmountForInput(n){
        if (!Number.isFinite(n)) return '0.00';
        return roundMoney(n).toFixed(2);
    }

    function setDisplay(displayText){
        syncingFromCode = true;
        amount.value = displayText;
        amount.placeholder = '';
        syncingFromCode = false;
    }

    function setTotalAmount(n){
        const safe = Number.isFinite(n) ? roundMoney(n) : 0;
        totalAmountValue.value = String(safe);
        totalAmount.value = formatAmountForInput(safe);
    }

    function addToTotalAmount(delta){
        const current = parseNumberInput(totalAmount.value);
        const base = Number.isFinite(current) ? current : parseNumberInput(totalAmountValue.value);
        const next = (Number.isFinite(base) ? base : 0) + (Number.isFinite(delta) ? delta : 0);
        setTotalAmount(next);
    }

    function setExpr(nextExpr){
        expr = String(nextExpr || '0');
        if (expr === '' || expr === '-') {
            setDisplay(expr);
            return;
        }
        const numeric = parseFloat(expr);
        if (Number.isFinite(numeric) && !/[+\-*/]/.test(expr.slice(1))) {
            // es un número simple (permite un '-' inicial)
            lastResult = numeric;
            setDisplay(toDisplayExpr(expr));
        } else {
            setDisplay(toDisplayExpr(expr));
        }
    }

    function sanitizeExpressionRaw(raw){
        const cleaned = fromDisplayExpr(raw)
            .replace(/[^0-9+\-*/.]/g, '');
        return cleaned;
    }

    function tokenizeExpression(normalized){
        const tokens = [];
        const s = String(normalized || '');
        let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (ch >= '0' && ch <= '9' || ch === '.') {
                let num = '';
                while (i < s.length) {
                    const c = s[i];
                    if ((c >= '0' && c <= '9') || c === '.') {
                        num += c;
                        i++;
                    } else break;
                }
                if (num === '.' || num === '') return null;
                tokens.push({ type: 'num', value: parseFloat(num) });
                continue;
            }

            if (isOperatorChar(ch)) {
                // unary minus => se pega al número siguiente
                const prev = tokens[tokens.length - 1];
                if (ch === '-' && (!prev || prev.type === 'op')) {
                    i++;
                    let num = '-';
                    while (i < s.length) {
                        const c = s[i];
                        if ((c >= '0' && c <= '9') || c === '.') {
                            num += c;
                            i++;
                        } else break;
                    }
                    if (num === '-' || num === '-.' ) return null;
                    tokens.push({ type: 'num', value: parseFloat(num) });
                    continue;
                }
                tokens.push({ type: 'op', value: ch });
                i++;
                continue;
            }
            // cualquier otra cosa se ignora
            i++;
        }
        return tokens;
    }

    function precedence(op){
        return (op === '*' || op === '/') ? 2 : 1;
    }

    function applyOp(op, a, b){
        if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
        if (op === '+') return a + b;
        if (op === '-') return a - b;
        if (op === '*') return a * b;
        if (op === '/') return b === 0 ? NaN : a / b;
        return NaN;
    }

    function evaluateExpression(normalized){
        const tokens = tokenizeExpression(normalized);
        if (!tokens || tokens.length === 0) return NaN;
        if (tokens[tokens.length - 1].type === 'op') return NaN;

        const values = [];
        const opsStack = [];

        for (const t of tokens) {
            if (t.type === 'num') {
                values.push(t.value);
                continue;
            }
            if (t.type === 'op') {
                while (opsStack.length > 0 && precedence(opsStack[opsStack.length - 1]) >= precedence(t.value)) {
                    const op = opsStack.pop();
                    const b = values.pop();
                    const a = values.pop();
                    values.push(applyOp(op, a, b));
                }
                opsStack.push(t.value);
            }
        }

        while (opsStack.length > 0) {
            const op = opsStack.pop();
            const b = values.pop();
            const a = values.pop();
            values.push(applyOp(op, a, b));
        }

        if (values.length !== 1) return NaN;
        const r = values[0];
        return Number.isFinite(r) ? r : NaN;
    }

    function currentNumberHasDot(){
        const s = expr;
        let i = s.length - 1;
        while (i >= 0) {
            const ch = s[i];
            if (isOperatorChar(ch)) break;
            i--;
        }
        const part = s.slice(i + 1);
        return part.includes('.');
    }

    function handleDigit(d){
        if (showingResult) {
            expr = '0';
            showingResult = false;
        }
        if (expr === '0') expr = d;
        else expr += d;
        setExpr(expr);
    }

    function handleDecimal(){
        if (showingResult) {
            expr = '0';
            showingResult = false;
        }
        if (currentNumberHasDot()) return;
        const last = expr.slice(-1);
        if (expr === '' || expr === '0') {
            expr = '0.';
        } else if (isOperatorChar(last)) {
            expr += '0.';
        } else {
            expr += '.';
        }
        setExpr(expr);
    }

    function handleOperator(op){
        if (!isOperatorChar(op)) return;
        if (showingResult) {
            showingResult = false;
            expr = String(roundMoney(lastResult));
        }

        if (expr === '0' && op === '-') {
            expr = '-';
            setExpr(expr);
            return;
        }

        if (expr === '' || expr === '-') return;

        const last = expr.slice(-1);
        if (isOperatorChar(last)) {
            // permitir "2* -3" (unary minus)
            if (op === '-' && last !== '-') {
                expr += '-';
            } else {
                expr = expr.slice(0, -1) + op;
            }
            setExpr(expr);
            return;
        }

        expr += op;
        setExpr(expr);
    }

    async function handleEquals(){
        if (!expr || expr === '-' || isOperatorChar(expr.slice(-1))) return;
        const result = evaluateExpression(expr);
        if (!Number.isFinite(result)) {
            await showErrorToast('Operación inválida');
            return;
        }
        const rounded = roundMoney(result);
        lastResult = rounded;
        showingResult = true;
        // Tras "=", mostrar solo el resultado y sumarlo al monto total.
        expr = String(rounded);
        setDisplay(formatMoney(rounded));
        addToTotalAmount(rounded);
    }

    function clearCalculator(){
        expr = '0';
        lastResult = 0;
        showingResult = false;
        setDisplay('0');
    }

    function backspace(){
        if (showingResult) {
            showingResult = false;
            expr = String(roundMoney(lastResult));
            setExpr(expr);
            return;
        }
        if (!expr || expr === '0') return;
        expr = expr.slice(0, -1);
        if (expr === '' || expr === '-') expr = '0';
        setExpr(expr);
    }

    // Teclado (botones)
    btns.forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (k === '.') handleDecimal();
        else handleDigit(k);
    }));
    ops.forEach(o => o.addEventListener('click', () => handleOperator(o.dataset.op)));
    eq.addEventListener('click', () => { handleEquals(); });
    clear.addEventListener('click', clearCalculator);
    back.addEventListener('click', backspace);

    // Entrada manual (escribir/pastear "2+2")
    amount.addEventListener('input', () => {
        if (syncingFromCode) return;
        const raw = amount.value;
        const normalized = sanitizeExpressionRaw(raw);
        showingResult = false;
        expr = normalized || '0';
        // re-escribe con símbolos bonitos sin romper el cursor (mínimo)
        const pretty = toDisplayExpr(expr);
        if (amount.value !== pretty) {
            const pos = amount.selectionStart;
            syncingFromCode = true;
            amount.value = pretty;
            if (typeof pos === 'number') {
                const safePos = Math.min(pretty.length, pos);
                amount.setSelectionRange(safePos, safePos);
            }
            syncingFromCode = false;
        }
        // si lo ingresado es número simple, permitir '=' para sumarlo sin problemas
        const asNumber = parseFloat(expr);
        if (Number.isFinite(asNumber) && !/[+\-*/]/.test(expr.slice(1))) lastResult = asNumber;
    });

    amount.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleEquals();
        }
    });

    // Estado inicial
    const initial = sanitizeExpressionRaw(amount.value);
    expr = initial || '0';
    setExpr(expr);

    // Input de monto total (manual)
    totalAmount.addEventListener('input', () => {
        const n = parseNumberInput(totalAmount.value);
        if (Number.isFinite(n)) totalAmountValue.value = String(roundMoney(n));
    });

    totalAmount.addEventListener('blur', () => {
        const n = parseNumberInput(totalAmount.value);
        if (!Number.isFinite(n)) {
            setTotalAmount(parseNumberInput(totalAmountValue.value));
            return;
        }
        setTotalAmount(n);
    });

    // Si el contenedor se colapsa, no tocar el total
    if (calcShell) {
        calcShell.addEventListener('toggle', () => {
            // placeholder: no-op, el chevrón rota vía CSS
        });
    }

    // --- Registrar operación ---
    btnRegistrar.addEventListener('click', async () => {
        btnRegistrar.disabled = true;
        try{
            const tipo = chkPago.checked ? 'pago' : 'deuda';
            const name = input.value.trim();
            const categoria = catInput.value.trim();
            // El monto real a guardar es el Monto total (arriba de la calculadora)
            let monto = parseNumberInput(totalAmount.value);
            if (!Number.isFinite(monto)) monto = parseNumberInput(totalAmountValue.value);
            if (!Number.isFinite(monto) || monto <= 0) {
                // Fallback: si el usuario solo usó la calculadora y nunca tocó el total, intentar evaluar lo que esté en pantalla
                const displayRaw = String(amount.value || '').trim();
                const normalized = sanitizeExpressionRaw(displayRaw);
                const r = (/[+\-*/]/.test(normalized.replace(/^-/, '')))
                    ? evaluateExpression(normalized)
                    : parseFloat(normalized);
                monto = Number.isFinite(r) ? roundMoney(r) : NaN;
                if (Number.isFinite(monto) && monto > 0) setTotalAmount(monto);
            }

            if (isNaN(monto) || monto <= 0) {
                await showErrorToast('Ingrese un monto válido mayor a 0');
                return;
            }

            let phoneValue = null;
            if (matches.selectedClient) phoneValue = matches.selectedClient.Telefono ?? null;
            if (!phoneValue) {
                const possible = name || '';
                const digits = (possible.match(/\d+/g) || []).join('');
                if (digits.length >= 6) phoneValue = digits;
            }

            const payload = {
                Monto: monto,
                Categoria: categoria,
                Telefono_cliente: phoneValue,
            };

            const idNegocio = getIdNegocioForWrite();
            if (idNegocio === undefined){
                await showErrorToast('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
                return;
            }
            payload.ID_Negocio = idNegocio;

            const table = tipo === 'deuda' ? 'Deudas' : 'Pagos';
            const { error } = await client.from(table).insert(payload);
            if (error){
                await showErrorToast('Error al registrar: ' + (error.message || error));
                return;
            }

            // Actualizar Deuda_Activa según tipo
            if (phoneValue) {
                let qClient = client
                    .from('Clientes')
                    .select('Deuda_Activa')
                    .eq('Telefono', phoneValue);
                qClient = applyIdNegocioFilter(qClient);
                const { data: clientData, error: selectError } = await qClient.single();
                if (selectError) {
                    console.error('Error al obtener deuda actual del cliente', selectError);
                    await showSuccessToast('Operación registrada');
                    await showErrorToast('No se pudo obtener la deuda actual del cliente: ' + (selectError.message || selectError));
                } else {
                    const current = Number(clientData?.Deuda_Activa ?? 0) || 0;
                    const delta = Number(payload.Monto) || 0;
                    const newDeuda = tipo === 'deuda'
                        ? parseFloat((current + delta).toFixed(2))
                        : parseFloat(Math.max(0, current - delta).toFixed(2));
                    let upd = client
                        .from('Clientes')
                        .update({ Deuda_Activa: newDeuda })
                        .eq('Telefono', phoneValue);
                    upd = applyIdNegocioFilter(upd);
                    const { error: updError } = await upd;
                    if (updError){
                        console.error('Error al actualizar deuda del cliente', updError);
                        await showSuccessToast('Operación registrada');
                        await showErrorToast('No se pudo actualizar la deuda del cliente: ' + (updError.message || updError));
                    } else {
                        await showSuccessToast('Operación registrada correctamente');
                    }
                }
            } else {
                await showSuccessToast('Operación registrada correctamente');
            }

            try { await recargarMontos(); } catch(e){}
            try { await recargarTabla(); } catch(e){}

            // Reset básico del formulario
            input.value = '';
            catInput.value = '';
            matches.innerHTML = '';
            matches.selectedClient = null;
            chkDeuda.checked = true;
            setTotalAmount(0);
            clearCalculator();
        }catch(err){
            console.error(err);
            await showErrorToast('Error al registrar la operación');
        }finally{
            btnRegistrar.disabled = false;
        }
    });
}
async function cargarPagosRecientes(){
    const { data, error } = await applyIdNegocioFilter(
        client
            .from('Pagos')
            .select('*')
    ).order('Creado', { ascending: false });
    if (error){
        showErrorToast(error.message);
        return [];
    }
    console.log(data);
    return data || [];
}

async function cargarDeudasRecientes(){
    const { data, error } = await applyIdNegocioFilter(
        client
            .from('Deudas')
            .select('*')
    ).order('Creado', { ascending: false });
    if (error){
        showErrorToast(error.message);
        return [];
    }
    console.log(data);
    return data || [];
}

function prepararTabsOperaciones(){
    const btnDeudas = document.getElementById('btn_ver_deudas');
    const btnPagos = document.getElementById('btn_ver_pagos');
    if (!btnDeudas || !btnPagos) return;

    btnDeudas.addEventListener('click', async () => {
        if (currentOpView === 'deudas') return;
        setActiveTab('deudas');
        await mostrarOperaciones('deudas');
    });
    btnPagos.addEventListener('click', async () => {
        if (currentOpView === 'pagos') return;
        setActiveTab('pagos');
        await mostrarOperaciones('pagos');
    });
}

function setActiveTab(tipo){
    currentOpView = tipo;
    const btnDeudas = document.getElementById('btn_ver_deudas');
    const btnPagos = document.getElementById('btn_ver_pagos');
    if (btnDeudas && btnPagos){
        btnDeudas.classList.toggle('active', tipo === 'deudas');
        btnDeudas.setAttribute('aria-selected', String(tipo === 'deudas'));
        btnPagos.classList.toggle('active', tipo === 'pagos');
        btnPagos.setAttribute('aria-selected', String(tipo === 'pagos'));
    }

}

async function mostrarOperaciones(tipo){
    const cont = document.getElementById('lista_operaciones');
    if (!cont) return;
    cont.textContent = 'Cargando...';
    try{
        const items = tipo === 'deudas' ? await cargarDeudasRecientes() : await cargarPagosRecientes();
        renderListaOperaciones(cont, items, tipo);
    }catch(err){
        console.error(err);
        showErrorToast('No se pudieron cargar las operaciones');
        cont.textContent = 'Error al cargar.';
    }
}

function renderListaOperaciones(container, items, tipo){
    container.innerHTML = '';
    if (!items || items.length === 0){
        const empty = document.createElement('div');
        empty.textContent = 'No hay registros.';
        container.appendChild(empty);
        return;
    }
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    // If not expanded, show up to 4 items. Otherwise show up to 50 (safety cap).
    const visibleItems = isExpanded ? items.slice(0,50) : items.slice(0,4);
    visibleItems.forEach(item => {
        const fechaRaw = item.Creado || item.creado || item.fecha || item.created_at || '';
        const fecha = formatDate(fechaRaw);
        const montoRaw = item.Monto ?? item.monto ?? item.Amount ?? item.amount ?? 0;
        const monto = Number(montoRaw) || 0;
        const card = document.createElement('div');
        card.className = `op-item op-item--${tipo === 'deudas' ? 'deuda' : 'pago'}`;
        const categoria = escapeHtml(String(item.Categoria || item.categoria || item.Detalle || item.detalle || ''));
        const typeLabel = tipo === 'deudas' ? 'Deuda' : 'Pago';
        const amountColor = tipo === 'deudas' ? 'var(--danger)' : 'var(--success)';
        card.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                <div>
                    <div style="font-weight:700; font-size:0.95rem;">${categoria || typeLabel}</div>
                    <div class="muted" style="font-size:0.78rem; margin-top:2px;">${escapeHtml(String(fecha))}</div>
                </div>
                <div style="font-weight:800; font-size:1.05rem; color:${amountColor};">${formatter.format(monto)}</div>
            </div>
        `;
        // click to show details
        card.addEventListener('click', () => showOperacionDetalle(item, tipo));
        container.appendChild(card);
    });
    // Persistent toggle indicator: show on both states when there are more items
    if (items.length > 4){
        const toggle = document.createElement('div');
        toggle.className = 'more-indicator';
        toggle.textContent = isExpanded ? 'Ocultar registros' : `Mostrar ${items.length - 4} registros más`;
        toggle.addEventListener('click', () => {
            // Toggle expansion via the same function used by the external button
            window.expandirTabla && window.expandirTabla();
        });
        container.appendChild(toggle);
    }
}

function escapeHtml(str){
    return str.replace(/[&<>"]+/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function formatDate(value){
    if (!value) return '';
    // Try to parse common date formats
    const d = new Date(value);
    if (!isNaN(d)){
        try{
            return d.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
        }catch(e){
            return d.toString();
        }
    }
    // If it's a numeric timestamp
    const n = Number(value);
    if (!Number.isNaN(n)){
        const d2 = new Date(n);
        if (!isNaN(d2)) return d2.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
    }
    return String(value);
}

async function showOperacionDetalle(item, tipo) {
    openOperacionDetalleDrawerInicio(item, tipo);
}

// ── Drawer detalle operación (Inicio) ──
let opdInicioEls = null;
let opdInicioId = 0;

function ensureOperacionDetalleDrawerInicio(){
    if (opdInicioEls) return opdInicioEls;

    let backdrop = document.getElementById('opdBackdrop');
    if (!backdrop){
        backdrop = document.createElement('div');
        backdrop.id = 'opdBackdrop';
        backdrop.className = 'opd-backdrop';
        backdrop.style.display = 'none';
        document.body.appendChild(backdrop);
    }

    let drawer = document.getElementById('opdDrawer');
    if (!drawer){
        drawer = document.createElement('div');
        drawer.id = 'opdDrawer';
        drawer.className = 'opd-drawer';
        drawer.setAttribute('role', 'dialog');
        drawer.setAttribute('aria-modal', 'true');
        drawer.setAttribute('aria-label', 'Detalle de operación');
        drawer.style.display = 'none';
        drawer.innerHTML = `
            <div class="sheet-handle" id="opdHandle" aria-hidden="true"><div class="sheet-handle-bar"></div></div>
            <div class="opd-header">
                <div class="opd-title">
                    <h3 id="opdTitle">Detalle</h3>
                    <p id="opdSubtitle">—</p>
                </div>
            </div>
            <div class="opd-body">
                <h4 class="opd-section-title">Información</h4>
                <div class="opd-list" id="opdList"></div>
            </div>
        `;
        document.body.appendChild(drawer);
    }

    const close = () => closeOperacionDetalleDrawerInicio();
    backdrop.addEventListener('click', close);
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeOperacionDetalleDrawerInicio();
    });

    // Añadir handle drag-to-close (solo una vez)
    // Adjuntar tanto al handle visual como al header (ambos pueden usarse como handle)
    const h = drawer.querySelector('#opdHandle');
    if (h) attachSheetDragHandler(drawer, h, closeOperacionDetalleDrawerInicio);
    const hdr = drawer.querySelector('.opd-header');
    if (hdr) attachSheetDragHandler(drawer, hdr, closeOperacionDetalleDrawerInicio);

    opdInicioEls = {
        backdrop,
        drawer,
        title: drawer.querySelector('#opdTitle'),
        subtitle: drawer.querySelector('#opdSubtitle'),
        list: drawer.querySelector('#opdList'),
    };
    return opdInicioEls;
}

function showOperacionDetalleDrawerInicioElements(){
    const els = ensureOperacionDetalleDrawerInicio();
    els.backdrop.style.display = 'block';
    els.drawer.style.display = 'grid';
    // Forzar reflow para que arranque la transición.
    // eslint-disable-next-line no-unused-expressions
    els.drawer.offsetHeight;
    return els;
}

function hideOperacionDetalleDrawerInicioElementsAfterTransition(localId){
    const els = ensureOperacionDetalleDrawerInicio();
    const drawer = els.drawer;

    const onEnd = (e) => {
        if (e.target !== drawer) return;
        if (e.propertyName !== 'transform') return;
        drawer.removeEventListener('transitionend', onEnd);

        if (opdInicioId !== localId) return;
        if (document.body.classList.contains('opd-open')) return;

        els.drawer.style.display = 'none';
        els.backdrop.style.display = 'none';
    };

    drawer.addEventListener('transitionend', onEnd);
}

function closeOperacionDetalleDrawerInicio(reason, immediate){
    document.body.classList.remove('opd-open');
    if (immediate){
        try{
            const els = ensureOperacionDetalleDrawerInicio();
            if (els.drawer){
                els.drawer.style.display = 'none';
                els.drawer.style.transform = '';
                els.drawer.style.transition = '';
            }
            if (els.backdrop){
                els.backdrop.style.display = 'none';
                els.backdrop.style.opacity = '';
            }
        }catch(e){}
    } else {
        hideOperacionDetalleDrawerInicioElementsAfterTransition(opdInicioId);
    }
}

function buildOpdItem(label, sub, value, valueClass){
    const safeLabel = escapeHtml(String(label ?? ''));
    const safeSub = escapeHtml(String(sub ?? ''));
    const safeValue = escapeHtml(String(value ?? ''));
    return `
        <div class="opd-item">
            <div>
                <h4>${safeLabel}</h4>
                ${safeSub ? `<small>${safeSub}</small>` : ''}
            </div>
            <div class="opd-value ${valueClass || ''}">${safeValue}</div>
        </div>
    `;
}

async function openOperacionDetalleDrawerInicio(item, tipo){
    opdInicioId++;
    const localId = opdInicioId;
    const els = showOperacionDetalleDrawerInicioElements();
    const isDeuda = tipo === 'deudas';
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

    const montoRaw = item.Monto ?? item.monto ?? item.Amount ?? item.amount ?? 0;
    const montoNum = Number(montoRaw) || 0;
    const monto = formatter.format(montoNum);

    const creadoRaw = item.Creado ?? item.creado ?? item.fecha ?? item.created_at ?? '';
    const fecha = formatDate(creadoRaw);

    if (els.title) els.title.textContent = isDeuda ? 'Detalle de Deuda' : 'Detalle de Pago';
    if (els.subtitle) els.subtitle.textContent = String(fecha || '');

    const valueClass = isDeuda ? 'opd-value--danger' : 'opd-value--success';

    const categoria = String(item.Categoria || item.categoria || item.Detalle || item.detalle || '').trim();
    const telefono = String(item.Telefono_cliente || item.telefono_cliente || '').trim();

    let html = '';
    html += buildOpdItem('Monto', isDeuda ? 'Deuda registrada' : 'Pago recibido', monto, valueClass);
    if (categoria) html += buildOpdItem('Categoría', 'Concepto o detalle', categoria);
    if (telefono) html += buildOpdItem('Teléfono', 'Cliente asociado', telefono);
    html += buildOpdItem('Cliente', 'Nombre (si está cargado)', 'Cargando…');

    // Otros campos (sin IDs)
    const ignored = new Set([
        'monto','amount','creado','created_at','fecha','categoria','detalle','telefono_cliente','cliente','client',
        'id','id_deuda','id_pago','id_negocio','tipo'
    ]);

    Object.keys(item || {}).forEach((k) => {
        const key = String(k);
        const lower = key.toLowerCase();
        if (ignored.has(lower)) return;
        if (lower.startsWith('id_') || lower.endsWith('_id') || lower === 'idnegocio') return;
        const v = item[k];
        if (v === null || v === undefined) return;
        let display = '';
        if (typeof v === 'object') {
            try { display = JSON.stringify(v); } catch(e) { display = String(v); }
        } else {
            display = String(v);
        }
        if (!String(display).trim()) return;
        html += buildOpdItem(key, '', display);
    });

    if (els.list) els.list.innerHTML = html;
    // Evitar que un cierre anterior oculte si reabrimos rápido.
    if (opdInicioId === localId) document.body.classList.add('opd-open');

    // Reemplazar el placeholder de Cliente
    try{
        const nombre = await obtenerNombreCliente(item.Telefono_cliente);
        if (nombre && els.list){
            const items = els.list.querySelectorAll('.opd-item');
            const clienteRow = Array.from(items).find(x => (x.querySelector('h4')?.textContent || '') === 'Cliente');
            if (clienteRow){
                const val = clienteRow.querySelector('.opd-value');
                if (val) val.textContent = nombre;
            }
        }
    }catch(e){
        // no-op
    }
}

async function obtenerNombreCliente(telefono) {
    if (!telefono) return null;
    let q = client
        .from('Clientes')
        .select('Nombre')
        .eq('Telefono', telefono);
    q = applyIdNegocioFilter(q);
    const { data, error } = await q.single();

    if (error) {
        console.error('Error al obtener el nombre del cliente:', error);
        return null;
    }
    return data?.Nombre ?? null;
}

async function recargarTabla() {
    if (currentOpView) {
        await mostrarOperaciones(currentOpView);
    }
}
async function cargarMontoAdeudadoMensual(){
        const { data, error } = await applyIdNegocioFilter(
                client
                        .from('Clientes')
                        .select('Deuda_Activa')
        );
    if (error) {
      showErrorToast(error.message);
      return 0;
    }
    console.log(data);
    const totalMensual = (data || []).reduce((acc, row) => acc + (Number(row.Deuda_Activa) || 0), 0);
    const indicadorMonto = document.getElementById('total_adeudado_mes');
    const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
    indicadorMonto.textContent = formatter.format(totalMensual);
    // Guardar valor numérico sin formato para lógica de color
    indicadorMonto.dataset.valor = String(totalMensual);
    actualizarColor(indicadorMonto);
    return;
}
function actualizarColor(indicador){
    const valorStr = (indicador && indicador.dataset && indicador.dataset.valor) ? indicador.dataset.valor : indicador.textContent;
    const valor = parseFloat(valorStr);
    if (Number.isNaN(valor)) return;
    if (valor === 0) {
        const isLight = document.documentElement?.dataset?.theme === 'light'
        indicador.style.color = isLight ? 'var(--text)' : 'white';
    } else if (valor > 0 && valor <=100000){
        indicador.style.color = 'green';
    }
    else if (valor > 100000 && valor <= 300000){
        indicador.style.color = 'orange';
    }
    else{
        indicador.style.color = 'red';
    }
}
async function recargarMontos(){
    await cargarMontoAdeudadoMensual();
}
window.recargarMontos=recargarMontos;
window.recargarTabla = recargarTabla;

const __deudaTotalEl = document.getElementById("deuda_total");
if (__deudaTotalEl){
__deudaTotalEl.addEventListener("click", async function() {
    // Abrir usando el mismo drawer que el detalle de deuda/pago (opd-*)
    opdInicioId++;
    const localId = opdInicioId;
    const els = showOperacionDetalleDrawerInicioElements();

    if (els.title) els.title.textContent = 'Desglose de Deuda Total Activa';
    if (els.subtitle) els.subtitle.textContent = 'Clientes con saldo pendiente';
    if (els.list) els.list.innerHTML = '<div class="loading-state">Cargando…</div>';
    if (opdInicioId === localId) document.body.classList.add('opd-open');

    try{
        let q = client
            .from('Clientes')
            .select('Nombre, Telefono, Deuda_Activa')
            .gt('Deuda_Activa', 0)
            .order('Deuda_Activa', { ascending: false });
        q = applyIdNegocioFilter(q);
        const { data, error } = await q;

        if (error) {
            if (els.list) els.list.innerHTML = `<div class="opd-list">${buildOpdItem('Error', '', String(error.message || error), 'opd-value--danger')}</div>`;
            return;
        }
        if (!data || data.length === 0) {
            if (els.list) els.list.innerHTML = `<div class="opd-list">${buildOpdItem('Sin resultados', '', 'No hay clientes con deuda activa.', '')}</div>`;
            return;
        }

        const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
        let totalDeuda = 0;

        let html = '<h4 class="opd-section-title">Clientes</h4><div class="opd-list">';
        data.forEach((cliente) => {
            const nombre = String(cliente?.Nombre ?? '').trim();
            const tel = String(cliente?.Telefono ?? '').trim();
            const deuda = Number(cliente?.Deuda_Activa) || 0;
            totalDeuda += deuda;
            html += buildOpdItem(nombre || 'Cliente', tel ? `Tel: ${tel}` : '', formatter.format(deuda), 'opd-value--danger');
        });
        html += '</div>';

        html += '<h4 class="opd-section-title" style="margin-top:14px;">Total</h4>';
        html += `<div class="opd-list">${buildOpdItem('Total Deuda Activa', 'Suma de clientes con deuda', formatter.format(totalDeuda), 'opd-value--danger')}</div>`;

        if (els.list) els.list.innerHTML = html;
    }catch(err){
        console.error(err);
        if (els.list) els.list.innerHTML = `<div class="opd-list">${buildOpdItem('Error', '', 'Error al cargar el desglose.', 'opd-value--danger')}</div>`;
    }
});
}

function textoB(){
    const tiempo_actual = new Date();
    const texo_cont = document.getElementById("bienvenida");
    const nombre = localStorage.getItem("UserName");
    if (tiempo_actual.getHours() >= 5 && tiempo_actual.getHours() < 12) {
        return `¡Buenos días, ${nombre}!`;
    } else if (tiempo_actual.getHours() >= 12 && tiempo_actual.getHours() < 18) {
        return `¡Buenas tardes, ${nombre}!`;
    } else {
        return `¡Buenas noches, ${nombre}!`;
    }
}