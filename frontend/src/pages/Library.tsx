import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { CoverArt, gameBlurb, MmmScoreStrip, parseGenres, parsePlatforms, PlatformBadges } from '../utils/games';

const filters = ['All', 'Plan to Play', 'Playing', 'Completed'];

export default function Library() {
    const [library, setLibrary] = useState<any[]>([]);
    const [filter, setFilter] = useState('All');

    const fetchLibrary = () => {
        api.get('/library').then(res => setLibrary(res.data)).catch(console.error);
    };

    useEffect(() => { fetchLibrary(); }, []);

    const updateStatus = async (gameId: string, newStatus: string) => {
        await api.patch(`/library/${gameId}`, { status: newStatus });
        fetchLibrary();
    };

    const updateRating = async (gameId: string, newRating: number) => {
        await api.patch(`/library/${gameId}`, { rating: newRating });
        fetchLibrary();
    };

    const removeGame = async (gameId: string) => {
        if (window.confirm('Remove this game from your library?')) {
            await api.delete(`/library/${gameId}`);
            fetchLibrary();
        }
    };

    const filteredLib = filter === 'All' ? library : library.filter(item => item.status === filter);
    const completedCount = useMemo(() => library.filter(item => item.status === 'Completed').length, [library]);

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Collection</p>
                    <h1 className="section-title">My Game Library</h1>
                    <p className="section-copy">Track what you own, what you are playing, and the ratings that power your recommendations.</p>
                </div>
                <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
                    <div className="stat-tile">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Games</p>
                        <p className="text-2xl font-black text-white">{library.length}</p>
                    </div>
                    <div className="stat-tile">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Completed</p>
                        <p className="text-2xl font-black text-cyan-200">{completedCount}</p>
                    </div>
                </div>
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
                {filters.map(f => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={filter === f ? 'genre-chip-active' : 'genre-chip'}
                    >
                        {f}
                    </button>
                ))}
            </div>

            {library.length === 0 ? (
                <div className="empty-state">
                    <h2 className="text-2xl font-black text-white">Your library is empty</h2>
                    <p className="mt-2 text-slate-400">Start exploring games and add your first title to the collection.</p>
                    <Link to="/" className="btn-primary mt-6 inline-flex">Browse Games</Link>
                </div>
            ) : filteredLib.length === 0 ? (
                <div className="empty-state">
                    <h2 className="text-2xl font-black text-white">No games in this status</h2>
                    <p className="mt-2 text-slate-400">Switch filters or update a game's status from another view.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
                    {filteredLib.map((item, index) => {
                        const rating = item.rating || 0;
                        const genres = parseGenres(item.game?.genres);
                        const platforms = parsePlatforms(item.game?.platforms);

                        return (
                            <div
                                key={item.id}
                                className={`game-card group flex flex-col overflow-hidden animate-fade-in-up stagger-${Math.min((index % 6) + 1, 6)}`}
                                style={{ opacity: 0 }}
                            >
                                <div className="card-image-wrap grid grid-cols-[7rem_1fr]">
                                    <CoverArt game={item.game} className="card-cover h-full min-h-40 transition-transform duration-500 group-hover:scale-105" />
                                    <div className="flex min-w-0 flex-col p-4">
                                        <Link to={`/games/${item.gameId}`} className="line-clamp-2 text-lg font-black leading-tight text-white hover:text-cyan-200">
                                            {item.game.title}
                                        </Link>
                                        <p className="mt-1 line-clamp-1 text-sm text-slate-500">{genres.join(', ') || 'Adventure'}</p>
                                        <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-400">
                                            {gameBlurb(item.game, 'Track this game in your personal library and use your rating to improve recommendations.')}
                                        </p>
                                        <div className="mt-3">
                                            <PlatformBadges platforms={platforms} limit={3} />
                                        </div>
                                        <div className="mt-3">
                                            <MmmScoreStrip game={item.game} compact />
                                        </div>

                                        <label className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">Status</label>
                                        <select
                                            value={item.status || 'Plan to Play'}
                                            onChange={(e) => updateStatus(item.gameId, e.target.value)}
                                            className="field mt-1 py-2"
                                        >
                                            <option value="Plan to Play">Plan to Play</option>
                                            <option value="Playing">Playing</option>
                                            <option value="Completed">Completed</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="border-t border-white/10 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Rating</label>
                                        <span className="rounded-md border border-white/10 bg-slate-950/60 px-2 py-1 text-sm font-black text-cyan-200">
                                            {rating ? rating.toFixed(1) : 'Unrated'}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="5"
                                        step="0.5"
                                        value={rating}
                                        onChange={(e) => updateRating(item.gameId, Number(e.target.value))}
                                        className="mt-3 w-full accent-cyan-400"
                                    />
                                    <div className="mt-3 flex items-center justify-between">
                                        <span className={`chip ${item.status === 'Completed' ? 'text-emerald-300' : item.status === 'Playing' ? 'text-cyan-300' : ''}`}>
                                            {item.status || 'Plan to Play'}
                                        </span>
                                        <button onClick={() => removeGame(item.gameId)} className="btn-danger">Remove</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
