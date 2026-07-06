const API_URL = 'https://script.google.com/macros/s/AKfycbwikP7XcnIiTWJjqYXGQkNvNUrUg12zU7eCjRhL0v_6hi0Bv6jkq9kbibk6_zppdWBb/exec';

async function apiCall(action, data = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body: JSON.stringify({ action, ...data })
  });
  return res.json();
}
