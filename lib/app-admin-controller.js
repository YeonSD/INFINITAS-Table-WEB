const SONG_CATEGORY_SORT_HINTS = new Map([
  ['10', 10],
  ['9', 9],
  ['8', 8],
  ['7', 7],
  ['6', 6],
  ['5', 5],
  ['4', 4],
  ['3', 3],
  ['2', 2],
  ['1', 1],
  ['지력S+', 1],
  ['개인차S+', 2],
  ['지력S', 3],
  ['개인차S', 4],
  ['지력A+', 5],
  ['개인차A+', 6],
  ['지력A', 5],
  ['개인차A', 6],
  ['지력B+', 7],
  ['개인차B+', 8],
  ['지력B', 7],
  ['개인차B', 8],
  ['지력C', 9],
  ['개인차C', 10],
  ['지력D', 11],
  ['개인차D', 12],
  ['지력E', 13],
  ['개인차E', 14],
  ['지력F', 15],
  ['초개인차', 19],
  ['INFINITAS 전용곡', 20],
  ['미정', 998],
  ['미분류', 999]
]);

const SONG_CATEGORY_OPTIONS = [
  '10', '9', '8', '7', '6', '5', '4', '3', '2', '1',
  '지력S+', '개인차S+', '지력S', '개인차S', '지력A+', '개인차A+', '지력A', '개인차A',
  '지력B+', '개인차B+', '지력B', '개인차B', '지력C', '개인차C', '지력D', '개인차D',
  '지력E', '개인차E', '지력F', '초개인차', 'INFINITAS 전용곡', '미정', '미분류'
];

