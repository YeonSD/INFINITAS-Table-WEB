import { normalizeSocialSettings, nowIso } from './utils.js';
import { normalizeProfile } from './data.js';
import { getPublicRuntimeConfig } from './runtime-config.js';

let supabaseClient = null;

export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  if (!window.supabase?.createClient) return null;
  const { supabaseUrl, supabasePublishableKey } = getPublicRuntimeConfig();
  supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return supabaseClient;
}

export async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) throw new Error('DB client unavailable');
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      queryParams: { prompt: 'select_account' }
    }
  });
  if (error) throw error;
}

export async function ensureAuthServerReady(timeoutMs = 4000) {
  const { supabaseUrl, supabasePublishableKey } = getPublicRuntimeConfig();
  if (!supabaseUrl) throw new Error('DB client unavailable');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 0)));
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/health`, {
      method: 'GET',
      headers: {
        apikey: supabasePublishableKey
      },
      signal: controller.signal
    });
    if (response.status >= 500) {
      const error = new Error(`auth_server_${response.status}`);
      error.code = 'auth_server_unavailable';
      throw error;
    }
    return true;
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('auth_server_timeout');
      timeoutError.code = 'auth_server_timeout';
      throw timeoutError;
    }
    throw error;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function signOut() {
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.signOut();
}

export async function getInitialSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session || null;
}

export function onAuthStateChange(callback) {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => callback(event || '', session || null));
  return () => data.subscription.unsubscribe();
}

export async function loadProfileFromCloud(user) {
  const client = getSupabaseClient();
  if (!client || !user) return null;
  const profileRes = await client
    .from('users')
    .select('auth_user_id, infinitas_id, dj_name, google_email, icon_data_url')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  if (!profileRes.data) return null;
  const stateRes = await client
    .from('account_states')
    .select('account_id, tracker_rows, goals, history, last_progress, social_settings, bingo_state')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (stateRes.error) throw stateRes.error;
  return normalizeProfile(profileRes.data, stateRes.data || {}, user);
}

export async function saveProfileToCloud(user, profile, reason = 'manual') {
  const client = getSupabaseClient();
  if (!client || !user || !profile) return;
  const profilePayload = {
    auth_user_id: user.id,
    infinitas_id: profile.infinitasId,
    dj_name: profile.djName,
    google_email: profile.googleEmail || user.email || '',
    icon_data_url: profile.iconDataUrl || '',
    updated_at: nowIso()
  };
  const statePayload = {
    auth_user_id: user.id,
    account_id: user.id,
    tracker_rows: profile.trackerRows || [],
    goals: profile.goals || [],
    history: profile.history || [],
    last_progress: profile.lastProgress || {},
    bingo_state: profile.bingoState || {},
    social_settings: normalizeSocialSettings(profile.socialSettings),
    updated_at: nowIso(),
    update_reason: reason
  };
  const upUser = await client.from('users').upsert(profilePayload, { onConflict: 'auth_user_id' });
  if (upUser.error) throw upUser.error;
  const upState = await client.from('account_states').upsert(statePayload, { onConflict: 'auth_user_id' });
  if (upState.error) throw upState.error;
}

export async function loadAppNotices() {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client
    .from('app_notices')
    .select('id, title, summary, items, published_at, created_at, updated_at')
    .order('published_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function saveAppNotice(user, notice) {
  const client = getSupabaseClient();
  if (!client || !user) throw new Error('DB client unavailable');
  const payload = {
    title: String(notice?.title || '').trim(),
    summary: String(notice?.summary || '').trim(),
    items: Array.isArray(notice?.items) ? notice.items : [],
    published_at: notice?.publishedAt || nowIso(),
    updated_by_user_id: user.id,
    updated_by_email: user.email || ''
  };
  if (String(notice?.id || '').trim()) {
    const { error } = await client
      .from('app_notices')
      .update(payload)
      .eq('id', notice.id);
    if (error) throw error;
    return notice.id;
  }
  const { data, error } = await client
    .from('app_notices')
    .insert({
      ...payload,
      created_by_user_id: user.id,
      created_by_email: user.email || ''
    })
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || '';
}

export async function purgeProfile() {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.rpc('purge_my_social_data');
  if (error) throw error;
}

export async function refreshSocialOverview() {
  const client = getSupabaseClient();
  if (!client) return { overviewRows: [], feedItems: [], followerRows: [] };
  const [overviewRes, followListRes, feedRes] = await Promise.all([
    client.rpc('get_social_overview'),
    client.rpc('get_follow_lists'),
    client.rpc('get_feed_events', { p_limit: 120 })
  ]);
  if (overviewRes.error) throw overviewRes.error;
  let overviewRows = Array.isArray(overviewRes.data) ? overviewRes.data : [];
  if (!followListRes.error && Array.isArray(followListRes.data)) {
    const normalized = followListRes.data.map((r) => ({
      relation_type: 'follow',
      request_id: null,
      peer_user_id: r.peer_user_id,
      dj_name: r.dj_name,
      infinitas_id: r.infinitas_id,
      status: 'accepted',
      created_at: r.created_at,
      direction: r.direction,
      icon_data_url: r.icon_data_url || ''
    }));
    overviewRows = [
      ...overviewRows.filter((r) => r.relation_type !== 'follow'),
      ...normalized
    ];
  }
  return {
    overviewRows,
    feedItems: Array.isArray(feedRes.data) ? feedRes.data : [],
    followerRows: overviewRows.filter((r) => r.relation_type === 'follow' && String(r.direction || '') === 'follower')
  };
}

export async function rpc(fn, params = {}) {
  const client = getSupabaseClient();
  if (!client) throw new Error('DB client unavailable');
  const { data, error } = await client.rpc(fn, params);
  if (error) throw error;
  return data;
}

export function authClient() {
  return getSupabaseClient();
}
