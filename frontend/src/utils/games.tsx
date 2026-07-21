import { useState } from 'react';

export type Game = {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  genres?: string;
  platforms?: string;
  criticScore?: number | null;
  criticSource?: string | null;
  bestPrice?: {
    price?: number | null;
  } | null;
};

export function parseJsonList(value?: string): string[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

export const parseGenres = parseJsonList;
export const parsePlatforms = parseJsonList;

export function hasCover(game?: Pick<Game, 'coverUrl'> | null): boolean {
  return Boolean(game?.coverUrl && game.coverUrl.startsWith('http'));
}

export function platformShortName(platform: string) {
  if (platform === 'PlayStation') return 'PS';
  if (platform === 'Nintendo') return 'NS';
  if (platform === 'Xbox') return 'XB';
  return platform;
}

export function PlatformBadges({
  platforms,
  limit = 4,
}: {
  platforms: string[];
  limit?: number;
}) {
  const visible = platforms.slice(0, limit);
  const overflow = platforms.length - visible.length;

  if (platforms.length === 0) {
    return <span className="platform-badge">NA</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {visible.map(platform => (
        <span key={platform} className="platform-badge">{platformShortName(platform)}</span>
      ))}
      {overflow > 0 && <span className="platform-badge">+{overflow}</span>}
    </div>
  );
}

export function PriceBadge({ game }: { game: Pick<Game, 'bestPrice'> }) {
  const price = Number(game.bestPrice?.price);
  if (!Number.isFinite(price)) return <span className="chip text-slate-400">Store link</span>;
  if (price <= 0) return <span className="price-badge-free">Free</span>;
  return <span className="price-badge">From ${price.toFixed(2)}</span>;
}

function isGenericImportedDescription(description?: string) {
  return Boolean(
    description &&
    /^Store catalog entry imported from Ephellon\/game-store-catalog/i.test(description.trim())
  );
}

function pickByTitle(title: string, items: string[]) {
  const hash = [...title].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return items[hash % items.length];
}

export function gameBlurb(
  game: Pick<Game, 'title' | 'description' | 'genres' | 'platforms' | 'bestPrice'>,
  fallback = 'Open the game profile to inspect details, platforms, prices, and recommendation signals.'
) {
  const cleanDescription = game.description?.trim();
  if (cleanDescription && !isGenericImportedDescription(cleanDescription)) {
    return cleanDescription;
  }

  const genres = parseGenres(game.genres);
  const platforms = parsePlatforms(game.platforms);
  const primaryGenre = genres[0] || 'game';
  const platformText = platforms.length
    ? `on ${platforms.slice(0, 2).map(platformShortName).join(' and ')}`
    : 'across supported stores';
  const price = Number(game.bestPrice?.price);
  const priceText = Number.isFinite(price)
    ? price <= 0
      ? 'with a free-to-play store signal'
      : `with offers from $${price.toFixed(2)}`
    : 'with store availability to compare';

  const templates = [
    `${game.title} is a ${primaryGenre.toLowerCase()} pick ${platformText}, ${priceText}.`,
    `Explore ${game.title} for its ${primaryGenre.toLowerCase()} style, platform fit, and current store signals.`,
    `A ${primaryGenre.toLowerCase()} catalog entry ready to compare by cover art, platforms, price, and details.`,
    `Open ${game.title} to review genres, supported platforms, community activity, and deal information.`,
  ];

  return pickByTitle(game.title || fallback, templates);
}

export function CoverArt({
  game,
  className = '',
}: {
  game: Pick<Game, 'title' | 'coverUrl' | 'genres'>;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const genres = parseGenres(game.genres);
  const primaryGenre = genres[0] || 'Game';

  if (hasCover(game) && !failed) {
    return (
      <img
        src={game.coverUrl}
        alt={game.title}
        className={`object-cover ${className}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className={`relative flex overflow-hidden bg-slate-900 p-5 text-left ${className}`}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.15),transparent_40%),linear-gradient(145deg,rgba(15,23,42,0.95),rgba(30,41,59,0.98))]" />
      <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full border border-cyan-400/15" />
      <div className="absolute -bottom-12 left-8 h-44 w-44 rotate-12 rounded-2xl border border-white/[0.06]" />
      <div className="relative z-10 flex h-full w-full flex-col justify-between">
        <div className="inline-flex w-fit rounded-full border border-cyan-400/25 bg-cyan-400/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wide text-cyan-200">
          {primaryGenre}
        </div>
        <div>
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">Game Recs</p>
          <h3 className="line-clamp-3 text-xl font-black leading-tight text-white">{game.title}</h3>
        </div>
      </div>
    </div>
  );
}
