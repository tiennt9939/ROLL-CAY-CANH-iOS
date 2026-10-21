const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const h = fs.readFileSync(path.join(__dirname, '../app/src/main/assets/index.html'), 'utf8');
function body(name, nextMarker) {
  const start = h.indexOf(`function ${name}(`);
  assert(start >= 0, `missing ${name}`);
  const end = nextMarker ? h.indexOf(nextMarker, start) : h.length;
  assert(end > start, `missing end marker for ${name}`);
  return h.slice(start, end);
}
const bellOpen = body('openOrderNotifications', 'function closeOrderNotifications');
assert(!bellOpen.includes('refreshOrdersForNotification('), 'bell click must not fetch Firestore order lists');
assert(!bellOpen.includes('showOrderAlert(') && !bellOpen.includes('renderOrderAlertList('), 'bell click must not render order lists');
const autoAlert = body('maybeAlertForPending', '\nconst CloudSync =');
assert(autoAlert.includes('ROLL_CAY_LAST_PENDING_'), 'pending count baseline must remain stored');
assert(autoAlert.includes('updateOrderNotificationUI('), 'badge count must still be updated');
assert(!autoAlert.includes('showOrderAlert(') && !autoAlert.includes('toast('), 'new pending orders must not spawn popup/toast');
assert(!autoAlert.includes('playOrderAlertSound(') && !autoAlert.includes('vibrateOrderAlert('), 'count-only notifications must not trigger sound/vibration');
const updater = body('updateOrderNotificationUI', '\nfunction unlockOrderAlertAudio');
assert(updater.includes("b.textContent=orderNotificationState.pending>99?'99+'"), 'badge must keep numeric pending count');
assert(updater.includes("bell.classList.remove('has-alert')"), 'bell pulse animation must stay disabled');
console.log('NOTIFICATION COUNT-ONLY TEST PASS: realtime numeric badge retained; no popup/list fetch or automatic sound');
