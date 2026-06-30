export interface BrowserStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface LoadBrowserJsonOptions<T> {
  key: string;
  legacyKey?: string;
  normalize: (value: unknown) => T | null;
  storage?: BrowserStorageLike | null;
}

interface PersistBrowserSnapshotOptions<TSnapshot extends object> {
  key: string;
  snapshot: TSnapshot;
  storage?: BrowserStorageLike | null;
  now?: () => string;
}

interface AutosaveSnapshotLike {
  updatedAt?: string;
}

function browserStorage() {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function browserStorageItem(key: string, legacyKey?: string, storage: BrowserStorageLike | null = browserStorage()) {
  if (!storage) return null;
  return storage.getItem(key) ?? (legacyKey ? storage.getItem(legacyKey) : null);
}

export function loadBrowserJson<T>({ key, legacyKey, normalize, storage = browserStorage() }: LoadBrowserJsonOptions<T>): T | null {
  try {
    const stored = browserStorageItem(key, legacyKey, storage);
    if (!stored) return null;
    return normalize(JSON.parse(stored) as unknown);
  } catch {
    return null;
  }
}

export function persistBrowserSnapshot<TSnapshot extends object>({
  key,
  snapshot,
  storage = browserStorage(),
  now = () => new Date().toISOString(),
}: PersistBrowserSnapshotOptions<TSnapshot>) {
  if (!storage) return false;

  try {
    storage.setItem(
      key,
      JSON.stringify({
        ...snapshot,
        updatedAt: now(),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function newerAutosaveSnapshot<TAutosave extends AutosaveSnapshotLike>(
  left: TAutosave | null,
  right: TAutosave | null,
  isBlank: (autosave: TAutosave) => boolean,
) {
  if (!left) return right;
  if (!right) return left;
  const leftBlank = isBlank(left);
  const rightBlank = isBlank(right);
  if (leftBlank && !rightBlank) return right;
  if (rightBlank && !leftBlank) return left;
  return (right.updatedAt ?? "") > (left.updatedAt ?? "") ? right : left;
}
