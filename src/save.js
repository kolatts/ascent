// One slot, one key. Bump SAVE_KEY's version when the shape changes so an old
// save is ignored instead of half-loaded into a crash.

export const SAVE_KEY = 'ascent.save.v2';
export const SAVE_VERSION = 2;

export function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== SAVE_VERSION) return null;
    return data;
  } catch (err) {
    console.warn('save unreadable, starting fresh', err);
    return null;
  }
}

export function writeSave(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('save failed', err);
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (err) {
    console.warn('could not clear save', err);
  }
}
