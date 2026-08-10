importScripts('config.js');

const STALE_THRESHOLD_MINUTES = 120; // notify if a timer's been running 2+ hours

// Initialize notification schedule alarm on install and startup
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('notificationTick', { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('notificationTick', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'staleTimerCheck') {
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
  } else if (alarm.name === 'notificationTick') {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hrs}:${mins}`;

    const stored = await chrome.storage.local.get(['company_settings', 'runningTimer', 'lastShownNotification']);
    const settings = stored.company_settings || [];
    const running = stored.runningTimer;
    const lastShown = stored.lastShownNotification || {};
    const today = now.toDateString();

    const getSetting = key => {
      const found = settings.find(s => s.setting_key === key);
      return found ? String(found.setting_value).trim().toLowerCase() : '';
    };

    let typeToShow = null;
    let title = '';
    let message = '';

    if (getSetting('notify_morning_enabled') === 'true' && getSetting('notify_morning_time') === timeStr) {
      if (!running && lastShown.morning !== today) {
        typeToShow = 'morning';
        title = 'Morning Clock-In';
        message = 'Good morning! Time to clock-in and start tracking your tasks.';
      }
    } else if (getSetting('notify_lunch_start_enabled') === 'true' && getSetting('notify_lunch_start_time') === timeStr) {
      if (running && lastShown.lunch_start !== today) {
        typeToShow = 'lunch_start';
        title = 'Lunch Break';
        message = "Lunch time! Don't forget to pause your timer.";
      }
    } else if (getSetting('notify_lunch_end_enabled') === 'true' && getSetting('notify_lunch_end_time') === timeStr) {
      if (!running && lastShown.lunch_end !== today) {
        typeToShow = 'lunch_end';
        title = 'Resume Tracking';
        message = "Lunch break is over! Remember to resume tracking your tasks.";
      }
    } else if (getSetting('notify_evening_enabled') === 'true' && getSetting('notify_evening_time') === timeStr) {
      if (running && lastShown.evening !== today) {
        typeToShow = 'evening';
        title = 'Evening Clock-Out';
        message = 'Great work today! Remember to clock-out and stop your timer.';
      }
    }

    if (typeToShow) {
      lastShown[typeToShow] = today;
      await chrome.storage.local.set({ lastShownNotification: lastShown });

      chrome.notifications.create(typeToShow + '-' + Date.now(), {
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message,
        priority: 2
      });
    }
  }
});
