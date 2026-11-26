import { DEMO_PERSONAS, type DemoPersonaKey } from '@illi-knows/shared';

const STORAGE_KEY = 'illi-knows:demo-persona';
let current: DemoPersonaKey | null = read();

function read(): DemoPersonaKey | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return DEMO_PERSONAS.some(p => p.key === v) ? (v as DemoPersonaKey) : null;
  } catch {
    return null;
  }
}

/** The demo persona the API calls go out as, or null for a real sign-in or a guest. */
export const getDemoPersona = () => current;

export function setDemoPersona(key: DemoPersonaKey | null): void {
  current = key;
  try {
    if (key) window.localStorage.setItem(STORAGE_KEY, key);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Private windows can refuse storage; the choice then lasts until reload.
  }
}
