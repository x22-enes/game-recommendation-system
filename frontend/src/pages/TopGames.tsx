import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../api';
import { CoverArt, Game, gameBlurb, parseGenres, parsePlatforms } from '../utils/games';

type RankedGameItem = {
    rank: number;
    score: number | null;
    source: string;
    note?: string;
    referenceTitle?: string;
    game: Game;
};

type TopGamesResponse = {
    limit?: number;
    worldTop: RankedGameItem[];
    trendingTop: RankedGameItem[];
};

type Mode = 'world' | 'trending';
type RankingLimit = 25 | 50 | 100;

const modeFromParam = (value: string | null): Mode => value === 'trending' ? 'trending' : 'world';

const scoreTone = (score?: number | null, mode: Mode = 'world') => {
    if (mode === 'trending') return 'border-emerald-400/25 bg-emerald-400/12 text-emerald-100';
    if (!score) return 'border-slate-500/30 bg-slate-700/40 text-slate-200';
    if (score >= 97) return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100';
    if (score >= 95) return 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100';
    if (score >= 90) return 'border-amber-400/30 bg-amber-400/15 text-amber-100';
    return 'border-slate-500/30 bg-slate-700/40 text-slate-200';
};

const formatTrendScore = (score?: number | null) => {
    if (!score) return '-';
    if (score >= 1_000_000) return `${(score / 1_000_000).toFixed(1)}M`;
    if (score >= 1_000) return `${Math.round(score / 1_000)}K`;
    return String(score);
};

function rankClass(rank: number) {
    if (rank === 1) return 'leaderboard-rank-gold';
    if (rank === 2) return 'leaderboard-rank-silver';
    if (rank === 3) return 'leaderboard-rank-bronze';
    return '';
}

function TopRow({ item, mode }: { item: RankedGameItem; mode: Mode }) {
    const genres = parseGenres(item.game.genres).slice(0, 3);
    const platforms = parsePlatforms(item.game.platforms).slice(0, 3);
    const isTrending = mode === 'trending';
    const description = gameBlurb(item.game, 'Open the game profile to compare details, price offers, platforms, and community rating.');

    return (
        <Link to={`/games/${item.game.id}`} className="leaderboard-row group">
            <div className={`leaderboard-rank ${rankClass(item.rank)} ${item.rank <= 3 ? 'text-xl' : ''}`}>
                {item.rank}
            </div>
            <div className="card-image-wrap overflow-hidden rounded-lg border border-white/[0.06] bg-slate-950">
                <CoverArt game={item.game} className="h-32 w-full transition-transform duration-500 group-hover:scale-[1.03] md:h-28" />
            </div>
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="line-clamp-2 text-lg font-black leading-tight text-white transition-colors group-hover:text-cyan-100 sm:text-xl">
                        {item.game.title}
                    </h2>
                    {item.referenceTitle && item.referenceTitle !== item.game.title && (
                        <span className="chip">Matched: {item.referenceTitle}</span>
                    )}
                </div>
                <p className="mt-1.5 line-clamp-1 text-sm text-slate-500">
                    {genres.join(', ') || 'Adventure'}
                </p>
                <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-400">
                    {description}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {platforms.map(platform => (
                        <span key={platform} className="platform-badge">{platform}</span>
                    ))}
                    <span className="chip">{item.source}</span>
                </div>
            </div>
            <div className={`min-w-[6rem] rounded-xl border px-4 py-3 text-center ${scoreTone(item.score, mode)}`}>
                <div className="text-2xl font-black">
                    {isTrending ? formatTrendScore(item.score) : item.score ?? '-'}
                </div>
                <div className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wide opacity-80">
                    {isTrending ? 'Peak today' : 'Meta'}
                </div>
            </div>
        </Link>
    );
}

export default function TopGames() {
    const [searchParams, setSearchParams] = useSearchParams();
    const [data, setData] = useState<TopGamesResponse>({ worldTop: [], trendingTop: [] });
    const [mode, setMode] = useState<Mode>(() => modeFromParam(searchParams.get('mode')));
    const [limit, setLimit] = useState<RankingLimit>(25);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        setMode(modeFromParam(searchParams.get('mode')));
    }, [searchParams]);

    useEffect(() => {
        const fetchTopGames = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await api.get(`/top-games?limit=${limit}`);
                setData(res.data);
            } catch {
                setError('Could not load rankings. Please check that the backend is running.');
            } finally {
                setLoading(false);
            }
        };

        fetchTopGames();
    }, [limit]);

    const activeItems = useMemo(
        () => (mode === 'world' ? data.worldTop : data.trendingTop),
        [data, mode]
    );

    const handleModeChange = (nextMode: Mode) => {
        const next = new URLSearchParams(searchParams);
        if (nextMode === 'trending') next.set('mode', 'trending');
        else next.delete('mode');
        setSearchParams(next, { replace: true });
        setMode(nextMode);
    };

    const headlineStats = [
        { label: 'World ranked', value: data.worldTop.length },
        { label: 'Trending matched', value: data.trendingTop.length },
        { label: mode === 'trending' ? 'Top peak' : 'Top score', value: mode === 'trending' ? formatTrendScore(activeItems[0]?.score) : activeItems[0]?.score ?? '-' },
    ];

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Leaderboards</p>
                    <h1 className="section-title">{mode === 'trending' ? 'Trending Games' : 'Top Games'}</h1>
                    <p className="section-copy">
                        {mode === 'trending'
                            ? 'Games currently pulling the strongest live player attention, matched into this catalog.'
                            : 'A world-ranking style board based on all-time critic reputation, matched into this catalog.'}
                    </p>
                </div>
                <div className="grid w-full grid-cols-3 gap-3 md:w-auto">
                    {headlineStats.map(stat => (
                        <div key={stat.label} className="stat-tile text-center">
                            <div className="text-2xl font-black text-white">{stat.value}</div>
                            <div className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">{stat.label}</div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="surface mb-6 grid gap-3 rounded-xl p-3 sm:p-4 lg:grid-cols-[1fr_auto]">
                <div className="grid gap-2 sm:grid-cols-2">
                    <button
                        className={mode === 'world' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => handleModeChange('world')}
                    >
                        World Ranking
                    </button>
                    <button
                        className={mode === 'trending' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => handleModeChange('trending')}
                    >
                        Trending Now
                    </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {([25, 50, 100] as RankingLimit[]).map(item => (
                        <button
                            key={item}
                            className={limit === item ? 'btn-primary px-3 py-2 text-xs sm:text-sm' : 'btn-secondary px-3 py-2 text-xs sm:text-sm'}
                            onClick={() => setLimit(item)}
                        >
                            Top {item}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6 rounded-xl border border-white/[0.08] bg-slate-950/40 p-4 text-sm leading-6 text-slate-400">
                Sources: World Ranking uses Metacritic all-time game ordering. Trending Now uses Steam current-player/peak-today signals from Steam and SteamDB. Games are displayed only when a matching title exists in this catalog.
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
            )}

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4].map(item => (
                        <div key={item} className="skeleton h-36 sm:h-28" />
                    ))}
                </div>
            ) : activeItems.length === 0 ? (
                <div className="empty-state">
                    <h2 className="text-2xl font-black text-white">No matches yet</h2>
                    <p className="mt-2 text-slate-400">The ranking source loaded, but none of those titles matched the current catalog.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {activeItems.map(item => (
                        <TopRow key={`${mode}-${item.game.id}-${item.rank}`} item={item} mode={mode} />
                    ))}
                </div>
            )}
        </div>
    );
}
