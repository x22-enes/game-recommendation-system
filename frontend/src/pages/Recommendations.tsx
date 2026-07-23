import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { CoverArt, gameBlurb, MmmScoreStrip, parseGenres, parsePlatforms, PlatformBadges } from '../utils/games';

function ConfidenceBar({ value }: { value: number }) {
    return (
        <div>
            <div className="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-wide">
                <span className="text-slate-500">Match confidence</span>
                <span className="text-cyan-300">{value}%</span>
            </div>
            <div className="confidence-track">
                <div className="confidence-fill" style={{ '--bar-width': `${value}%` } as CSSProperties} />
            </div>
        </div>
    );
}

function ReasonList({ reasons }: { reasons: string[] }) {
    if (reasons.length === 0) {
        return <p className="text-sm text-slate-500">Based on your library and preferences.</p>;
    }

    return (
        <ul className="space-y-2.5">
            {reasons.slice(0, 3).map((reason, index) => (
                <li key={index} className="flex gap-3 text-sm leading-relaxed text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                    <span>{reason}</span>
                </li>
            ))}
        </ul>
    );
}

function RecommendationCard({ item, rank }: { item: any; rank: number }) {
    const confidence = item.confidence || 35;
    const genres = parseGenres(item.game.genres);
    const platforms = parsePlatforms(item.game.platforms);
    const description = gameBlurb(item.game, 'Recommended from your ratings, preferences, library, and catalog signals.');

    return (
        <Link
            to={`/games/${item.game.id}`}
            className={`market-card group grid min-h-52 grid-cols-1 overflow-hidden animate-fade-in-up stagger-${Math.min(rank, 6)} sm:grid-cols-[11rem_1fr]`}
            style={{ opacity: 0 }}
        >
            <div className="card-image-wrap relative min-h-44 sm:min-h-full">
                <CoverArt game={item.game} className="card-cover h-full min-h-44 transition-transform duration-500 group-hover:scale-105 sm:min-h-full" />
                <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1 text-sm font-black text-white backdrop-blur-sm">
                    #{rank}
                </div>
            </div>
            <div className="flex min-w-0 flex-col gap-3 p-4 sm:gap-4 sm:p-5">
                <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                        <PlatformBadges platforms={platforms} limit={3} />
                        <span className="score-pill">{Math.round(item.score || 0)} score</span>
                    </div>
                    <h3 className="line-clamp-2 text-xl font-black leading-tight text-white transition-colors group-hover:text-cyan-100">
                        {item.game.title}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                        {genres.join(', ') || 'Adventure'}
                    </p>
                    <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-400">
                        {description}
                    </p>
                </div>
                <MmmScoreStrip game={item.game} compact />
                <ConfidenceBar value={confidence} />
                <div className="mt-auto rounded-lg border border-white/[0.06] bg-slate-950/30 p-3">
                    <p className="mb-2 text-[0.65rem] font-bold uppercase tracking-wide text-cyan-400">Why it matches</p>
                    <ReasonList reasons={item.reasons || []} />
                </div>
            </div>
        </Link>
    );
}

