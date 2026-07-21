import { Game, parseJsonList } from './games';

export type OwnedPlatform = 'PC' | 'PlayStation' | 'Nintendo' | 'Xbox';

export type SystemProfile = {
  os: string;
  cpuLabel: string;
  cpuCores: number;
  memoryGb: number;
  gpuTier: number;
  gpuLabel: string;
  storageGb?: number;
  ownedPlatforms: OwnedPlatform[];
};

export type PcRequirement = {
  label: string;
  minCpuCores: number;
  minMemoryGb: number;
  minGpuTier: number;
  storageGb: number;
};

export type CompatibilityStatus =
  | 'great'
  | 'playable'
  | 'limited'
  | 'blocked'
  | 'console-ready'
  | 'console-only';

export type PlatformFit = {
  platform: OwnedPlatform;
  available: boolean;
  owned: boolean;
  note: string;
};

export type CompatibilityResult = {
  status: CompatibilityStatus;
  label: string;
  summary: string;
  requirement: PcRequirement;
  deficits: string[];
  positives: string[];
  platformFits: PlatformFit[];
  pcAvailable: boolean;
};

export const SYSTEM_PROFILE_STORAGE_KEY = 'game-recs-system-profile-v1';

export const GPU_TIERS = [
  { value: 1, label: 'Integrated / older GPU' },
  { value: 2, label: 'Modern integrated GPU' },
  { value: 3, label: 'Entry dedicated GPU' },
  { value: 4, label: 'Performance GPU' },
  { value: 5, label: 'High-end GPU' },
];

const GPU_TIER_SCORES: Record<number, number> = {
  1: 18,
  2: 30,
  3: 45,
  4: 65,
  5: 88,
};

const PLATFORM_ORDER: OwnedPlatform[] = ['PC', 'PlayStation', 'Nintendo', 'Xbox'];

const normalizeTitle = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const titleMatches = (title: string, candidates: string[]) => {
  const normalized = normalizeTitle(title);
  return candidates.some(candidate => normalized.includes(normalizeTitle(candidate)));
};

const hasAnyGenre = (game: Game, genres: string[]) => {
  const available = parseJsonList(game.genres).map(genre => genre.toLowerCase());
  return genres.some(genre => available.includes(genre.toLowerCase()));
};

const requirement = (
  label: string,
  minCpuCores: number,
  minMemoryGb: number,
  minGpuTier: number,
  storageGb: number
): PcRequirement => ({
  label,
  minCpuCores,
  minMemoryGb,
  minGpuTier,
  storageGb,
});

const lightRequirement = requirement('Light PC target', 2, 4, 1, 10);
const standardRequirement = requirement('Standard PC target', 4, 8, 2, 30);
const mainstreamRequirement = requirement('Mainstream PC target', 4, 8, 3, 50);
const performanceRequirement = requirement('Performance PC target', 6, 16, 3, 80);
const highEndRequirement = requirement('High-end PC target', 6, 16, 4, 100);
const demandingRequirement = requirement('Very demanding PC target', 8, 16, 5, 120);

export function getEstimatedPcRequirement(game: Game): PcRequirement {
  if (titleMatches(game.title, [
    'Alan Wake 2',
    'Cyberpunk 2077',
    'Final Fantasy XVI',
    'Horizon Forbidden West',
    'Ratchet & Clank: Rift Apart',
    'Returnal',
    'The Last of Us Part I',
  ])) {
    return demandingRequirement;
  }

  if (titleMatches(game.title, [
    'Control',
    'Dead Space Remake',
    'Doom Eternal',
    'Dying Light 2',
    'Ghost of Tsushima',
    'God of War',
    'Red Dead Redemption 2',
    'Resident Evil 4 Remake',
    'Spider-Man Remastered',
    'Spider-Man: Miles Morales',
  ])) {
    return highEndRequirement;
  }

  if (titleMatches(game.title, [
    'Apex Legends',
    'Assassin',
    'Battlefield 1',
    'Battlefield 4',
    'Deathloop',
    'Diablo IV',
    'Elden Ring',
    'Fallout 4',
    'Horizon Zero Dawn',
    'Resident Evil 2 Remake',
    'Resident Evil 3 Remake',
    'Resident Evil 7',
    'Resident Evil Village',
    'The Witcher 3',
  ])) {
    return performanceRequirement;
  }

  if (titleMatches(game.title, [
    'Counter-Strike 2',
    'Devil May Cry 5',
    'Grand Theft Auto V',
    'Monster Hunter',
    'Overwatch 2',
    'Rainbow Six Siege',
    'Sekiro',
    'Titanfall 2',
    'Valorant',
  ])) {
    return mainstreamRequirement;
  }

  if (hasAnyGenre(game, ['Indie', 'Puzzle', 'Platformer'])) return lightRequirement;
  if (hasAnyGenre(game, ['Strategy', 'Simulation', 'MMO', 'Open World', 'Shooter'])) return mainstreamRequirement;
  if (hasAnyGenre(game, ['Action', 'RPG', 'Horror', 'Survival'])) return standardRequirement;

  return standardRequirement;
}

