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
  const supabaseKey = 'sb_secret_ErQnTdDlgB9BXU66wZMBpg_-hUFZytS';

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

  const client = await loadSupabaseForEdge();

  try {
    if (action === "eliminarCuenta") {
      const userId = body?.userId;
      if (!userId) return json({ error: "Missing userId" }, 400);

      const { error } = await client.auth.admin.deleteUser(userId);
      if (error) return json({ error: error.message || String(error) }, 400);

      return json({ data: { ok: true } });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (e) {
    return json({ error: e?.message || String(e) }, 500);
  }
};
