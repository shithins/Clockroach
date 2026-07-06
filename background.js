importScripts('config.js');

const STALE_THRESHOLD_MINUTES = 120; // notify if a timer's been running 2+ hours

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'staleTimerCheck') return;

  const stored = await chrome.storage.local.get('runningTimer');
  const running = stored.runningTimer;
  if (!running) return;

  const now = new Date();
  const minutesElapsed = (now.getTime() - running.started_at) / 60000;
  
  let shouldNotify = false;
  let title = 'Timer still running';
  let message = `You've had a timer running for over ${Math.floor(minutesElapsed / 60)}h ${Math.floor(minutesElapsed % 60)}m. Still working on this?`;

  // 1. 2-hour stale check
  if (minutesElapsed >= STALE_THRESHOLD_MINUTES) {
    shouldNotify = true;
  }
  
  // 2. End-of-day check (6:00 PM or later)
  if (now.getHours() >= 18) {
    shouldNotify = true;
    title = 'End of Day Check';
    message = `It is past 6:00 PM and you still have a running timer. Did you forget to stop it for today?`;
  }

  if (shouldNotify) {
    chrome.notifications.create('staleTimer-' + running.entry_id, {
      type: 'basic',
      iconUrl: 'icon.png',
      title: title,
      message: message,
      priority: 2
    });
  }
});
