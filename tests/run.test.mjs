import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalizeBingoState } from '../lib/data.js';
import { getDeferredPanelRenderers } from '../lib/render-plan.js';
import { buildAccountStatePatchPayload, buildFullAccountStatePayload, buildUserProfilePayload } from '../lib/profile-storage.js';
import { goalAchieved, goalLabel } from '../lib/utils.js';

function headerMap(vercelConfig) {
  const rootRule = (vercelConfig.headers || []).find((rule) => rule.source === '/(.*)');
  return new Map((rootRule?.headers || []).map((header) => [header.key, header.value]));
}

function tableCount(snapshot, tableKey) {
  return (snapshot?.rankTables?.[tableKey]?.categories || []).reduce((sum, category) => sum + (category?.items?.length || 0), 0);
}

test('account state patch payload stores only requested sections', () => {
  const payload = buildAccountStatePatchPayload(
    { id: 'user-1' },
    {
      bingoState: { activeBoardId: 'b1' },
      goals: [{ id: 'goal-1' }]
    },
    'bingo-save',
    '2026-04-05T00:00:00.000Z'
  );
  assert.equal(payload.auth_user_id, 'user-1');
  assert.equal(payload.account_id, 'user-1');
  assert.equal(payload.update_reason, 'bingo-save');
  assert.deepEqual(payload.bingo_state, { activeBoardId: 'b1' });
  assert.deepEqual(payload.goals, [{ id: 'goal-1' }]);
  assert.ok(!('tracker_rows' in payload));
  assert.ok(!('history' in payload));
  assert.ok(!('social_settings' in payload));
});

test('full profile payload still contains all persisted sections', () => {
  const user = { id: 'user-2', email: 'dj@example.com' };
  const profile = {
    infinitasId: 'C-1111-2222-3333',
    djName: 'DJ TEST',
    googleEmail: 'dj@example.com',
    iconDataUrl: 'data:image/png;base64,abc',
    trackerRows: [{ title: 'A' }],
    goals: [{ id: 'g1' }],
    history: [{ id: 'h1' }],
    lastProgress: { updated: true },
    bingoState: { activeBoardId: 'b1' },
    socialSettings: { discoverability: 'searchable' }
  };
  const userPayload = buildUserProfilePayload(user, profile, '2026-04-05T00:00:00.000Z');
  const statePayload = buildFullAccountStatePayload(user, profile, 'profile-save', '2026-04-05T00:00:00.000Z');
  assert.equal(userPayload.dj_name, 'DJ TEST');
  assert.equal(userPayload.google_email, 'dj@example.com');
  assert.deepEqual(statePayload.tracker_rows, [{ title: 'A' }]);
  assert.deepEqual(statePayload.history, [{ id: 'h1' }]);
  assert.deepEqual(statePayload.last_progress, { updated: true });
  assert.deepEqual(statePayload.bingo_state, { activeBoardId: 'b1' });
  assert.equal(statePayload.social_settings.discoverability, 'searchable');
});