function getWebGlRenderer() {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
    if (!gl) return '';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return '';

    return String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '');
  } catch {
    return '';
  }
}

export function inferGpuTier(renderer: string) {
  const score = inferGpuScore(renderer);
  if (score >= 82) return 5;
  if (score >= 60) return 4;
  if (score >= 42) return 3;
  if (score >= 25) return 2;
  return 1;
}

function nvidiaGpuScore(value: string) {
  const match = value.match(/\b(rtx|gtx)\s*-?\s*(\d{3,4})(?:\s*(ti|super))?\b/);
  if (!match) return 0;

  const family = match[1];
  const model = Number(match[2]);
  const suffixBonus = match[3] ? 4 : 0;

  if (family === 'rtx') {
    const series = Math.floor(model / 1000);
    const classNumber = model % 100;

    if (series >= 5) {
      if (classNumber >= 90) return 100;
      if (classNumber >= 80) return 96 + suffixBonus;
      if (classNumber >= 70) return 86 + suffixBonus;
      if (classNumber >= 60) return 72 + suffixBonus;
      return 58 + suffixBonus;
    }

    if (series === 4) {
      if (classNumber >= 90) return 100;
      if (classNumber >= 80) return 92 + suffixBonus;
      if (classNumber >= 70) return 80 + suffixBonus;
      if (classNumber >= 60) return 64 + suffixBonus;
      return 52 + suffixBonus;
    }

    if (series === 3) {
      if (classNumber >= 90) return 88 + suffixBonus;
      if (classNumber >= 80) return 80 + suffixBonus;
      if (classNumber >= 70) return 70 + suffixBonus;
      if (classNumber >= 60) return 56 + suffixBonus;
      return 42 + suffixBonus;
    }

    if (series === 2) {
      if (classNumber >= 80) return 68 + suffixBonus;
      if (classNumber >= 70) return 62 + suffixBonus;
      if (classNumber >= 60) return 52 + suffixBonus;
      return 40 + suffixBonus;
    }
  }

  if (family === 'gtx') {
    if (model >= 1660) return 46 + suffixBonus;
    const classNumber = model % 100;
    if (classNumber >= 80) return 56 + suffixBonus;
    if (classNumber >= 70) return 50 + suffixBonus;
    if (classNumber >= 60) return 43 + suffixBonus;
    if (classNumber >= 50) return 34 + suffixBonus;
    return 26 + suffixBonus;
  }

  return 0;
}

function amdGpuScore(value: string) {
  const match = value.match(/\brx\s*-?\s*(\d{3,4})(?:\s*(xtx|xt))?\b/);
  if (!match) return 0;

  const model = Number(match[1]);
  const suffixBonus = match[2] ? 4 : 0;

  if (model >= 9000) {
    const classNumber = Math.floor((model % 1000) / 100);
    if (classNumber >= 9) return 98 + suffixBonus;
    if (classNumber >= 8) return 88 + suffixBonus;
    if (classNumber >= 7) return 76 + suffixBonus;
    return 62 + suffixBonus;
  }

  if (model >= 7000) {
    const classNumber = Math.floor((model % 1000) / 100);
    if (classNumber >= 9) return 92 + suffixBonus;
    if (classNumber >= 8) return 80 + suffixBonus;
    if (classNumber >= 7) return 70 + suffixBonus;
    return 58 + suffixBonus;
  }

  if (model >= 6000) {
    const classNumber = Math.floor((model % 1000) / 100);
    if (classNumber >= 9) return 82 + suffixBonus;
    if (classNumber >= 8) return 76 + suffixBonus;
    if (classNumber >= 7) return 64 + suffixBonus;
    if (classNumber >= 6) return 54 + suffixBonus;
    return 40 + suffixBonus;
  }

  if (model >= 5000) {
    const classNumber = Math.floor((model % 1000) / 100);
    if (classNumber >= 7) return 54 + suffixBonus;
    if (classNumber >= 6) return 44 + suffixBonus;
    return 34 + suffixBonus;
  }

  if (model >= 590) return 40;
  if (model >= 580) return 38;
  if (model >= 570) return 34;
  if (model >= 560) return 30;

  return 0;
}

