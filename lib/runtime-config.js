export function getPublicRuntimeConfig() {
  const config = window.__ITM_RUNTIME_CONFIG__;
  if (!config || typeof config !== 'object') {
    throw new Error('runtime-config.js is missing. Generate it before running the app.');
  }
  const supabaseUrl = String(config.supabaseUrl || '').trim();
  const supabasePublishableKey = String(config.supabasePublishableKey || '').trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error('Public Supabase runtime config is incomplete.');
  }
  return {
    supabaseUrl,
    supabasePublishableKey
  };
}
