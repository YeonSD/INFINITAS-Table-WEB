import { DEFAULT_ICON_SRC } from './constants.js';
import { computeRadarProfileFromRows } from './data.js';
import { esc, fmt } from './utils.js';
import { renderSocialHistoryPopup } from './history-ui.js';

function feedTypeClass(type) {
  if (type === 'follow_request_received') return 'feed-request-in';
  if (type === 'follow_request_accepted') return 'feed-request-ok';
  if (type === 'follower_unfollowed') return 'feed-unfollow';
  if (type === 'follow_history_updated') return 'feed-history';
  if (type === 'goal_transfer_updated') return 'feed-goal-updated';
  if (type === 'goal_transfer_accepted') return 'feed-goal-approved';
  if (type === 'goal_transfer_received') return 'feed-goal-received';
  if (type === 'bingo_transfer_received') return 'feed-goal-received';
  if (type === 'bingo_transfer_accepted') return 'feed-goal-approved';
  if (type === 'bingo_completed') return 'feed-history';
  return '';
}

function feedEventToItem(row) {
  const type = String(row?.event_type || '');
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const actorName = String(row?.actor_dj_name || '이름 없음');
  const actorId = String(row?.actor_infinitas_id || '');
  const actorLabel = actorId ? `${actorName} (${actorId})` : actorName;
  const common = {
    id: String(row?.id || ''),
    type,
    peer_user_id: row?.actor_user_id || '',
    payload,
    created_at: row?.created_at || '',
    icon: row?.actor_icon_data_url || '',
    label: actorLabel
  };
  if (type === 'follow_request_received') return { ...common, title: '팔로우 요청', body: `${actorLabel}님이 팔로우를 요청했습니다.` };
  if (type === 'follow_request_accepted') return { ...common, title: '팔로우 수락', body: `${actorLabel}님이 팔로우를 수락했습니다.` };
  if (type === 'follower_unfollowed') return { ...common, title: '팔로우 취소', body: `${actorLabel}님이 팔로우를 취소했습니다.` };
  if (type === 'follow_history_updated') {
    return {
      ...common,
      title: '팔로우 히스토리 갱신',
      body: String(payload.summary || `${actorLabel}님이 히스토리를 갱신했습니다.`),
      historyId: String(payload.history_id || '')
    };
  }
  if (type === 'goal_transfer_received' || type === 'goal_transfer_accepted' || type === 'goal_transfer_updated') return null;
  if (type === 'bingo_transfer_received') return { ...common, title: '빙고 공유', body: `${actorLabel}님이 빙고를 공유했습니다.` };
  if (type === 'bingo_transfer_accepted') return { ...common, title: '빙고 수락', body: `${actorLabel}님이 빙고를 수락했습니다.` };
  if (type === 'bingo_completed') {
    return {
      ...common,
      title: '빙고 클리어',
      body: `${actorLabel}님이 공유된 빙고를 클리어했습니다${payload?.bingo_name ? `: ${payload.bingo_name}` : '.'}`
    };
  }
  return null;
}

function followUserRowHtml(peer, { isMutual = false, allowFollowBack = false } = {}) {
  const peerId = String(peer?.peer_user_id || '');
  const djName = String(peer?.dj_name || '이름 없음');
  const infinitasId = String(peer?.infinitas_id || '');
  const icon = String(peer?.icon_data_url || '').trim();
  const mutualBadge = isMutual ? '<span class="social-mutual-badge">맞팔</span>' : '';
  const avatarHtml = icon
    ? `<img src="${esc(icon)}" alt="${esc(djName)}" />`
    : '<span class="social-avatar-person">?</span>';
  const followBackButton = allowFollowBack
    ? `<button type="button" class="social-follow-back" data-follow-target="${esc(peerId)}" data-follow-label="${esc(djName)}">+</button>`
    : '';
  return `<div class="social-follow-user social-follow-user-following${isMutual ? ' is-mutual' : ''}">
    ${mutualBadge}
    <button type="button" class="social-avatar social-avatar-plain" data-peer-avatar="${esc(peerId)}" data-peer-mutual="${isMutual ? 'true' : 'false'}" data-peer-dj-name="${esc(djName)}" data-peer-infinitas-id="${esc(infinitasId)}">${avatarHtml}</button>
    <div>
      <div class="social-follow-name">${esc(djName)}</div>
      <div class="social-item-sub">${esc(infinitasId)}</div>
    </div>
    ${followBackButton}
  </div>`;
}