function intelGpuScore(value: string) {
  if (/\barc\s*-?\s*(a770|b770)\b/.test(value)) return 58;
  if (/\barc\s*-?\s*(a750|b750)\b/.test(value)) return 52;
  if (/\barc\s*-?\s*(a580|b580)\b/.test(value)) return 46;
  if (/\barc\s*-?\s*(a380|b380|a310|b310)\b/.test(value)) return 34;
  if (/iris\s?xe|radeon graphics|vega/.test(value)) return 32;
  if (/intel|uhd|hd graphics|integrated|microsoft basic render/.test(value)) return 24;
  return 0;
}

function appleGpuScore(value: string) {
  if (/apple\s?m[1-9]\s?(ultra|max)/.test(value)) return 72;
  if (/apple\s?m[1-9]\s?pro/.test(value)) return 58;
  if (/apple\s?m[1-9]|apple gpu/.test(value)) return 42;
  return 0;
}

export function inferGpuScore(renderer: string) {
  const value = renderer.toLowerCase();
  if (!value || /browser hidden gpu|unknown|gpu target/.test(value)) return GPU_TIER_SCORES[2];

  return Math.max(
    nvidiaGpuScore(value),
    amdGpuScore(value),
    intelGpuScore(value),
    appleGpuScore(value),
    GPU_TIER_SCORES[3]
  );
}

const clampNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export function normalizeSystemProfile(profile: Partial<SystemProfile>): SystemProfile {
  const ownedPlatforms = new Set<OwnedPlatform>(['PC']);
  (profile.ownedPlatforms || []).forEach(platform => {
    if (PLATFORM_ORDER.includes(platform)) ownedPlatforms.add(platform);
  });

  const storageGb = Number(profile.storageGb);
  const cpuCores = clampNumber(profile.cpuCores, 4, 1, 128);

  return {
    os: String(profile.os || 'Unknown OS'),
    cpuLabel: typeof profile.cpuLabel === 'string' ? profile.cpuLabel : `${cpuCores}-core CPU`,
    cpuCores,
    memoryGb: clampNumber(profile.memoryGb, 8, 1, 512),
    gpuTier: clampNumber(profile.gpuTier, 2, 1, 5),
    gpuLabel: typeof profile.gpuLabel === 'string' ? profile.gpuLabel : 'Browser hidden GPU',
    storageGb: Number.isFinite(storageGb) && storageGb > 0 ? storageGb : undefined,
    ownedPlatforms: [...ownedPlatforms],
  };
}

export function detectSystemProfile(): SystemProfile {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    userAgentData?: { platform?: string };
  };
  const gpuLabel = getWebGlRenderer() || 'Browser hidden GPU';

  return normalizeSystemProfile({
    os: nav.userAgentData?.platform || nav.platform || 'Unknown OS',
    cpuLabel: `${nav.hardwareConcurrency || 4}-core browser CPU`,
    cpuCores: nav.hardwareConcurrency || 4,
    memoryGb: nav.deviceMemory || 8,
    gpuTier: inferGpuTier(gpuLabel),
    gpuLabel,
    ownedPlatforms: ['PC'],
  });
}

