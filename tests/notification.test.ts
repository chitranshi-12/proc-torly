/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * exam.co Teacher Notification Sound & Deduplication Unit Tests
 */

import { audioNotificationService } from '../src/services/audioNotificationService.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runNotificationTestSuite() {
  console.log(`\n🔔 Starting exam.co Notification Sound & Deduplication Tests...\n`);

  // 1. Initial State Check
  audioNotificationService.setSoundEnabled(true);
  assert(audioNotificationService.getSoundEnabled() === true, 'Sound notifications enabled by default');

  // 2. Play first incident alert
  const firstPlay = audioNotificationService.playIncidentAlert('incident_unique_001');
  assert(firstPlay === true, 'Brand new incident triggers single notification alert');

  // 3. Deduplication: Same incident ID must NEVER trigger audio again
  const duplicatePlay = audioNotificationService.playIncidentAlert('incident_unique_001');
  assert(duplicatePlay === false, 'Duplicate incident ID is rejected by deduplication engine');

  // 4. Seeding historical incidents (reconnect protection)
  audioNotificationService.seedKnownIncidents(['historical_inc_101', 'historical_inc_102']);
  const historicalPlay = audioNotificationService.playIncidentAlert('historical_inc_101');
  assert(historicalPlay === false, 'Historical/reconnecting incident does not trigger repeated sound');

  // 5. Sound Mute Control
  audioNotificationService.setSoundEnabled(false);
  assert(audioNotificationService.getSoundEnabled() === false, 'Teacher sound mute toggle silences audio');

  const mutedPlay = audioNotificationService.playIncidentAlert('incident_new_002');
  assert(mutedPlay === false, 'Muted teacher dashboard suppresses all sound playback');

  // 6. Unmute restores sound for new incidents
  audioNotificationService.setSoundEnabled(true);
  // Wait 2.6s to clear rate-limiting interval
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const unmutedPlay = audioNotificationService.playIncidentAlert('incident_new_003');
  assert(unmutedPlay === true, 'Unmuting allows new incident audio to play');

  console.log(`\n================================`);
  console.log(`Tests Completed: ${passed + failed}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runNotificationTestSuite().catch((err) => {
  console.error('Notification test failed:', err);
  process.exit(1);
});
