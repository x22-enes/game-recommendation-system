import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { CoverArt, Game, gameBlurb, MmmScoreStrip, parseGenres, parsePlatforms, PlatformBadges, PriceBadge } from '../utils/games';

const DEFAULT_GENRE_OPTIONS = [
    'All',
    'Action',
    'Adventure',
    'RPG',
    'Open World',
    'Survival',
    'Shooter',
    'Horror',
    'Strategy',
    'Simulation',
    'Puzzle',
    'Platformer',
    'Racing',
    'Sports',
];

const BROWSE_CACHE_VERSION = 'v2';

const browseCacheKey = (search: string, genre: string, platform: string) =>
    `browse:${BROWSE_CACHE_VERSION}:${search.trim().toLowerCase() || 'all'}:${genre}:${platform}`;

function CompactSearchResult({ game }: { game: Game }) {
    const platforms = parsePlatforms(game.platforms);
    const genres = parseGenres(game.genres);
    const description = gameBlurb(game, 'Open the game profile to view details, store pricing, platforms, and community activity.');

    return (
        <Link
            to={`/games/${game.id}`}
            className="group grid grid-cols-[8.5rem_1fr] overflow-hidden rounded-xl border border-white/[0.08] bg-slate-900/60 transition-all duration-300 hover:-translate-y-0.5 hover:border-cyan-400/25 hover:shadow-card-hover"
        >
            <CoverArt game={game} className="h-24 w-full bg-slate-950" />
            <div className="flex min-w-0 flex-col justify-center gap-2 px-4 py-3">
                <h3 className="truncate text-base font-bold text-white group-hover:text-cyan-200">{game.title}</h3>
                <p className="line-clamp-1 text-xs text-slate-500">{genres.join(', ') || 'Adventure'}</p>
                <p className="line-clamp-1 text-xs leading-5 text-slate-400">{description}</p>
                <MmmScoreStrip game={game} compact />
                <div className="flex flex-wrap items-center gap-2">
                    <PlatformBadges platforms={platforms} limit={3} />
                    <PriceBadge game={game} />
                </div>
            </div>
        </Link>
    );
}

function GameMarketCard({ game, index = 0 }: { game: Game; index?: number }) {
    const genres = parseGenres(game.genres);
    const platforms = parsePlatforms(game.platforms);
    const stagger = Math.min(index % 6, 5);
    const description = gameBlurb(game, 'Explore details, platform availability, price signals, and recommendation context for this game.');

    return (
        <Link
            to={`/games/${game.id}`}
            className={`market-card group flex h-full flex-col animate-fade-in-up stagger-${stagger + 1}`}
            style={{ opacity: 0 }}
        >
            <div className="card-image-wrap">
                <CoverArt game={game} className="market-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]" />
                <div className="absolute left-2.5 top-2.5 z-10">
                    <PlatformBadges platforms={platforms} limit={2} />
                </div>
                <div className="absolute bottom-2.5 right-2.5 z-10">
                    <PriceBadge game={game} />
                </div>
            </div>
            <div className="flex flex-1 flex-col p-4">
                <h3 className="line-clamp-2 min-h-[2.75rem] text-base font-bold leading-snug text-white transition-colors group-hover:text-cyan-100">
                    {game.title}
                </h3>
                <p className="mt-1.5 line-clamp-1 text-sm text-slate-500">
                    {genres.join(', ') || 'Adventure'}
                </p>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-400">
                    {description}
                </p>
                <div className="mt-3">
                    <MmmScoreStrip game={game} />
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-white/[0.06] pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">View details</span>
                    <span className="text-sm text-cyan-400 opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" aria-hidden>→</span>
                </div>
            </div>
        </Link>
    );
}

