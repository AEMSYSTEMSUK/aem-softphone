// The One MSP Phone desktop: dial from anywhere (6 Nov 2026). Everything here that doesn't need Electron, so it can be
// tested with node --test. A number from a link or a selection is only checked for size and shape here: the page does the
// real clean-up (src/dial/number.ts), and ONE is the final gate for desk phone calls.
const path = require('node:path');

const MAX_TEXT = 64;
const DEFAULT_HOTKEY = 'Ctrl+Shift+D';

// tel:+441924263370, tel:01924-263370;ext=12, callto:01924263370, callto://+441924263370. Anywhere can open one of these
// links, so nothing but number characters gets through. Returns null for anything else.
function numberFromUrl(url) {
  const m = /^(?:tel|callto):(?:\/\/)?(.*)$/i.exec(String(url || '').slice(0, 200));
  if (!m) return null;
  let v = m[1].split(/[;?#]/)[0];
  try { v = decodeURIComponent(v); } catch { return null; }
  v = v.replace(/\/+$/, '').trim();
  return v.length <= MAX_TEXT && /^\+?[0-9()\-.\s]+$/.test(v) ? v : null;
}

// What to do with a command line (first launch, or second-instance): the first tel:/callto: argument, or null if none.
// Chromium adds switches of its own, so every argument is looked at and only that exact shape counts.
function dialRequestFromArgv(argv) {
  const url = (Array.isArray(argv) ? argv : []).find((a) => typeof a === 'string' && /^(tel|callto):/i.test(a));
  if (!url) return null;
  const text = numberFromUrl(url);
  return text ? { source: 'link', text } : { source: 'link', error: 'not_number' };
}

// The hotkey needs two modifiers, or one with a function key, so it can't take over Ctrl+C and friends in every app.
function checkHotkey(value) {
  const parts = String(value || '').trim().split(/\s*\+\s*/);
  const key = parts.pop() || '';
  const mods = parts.map((m) => ({ ctrl: 'Ctrl', control: 'Ctrl', alt: 'Alt', shift: 'Shift', win: 'Super', super: 'Super' }[m.toLowerCase()]));
  const k = key.toUpperCase();
  if (mods.some((m) => !m) || new Set(mods).size !== mods.length || !/^([A-Z0-9]|F([1-9]|1[0-2]))$/.test(k)) {
    return { ok: false, error: 'Use a shortcut like Ctrl+Shift+D' };
  }
  const fn = k.length > 1;
  if (mods.length < (fn ? 1 : 2) || mods.every((m) => m === 'Shift')) return { ok: false, error: 'Use two of Ctrl, Alt, Shift and Win, plus a letter or number' };
  const order = ['Ctrl', 'Alt', 'Shift', 'Super'];
  return { ok: true, value: [...order.filter((m) => mods.includes(m)), k].join('+') };
}

// Simulated Ctrl+C without a native module. .NET's SendKeys goes to the window in front, and PowerShell starts hidden so
// that stays the app the person was in. The script is fixed text: nothing selected or typed ever reaches a command line.
// The hotkey's own keys are still down when it fires, and Ctrl+Shift+C means something else in many apps, so wait for
// them to be released first (up to about a second).
const COPY_SCRIPT = [
  'Add-Type -AssemblyName System.Windows.Forms',
  '$n = 0',
  "while ([System.Windows.Forms.Control]::ModifierKeys -ne 'None' -and $n -lt 40) { Start-Sleep -Milliseconds 25; $n++ }",
  "[System.Windows.Forms.SendKeys]::SendWait('^c')",
].join('; ');

function copyCommand(systemRoot) {
  const root = systemRoot || 'C:\\Windows';
  return { file: path.win32.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), args: ['-NoProfile', '-NonInteractive', '-Command', COPY_SCRIPT] };
}

function snapshotClipboard(clipboard) {
  const snap = {};
  const text = clipboard.readText(), html = clipboard.readHTML(), rtf = clipboard.readRTF(), image = clipboard.readImage();
  if (text) snap.text = text;
  if (html) snap.html = html;
  if (rtf) snap.rtf = rtf;
  if (image && !image.isEmpty()) snap.image = image;
  return snap;
}

function restoreClipboard(clipboard, snap) {
  if (Object.keys(snap).length) clipboard.write(snap); else clipboard.clear();
}

// Press copy and read what comes back, leaving the clipboard as we found it. The clipboard is emptied first: if nothing is
// selected, copy does nothing, and an old number left on the clipboard must never be dialled by mistake.
async function captureSelection({ clipboard, sendCopy, sleep, waitMs = 800, stepMs = 50 }) {
  const snap = snapshotClipboard(clipboard);
  try {
    clipboard.clear();
    await sendCopy();
    let text = '';
    for (let waited = 0; ; waited += stepMs) { // some apps fill the clipboard a moment after the key press
      text = clipboard.readText();
      if (text || waited >= waitMs) break;
      await sleep(stepMs);
    }
    text = text.trim();
    if (!text) return { source: 'hotkey', error: 'no_selection' };
    return text.length > MAX_TEXT ? { source: 'hotkey', error: 'not_number' } : { source: 'hotkey', text };
  } finally {
    restoreClipboard(clipboard, snap);
  }
}

module.exports = { DEFAULT_HOTKEY, captureSelection, checkHotkey, copyCommand, dialRequestFromArgv, numberFromUrl };
