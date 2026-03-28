function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function loadSupabaseForEdge() {
  const supabaseClientModule = await import("https://esm.sh/@supabase/supabase-js@2");

  const supabaseUrl = 'https://mypinjltofzmlscantol.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cGluamx0b2Z6bWxzY2FudG9sIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjE5ODkzMiwiZXhwIjoyMDc3Nzc0OTMyfQ.Hi_5xlFlRq-Vly658EbeWnUoEbld27xsrUH-EZqdbIg';

  const client = supabaseClientModule.createClient(supabaseUrl, supabaseKey);

  return client;
}

export default async (request) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, { allow: "POST" });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const action = body?.action;
  if (!action) return json({ error: "Missing action" }, 400);

  const userIdFromRequest =
    request.headers.get("x-user-id") ??
    request.headers.get("X-User-Id") ??
    body?.userId ??
    null;

  function getLocalUserId() {
    if (userIdFromRequest === undefined || userIdFromRequest === null) return null;
    const v = String(userIdFromRequest).trim();
    return v ? v : null;
  }

  function getIdNegocioForWrite() {
    const userId = getLocalUserId();
    if (!userId) return undefined; // sesión ausente
    if (userId === 'N/A') return null; // caso especial
    return userId;
  }

  function applyIdNegocioFilter(query) {
    const userId = getLocalUserId();
    if (userId === 'N/A') return query.is('ID_Negocio', null);
    if (!userId) return query.eq('ID_Negocio', '__MISSING_USERID__');
    return query.eq('ID_Negocio', userId);
  }

  const supabase = await loadSupabaseForEdge();

  async function calcularMontoTotalAdeudado(telefono) {
    let q = supabase
      .from('Clientes')
      .select('Deuda_Activa')
      .eq('Telefono', telefono)
      .maybeSingle();
    q = applyIdNegocioFilter(q);
    const { data, error } = await q;
    if (error) {
      return 0;
    }
    return Number(data?.Deuda_Activa) || 0;
  }

  try {
    if (action === "agregarCliente") {
      const nombre = body?.nombre;
      const telefono = body?.telefono;
      const idNegocio = getIdNegocioForWrite();
      if (idNegocio === undefined) {
        return json({ error: "No se encontró el ID de usuario (UserID)." }, 400);
      }
      const { data, error } = await supabase
        .from('Clientes')
        .insert([
          { Nombre: nombre, Telefono: telefono, ID_Negocio: idNegocio }
        ]);
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || null });
    }

    if (action === "fetchAllClientes") {
      const { data, error } = await applyIdNegocioFilter(
        supabase
          .from('Clientes')
          .select('*')
      );
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "buscarClientes") {
      const query = String(body?.query ?? '').trim();
      if (!query) return json({ data: [] });

      const digits = query.replace(/\D+/g, '');
      const orParts = [
        `Nombre.ilike.%${query}%`
      ];
      if (digits.length >= 3) {
        orParts.push(`Telefono.ilike.%${digits}%`);
      } else if (query.length >= 3) {
        orParts.push(`Telefono.ilike.%${query}%`);
      }
      const orFilter = orParts.join(',');

      let q = supabase
        .from('Clientes')
        .select('*')
        .or(orFilter)
        .limit(50);
      q = applyIdNegocioFilter(q);
      const { data, error } = await q;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "guardarEdicionCliente") {
      const oldNombre = body?.oldNombre;
      const oldTelefono = body?.oldTelefono;
      const newNombre = body?.newNombre;
      const newTelefono = body?.newTelefono;
      const deudaParsed = body?.deudaParsed;

      const changedTelefono = newTelefono !== oldTelefono;

      const oldDeuda = await calcularMontoTotalAdeudado(oldTelefono);

      let upd = supabase
        .from('Clientes')
        .update({ Nombre: newNombre, Telefono: newTelefono, Deuda_Activa: Number(deudaParsed) || 0 })
        .eq('Telefono', oldTelefono);
      upd = applyIdNegocioFilter(upd);
      const { error: errCliente } = await upd;
      if (errCliente) return json({ error: errCliente.message || String(errCliente) }, 400);

      if (changedTelefono) {
        let updDeudas = supabase
          .from('Deudas')
          .update({ Telefono_cliente: newTelefono })
          .eq('Telefono_cliente', oldTelefono);
        updDeudas = applyIdNegocioFilter(updDeudas);
        const { error: errDeudas } = await updDeudas;

        let updPagos = supabase
          .from('Pagos')
          .update({ Telefono_cliente: newTelefono })
          .eq('Telefono_cliente', oldTelefono);
        updPagos = applyIdNegocioFilter(updPagos);
        const { error: errPagos } = await updPagos;

        if (errDeudas || errPagos) {
          let rb = supabase
            .from('Clientes')
            .update({ Nombre: oldNombre, Telefono: oldTelefono, Deuda_Activa: Number(oldDeuda) || 0 })
            .eq('Telefono', newTelefono);
          rb = applyIdNegocioFilter(rb);
          await rb;

          const msg = (errDeudas ? `Deudas: ${errDeudas.message}` : '') + (errPagos ? ` Pagos: ${errPagos.message}` : '');
          return json({ error: 'Se revirtió el cambio. ' + msg }, 400);
        }
      }

      return json({ data: { ok: true } });
    }

    if (action === "borrarCliente") {
      const telefono = body?.telefono;
      let del = supabase
        .from('Clientes')
        .delete()
        .eq('Telefono', telefono);
      del = applyIdNegocioFilter(del);
      const { error } = await del;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: { ok: true } });
    }

    if (action === "mostrarOperacionesCliente") {
      const tipo = body?.tipo;
      const telefono = body?.telefono;
      const tabla = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
      let q = supabase
        .from(tabla)
        .select('*')
        .eq('Telefono_cliente', telefono);
      q = applyIdNegocioFilter(q);
      const { data, error } = await q.order('Creado', { ascending: false });
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "calcularMontoTotalPagado") {
      const telefono = body?.telefono;
      let q = supabase
        .from('Pagos')
        .select('Monto')
        .eq('Telefono_cliente', telefono);
      q = applyIdNegocioFilter(q);
      const { data, error } = await q;
      if (error) return json({ error: error.message || String(error) }, 400);
      const total = (data || []).reduce((total, pago) => total + (Number(pago.Monto) || 0), 0);
      return json({ data: { total } });
    }

    if (action === "calcularMontoTotalAdeudado") {
      const telefono = body?.telefono;
      const total = await calcularMontoTotalAdeudado(telefono);
      return json({ data: { total } });
    }

    if (action === "ajustarDeudaActivaCliente") {
      const telefono = body?.telefono;
      const delta = body?.delta;
      const actual = await calcularMontoTotalAdeudado(telefono);
      const next = Math.max(0, (Number(actual) || 0) + (Number(delta) || 0));
      let upd = supabase
        .from('Clientes')
        .update({ Deuda_Activa: next })
        .eq('Telefono', telefono);
      upd = applyIdNegocioFilter(upd);
      const { error } = await upd;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: { ok: true, next } });
    }

    if (action === "editarDeudaActiva") {
      const telefono = body?.telefono;
      const nuevo = body?.nuevo;
      let upd = supabase
        .from('Clientes')
        .update({ Deuda_Activa: nuevo })
        .eq('Telefono', telefono);
      upd = applyIdNegocioFilter(upd);
      const { error: updErr } = await upd;
      if (updErr) return json({ error: updErr.message || String(updErr) }, 400);
      return json({ data: { ok: true } });
    }

    if (action === "eliminarOperacionIndiv") {
      const item = body?.item;
      const tipo = body?.tipo;
      const telefono = body?.telefono;
      const table = (tipo === 'deudas') ? 'Deudas' : 'Pagos';
      const candidates = (tipo === 'deudas')
        ? ['id_deuda','idDeuda','id','ID','Id']
        : ['id_pago','idPago','id','ID','Id'];

      let usedKey = null;
      let idVal = null;
      for (const k of candidates) {
        if (item && item[k] !== undefined && item[k] !== null) { usedKey = k; idVal = item[k]; break; }
      }

      let del = supabase.from(table).delete();
      if (usedKey) {
        del = del.eq(usedKey, idVal);
      } else {
        const matchObj = { };
        if (telefono) matchObj['Telefono_cliente'] = telefono;
        const monto = (item?.Monto ?? item?.monto);
        if (monto !== undefined) matchObj['Monto'] = Number(monto) || 0;
        const fecha = (item?.Creado ?? item?.created_at ?? item?.fecha ?? item?.creado);
        if (fecha !== undefined) matchObj['Creado'] = fecha;
        del = del.match(matchObj);
      }
      del = applyIdNegocioFilter(del);
      const { error } = await del;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: { ok: true } });
    }

    if (action === "eliminarDeudasCliente") {
      const telefono = body?.telefono;
      let del = supabase
        .from('Deudas')
        .delete()
        .eq('Telefono_cliente', telefono);
      del = applyIdNegocioFilter(del);
      const { error } = await del;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: { ok: true } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
};
