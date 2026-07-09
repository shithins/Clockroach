async function initTheme() {
  const stored = await chrome.storage.local.get('theme');
  if (stored.theme === 'light') {
    document.body.classList.add('light-theme');
  } else {
    document.body.classList.remove('light-theme');
  }
}
initTheme();