export default function Recommendations() {
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/recommendations')
            .then(res => {
                setRecommendations(res.data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });
    }, []);

    if (loading) return (
        <div className="page-enter flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-5 h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-400/30 border-t-cyan-400" />
            <div className="text-xl font-black text-white">Building your recommendations</div>
            <p className="mt-2 max-w-sm text-sm text-slate-400">Reading ratings, platform fit, prices, and catalog signals.</p>
        </div>
    );

    const featured = recommendations[0];
    const rest = recommendations.slice(1);

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <div className="mb-2 flex items-center gap-2">
                        <p className="eyebrow">Personalized</p>
                        <span className="ai-badge">
                            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-shimmer" />
                            AI powered
                        </span>
                    </div>
                    <h1 className="section-title">Recommended For You</h1>
                    <p className="section-copy">
                        Hybrid ranking based on taste, library ratings, platform fit, price signals, and catalog quality.
                    </p>
                </div>
                <div className="grid w-full grid-cols-3 gap-3 md:w-auto">
                    <div className="stat-tile text-center">
                        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Picks</p>
                        <p className="mt-1 text-2xl font-black text-white">{recommendations.length}</p>
                    </div>
                    <div className="stat-tile text-center">
                        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Top match</p>
                        <p className="mt-1 text-2xl font-black text-cyan-300">{featured?.confidence || 0}%</p>
                    </div>
                    <div className="stat-tile text-center">
                        <p className="text-[0.65rem] font-bold uppercase tracking-wide text-slate-500">Mode</p>
                        <p className="mt-1 text-lg font-black text-emerald-300">Hybrid</p>
                    </div>
                </div>
            </div>

            {recommendations.length === 0 ? (
                <div className="empty-state">
                    <h2 className="text-2xl font-black text-white">More ratings needed</h2>
                    <p className="mx-auto mt-2 max-w-xl text-slate-400">
                        Add games to your library and rate them so the recommendation engine can learn what you enjoy.
                    </p>
                    <Link to="/library" className="btn-primary mt-6 inline-flex">Open Library</Link>
                </div>
            ) : (
                <>
                    <Link to={`/games/${featured.game.id}`} className="market-card group mb-6 grid overflow-hidden lg:grid-cols-[1.15fr_1fr]">
                        <div className="card-image-wrap relative min-h-[18rem] lg:min-h-[22rem]">
                            <CoverArt game={featured.game} className="card-cover h-full min-h-[18rem] transition-transform duration-700 group-hover:scale-105 lg:min-h-[22rem]" />
                            <div className="featured-overlay" />
                            <div className="absolute left-4 top-4 flex items-center gap-2">
                                <span className="rounded-lg border border-cyan-400/30 bg-black/60 px-3 py-1.5 text-sm font-black text-cyan-200 backdrop-blur-sm">
                                    Best match
                                </span>
                                <span className="ai-badge hidden sm:inline-flex">Top pick</span>
                            </div>
                        </div>
                        <div className="flex flex-col justify-center p-5 lg:p-8">
                            <div className="mb-3 flex flex-wrap items-center gap-2">
                                <PlatformBadges platforms={parsePlatforms(featured.game.platforms)} />
                                <span className="score-pill">{Math.round(featured.score || 0)} score</span>
                            </div>
                            <p className="eyebrow">AI picked for you</p>
                            <h2 className="mt-1 text-3xl font-black leading-tight text-white sm:text-4xl">{featured.game.title}</h2>
                            <p className="mt-2 line-clamp-2 text-sm text-slate-400">
                                {parseGenres(featured.game.genres).join(', ') || 'Adventure'}
                            </p>
                            <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-300">
                                {gameBlurb(featured.game, 'A high-confidence recommendation selected from your taste profile, ratings, preferred genres, and platform fit.')}
                            </p>
                            <div className="mt-5">
                                <MmmScoreStrip game={featured.game} />
                            </div>
                            <div className="mt-5">
                                <ConfidenceBar value={featured.confidence || 35} />
                            </div>
                            <div className="mt-5 rounded-xl border border-white/[0.06] bg-slate-950/40 p-4">
                                <p className="mb-3 text-[0.65rem] font-bold uppercase tracking-wide text-cyan-400">Why it is first</p>
                                <ReasonList reasons={featured.reasons || []} />
                            </div>
                        </div>
                    </Link>

                    <div className="mb-4 flex items-center justify-between gap-4">
                        <h2 className="text-lg font-black text-white">More picks for you</h2>
                        <span className="chip">{rest.length} games</span>
                    </div>

                    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        {rest.map((item, index) => (
                            <RecommendationCard item={item} rank={index + 2} key={item.game.id} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
