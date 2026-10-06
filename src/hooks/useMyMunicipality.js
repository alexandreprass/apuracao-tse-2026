import { useEffect, useState } from 'preact/hooks';
import { storage } from '../lib/storage.js';

const KEY = 'apuracao:meu-municipio';
const EVENT = 'apuracao:meu-municipio';
const read = () => { const v = storage.get(KEY); return typeof v === 'string' && /^\d{7}$/.test(v) ? v : null; };

/** The reader's own municipality (IBGE code), kept only in this browser. */
export function useMyMunicipality() {
  const [ibge, setIbge] = useState(read);
  useEffect(() => {
    const sync = () => setIbge(read());
    addEventListener(EVENT, sync);
    addEventListener('storage', sync);
    return () => { removeEventListener(EVENT, sync); removeEventListener('storage', sync); };
  }, []);
  const save = code => {
    if (code) storage.set(KEY, code); else storage.remove(KEY);
    dispatchEvent(new Event(EVENT));
  };
  return [ibge, save];
}
