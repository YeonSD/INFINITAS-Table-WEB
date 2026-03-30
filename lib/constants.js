export const DEFAULT_ICON_SRC = './assets/icon/infinitas.png';
export const MEDAL_SRC = {
  SP10: { ALL: './assets/image/SP10ALL.png', HARD: './assets/image/SP10HARD.png', EX: './assets/image/SP10EX.png', F: './assets/image/SP10F.png' },
  SP11: { ALL: './assets/image/SP11ALL.png', HARD: './assets/image/SP11HARD.png', EX: './assets/image/SP11EX.png', F: './assets/image/SP11F.png' },
  SP12: { ALL: './assets/image/SP12ALL.png', HARD: './assets/image/SP12HARD.png', EX: './assets/image/SP12EX.png', F: './assets/image/SP12F.png' }
};
export const TYPE_TO_PREFIX = { H: 'SPH', A: 'SPA', L: 'SPL' };
export const GOAL_RANK_ORDER = { A: 1, AA: 2, AAA: 3, 'MAX-': 4, MAX: 5 };
export const LAMP_ORDER = { NP: 0, F: 1, EASY: 2, NORMAL: 3, HC: 4, EX: 5, FC: 6 };
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
  <h4>웹 버전 안내</h4>
  <ol>
    <li>Reflux를 통해 tracker.tsv 파일을 얻습니다.<br /><a href="https://github.com/olji/Reflux" target="_blank" rel="noreferrer">https://github.com/olji/Reflux</a></li>
    <li>tsv 파일을 업로드하면 서열표에 적용됩니다.</li>
    <li>서열표 사용 및 다운로드 등의 간단한 기능은 로그인 없이 가능하며, 히스토리 관리 및 소셜 기능, 빙고 제작 기능은 회원가입 및 로그인 후 사용 가능합니다.</li>
    <li>10~12레벨의 데이터만 취합하고 있으며, 게임 내 노트 레이더에 그보다 낮은 레벨의 데이터가 포함된 경우 값이 다를 수 있습니다.</li>
  </ol>
  <p><strong>본 웹사이트는 지속적인 개발 중입니다.</strong></p>
`;
