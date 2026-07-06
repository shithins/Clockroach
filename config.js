const API_URL = 'https://script.google.com/macros/s/AKfycbwjpN1_3QiKmlbfS0L-v6BJMAQ9U2Btv_rgYKFJuTab-Ggz-7MGNtOsoHq698hFnrLL/exec';

async function apiCall(action, data = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight
    body: JSON.stringify({ action, ...data })
  });
  return res.json();
}
