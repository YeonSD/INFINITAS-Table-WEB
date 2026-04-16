import { ensureMobileRankScaleResize, rankTablesHtml, scheduleMobileRankScale } from './rank-table-ui.js';
import { $, esc } from './utils.js';

export function renderPeerRankViewer(ctx) {
  const viewer = ctx.state.peerRankViewer || {};
  const dialog = $('peerRankDialog');
  const body = $('peerRankBody');
  if (!dialog || !body) return;
  if (!viewer.open) {
    if (dialog.open) dialog.close('dismiss');
    body.innerHTML = '';
    return;
  }

  ensureMobileRankScaleResize();
  const tableViews = viewer.tableViews || {};
  const tableKeys = ['SP10H', 'SP11H', 'SP12H'].filter((key) => tableViews[key]);
  const activeTable = tableViews[viewer.activeTable] ? viewer.activeTable : (tableKeys[0] || 'SP11H');
  const view = tableViews[activeTable];
  const viewMode = viewer.viewMode === 'wide' ? 'wide' : 'normal';
  const sortMode = viewer.sortMode === 'score' ? 'score' : 'lamp';
  const searchQuery = String(viewer.searchQuery || '');
  const searchFocused = typeof document !== 'undefined' && document.activeElement?.id === 'peerRankSearch';
  const searchSelection = searchFocused ? document.activeElement.selectionStart : null;
  const tableTabs = tableKeys.map((key) => `<button type="button" class="small-btn ${key === activeTable ? 'active' : ''}" data-peer-rank-table="${esc(key)}">${esc((tableViews[key]?.title || key).replace(/^IIDX INFINITAS\s+/i, '').replace(/\s+Gauge Rank$/i, ''))}</button>`).join('');
  body.innerHTML = `
    <div class="peer-rank-shell">
      <div class="peer-rank-head">
        <div>
          <div class="peer-rank-title">${esc(viewer.peerLabel || '상대 서열표')}</div>
          <div class="peer-rank-sub">${esc(viewer.peerInfinitasId || '')}</div>
        </div>
      </div>
      <div class="peer-rank-toolbar">
        <div class="peer-rank-tabs">${tableTabs}</div>
        <div class="peer-rank-tabs">
          <button type="button" class="small-btn ${viewMode === 'normal' ? 'active' : ''}" data-peer-rank-view="normal">일반</button>
          <button type="button" class="small-btn ${viewMode === 'wide' ? 'active' : ''}" data-peer-rank-view="wide">WIDE</button>
        </div>
        <div class="peer-rank-tabs">
          <button type="button" class="small-btn ${sortMode === 'lamp' ? 'active' : ''}" data-peer-rank-sort="lamp">램프순</button>
          <button type="button" class="small-btn ${sortMode === 'score' ? 'active' : ''}" data-peer-rank-sort="score">점수순</button>
        </div>
        <input id="peerRankSearch" value="${esc(searchQuery)}" placeholder="곡 제목 검색" />
      </div>
      <div class="peer-rank-viewport">
        <div id="peerRankExportArea" class="peer-rank-export-area" data-view-mode="${esc(viewMode)}">
          <div class="rank-title-wrap">
            <h2>${esc(view?.title || activeTable)}</h2>
            <div class="title-watermark">${esc(activeTable)}</div>
          </div>
          <div class="rank-table-container">${view ? rankTablesHtml({ view, activeTable, viewMode, sortMode, searchQuery }) : '<div class="history-empty">서열표 데이터가 없습니다.</div>'}</div>
        </div>
      </div>
    </div>`;
  scheduleMobileRankScale(viewMode, 'peerRankExportArea');
  if (searchFocused) {
    requestAnimationFrame(() => {
      const input = $('peerRankSearch');
      input?.focus();
      if (input && searchSelection != null) input.setSelectionRange(searchSelection, searchSelection);
    });
  }
  if (!dialog.open) dialog.showModal();
}
