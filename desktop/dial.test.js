const assert = require('node:assert/strict');
const { test } = require('node:test');
const { captureSelection, checkHotkey, copyCommand, dialRequestFromArgv, numberFromUrl } = require('./dial.js');

test('tel: and callto: links give the number', () => {
  assert.equal(numberFromUrl('tel:+441924263370'), '+441924263370');
  assert.equal(numberFromUrl('TEL:01924-263370;ext=12'), '01924-263370');
  assert.equal(numberFromUrl('tel:01924%20263370'), '01924 263370');
  assert.equal(numberFromUrl('callto:01924263370'), '01924263370');
  assert.equal(numberFromUrl('callto://+441924263370/'), '+441924263370');
});

test('anything else in a link is refused', () => {
  for (const u of ['http://x', 'tel:', 'tel:abc', 'callto:someone.skype', 'tel:0192%0Acalc', 'tel:%ZZ', `tel:${'1'.repeat(300)}`, null]) assert.equal(numberFromUrl(u), null, String(u));
});

test('the link is found among the switches Chromium adds', () => {
  assert.deepEqual(dialRequestFromArgv(['app.exe', '--allow-file-access', 'tel:01924263370']), { source: 'link', text: '01924263370' });
  assert.deepEqual(dialRequestFromArgv(['app.exe', 'tel:nope']), { source: 'link', error: 'not_number' });
  assert.equal(dialRequestFromArgv(['app.exe', '--tel:01924263370']), null);
  assert.equal(dialRequestFromArgv(['app.exe']), null);
});

test('hotkeys are tidied up', () => {
  assert.deepEqual(checkHotkey('ctrl + shift + d'), { ok: true, value: 'Ctrl+Shift+D' });
  assert.deepEqual(checkHotkey('Shift+Alt+1'), { ok: true, value: 'Alt+Shift+1' });
  assert.deepEqual(checkHotkey('Ctrl+F9'), { ok: true, value: 'Ctrl+F9' });
  assert.deepEqual(checkHotkey('Win+Alt+P'), { ok: true, value: 'Alt+Super+P' });
});

test('hotkeys that would take over normal keys, or aren\'t keys, are refused', () => {
  for (const h of ['', 'D', 'Ctrl+C', 'Ctrl+V', 'Shift+F1', 'F5', 'Ctrl+Ctrl+D', 'Ctrl+Shift+', 'Ctrl+Shift+Enter', 'Foo+Bar+D', 'Ctrl+Shift+D; calc']) assert.equal(checkHotkey(h).ok, false, h);
});

test('the copy command is fixed text and a full path', () => {
  const c = copyCommand('C:\\Windows');
  assert.equal(c.file, 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe');
  assert.ok(c.args.includes('-NoProfile'));
  assert.match(c.args.at(-1), /SendWait\('\^c'\)$/);
});

function fakeClipboard(start) {
  const b = { text: '', html: '', rtf: '', ...start };
  return {
    state: b, writes: [],
    readText: () => b.text, readHTML: () => b.html, readRTF: () => b.rtf, readImage: () => ({ isEmpty: () => true }),
    clear() { b.text = ''; b.html = ''; b.rtf = ''; },
    write(d) { this.writes.push(d); Object.assign(b, { text: '', html: '', rtf: '' }, d); },
  };
}
const sleep = async () => undefined;

test('the selection is read and the clipboard put back', async () => {
  const clipboard = fakeClipboard({ text: 'old', html: '<b>old</b>' });
  const r = await captureSelection({ clipboard, sleep, sendCopy: async () => { clipboard.state.text = ' 01924 263370\r\n'; } });
  assert.deepEqual(r, { source: 'hotkey', text: '01924 263370' });
  assert.deepEqual(clipboard.writes, [{ text: 'old', html: '<b>old</b>' }]);
});

test('an app that fills the clipboard late is waited for', async () => {
  const clipboard = fakeClipboard({});
  let polls = 0;
  const r = await captureSelection({ clipboard, sendCopy: async () => undefined, sleep: async () => { if (++polls === 3) clipboard.state.text = '200'; } });
  assert.equal(r.text, '200');
});

test('nothing selected never falls back to an old number on the clipboard', async () => {
  const clipboard = fakeClipboard({ text: '01924263370' });
  const r = await captureSelection({ clipboard, sleep, sendCopy: async () => undefined });
  assert.deepEqual(r, { source: 'hotkey', error: 'no_selection' });
  assert.equal(clipboard.state.text, '01924263370');
});

test('a long selection stops here, and an empty clipboard stays empty', async () => {
  const clipboard = fakeClipboard({});
  const r = await captureSelection({ clipboard, sleep, sendCopy: async () => { clipboard.state.text = 'x'.repeat(5000); } });
  assert.deepEqual(r, { source: 'hotkey', error: 'not_number' });
  assert.equal(clipboard.state.text, '');
});

test('the clipboard is put back even when the copy fails', async () => {
  const clipboard = fakeClipboard({ text: 'old' });
  await assert.rejects(captureSelection({ clipboard, sleep, sendCopy: async () => { throw new Error('blocked'); } }), /blocked/);
  assert.equal(clipboard.state.text, 'old');
});
