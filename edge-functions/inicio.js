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

  const client = await loadSupabaseForEdge();

  try {
    if (action === "searchClientes") {
      const term = String(body?.term ?? "").trim();
      if (!term) return json({ data: [] });

      const orQuery = `Nombre.ilike.%${term}%,Telefono.ilike.%${term}%`;
      let q = client
        .from('Clientes')
        .select('Nombre, Telefono')
        .or(orQuery)
        .limit(50);
      q = applyIdNegocioFilter(q);
      const { data, error } = await q;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "registrarOperacion") {
      const tipo = body?.tipo === 'pago' ? 'pago' : 'deuda';
      const categoria = String(body?.categoria ?? '').trim();
      const monto = Number(body?.monto);
      const phoneValue = body?.phoneValue ?? null;

      if (!Number.isFinite(monto) || monto <= 0) {
        return json({ error: "Monto inválido" }, 400);
      }

      const payload = {
        Monto: monto,
        Categoria: categoria,
        Telefono_cliente: phoneValue,
      };

      const idNegocio = getIdNegocioForWrite();
      if (idNegocio === undefined) {
        return json({ error: "No se encontró el ID de usuario (UserID)." }, 400);
      }
      payload.ID_Negocio = idNegocio;

      const table = tipo === 'deuda' ? 'Deudas' : 'Pagos';
      const { error } = await client.from(table).insert(payload);
      if (error) return json({ error: error.message || String(error) }, 400);

      if (phoneValue) {
        let qClient = client
          .from('Clientes')
          .select('Deuda_Activa')
          .eq('Telefono', phoneValue);
        qClient = applyIdNegocioFilter(qClient);
        const { data: clientData, error: selectError } = await qClient.single();
        if (selectError) {
          return json({
            data: { inserted: true },
            warning: selectError.message || String(selectError),
          });
        }

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
        if (updError) {
          return json({
            data: { inserted: true },
            warning: updError.message || String(updError),
          });
        }
      }

      return json({ data: { ok: true } });
    }

    if (action === "cargarPagosRecientes") {
      const { data, error } = await applyIdNegocioFilter(
        client
          .from('Pagos')
          .select('*')
      ).order('Creado', { ascending: false });
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "cargarDeudasRecientes") {
      const { data, error } = await applyIdNegocioFilter(
        client
          .from('Deudas')
          .select('*')
      ).order('Creado', { ascending: false });
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    if (action === "obtenerNombreCliente") {
      const telefono = body?.telefono;
      if (!telefono) return json({ data: null });

      let q = client
        .from('Clientes')
        .select('Nombre')
        .eq('Telefono', telefono);
      q = applyIdNegocioFilter(q);
      const { data, error } = await q.single();
      if (error) return json({ data: null });
      return json({ data: data?.Nombre ?? null });
    }

    if (action === "cargarMontoAdeudadoMensual") {
      const { data, error } = await applyIdNegocioFilter(
        client
          .from('Clientes')
          .select('Deuda_Activa')
      );
      if (error) return json({ error: error.message || String(error) }, 400);
      const totalMensual = (data || []).reduce(
        (acc, row) => acc + (Number(row.Deuda_Activa) || 0),
        0
      );
      return json({ data: { totalMensual } });
    }

    if (action === "listarClientesConDeuda") {
      let q = client
        .from('Clientes')
        .select('Nombre, Telefono, Deuda_Activa')
        .gt('Deuda_Activa', 0)
        .order('Deuda_Activa', { ascending: false });
      q = applyIdNegocioFilter(q);
      const { data, error } = await q;
      if (error) return json({ error: error.message || String(error) }, 400);
      return json({ data: data || [] });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
};
