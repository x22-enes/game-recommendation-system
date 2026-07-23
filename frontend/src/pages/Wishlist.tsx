import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { CoverArt, gameBlurb, MmmScoreStrip, parseGenres, parsePlatforms, PlatformBadges } from '../utils/games';

export default function Wishlist() {
    const [wishlist, setWishlist] = useState<any[]>([]);

    const fetchWishlist = () => {
        api.get('/wishlist').then(res => setWishlist(res.data)).catch(console.error);
    };

    useEffect(() => { fetchWishlist(); }, []);

    const moveToLibrary = async (gameId: string) => {
        try {
            await api.post(`/library/${gameId}`);
            fetchWishlist();
            alert('Moved to library.');
        } catch (e: any) {
            alert(e.response?.data?.error || 'Error moving to library');
        }
    };

    const removeFromWishlist = async (gameId: string) => {
        await api.delete(`/wishlist/${gameId}`);
        fetchWishlist();
    };

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Saved</p>
                    <h1 className="section-title">My Wishlist</h1>
                    <p className="section-copy">Keep track of games you want to evaluate, buy, or move into your active library.</p>
                </div>
                <div className="stat-tile">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Saved games</p>
                    <p className="text-2xl font-black text-cyan-200">{wishlist.length}</p>
                </div>
            </div>

            {wishlist.length === 0 ? (
                <div className="empty-state">
                    <h2 className="text-2xl font-black text-white">Your wishlist is empty</h2>
                    <p className="mt-2 text-slate-400">Save games you want to return to later.</p>
                    <Link to="/" className="btn-primary mt-6 inline-flex">Discover Games</Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {wishlist.map((game, index) => (
                        <div
                            key={game.id}
                            className={`game-card group flex flex-col overflow-hidden animate-fade-in-up stagger-${Math.min((index % 6) + 1, 6)}`}
                            style={{ opacity: 0 }}
                        >
                            <Link to={`/games/${game.id}`} className="card-image-wrap block">
                                <CoverArt game={game} className="aspect-[3/4] w-full transition-transform duration-500 group-hover:scale-105" />
                            </Link>

                            <div className="flex flex-1 flex-col p-4">
                                <h3 className="line-clamp-2 min-h-14 text-lg font-black leading-tight text-white">{game.title}</h3>
                                <p className="mt-2 line-clamp-1 text-sm text-slate-400">
                                    {parseGenres(game.genres).join(', ') || 'Adventure'}
                                </p>
                                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm leading-5 text-slate-500">
                                    {gameBlurb(game, 'Saved for later. Open the profile to inspect details, platforms, and available store offers.')}
                                </p>
                                <div className="mt-3">
                                    <PlatformBadges platforms={parsePlatforms(game.platforms)} limit={3} />
                                </div>
                                <div className="mt-3">
                                    <MmmScoreStrip game={game} compact />
                                </div>
                                <div className="mt-auto flex flex-col gap-2 pt-5">
                                    <button onClick={() => moveToLibrary(game.id)} className="btn-primary w-full">
                                        Move to Library
                                    </button>
                                    <button onClick={() => removeFromWishlist(game.id)} className="btn-secondary w-full">
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
