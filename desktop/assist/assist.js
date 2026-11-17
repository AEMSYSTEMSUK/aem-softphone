// The One MSP Phone desktop - Call assistant side panel (17 Nov 2026).
// Andy: "build the BOT for teams where at the side you are suggesting additional questions" - he chose a side panel in
// the desktop app over a bot that joins the meeting. Served from app://phone/__assist/ (same origin as the phone page,
// so it shares the phone app's sign-in: the refresh token in localStorage 'aem.sp.refresh').
//
// Audio: the microphone = "me"; this PC's sound (Electron loopback via getDisplayMedia, see main.js) = "them". Both are
// resampled to 16 kHz mono and sent every CHUNK_MS as two small WAVs to ONE (/api/softphone/assist/...), which turns them
// into text on AEM's own server, deletes the audio, and every ~20 s of talk suggests questions and ticks the call sheet.
'use strict';

const API = (localStorage.getItem('aem.assist.api') || 'https://one.aemtech.co.uk/api').replace(/\/$/, '');
const REFRESH_KEY = 'aem.sp.refresh';
const CHUNK_MS = 15000;
const RATE = 16000;
const SILENCE_RMS = 0.004;

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- sign-in (shared with the phone app) ----------
let access = null;
let accessExp = 0;
let refreshing = null;

async function refresh() {
  for (let attempt = 0; attempt < 2; attempt++) {
    const rt = localStorage.getItem(REFRESH_KEY);
    if (!rt) break;
    const r = await fetch(`${API}/softphone/auth/refresh`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    const t = j.payload || j.data;
    if (r && r.ok && t?.accessToken) {
      access = t.accessToken;
      accessExp = Date.now() + ((t.expiresIn || 3600) - 60) * 1000;
      localStorage.setItem(REFRESH_KEY, t.refreshToken);
      return true;
    }
    // The phone window may have just rotated the token - read it again once.
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  throw new Error('Sign in to The One MSP Phone first (main window), then reopen the call assistant.');
}

async function api(path, init = {}) {
  if (!access || Date.now() > accessExp) { refreshing = refreshing || refresh().finally(() => { refreshing = null; }); await refreshing; }
  const go = () => fetch(`${API}/softphone${path}`, { ...init, headers: { Accept: 'application/json', Authorization: `Bearer ${access}`, ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
  let r = await go();
  if (r.status === 401) { access = null; await refresh(); r = await go(); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.status === false) throw new Error(j.message || `Error ${r.status}`);
  return j.payload ?? j.data;
}

function showError(msg) {
  const e = $('error');
  e.textContent = msg;
  e.classList.remove('hidden');
  clearTimeout(showError.t);
  showError.t = setTimeout(() => e.classList.add('hidden'), 8000);
}

function view(name) {
  for (const s of ['setup', 'live', 'done']) $(s).classList.toggle('hidden', s !== name);
}

// ---------- customer pickers ----------
function picker(inputId, listId, onPick) {
  const input = $(inputId);
  const list = $(listId);
  let t = null;
  input.addEventListener('input', () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (q.length < 2) { list.classList.add('hidden'); return; }
    t = setTimeout(async () => {
      try {
        const rows = await api(`/assist/clients?q=${encodeURIComponent(q)}`);
        list.innerHTML = rows.length ? rows.map((c) => `<div data-id="${c.id}">${esc(c.name)}</div>`).join('') : '<div class="muted">No match</div>';
        list.classList.remove('hidden');
      } catch (e) { showError(e.message); }
    }, 250);
  });
  list.addEventListener('click', (e) => {
    const id = e.target?.dataset?.id;
    if (!id) return;
    onPick({ id: Number(id), name: e.target.textContent });
    list.classList.add('hidden');
  });
}

let chosenClient = null;
function setClient(c) {
  chosenClient = c;
  const box = $('clientchosen');
  if (!c) { box.classList.add('hidden'); return; }
  box.innerHTML = `<span>${esc(c.name)}</span><a href="#" id="clientclear">change</a>`;
  box.classList.remove('hidden');
  $('clientq').value = '';
  $('clientclear').onclick = (e) => { e.preventDefault(); setClient(null); };
}

// ---------- set-up screen ----------
let agendas = [];
async function loadSetup() {
  view('setup');
  try {
    agendas = await api('/assist/agendas');
    $('agenda').innerHTML = '<option value="">None - just suggest questions</option>' + agendas.map((a) => `<option value="${a.id}">${esc(a.title)}${a.items ? ` (${a.items} questions)` : ''}</option>`).join('');
    const recent = await api('/assist/sessions');
    $('recent').innerHTML = recent.length ? '<h2>Recent calls</h2>' + recent.map((s) => `<div data-id="${s.id}">${esc(s.title)}<br><span class="muted">${new Date(s.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.noteId ? ' - saved' : ''}</span></div>`).join('') : '';
  } catch (e) { showError(e.message); }
}
$('agenda').addEventListener('change', () => {
  const a = agendas.find((x) => String(x.id) === $('agenda').value);
  if (a?.clientId && !chosenClient) setClient({ id: a.clientId, name: a.clientName });
});
$('consent').addEventListener('change', () => { $('start').disabled = !$('consent').checked; });
$('recent').addEventListener('click', async (e) => {
  const id = e.target.closest('[data-id]')?.dataset.id;
  if (!id) return;
  try { session = await api(`/assist/sessions/${id}`); if (!session.endedAt) session = await api(`/assist/sessions/${id}/end`, { method: 'POST' }); showDone(); } catch (err) { showError(err.message); }
});
picker('clientq', 'clientlist', setClient);

// ---------- audio ----------
let ctx = null;
let streams = [];
const bufs = { me: [], them: [] };
const levels = { me: 0, them: 0 };
let paused = false;
let startedAt = 0;
let chunkStartedAt = 0;
let chunkTimer = null;
let pollTimer = null;
let clockTimer = null;
let sending = Promise.resolve();
let session = null;

function tap(stream, who) {
  const src = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  proc.onaudioprocess = (e) => {
    const d = e.inputBuffer.getChannelData(0);
    let sum = 0;
    for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
    levels[who] = Math.sqrt(sum / d.length);
    if (!paused) bufs[who].push(new Float32Array(d));
  };
  src.connect(proc);
  proc.connect(ctx.destination); // nothing is written to the output, so this plays nothing
}

async function startAudio() {
  const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
  streams.push(mic);
  let pc = null;
  try {
    const d = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }); // main.js answers with the screen + loopback audio
    d.getVideoTracks().forEach((t) => t.stop());
    if (d.getAudioTracks().length) pc = new MediaStream(d.getAudioTracks());
    streams.push(d);
  } catch (e) { console.warn('pc sound', e); }
  ctx = new AudioContext({ sampleRate: RATE });
  tap(mic, 'me');
  if (pc) tap(pc, 'them'); else showError("Can't hear this PC's sound - only your side will be transcribed.");
}

function stopAudio() {
  for (const s of streams) s.getTracks().forEach((t) => t.stop());
  streams = [];
  if (ctx) ctx.close().catch(() => undefined);
  ctx = null;
}

function wav(chunks) {
  const n = chunks.reduce((a, c) => a + c.length, 0);
  const out = new DataView(new ArrayBuffer(44 + n * 2));
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true); out.setUint32(24, RATE, true);
  out.setUint32(28, RATE * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); str(36, 'data'); out.setUint32(40, n * 2, true);
  let o = 44, sum = 0;
  for (const c of chunks) for (let i = 0; i < c.length; i++) { const v = Math.max(-1, Math.min(1, c[i])); sum += v * v; out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true); o += 2; }
  return { blob: new Blob([out.buffer], { type: 'audio/wav' }), rms: n ? Math.sqrt(sum / n) : 0 };
}