function GenreIcon({ genre }: { genre: string }) {
    const normalized = genre.toLowerCase();
    const commonProps = {
        className: 'h-4 w-4',
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
        'aria-hidden': true,
    };

    if (normalized === 'all') {
        return (
            <svg {...commonProps}>
                <rect x="4" y="4" width="6" height="6" rx="1.5" />
                <rect x="14" y="4" width="6" height="6" rx="1.5" />
                <rect x="4" y="14" width="6" height="6" rx="1.5" />
                <rect x="14" y="14" width="6" height="6" rx="1.5" />
            </svg>
        );
    }
    if (normalized.includes('action')) return <svg {...commonProps}><path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z" /></svg>;
    if (normalized.includes('adventure') || normalized.includes('open world')) return <svg {...commonProps}><circle cx="12" cy="12" r="9" /><path d="m15 9-2 5-5 2 2-5 5-2Z" /></svg>;
    if (normalized.includes('rpg')) return <svg {...commonProps}><path d="M12 3 5 6v5c0 4.2 2.8 7.7 7 10 4.2-2.3 7-5.8 7-10V6l-7-3Z" /><path d="M12 8v7" /><path d="M9 11h6" /></svg>;
    if (normalized.includes('survival')) return <svg {...commonProps}><path d="M12 3 4 20h16L12 3Z" /><path d="M12 9v4" /><path d="M9.5 15h5" /></svg>;
    if (normalized.includes('shooter')) return <svg {...commonProps}><circle cx="12" cy="12" r="7" /><path d="M12 2v4" /><path d="M12 18v4" /><path d="M2 12h4" /><path d="M18 12h4" /><circle cx="12" cy="12" r="1.5" /></svg>;
    if (normalized.includes('horror')) return <svg {...commonProps}><path d="M12 3c4 0 7 3 7 7v7l-2-1.5L15 17l-3-2-3 2-2-1.5L5 17v-7c0-4 3-7 7-7Z" /><path d="M9 10h.01" /><path d="M15 10h.01" /></svg>;
    if (normalized.includes('strategy')) return <svg {...commonProps}><path d="M6 20h12" /><path d="M8 16h8" /><path d="M12 4l4 5-4 3-4-3 4-5Z" /><path d="M10 12v4" /><path d="M14 12v4" /></svg>;
    if (normalized.includes('simulation')) return <svg {...commonProps}><circle cx="12" cy="12" r="3" /><path d="M19 12h2" /><path d="M3 12h2" /><path d="m17 7 1.5-1.5" /><path d="m5.5 18.5 1.5-1.5" /><path d="M12 3v2" /><path d="M12 19v2" /><path d="m17 17 1.5 1.5" /><path d="M5.5 5.5 7 7" /></svg>;
    if (normalized.includes('puzzle')) return <svg {...commonProps}><path d="M8 4h5v4h4v5h-4v7H4v-7h4V9H4V4h4Z" /></svg>;
    if (normalized.includes('platformer')) return <svg {...commonProps}><path d="M4 18h16" /><path d="M5 13h6" /><path d="M13 8h6" /><path d="M8 13v5" /><path d="M16 8v10" /></svg>;
    if (normalized.includes('racing') || normalized.includes('sports')) return <svg {...commonProps}><path d="M4 14c2-5 4-7 8-7s6 2 8 7" /><path d="M7 14h10" /><path d="M12 14l4-4" /><path d="M5 18h14" /></svg>;
    if (normalized.includes('arcade')) return <svg {...commonProps}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M9 13h4" /><path d="M11 11v4" /><path d="M16 11h.01" /><path d="M16 15h.01" /></svg>;
    if (normalized.includes('casual')) return <svg {...commonProps}><circle cx="12" cy="12" r="8" /><path d="M8.5 10h.01" /><path d="M15.5 10h.01" /><path d="M8.5 14c1.5 2 5.5 2 7 0" /></svg>;
    if (normalized.includes('co-op') || normalized.includes('multiplayer') || normalized.includes('mmo') || normalized.includes('moba')) return <svg {...commonProps}><circle cx="8" cy="8" r="3" /><circle cx="16" cy="8" r="3" /><path d="M3 20c.8-3 2.5-5 5-5s4.2 2 5 5" /><path d="M11 20c.8-3 2.5-5 5-5 2.2 0 3.8 1.5 4.7 4" /></svg>;
    if (normalized.includes('fighting') || normalized.includes('hack')) return <svg {...commonProps}><path d="M6 15 15 6" /><path d="M14 5l5 5" /><path d="M4 20l4-1 10-10-3-3L5 16l-1 4Z" /></svg>;
    if (normalized.includes('music')) return <svg {...commonProps}><path d="M9 18V5l10-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></svg>;
    if (normalized.includes('mystery') || normalized.includes('stealth')) return <svg {...commonProps}><path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6Z" /><circle cx="12" cy="12" r="2.5" /></svg>;
    if (normalized.includes('visual novel')) return <svg {...commonProps}><path d="M5 5h14v14H5z" /><path d="M8 9h8" /><path d="M8 13h5" /><path d="M8 17h7" /></svg>;
    if (normalized.includes('vr')) return <svg {...commonProps}><path d="M5 9h14l1 3v5H4v-5l1-3Z" /><path d="M9 14h.01" /><path d="M15 14h.01" /></svg>;

    return <span className="text-xs font-black">{genre.slice(0, 1).toUpperCase()}</span>;
}

