export default async (request: Request, context: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const userId = (body && body.userId) ? String(body.userId) : null;
  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId required' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const SUPA_KEY = context?.env?.supa_key || context?.env?.SUPABASE_SERVICE_ROLE_KEY || context?.env?.SUPABASE_KEY;
  const SUPA_URL = context?.env?.supa_url || context?.env?.SUPABASE_URL || 'https://mypinjltofzmlscantol.supabase.co';

  if (!SUPA_KEY) {
    return new Response(JSON.stringify({ error: 'Server misconfigured: missing supa_key' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    // Validate the caller token and retrieve caller id
    const userRes = await fetch(`${SUPA_URL}/auth/v1/user`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'apikey': SUPA_KEY
      }
    });

    if (!userRes.ok) {
      const txt = await userRes.text().catch(() => null);
      return new Response(JSON.stringify({ error: 'Invalid auth token', detail: txt }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const caller = await userRes.json().catch(() => null);
    const callerId = caller?.id;
    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Unable to validate token' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Only allow users to delete their own account (caller must match userId)
    if (callerId !== userId) {
      return new Response(JSON.stringify({ error: 'Forbidden: only account owner can delete their account' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Perform admin delete using service_role key
    const delRes = await fetch(`${SUPA_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${SUPA_KEY}`,
        'apikey': SUPA_KEY
      }
    });

    const delText = await delRes.text().catch(() => null);
    if (!delRes.ok) {
      return new Response(JSON.stringify({ error: 'Failed to delete user', detail: delText }), { status: delRes.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Server error', detail: String(err) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
}
