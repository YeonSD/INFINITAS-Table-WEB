export function createAccountController({
  state,
  render,
  syncSocial,
  isAuthorized,
  ensureBingoState,
  restoreBingoDraftCache,
  syncGoalStoreFromBingoDraft,
  latestHistoryId,
  createHistorySectionState,
  closeSocialHistoryPopup,
  emptyProfile,
  saveProfileToCloud,
  saveUserProfileToCloud,
  ensureAuthServerReady,
  signInWithGoogle,
  signOut: authSignOut,
  getInitialSession,
  onAuthStateChange,
  loadProfileFromCloud,
  purgeProfile,
  withTimeout,
  withBusyOverlay,
  describeRemoteError,
  showToast,
  normalizeInfinitasIdForSearch,
  formatInfinitasIdDisplay,
  validateIconFile,
  loadImageElementFromFile,
  normalizeIconImage,
  isAdminAccount,
  $
}) {
  const GUEST_PROFILE_CACHE_KEY = 'itm.guest.profile';
  const SIGNUP_PENDING_CACHE_KEY = 'itm.signup.pending';

  let profileRefreshPromise = null;
  let iconEditor = {
    file: null,
    image: null,
    objectUrl: '',
    cropX: 0.5,
    cropY: 0.5,
    zoom: 1,
    drag: null
  };

  function loadGuestProfileCache() {
    let cached = null;
    try {
      cached = JSON.parse(window.localStorage.getItem(GUEST_PROFILE_CACHE_KEY) || 'null');
    } catch {
      cached = null;
    }
    state.guest.djName = String(cached?.djName || '').trim() || 'GUEST';
    state.guest.infinitasId = String(cached?.infinitasId || '').trim() || 'C-0000-0000-0000';
  }

  function persistGuestProfileCache() {
    try {
      window.localStorage.setItem(GUEST_PROFILE_CACHE_KEY, JSON.stringify({
        djName: String(state.guest.djName || '').trim() || 'GUEST',
        infinitasId: String(state.guest.infinitasId || '').trim() || 'C-0000-0000-0000'
      }));
    } catch {
      // Ignore storage errors and continue.
    }
  }

  function readPendingSignupDraft() {
    let cached = null;
    try {
      cached = JSON.parse(window.localStorage.getItem(SIGNUP_PENDING_CACHE_KEY) || 'null');
    } catch {
      cached = null;
    }
    if (!cached || typeof cached !== 'object') return null;
    return {
      djName: String(cached.djName || '').trim(),
      infinitasId: String(cached.infinitasId || '').trim()
    };
  }

  function writePendingSignupDraft(draft) {
    try {
      window.localStorage.setItem(SIGNUP_PENDING_CACHE_KEY, JSON.stringify({
        djName: String(draft?.djName || '').trim(),
        infinitasId: String(draft?.infinitasId || '').trim(),
        savedAt: new Date().toISOString()
      }));
    } catch {
      // Ignore storage errors and continue.
    }
  }

  function clearPendingSignupDraft() {
    try {
      window.localStorage.removeItem(SIGNUP_PENDING_CACHE_KEY);
    } catch {
      // Ignore storage errors and continue.
    }
  }

  function validateSignupIdentity(rawDjName, rawInfinitasId) {
    const djName = String(rawDjName || '').trim();
    const infinitasId = normalizeInfinitasIdForSearch(rawInfinitasId || '');
    if (djName.length < 2 || djName.length > 16) {
      return { ok: false, message: 'DJ NAME은 2~16자여야 합니다.' };
    }
    if (!infinitasId) {
      return { ok: false, message: 'INFINITAS ID를 정확히 입력하세요.' };
    }
    return {
      ok: true,
      djName,
      infinitasId
    };
  }

  function validateDjName(rawDjName) {
    const djName = String(rawDjName || '').trim();
    if (djName.length < 2 || djName.length > 16) {
      return { ok: false, message: 'DJ NAME은 2~16자여야 합니다.' };
    }
    return { ok: true, djName };
  }

  function profileSaveErrorMessage(error) {
    const code = String(error?.code || '').trim();
    const message = String(error?.message || error || '').trim();
    if (code === '23505' || /users_infinitas_id_key/i.test(message) || /duplicate key/i.test(message)) {
      return '이미 사용 중인 INFINITAS ID입니다.';
    }
    if (code === '23514' || /users_infinitas_id_format_chk/i.test(message)) {
      return 'INFINITAS ID 형식이 올바르지 않습니다.';
    }
    return message || '계정 저장에 실패했습니다.';
  }

  function renderSignupDialog() {
    const dialog = $('signupDialog');
    if (!dialog) return;
    if (!state.signup.open) {
      if (dialog.open) dialog.close('cancel');
      return;
    }
    const step = Number(state.signup.step || 1);
    const stepTitle = step === 1 ? '1단계: DJ NAME' : step === 2 ? '2단계: INFINITAS ID' : '3단계: Google 연동';
    $('signupStepTitle').textContent = stepTitle;
    $('signupDialogMessage').textContent = state.signup.message || '';
    $('signupDialogMessage').classList.toggle('hidden', !state.signup.message);
    $('signupNameInput').value = state.signup.djName || '';
    $('signupIdInput').value = state.signup.infinitasId || '';
    $('signupIdPreview').textContent = state.signup.infinitasId || 'C-0000-0000-0000';
    $('signupReviewName').textContent = state.signup.djName || '-';
    $('signupReviewId').textContent = state.signup.infinitasId || 'C-0000-0000-0000';
    $('signupGoogleActionText').textContent = state.auth.signedIn ? '가입 완료' : 'Login with Google';
    $('signupGoogleActionBtn')?.classList.toggle('is-linked', state.auth.signedIn);
    $('signupGoogleActionBtn')?.setAttribute('aria-label', state.auth.signedIn ? '가입 완료' : 'Google 로그인');
    $('signupGoogleActionBtn')?.setAttribute('title', state.auth.signedIn ? '가입 완료' : 'Google 로그인');
    $('signupStepPanel1').classList.toggle('hidden', step !== 1);
    $('signupStepPanel2').classList.toggle('hidden', step !== 2);
    $('signupStepPanel3').classList.toggle('hidden', step !== 3);
    $('signupStepDot1').classList.toggle('active', step === 1);
    $('signupStepDot2').classList.toggle('active', step === 2);
    $('signupStepDot3').classList.toggle('active', step === 3);
    $('signupBackBtn').classList.toggle('hidden', step === 1);
    $('signupNextBtn').classList.toggle('hidden', step === 3);
    if (!dialog.open) dialog.showModal();
  }

  function openProfileDialog() {
    if (state.auth.signedIn && !state.auth.profileReady) {
      openSignupDialog({ message: '가입된 계정 정보가 없습니다. 회원가입을 진행하세요.' });
      return;
    }
    const guestMode = !state.auth.signedIn;
    $('accountDialogTitle').textContent = guestMode ? '표시 정보 변경' : '프로필 수정';
    $('accountDialogIntro').textContent = guestMode
      ? '로그인 없이 서열표에 표시할 DJ NAME과 INFINITAS ID를 수정합니다.'
      : '프로필 정보를 수정합니다.';
    $('accountNameInput').value = guestMode ? (state.guest.djName || 'GUEST') : (state.profile?.djName || '');
    $('accountIdInput').value = guestMode
      ? ((state.guest.infinitasId && state.guest.infinitasId !== 'C-0000-0000-0000') ? state.guest.infinitasId : '')
      : (state.profile?.infinitasId || '');
    $('accountIdPreview').textContent = $('accountIdInput').value || 'C-0000-0000-0000';
    $('accountGoogleLinkedInfo').textContent = guestMode
      ? '게스트 모드: 표시 텍스트만 변경됩니다.'
      : (state.auth.user?.email ? `Google 계정: ${state.auth.user.email}` : 'Google 계정 연동 완료');
    $('accountGoogleLinkedInfo').classList.toggle('hidden', false);
    $('accountDialog')?.showModal();
  }

  function formatProfileId() {
    $('accountIdInput').value = formatInfinitasIdDisplay($('accountIdInput').value);
    $('accountIdPreview').textContent = $('accountIdInput').value || 'C-0000-0000-0000';
  }

  function openSignupDialog(options = {}) {
    const pending = readPendingSignupDraft();
    state.signup.open = true;
    state.signup.step = Number(options.step || 1);
    state.signup.djName = String(options.djName ?? pending?.djName ?? state.signup.djName ?? '').trim();
    state.signup.infinitasId = String(options.infinitasId ?? pending?.infinitasId ?? state.signup.infinitasId ?? '').trim();
    state.signup.message = String(options.message || '').trim();
    render();
  }

  function closeSignupDialog(options = {}) {
    if (!options.skipDialogClose) {
      const dialog = $('signupDialog');
      if (dialog?.open) dialog.close(options.reason || 'cancel');
    }
    state.signup.open = false;
    state.signup.message = options.keepMessage ? state.signup.message : '';
    render();
  }

  function updateSignupName(value) {
    state.signup.djName = String(value || '').trimStart().slice(0, 16);
  }

  function formatSignupId() {
    const value = formatInfinitasIdDisplay($('signupIdInput')?.value || '');
    state.signup.infinitasId = value;
    $('signupIdInput').value = value;
    $('signupIdPreview').textContent = value || 'C-0000-0000-0000';
  }

  function nextSignupStep() {
    if (state.signup.step === 1) {
      const validated = validateDjName(state.signup.djName || '');
      if (!validated.ok) return showToast(validated.message);
      state.signup.djName = validated.djName;
      state.signup.step = 2;
      state.signup.message = '';
      render();
      return;
    }
    if (state.signup.step === 2) {
      const validated = validateSignupIdentity(state.signup.djName || '', state.signup.infinitasId || '');
      if (!validated.ok) return showToast(validated.message);
      state.signup.djName = validated.djName;
      state.signup.infinitasId = validated.infinitasId;
      state.signup.step = 3;
      state.signup.message = '';
      render();
    }
  }

  function prevSignupStep() {
    state.signup.step = Math.max(1, Number(state.signup.step || 1) - 1);
    state.signup.message = '';
    render();
  }

  async function completeSignupForCurrentUser(rawDraft, options = {}) {
    const validated = validateSignupIdentity(rawDraft?.djName || '', rawDraft?.infinitasId || '');
    if (!validated.ok) {
      openSignupDialog({
        step: validated.message.includes('INFINITAS') ? 2 : 1,
        djName: rawDraft?.djName || '',
        infinitasId: rawDraft?.infinitasId || '',
        message: validated.message
      });
      return null;
    }
    const nextProfile = emptyProfile(state.auth.user, state.guest.trackerRows);
    nextProfile.djName = validated.djName;
    nextProfile.infinitasId = validated.infinitasId;
    nextProfile.googleEmail = state.auth.user?.email || '';
    try {
      await saveProfileToCloud(state.auth.user, nextProfile, 'profile-save');
    } catch (error) {
      clearPendingSignupDraft();
      openSignupDialog({
        step: 2,
        djName: validated.djName,
        infinitasId: validated.infinitasId,
        message: profileSaveErrorMessage(error)
      });
      return null;
    }
    clearPendingSignupDraft();
    state.profile = nextProfile;
    ensureBingoState(state.profile);
    syncGoalStoreFromBingoDraft();
    state.auth.profileReady = true;
    state.selectedHistoryId = latestHistoryId(state.profile.history);
    state.historySectionOpen = createHistorySectionState();
    await syncSocial();
    closeSignupDialog({ keepMessage: false });
    render();
    if (options.showToast !== false) showToast('회원가입이 완료되었습니다.');
    return nextProfile;
  }

  async function submitSignup() {
    const validated = validateSignupIdentity(state.signup.djName || '', state.signup.infinitasId || '');
    if (!validated.ok) return showToast(validated.message);
    state.signup.djName = validated.djName;
    state.signup.infinitasId = validated.infinitasId;
    if (state.auth.signedIn) {
      await completeSignupForCurrentUser(validated);
      return;
    }
    writePendingSignupDraft(validated);
    try {
      await ensureAuthServerReady(4000);
      await withTimeout(signInWithGoogle(), 8000, 'google_signin_timeout');
    } catch (error) {
      showToast(`Google 로그인 실패: ${describeRemoteError(error, 'Google 로그인 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도하세요.')}`);
    }
  }

  async function submitProfile() {
    const guestMode = !state.auth.signedIn;
    const djName = String($('accountNameInput')?.value || '').trim();
    const formattedId = formatInfinitasIdDisplay($('accountIdInput')?.value || '') || 'C-0000-0000-0000';
    if (djName.length < 2 || djName.length > 16) return showToast('DJ NAME은 2~16자여야 합니다.');
    if (guestMode) {
      state.guest.djName = djName;
      state.guest.infinitasId = formattedId;
      persistGuestProfileCache();
      $('accountDialog')?.close('done');
      render();
      showToast('표시 정보가 변경되었습니다.');
      return;
    }
    if (!state.auth.user) return showToast('먼저 Google 로그인을 완료하세요.');
    const infinitasId = normalizeInfinitasIdForSearch(formattedId);
    if (!infinitasId) return showToast('INFINITAS ID를 정확히 입력하세요.');
    if (!state.profile) state.profile = emptyProfile(state.auth.user, state.guest.trackerRows);
    state.profile.djName = djName;
    state.profile.infinitasId = infinitasId;
    state.profile.googleEmail = state.auth.user.email || '';
    state.auth.profileReady = true;
    await saveUserProfileToCloud(state.auth.user, state.profile);
    $('accountDialog')?.close('done');
    await syncSocial();
    render();
    showToast('프로필 저장이 완료되었습니다.');
  }

  function clearIconEditorSession() {
    if (iconEditor.objectUrl) URL.revokeObjectURL(iconEditor.objectUrl);
    iconEditor = {
      file: null,
      image: null,
      objectUrl: '',
      cropX: 0.5,
      cropY: 0.5,
      zoom: 1,
      drag: null
    };
    const image = $('accountIconEditorImage');
    const empty = $('accountIconEditorEmpty');
    const frame = $('accountIconEditorFrame');
    if (image) {
      image.src = '';
      image.classList.add('hidden');
      image.removeAttribute('style');
    }
    empty?.classList.remove('hidden');
    frame?.classList.remove('is-dragging');
  }

  function getIconPreviewMetrics() {
    if (!iconEditor.image) return null;
    const frame = $('accountIconEditorFrame');
    if (!frame) return null;
    const frameWidth = Math.max(1, frame.clientWidth || 0);
    const frameHeight = Math.max(1, frame.clientHeight || 0);
    const imageWidth = Math.max(1, iconEditor.image.naturalWidth || 0);
    const imageHeight = Math.max(1, iconEditor.image.naturalHeight || 0);
    const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight) * Math.max(1, Number(iconEditor.zoom || 1));
    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;
    const overflowX = Math.max(0, drawWidth - frameWidth);
    const overflowY = Math.max(0, drawHeight - frameHeight);
    return { frameWidth, frameHeight, drawWidth, drawHeight, overflowX, overflowY };
  }

  function renderIconEditorPreview() {
    const image = $('accountIconEditorImage');
    const empty = $('accountIconEditorEmpty');
    if (!image || !iconEditor.image) return;
    const metrics = getIconPreviewMetrics();
    if (!metrics) {
      window.requestAnimationFrame(renderIconEditorPreview);
      return;
    }
    const left = metrics.overflowX > 0
      ? -metrics.overflowX * iconEditor.cropX
      : (metrics.frameWidth - metrics.drawWidth) / 2;
    const top = metrics.overflowY > 0
      ? -metrics.overflowY * iconEditor.cropY
      : (metrics.frameHeight - metrics.drawHeight) / 2;
    image.style.width = `${metrics.drawWidth}px`;
    image.style.height = `${metrics.drawHeight}px`;
    image.style.left = `${left}px`;
    image.style.top = `${top}px`;
    image.classList.remove('hidden');
    empty?.classList.add('hidden');
  }

  function openIconEditor() {
    if (!isAuthorized()) return showToast('아이콘 변경은 로그인 후 회원가입까지 완료해야 사용할 수 있습니다.');
    $('accountIconMenu')?.classList.add('hidden');
    $('accountIconFileInput')?.click();
  }

  async function openIconEditorFromFile(file) {
    if (!file) return;
    const error = await validateIconFile(file);
    if (error) return showToast(error);
    try {
      const image = await loadImageElementFromFile(file);
      clearIconEditorSession();
      iconEditor.file = file;
      iconEditor.image = image;
      iconEditor.objectUrl = URL.createObjectURL(file);
      iconEditor.cropX = 0.5;
      iconEditor.cropY = 0.5;
      iconEditor.zoom = 1;
      const imageEl = $('accountIconEditorImage');
      if (imageEl) imageEl.src = iconEditor.objectUrl;
      $('accountIconEditorDialog')?.showModal();
      window.requestAnimationFrame(renderIconEditorPreview);
    } catch (loadError) {
      clearIconEditorSession();
      showToast(loadError.message || '아이콘 이미지를 불러오지 못했습니다.');
    }
  }

  function closeIconEditor(options = {}) {
    if (!options.skipDialogClose) {
      const dialog = $('accountIconEditorDialog');
      if (dialog?.open) dialog.close(options.reason || 'cancel');
    }
    clearIconEditorSession();
  }

  function startIconDrag(event) {
    if (!iconEditor.image) return;
    const frame = $('accountIconEditorFrame');
    const metrics = getIconPreviewMetrics();
    if (!frame || !metrics) return;
    event.preventDefault();
    iconEditor.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      cropX: iconEditor.cropX,
      cropY: iconEditor.cropY
    };
    frame.classList.add('is-dragging');
    frame.setPointerCapture?.(event.pointerId);
  }

  function moveIconDrag(event) {
    if (!iconEditor.drag || iconEditor.drag.pointerId !== event.pointerId) return;
    const metrics = getIconPreviewMetrics();
    if (!metrics) return;
    if (metrics.overflowX > 0) {
      const startLeft = -metrics.overflowX * iconEditor.drag.cropX;
      const nextLeft = Math.min(0, Math.max(-metrics.overflowX, startLeft + (event.clientX - iconEditor.drag.startX)));
      iconEditor.cropX = Math.min(1, Math.max(0, -nextLeft / metrics.overflowX));
    } else {
      iconEditor.cropX = 0.5;
    }
    if (metrics.overflowY > 0) {
      const startTop = -metrics.overflowY * iconEditor.drag.cropY;
      const nextTop = Math.min(0, Math.max(-metrics.overflowY, startTop + (event.clientY - iconEditor.drag.startY)));
      iconEditor.cropY = Math.min(1, Math.max(0, -nextTop / metrics.overflowY));
    } else {
      iconEditor.cropY = 0.5;
    }
    renderIconEditorPreview();
  }

  function endIconDrag(event) {
    if (!iconEditor.drag) return;
    if (event.pointerId != null && iconEditor.drag.pointerId !== event.pointerId) return;
    const frame = $('accountIconEditorFrame');
    frame?.classList.remove('is-dragging');
    frame?.releasePointerCapture?.(iconEditor.drag.pointerId);
    iconEditor.drag = null;
  }

  function zoomIconEditor(event) {
    if (!iconEditor.image) return;
    event.preventDefault();
    const nextZoom = Math.min(4, Math.max(1, Number(iconEditor.zoom || 1) + (event.deltaY < 0 ? 0.12 : -0.12)));
    if (Math.abs(nextZoom - Number(iconEditor.zoom || 1)) < 0.0001) return;
    iconEditor.zoom = nextZoom;
    renderIconEditorPreview();
  }

  async function saveIconEditor() {
    if (!state.auth.user || !iconEditor.file) return;
    const file = iconEditor.file;
    const crop = { x: iconEditor.cropX, y: iconEditor.cropY, zoom: iconEditor.zoom };
    closeIconEditor();
    await withBusyOverlay(
      '아이콘 저장 중...',
      '프로필 아이콘을 적용하고 있습니다.',
      async () => {
        const icon = await normalizeIconImage(file, crop);
        if (!state.profile) state.profile = emptyProfile(state.auth.user, state.guest.trackerRows);
        state.profile.iconDataUrl = icon.dataUrl;
        await saveUserProfileToCloud(state.auth.user, state.profile);
        await syncSocial();
        render();
        showToast('아이콘을 저장했습니다.');
      }
    );
  }

  async function signIn() {
    clearPendingSignupDraft();
    closeSignupDialog({ keepMessage: false });
    try {
      await ensureAuthServerReady(4000);
      await withTimeout(signInWithGoogle(), 8000, 'google_signin_timeout');
    } catch (error) {
      showToast(`Google 로그인 실패: ${describeRemoteError(error, 'Google 로그인 서버 연결이 지연되고 있습니다. 잠시 후 다시 시도하세요.')}`);
    }
  }

  async function signOut() {
    clearPendingSignupDraft();
    await authSignOut();
    state.auth = { user: null, session: null, signedIn: false, loading: false, profileReady: false, isAdmin: false };
    state.snapshotPublish = { busy: false, needsPublish: false, message: '', workflowUrl: '' };
    state.profile = null;
    state.selectedHistoryId = '';
    state.social = { overviewRows: [], feedItems: [], followerRows: [] };
    state.bingoPreview = null;
    state.signup = { open: false, step: 1, djName: '', infinitasId: '', message: '' };
    closeSocialHistoryPopup();
    closeSignupDialog({ skipDialogClose: true });
    state.activePanel = 'rank';
    render();
  }

  async function withdrawAccount() {
    if (!isAuthorized()) return;
    const confirmed = window.confirm('웹 계정을 탈퇴하면 저장된 프로필, 히스토리, 빙고, 소셜 데이터가 삭제됩니다. 계속할까요?');
    if (!confirmed) return;
    await withBusyOverlay(
      '탈퇴 처리 중...',
      '계정 데이터를 정리하고 로그아웃합니다.',
      async () => {
        await purgeProfile();
        await signOut();
      }
    );
  }

  async function refreshProfile(options = {}) {
    const showBusy = options.showBusy !== false;
    if (!state.auth.user) return null;
    if (profileRefreshPromise) return profileRefreshPromise;
    profileRefreshPromise = (async () => {
      const run = async () => {
        const pendingSignup = readPendingSignupDraft();
        let loaded = null;
        try {
          loaded = await withTimeout(loadProfileFromCloud(state.auth.user), Number(options.timeoutMs || 10000), 'profile_load_timeout');
        } catch (error) {
          if (error?.code === 'profile_load_timeout') {
            const timeoutError = new Error('profile_load_timeout');
            timeoutError.code = 'profile_load_timeout';
            throw timeoutError;
          }
          throw error;
        }
        if (!loaded) {
          state.profile = null;
          state.auth.profileReady = false;
          state.selectedHistoryId = '';
          state.historySectionOpen = createHistorySectionState();
          state.social = { overviewRows: [], feedItems: [], followerRows: [] };
          closeSocialHistoryPopup();
          if (pendingSignup) {
            await completeSignupForCurrentUser(pendingSignup, { showToast: false });
            return state.profile;
          }
          openSignupDialog({ message: '가입된 계정 정보가 없습니다. 회원가입을 진행하세요.' });
        } else {
          state.profile = loaded;
          ensureBingoState(state.profile);
          restoreBingoDraftCache(state.profile);
          syncGoalStoreFromBingoDraft();
          state.auth.profileReady = true;
          state.selectedHistoryId = latestHistoryId(state.profile.history);
          state.historySectionOpen = createHistorySectionState();
          await syncSocial();
          if (pendingSignup) {
            clearPendingSignupDraft();
            closeSignupDialog({ keepMessage: false });
            const useExisting = window.confirm('이미 계정이 있습니다. 기존 계정으로 로그인하시겠습니까?');
            if (!useExisting) {
              await authSignOut();
              return null;
            }
            showToast('기존 계정으로 로그인했습니다.');
          }
        }
        render();
        return state.profile;
      };
      if (showBusy) {
        return withBusyOverlay(
          '데이터 불러오는 중...',
          '프로필, 히스토리, 목표, 소셜 데이터를 동기화하고 있습니다.',
          run
        );
      }
      return run();
    })();
    try {
      return await profileRefreshPromise;
    } finally {
      profileRefreshPromise = null;
    }
  }

  async function initAuth() {
    let session = null;
    try {
      session = await withTimeout(getInitialSession(), 6000, 'auth_bootstrap_timeout');
    } catch (error) {
      console.error('Initial auth bootstrap failed', error);
      showToast(describeRemoteError(error, '로그인 서버 연결이 지연되고 있어 게스트 모드로 시작합니다.'));
    }
    state.auth.user = session?.user || null;
    state.auth.session = session || null;
    state.auth.signedIn = !!session?.user;
    state.auth.isAdmin = isAdminAccount(session?.user || null);
    state.auth.loading = false;
    if (session?.user) {
      try {
        await refreshProfile({ timeoutMs: 10000 });
      } catch (error) {
        console.error('Initial profile refresh failed', error);
        state.auth.user = null;
        state.auth.session = null;
        state.auth.signedIn = false;
        state.auth.profileReady = false;
        state.auth.isAdmin = false;
        state.snapshotPublish = { busy: false, needsPublish: false, message: '', workflowUrl: '' };
        state.profile = null;
        state.selectedHistoryId = '';
        state.social = { overviewRows: [], feedItems: [], followerRows: [] };
        state.bingoPreview = null;
        closeSocialHistoryPopup();
        showToast(describeRemoteError(error, 'DB 동기화에 실패해 게스트 모드로 전환했습니다.'));
      }
    }
    render();
    onAuthStateChange((event, nextSession) => {
      const prevUserId = String(state.auth.user?.id || '');
      const prevToken = String(state.auth.session?.access_token || '');
      const nextUserId = String(nextSession?.user?.id || '');
      const nextToken = String(nextSession?.access_token || '');
      state.auth.user = nextSession?.user || null;
      state.auth.session = nextSession || null;
      state.auth.signedIn = !!nextSession?.user;
      state.auth.isAdmin = isAdminAccount(nextSession?.user || null);
      if (!nextSession?.user) {
        clearPendingSignupDraft();
        state.auth.profileReady = false;
        state.auth.isAdmin = false;
        state.snapshotPublish = { busy: false, needsPublish: false, message: '', workflowUrl: '' };
        state.profile = null;
        state.selectedHistoryId = '';
        state.social = { overviewRows: [], feedItems: [], followerRows: [] };
        state.bingoPreview = null;
        state.signup = { open: false, step: 1, djName: '', infinitasId: '', message: '' };
        closeSocialHistoryPopup();
        closeSignupDialog({ skipDialogClose: true });
        state.activePanel = 'rank';
        render();
        return;
      }
      if (event === 'TOKEN_REFRESHED') return;
      if (event === 'INITIAL_SESSION' && !nextSession?.user) return;
      const sameUser = prevUserId && prevUserId === nextUserId;
      const sameToken = prevToken && prevToken === nextToken;
      if (event === 'SIGNED_IN' && sameUser && sameToken && state.auth.profileReady) return;
      if (event === 'INITIAL_SESSION' && sameUser && state.auth.profileReady) return;
      queueMicrotask(() => {
        refreshProfile({ showBusy: false }).catch((error) => {
          console.error('Auth-driven profile refresh failed', error);
          showToast(`DB 동기화 실패: ${describeRemoteError(error, '서버 응답이 지연되고 있습니다. 잠시 후 다시 시도하세요.')}`);
        });
      });
    });
  }

  return {
    loadGuestProfileCache,
    persistGuestProfileCache,
    readPendingSignupDraft,
    writePendingSignupDraft,
    clearPendingSignupDraft,
    renderSignupDialog,
    openProfileDialog,
    formatProfileId,
    openSignupDialog,
    closeSignupDialog,
    updateSignupName,
    formatSignupId,
    nextSignupStep,
    prevSignupStep,
    completeSignupForCurrentUser,
    submitSignup,
    submitProfile,
    openIconEditor,
    openIconEditorFromFile,
    closeIconEditor,
    startIconDrag,
    moveIconDrag,
    endIconDrag,
    zoomIconEditor,
    saveIconEditor,
    signIn,
    signOut,
    withdrawAccount,
    refreshProfile,
    initAuth
  };
}
