import { $, esc, fmt } from './utils.js';

function noticeDateText(iso) {
  return iso ? fmt(iso) : '';
}

function noticeDateTag(iso) {
  return String(iso || '').trim().slice(0, 10) || '날짜 미정';
}

function noticeHeadline(notice) {
  const summary = String(notice?.summary || notice?.title || '업데이트 내역을 확인하세요.').trim();
  return `[${noticeDateTag(notice?.publishedAt)}] 업데이트 : ${summary}`;
}

export function renderNoticeBanner(ctx) {
  const wrap = $('appNoticeBar');
  if (!wrap) return;
  const latestNotice = Array.isArray(ctx.state.appMeta?.notices) ? ctx.state.appMeta.notices[0] : null;
  if (!latestNotice) {
    wrap.classList.add('hidden');
    return;
  }
  $('appNoticeTitle').textContent = noticeHeadline(latestNotice);
  $('appNoticeSummary').textContent = '클릭하면 공지 히스토리를 확인할 수 있습니다.';
  wrap.classList.remove('hidden');
}

export function renderNoticeHistory(ctx) {
  const body = $('noticeHistoryBody');
  const headActions = $('noticeHistoryHeadActions');
  if (!body) return;
  const notices = Array.isArray(ctx.state.appMeta?.notices) ? ctx.state.appMeta.notices : [];
  const isAdmin = !!ctx.state.auth?.isAdmin;

  if (headActions) {
    headActions.innerHTML = isAdmin
      ? '<button type="button" class="notice-history-admin-btn primary-btn" data-notice-add="1">공지사항 추가</button>'
      : '';
  }

  body.innerHTML = notices.length
    ? notices.map((notice) => {
      const itemsHtml = Array.isArray(notice.items) && notice.items.length
        ? `<ul class="notice-history-points">${notice.items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`
        : '';
      const editButton = isAdmin
        ? `<button type="button" class="notice-history-admin-btn" data-notice-edit="${esc(String(notice.id || ''))}">수정</button>`
        : '';
      return `<article class="notice-history-item">
        <div class="notice-history-item-top">
          <div class="notice-history-item-head">
            <div class="notice-history-item-date">${esc(noticeDateTag(notice.publishedAt))}</div>
            <div class="notice-history-item-time">${esc(noticeDateText(notice.publishedAt))}</div>
          </div>
          ${editButton}
        </div>
        <div class="notice-history-item-title">${esc(notice.title || '업데이트')}</div>
        ${notice.summary ? `<div class="notice-history-item-summary">${esc(notice.summary)}</div>` : ''}
        ${itemsHtml}
      </article>`;
    }).join('')
    : '<div class="notice-history-empty">등록된 공지사항이 없습니다.</div>';
}

export function renderSettings(ctx) {
  const s = ctx.activeSocialSettings();
  $('settingDiscoverability').checked = s.discoverability !== 'hidden';
  $('settingDiscoverabilityDjName').checked = s.discoverByDjName !== false;
  $('settingFollowPolicyAuto').checked = s.followPolicy === 'auto';
  $('settingFollowPolicyManual').checked = s.followPolicy === 'manual';
  $('settingFollowPolicyDisabled').checked = s.followPolicy === 'disabled';
  $('settingShareAllData').checked = s.shareDataScope.includes('all');
  $('settingShareGraphs').checked = !s.shareDataScope.includes('all') && s.shareDataScope.includes('graphs') && !s.shareDataScope.includes('none');
  $('settingShareNone').checked = s.shareDataScope.includes('none');
}