function flush() {
  const offset = Math.round((chunkStartedAt - startedAt) / 1000);
  chunkStartedAt = Date.now();
  const me = wav(bufs.me.splice(0));
  const them = wav(bufs.them.splice(0));
  const fd = new FormData();
  if (me.rms > SILENCE_RMS) fd.append('me', me.blob, 'me.wav');
  if (them.rms > SILENCE_RMS) fd.append('them', them.blob, 'them.wav');
  if (!fd.has('me') && !fd.has('them')) return;
  fd.append('offset', String(offset));
  const id = session.id;
  sending = sending.then(() => api(`/assist/sessions/${id}/audio`, { method: 'POST', body: fd })).catch((e) => showError(e.message));
}

// ---------- live screen ----------
function render(s) {
  session = s;
  $('calltitle').textContent = s.title + (s.clientName && !s.title.includes(s.clientName) ? ` - ${s.clientName}` : '');
  const L = s.latest;
  $('questions').innerHTML = L?.questions?.length
    ? L.questions.map((q) => `<div class="q"><b>${esc(q.q)}</b>${q.why ? `<span>${esc(q.why)}</span>` : ''}</div>`).join('')
    : '<p class="muted">Suggestions appear after the first minute of talking.</p>';
  $('facts').innerHTML = L?.facts?.length ? L.facts.map((f) => `<li>${esc(f)}</li>`).join('') : '<li class="muted">Nothing yet.</li>';
  if (s.agenda?.items?.length) {
    $('agendaBox').classList.remove('hidden');
    const st = L?.agenda || {};
    let sec = null, html = '', answered = 0;
    for (const it of s.agenda.items) {
      if (it.section !== sec) { sec = it.section; if (sec) html += `<div class="sec">${esc(sec)}</div>`; }
      const a = st[String(it.n)];
      if (a?.status === 'answered') answered++;
      html += `<div class="it ${a ? a.status : ''}"><span class="mark">${a?.status === 'answered' ? '✓' : a?.status === 'partly' ? '◐' : '○'}</span><span>${esc(it.text)}${a?.answer ? `<span class="ans">${esc(a.answer)}</span>` : ''}</span></div>`;
    }
    $('agendaList').innerHTML = html;
    $('agendaCount').textContent = `${answered} of ${s.agenda.items.length} answered`;
  } else $('agendaBox').classList.add('hidden');
  const first = (s.title || '').split(' ')[0];
  $('transcript').innerHTML = s.segments.map((g) => `<div class="${g.who}">${Math.floor(g.t / 60)}:${String(g.t % 60).padStart(2, '0')} <b>${g.who === 'me' ? 'You' : 'Them'}:</b> ${esc(g.text)}</div>`).join('') || '<span class="muted">Nothing yet.</span>';
  void first;
}