export function songSocialSectionHtml(rows) {
  if (!rows.length) return '';
  const list = [...rows].sort((a, b) => {
    const scoreDiff = Number(b?.ex_score || b?.exScore || 0) - Number(a?.ex_score || a?.exScore || 0);
    if (scoreDiff !== 0) return scoreDiff;
    const rateDiff = Number(b?.rate || 0) - Number(a?.rate || 0);
    if (rateDiff !== 0) return rateDiff;
    return String(a?.dj_name || '').localeCompare(String(b?.dj_name || ''), 'ko');
  }).map((row) => {
    const lamp = String(row.lamp || 'NP');
    const rank = String(row.rank || row.score_tier || '-');
    const score = Number(row.ex_score || row.exScore || 0);
    const rate = Number(row.rate || 0);
    return `<div class="song-follow-line"><strong>${esc(row.dj_name || '이름 없음')}</strong> | 램프: ${esc(lamp)} | 랭크: ${esc(rank)} | 점수: ${score} | 달성률: ${rate.toFixed(2)}%</div>`;
  }).join('');
  return `<hr /><div><strong>팔로우 현황</strong>${list}</div>`;
}

export function renderSocialPanel(ctx, socialHistoryRenderer = renderSocialHistoryPopup) {
  const myCard = document.getElementById('socialMyCard');
  const feed = document.getElementById('socialFeed');
  const followList = document.getElementById('socialFollowList');
  const followListTitle = document.getElementById('socialFollowListTitle');
  const followersPopup = document.getElementById('socialFollowersPopup');
  if (!ctx.isAuthorized()) {
    const mobileTabsHost = document.getElementById('socialMobileTabsHost');
    if (mobileTabsHost) mobileTabsHost.innerHTML = '';
    myCard.innerHTML = '<article class="social-card"><div class="history-empty">Google 로그인 후 소셜 기능을 사용할 수 있습니다.</div></article>';
    feed.innerHTML = '';
    followList.innerHTML = '';
    followListTitle.textContent = '팔로우 목록';
    if (followersPopup) {
      followersPopup.innerHTML = '';
      followersPopup.classList.add('hidden');
    }
    socialHistoryRenderer(ctx);
    return;
  }

  const social = ctx.state.social;
  const rows = social.overviewRows || [];
  const followsAll = rows.filter((row) => row.relation_type === 'follow');
  const followingRows = followsAll.filter((row) => String(row.direction || 'following') === 'following');
  const followerRows = followsAll.filter((row) => String(row.direction || 'following') === 'follower');
  const followingPeerSet = new Set(followingRows.map((row) => String(row.peer_user_id || '')));
  const followerPeerSet = new Set(followerRows.map((row) => String(row.peer_user_id || '')));
  const followersPopupState = ctx.state.socialFollowersPopup || { open: false, left: 24, top: 120 };
  const mobileSection = ['feed', 'card', 'follows'].includes(ctx.state.socialMobileSection) ? ctx.state.socialMobileSection : 'feed';
  const radarProfile = computeRadarProfileFromRows(ctx.state.profile.trackerRows || [], ctx.state.rankTables, ctx.state.songRadarCatalog);
  const socialSettings = ctx.activeSocialSettings();
  const banner = socialSettings.bannerDataUrl || ctx.iconSrc() || DEFAULT_ICON_SRC;

  myCard.innerHTML = `<article class="social-me-card">
    <div class="social-me-banner">
      <img class="social-me-banner-image" src="${esc(banner)}" alt="" />
      <button id="btnSocialBannerSetting" type="button" class="social-me-banner-setting" title="배너 변경">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.2l-2.39.96c-.5-.38-1.05-.69-1.66-.92l-.39-2.89c-.03-.22-.22-.38-.46-.38h-4c-.24 0-.43.17-.46.38l-.39 2.89c-.61.23-1.17.53-1.67.92l-2.39-.96c-.21-.08-.46 0-.57.2L3.1 8.87c-.11.2-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.11.2.36.28.57.2l2.39-.96c.5.38 1.05.69 1.67.92l.39 2.89c.03.22.22.38.46.38h4c.24 0 .43-.17.46-.38l.39-2.89c.61-.23 1.17-.53 1.67-.92l2.39.96c.21.08.46 0 .57-.2l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" fill="currentColor"/></svg>
      </button>
    </div>
    <div class="social-me-avatar-wrap"><img class="social-me-avatar" src="${esc(ctx.iconSrc() || DEFAULT_ICON_SRC)}" alt="프로필 아이콘" /></div>
    <div class="social-me-body">
      <div class="social-me-name">${esc(ctx.state.profile.djName)}</div>
      <div class="social-me-id">${esc(ctx.state.profile.infinitasId)}</div>
      <div class="social-me-stats">
        <div class="social-me-stat"><div class="social-me-stat-value">${Number(radarProfile.total || 0).toFixed(2)}</div><div class="social-me-stat-label">레이더</div></div>
        <div class="social-me-stat"><div class="social-me-stat-value">${followingRows.length}</div><div class="social-me-stat-label">팔로잉</div></div>
        <button type="button" class="social-me-stat social-me-stat-btn${followersPopupState.open ? ' active' : ''}" data-open-followers="1"><div class="social-me-stat-value">${followerRows.length}</div><div class="social-me-stat-label">팔로워</div></button>
      </div>
      <button id="btnSocialOpenFollowAdd" type="button" class="social-follow-add-btn" title="팔로우 추가"><span class="social-follow-add-icon">+</span><span class="social-follow-add-text">팔로우 추가</span></button>
    </div>
  </article>`;

  const mobileTabs = `
    <div class="social-mobile-tabs" role="tablist" aria-label="소셜 모바일 보기">
      <button type="button" class="${mobileSection === 'feed' ? 'active' : ''}" data-social-mobile-section="feed">피드</button>
      <button type="button" class="${mobileSection === 'card' ? 'active' : ''}" data-social-mobile-section="card">내 카드</button>
      <button type="button" class="${mobileSection === 'follows' ? 'active' : ''}" data-social-mobile-section="follows">팔로우</button>
    </div>`;
  const layout = document.querySelector('#panel-social .social-layout');
  if (layout) {
    layout.classList.remove('social-mobile-feed', 'social-mobile-card', 'social-mobile-follows');
    layout.classList.add(`social-mobile-${mobileSection}`);
  }
  const mobileTabsHost = document.getElementById('socialMobileTabsHost');
  if (mobileTabsHost) mobileTabsHost.innerHTML = mobileTabs;

  const feedItems = (social.feedItems || []).map(feedEventToItem).filter(Boolean);
  feed.innerHTML = feedItems.length
    ? feedItems.slice(0, 60).map((item, index) => {
      const historyButton = item.type === 'follow_history_updated' && item.historyId
        ? `<div class="social-feed-actions social-feed-actions-history"><button type="button" class="social-feed-action-btn social-feed-detail-btn" data-feed-history-detail="1" data-feed-id="${esc(item.id)}" data-peer-user-id="${esc(item.peer_user_id || '')}" data-history-id="${esc(item.historyId)}">상세</button></div>`
        : '';
      const dismissButton = item.type === 'follow_request_received' ? '' : `<button type="button" class="social-feed-close" data-feed-dismiss="${esc(item.id)}" title="닫기">×</button>`;
      const avatarHtml = item.icon ? `<img src="${esc(item.icon)}" alt="${esc(item.title)}" />` : '<span class="social-avatar-person">?</span>';
      const followActionHtml = item.type === 'follow_request_received'
        ? `<button type="button" class="social-feed-action-btn accept" data-feed-accept="${esc(item.payload.request_id || '')}">수락</button><button type="button" class="social-feed-action-btn reject" data-feed-reject="${esc(item.payload.request_id || '')}">거절</button>`
        : '';
      const bingoActionHtml = item.type === 'bingo_transfer_received'
        ? `<button type="button" class="social-feed-action-btn" data-bingo-preview="${esc(item.id)}">보기</button><button type="button" class="social-feed-action-btn accept" data-bingo-accept="${esc(item.payload.transfer_id || '')}">수락</button><button type="button" class="social-feed-action-btn reject" data-bingo-reject="${esc(item.payload.transfer_id || '')}">거절</button>`
        : '';
      return `<article class="social-feed-post ${feedTypeClass(item.type)}" style="--feed-order:${index}" data-feed-id="${esc(item.id)}">
        ${dismissButton}
        <div class="social-feed-dot"></div>
        <div class="social-feed-avatar">${avatarHtml}</div>
        <div class="social-feed-head">${esc(item.title)}</div>
        <div class="social-feed-meta">${esc(fmt(item.created_at || ''))}</div>
        <div class="social-feed-body-row"><div class="social-feed-body">${esc(item.body)}</div>${historyButton}</div>
        <div class="social-feed-actions">${followActionHtml}${bingoActionHtml}</div>
      </article>`;
    }).join('')
    : '<div class="history-empty">표시할 피드가 없습니다.</div>';

  followListTitle.textContent = `팔로우 목록 (${followingRows.length})`;
  followList.innerHTML = followingRows.length
    ? followingRows.map((peer) => followUserRowHtml(peer, {
      isMutual: followerPeerSet.has(String(peer.peer_user_id || ''))
    })).join('')
    : '<div class="history-empty">팔로우한 유저가 없습니다.</div>';

  if (followersPopup) {
    if (!followersPopupState.open) {
      followersPopup.innerHTML = '';
      followersPopup.classList.add('hidden');
    } else {
      followersPopup.style.left = `${Number(followersPopupState.left || 24)}px`;
      followersPopup.style.top = `${Number(followersPopupState.top || 120)}px`;
      followersPopup.innerHTML = `
        <div class="social-followers-popup-header">
          <div class="social-followers-popup-title">팔로워 목록 (${followerRows.length})</div>
          <button type="button" class="social-followers-popup-close" data-close-followers-popup="1">닫기</button>
        </div>
        <div class="social-followers-popup-body">
          ${followerRows.length
            ? followerRows.map((peer) => followUserRowHtml(peer, {
              isMutual: followingPeerSet.has(String(peer.peer_user_id || '')),
              allowFollowBack: !followingPeerSet.has(String(peer.peer_user_id || ''))
            })).join('')
            : '<div class="history-empty">나를 팔로우하는 유저가 없습니다.</div>'}
        </div>`;
      followersPopup.classList.remove('hidden');
    }
  }

  socialHistoryRenderer(ctx);
}
