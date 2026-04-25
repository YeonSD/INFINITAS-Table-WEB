import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildViews, graphSummary, normalizeBingoState, progressMap, sortItems } from '../lib/data.js';
import { getDeferredPanelRenderers } from '../lib/render-plan.js';
import { buildAccountStatePatchPayload, buildFullAccountStatePayload, buildUserProfilePayload, compactPersistedHistory } from '../lib/profile-storage.js';
import { canonicalizeChartMetadataRows } from '../scripts/chart-metadata-utils.mjs';
import { songSocialSectionHtml } from '../lib/social-ui.js';
import { goalAchieved, goalLabel, normalizeLamp, scoreTier } from '../lib/utils.js';

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

test('persisted history compacts old snapshots while keeping recent rollback points', () => {
  const history = Array.from({ length: 6 }, (_, index) => ({
    id: `h${index + 1}`,
    summary: `${index + 1}건 변경`,
    snapshotRows: [{ title: `Song ${index + 1}` }],
    snapshotProgress: { [`k${index + 1}`]: { exScore: index + 1 } }
  }));

  const compacted = compactPersistedHistory(history, { maxEntries: 5, maxSnapshots: 2 });

  assert.equal(compacted.length, 5);
  assert.equal(compacted[0].id, 'h2');
  assert.ok(!('snapshotRows' in compacted[0]));
  assert.ok(!('snapshotProgress' in compacted[0]));
  assert.ok(!('snapshotRows' in compacted[2]));
  assert.ok('snapshotRows' in compacted[3]);
  assert.ok('snapshotProgress' in compacted[4]);
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

test('purgeProfile deletes the auth account through an edge function', () => {
  const authSource = fs.readFileSync(new URL('../lib/auth.js', import.meta.url), 'utf8');
  const match = authSource.match(/export async function purgeProfile[\s\S]*?\n}\n/);
  assert.ok(match, 'purgeProfile definition should exist');
  assert.match(match[0], /functions\/v1\/delete-self-account/);
  assert.doesNotMatch(match[0], /\.rpc\('purge_my_social_data'\)/);

  const edgeSource = fs.readFileSync(new URL('../supabase/functions/delete-self-account/index.ts', import.meta.url), 'utf8');
  assert.match(edgeSource, /auth\.admin\.deleteUser\(data\.user\.id\)/);
});

test('deferred panel render plan only includes the active dock panel group', () => {
  assert.deepEqual(getDeferredPanelRenderers('rank'), ['songGoalBingoPicker']);
  assert.deepEqual(getDeferredPanelRenderers('history'), ['history', 'songGoalBingoPicker']);
  assert.deepEqual(getDeferredPanelRenderers('goals'), ['goalCandidates', 'goals', 'songGoalBingoPicker']);
  assert.deepEqual(getDeferredPanelRenderers('social'), ['social', 'songGoalBingoPicker']);
  assert.deepEqual(getDeferredPanelRenderers('settings'), ['songGoalBingoPicker']);
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

test('tracker upload confirms cloud save by refreshing profile and rolls back local state on save failure', () => {
  const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const dataControllerSource = fs.readFileSync(new URL('../lib/app-data-controller.js', import.meta.url), 'utf8');

  assert.match(appSource, /let refreshProfile = async \(\) => null;/);
  assert.match(appSource, /refreshProfile: \(\.\.\.args\) => refreshProfile\(\.\.\.args\)/);
  assert.match(appSource, /refreshProfile: accountRefreshProfile/);
  assert.match(appSource, /refreshProfile = accountRefreshProfile;/);

  assert.match(dataControllerSource, /refreshProfile,/);
  assert.match(dataControllerSource, /const prevProfile = cloneJson\(state\.profile\);/);
  assert.match(dataControllerSource, /state\.profile = prevProfile;/);
  assert.match(dataControllerSource, /await saveProgressStateToCloud\(state\.auth\.user, state\.profile, 'tsv-upload'\);/);
  assert.match(dataControllerSource, /await refreshProfile\(\{ showBusy: false, timeoutMs: 10000 \}\);/);
  assert.match(dataControllerSource, /DB 저장은 완료됐지만 재조회에 실패했습니다/);
});

test('goal helpers support RATE goals and main goal kind change updates enhanced selects', () => {
  assert.equal(normalizeLamp('AC'), 'ASSIST');
  assert.equal(normalizeLamp('NC'), 'NORMAL');
  assert.equal(normalizeLamp('EC'), 'EASY');
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
  assert.match(htmlSource, /<select id="goalLamp"[\s\S]*?<option value="HC">HARD<\/option>[\s\S]*?<option value="EX">EX-HARD<\/option>[\s\S]*?<option value="FC">FULL COMBO<\/option>/);
  assert.match(htmlSource, /<select id="songGoalLamp"[\s\S]*?<option value="HC">HARD<\/option>[\s\S]*?<option value="EX">EX-HARD<\/option>[\s\S]*?<option value="FC">FULL COMBO<\/option>/);
  assert.doesNotMatch(htmlSource, /<option value="MAX">MAX<\/option>/);
});

test('clear summary includes ASSIST and maps AC/EC/NC lamps correctly', () => {
  const summary = graphSummary({
    flatCharts: [
      { clearStatus: 'ASSIST', scoreTier: 'A' },
      { clearStatus: 'EASY', scoreTier: 'AA' },
      { clearStatus: 'NORMAL', scoreTier: 'AAA' },
      { clearStatus: 'FAILED', scoreTier: '' }
    ]
  });
  assert.deepEqual(summary.clearOrder, ['FC', 'EXHARD', 'HARD', 'NORMAL', 'EASY', 'ASSIST', 'FAILED', 'NOPLAY']);
  assert.equal(summary.clearCount.ASSIST, 1);
  assert.equal(summary.clearCount.EASY, 1);
  assert.equal(summary.clearCount.NORMAL, 1);
  assert.equal(summary.clearCount.FAILED, 1);

  const rankTableUiSource = fs.readFileSync(new URL('../lib/rank-table-ui.js', import.meta.url), 'utf8');
  assert.match(rankTableUiSource, /c\.lamp === 'NORMAL'.*lamp-normal/s);
  assert.match(rankTableUiSource, /c\.lamp === 'EASY'.*lamp-easy/s);
  assert.match(rankTableUiSource, /c\.lamp === 'ASSIST'.*lamp-assist/s);

  const stylesSource = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(stylesSource, /\.song-button\.lamp-normal\s*\{/);
  assert.match(stylesSource, /\.song-button\.lamp-easy\s*\{/);
  assert.match(stylesSource, /\.song-button\.lamp-assist\s*\{/);
});

test('score tier and score graph support ranks down to F', () => {
  assert.equal(scoreTier(80, 200, 'HC'), 'F');
  assert.equal(scoreTier(90, 200, 'HC'), 'E');
  assert.equal(scoreTier(220, 300, 'HC'), 'D');
  assert.equal(scoreTier(200, 200, 'HC'), 'C');
  assert.equal(scoreTier(450, 400, 'HC'), 'B');

  const summary = graphSummary({
    flatCharts: [
      { clearStatus: 'FAILED', scoreTier: 'F' },
      { clearStatus: 'FAILED', scoreTier: 'E' },
      { clearStatus: 'FAILED', scoreTier: 'D' },
      { clearStatus: 'FAILED', scoreTier: 'C' },
      { clearStatus: 'FAILED', scoreTier: 'B' },
      { clearStatus: 'FAILED', scoreTier: 'A' },
      { clearStatus: 'FAILED', scoreTier: 'AA' },
      { clearStatus: 'FAILED', scoreTier: 'AAA' },
      { clearStatus: 'FAILED', scoreTier: 'MAX-' },
      { clearStatus: 'FAILED', scoreTier: 'MAX' }
    ]
  });
  assert.deepEqual(summary.scoreOrder, ['MAX', 'MAX-', 'AAA', 'AA', 'A', 'B', 'C', 'D', 'E', 'F', 'NOPLAY']);
  assert.equal(summary.scoreCount.F, 1);
  assert.equal(summary.scoreCount.E, 1);
  assert.equal(summary.scoreCount.D, 1);
  assert.equal(summary.scoreCount.C, 1);

  const uiSource = fs.readFileSync(new URL('../lib/ui.js', import.meta.url), 'utf8');
  assert.match(uiSource, /F: '#ad6a6a'/);
  assert.match(uiSource, /E: '#c88b55'/);
  assert.match(uiSource, /D: '#d9b34f'/);
  assert.match(uiSource, /C: '#b7c95b'/);
});

test('peer rank popup sort modes order by lamp and score', () => {
  const rows = [
    { title: 'Alpha', clearStatus: 'FAILED', scoreTier: 'AAA', rate: 90, exScore: 1800 },
    { title: 'Beta', clearStatus: 'HARD', scoreTier: 'A', rate: 70, exScore: 1400 },
    { title: 'Gamma', clearStatus: 'FC', scoreTier: 'AA', rate: 80, exScore: 1600 }
  ];

  assert.deepEqual(sortItems(rows, 'lamp').map((row) => row.title), ['Gamma', 'Beta', 'Alpha']);
  assert.deepEqual(sortItems(rows, 'score').map((row) => row.title), ['Alpha', 'Gamma', 'Beta']);
});

test('pending release charts stay hidden for normal users and visible for admins', () => {
  const rankTables = {
    SP11H: {
      categories: [{
        category: '미정',
        sortindex: 0,
        items: [{
          data: {
            title: 'BLUST OF WIND',
            type: 'L',
            releaseStatus: 'pending_release',
            atwikiNotes: 1335
          }
        }]
      }]
    }
  };
  const rows = [{
    title: 'BLUST OF WIND',
    'SPL Rating': '11',
    'SPL Lamp': 'NP',
    'SPL EX Score': '0',
    'SPL Note Count': '1335'
  }];

  const userView = buildViews(rankTables, null, rows, { isAdmin: false });
  const adminView = buildViews(rankTables, null, rows, { isAdmin: true });

  assert.equal(userView.SP11H.flatCharts.length, 0);
  assert.equal(adminView.SP11H.flatCharts.length, 1);
  assert.equal(adminView.SP11H.flatCharts[0].releaseStatus, 'pending_release');
  assert.equal(adminView.SP11H.flatCharts[0].isPendingRelease, true);
});

test('progressMap keeps chart rate for RATE goal evaluation', () => {
  const map = progressMap({
    SP12H: {
      flatCharts: [{
        key: 'SP12H|god mind|A',
        tableName: 'SP12H',
        title: 'God Mind',
        type: 'A',
        lamp: 'EXHARD',
        clearStatus: 'EXHARD',
        exScore: 3858,
        rate: 89.51,
        scoreTier: 'AAA'
      }]
    }
  });
  assert.equal(map['SP12H|god mind|A']?.rate, 89.51);
  assert.equal(goalAchieved({
    table: 'SP12H',
    title: 'God Mind',
    chartType: 'A',
    kind: 'RATE',
    targetRate: 89.3
  }, map), true);
});

test('social follow flow shows request toasts and follower popup actions', () => {
  const socialControllerSource = fs.readFileSync(new URL('../lib/social-controller.js', import.meta.url), 'utf8');
  assert.match(socialControllerSource, /toastMode: 'reciprocal'/);
  assert.match(socialControllerSource, /function openFollowersPopup\(anchorRect = null\)/);
  assert.match(socialControllerSource, /function closeFollowersPopup\(\)/);
  assert.match(socialControllerSource, /follow_request_received/);
  assert.match(socialControllerSource, /dismiss_feed_event/);

  const socialUiSource = fs.readFileSync(new URL('../lib/social-ui.js', import.meta.url), 'utf8');
  assert.match(socialUiSource, /data-open-followers="1"/);
  assert.match(socialUiSource, /data-close-followers-popup="1"/);
  assert.match(socialUiSource, /allowFollowBack: !followingPeerSet\.has/);

  const uiSource = fs.readFileSync(new URL('../lib/ui.js', import.meta.url), 'utf8');
  assert.match(uiSource, /data-open-followers/);
  assert.match(uiSource, /socialFollowersPopup/);
  assert.match(uiSource, /data-follow-target/);

  const appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(appSource, /socialFollowersPopup:\s*\{/);
  assert.match(appSource, /openFollowersPopup,/);
  assert.match(appSource, /closeFollowersPopup,/);
});

test('song social section renders rank and rate and sorts by higher score first', () => {
  const html = songSocialSectionHtml([
    { dj_name: 'SIRO', lamp: 'EX', score_tier: 'A', ex_score: 1952, rate: 79.02 },
    { dj_name: 'ERI', lamp: 'NP', score_tier: '', ex_score: 0, rate: 0 },
    { dj_name: 'TEST', lamp: 'FC', score_tier: 'MAX-', ex_score: 2341, rate: 95.71 }
  ]);
  assert.match(html, /램프: FC \| 랭크: MAX- \| 점수: 2341 \| 달성률: 95\.71%/);
  assert.match(html, /램프: EX \| 랭크: A \| 점수: 1952 \| 달성률: 79\.02%/);
  assert.match(html, /램프: NP \| 랭크: - \| 점수: 0 \| 달성률: 0\.00%/);
  assert.ok(html.indexOf('TEST') < html.indexOf('SIRO'));
  assert.ok(html.indexOf('SIRO') < html.indexOf('ERI'));
});

test('bingo share function no longer depends on goal transfer settings', () => {
  const schemaSource = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const match = schemaSource.match(/create or replace function public\.send_bingo_to_user\([\s\S]*?\n\$\$;/);
  assert.ok(match, 'send_bingo_to_user definition should exist in schema');
  assert.doesNotMatch(match[0], /goalTransferEnabled/);
  assert.doesNotMatch(match[0], /sender_goal_transfer_disabled/);
  assert.doesNotMatch(match[0], /target_goal_share_disabled/);

  const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260406123000_fix_bingo_share_policy.sql', import.meta.url), 'utf8');
  assert.doesNotMatch(migrationSource, /goalTransferEnabled/);
  assert.match(migrationSource, /create or replace function public\.send_bingo_to_user/);
});

test('song social context rpc exposes rate and score tier', () => {
  const schemaSource = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const match = schemaSource.match(/create or replace function public\.get_song_social_context\([\s\S]*?\n\$\$;/);
  assert.ok(match, 'get_song_social_context definition should exist in schema');
  assert.match(match[0], /rate numeric/);
  assert.match(match[0], /score_tier text/);
  assert.match(match[0], /when ps\.rate_value >= 94\.4444444444 then 'MAX-'/);

  const migrationSource = fs.readFileSync(new URL('../supabase/migrations/20260406152000_enhance_song_social_context.sql', import.meta.url), 'utf8');
  assert.match(migrationSource, /drop function if exists public\.get_song_social_context\(text, text\)/);
  assert.match(migrationSource, /create function public\.get_song_social_context/);
  assert.match(migrationSource, /rate numeric/);
  assert.match(migrationSource, /score_tier text/);
});

test('mobile shell keeps bottom navigation and social section tabs without replacing rank table', () => {
  const rankUiSource = fs.readFileSync(new URL('../lib/rank-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(rankUiSource, /mobile-rank-card/);
  assert.doesNotMatch(rankUiSource, /isCompactRankViewport/);

  const uiSource = fs.readFileSync(new URL('../lib/ui.js', import.meta.url), 'utf8');
  assert.match(uiSource, /data-social-mobile-section/);

  const htmlSource = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(htmlSource, /id="socialMobileTabsHost"/);

  const socialUiSource = fs.readFileSync(new URL('../lib/social-ui.js', import.meta.url), 'utf8');
  assert.match(socialUiSource, /social-mobile-tabs/);
  assert.match(socialUiSource, /social-mobile-\$\{mobileSection\}/);

  const cssSource = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(cssSource, /@media \(max-width: 600px\)/);
  assert.match(cssSource, /#dockWidget[\s\S]*bottom: calc\(10px \+ var\(--mobile-safe-bottom\)\) !important/);
  assert.match(cssSource, /\.social-mobile-tabs/);
  assert.match(cssSource, /\.social-layout\.social-mobile-feed \.social-col-left/);
  assert.doesNotMatch(cssSource, /\.mobile-rank-category/);
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

test('supabase snapshot canonicalization restores classified seed categories over stale unclassified rows', () => {
  const seedRow = {
    chart_key: 'SP12H|3y3s(long ver.)|A',
    table_key: 'SP12H',
    table_title: 'SP12H',
    level: 12,
    song_title: '3y3s(Long ver.)',
    normalized_title: '3y3s(long ver.)',
    chart_type: 'A',
    category: '지력S+',
    source_sort_index: 1,
    classification_status: 'classified',
    source: 'manual_chart_metadata_override',
    is_deleted: false
  };
  const staleSupabaseRow = {
    ...seedRow,
    category: '미분류',
    source_sort_index: 999,
    classification_status: 'uncategorized',
    source: 'song-radar-sp.source.csv'
  };

  const [row] = canonicalizeChartMetadataRows([staleSupabaseRow], {
    seedCharts: [seedRow],
    restrictToSeed: true
  });

  assert.equal(row.category, '지력S+');
  assert.equal(row.source_sort_index, 1);
  assert.equal(row.classification_status, 'classified');
  assert.equal(row.song_title, '3y3s(Long ver.)');
});

test('snapshot smoke keeps cleaned hard-table counts and latest song coverage', () => {
  const snapshot = JSON.parse(fs.readFileSync(new URL('../assets/data/app-snapshot.json', import.meta.url), 'utf8'));
  assert.equal(tableCount(snapshot, 'SP10H'), 892);
  assert.equal(tableCount(snapshot, 'SP11H'), 608);
  assert.equal(tableCount(snapshot, 'SP12H'), 553);
  const sp11Titles = (snapshot.rankTables?.SP11H?.categories || [])
    .flatMap((category) => category?.items || [])
    .map((item) => item?.data?.title || item?.title);
  assert.ok(sp11Titles.includes('MA・TSU・RI'));
  const userViews = buildViews(snapshot.rankTables || {}, snapshot.songRadarCatalog || null, [], { isAdmin: false });
  const adminViews = buildViews(snapshot.rankTables || {}, snapshot.songRadarCatalog || null, [], { isAdmin: true });
  assert.equal((userViews.SP11H?.flatCharts || []).length, 606);
  assert.equal((userViews.SP12H?.flatCharts || []).length, 551);
  assert.equal((adminViews.SP11H?.flatCharts || []).length, 608);
  assert.equal((adminViews.SP12H?.flatCharts || []).length, 553);
});
test('pending release admin flow is wired through snapshot, popup, and schema', () => {
  const snapshotBuilderSource = fs.readFileSync(new URL('../scripts/build-app-snapshot.mjs', import.meta.url), 'utf8');
  const uiSource = fs.readFileSync(new URL('../lib/ui.js', import.meta.url), 'utf8');
  const schemaSource = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');

  assert.match(snapshotBuilderSource, /releaseStatus: row\.release_status \|\| 'live'/);
  assert.match(uiSource, /data-song-pending-apply=/);
  assert.match(uiSource, /미출시 후보/);
  assert.match(schemaSource, /release_status text not null default 'live'/);
  assert.match(schemaSource, /admin_set_chart_release_status/);
});
