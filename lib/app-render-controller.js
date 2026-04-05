export function createRenderController({
  state,
  isAuthorized,
  currentTrackerLabel,
  currentSocialSettings,
  progressMap,
  iconSrc,
  rebuildViews,
  renderApp,
  renderDeferredPanel,
  renderSignupDialog,
  syncSocial,
  showToast,
  $
}) {
  function createRenderContext() {
    return {
      state,
      isAuthorized,
      currentTrackerLabel,
      activeSocialSettings: currentSocialSettings,
      progressMap: () => progressMap(state.tableViews),
      iconSrc
    };
  }

  function render() {
    rebuildViews();
    renderApp(createRenderContext());
    renderSignupDialog();
    setActivePanel(state.activePanel || 'rank', { skipRefresh: true });
  }

  function setActivePanel(panel, options = {}) {
    let next = panel || 'rank';
    const prev = state.activePanel || 'rank';
    if (next === 'settings') {
      if (!isAuthorized()) {
        showToast('설정은 로그인 후 사용할 수 있습니다.');
        next = 'rank';
      } else {
        $('settingsDialog')?.showModal();
        return;
      }
    }
    if (next !== 'rank' && !isAuthorized()) {
      showToast('이 탭은 Google 로그인 후 프로필 등록이 끝나야 열립니다.');
      next = 'rank';
    }
    state.activePanel = next;
    document.querySelectorAll('.main-tab, .dock-tab').forEach((el) => el.classList.toggle('active', el.dataset.panel === next));
    document.querySelectorAll('.tab-panel').forEach((el) => el.classList.toggle('active', el.id === `panel-${next}`));
    if (!options.skipPanelRender) {
      renderDeferredPanel(createRenderContext(), next);
    }
    if (!options.skipRefresh && next === 'social' && isAuthorized() && prev !== 'social') {
      queueMicrotask(() => {
        syncSocial().catch((error) => {
          console.error('Social refresh on panel switch failed', error);
        });
      });
    }
  }

  return {
    createRenderContext,
    render,
    setActivePanel
  };
}
