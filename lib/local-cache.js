export async function fetchJsonOptional(path, cacheMode = 'default') {
  try {
    const response = await fetch(path, { cache: cacheMode });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export function readJsonCache(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJsonCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage errors and keep going with live data.
  }
}

export function clearJsonCache(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors and continue.
  }
}
