export const DEFAULT_ICON_SRC = './assets/icon/infinitas.png';
export const MEDAL_SRC = {
  SP10: { ALL: './assets/image/SP10ALL.png', HARD: './assets/image/SP10HARD.png', EX: './assets/image/SP10EX.png', F: './assets/image/SP10F.png' },
  SP11: { ALL: './assets/image/SP11ALL.png', HARD: './assets/image/SP11HARD.png', EX: './assets/image/SP11EX.png', F: './assets/image/SP11F.png' },
  SP12: { ALL: './assets/image/SP12ALL.png', HARD: './assets/image/SP12HARD.png', EX: './assets/image/SP12EX.png', F: './assets/image/SP12F.png' }
};
export const TYPE_TO_PREFIX = { H: 'SPH', A: 'SPA', L: 'SPL' };
export const GOAL_RANK_ORDER = { A: 1, AA: 2, AAA: 3, 'MAX-': 4, MAX: 5 };
export const LAMP_ORDER = { NP: 0, F: 1, ASSIST: 2, EASY: 3, NORMAL: 4, HC: 5, EX: 6, FC: 7 };
export const CLEAR_SORT_ORDER = { FC: 8, EXHARD: 7, HARD: 6, NORMAL: 5, EASY: 4, ASSIST: 3, FAILED: 2, NOPLAY: 1 };
export const SCORE_GRAPH_ORDER = ['NOPLAY', 'B', 'A', 'AA', 'AAA', 'MAX-', 'MAX'];
export const SCORE_SUMMARY_ORDER = ['MAX', 'MAX-', 'AAA', 'AA', 'A', 'B', 'NOPLAY'];
export const RADAR_ORDER = ['NOTES', 'PEAK', 'SCRATCH', 'SOFLAN', 'CHARGE', 'CHORD'];
export const SOCIAL_SHARE_SCOPE_VALUES = ['all', 'graphs', 'goals', 'none'];
export const DEFAULT_SOCIAL_SETTINGS = Object.freeze({
  discoverability: 'searchable',
  discoverByDjName: true,
  followPolicy: 'manual',
  shareDataScope: ['all', 'graphs', 'goals'],
  goalTransferPolicy: 'disabled',
  goalTransferEnabled: false,
  rivalPolicy: 'followers'
});

export const HELP_CONTENT_HTML = `
  <h4>기본 사용법</h4>
  <ol>
    <li>Reflux를 통해 tracker.tsv 파일을 얻습니다.<br /><a href="https://github.com/olji/Reflux" target="_blank" rel="noreferrer">https://github.com/olji/Reflux</a></li>
    <li>tsv 파일을 업로드하면 서열표에 적용됩니다.</li>
    <li>서열표 사용 및 다운로드 등의 간단한 기능은 로그인 없이 가능하며, 히스토리 관리 및 소셜 기능, 빙고 제작 기능은 회원가입 및 로그인 후 사용 가능합니다.</li>
    <li>10~12레벨의 데이터만 취합하고 있으며, 게임 내 노트 레이더에 그보다 낮은 레벨의 데이터가 포함된 경우 값이 다를 수 있습니다.</li>
  </ol>
  <h4>히스토리</h4>
  <ol>
    <li>두 번째 업로드부터 변경점이 기록됩니다.</li>
    <li>특정 시점으로 롤백할 수 있으며 그보다 이후의 데이터는 삭제됩니다.</li>
  </ol>
  <h4>빙고</h4>
  <ol>
    <li>빙고 추가 버튼을 통해 빙고를 작성할 수 있습니다.</li>
    <li>작성 중인 빙고가 있을 경우, 서열표에서 특정 악곡을 선택하여 빙고 추가 버튼을 통해 빙고 항목으로 추가할 수도 있습니다.</li>
    <li>다른 사람이 만든 빙고를 빙고 가져오기 버튼을 통해 JSON 파일로 가져올 수 있습니다.</li>
    <li>서로 팔로우인 경우, 내 팔로워에게 빙고를 공유할 수 있으며 업데이트 상태를 피드로 확인할 수 있습니다.</li>
  </ol>
  <h4>소셜</h4>
  <ol>
    <li>이 웹페이지를 사용하는 다른 유저를 팔로우하여 다양한 소식을 공유할 수 있습니다.</li>
    <li>주로 히스토리 갱신, 레이더 비교, 빙고 공유 등의 기능을 제공합니다.</li>
    <li>아직 개발 중인 단계이며 많은 버그가 있을 수 있습니다.</li>
  </ol>  
  <p><strong>본 웹사이트는 개발 중입니다.</strong></p>
`;
