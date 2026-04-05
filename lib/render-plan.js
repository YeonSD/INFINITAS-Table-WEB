export function getDeferredPanelRenderers(activePanel = 'rank') {
  switch (String(activePanel || 'rank')) {
    case 'history':
      return ['history'];
    case 'goals':
      return ['goalCandidates', 'goals', 'songGoalBingoPicker'];
    case 'social':
      return ['social'];
    default:
      return [];
  }
}
