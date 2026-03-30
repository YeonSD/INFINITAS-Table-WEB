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
  <ul>
    <li>로그인 없이 서열표 조회, TSV 업로드, 이미지 다운로드를 사용할 수 있습니다.</li>
    <li>Google 로그인 후 기존 프로필이 있으면 바로 불러오고, 없으면 DJ NAME과 INFINITAS ID를 등록합니다.</li>
    <li>프로필 등록이 끝나면 히스토리, 목표, 소셜, 설정 기능이 열립니다.</li>
    <li>Reflux 실행, 게임 프로세스 감시, Electron IPC, 로컬 계정 기능은 웹 버전에서 제거되었습니다.</li>
    <li>서열표와 노트 레이더 데이터는 관리자 관리형 정적 데이터로 제공됩니다.</li>
  </ul>
`;
