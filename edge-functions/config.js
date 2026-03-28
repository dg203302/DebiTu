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