export function loadStoredSystemProfile() {
  try {
    const stored = localStorage.getItem(SYSTEM_PROFILE_STORAGE_KEY);
    return stored ? normalizeSystemProfile(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function saveSystemProfile(profile: SystemProfile) {
  localStorage.setItem(SYSTEM_PROFILE_STORAGE_KEY, JSON.stringify(normalizeSystemProfile(profile)));
}

export function getAvailablePlatforms(game: Game) {
  const rawPlatforms = parseJsonList(game.platforms);
  const available = new Set<OwnedPlatform>();

  rawPlatforms.forEach(platform => {
    if (PLATFORM_ORDER.includes(platform as OwnedPlatform)) {
      available.add(platform as OwnedPlatform);
    }
  });

  if (available.size === 0 && rawPlatforms.length === 0) available.add('PC');
  return available;
}

export function evaluateCompatibility(game: Game, profile: SystemProfile): CompatibilityResult {
  const normalizedProfile = normalizeSystemProfile(profile);
  const requirement = getEstimatedPcRequirement(game);
  const availablePlatforms = getAvailablePlatforms(game);
  const pcAvailable = availablePlatforms.has('PC');
  const ownedPlatforms = new Set(normalizedProfile.ownedPlatforms);
  const ownedPlayableConsoles = PLATFORM_ORDER.filter(platform =>
    platform !== 'PC' && availablePlatforms.has(platform) && ownedPlatforms.has(platform)
  );

  const platformFits: PlatformFit[] = PLATFORM_ORDER.map(platform => {
    const available = availablePlatforms.has(platform);
    const owned = ownedPlatforms.has(platform);
    return {
      platform,
      available,
      owned,
      note: available
        ? owned
          ? 'Ready in your setup'
          : 'Available platform'
        : 'Not listed for this game',
    };
  });

  const deficits: string[] = [];
  const positives: string[] = [];

  const compare = (name: string, actual: number | undefined, required: number, suffix = '') => {
    if (!actual) return;
    if (actual < required) {
      deficits.push(`${name}: ${actual}${suffix} available, ${required}${suffix} suggested`);
    } else {
      positives.push(`${name} meets the estimate`);
    }
  };

  compare('CPU cores', normalizedProfile.cpuCores, requirement.minCpuCores);
  compare('Memory', normalizedProfile.memoryGb, requirement.minMemoryGb, ' GB');
  compare('GPU tier', normalizedProfile.gpuTier, requirement.minGpuTier);
  compare('Free storage', normalizedProfile.storageGb, requirement.storageGb, ' GB');

  if (!normalizedProfile.storageGb) {
    positives.push('Storage is not checked until free space is entered');
  }

  if (!pcAvailable) {
    const consoleList = [...availablePlatforms].filter(platform => platform !== 'PC').join(', ');
    if (ownedPlayableConsoles.length > 0) {
      const ownedList = ownedPlayableConsoles.join(', ');
      return {
        status: 'console-ready',
        label: 'Console ready',
        summary: `PC version is not listed, but it fits your ${ownedList} setup.`,
        requirement,
        deficits: [],
        positives,
        platformFits,
        pcAvailable,
      };
    }

    return {
      status: 'console-only',
      label: 'No PC version listed',
      summary: consoleList
        ? `This catalog entry points to ${consoleList}; PC specs do not decide this one.`
        : 'No supported platform is listed for this game yet.',
      requirement,
      deficits: [],
      positives,
      platformFits,
      pcAvailable,
    };
  }

  const severeGpuGap = normalizedProfile.gpuTier <= requirement.minGpuTier - 2;
  const severeMemoryGap = normalizedProfile.memoryGb < requirement.minMemoryGb * 0.75;
  const severeCpuGap = normalizedProfile.cpuCores < Math.ceil(requirement.minCpuCores / 2);
  const storageGap = Boolean(normalizedProfile.storageGb && normalizedProfile.storageGb < requirement.storageGb);
  const hasConsoleFallback = ownedPlayableConsoles.length > 0;

  if (deficits.length === 0) {
    const strongHeadroom =
      normalizedProfile.gpuTier > requirement.minGpuTier ||
      normalizedProfile.memoryGb >= requirement.minMemoryGb + 8;

    return {
      status: strongHeadroom ? 'great' : 'playable',
      label: strongHeadroom ? 'Great fit' : 'Playable',
      summary: strongHeadroom
        ? 'Your PC is comfortably above the estimated target.'
        : 'Your PC meets the estimated target.',
      requirement,
      deficits,
      positives,
      platformFits,
      pcAvailable,
    };
  }

  if (severeGpuGap || severeMemoryGap || severeCpuGap || storageGap || deficits.length >= 3) {
    return {
      status: 'blocked',
      label: 'Below PC target',
      summary: hasConsoleFallback
        ? `PC looks under the estimate; your ${ownedPlayableConsoles.join(', ')} option is safer.`
        : 'PC looks under the estimated target for a smooth experience.',
      requirement,
      deficits,
      positives,
      platformFits,
      pcAvailable,
    };
  }

  return {
    status: 'limited',
    label: 'Close call',
    summary: hasConsoleFallback
      ? `PC is close to the target; ${ownedPlayableConsoles.join(', ')} is also available in your setup.`
      : 'PC is close to the target, but one area may need lower settings.',
    requirement,
    deficits,
    positives,
    platformFits,
    pcAvailable,
  };
}
