import { normalizeSocialSettings } from './utils.js';

const DEFAULT_MAX_PERSISTED_HISTORY_ENTRIES = 60;
const DEFAULT_MAX_PERSISTED_HISTORY_SNAPSHOTS = 3;

function cloneArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function compactPersistedHistory(history, limits = {}) {
  const maxEntries = Math.max(1, Number(limits.maxEntries || DEFAULT_MAX_PERSISTED_HISTORY_ENTRIES));
  const maxSnapshots = Math.max(0, Number(limits.maxSnapshots ?? DEFAULT_MAX_PERSISTED_HISTORY_SNAPSHOTS));
  const normalized = Array.isArray(history) ? history.slice(-maxEntries) : [];
  return normalized.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    if (index >= normalized.length - maxSnapshots) return entry;
    if (!('snapshotRows' in entry) && !('snapshotProgress' in entry)) return entry;
    const compacted = { ...entry };
    delete compacted.snapshotRows;
    delete compacted.snapshotProgress;
    return compacted;
  });
}

export function buildUserProfilePayload(user, profile, timestamp) {
  if (!user || !profile) return null;
  return {
    auth_user_id: user.id,
    infinitas_id: profile.infinitasId,
    dj_name: profile.djName,
    google_email: profile.googleEmail || user.email || '',
    icon_data_url: profile.iconDataUrl || '',
    updated_at: timestamp
  };
}

export function buildAccountStatePatchPayload(user, patch = {}, reason = 'manual', timestamp) {
  if (!user) return null;
  const payload = {
    auth_user_id: user.id,
    account_id: user.id,
    updated_at: timestamp,
    update_reason: reason
  };
  if ('trackerRows' in patch) payload.tracker_rows = cloneArray(patch.trackerRows);
  if ('goals' in patch) payload.goals = cloneArray(patch.goals);
  if ('history' in patch) payload.history = cloneArray(patch.history);
  if ('lastProgress' in patch) payload.last_progress = cloneObject(patch.lastProgress);
  if ('bingoState' in patch) payload.bingo_state = cloneObject(patch.bingoState);
  if ('socialSettings' in patch) payload.social_settings = normalizeSocialSettings(patch.socialSettings);
  return payload;
}

export function buildFullAccountStatePayload(user, profile, reason = 'manual', timestamp) {
  return buildAccountStatePatchPayload(user, {
    trackerRows: profile?.trackerRows,
    goals: profile?.goals,
    history: compactPersistedHistory(profile?.history),
    lastProgress: profile?.lastProgress,
    bingoState: profile?.bingoState,
    socialSettings: profile?.socialSettings
  }, reason, timestamp);
}