export function createAdminController({
  state,
  render,
  rebuildViews,
  showToast,
  withBusyOverlay,
  describeRemoteError,
  loadAppNotices,
  saveAppNotice,
  requestSnapshotPublish,
  rpc,
  fetchJsonOptional,
  readJsonCache,
  writeJsonCache,
  snapshotMetaCacheKey,
  snapshotDataCacheKey,
  defaultSnapshotPath,
  titleKey,
  esc,
  $
}) {
  function normalizeAppNoticeList(rawNotices) {
    if (!Array.isArray(rawNotices)) return [];
    return rawNotices
      .map((notice, index) => {
        if (!notice || typeof notice !== 'object') return null;
        const items = Array.isArray(notice.items)
          ? notice.items.map((item) => String(item || '').trim()).filter(Boolean)
          : [];
        return {
          id: String(notice.id || `notice-${index + 1}`).trim(),
          version: String(notice.version || '').trim(),
          title: String(notice.title || '').trim(),
          summary: String(notice.summary || '').trim(),
          publishedAt: String(notice.publishedAt || notice.published_at || '').trim(),
          items
        };
      })
      .filter((notice) => notice && (notice.title || notice.summary || notice.items.length))
      .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  }

  function defaultSortIndexForCategory(category, fallback = 999) {
    const name = String(category || '').trim();
    if (SONG_CATEGORY_SORT_HINTS.has(name)) return Number(SONG_CATEGORY_SORT_HINTS.get(name));
    return Number.isFinite(Number(fallback)) ? Number(fallback) : 999;
  }

  function markSnapshotPublishNeeded(message = 'DB 변경사항이 있어 정적 스냅샷 재배포가 필요합니다.') {
    state.snapshotPublish = {
      ...state.snapshotPublish,
      needsPublish: true,
      message,
      workflowUrl: ''
    };
  }

  async function refreshAppNotices(options = {}) {
    const renderAfter = options.renderAfter !== false;
    const silent = options.silent === true;
    try {
      const cloudNotices = await loadAppNotices();
      if (cloudNotices.length) state.appMeta.notices = normalizeAppNoticeList(cloudNotices);
    } catch (error) {
      if (!silent) showToast(`공지사항 불러오기 실패: ${describeRemoteError(error, '공지사항을 불러오지 못했습니다.')}`);
    }
    if (renderAfter) render();
  }

  async function loadStaticData(forceRefresh = false) {
    const cachedMeta = !forceRefresh ? readJsonCache(snapshotMetaCacheKey) : null;
    const cachedSnapshot = !forceRefresh ? readJsonCache(snapshotDataCacheKey) : null;
    const versionMetaUrl = forceRefresh
      ? `./assets/data/snapshot-version.json?ts=${Date.now()}`
      : './assets/data/snapshot-version.json';
    const versionMeta = await fetchJsonOptional(versionMetaUrl, forceRefresh ? 'reload' : 'no-store');
    const snapshotPath = String(versionMeta?.snapshotPath || cachedMeta?.snapshotPath || defaultSnapshotPath);
    const version = String(versionMeta?.version || cachedMeta?.version || 'dev');
    state.appMeta = {
      version,
      publishedAt: String(versionMeta?.publishedAt || cachedMeta?.publishedAt || '').trim(),
      snapshotPath,
      notices: normalizeAppNoticeList(versionMeta?.notices || cachedMeta?.notices || [])
    };
    const canUseCachedSnapshot = !forceRefresh
      && cachedMeta
      && cachedSnapshot?.rankTables
      && String(cachedMeta.version || '') === version
      && String(cachedMeta.snapshotPath || '') === snapshotPath;
    if (canUseCachedSnapshot) {
      state.rankTables = cachedSnapshot.rankTables || {};
      state.songRadarCatalog = cachedSnapshot.songRadarCatalog || { charts: [] };
      return;
    }
    const snapshotRes = await fetch(`${snapshotPath}?v=${encodeURIComponent(version)}`, { cache: forceRefresh ? 'reload' : 'default' });
    if (!snapshotRes.ok) {
      if (cachedSnapshot?.rankTables) {
        state.rankTables = cachedSnapshot.rankTables || {};
        state.songRadarCatalog = cachedSnapshot.songRadarCatalog || { charts: [] };
        return;
      }
      throw new Error(`snapshot load failed: ${snapshotRes.status}`);
    }
    const snapshot = await snapshotRes.json();
    state.rankTables = snapshot.rankTables || {};
    state.songRadarCatalog = snapshot.songRadarCatalog || { charts: [] };
    writeJsonCache(snapshotMetaCacheKey, state.appMeta);
    writeJsonCache(snapshotDataCacheKey, {
      version,
      snapshotPath,
      rankTables: state.rankTables,
      songRadarCatalog: state.songRadarCatalog
    });
  }

  function toDateTimeLocalValue(iso) {
    const date = iso ? new Date(iso) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return local.toISOString().slice(0, 16);
  }

  function noticeEditorPayloadFromForm() {
    const title = String($('noticeEditorTitle')?.value || '').trim();
    const summary = String($('noticeEditorSummary')?.value || '').trim();
    const publishedAtRaw = String($('noticeEditorPublishedAt')?.value || '').trim();
    const items = String($('noticeEditorItems')?.value || '')
      .split(/\r?\n/g)
      .map((item) => item.trim())
      .filter(Boolean);
    const publishedAtDate = publishedAtRaw ? new Date(publishedAtRaw) : new Date();
    return {
      id: String(state.noticeEditor.id || '').trim(),
      title,
      summary,
      items,
      publishedAt: Number.isNaN(publishedAtDate.getTime()) ? new Date().toISOString() : publishedAtDate.toISOString()
    };
  }

  function openNoticeEditor(noticeId = '') {
    if (!state.auth.isAdmin) return showToast('관리자 계정만 공지사항을 편집할 수 있습니다.');
    const notice = state.appMeta.notices.find((item) => String(item.id || '') === String(noticeId || '')) || null;
    state.noticeEditor = {
      open: true,
      id: String(notice?.id || '').trim()
    };
    $('noticeEditorTitleText').textContent = notice ? '공지사항 수정' : '공지사항 추가';
    $('noticeEditorTitle').value = notice?.title || '';
    $('noticeEditorSummary').value = notice?.summary || '';
    $('noticeEditorPublishedAt').value = toDateTimeLocalValue(notice?.publishedAt || new Date().toISOString());
    $('noticeEditorItems').value = Array.isArray(notice?.items) ? notice.items.join('\n') : '';
    if (!$('noticeEditorDialog')?.open) $('noticeEditorDialog')?.showModal();
  }

  function closeNoticeEditor(options = {}) {
    state.noticeEditor = { open: false, id: '' };
    if (!options.skipDialogClose) $('noticeEditorDialog')?.close(options.reason || 'cancel');
  }

  async function saveNoticeEditor() {
    if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 공지사항을 저장할 수 있습니다.');
    const payload = noticeEditorPayloadFromForm();
    if (!payload.title) return showToast('공지사항 제목을 입력하세요.');
    if (!payload.summary) return showToast('공지사항 요약을 입력하세요.');
    await withBusyOverlay(
      '공지사항 저장 중...',
      '공지사항 내용을 서버에 반영하고 있습니다.',
      async () => {
        await saveAppNotice(state.auth.user, payload);
        closeNoticeEditor();
        await refreshAppNotices({ renderAfter: false, silent: false });
        render();
        showToast('공지사항을 저장했습니다.');
      }
    );
  }

  function findChartCategoryMeta(chart = state.selectedChart) {
    if (!chart) return { category: '미분류', sortIndex: 999 };
    const table = state.rankTables?.[chart.tableName];
    if (!table) {
      return {
        category: String(chart.category || '미분류').trim() || '미분류',
        sortIndex: defaultSortIndexForCategory(chart.category, 999)
      };
    }
    for (const category of table.categories || []) {
      const found = (category.items || []).some((item) => (
        titleKey(item?.data?.title) === titleKey(chart.title)
        && String(item?.data?.type || '').trim().toUpperCase() === chart.type
      ));
      if (found) {
        return {
          category: String(category.category || chart.category || '미분류').trim() || '미분류',
          sortIndex: Number(category.sortindex || defaultSortIndexForCategory(category.category, 999))
        };
      }
    }
    return {
      category: String(chart.category || '미분류').trim() || '미분류',
      sortIndex: defaultSortIndexForCategory(chart.category, 999)
    };
  }

  function populateSongMetaCategorySelect(selectedValue = '미분류') {
    const select = $('songMetaCategory');
    if (!select) return;
    const known = new Set(SONG_CATEGORY_OPTIONS);
    const current = String(selectedValue || '').trim();
    const values = current && !known.has(current) ? [...SONG_CATEGORY_OPTIONS, current] : SONG_CATEGORY_OPTIONS;
    select.innerHTML = values.map((value) => `<option value="${esc(value)}">${esc(value)}</option>`).join('');
    select.value = current || '미분류';
  }

  function syncSongMetaSortIndexFromCategory(force = false) {
    const sortInput = $('songMetaSortIndex');
    const category = $('songMetaCategory')?.value || '미분류';
    if (!sortInput) return;
    if (!force && sortInput.dataset.touched === 'true') return;
    sortInput.value = String(defaultSortIndexForCategory(category, sortInput.value || 999));
  }

  function songMetaEditorPayloadFromForm() {
    return {
      chartKey: String(state.songMetaEditor.chartKey || '').trim(),
      tableKey: String(state.songMetaEditor.tableKey || '').trim(),
      songTitle: String(state.songMetaEditor.songTitle || '').trim(),
      chartType: String(state.songMetaEditor.chartType || '').trim(),
      category: String($('songMetaCategory')?.value || '미분류').trim() || '미분류',
      sourceSortIndex: Number($('songMetaSortIndex')?.value || 999),
      noteCount: Number($('songMetaNotes')?.value || 0),
      typeInfo: String($('songMetaTypeInfo')?.value || '').trim().toUpperCase(),
      bpm: String($('songMetaBpm')?.value || '').trim(),
      radarNotes: Number($('songMetaRadarNotes')?.value || 0),
      radarPeak: Number($('songMetaRadarPeak')?.value || 0),
      radarScratch: Number($('songMetaRadarScratch')?.value || 0),
      radarSoflan: Number($('songMetaRadarSoflan')?.value || 0),
      radarCharge: Number($('songMetaRadarCharge')?.value || 0),
      radarChord: Number($('songMetaRadarChord')?.value || 0)
    };
  }

  function normalizeReleaseStatus(value) {
    return String(value || '').trim().toLowerCase() === 'pending_release' ? 'pending_release' : 'live';
  }

  function applyChartMetadataRowToLocalState(row) {
    if (!row) return null;
    const tableKey = String(row.table_key || '').trim();
    const chartType = String(row.chart_type || '').trim().toUpperCase();
    const songTitle = String(row.song_title || '').trim();
    if (!tableKey || !songTitle || !chartType) return null;

    if (!state.rankTables[tableKey]) {
      state.rankTables[tableKey] = {
        tableinfo: { title: row.table_title || tableKey },
        categories: []
      };
    }
    const table = state.rankTables[tableKey];
    table.tableinfo = { ...(table.tableinfo || {}), title: row.table_title || table.tableinfo?.title || tableKey };
    table.categories = (table.categories || []).map((category) => ({
      ...category,
      items: (category.items || []).filter((item) => !(
        titleKey(item?.data?.title) === titleKey(songTitle)
        && String(item?.data?.type || '').trim().toUpperCase() === chartType
      ))
    })).filter((category) => (category.items || []).length > 0);

    const nextCategoryName = String(row.category || '미분류').trim() || '미분류';
    let nextCategory = table.categories.find((category) => String(category.category || '') === nextCategoryName);
    if (!nextCategory) {
      nextCategory = {
        category: nextCategoryName,
        sortindex: Number(row.source_sort_index || defaultSortIndexForCategory(nextCategoryName, 999)),
        items: []
      };
      table.categories.push(nextCategory);
    }
    nextCategory.sortindex = Number(row.source_sort_index || nextCategory.sortindex || defaultSortIndexForCategory(nextCategoryName, 999));
    nextCategory.items.push({
      data: {
        title: songTitle,
        type: chartType,
        implicitType: false,
        releaseStatus: normalizeReleaseStatus(row.release_status),
        bpm: String(row.bpm || '').trim(),
        atwikiNotes: Number(row.note_count || 0),
        typeInfo: String(row.type_info || '').trim(),
        radar: {
          NOTES: Number(row.radar_notes || 0),
          PEAK: Number(row.radar_peak || 0),
          SCRATCH: Number(row.radar_scratch || 0),
          SOFLAN: Number(row.radar_soflan || 0),
          CHARGE: Number(row.radar_charge || 0),
          CHORD: Number(row.radar_chord || 0)
        },
        radarTop: String(row.radar_top || '').trim()
      }
    });
    table.categories.sort((a, b) => Number(a.sortindex || 999) - Number(b.sortindex || 999));
    table.categories.forEach((category) => category.items.sort((a, b) => String(a?.data?.title || '').localeCompare(String(b?.data?.title || ''), 'ko')));

    if (!state.songRadarCatalog || !Array.isArray(state.songRadarCatalog.charts)) {
      state.songRadarCatalog = { charts: [] };
    }
    const radarKey = `${titleKey(songTitle)}|${chartType}`;
    const radarEntry = {
      title: songTitle,
      type: chartType,
      releaseStatus: normalizeReleaseStatus(row.release_status),
      notes: Number(row.note_count || 0),
      radar: {
        NOTES: Number(row.radar_notes || 0),
        PEAK: Number(row.radar_peak || 0),
        SCRATCH: Number(row.radar_scratch || 0),
        SOFLAN: Number(row.radar_soflan || 0),
        CHARGE: Number(row.radar_charge || 0),
        CHORD: Number(row.radar_chord || 0)
      },
      radarTop: String(row.radar_top || row.type_info || '').trim()
    };
    const nextRadarCharts = (state.songRadarCatalog.charts || []).filter((item) => (
      `${titleKey(item?.title)}|${String(item?.type || '').trim().toUpperCase()}` !== radarKey
    ));
    nextRadarCharts.push(radarEntry);
    nextRadarCharts.sort((a, b) => String(a?.title || '').localeCompare(String(b?.title || ''), 'ko'));
    state.songRadarCatalog.charts = nextRadarCharts;

    rebuildViews();
    state.selectedChart = Object.values(state.tableViews || {})
      .flatMap((view) => view.flatCharts || [])
      .find((chart) => chart.key === `${tableKey}|${titleKey(songTitle)}|${chartType}`) || null;
    return state.selectedChart;
  }

  function removeChartMetadataRowFromLocalState(row) {
    const tableKey = String(row?.table_key || row?.tableKey || '').trim();
    const chartType = String(row?.chart_type || row?.chartType || '').trim().toUpperCase();
    const songTitle = String(row?.song_title || row?.songTitle || '').trim();
    if (!tableKey || !songTitle || !chartType) return;

    const table = state.rankTables[tableKey];
    if (table) {
      table.categories = (table.categories || [])
        .map((category) => ({
          ...category,
          items: (category.items || []).filter((item) => !(
            titleKey(item?.data?.title) === titleKey(songTitle)
            && String(item?.data?.type || '').trim().toUpperCase() === chartType
          ))
        }))
        .filter((category) => (category.items || []).length > 0);
    }

    if (state.songRadarCatalog && Array.isArray(state.songRadarCatalog.charts)) {
      const radarKey = `${titleKey(songTitle)}|${chartType}`;
      state.songRadarCatalog.charts = state.songRadarCatalog.charts.filter((item) => (
        `${titleKey(item?.title)}|${String(item?.type || '').trim().toUpperCase()}` !== radarKey
      ));
    }

    rebuildViews();
    if (state.selectedChart?.key === `${tableKey}|${titleKey(songTitle)}|${chartType}`) {
      state.selectedChart = null;
    }
  }

  function openSongMetaEditor(chartKey = '') {
    if (!state.auth.isAdmin) return showToast('관리자 계정만 곡 정보를 편집할 수 있습니다.');
    const chart = Object.values(state.tableViews || []).flatMap((view) => view.flatCharts || []).find((row) => row.key === chartKey) || state.selectedChart;
    if (!chart) return;
    const meta = findChartCategoryMeta(chart);
    state.songMetaEditor = {
      open: true,
      chartKey: chart.key,
      tableKey: chart.tableName,
      songTitle: chart.title,
      chartType: chart.type
    };
    $('songMetaEditorTitleText').textContent = '곡 정보 수정';
    $('songMetaEditorMeta').textContent = `${chart.tableName} / ${chart.title} [${chart.type}]`;
    populateSongMetaCategorySelect(meta.category);
    $('songMetaSortIndex').dataset.touched = 'false';
    $('songMetaSortIndex').value = String(meta.sortIndex);
    $('songMetaNotes').value = String(Number(chart.metaNotes || chart.noteCount || 0));
    $('songMetaTypeInfo').value = String(chart.metaType || chart.radarTop || '');
    $('songMetaBpm').value = String(chart.bpm || '');
    $('songMetaRadarNotes').value = String(Number(chart.radar?.NOTES || 0));
    $('songMetaRadarPeak').value = String(Number(chart.radar?.PEAK || 0));
    $('songMetaRadarScratch').value = String(Number(chart.radar?.SCRATCH || 0));
    $('songMetaRadarSoflan').value = String(Number(chart.radar?.SOFLAN || 0));
    $('songMetaRadarCharge').value = String(Number(chart.radar?.CHARGE || 0));
    $('songMetaRadarChord').value = String(Number(chart.radar?.CHORD || 0));
    $('songPopup')?.classList.add('hidden');
    if (!$('songMetaEditorDialog')?.open) $('songMetaEditorDialog')?.showModal();
  }

  function closeSongMetaEditor(options = {}) {
    state.songMetaEditor = { open: false, chartKey: '', tableKey: '', songTitle: '', chartType: '' };
    if (!options.skipDialogClose) $('songMetaEditorDialog')?.close(options.reason || 'cancel');
  }

  async function saveSongMetaEditor() {
    if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 곡 정보를 저장할 수 있습니다.');
    const payload = songMetaEditorPayloadFromForm();
    if (!payload.chartKey) return showToast('편집할 곡 정보를 찾지 못했습니다.');
    if (!payload.category) return showToast('서열표 분류를 선택하세요.');
    await withBusyOverlay(
      '곡 정보 저장 중...',
      '곡 메타데이터를 서버에 반영하고 있습니다.',
      async () => {
        const row = await rpc('admin_update_chart_metadata', {
          p_chart_key: payload.chartKey,
          p_table_key: payload.tableKey,
          p_song_title: payload.songTitle,
          p_chart_type: payload.chartType,
          p_category: payload.category,
          p_source_sort_index: Number.isFinite(payload.sourceSortIndex) ? payload.sourceSortIndex : defaultSortIndexForCategory(payload.category, 999),
          p_note_count: Math.max(0, Math.round(payload.noteCount || 0)),
          p_type_info: payload.typeInfo,
          p_bpm: payload.bpm,
          p_radar_notes: Math.max(0, Number(payload.radarNotes || 0)),
          p_radar_peak: Math.max(0, Number(payload.radarPeak || 0)),
          p_radar_scratch: Math.max(0, Number(payload.radarScratch || 0)),
          p_radar_soflan: Math.max(0, Number(payload.radarSoflan || 0)),
          p_radar_charge: Math.max(0, Number(payload.radarCharge || 0)),
          p_radar_chord: Math.max(0, Number(payload.radarChord || 0))
        });
        applyChartMetadataRowToLocalState(Array.isArray(row) ? row[0] : row);
        closeSongMetaEditor();
        markSnapshotPublishNeeded('곡 메타 변경사항이 저장되었습니다. 정적 스냅샷 배포가 필요합니다.');
        render();
        showToast('곡 정보를 저장했습니다.');
      }
    );
  }

  async function deleteSongMetaEditor() {
    if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 곡 정보를 삭제할 수 있습니다.');
    const payload = songMetaEditorPayloadFromForm();
    if (!payload.chartKey) return showToast('삭제할 곡 정보를 찾지 못했습니다.');
    const confirmed = window.confirm(`정말로 ${payload.songTitle} [${payload.chartType}] 메타를 삭제할까요?\n이 작업 후에는 정적 스냅샷 재배포가 필요합니다.`);
    if (!confirmed) return;
    await withBusyOverlay(
      '곡 정보 삭제 중...',
      '선택한 곡 메타데이터를 서버에서 숨기고 있습니다.',
      async () => {
        const row = await rpc('admin_delete_chart_metadata', {
          p_chart_key: payload.chartKey,
          p_table_key: payload.tableKey,
          p_song_title: payload.songTitle,
          p_chart_type: payload.chartType
        });
        removeChartMetadataRowFromLocalState(Array.isArray(row) ? row[0] : row || payload);
        closeSongMetaEditor();
        markSnapshotPublishNeeded('곡 메타 삭제사항이 저장되었습니다. 정적 스냅샷 배포가 필요합니다.');
        render();
        showToast('곡 정보를 삭제했습니다.');
      }
    );
  }

  async function publishSnapshotChanges() {
    if (!state.auth.isAdmin) return showToast('관리자 계정만 배포를 요청할 수 있습니다.');
    state.snapshotPublish = {
      ...state.snapshotPublish,
      busy: true,
      message: 'GitHub Actions에 배포를 요청하는 중입니다.'
    };
    render();
    try {
      const result = await requestSnapshotPublish();
      state.snapshotPublish = {
        busy: false,
        needsPublish: false,
        message: String(result?.message || '정적 스냅샷 배포 요청을 보냈습니다. GitHub Actions 진행 상황을 확인하세요.'),
        workflowUrl: String(result?.workflowUrl || '').trim()
      };
      render();
      showToast('변경사항 배포를 요청했습니다.');
    } catch (error) {
      state.snapshotPublish = {
        ...state.snapshotPublish,
        busy: false,
        message: `배포 요청 실패: ${String(error?.message || error || '알 수 없는 오류')}`
      };
      render();
      showToast(state.snapshotPublish.message);
    }
  }

  async function applyPendingChartRelease(chartKey = '') {
    if (!state.auth.isAdmin || !state.auth.user) return showToast('관리자 계정만 미출시 후보를 공개 상태로 바꿀 수 있습니다.');
    const chart = Object.values(state.tableViews || []).flatMap((view) => view.flatCharts || []).find((row) => row.key === chartKey) || state.selectedChart;
    if (!chart?.isPendingRelease) return;
    await withBusyOverlay(
      '서열표 반영 중...',
      '미출시 후보 곡을 공개 서열표 대상으로 전환하고 있습니다.',
      async () => {
        const row = await rpc('admin_set_chart_release_status', {
          p_chart_key: chart.key,
          p_table_key: chart.tableName,
          p_song_title: chart.title,
          p_chart_type: chart.type,
          p_release_status: 'live'
        });
        applyChartMetadataRowToLocalState(Array.isArray(row) ? row[0] : row);
        markSnapshotPublishNeeded('미출시 후보 곡이 서열표 반영 대상으로 전환되었습니다. 변경사항 배포를 누르면 일반 유저에게도 공개됩니다.');
        render();
        showToast('서열표 반영 대상으로 전환했습니다. 이제 변경사항 배포를 누르세요.');
      }
    );
  }

  return {
    refreshAppNotices,
    loadStaticData,
    openNoticeEditor,
    closeNoticeEditor,
    saveNoticeEditor,
    openSongMetaEditor,
    closeSongMetaEditor,
    saveSongMetaEditor,
    deleteSongMetaEditor,
    syncSongMetaSortIndexFromCategory,
    publishSnapshotChanges,
    applyPendingChartRelease
  };
}
