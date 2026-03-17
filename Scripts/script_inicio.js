import {showError, showSuccess, showErrorToast, showSuccessToast, showinfo, showInfoHTML, loadSweetAlert2} from './sweetalert2.js'
import {loadSupabase, loadSupaBseWithAuth} from './supabase.js'
const client= await loadSupabase();
let currentOpView = 'deudas'; // 'deudas' | 'pagos'
let isExpanded = false; // controls whether list shows all items or limited
let operacionIngresoInit = false;

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
    document.getElementById("pfp").src = localStorage.getItem("UserPhoto");
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
    section.hidden = !section.hidden;
    const btn = document.getElementById('btn_realiz_op');
    if (btn) {
        const label = btn.querySelector('.nav-card__title');
        const nextText = section.hidden ? 'Realizar Operación' : 'Cerrar Operación';
        if (label) label.textContent = nextText;
        else btn.textContent = nextText;
        btn.setAttribute('aria-expanded', String(!section.hidden));
    }

    document.body.classList.toggle('op-open', !section.hidden);
    if (!section.hidden){
        // Preparar listeners si aún no se inicializó
        prepararOperacionIngreso();
        const input = document.getElementById('op_clientSearch');
        if (input) setTimeout(() => input.focus(), 0);
    }
}

function prepararOperacionIngreso(){
    if (operacionIngresoInit) return;
    const section = document.getElementById('Operacion-ingreso');
    if (!section) return;

    const input = document.getElementById('op_clientSearch');
    const matches = document.getElementById('op_clientMatches');
    const catInput = document.getElementById('op_category');
    const amount = document.getElementById('op_amount');
    const chkPago = document.getElementById('op_chkPago');
    const chkDeuda = document.getElementById('op_chkDeuda');
    const btnRegistrar = document.getElementById('op_registrar');

    const calc = document.getElementById('op_calc');
    const eq = document.getElementById('op_calc_eq');
    const clear = document.getElementById('op_calc_clear');
    const back = document.getElementById('op_calc_back');

    if (!input || !matches || !catInput || !amount || !chkPago || !chkDeuda || !btnRegistrar || !calc || !eq || !clear || !back) {
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

    // --- LÓGICA DE CALCULADORA ---
    const btns = calc.querySelectorAll('.calc-btn');
    const ops = calc.querySelectorAll('.calc-op');

    let currentDisplay = '0';
    let firstOperand = null;
    let operator = null;
    let waitingForSecondOperand = false;

    function getOperatorSymbol(op) {
        if (op === '+') return '+';
        if (op === '-') return '-';
        if (op === '*') return '×';
        if (op === '/') return '÷';
        return '';
    }

    function updateDisplay(value) {
        currentDisplay = String(value);
        amount.value = currentDisplay;
        amount.placeholder = '';
    }

    function calculate(first, second, op) {
        first = parseFloat(first);
        second = parseFloat(second);
        if (op === '+') return first + second;
        if (op === '-') return first - second;
        if (op === '*') return first * second;
        if (op === '/') return second === 0 ? first : first / second;
        return second;
    }

    function handleDigit(digit) {
        if (waitingForSecondOperand) {
            currentDisplay = digit;
            waitingForSecondOperand = false;
        } else {
            if (currentDisplay === '0') currentDisplay = digit;
            else currentDisplay += digit;
        }
        updateDisplay(currentDisplay);
    }

    function handleDecimal() {
        if (waitingForSecondOperand) {
            currentDisplay = '0.';
            waitingForSecondOperand = false;
            updateDisplay(currentDisplay);
            return;
        }
        if (!currentDisplay.includes('.')) currentDisplay += '.';
        updateDisplay(currentDisplay);
    }

    function handleOperator(nextOperator) {
        if (nextOperator !== '+' && nextOperator !== '-' && nextOperator !== '*' && nextOperator !== '/') return;

        const inputValue = parseFloat(currentDisplay);
        if (operator && waitingForSecondOperand) {
            operator = nextOperator;
            amount.value = String(currentDisplay) + ' ' + getOperatorSymbol(operator);
            return;
        }

        if (firstOperand === null) {
            firstOperand = inputValue;
        } else if (operator) {
            const result = calculate(firstOperand, inputValue, operator);
            firstOperand = result;
            updateDisplay(firstOperand.toFixed(2));
        }

        amount.value = String(currentDisplay) + ' ' + getOperatorSymbol(nextOperator);
        waitingForSecondOperand = true;
        operator = nextOperator;
    }

    function handleEquals() {
        if (operator === null || waitingForSecondOperand) return;
        const inputValue = parseFloat(currentDisplay);
        const result = calculate(firstOperand, inputValue, operator);
        updateDisplay(result.toFixed(2));
        firstOperand = result;
        operator = null;
        waitingForSecondOperand = true;
    }

    function clearCalculator() {
        currentDisplay = '0';
        firstOperand = null;
        operator = null;
        waitingForSecondOperand = false;
        updateDisplay(currentDisplay);
        amount.placeholder = '';
    }

    function backspace() {
        if (waitingForSecondOperand) {
            if (operator) {
                operator = null;
                waitingForSecondOperand = false;
                amount.value = String(currentDisplay);
                return;
            }
            waitingForSecondOperand = false;
        }

        if (!currentDisplay || currentDisplay === '0') return;
        if (currentDisplay.length <= 1 || (currentDisplay.length === 2 && currentDisplay.startsWith('-'))) {
            updateDisplay('0');
        } else {
            updateDisplay(currentDisplay.slice(0, -1));
        }
    }

    btns.forEach(b => b.addEventListener('click', () => {
        const k = b.dataset.key;
        if (k === '.') handleDecimal();
        else handleDigit(k);
    }));

    ops.forEach(o => o.addEventListener('click', () => handleOperator(o.dataset.op)));
    eq.addEventListener('click', handleEquals);
    clear.addEventListener('click', clearCalculator);
    back.addEventListener('click', backspace);

    if (amount.value !== '0') currentDisplay = amount.value;

    // --- Registrar operación ---
    btnRegistrar.addEventListener('click', async () => {
        btnRegistrar.disabled = true;
        try{
            const tipo = chkPago.checked ? 'pago' : 'deuda';
            const name = input.value.trim();
            const categoria = catInput.value.trim();
            const monto = parseFloat(amount.value);

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

async function openRegistroOperacion(){
    await window.loadSweetAlert2();
    const html = `
        <style>
      .swal-reg{display:grid;gap:12px;text-align:left;max-width:100%}
      .swal-reg .reg-row{display:flex;flex-direction:column;gap:8px}
      .swal-reg .reg-matches{max-height:35vh;overflow:auto}
      .swal-reg .reg-amount{width:100% !important;text-align:right !important;font-size:clamp(1.1rem,2.5vw,1.5rem) !important;font-weight:700 !important}
            .swal-reg .swal2-input{width:100% !important;max-width:100%;box-sizing:border-box;display:block;margin:0;text-align:center}
      .swal-reg .calc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:8px}
      .swal-reg .calc-grid button{min-height:44px}
      .swal-reg .reg-actions{margin-top:8px;display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap}
      .swal-reg .btn-clear{padding:10px 16px;border-radius:8px}
      .swal-reg .btn-eq{background-color:#28a745 !important;color:#fff}
            .swal-reg .type-row{display:flex;gap:12px;align-items:center;justify-content:center;flex-wrap:wrap;margin-top:8px}
            /* Modern chips for Pago/Deuda */
            .swal-reg .type-chip{position:relative;display:inline-flex;align-items:center}
            .swal-reg .type-chip input{position:absolute;opacity:0;pointer-events:none}
            .swal-reg .type-chip .chip{display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:999px;border:1px solid var(--border, rgba(255,255,255,0.15));background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02));color:var(--text, #e5e7eb);font-weight:700;letter-spacing:.2px;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .12s ease, box-shadow .2s ease, background .2s ease, border-color .2s ease}
            .swal-reg .type-chip:hover .chip{transform:translateY(-1px);box-shadow:0 8px 22px rgba(0,0,0,.3)}
            .swal-reg .type-chip input:focus + .chip{outline:2px solid var(--ring, #7c3aed);outline-offset:2px}
            .swal-reg .type-chip.pago input:checked + .chip{background:var(--success, #16a34a);color:#fff;border-color:transparent;box-shadow:0 10px 24px rgba(22,163,74,.35), inset 0 -2px 0 rgba(0,0,0,.15)}
            .swal-reg .type-chip.deuda input:checked + .chip{background:var(--danger, #dc2626);color:#fff;border-color:transparent;box-shadow:0 10px 24px rgba(220,38,38,.35), inset 0 -2px 0 rgba(0,0,0,.15)}
            @media (max-width: 480px){
                /* Mantener 4 columnas y posicionar operadores a la derecha */
                .swal-reg .calc-grid{grid-template-columns:repeat(4,1fr)}
                /* Reordenar operadores para incluir división: */
                /* Fila 1: 7 8 9 ÷ */
                #calc .calc-btn[data-key="7"]{grid-column:1;grid-row:1}
                #calc .calc-btn[data-key="8"]{grid-column:2;grid-row:1}
                #calc .calc-btn[data-key="9"]{grid-column:3;grid-row:1}
                #calc .calc-op[data-op="/"]{grid-column:4;grid-row:1}
                /* Fila 2: 4 5 6 × */
                #calc .calc-btn[data-key="4"]{grid-column:1;grid-row:2}
                #calc .calc-btn[data-key="5"]{grid-column:2;grid-row:2}
                #calc .calc-btn[data-key="6"]{grid-column:3;grid-row:2}
                #calc .calc-op[data-op="*"]{grid-column:4;grid-row:2}
                /* Fila 3: 1 2 3 - */
                #calc .calc-btn[data-key="1"]{grid-column:1;grid-row:3}
                #calc .calc-btn[data-key="2"]{grid-column:2;grid-row:3}
                #calc .calc-btn[data-key="3"]{grid-column:3;grid-row:3}
                #calc .calc-op[data-op="-"]{grid-column:4;grid-row:3}
                /* Fila 4: 0 . = + */
                #calc .calc-btn[data-key="0"]{grid-column:1 !important;grid-row:4}
                #calc .calc-btn[data-key="."]{grid-column:2;grid-row:4}
                #calc #calc-eq{grid-column:3;grid-row:4}
                #calc .calc-op[data-op="+"]{grid-column:4;grid-row:4}
                /* Acciones debajo siguen siendo responsivas */
                .swal-reg .reg-actions{justify-content:stretch}
                .swal-reg .btn-clear{flex:1}
            }
    </style>
    <div class="swal-reg">
        <label style="font-weight:600">Buscar Cliente (nombre, apellido o teléfono)</label>
        <input id="clientSearch" class="swal2-input" placeholder="Escribe nombre, apellido o teléfono" style="width:100%">
        <div id="clientMatches" class="reg-matches"></div>

        <label style="font-weight:600">Detalles</label>
        <input id="opCategory" class="swal2-input" placeholder="Detalles (p.ej. Servicio, Producto)" style="width:100%">

        <label style="font-weight:600">Monto</label>
        <input id="opAmount" class="swal2-input reg-amount" value="0"> 
        
        <div id="calc" class="calc-grid">
            <button type="button" class="calc-btn" data-key="7">7</button>
            <button type="button" class="calc-btn" data-key="8">8</button>
            <button type="button" class="calc-btn" data-key="9">9</button>
            <button type="button" class="calc-op" data-op="+">+</button>

            <button type="button" class="calc-btn" data-key="4">4</button>
            <button type="button" class="calc-btn" data-key="5">5</button>
            <button type="button" class="calc-btn" data-key="6">6</button>
            <button type="button" class="calc-op" data-op="-">-</button>

            <button type="button" class="calc-btn" data-key="1">1</button>
            <button type="button" class="calc-btn" data-key="2">2</button>
            <button type="button" class="calc-btn" data-key="3">3</button>
            <button type="button" class="calc-op" data-op="*">×</button>
            <button type="button" class="calc-op" data-op="/">÷</button>
            
            <button type="button" class="calc-btn" data-key="0" style="grid-column: span 2;">0</button>
            <button type="button" class="calc-btn" data-key=".">.</button>
            <button type="button" id="calc-eq" class="btn-eq">=</button>
        </div>
        <!-- Acciones: Backspace (⌫) y Clear (C) -->
        <div class="reg-actions">
            <button type="button" id="calc-back" class="btn-clear" style="background-color:#6b7280 !important; color:white;" title="Borrar un dígito">⌫</button>
            <button type="button" id="calc-clear" class="btn-clear" style="background-color:#d33 !important; color:white;">C</button>
        </div>
        <div>
        <div class="type-row" style="display:flex; gap:12px; align-items:center; margin-top:8px;">
            <label class="type-chip pago" style="cursor:pointer;">
                <input type="checkbox" id="chkPago" onclick="const d=document.getElementById('chkDeuda'); if(this.checked) d.checked=false;">
                <span class="chip">Pago</span>
            </label>
            <label class="type-chip deuda" style="cursor:pointer;">
                <input type="checkbox" id="chkDeuda" onclick="const p=document.getElementById('chkPago'); if(this.checked) p.checked=false;">
                <span class="chip">Deuda</span>
            </label>
        </div>
        </div>
    </div>
    `;

    
    const result = await window.Swal.fire({
        title: 'Registrar Operación',
        html,
        focusConfirm: false,
        showCancelButton: true,
    confirmButtonText: 'Registrar Operación',
        cancelButtonText: 'Cancelar',
        showLoaderOnConfirm: true,
        preConfirm: async () => {
            const nameInput = document.getElementById('clientSearch');
            const catInput = document.getElementById('opCategory');
            const amountInput = document.getElementById('opAmount');
            const tipo = document.getElementById('chkPago').checked ? 'pago' : 'deuda';
            const name = nameInput ? nameInput.value.trim() : '';
            const categoria = catInput ? catInput.value.trim() : '';
            const monto = amountInput ? parseFloat(amountInput.value) : 0;

            if (isNaN(monto) || monto <= 0) {
                window.Swal.showValidationMessage('Ingrese un monto válido mayor a 0');
                return null;
            }
            const matchesEl = document.getElementById('clientMatches');
            let phoneValue = null;
            if (matchesEl && matchesEl.selectedClient) phoneValue = matchesEl.selectedClient.Telefono ?? null;
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
            try{
                const idNegocio = getIdNegocioForWrite();
                if (idNegocio === undefined){
                    window.Swal.showValidationMessage('No se encontró el ID de usuario (UserID). Iniciá sesión nuevamente.');
                    return null;
                }

                payload.ID_Negocio = idNegocio;
                const table = tipo === 'deuda' ? 'Deudas' : 'Pagos';
                const { data, error } = await client.from(table).insert(payload).select();
                if (error){
                    window.Swal.showValidationMessage('Error al registrar: ' + (error.message || error));
                    return null;
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
                        // No abort registration, but inform user
                        window.Swal.showValidationMessage('Error al obtener datos del cliente: ' + (selectError.message || selectError));
                        return null;
                    }

                    const current = Number(clientData?.Deuda_Activa ?? 0) || 0;
                    if (tipo === 'deuda'){
                        const added = Number(payload.Monto) || 0;
                        const newDeuda = parseFloat((current + added).toFixed(2));
                        let upd = client
                            .from('Clientes')
                            .update({ Deuda_Activa: newDeuda })
                            .eq('Telefono', phoneValue);
                        upd = applyIdNegocioFilter(upd);
                        const { error: updError } = await upd;
                        if (updError){
                            console.error('Error al actualizar deuda del cliente', updError);
                            window.Swal.showValidationMessage('Error al actualizar deuda del cliente: ' + (updError.message || updError));
                            return null;
                        }
                    } else if (tipo === 'pago'){
                        const deducted = Number(payload.Monto) || 0;
                        const newDeuda = parseFloat(Math.max(0, current - deducted).toFixed(2));
                        let upd = client
                            .from('Clientes')
                            .update({ Deuda_Activa: newDeuda })
                            .eq('Telefono', phoneValue);
                        upd = applyIdNegocioFilter(upd);
                        const { error: updError } = await upd;
                        if (updError){
                            console.error('Error al actualizar deuda del cliente', updError);
                            window.Swal.showValidationMessage('Error al actualizar deuda del cliente: ' + (updError.message || updError));
                            return null;
                        }
                    }
                }
                return { ok: true };
            }catch(err){
                console.error(err);
                window.Swal.showValidationMessage('Error al registrar la operación');
                return null;
            }
        },
        didOpen: () => {
            // wire up search
            const input = document.getElementById('clientSearch');
            const matches = document.getElementById('clientMatches');
            const amount = document.getElementById('opAmount');

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
                    if (error) { console.error(error); matches.innerHTML = '<div class="muted">Error de búsqueda</div>'; return; }
                    if (!data || data.length === 0) { matches.innerHTML = '<div class="muted">No hay coincidencias</div>'; return; }
                    
                    data.forEach(c => {
                        const div = document.createElement('div');
                        div.style.padding = '6px';
                        div.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
                        div.style.cursor = 'pointer';
                        // NOTA: Se asume que la función escapeHtml está definida.
                        div.innerHTML = `<strong>${escapeHtml(c.Nombre ?? '')} ${escapeHtml(c.Apellido ?? '')}</strong><br><small class="muted">${escapeHtml(c.Telefono ?? '')}</small>`;
                        div.addEventListener('click', () => {
                            input.value = `${c.Nombre ?? ''} ${c.Apellido ?? ''}`.trim() || (c.Telefono ?? '');
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

            if (input) {
                input.addEventListener('input', () => {
                    clearTimeout(debounceTimer);
                    debounceTimer = setTimeout(() => loadMatches(input.value.trim()), 250);
                });
                if (input.value && input.value.trim()) loadMatches(input.value.trim());
            }

            // --- LÓGICA DE CALCULADORA (Solo + y -) ---
            const btns = document.querySelectorAll('#calc .calc-btn');
            const ops = document.querySelectorAll('#calc .calc-op');
            const eq = document.getElementById('calc-eq');
            const clear = document.getElementById('calc-clear');
            const back = document.getElementById('calc-back');
            
            let currentDisplay = '0';
            let firstOperand = null;
            let operator = null;
            let waitingForSecondOperand = false;

            function getOperatorSymbol(op) {
                if (op === '+') return '+';
                if (op === '-') return '-';
                if (op === '*') return '×';
                if (op === '/') return '÷';
                return '';
            }

            function updateDisplay(value) {
                currentDisplay = String(value);
                if (amount) {
                    amount.value = currentDisplay;
                    // Al actualizar la pantalla, limpiamos cualquier placeholder previo
                    amount.placeholder = '';
                }
            }

            function calculate(first, second, op) {
                first = parseFloat(first);
                second = parseFloat(second);
                // Soportar suma, resta y multiplicación
                if (op === '+') return first + second;
                if (op === '-') return first - second;
                if (op === '*') return first * second;
                if (op === '/') return second === 0 ? first : first / second; // evita división por cero

                return second; // Si no hay operador válido, devuelve el segundo operando.
            }

            function handleDigit(digit) {
                if (waitingForSecondOperand) {
                    currentDisplay = digit;
                    waitingForSecondOperand = false;
                } else {
                    if (currentDisplay === '0') currentDisplay = digit;
                    else currentDisplay += digit;
                }
                updateDisplay(currentDisplay);
            }

            function handleDecimal() {
                if (waitingForSecondOperand) {
                    currentDisplay = '0.';
                    waitingForSecondOperand = false;
                    updateDisplay(currentDisplay);
                    return;
                }
                if (!currentDisplay.includes('.')) {
                    currentDisplay += '.';
                }
                updateDisplay(currentDisplay);
            }

            function handleOperator(nextOperator) {
                // Permitimos +, - y *
                if (nextOperator !== '+' && nextOperator !== '-' && nextOperator !== '*' && nextOperator !== '/') return;

                const inputValue = parseFloat(currentDisplay);


                // Si ya hay un operador y estamos esperando segundo operando,
                // simplemente cambiamos el operador y actualizamos la visualización (value).
                if (operator && waitingForSecondOperand) {
                    operator = nextOperator;
                    // mostrar el nuevo símbolo junto al valor actual en el value
                    if (amount) amount.value = String(currentDisplay) + ' ' + getOperatorSymbol(operator);
                    return;
                }

                if (firstOperand === null) {
                    firstOperand = inputValue;
                } else if (operator) {
                    const result = calculate(firstOperand, inputValue, operator);
                    firstOperand = result;
                    updateDisplay(firstOperand.toFixed(2));
                }

                // Mostrar el operador en el campo de monto (junto al número actual) usando value
                if (amount) amount.value = String(currentDisplay) + ' ' + getOperatorSymbol(nextOperator);

                waitingForSecondOperand = true;
                operator = nextOperator;
            }

            function handleEquals() {
                if (operator === null || waitingForSecondOperand) {
                    return;
                }
                const inputValue = parseFloat(currentDisplay);
                let secondOperand = inputValue;
                
                const result = calculate(firstOperand, secondOperand, operator);
                
                // Mostrar resultado en pantalla
                updateDisplay(result.toFixed(2));
                // Al finalizar la operación, limpiar el placeholder pues mostramos el resultado
                if (amount) amount.placeholder = '';
                firstOperand = result;
                operator = null;
                waitingForSecondOperand = true;
            }

            function clearCalculator() {
                currentDisplay = '0';
                firstOperand = null;
                operator = null;
                waitingForSecondOperand = false;
                updateDisplay(currentDisplay);
                if (amount) amount.placeholder = '';
            }

            function backspace() {
                // Si estamos esperando el segundo operando y hay operador, quitamos el operador
                if (waitingForSecondOperand) {
                    if (operator) {
                        operator = null;
                        waitingForSecondOperand = false;
                        if (amount) amount.value = String(currentDisplay);
                        return;
                    } else {
                        waitingForSecondOperand = false;
                    }
                }

                // Operar sobre el número mostrado
                if (!currentDisplay || currentDisplay === '0') return;
                if (currentDisplay.length <= 1 || (currentDisplay.length === 2 && currentDisplay.startsWith('-'))) {
                    updateDisplay('0');
                } else {
                    updateDisplay(currentDisplay.slice(0, -1));
                }
            }

            // Event Listeners
            btns.forEach(b => b.addEventListener('click', () => {
                const k = b.dataset.key;
                if (k === '.') {
                    handleDecimal();
                } else {
                    handleDigit(k);
                }
            }));

            ops.forEach(o => o.addEventListener('click', () => {
                handleOperator(o.dataset.op);
            }));

            if (eq) eq.addEventListener('click', handleEquals);
            if (clear) clear.addEventListener('click', clearCalculator);
            if (back) back.addEventListener('click', backspace);

            // Sincronizar el input de monto con la lógica de la calculadora al inicio
            if (amount.value !== '0') {
                currentDisplay = amount.value;
            }
        }
    });

    // Si el preConfirm devolvió ok, mostrar toast y recargar UI
    if (result && result.isConfirmed && result.value && result.value.ok) {
        showSuccessToast('Operación registrada correctamente');
        try { await recargarMontos(); } catch(e){}
        try { await recargarTabla(); } catch(e){}
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
    // 1. Build the HTML summary using <strong> and <br>
    const lines = [];

    // Flatten known fields (case-insensitive)
    const montoRaw = item.Monto ?? item.monto ?? item.Amount ?? item.amount ?? '';
    // Asegúrate de que escapeHtml y formatDate estén definidas en tu entorno
    const monto = escapeHtml(String(montoRaw)); 

    const creadoRaw = item.Creado ?? item.creado ?? item.fecha ?? item.created_at ?? '';
    const creado = escapeHtml(formatDate(creadoRaw));

    // --- Campos Principales ---
    const cliente = item.Cliente ?? item.cliente ?? item.client;
    if (cliente !== undefined && cliente !== null && String(cliente).trim() !== '') {
        // Usamos <strong> para la negrita en HTML
        lines.push(`<strong>Cliente:</strong> ${escapeHtml(String(cliente))}`);
    }

    // Llama a la función asíncrona para obtener el nombre
    const nombreCliente = await obtenerNombreCliente(item.Telefono_cliente);
    if (nombreCliente) {
        lines.push(`<strong>Nombre Cliente:</strong> ${escapeHtml(String(nombreCliente))}`);
    }

    // No mostrar el campo "Tipo" para registros de tipo 'deudas' o 'pagos' según solicitud
    if (tipo !== 'deudas' && tipo !== 'pagos') {
        lines.push(`<strong>Tipo:</strong> ${tipo === 'deudas' ? 'Deuda' : 'Pago'}`);
    }
    
    lines.push(`<strong>Monto:</strong> ${monto}`);
    lines.push(`<strong>Fecha:</strong> ${creado}`);

    // --- Otros Campos ---
    // Campos a ignorar (comprobación case-insensitive). Añadimos id_deuda y tipo
    const ignoredList = [
        'Monto', 'monto', 'Amount', 'amount',
        'Creado', 'creado', 'fecha', 'created_at',
        'Cliente', 'cliente', 'client', 'Telefono_cliente',
        'id_deuda', 'idDeuda', 'idDeuda', 'id_pago', 'idPago', 'idPago', 'tipo', 'Tipo'
        
    ];
    const ignored = new Set(ignoredList.map(x => String(x).toLowerCase()));

    Object.keys(item).forEach((k) => {
        if (ignored.has(String(k).toLowerCase())) return;
        const v = item[k];
        let display;
        if (v === null || v === undefined) {
            display = '';
        } else if (typeof v === 'object') {
            try {
                display = JSON.stringify(v);
            } catch (e) {
                display = String(v);
            }
        } else {
            display = String(v);
        }
        // Usamos <strong> y </strong> para la clave
        lines.push(`<strong>${escapeHtml(String(k))}:</strong> ${escapeHtml(display)}`);
    });

    // 2. Unir las líneas con <br> (salto de línea de HTML)
    const htmlContent = lines.join('<br>');

    // 3. Usar Swal.fire con la opción 'html'
    try {
        await showInfoHTML(htmlContent);
    } catch (e) {
        // Fallback a alert: convierte el HTML a texto plano con \n
        const textPlain = htmlContent.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '');
        alert(textPlain);
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
        showError('Error al obtener el nombre del cliente:', error);
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
    const Swal = await loadSweetAlert2();
    await Swal.fire({
        title: 'Desglose de Deuda Total Activa',
        html: 'Cargando...',
        didOpen: async () => {
            let q = client
                .from('Clientes')
                .select('Nombre, Telefono, Deuda_Activa')
                .gt('Deuda_Activa', 0)
                .order('Deuda_Activa', { ascending: false });
            q = applyIdNegocioFilter(q);
            const { data, error } = await q;
            if (error) {
                Swal.getHtmlContainer().innerHTML = 'Error al cargar los datos: ' + escapeHtml(error.message);
                return;
            }
            if (!data || data.length === 0) {
                Swal.getHtmlContainer().innerHTML = 'No hay clientes con deuda activa.';
                return;
            }
            const formatter = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
            let totalDeuda = 0;
            let html = '<div id="deuda-breakdown" style="display:grid; gap:8px;">';
            data.forEach(cliente => {
                const nombreCompleto = cliente.Nombre || '';
                const telefono = cliente.Telefono || '';
                const deuda = Number(cliente.Deuda_Activa) || 0;
                totalDeuda += deuda;
                html += `
                    <div class="op-item" style="border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="font-weight:600;">${escapeHtml(nombreCompleto)}</div>
                                <div class="muted" style="font-size:0.85rem;">${escapeHtml(telefono)}</div>
                            </div>
                            <div style="font-weight:700; color:var(--danger)">${formatter.format(deuda)}</div>
                        </div>
                    </div>`;
            });
            // Total de deuda activa acumulada, bien formateado
            html += `
                <div class="op-item" style="border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:12px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                        <div class="muted" style="font-weight:600;">Total Deuda Activa</div>
                        <div style="font-weight:700; color:var(--danger);">${formatter.format(totalDeuda)}</div>
                    </div>
                </div>`;
            html += '</div>';
            Swal.getHtmlContainer().innerHTML = html;
        }
    })
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