function GenrePanel({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (genre: string) => void;
    options: string[];
}) {
    return (
        <section className="surface rounded-xl p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                    <p className="eyebrow">Genres</p>
                    <h2 className="mt-1 text-lg font-black text-white">Browse categories</h2>
                </div>
                {value !== 'All' && (
                    <button type="button" className="btn-secondary shrink-0 px-3 py-2 text-xs" onClick={() => onChange('All')}>
                        Clear
                    </button>
                )}
            </div>
            <div className="mb-3 grid gap-2 border-b border-white/[0.06] pb-3">
                <Link
                    to="/top-games"
                    className="flex items-center gap-3 rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2.5 text-sm font-black text-amber-100 transition-all duration-200 hover:border-amber-300/35 hover:bg-amber-400/15"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-300/25 bg-black/25 text-xs">#</span>
                    <span>Top Games</span>
                </Link>
                <Link
                    to="/top-games?mode=trending"
                    className="flex items-center gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2.5 text-sm font-black text-emerald-100 transition-all duration-200 hover:border-emerald-300/35 hover:bg-emerald-400/15"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-300/25 bg-black/25 text-xs">UP</span>
                    <span>Trending Games</span>
                </Link>
            </div>
            <div className="max-h-[28rem] space-y-1 overflow-y-auto pr-1">
                {options.map(genre => (
                    <button
                        key={genre}
                        type="button"
                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold transition-all duration-200 ${
                            value === genre
                                ? 'bg-cyan-400/15 text-cyan-100 shadow-[inset_3px_0_0_0_rgba(34,211,238,0.9)]'
                                : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                        onClick={() => onChange(genre)}
                    >
                        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-black ${
                            value === genre
                                ? 'border-cyan-400/35 bg-cyan-400/20 text-cyan-100'
                                : 'border-white/10 bg-slate-950/50 text-slate-400'
                        }`}>
                            <GenreIcon genre={genre} />
                        </span>
                        <span className="truncate">{genre}</span>
                    </button>
                ))}
            </div>
        </section>
    );
}

export default function Home() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [games, setGames] = useState<Game[]>([]);
    const [search, setSearch] = useState(() => searchParams.get('search') || '');
    const [genre, setGenre] = useState(() => searchParams.get('genre') || 'All');
    const [platform, setPlatform] = useState(() => searchParams.get('platform') || 'All');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [shuffleKey, setShuffleKey] = useState(0);
    const [shuffling, setShuffling] = useState(false);
    const [genreOptions, setGenreOptions] = useState(DEFAULT_GENRE_OPTIONS);

    useEffect(() => {
        const nextSearch = searchParams.get('search') || '';
        const nextGenre = searchParams.get('genre') || 'All';
        const nextPlatform = searchParams.get('platform') || 'All';

        setSearch(current => current === nextSearch ? current : nextSearch);
        setGenre(current => current === nextGenre ? current : nextGenre);
        setPlatform(current => current === nextPlatform ? current : nextPlatform);
    }, [searchParams]);

    const updateBrowseParams = (updates: { search?: string; genre?: string; platform?: string }) => {
        const next = new URLSearchParams(searchParams);

        const nextSearch = updates.search ?? search;
        const nextGenre = updates.genre ?? genre;
        const nextPlatform = updates.platform ?? platform;

        if (nextSearch.trim()) next.set('search', nextSearch.trim());
        else next.delete('search');

        if (nextGenre !== 'All') next.set('genre', nextGenre);
        else next.delete('genre');

        if (nextPlatform !== 'All') next.set('platform', nextPlatform);
        else next.delete('platform');

        setSearchParams(next, { replace: true });
    };

    const handleSearchChange = (value: string) => {
        setSearch(value);
        setShuffleKey(0);
        updateBrowseParams({ search: value });
    };

    const handleGenreChange = (value: string) => {
        setGenre(value);
        setShuffleKey(0);
        updateBrowseParams({ genre: value });
    };

    const handlePlatformChange = (value: string) => {
        setPlatform(value);
        setShuffleKey(0);
        updateBrowseParams({ platform: value });
    };

    useEffect(() => {
        api.get('/genres')
            .then(res => {
                const genres = Array.isArray(res.data) ? res.data.filter(Boolean) : [];
                setGenreOptions(['All', ...genres.filter(item => item !== 'All')]);
            })
            .catch(() => setGenreOptions(DEFAULT_GENRE_OPTIONS));
    }, []);

    useEffect(() => {
        const fetchGames = async () => {
            const cacheKey = browseCacheKey(search, genre, platform);
            if (shuffleKey === 0) {
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    try {
                        const cachedGames = JSON.parse(cached);
                        if (Array.isArray(cachedGames)) {
                            setGames(cachedGames);
                            setLoading(false);
                            setShuffling(false);
                            return;
                        }
                    } catch {
                        sessionStorage.removeItem(cacheKey);
                    }
                }
            }

            try {
                setLoading(true);
                setError('');
                const params = new URLSearchParams();
                if (search.trim()) params.set('search', search.trim());
                if (genre !== 'All') params.set('genre', genre);
                if (platform !== 'All') params.set('platform', platform);
                if (shuffleKey > 0 && !search.trim()) params.set('shuffle', '1');
                const query = params.toString();
                const url = query ? `/games?${query}` : '/games';
                const res = await api.get(url);
                setGames(res.data);
                sessionStorage.setItem(cacheKey, JSON.stringify(res.data));
            } catch {
                setError('Could not load games. Please check that the backend is running.');
            } finally {
                setLoading(false);
                setShuffling(false);
            }
        };
        const timeoutId = setTimeout(fetchGames, 300);
        return () => clearTimeout(timeoutId);
    }, [search, genre, platform, shuffleKey]);

    const platforms = useMemo(
        () => ['All', ...Array.from(new Set(games.flatMap(game => parsePlatforms(game.platforms)))).sort()],
        [games]
    );

    const filteredGames = useMemo(() => {
        return games.filter(game => {
            const genreMatch = genre === 'All' || parseGenres(game.genres).includes(genre);
            const platformMatch = platform === 'All' || parsePlatforms(game.platforms).includes(platform);
            return genreMatch && platformMatch;
        });
    }, [games, genre, platform]);

    const compactResults = search.trim() ? filteredGames.slice(0, 6) : [];
    const featuredGame = filteredGames[0];

    const handleShuffle = () => {
        setShuffling(true);
        setShuffleKey(current => current + 1);
    };

    return (
        <div className="page-enter">
            <section className="search-panel mb-6">
                <div className="grid gap-0 lg:grid-cols-[1.25fr_0.75fr]">
                    <div className="p-5 sm:p-6 lg:p-8">
                        <p className="eyebrow">Discover</p>
                        <h1 className="mt-1 text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">
                            MMM Recs Catalog
                        </h1>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400 sm:text-base">
                            Mini, Mid, and Max game recommendations matched by genre, platform, price, and catalog signals.
                        </p>
                        <div className="relative mt-5 max-w-xl">
                            <label className="sidebar-label" htmlFor="catalog-search">Search catalog</label>
                            <div className="relative">
                                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden>
                                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                                        <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                                    </svg>
                                </span>
                                <input
                                    id="catalog-search"
                                    type="text"
                                    placeholder="Search ARK, Elden Ring, Portal..."
                                    className="field h-11 pl-10 text-base"
                                    value={search}
                                    onChange={(e) => handleSearchChange(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <div className="hidden border-l border-white/[0.06] bg-slate-950/30 p-5 lg:block">
                        {featuredGame ? (
                            <Link to={`/games/${featuredGame.id}`} className="group block h-full">
                                <div className="card-image-wrap overflow-hidden rounded-xl border border-white/[0.08]">
                                    <CoverArt game={featuredGame} className="aspect-[16/10] w-full transition-transform duration-500 group-hover:scale-105" />
                                    <div className="featured-overlay" />
                                </div>
                                <div className="mt-3 flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-cyan-400">Featured</p>
                                        <h2 className="mt-0.5 truncate text-lg font-black text-white group-hover:text-cyan-200">{featuredGame.title}</h2>
                                    </div>
                                    <span className="score-pill shrink-0">View</span>
                                </div>
                            </Link>
                        ) : (
                            <div className="skeleton h-full min-h-52 rounded-xl" />
                        )}
                    </div>
                </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[17rem_1fr]">
                <aside className="space-y-4">
                    <GenrePanel value={genre} onChange={handleGenreChange} options={genreOptions} />

                    <div className="surface rounded-xl p-4">
                        <div className="mb-4">
                            <p className="eyebrow">Filters</p>
                            <h2 className="mt-1 text-lg font-black text-white">Refine Browse</h2>
                        </div>
                        <div>
                            <label className="sidebar-label" htmlFor="platform-filter">Platform</label>
                            <select id="platform-filter" className="field" value={platform} onChange={(e) => handlePlatformChange(e.target.value)}>
                                {platforms.map(item => <option key={item} value={item}>{item}</option>)}
                            </select>
                        </div>
                    </div>

                    {!search.trim() && (
                        <button
                            type="button"
                            className={`btn-shuffle w-full ${shuffling ? 'animate-pulse-soft' : ''}`}
                            onClick={handleShuffle}
                            disabled={loading}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${shuffling ? 'animate-spin' : ''}`}>
                                    <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466c-.337.816-1.072 1.466-1.902 1.466H4.5v2.25h1.709c1.702 0 3.219-.843 4.152-2.132a7.462 7.462 0 002.148-4.582 7.462 7.462 0 00-2.148-4.582C9.428 5.843 7.911 5 6.209 5H4.5V7.25h1.709c.83 0 1.565.65 1.902 1.466a5.5 5.5 0 019.201 2.466 5.5 5.5 0 01-9.201 2.466z" clipRule="evenodd" />
                                </svg>
                                {shuffling ? 'Shuffling...' : 'Shuffle catalog'}
                            </span>
                        </button>
                    )}
                </aside>

                <main>
                    <div className="mb-5 flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <p className="eyebrow">{search.trim() ? 'Search' : 'Browse'}</p>
                            <h2 className="text-xl font-black text-white sm:text-2xl">
                                {search.trim()
                                    ? `Results for "${search.trim()}"`
                                    : genre === 'All'
                                        ? 'Random Games'
                                        : `Random ${genre} Games`}
                            </h2>
                        </div>
                        <span className="chip w-fit">{filteredGames.length} matches</span>
                    </div>

                    {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {[1, 2, 3, 4, 5, 6].map((item) => (
                                <div key={item} className="skeleton aspect-[4/3]" />
                            ))}
                        </div>
                    ) : error ? (
                        <div className="empty-state border-red-400/20 bg-red-500/10">
                            <h2 className="text-2xl font-black text-white">Catalog is offline</h2>
                            <p className="mx-auto mt-2 max-w-xl text-slate-300">{error}</p>
                        </div>
                    ) : filteredGames.length === 0 ? (
                        <div className="empty-state">
                            <h2 className="text-2xl font-black text-white">No games found</h2>
                            <p className="mt-2 text-slate-400">Try a different title, genre, or platform.</p>
                        </div>
                    ) : (
                        <>
                            {compactResults.length > 0 && (
                                <section className="mb-6">
                                    <p className="sidebar-label mb-3">Quick matches</p>
                                    <div className="grid gap-3 xl:grid-cols-2">
                                        {compactResults.map(game => <CompactSearchResult key={game.id} game={game} />)}
                                    </div>
                                </section>
                            )}

                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {filteredGames.map((g, i) => <GameMarketCard key={g.id} game={g} index={i} />)}
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