test('saveProfileToCloud no longer uses full account state overwrite path', () => {
  const authSource = fs.readFileSync(new URL('../lib/auth.js', import.meta.url), 'utf8');
  const match = authSource.match(/export async function saveProfileToCloud[\s\S]*?\n}\n/);
  assert.ok(match, 'saveProfileToCloud definition should exist');
  assert.doesNotMatch(match[0], /saveFullAccountStateToCloud\(/);
  assert.match(match[0], /saveProgressStateToCloud\(/);
  assert.match(match[0], /saveBingoStateToCloud\(/);
  assert.match(match[0], /saveSocialSettingsToCloud\(/);
});

test('deferred panel render plan only includes the active dock panel group', () => {
  assert.deepEqual(getDeferredPanelRenderers('rank'), []);
  assert.deepEqual(getDeferredPanelRenderers('history'), ['history']);
  assert.deepEqual(getDeferredPanelRenderers('goals'), ['goalCandidates', 'goals', 'songGoalBingoPicker']);
  assert.deepEqual(getDeferredPanelRenderers('social'), ['social']);
  assert.deepEqual(getDeferredPanelRenderers('settings'), []);
});

test('app.js delegates account and render orchestration to dedicated controllers', () => {
  const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(appSource, /import \{ createAccountController \} from '\.\/lib\/app-account-controller\.js';/);
  assert.match(appSource, /import \{ createAdminController \} from '\.\/lib\/app-admin-controller\.js';/);
  assert.match(appSource, /import \{ createDataController \} from '\.\/lib\/app-data-controller\.js';/);
  assert.match(appSource, /import \{ createInteractionController \} from '\.\/lib\/app-interaction-controller\.js';/);
  assert.match(appSource, /import \{ createRenderController \} from '\.\/lib\/app-render-controller\.js';/);
  assert.doesNotMatch(appSource, /function normalizeBingoSize\(/);
  assert.doesNotMatch(appSource, /function ensureBingoState\(/);
  assert.doesNotMatch(appSource, /function openBingoSizeDialog\(/);
  assert.doesNotMatch(appSource, /async function applyTrackerContent\(/);
  assert.doesNotMatch(appSource, /function ensureTsvInput\(/);
  assert.doesNotMatch(appSource, /function ensureGoalImportInput\(/);
  assert.doesNotMatch(appSource, /function loadGuestProfileCache\(/);
  assert.doesNotMatch(appSource, /function persistGuestProfileCache\(/);
  assert.doesNotMatch(appSource, /function readPendingSignupDraft\(/);
  assert.doesNotMatch(appSource, /function writePendingSignupDraft\(/);
  assert.doesNotMatch(appSource, /function clearPendingSignupDraft\(/);
  assert.doesNotMatch(appSource, /async function refreshAppNotices\(/);
  assert.doesNotMatch(appSource, /async function loadStaticData\(/);
  assert.doesNotMatch(appSource, /function openNoticeEditor\(/);
  assert.doesNotMatch(appSource, /function openSongMetaEditor\(/);
  assert.doesNotMatch(appSource, /async function saveSongMetaEditor\(/);
  assert.doesNotMatch(appSource, /async function publishSnapshotChanges\(/);
  assert.doesNotMatch(appSource, /async function openChart\(/);
  assert.doesNotMatch(appSource, /async function openPeerCompare\(/);
  assert.doesNotMatch(appSource, /async function openPeerCard\(/);
  assert.doesNotMatch(appSource, /async function rollbackHistory\(/);
  assert.doesNotMatch(appSource, /async function exportImage\(/);
  assert.doesNotMatch(appSource, /function setActivePanel\(/);
  assert.doesNotMatch(appSource, /function renderSignupDialog\(/);
  assert.doesNotMatch(appSource, /async function refreshProfile\(/);
  assert.doesNotMatch(appSource, /async function submitProfile\(/);
  assert.doesNotMatch(appSource, /async function initAuth\(/);
});

test('goal helpers support RATE goals and main goal kind change updates enhanced selects', () => {
  assert.equal(goalLabel({ kind: 'RATE', targetRate: 99.5 }), '99.5%');
  assert.equal(goalAchieved({
    table: 'SP12H',
    title: 'neu',
    chartType: 'A',
    kind: 'RATE',
    targetRate: 99.5
  }, {
    'SP12H|neu|A': { rate: 99.5 }
  }), true);
  assert.equal(goalAchieved({
    table: 'SP12H',
    title: 'neu',
    chartType: 'A',
    kind: 'RANK',
    targetRank: 'MAX-'
  }, {
    'SP12H|neu|A': { scoreTier: 'MAX' }
  }), true);

  const uiSource = fs.readFileSync(new URL('../lib/ui.js', import.meta.url), 'utf8');
  assert.match(uiSource, /\$\('goalKind'\)\?\.addEventListener\('change', \(\) => syncGoalTargetInputVisibility\('goal', enhancedSelects\)\)/);

  const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(htmlSource, /<option value="RATE">RATE<\/option>/);
  assert.match(htmlSource, /id="goalRate"/);
  assert.match(htmlSource, /id="songGoalRate"/);
  assert.doesNotMatch(htmlSource, /<option value="MAX">MAX<\/option>/);
});

test('normalizeBingoState clamps saved boards and keeps a valid active board', () => {
  const normalized = normalizeBingoState({
    activeBoardId: 'missing',
    published: { id: 'legacy-board', name: 'Legacy', size: 3, cells: [] },
    savedBoards: Array.from({ length: 7 }, (_, index) => ({
      id: `board-${index + 1}`,
      name: `Board ${index + 1}`,
      size: 3,
      cells: []
    }))
  });
  assert.equal(normalized.savedBoards.length, 5);
  assert.equal(normalized.activeBoardId, '');
  assert.equal(normalized.published, null);
});

test('vercel security headers include CSP, HSTS, and permissions policy', () => {
  const vercelConfig = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const headers = headerMap(vercelConfig);
  assert.match(headers.get('Content-Security-Policy') || '', /default-src 'self'/);
  assert.match(headers.get('Content-Security-Policy') || '', /connect-src 'self' https:\/\/\*\.supabase\.co/);
  assert.equal(headers.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains; preload');
  assert.match(headers.get('Permissions-Policy') || '', /camera=\(\)/);
});

test('snapshot smoke keeps cleaned hard-table counts and latest song coverage', () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('../assets/data/app-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(tableCount(snapshot, 'SP10H'), 892);
  assert.equal(tableCount(snapshot, 'SP11H'), 606);
  assert.equal(tableCount(snapshot, 'SP12H'), 551);
  const sp11Titles = (snapshot.rankTables?.SP11H?.categories || [])
    .flatMap((category) => category?.items || [])
    .map((item) => item?.data?.title || item?.title);
  assert.ok(sp11Titles.includes('MA・TSU・RI'));
});
