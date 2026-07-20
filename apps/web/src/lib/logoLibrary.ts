export interface LogoAsset {
  id: string;
  name: string;
  src: string;
  schoolName?: string;
}

interface LogoFrontMatterLike {
  logoId?: string;
}

export const LOGO_LIBRARY_STORAGE_KEY = "mauth-studio.logo-library.v1";
export const LOGO_STARTER_SEED_STORAGE_KEY = "mauth-studio.logo-starter-seed.v1";
export const LEGACY_LOGO_LIBRARY_STORAGE_KEY = "math-app.logo-library.v1";

export const STARTER_LOGOS: LogoAsset[] = [
  {
    id: "acc-logo",
    name: "Australian Christian College",
    src: "/logos/acc_logo.svg",
    schoolName: "AUSTRALIAN\nCHRISTIAN COLLEGE",
  },
  {
    id: "cornerstone-logo",
    name: "Cornerstone Christian College",
    src: "/logos/cornerstone_logo.svg",
    schoolName: "CORNERSTONE\nCHRISTIAN COLLEGE",
  },
];

function localStorageItem(key: string, legacyKey?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
}

export function normalizeLogoAsset(value: unknown): LogoAsset | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<LogoAsset>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.src !== "string") {
    return undefined;
  }
  return {
    id: candidate.id,
    name: candidate.name,
    src: candidate.src,
    ...(typeof candidate.schoolName === "string" ? { schoolName: candidate.schoolName } : {}),
  };
}

export function normalizeLogoAssets(value: unknown): LogoAsset[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((logo): LogoAsset[] => {
    const normalizedLogo = normalizeLogoAsset(logo);
    return normalizedLogo ? [normalizedLogo] : [];
  });
}

export function loadLogoLibrary(): LogoAsset[] {
  if (typeof window === "undefined") return STARTER_LOGOS;

  try {
    const stored = localStorageItem(LOGO_LIBRARY_STORAGE_KEY, LEGACY_LOGO_LIBRARY_STORAGE_KEY);
    if (!stored) return STARTER_LOGOS;
    const storedLogos = normalizeLogoAssets(JSON.parse(stored) as unknown);
    return storedLogos.length ? storedLogos : STARTER_LOGOS;
  } catch {
    return STARTER_LOGOS;
  }
}

export function persistLogoLibrary(logos: LogoAsset[]) {
  if (typeof window === "undefined") return;

  try {
    const persistedLogos = logos.map(({ id: logoId, name, src, schoolName }) => ({
      id: logoId,
      name,
      src,
      ...(typeof schoolName === "string" ? { schoolName } : {}),
    }));
    window.localStorage.setItem(LOGO_LIBRARY_STORAGE_KEY, JSON.stringify(persistedLogos));
  } catch {
    // Large uploaded images can exceed browser storage limits; keep the in-memory choice for this session.
  }
}

export function shouldSeedStarterLogos() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LOGO_STARTER_SEED_STORAGE_KEY) !== "done";
}

export function markStarterLogosSeeded() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOGO_STARTER_SEED_STORAGE_KEY, "done");
}

export function logoNameFromFile(fileName: string) {
  return (
    fileName
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Custom logo"
  );
}

export function selectedLogoFromLibrary(logos: LogoAsset[], logoId: string) {
  return logos.find((logo) => logo.id === logoId) ?? logos[0] ?? STARTER_LOGOS[0];
}

export function selectedLogoForFrontMatter(logos: LogoAsset[], frontMatter: LogoFrontMatterLike) {
  return frontMatter.logoId ? selectedLogoFromLibrary(logos, frontMatter.logoId) : undefined;
}

export function frontMatterPatchForLogo(logos: LogoAsset[], logoId: string) {
  const logo = selectedLogoFromLibrary(logos, logoId);
  return {
    logoId,
    ...(typeof logo.schoolName === "string" ? { schoolName: logo.schoolName } : {}),
  };
}

export function mergeLogoAssets(current: LogoAsset[], assets: Array<LogoAsset | null | undefined>) {
  let changed = false;
  const next = [...current];

  for (const asset of assets) {
    const logo = normalizeLogoAsset(asset);
    if (!logo) continue;

    const existingIndex = next.findIndex((candidate) => candidate.id === logo.id);
    if (existingIndex === -1) {
      next.push(logo);
      changed = true;
      continue;
    }

    const existing = next[existingIndex];
    if (existing.name !== logo.name || existing.src !== logo.src || existing.schoolName !== logo.schoolName) {
      next[existingIndex] = logo;
      changed = true;
    }
  }

  return changed ? next : current;
}

export function updatedLogoLibraryAsset(current: LogoAsset[], logoId: string, patch: { name: string; schoolName: string }) {
  const existingLogo = current.find((logo) => logo.id === logoId);
  if (!existingLogo) return null;
  const logo = {
    ...existingLogo,
    name: patch.name.trim() || existingLogo.name,
    schoolName: patch.schoolName,
  };
  return {
    logo,
    logos: current.map((candidate) => (candidate.id === logoId ? logo : candidate)),
  };
}

export function appendedLogoLibraryAsset(current: LogoAsset[], logo: LogoAsset) {
  return mergeLogoAssets(current, [logo]);
}

export function removedLogoLibraryAsset(current: LogoAsset[], logoId: string) {
  const logos = current.filter((candidate) => candidate.id !== logoId);
  return logos.length && logos.length !== current.length ? logos : null;
}

export function appendMissingLogoAssets(current: LogoAsset[], assets: Array<LogoAsset | null | undefined>) {
  let changed = false;
  const next = [...current];

  for (const asset of assets) {
    const logo = normalizeLogoAsset(asset);
    if (!logo || next.some((candidate) => candidate.id === logo.id)) continue;
    next.push(logo);
    changed = true;
  }

  return changed ? next : current;
}

export function schoolInitials(lines: string[]) {
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  return words
    .slice(0, 3)
    .map((word) => word[0]?.toUpperCase())
    .join("");
}
