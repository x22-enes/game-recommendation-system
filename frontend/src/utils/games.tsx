import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

export type Game = {
  id: string;
  title: string;
  description?: string;
  coverUrl?: string;
  genres?: string;
  platforms?: string;
  criticScore?: number | null;
  criticSource?: string | null;
  ratingSummary?: {
    average?: number | null;
    count?: number | null;
  } | null;
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
  if (!Number.isFinite(price)) {
    return (
      <span className="store-link-badge">
        <ExternalLink className="h-3 w-3" aria-hidden />
        Store link
      </span>
    );
  }
  if (price <= 0) return <span className="price-badge-free">Free</span>;
  return <span className="price-badge">From ${price.toFixed(2)}</span>;
}

const clampScore = (value: number) => Math.max(1, Math.min(99, Math.round(value)));
const clampQualityScore = (value: number) => Math.max(45, Math.min(88, Math.round(value)));

function includesAny(values: string[], needles: string[]) {
  const normalized = values.map(value => value.toLowerCase());
  return needles.some(needle => normalized.some(value => value.includes(needle)));
}

const mmmScoreHelp = {
  Mini: 'Sürətli/yüngül sessiya üçün uyğunluq',
  Mid: 'Balanslaşdırılmış gündəlik seçim',
  Max: 'Dərin, premium, yüksək öhdəlik tələb edən oyun',
};

export function getMmmScores(game: Pick<Game, 'title' | 'genres' | 'platforms' | 'bestPrice' | 'criticScore' | 'ratingSummary'>) {
  const genres = parseGenres(game.genres);
  const platforms = parsePlatforms(game.platforms);
  const price = Number(game.bestPrice?.price);
  const hasPrice = Number.isFinite(price);
  const criticScore = typeof game.criticScore === 'number' ? game.criticScore : NaN;
  const communityScore =
    typeof game.ratingSummary?.average === 'number' && game.ratingSummary.average > 0
      ? game.ratingSummary.average * 20
      : NaN;

  const compactGenres = ['puzzle', 'platformer', 'arcade', 'casual', 'hidden object', 'word', 'card'];
  const deepGenres = ['open world', 'rpg', 'survival', 'strategy', 'simulation', 'mmo'];
  const actionGenres = ['action', 'shooter', 'racing', 'sports', 'fighting'];
  const isCompact = includesAny(genres, compactGenres);
  const isDeep = includesAny(genres, deepGenres);
  const isAction = includesAny(genres, actionGenres);
  const hasPc = platforms.includes('PC');
  const hasManyPlatforms = platforms.length >= 3;
  const hasQualityData = Number.isFinite(criticScore) || Number.isFinite(communityScore);
  const estimatedQualityScore = clampQualityScore(
    62 +
    (isDeep ? 10 : 0) +
    (isAction ? 4 : 0) +
    (isCompact ? 3 : 0) +
    (hasManyPlatforms ? 5 : 0) +
    (hasPc ? 2 : 0) +
    (hasPrice && price >= 30 ? 5 : 0) +
    (hasPrice && price <= 5 ? 2 : 0)
  );
  const qualityScore = Number.isFinite(criticScore)
    ? criticScore
    : Number.isFinite(communityScore)
      ? communityScore
      : estimatedQualityScore;

  const mini = clampScore(
    48 +
    (isCompact ? 18 : 0) +
    (hasPrice && price <= 5 ? 14 : 0) +
    (hasPrice && price === 0 ? 10 : 0) +
    (hasPc ? 7 : 0) +
    (isDeep ? -10 : 0) +
    (qualityScore - 70) * 0.18
  );

  const mid = clampScore(
    54 +
    (hasManyPlatforms ? 10 : 0) +
    (genres.length >= 2 ? 8 : 0) +
    (hasPrice && price > 5 && price <= 25 ? 10 : 0) +
    (isAction ? 5 : 0) +
    Math.abs(qualityScore - 82) * -0.12 +
    (qualityScore - 70) * 0.22
  );

  const max = clampScore(
    46 +
    (isDeep ? 17 : 0) +
    (isAction ? 7 : 0) +
    (qualityScore - 70) * 0.55 +
    (hasPrice && price >= 30 ? 7 : 0) +
    (platforms.length >= 2 ? 5 : 0)
  );

  const best = [
    { key: 'Mini', score: mini, label: mmmScoreHelp.Mini },
    { key: 'Mid', score: mid, label: mmmScoreHelp.Mid },
    { key: 'Max', score: max, label: mmmScoreHelp.Max },
  ].sort((a, b) => b.score - a.score)[0];

  return { mini, mid, max, best, hasQualityData, qualityScore };
}

export function MmmScoreStrip({
  game,
  compact = false,
}: {
  game: Pick<Game, 'title' | 'genres' | 'platforms' | 'bestPrice' | 'criticScore' | 'ratingSummary'>;
  compact?: boolean;
}) {
  const scores = getMmmScores(game);
  const items = [
    { label: 'Mini', value: scores.mini, help: mmmScoreHelp.Mini },
    { label: 'Mid', value: scores.mid, help: mmmScoreHelp.Mid },
    { label: 'Max', value: scores.max, help: mmmScoreHelp.Max },
  ];

  return (
    <div className="mmm-score-wrap">
      <div className={compact ? 'mmm-score-strip mmm-score-strip-compact' : 'mmm-score-strip'}>
        {items.map(item => (
          <span
            key={item.label}
            className={item.label === scores.best.key ? 'mmm-score mmm-score-active' : 'mmm-score'}
            title={item.help}
            aria-label={`${item.label}: ${item.value}. ${item.help}`}
          >
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      {!scores.hasQualityData && (
        <span className="mmm-estimated-badge" title="Critic və community reytinqi yoxdur, bu bal janr/platform/qiymət siqnallarından təxmini hesablanıb.">
          Reytinq məlumatı yoxdur
        </span>
      )}
    </div>
  );
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
        className={`bg-slate-950 object-cover ${className}`}
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
          <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-[0.2em] text-slate-500">MMM Recs</p>
          <h3 className="line-clamp-3 text-xl font-black leading-tight text-white">{game.title}</h3>
        </div>
      </div>
    </div>
  );
}
