export function createInteractionController({
  state,
  isAuthorized,
  render,
  showToast,
  downloadBlob,
  withBusyOverlay,
  rpc,
  loadStaticData,
  saveProgressStateToCloud,
  currentRows,
  buildCompletionNoticeIfNeeded,
  flushCompletionNotice,
  computeRadarProfileFromRows,
  currentDefaultIconSrc,
  showSongPopup,
  showRadarDialog,
  showPeerRadarDialog,
  buildRowIndex,
  findRowByTitle,
  rowStats,
  truncate2,
  lampOrder,
  titleKey,
  esc,
  $
}) {
  function levelLabelFromTable(tableName) {
    if (String(tableName || '').startsWith('SP10')) return 'SP10';
    if (String(tableName || '').startsWith('SP11')) return 'SP11';
    if (String(tableName || '').startsWith('SP12')) return 'SP12';
    return String(tableName || '-');
  }

  function goalPayloadFromForm(prefix = 'goal', chart = null) {
    const kind = $(`${prefix}Kind`)?.value || 'CLEAR';
    const payload = {
      id: crypto.randomUUID(),
      table: chart?.tableName || $('goalTable')?.value || state.activeTable,
      title: chart?.title || $('goalSong')?.value || '',
      chartType: chart?.type || $('goalChartType')?.value || 'A',
      kind,
      source: state.profile?.djName || ''
    };
    if (kind === 'SCORE') payload.targetScore = Math.max(0, Number($(`${prefix}Score`)?.value || 0));
    else if (kind === 'RANK') payload.targetRank = $(`${prefix}Rank`)?.value || 'AA';
    else payload.targetLamp = $(`${prefix}Lamp`)?.value || 'HC';
    return payload;
  }

  async function openChart(chartKey, event) {
    const chart = Object.values(state.tableViews || {}).flatMap((view) => view.flatCharts || []).find((row) => row.key === chartKey);
    if (!chart) return;
    state.selectedChart = chart;
    let songSocialRows = [];
    if (isAuthorized()) {
      try {
        const rawRows = await rpc('get_song_social_context', {
          p_title: chart.title,
          p_chart_type: chart.type
        });
        const followingPeerSet = new Set(
          (state.social.overviewRows || [])
            .filter((row) => row?.relation_type === 'follow' && String(row.direction || 'following') === 'following')
            .map((row) => String(row.peer_user_id || ''))
            .filter(Boolean)
        );
        const seen = new Set();
        songSocialRows = (Array.isArray(rawRows) ? rawRows : []).filter((row) => {
          const peerId = String(row?.peer_user_id || '');
          if (!peerId || !followingPeerSet.has(peerId) || seen.has(peerId)) return false;
          seen.add(peerId);
          return true;
        });
      } catch {
        songSocialRows = [];
      }
    }
    showSongPopup(chart, event, isAuthorized(), { songSocialRows, isAdmin: state.auth.isAdmin });
  }

  async function openSelfRadar() {
    $('accountIconMenu')?.classList.add('hidden');
    const profile = computeRadarProfileFromRows(currentRows(), state.rankTables, state.songRadarCatalog);
    showRadarDialog(isAuthorized() ? state.profile.djName : 'GUEST', profile);
  }

  async function openPeerRadar() {
    const menu = $('socialPeerMenu');
    const peer = { peer_user_id: menu.dataset.peerUserId, dj_name: menu.dataset.peerDjName, infinitas_id: menu.dataset.peerInfinitasId };
    menu.classList.add('hidden');
    const rows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
    const trackerRows = Array.isArray(rows?.tracker_rows) ? rows.tracker_rows : Array.isArray(rows?.[0]?.tracker_rows) ? rows[0].tracker_rows : [];
    const profile = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
    showPeerRadarDialog(peer.dj_name || '이름 없음', peer.infinitas_id || '', profile);
  }

  async function openPeerCompare() {
    const menu = $('socialPeerMenu');
    const peer = { peer_user_id: menu.dataset.peerUserId, dj_name: menu.dataset.peerDjName, infinitas_id: menu.dataset.peerInfinitasId };
    menu.classList.add('hidden');
    const rows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
    const trackerRows = Array.isArray(rows?.tracker_rows) ? rows.tracker_rows : Array.isArray(rows?.[0]?.tracker_rows) ? rows[0].tracker_rows : [];
    const ownRows = state.profile?.trackerRows || [];
    const ownIdx = buildRowIndex(ownRows);
    const peerIdx = buildRowIndex(trackerRows);
    const myRadar = computeRadarProfileFromRows(ownRows, state.rankTables, state.songRadarCatalog);
    const peerRadar = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
    const radarRows = Object.keys(myRadar.radar || {}).map((axis) => {
      const me = Number(myRadar.radar?.[axis] || 0);
      const other = Number(peerRadar.radar?.[axis] || 0);
      const diff = truncate2(me - other);
      const diffClass = diff > 0 ? 'plus' : diff < 0 ? 'minus' : 'zero';
      const sign = diff > 0 ? '+' : '';
      return `<div class="social-compare-radar-row"><span class="axis-${String(axis || '').toLowerCase()}">${esc(axis)}</span><span class="social-compare-radar-val">${me.toFixed(2)}</span><span class="social-compare-radar-val">${other.toFixed(2)}</span><span class="social-compare-diff ${diffClass}">${sign}${diff.toFixed(2)}</span></div>`;
    }).join('');
    const bucket = new Map();
    const ensureBucket = (key) => {
      if (!bucket.has(key)) bucket.set(key, { score: { w: 0, d: 0, l: 0 }, lamp: { w: 0, d: 0, l: 0 } });
      return bucket.get(key);
    };
    Object.entries(state.tableViews || {}).forEach(([tableName, view]) => {
      const level = levelLabelFromTable(tableName);
      const rowBucket = ensureBucket(level);
      (view?.flatCharts || []).forEach((chart) => {
        const own = rowStats(findRowByTitle(ownIdx, chart.title), chart.type);
        const other = rowStats(findRowByTitle(peerIdx, chart.title), chart.type);
        if (Number(own.noteCount || 0) <= 0 || Number(other.noteCount || 0) <= 0) return;
        const ownScore = Number(own.exScore || 0);
        const otherScore = Number(other.exScore || 0);
        const ownLamp = lampOrder[own.lamp] ?? 0;
        const otherLamp = lampOrder[other.lamp] ?? 0;
        rowBucket.score[ownScore > otherScore ? 'w' : ownScore < otherScore ? 'l' : 'd'] += 1;
        rowBucket.lamp[ownLamp > otherLamp ? 'w' : ownLamp < otherLamp ? 'l' : 'd'] += 1;
      });
    });
    const levelRows = ['SP10', 'SP11', 'SP12']
      .filter((key) => bucket.has(key))
      .map((key) => {
        const row = bucket.get(key);
        return `<div class="social-compare-level-row"><span class="social-compare-level-key">${esc(key)}</span><span class="social-compare-level-value">${row.score.w}/${row.score.d}/${row.score.l}</span><span class="social-compare-level-value">${row.lamp.w}/${row.lamp.d}/${row.lamp.l}</span></div>`;
      }).join('');
    $('socialCompareBody').innerHTML = `
      <div class="social-compare-head"><strong>${esc(state.profile?.djName || 'ME')}</strong><span>vs</span><strong>${esc(peer.dj_name || 'PEER')}</strong></div>
      <div class="social-compare-grid">
        <section class="social-compare-card"><div class="social-compare-title">노트 레이더 차이 (나-상대)</div>${radarRows}</section>
        <section class="social-compare-card"><div class="social-compare-title">레벨별 승/무/패</div><div class="social-compare-level-head"><span>LEVEL</span><span>SCORE</span><span>LAMP</span></div>${levelRows || '<div class="history-empty">데이터 없음</div>'}</section>
      </div>
    `;
    $('socialCompareDialog')?.showModal();
  }

  async function openPeerCard() {
    const menu = $('socialPeerMenu');
    const peer = {
      peer_user_id: menu.dataset.peerUserId,
      dj_name: menu.dataset.peerDjName,
      infinitas_id: menu.dataset.peerInfinitasId
    };
    menu.classList.add('hidden');
    if (!peer.peer_user_id) return;
    try {
      await withBusyOverlay(
        '카드 불러오는 중...',
        '팔로우 플레이어 카드를 준비하고 있습니다.',
        async () => {
          let row = null;
          try {
            const result = await rpc('get_follow_card', { p_peer_user_id: peer.peer_user_id });
            row = Array.isArray(result) ? result[0] : result;
          } catch {
            const fallbackRows = await rpc('get_follow_tracker_rows', { p_peer_user_id: peer.peer_user_id });
            const fallback = Array.isArray(fallbackRows) ? fallbackRows[0] : fallbackRows;
            const overviewPeer = (state.social.overviewRows || []).find((item) => String(item?.peer_user_id || '') === String(peer.peer_user_id || ''));
            row = {
              peer_user_id: peer.peer_user_id,
              dj_name: fallback?.dj_name || peer.dj_name || '이름 없음',
              infinitas_id: fallback?.infinitas_id || peer.infinitas_id || '',
              icon_data_url: String(overviewPeer?.icon_data_url || '').trim(),
              banner_data_url: '',
              tracker_rows: Array.isArray(fallback?.tracker_rows) ? fallback.tracker_rows : [],
              following_count: '-',
              follower_count: '-'
            };
          }
          const trackerRows = Array.isArray(row?.tracker_rows) ? row.tracker_rows : [];
          const radarProfile = computeRadarProfileFromRows(trackerRows, state.rankTables, state.songRadarCatalog);
          const banner = String(row?.banner_data_url || '').trim() || String(row?.icon_data_url || '').trim() || currentDefaultIconSrc;
          const icon = String(row?.icon_data_url || '').trim() || currentDefaultIconSrc;
          const followingCount = row?.following_count ?? '-';
          const followerCount = row?.follower_count ?? '-';
          const popup = $('socialPeerCardPopup');
          const body = $('socialPeerCardBody');
          if (!popup || !body) return;
          body.innerHTML = `
            <article class="social-me-card">
              <div class="social-me-banner">
                <img class="social-me-banner-image" src="${esc(banner)}" alt="" />
              </div>
              <div class="social-me-avatar-wrap"><img class="social-me-avatar" src="${esc(icon)}" alt="프로필 아이콘" /></div>
              <div class="social-me-body">
                <div class="social-me-name">${esc(row?.dj_name || peer.dj_name || '이름 없음')}</div>
                <div class="social-me-id">${esc(row?.infinitas_id || peer.infinitas_id || '')}</div>
                <div class="social-me-stats">
                  <div class="social-me-stat"><div class="social-me-stat-value">${Number(radarProfile.total || 0).toFixed(2)}</div><div class="social-me-stat-label">레이더</div></div>
                  <div class="social-me-stat"><div class="social-me-stat-value">${esc(String(followingCount))}</div><div class="social-me-stat-label">팔로잉</div></div>
                  <div class="social-me-stat"><div class="social-me-stat-value">${esc(String(followerCount))}</div><div class="social-me-stat-label">팔로워</div></div>
                </div>
                <div class="social-follow-add-spacer" aria-hidden="true"></div>
              </div>
            </article>`;
          popup.classList.remove('hidden');
        }
      );
    } catch (error) {
      showToast(`카드 불러오기 실패: ${error.message || error}`);
    }
  }

  async function rollbackHistory() {
    if (!isAuthorized() || !state.selectedHistoryId) return;
    const histories = Array.isArray(state.profile.history) ? state.profile.history : [];
    const targetIdx = histories.findIndex((item) => item.id === state.selectedHistoryId);
    if (targetIdx < 0 || targetIdx === histories.length - 1) return;
    const target = histories[targetIdx];
    if (!target?.snapshotRows || !target?.snapshotProgress) {
      showToast('이 히스토리에는 롤백에 필요한 스냅샷 데이터가 없습니다.');
      return;
    }
    if (!window.confirm('해당 시점으로 히스토리를 되돌립니다. 계속할까요?')) return;
    state.profile.history = histories.slice(0, targetIdx + 1);
    state.profile.trackerRows = JSON.parse(JSON.stringify(target.snapshotRows || []));
    state.profile.lastProgress = JSON.parse(JSON.stringify(target.snapshotProgress || {}));
    const completionNotice = buildCompletionNoticeIfNeeded();
    await saveProgressStateToCloud(state.auth.user, state.profile, 'history-rollback');
    await flushCompletionNotice(completionNotice);
    state.selectedHistoryId = target.id;
    state.historySectionOpen = { clear: false, ramp: false, goal: false, radar: false };
    render();
    showToast('선택한 시점으로 롤백되었습니다.');
  }

  async function exportImage() {
    if (typeof window.html2canvas !== 'function') return showToast('html2canvas를 불러오지 못했습니다.');
    const canvas = await window.html2canvas($('exportArea'), { useCORS: true, backgroundColor: '#e7e7e7', scale: 2 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) downloadBlob(blob, `${state.activeTable}_${new Date().toISOString().slice(0, 10)}.png`);
  }

  function resetGuestState() {
    state.guest.trackerRows = [];
    state.guest.uploadedTrackerName = '';
    if (!isAuthorized()) render();
    showToast('게스트 업로드 상태를 초기화했습니다.');
  }

  async function refreshRankData() {
    await loadStaticData(true);
    render();
    showToast('관리자 데이터 캐시를 다시 불러왔습니다.');
  }

  return {
    goalPayloadFromForm,
    openChart,
    openSelfRadar,
    openPeerRadar,
    openPeerCompare,
    openPeerCard,
    rollbackHistory,
    exportImage,
    resetGuestState,
    refreshRankData
  };
}
