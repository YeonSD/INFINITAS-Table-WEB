import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ADMIN_EMAIL = 'qscse75359@gmail.com';
const DEFAULT_REPOSITORY = 'YeonSD/INFINITAS-Table-WEB';
const DEFAULT_WORKFLOW = 'publish-snapshot.yml';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json({ error: 'missing_token' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SB_PUBLISHABLE_KEY') || '';
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: 'supabase_env_missing' }, 500);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader }
    }
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return json({ error: 'invalid_user' }, 401);

  const email = String(data.user.email || '').trim().toLowerCase();
  if (email !== ADMIN_EMAIL) return json({ error: 'admin_only' }, 403);

  const githubToken = Deno.env.get('GITHUB_TRIGGER_TOKEN') || '';
  const repository = Deno.env.get('GITHUB_REPOSITORY') || DEFAULT_REPOSITORY;
  const workflow = Deno.env.get('GITHUB_WORKFLOW_FILE') || DEFAULT_WORKFLOW;
  const ref = Deno.env.get('GITHUB_WORKFLOW_REF') || 'main';
  if (!githubToken) return json({ error: 'github_trigger_token_missing' }, 500);

  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      ref,
      inputs: {
        triggered_by_email: data.user.email || '',
        triggered_by_user_id: data.user.id || ''
      }
    })
  });

  if (!response.ok) {
    const message = await response.text();
    return json({ error: `github_dispatch_failed: ${response.status}`, detail: message }, 502);
  }

  return json({
    ok: true,
    message: 'GitHub Actions 배포를 시작했습니다.',
    workflowUrl: `https://github.com/${repository}/actions/workflows/${workflow}`
  });
});