async function poll() {
  try { render(await api(`/assist/sessions/${session.id}`)); } catch (e) { console.warn(e); }
}

$('start').addEventListener('click', async () => {
  $('start').disabled = true;
  try {
    session = await api('/assist/sessions', { method: 'POST', body: JSON.stringify({ agendaId: $('agenda').value || null, clientId: chosenClient?.id || null, context: $('context').value.trim() || null }) });
    await startAudio();
    startedAt = chunkStartedAt = Date.now();
    paused = false;
    chunkTimer = setInterval(flush, CHUNK_MS);
    pollTimer = setInterval(poll, 3000);
    clockTimer = setInterval(() => {
      const sec = Math.floor((Date.now() - startedAt) / 1000);
      $('timer').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
      $('meterMe').style.width = `${Math.min(100, levels.me * 600)}%`;
      $('meterThem').style.width = `${Math.min(100, levels.them * 600)}%`;
    }, 200);
    $('status').textContent = 'Listening';
    $('status').classList.add('on');
    view('live');
    await poll();
  } catch (e) {
    stopAudio();
    showError(e.message || String(e));
  } finally { $('start').disabled = !$('consent').checked; }
});

$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Resume' : 'Pause';
  $('status').textContent = paused ? 'Paused' : 'Listening';
  $('status').classList.toggle('on', !paused);
});

$('suggest').addEventListener('click', async () => {
  $('suggest').disabled = true;
  try { flush(); await sending; render(await api(`/assist/sessions/${session.id}/suggest`, { method: 'POST' })); } catch (e) { showError(e.message); } finally { $('suggest').disabled = false; }
});

$('end').addEventListener('click', async () => {
  $('end').disabled = true;
  $('status').textContent = 'Writing the summary...';
  try {
    clearInterval(chunkTimer); clearInterval(pollTimer); clearInterval(clockTimer);
    flush();
    stopAudio();
    await sending;
    session = await api(`/assist/sessions/${session.id}/end`, { method: 'POST' });
    showDone();
  } catch (e) { showError(e.message); } finally { $('end').disabled = false; $('status').classList.remove('on'); $('status').textContent = 'Not listening'; }
});

// ---------- after the call ----------
let saveClient = null;
function showDone() {
  view('done');
  $('donetitle').textContent = session.title;
  $('summary').textContent = session.summary || '';
  saveClient = session.clientId ? { id: session.clientId, name: session.clientName } : null;
  $('saveq').value = saveClient ? saveClient.name : '';
  $('save').textContent = session.noteId ? 'Saved - save again' : 'Save to customer in ONE';
}
picker('saveq', 'savelist', (c) => { saveClient = c; $('saveq').value = c.name; });
$('save').addEventListener('click', async () => {
  if (!saveClient) { showError('Pick the customer first'); return; }
  try { session = await api(`/assist/sessions/${session.id}/save`, { method: 'POST', body: JSON.stringify({ clientId: saveClient.id }) }); $('save').textContent = 'Saved to ' + saveClient.name; } catch (e) { showError(e.message); }
});
$('copy').addEventListener('click', () => { navigator.clipboard.writeText(session.summary || '').then(() => { $('copy').textContent = 'Copied'; setTimeout(() => { $('copy').textContent = 'Copy'; }, 1500); }); });
$('again').addEventListener('click', () => { session = null; setClient(null); $('context').value = ''; $('consent').checked = false; $('start').disabled = true; loadSetup(); });
$('del').addEventListener('click', async () => {
  if (!confirm('Delete this call and its transcript?')) return;
  try { await api(`/assist/sessions/${session.id}`, { method: 'DELETE' }); session = null; loadSetup(); } catch (e) { showError(e.message); }
});

loadSetup();
