import { mergeAcceptedSharedBingo } from './bingo-state.js';

export function createSocialController(env) {
  const {
    state,
    isAuthorized,
    showToast,
    rpc,
    syncSocial,
    refreshProfile,
    currentPublishedBingo,
    currentSavedBoards,
    ensureBingoState,
    syncPublishedFromSavedBoards,
    persistBingoDraftCache,
    saveProfileToCloud,
    buildCompletionNoticeIfNeeded,
    flushCompletionNotice,
    findFeedItemById,
    normalizeIncomingBingo,
    openBingoPreview,
    normalizeInfinitasIdForSearch,
    authClient,
    normalizeSocialSettings,
    currentSocialSettings,
    loadImageElementFromFile,
    normalizeBannerImage,
    withBusyOverlay,
    render,
    createHistorySectionState,
    buildBingoTransferPayload,
    $,
    esc
  } = env;

  let bannerEditor = {
    file: null,
    image: null,
    objectUrl: '',
    cropX: 0.5,
    cropY: 0.5,
    zoom: 1,
    drag: null
  };

  function selfUserId() {
    return String(state.auth.user?.id || '').trim();
  }

  function removeFeedEventLocally(eventId) {
    const targetId = String(eventId || '').trim();
    if (!targetId) return;
    state.social.feedItems = (state.social.feedItems || []).filter((item) => String(item?.id || '') !== targetId);
    render();
  }

  function followTargetLabel(rawLabel) {
    return String(rawLabel || '').trim() || '상대';
  }

  async function requestFollow(targetUserId, targetLabel, options = {}) {
    const nextTargetId = String(targetUserId || '').trim();
    if (!nextTargetId) return null;
    if (nextTargetId === selfUserId()) {
      showToast('자기 자신은 팔로우할 수 없습니다.');
      return 'self';
    }
    const result = await rpc('send_follow_request', { p_target_user_id: nextTargetId });
    if (options.closeDialog !== false) $('socialFollowAddDialog')?.close('done');
    if (options.sync !== false) await syncSocial();
    const label = followTargetLabel(targetLabel);
    if (options.showToast !== false) {
      if (result === 'already_following') showToast(`${label} 님은 이미 팔로우 중입니다.`);
      else if (result === 'auto_accepted') showToast(`${label} 님이 팔로우 요청을 바로 수락했습니다.`);
      else showToast(`${label} 님에게 팔로우 요청을 보냈습니다.`);
    }
    return result;
  }

  function mergeAcceptedBingoState(previousBingoState, acceptedBoard) {
    state.profile.bingoState = mergeAcceptedSharedBingo(previousBingoState, acceptedBoard);
    persistBingoDraftCache(state.profile, state.auth.user);
  }

  function clearBannerEditorSession() {
    if (bannerEditor.objectUrl) URL.revokeObjectURL(bannerEditor.objectUrl);
    bannerEditor = {
      file: null,
      image: null,
      objectUrl: '',
      cropX: 0.5,
      cropY: 0.5,
      zoom: 1,
      drag: null
    };
    const image = $('socialBannerEditorImage');
    const empty = $('socialBannerEditorEmpty');
    const frame = $('socialBannerEditorFrame');
    if (image) {
      image.src = '';
      image.classList.add('hidden');
      image.removeAttribute('style');
    }
    if (empty) empty.classList.remove('hidden');
    frame?.classList.remove('is-dragging');
  }

  function getBannerPreviewMetrics() {
    if (!bannerEditor.image) return null;
    const frame = $('socialBannerEditorFrame');
    if (!frame) return null;
    const frameWidth = Math.max(1, frame.clientWidth || 0);
    const frameHeight = Math.max(1, frame.clientHeight || 0);
    if (!frameWidth || !frameHeight) return null;
    const imageWidth = Math.max(1, bannerEditor.image.naturalWidth || 0);
    const imageHeight = Math.max(1, bannerEditor.image.naturalHeight || 0);
    const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * Math.max(1, Number(bannerEditor.zoom || 1));
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const overflowX = Math.max(0, drawWidth - frameWidth);
    const overflowY = Math.max(0, drawHeight - frameHeight);
    return { frameWidth, frameHeight, drawWidth, drawHeight, overflowX, overflowY };
  }

  function renderBannerEditorPreview() {
    const image = $('socialBannerEditorImage');
    const empty = $('socialBannerEditorEmpty');
    if (!image || !bannerEditor.image) return;
    const metrics = getBannerPreviewMetrics();
    if (!metrics) {
      window.requestAnimationFrame(renderBannerEditorPreview);
      return;
    }
    const left = metrics.overflowX > 0
      ? -metrics.overflowX * bannerEditor.cropX
      : (metrics.frameWidth - metrics.drawWidth) / 2;
    const top = metrics.overflowY > 0
      ? -metrics.overflowY * bannerEditor.cropY
      : (metrics.frameHeight - metrics.drawHeight) / 2;
    image.style.width = `${metrics.drawWidth}px`;
    image.style.height = `${metrics.drawHeight}px`;
    image.style.left = `${left}px`;
    image.style.top = `${top}px`;
    image.classList.remove('hidden');
    empty?.classList.add('hidden');
  }

  async function openSocialBannerEditor(file) {
    if (!isAuthorized() || !file) return;
    const mime = String(file.type || '').toLowerCase();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return showToast('배너 이미지는 JPG/PNG/WEBP 파일만 사용할 수 있습니다.');
    }
    if ((file.size || 0) > 2 * 1024 * 1024) {
      return showToast('배너 파일은 최대 2MB까지 가능합니다.');
    }
    try {
      const image = await loadImageElementFromFile(file);
      clearBannerEditorSession();
      bannerEditor.file = file;
      bannerEditor.image = image;
      bannerEditor.objectUrl = URL.createObjectURL(file);
      bannerEditor.cropX = 0.5;
      bannerEditor.cropY = 0.5;
      bannerEditor.zoom = 1;
      const imageEl = $('socialBannerEditorImage');
      if (imageEl) imageEl.src = bannerEditor.objectUrl;
      $('socialBannerEditorDialog')?.showModal();
      window.requestAnimationFrame(renderBannerEditorPreview);
    } catch (error) {
      clearBannerEditorSession();
      showToast(error.message || '배너 이미지를 불러오지 못했습니다.');
    }
  }

  function closeSocialBannerEditor(options = {}) {
    if (!options.skipDialogClose) {
      const dialog = $('socialBannerEditorDialog');
      if (dialog?.open) dialog.close(options.reason || 'cancel');
    }
    clearBannerEditorSession();
  }

  function startSocialBannerDrag(event) {
    if (!bannerEditor.image) return;
    const frame = $('socialBannerEditorFrame');
    const metrics = getBannerPreviewMetrics();
    if (!frame || !metrics) return;
    event.preventDefault();
    bannerEditor.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cropX: bannerEditor.cropX,
      cropY: bannerEditor.cropY
    };
    frame.classList.add('is-dragging');
    frame.setPointerCapture?.(event.pointerId);
  }

  function moveSocialBannerDrag(event) {
    if (!bannerEditor.drag || bannerEditor.drag.pointerId !== event.pointerId) return;
    const metrics = getBannerPreviewMetrics();
    if (!metrics) return;
    if (metrics.overflowX > 0) {
      const startLeft = -metrics.overflowX * bannerEditor.drag.cropX;
      const nextLeft = Math.min(0, Math.max(-metrics.overflowX, startLeft + (event.clientX - bannerEditor.drag.startX)));
      bannerEditor.cropX = Math.min(1, Math.max(0, -nextLeft / metrics.overflowX));
    } else {
      bannerEditor.cropX = 0.5;
    }
    if (metrics.overflowY > 0) {
      const startTop = -metrics.overflowY * bannerEditor.drag.cropY;
      const nextTop = Math.min(0, Math.max(-metrics.overflowY, startTop + (event.clientY - bannerEditor.drag.startY)));
      bannerEditor.cropY = Math.min(1, Math.max(0, -nextTop / metrics.overflowY));
    } else {
      bannerEditor.cropY = 0.5;
    }
    renderBannerEditorPreview();
  }

  function endSocialBannerDrag(event) {
    if (!bannerEditor.drag) return;
    if (event.pointerId != null && bannerEditor.drag.pointerId !== event.pointerId) return;
    const frame = $('socialBannerEditorFrame');
    frame?.classList.remove('is-dragging');
    frame?.releasePointerCapture?.(bannerEditor.drag.pointerId);
    bannerEditor.drag = null;
  }

  function zoomSocialBannerEditor(event) {
    if (!bannerEditor.image) return;
    event.preventDefault();
    const nextZoom = Math.min(4, Math.max(1, Number(bannerEditor.zoom || 1) + (event.deltaY < 0 ? 0.12 : -0.12)));
    if (Math.abs(nextZoom - Number(bannerEditor.zoom || 1)) < 0.0001) return;
    bannerEditor.zoom = nextZoom;
    renderBannerEditorPreview();
  }

  function mutualFollowPeers() {
    const byPeer = new Map();
    (state.social.overviewRows || []).filter((row) => row.relation_type === 'follow').forEach((row) => {
      const key = String(row.peer_user_id || '');
      const current = byPeer.get(key) || { ...row, following: false, follower: false };
      if (String(row.direction || '') === 'following') current.following = true;
      if (String(row.direction || '') === 'follower') current.follower = true;
      byPeer.set(key, current);
    });
    return [...byPeer.values()].filter((peer) => peer.following && peer.follower);
  }

  function openBingoShare() {
    if (!isAuthorized()) return;
    const payload = buildBingoTransferPayload();
    if (!payload) return showToast('완성된 빙고를 먼저 저장하세요.');
    const peers = mutualFollowPeers();
    $('goalSendList').innerHTML = peers.length
      ? peers.map((peer) => `<div class="social-follow-user">
        <div class="social-avatar social-avatar-plain">${peer.icon_data_url ? `<img src="${esc(peer.icon_data_url)}" alt="${esc(peer.dj_name || '팔로우 유저')}" />` : '<span class="social-avatar-person">♪</span>'}</div>
        <div>
          <div class="social-follow-name">${esc(peer.dj_name || '이름 없음')}</div>
          <div class="social-item-sub">${esc(peer.infinitas_id || '')}</div>
        </div>
        <button type="button" class="social-follow-back" data-bingo-send-peer="${esc(peer.peer_user_id)}">공유</button>
      </div>`).join('')
      : '<div class="history-empty">서로 팔로우 상태인 대상이 없습니다.</div>';
    $('goalSendDialog')?.showModal();
  }

  async function respondFollowLegacy(requestId, accept) {
    try {
      await rpc('respond_follow_request', { p_request_id: requestId, p_accept: accept });
      await syncSocial();
    } catch (error) {
      showToast(`팔로우 요청 처리 실패: ${error.message || error}`);
    }
  }

  async function respondFollow(requestId, accept, options = {}) {
    try {
      await rpc('respond_follow_request', { p_request_id: requestId, p_accept: accept });
      if (options.eventId) {
        removeFeedEventLocally(options.eventId);
        try {
          await rpc('dismiss_feed_event', { p_event_id: options.eventId });
        } catch (dismissError) {
          console.warn('Failed to dismiss follow feed event', dismissError);
        }
      }
      if (accept) {
        const wantsFollowBack = options.peerUserId
          && options.peerUserId !== selfUserId()
          && window.confirm('수락하였습니다. 맞팔하시겠습니까?');
        if (wantsFollowBack) {
          await requestFollow(options.peerUserId, options.peerLabel, {
            closeDialog: false,
            sync: false
          });
        } else {
          showToast('팔로우 요청을 수락했습니다.');
        }
      } else {
        showToast('팔로우 요청을 거절했습니다.');
      }
      await syncSocial();
    } catch (error) {
      showToast(`팔로우 요청 처리 실패: ${error.message || error}`);
    }
  }

  async function respondGoal(transferId, accept) {
    try {
      await rpc('respond_goal_transfer', { p_transfer_id: transferId, p_accept: accept });
      await refreshProfile();
    } catch (error) {
      showToast(`목표 응답 실패: ${error.message || error}`);
    }
  }

  async function respondBingoLegacy(transferId, accept) {
    if (accept && currentPublishedBingo() && !window.confirm('이미 저장된 빙고가 있습니다. 수락하면 현재 빙고를 덮어씁니다. 계속할까요?')) {
      return;
    }
    try {
      await rpc('respond_bingo_transfer', { p_transfer_id: transferId, p_accept: accept });
      await refreshProfile();
      if (accept && currentSavedBoards().length > 5) {
        const bingo = ensureBingoState();
        bingo.savedBoards = currentSavedBoards().slice(0, 5);
        syncPublishedFromSavedBoards();
        await saveProfileToCloud(state.auth.user, state.profile, 'bingo-transfer-accepted');
      }
      const completionNotice = buildCompletionNoticeIfNeeded();
      if (completionNotice) {
        await saveProfileToCloud(state.auth.user, state.profile, 'bingo-transfer-accepted');
        await flushCompletionNotice(completionNotice);
      }
      if (accept) showToast('빙고를 수락해 현재 목표에 반영했습니다.');
    } catch (error) {
      showToast(`빙고 응답 실패: ${error.message || error}`);
    }
  }

  async function respondBingo(transferId, accept) {
    if (accept && currentSavedBoards().length >= 5) {
      showToast('저장 가능한 빙고는 최대 5개입니다. 기존 빙고를 하나 삭제한 뒤 수락하세요.');
      return;
    }
    try {
      const previousBingoState = JSON.parse(JSON.stringify(ensureBingoState()));
      await rpc('respond_bingo_transfer', { p_transfer_id: transferId, p_accept: accept });
      await refreshProfile();
      if (accept) {
        const acceptedBoard = currentPublishedBingo();
        mergeAcceptedBingoState(previousBingoState, acceptedBoard);
        await saveProfileToCloud(state.auth.user, state.profile, 'bingo-transfer-accepted');
      }
      const completionNotice = buildCompletionNoticeIfNeeded();
      if (completionNotice) {
        await saveProfileToCloud(state.auth.user, state.profile, 'bingo-transfer-accepted');
        await flushCompletionNotice(completionNotice);
      }
      await syncSocial();
      if (accept) showToast('빙고를 수락했습니다.');
      else showToast('빙고를 거절했습니다.');
    } catch (error) {
      showToast(`빙고 응답 실패: ${error.message || error}`);
    }
  }

  function previewBingoFeed(eventId) {
    const feedItem = findFeedItemById(eventId);
    const incoming = normalizeIncomingBingo(feedItem?.payload?.bingo);
    if (!incoming) return showToast('미리보기 가능한 빙고 데이터가 없습니다.');
    const senderLabel = String(feedItem?.payload?.sender_label || '').trim()
      || String(feedItem?.actor_dj_name || '').trim()
      || '상대 유저';
    openBingoPreview({
      ...incoming,
      senderLabel
    });
  }

  async function searchUserLegacy() {
    try {
      const category = $('socialSearchCategory')?.value || 'dj';
      const keyword = String($('socialSearchKeyword')?.value || '').trim();
      if (!keyword) return;
      const result = $('socialSearchResult');
      let rows = [];
      if (category === 'id') rows = await rpc('get_public_profile_by_infinitas_id', { p_infinitas_id: normalizeInfinitasIdForSearch(keyword) });
      else rows = await rpc('get_public_profile_by_dj_name', { p_dj_name: keyword });
      result.innerHTML = Array.isArray(rows) && rows.length ? rows.map((row) => `<div class="social-search-hit"><div class="social-follow-user"><div class="social-avatar social-avatar-plain">${row.icon_data_url ? `<img src="${esc(row.icon_data_url)}" alt="${esc(row.dj_name || '검색 결과 유저')}" />` : '<span class="social-avatar-person">♪</span>'}</div><div><div class="social-follow-name">${esc(row.dj_name || '이름 없음')}</div><div class="social-item-sub">${esc(row.infinitas_id || '')}</div></div><button type="button" class="social-follow-back" data-follow-target="${esc(row.auth_user_id)}">팔로우</button></div></div>`).join('') : '검색 결과가 없습니다.';
      result.classList.remove('hidden');
    } catch (error) {
      showToast(`검색 실패: ${error.message || error}`);
    }
  }

  async function sendFollowLegacy(targetUserId) {
    try {
      await rpc('send_follow_request', { p_target_user_id: targetUserId });
      $('socialFollowAddDialog')?.close('done');
      await syncSocial();
    } catch (error) {
      showToast(`팔로우 요청 실패: ${error.message || error}`);
    }
  }

  async function searchUser() {
    try {
      const category = $('socialSearchCategory')?.value || 'dj';
      const keyword = String($('socialSearchKeyword')?.value || '').trim();
      if (!keyword) return;
      const result = $('socialSearchResult');
      let rows = [];
      if (category === 'id') rows = await rpc('get_public_profile_by_infinitas_id', { p_infinitas_id: normalizeInfinitasIdForSearch(keyword) });
      else rows = await rpc('get_public_profile_by_dj_name', { p_dj_name: keyword });
      const me = selfUserId();
      result.innerHTML = Array.isArray(rows) && rows.length ? rows.map((row) => {
        const isSelf = String(row?.auth_user_id || '') === me;
        const label = String(row?.dj_name || row?.infinitas_id || '상대').trim();
        const actionHtml = isSelf
          ? ''
          : `<button type="button" class="social-follow-back" data-follow-target="${esc(row.auth_user_id)}" data-follow-label="${esc(label)}">팔로우</button>`;
        return `<div class="social-search-hit"><div class="social-follow-user"><div class="social-avatar social-avatar-plain">${row.icon_data_url ? `<img src="${esc(row.icon_data_url)}" alt="${esc(row.dj_name || '검색 결과 유저')}" />` : '<span class="social-avatar-person">👤</span>'}</div><div><div class="social-follow-name">${esc(row.dj_name || '이름 없음')}</div><div class="social-item-sub">${esc(row.infinitas_id || '')}</div></div>${actionHtml}</div></div>`;
      }).join('') : '검색 결과가 없습니다.';
      result.classList.remove('hidden');
    } catch (error) {
      showToast(`검색 실패: ${error.message || error}`);
    }
  }

  async function sendFollow(targetUserId, targetLabel = '') {
    try {
      await requestFollow(targetUserId, targetLabel, { closeDialog: true, sync: true });
    } catch (error) {
      showToast(`팔로우 요청 실패: ${error.message || error}`);
    }
  }

  async function dismissFeed(eventId) {
    try {
      await rpc('dismiss_feed_event', { p_event_id: eventId });
      await syncSocial();
    } catch (error) {
      showToast(`피드 처리 실패: ${error.message || error}`);
    }
  }

  async function dismissAllFeed() {
    try {
      await rpc('dismiss_all_feed_events');
      await syncSocial();
    } catch (error) {
      showToast(`피드 처리 실패: ${error.message || error}`);
    }
  }

  function openGoalSend() {
    openBingoShare();
  }

  async function sendGoal(goalId, peerUserId) {
    await sendBingo(peerUserId);
  }

  async function sendBingo(peerUserId) {
    const payload = buildBingoTransferPayload();
    if (!payload) return showToast('완성된 빙고를 먼저 저장하세요.');
    try {
      await rpc('send_bingo_to_user', {
        p_target_user_id: peerUserId,
        p_bingo: payload,
        p_sender_dj_name: state.profile.djName,
        p_sender_infinitas_id: state.profile.infinitasId
      });
      $('goalSendDialog')?.close('done');
      await syncSocial();
      showToast('빙고 공유 요청을 보냈습니다.');
    } catch (error) {
      showToast(`빙고 공유 실패: ${error.message || error}`);
    }
  }

  async function unfollowPeer() {
    const peerUserId = $('socialPeerMenu').dataset.peerUserId;
    if (!peerUserId) return;
    try {
      const client = authClient();
      const { error } = await client
        .from('follows')
        .delete()
        .eq('follower_user_id', state.auth.user.id)
        .eq('following_user_id', peerUserId);
      if (error) throw error;
      $('socialPeerMenu')?.classList.add('hidden');
      await syncSocial();
    } catch (error) {
      showToast(`팔로우 취소 실패: ${error.message || error}`);
    }
  }

  async function saveSettings() {
    if (!isAuthorized()) return;
    state.profile.socialSettings = normalizeSocialSettings({
      discoverability: $('settingDiscoverability')?.checked ? 'searchable' : 'hidden',
      discoverByDjName: $('settingDiscoverabilityDjName')?.checked,
      followPolicy: $('settingFollowPolicyAuto')?.checked ? 'auto' : $('settingFollowPolicyDisabled')?.checked ? 'disabled' : 'manual',
      shareDataScope: $('settingShareAllData')?.checked
        ? ['all']
        : $('settingShareNone')?.checked
          ? ['none']
          : ['graphs'],
      goalTransferPolicy: 'disabled',
      rivalPolicy: 'followers',
      bannerDataUrl: currentSocialSettings().bannerDataUrl || ''
    });
    await saveProfileToCloud(state.auth.user, state.profile, 'settings-save');
    $('settingsDialog')?.close('done');
    render();
    showToast('설정을 저장했습니다.');
  }

  async function openSocialHistoryDetail(feedId, peerUserId, historyId) {
    if (!feedId || !peerUserId || !historyId) return;
    const feedItem = (state.social.feedItems || []).find((item) => String(item.id || '') === String(feedId));
    state.socialHistoryPopup = {
      open: true,
      feedId: String(feedId),
      peerUserId: String(peerUserId),
      historyId: String(historyId),
      peerLabel: String(feedItem?.actor_dj_name || '팔로우'),
      loading: true,
      error: '',
      history: null,
      prevHistory: null,
      sectionOpen: createHistorySectionState()
    };
    render();
    try {
      const data = await rpc('get_follow_history_detail', {
        p_peer_user_id: peerUserId,
        p_history_id: historyId
      });
      const row = Array.isArray(data) ? data[0] : data;
      state.socialHistoryPopup.loading = false;
      state.socialHistoryPopup.history = row?.history || null;
      state.socialHistoryPopup.prevHistory = row?.prev_history || null;
      state.socialHistoryPopup.error = row?.history ? '' : '히스토리 상세를 찾지 못했습니다.';
      if (row?.dj_name) {
        state.socialHistoryPopup.peerLabel = row.infinitas_id
          ? `${row.dj_name} (${row.infinitas_id})`
          : row.dj_name;
      }
    } catch (error) {
      state.socialHistoryPopup.loading = false;
      state.socialHistoryPopup.error = `상세를 불러오지 못했습니다: ${error.message || error}`;
    }
    render();
  }

  function toggleSocialHistorySection(section) {
    if (!section || !(section in state.socialHistoryPopup.sectionOpen)) return;
    state.socialHistoryPopup.sectionOpen[section] = !state.socialHistoryPopup.sectionOpen[section];
    render();
  }

  async function saveSocialBannerEditor() {
    if (!isAuthorized() || !bannerEditor.file) return;
    const file = bannerEditor.file;
    const crop = { x: bannerEditor.cropX, y: bannerEditor.cropY, zoom: bannerEditor.zoom };
    closeSocialBannerEditor();
    try {
      const banner = await normalizeBannerImage(file, crop);
      state.profile.socialSettings = normalizeSocialSettings({
        ...currentSocialSettings(),
        bannerDataUrl: banner.dataUrl
      });
      await saveProfileToCloud(state.auth.user, state.profile, 'social-banner');
      render();
      showToast(`배너를 저장했습니다. 권장 규격은 ${banner.width}x${banner.height}px입니다.`);
    } catch (error) {
      showToast(error.message || '배너 저장에 실패했습니다.');
    }
  }

  async function saveSocialBannerEditorWithBusy() {
    if (!isAuthorized() || !bannerEditor.file) return;
    const file = bannerEditor.file;
    const crop = { x: bannerEditor.cropX, y: bannerEditor.cropY };
    closeSocialBannerEditor();
    try {
      await withBusyOverlay(
        '카드 배경 저장 중...',
        '배너 이미지를 적용하고 있습니다.',
        async () => {
          const banner = await normalizeBannerImage(file, crop);
          state.profile.socialSettings = normalizeSocialSettings({
            ...currentSocialSettings(),
            bannerDataUrl: banner.dataUrl
          });
          await saveProfileToCloud(state.auth.user, state.profile, 'social-banner');
          render();
          showToast(`배너를 저장했습니다. 권장 규격은 ${banner.width}x${banner.height}px입니다.`);
        }
      );
    } catch (error) {
      showToast(error.message || '배너 저장에 실패했습니다.');
    }
  }

  function setSettingsTab(tab) {
    state.settingsTab = tab;
    document.querySelectorAll('.settings-nav-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.settingsTab === tab));
    document.querySelectorAll('.settings-panel-content').forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsPanel === tab));
  }

  return {
    mutualFollowPeers,
    openBingoShare,
    respondFollow,
    respondGoal,
    respondBingo,
    previewBingoFeed,
    searchUser,
    sendFollow,
    dismissFeed,
    dismissAllFeed,
    openGoalSend,
    sendGoal,
    sendBingo,
    unfollowPeer,
    saveSettings,
    openSocialHistoryDetail,
    toggleSocialHistorySection,
    openSocialBannerEditor,
    closeSocialBannerEditor,
    saveSocialBannerEditor: saveSocialBannerEditorWithBusy,
    startSocialBannerDrag,
    moveSocialBannerDrag,
    endSocialBannerDrag,
    zoomSocialBannerEditor,
    setSettingsTab
  };
}
