/** localStorage puede faltar o fallar (modo privado, almacenamiento bloqueado): la app debe funcionar igual. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    /* sin almacenamiento disponible: los datos viven solo en memoria */
  }
}

export function removeStored(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* nada que borrar */
  }
}

export function readSession(key: string): string | null {
  try {
    return globalThis.sessionStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeSession(key: string, value: string | null): void {
  try {
    if (value === null) globalThis.sessionStorage?.removeItem(key);
    else globalThis.sessionStorage?.setItem(key, value);
  } catch {
    /* sin sesión persistente */
  }
}
