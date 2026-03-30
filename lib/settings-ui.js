import { $ } from './utils.js';

export function renderSettings(ctx) {
  const s = ctx.activeSocialSettings();
  $('makerVersionText').textContent = '1.0.0';
  $('settingDiscoverability').checked = s.discoverability !== 'hidden';
  $('settingDiscoverabilityDjName').checked = s.discoverByDjName !== false;
  $('settingFollowPolicyAuto').checked = s.followPolicy === 'auto';
  $('settingFollowPolicyManual').checked = s.followPolicy === 'manual';
  $('settingFollowPolicyDisabled').checked = s.followPolicy === 'disabled';
  $('settingShareAllData').checked = s.shareDataScope.includes('all');
  $('settingShareGraphs').checked = !s.shareDataScope.includes('all') && s.shareDataScope.includes('graphs') && !s.shareDataScope.includes('none');
  $('settingShareNone').checked = s.shareDataScope.includes('none');
}
