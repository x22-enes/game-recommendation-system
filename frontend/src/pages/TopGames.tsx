import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { CoverArt, Game, gameBlurb, parseGenres, parsePlatforms } from '../utils/games';

type CriticTopItem = {
    rank: number;
    score: number | null;
    source: string;
    game: Game;
};

type CommunityTopItem = {
    rank: number;
    score: number;
    averageRating: number;
    ratingCount: number;
    game: Game;
};

type TopGamesResponse = {
    limit?: number;
    criticTop: CriticTopItem[];
    communityTop: CommunityTopItem[];
};

type Mode = 'critic' | 'community';
type RankingLimit = 25 | 50 | 100;

const scoreTone = (score?: number | null) => {
    if (!score) return 'border-slate-500/30 bg-slate-700/40 text-slate-200';
    if (score >= 90) return 'border-emerald-400/30 bg-emerald-400/15 text-emerald-100';
    if (score >= 80) return 'border-cyan-400/30 bg-cyan-400/15 text-cyan-100';
    if (score >= 70) return 'border-amber-400/30 bg-amber-400/15 text-amber-100';
    return 'border-slate-500/30 bg-slate-700/40 text-slate-200';
};

function rankClass(rank: number) {
    if (rank === 1) return 'leaderboard-rank-gold';
    if (rank === 2) return 'leaderboard-rank-silver';
    if (rank === 3) return 'leaderboard-rank-bronze';
    return '';
}

function TopRow({
    item,
    mode,
}: {
    item: CriticTopItem | CommunityTopItem;
    mode: Mode;
}) {
    const genres = parseGenres(item.game.genres).slice(0, 3);
    const platforms = parsePlatforms(item.game.platforms).slice(0, 3);
    const isCommunity = mode === 'community';
    const rating = isCommunity ? (item as CommunityTopItem).averageRating : null;
    const ratingCount = isCommunity ? (item as CommunityTopItem).ratingCount : null;
    const isPodium = item.rank <= 3;
    const description = gameBlurb(item.game, 'Open the game profile to compare details, price offers, platforms, and community rating.');

    return (
        <Link to={`/games/${item.game.id}`} className="leaderboard-row group">
            <div className={`leaderboard-rank ${rankClass(item.rank)} ${isPodium ? 'text-xl' : ''}`}>
                {item.rank}
            </div>
            <div className="card-image-wrap overflow-hidden rounded-lg">
                <CoverArt game={item.game} className="h-36 w-full transition-transform duration-500 group-hover:scale-105 md:h-28 md:w-full" />
            </div>
            <div className="min-w-0">
                <h2 className="line-clamp-2 text-lg font-black leading-tight text-white transition-colors group-hover:text-cyan-100 sm:text-xl">
                    {item.game.title}
                </h2>
                <p className="mt-1.5 line-clamp-1 text-sm text-slate-500">
                    {genres.join(', ') || 'Adventure'}
                </p>
                <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-400">
                    {description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {platforms.map(platform => (
                        <span key={platform} className="platform-badge">{platform}</span>
                    ))}
                </div>
            </div>
            <div className={`min-w-[5.5rem] rounded-xl border px-4 py-3 text-center ${scoreTone(item.score)}`}>
                <div className="text-2xl font-black">{item.score ?? '—'}</div>
                <div className="mt-0.5 text-[0.65rem] font-bold uppercase tracking-wide opacity-80">
                    {isCommunity ? `${rating}/5 · ${ratingCount}` : 'Critic'}
                </div>
            </div>
        </Link>
    );
}

export default function TopGames() {
    const [data, setData] = useState<TopGamesResponse>({ criticTop: [], communityTop: [] });
    const [mode, setMode] = useState<Mode>('critic');
    const [limit, setLimit] = useState<RankingLimit>(25);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTopGames = async () => {
            try {
                setLoading(true);
                setError('');
                const res = await api.get(`/top-games?limit=${limit}`);
                setData(res.data);
            } catch {
                setError('Could not load top games. Please check that the backend is running.');
            } finally {
                setLoading(false);
            }
        };

        fetchTopGames();
    }, [limit]);

    const activeItems = useMemo(
        () => (mode === 'critic' ? data.criticTop : data.communityTop),
        [data, mode]
    );

    const headlineStats = [
        { label: 'Critic ranked', value: data.criticTop.length },
        { label: 'Community ranked', value: data.communityTop.length },
        { label: 'Top score', value: activeItems[0]?.score ?? '—' },
    ];

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Leaderboards</p>
                    <h1 className="section-title">Top Games</h1>
                    <p className="section-copy">
                        Compare games by critic score and by ratings from people using this site.
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
                        className={mode === 'critic' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setMode('critic')}
                    >
                        Critic Top
                    </button>
                    <button
                        className={mode === 'community' ? 'btn-primary' : 'btn-secondary'}
                        onClick={() => setMode('community')}
                    >
                        Community Top
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
                    <h2 className="text-2xl font-black text-white">No rankings yet</h2>
                    <p className="mt-2 text-slate-400">
                        {mode === 'critic'
                            ? 'Run the critic score backfill to fill this leaderboard.'
                            : 'Rate games in your library to build the community chart.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {activeItems.map(item => (
                        <TopRow key={`${mode}-${item.game.id}`} item={item} mode={mode} />
                    ))}
                </div>
            )}
        </div>
    );
}
