export function getDeferredPanelRenderers(activePanel = 'rank') {
  switch (String(activePanel || 'rank')) {
    case 'history':
      return ['history', 'songGoalBingoPicker'];
    case 'goals':
      return ['goalCandidates', 'goals', 'songGoalBingoPicker'];
    case 'social':
      return ['social', 'songGoalBingoPicker'];
    default:
      return ['songGoalBingoPicker'];
  }
}
