import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import { CoverArt, gameBlurb, MmmScoreStrip, parseGenres, parsePlatforms, PlatformBadges, PriceBadge } from '../utils/games';

function UserAvatar({ user, size = 'md' }: { user: any; size?: 'sm' | 'md' }) {
    const [failed, setFailed] = useState(false);
    const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
    const initials = String(user?.username || '?').slice(0, 2).toUpperCase();

    if (user?.avatarUrl && !failed) {
        return (
            <img
                src={user.avatarUrl}
                alt={`${user.username} avatar`}
                className={`${sizeClass} shrink-0 rounded-full border-2 border-white/10 object-cover ring-2 ring-slate-900`}
                loading="lazy"
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border-2 border-white/10 bg-slate-800 font-bold text-cyan-300 ring-2 ring-slate-900`}>
            {initials}
        </div>
    );
}

function formatRelativeTime(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

async function withProfileAvatars(items: any[]) {
    const userIds = new Set<string>();

    const collectMissingAvatar = (item: any) => {
        if (item?.userId && !item.avatarUrl) userIds.add(item.userId);
        (item?.replies || []).forEach(collectMissingAvatar);
    };

    items.forEach(collectMissingAvatar);
    if (userIds.size === 0) return items;

    const profiles = await Promise.all(
        [...userIds].map(async userId => {
            try {
                const res = await api.get(`/users/${userId}/profile`);
                return [userId, res.data.avatarUrl || ''] as const;
            } catch {
                return [userId, ''] as const;
            }
        })
    );
    const avatarByUserId = new Map(profiles.filter(([, avatarUrl]) => avatarUrl));

    const applyAvatar = (item: any): any => ({
        ...item,
        avatarUrl: item.avatarUrl || avatarByUserId.get(item.userId) || item.avatarUrl,
        replies: (item.replies || []).map(applyAvatar),
    });

    return items.map(applyAvatar);
}

function RequirementBlock({ title, value }: { title: string; value?: string }) {
    if (!value) return null;

    return (
        <div className="rounded-xl border border-white/[0.08] bg-slate-950/40 p-4">
            <h3 className="text-sm font-black uppercase tracking-wide text-cyan-300">{title}</h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-300">{value}</p>
        </div>
    );
}

function RelatedGameCard({ game }: { game: any }) {
    const genres = parseGenres(game.genres);
    const platforms = parsePlatforms(game.platforms);

    return (
        <Link to={`/games/${game.id}`} className="game-card group min-w-[11rem] max-w-[11rem] overflow-hidden">
            <div className="card-image-wrap">
                <CoverArt game={game} className="card-cover transition-transform duration-500 group-hover:scale-105" />
                <div className="absolute left-2 top-2 z-10">
                    <PlatformBadges platforms={platforms} limit={2} />
                </div>
            </div>
            <div className="p-3">
                <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-black leading-tight text-white group-hover:text-cyan-100">
                    {game.title}
                </h3>
                <p className="mt-1 line-clamp-1 text-xs text-slate-500">{genres.join(', ') || 'Adventure'}</p>
                <div className="mt-2">
                    <PriceBadge game={game} />
                </div>
            </div>
        </Link>
    );
}

export default function GameDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [game, setGame] = useState<any>(null);
    const [prices, setPrices] = useState<any[]>([]);
    const [comments, setComments] = useState<any[]>([]);
    const [commentBody, setCommentBody] = useState('');
    const [commentError, setCommentError] = useState('');
    const [replyingTo, setReplyingTo] = useState<string | null>(null);
    const [replyBody, setReplyBody] = useState('');
    const [activeMediaIndex, setActiveMediaIndex] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setActiveMediaIndex(0);
        api.get(`/games/${id}`).then(res => setGame(res.data)).catch(console.error);
        api.get(`/games/${id}/prices`).then(res => setPrices(res.data)).catch(console.error);
        api.get(`/games/${id}/comments`)
            .then(async res => {
                const commentsWithAvatars = await withProfileAvatars(res.data);
                if (!cancelled) setComments(commentsWithAvatars);
            })
            .catch(console.error);

        return () => {
            cancelled = true;
        };
    }, [id]);

    const addToWishlist = async () => {
        try {
            await api.post(`/wishlist/${id}`);
            alert('Added to wishlist.');
        } catch (e: any) {
            alert(e.response?.data?.error || 'Failed to add to wishlist');
        }
    };

    const addToLibrary = async () => {
        try {
            await api.post(`/library/${id}`);
            alert('Added to library.');
            navigate('/library');
        } catch (e: any) {
            alert(e.response?.data?.error || 'Failed to add to library');
        }
    };

    const requireLogin = () => {
        if (!localStorage.getItem('token')) {
            navigate('/login');
            return false;
        }
        return true;
    };

    const submitComment = async (e: any) => {
        e.preventDefault();
        setCommentError('');
        if (!requireLogin()) {
            setCommentError('Please login before writing a comment.');
            return;
        }
        try {
            const res = await api.post(`/games/${id}/comments`, { body: commentBody });
            const [commentWithAvatar] = await withProfileAvatars([res.data]);
            setComments(current => [commentWithAvatar, ...current]);
            setCommentBody('');
        } catch (e: any) {
            if (e.response?.status === 401) {
                localStorage.removeItem('token');
                setCommentError('Session expired. Please login again.');
                navigate('/login');
                return;
            }
            setCommentError(e.response?.data?.error || 'Could not post comment.');
        }
    };

    const submitReply = async (parentId: string) => {
        setCommentError('');
        if (!requireLogin()) return;
        try {
            const res = await api.post(`/games/${id}/comments`, { body: replyBody, parentId });
            const [replyWithAvatar] = await withProfileAvatars([res.data]);
            setComments(current => current.map(comment => (
                comment.id === parentId
                    ? { ...comment, replies: [...(comment.replies || []), replyWithAvatar] }
                    : comment
            )));
            setReplyBody('');
            setReplyingTo(null);
        } catch (e: any) {
            setCommentError(e.response?.data?.error || 'Could not post reply.');
        }
    };

    const toggleLike = async (commentId: string, parentId?: string) => {
        if (!requireLogin()) return;
        const res = await api.post(`/comments/${commentId}/like`);
        setComments(current => current.map(comment => {
            if (comment.id === commentId) return { ...comment, ...res.data };
            if (comment.id === parentId) {
                return {
                    ...comment,
                    replies: (comment.replies || []).map((reply: any) => (
                        reply.id === commentId ? { ...reply, ...res.data } : reply
                    )),
                };
            }
            return comment;
        }));
    };

    if (!game) return (
        <div className="page-enter flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-5 h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-400/30 border-t-cyan-400" />
            <div className="text-xl font-black text-white">Loading game details</div>
        </div>
    );

    const genres = parseGenres(game.genres);
    const platforms = parsePlatforms(game.platforms);
    const steamDetails = game.steamDetails;
    const relatedGames = Array.isArray(game.relatedGames) ? game.relatedGames : [];
    const mediaItems = [
        ...(steamDetails?.screenshots || []),
        steamDetails?.backgroundRaw,
        steamDetails?.headerImage,
        game.coverUrl,
    ].filter(Boolean).filter((item, index, items) => items.indexOf(item) === index).slice(0, 8);
    const activeMedia = mediaItems[Math.min(activeMediaIndex, Math.max(mediaItems.length - 1, 0))];
    const heroBackground = steamDetails?.backgroundRaw || activeMedia || game.coverUrl;
    const primaryDescription = steamDetails?.shortDescription || gameBlurb(game, 'No description is available for this game yet.');
    const detailedDescription = steamDetails?.detailedDescription || gameBlurb(game, 'No description is available for this game yet.');
    const developers = steamDetails?.developers?.length ? steamDetails.developers.join(', ') : '';
    const publishers = steamDetails?.publishers?.length ? steamDetails.publishers.join(', ') : '';
    const releaseDate = steamDetails?.releaseDate || '';
    const lowestPrice = prices.length > 0
        ? Math.min(...prices.map(p => Number(p.price)).filter(n => Number.isFinite(n)))
        : null;
    const showMediaControls = mediaItems.length > 1;
    const goToPreviousMedia = () => {
        if (!showMediaControls) return;
        setActiveMediaIndex(current => (current - 1 + mediaItems.length) % mediaItems.length);
    };
    const goToNextMedia = () => {
        if (!showMediaControls) return;
        setActiveMediaIndex(current => (current + 1) % mediaItems.length);
    };

    return (
        <div className="page-enter">
            {/* Hero banner */}
            <div className="relative mb-8 overflow-hidden rounded-2xl border border-white/[0.08] shadow-card">
                <div className="absolute inset-0">
                    {heroBackground ? (
                        <img src={heroBackground} alt="" className="h-full w-full scale-105 object-cover brightness-[0.35] saturate-125" />
                    ) : (
                        <CoverArt game={game} className="h-full w-full scale-110 blur-2xl brightness-[0.35] saturate-150" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/45" />
                    <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent" />
                </div>
                <div className="relative min-h-[24rem] p-5 sm:p-6 lg:p-8">
                    <div className="mb-20 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide text-slate-300">
                        <Link to="/" className="text-cyan-300 hover:text-cyan-100">Games</Link>
                        <span className="text-slate-600">/</span>
                        <span className="line-clamp-1">{game.title}</span>
                        <span className="text-slate-600">/</span>
                        <span className="text-white">Overview</span>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-[12rem_1fr_auto] lg:items-end lg:gap-8">
                        <div className="media-shell mx-auto w-40 shrink-0 lg:mx-0 lg:w-full">
                        <CoverArt game={game} className="aspect-[3/4] w-full" />
                        </div>
                        <div className="min-w-0 text-center lg:text-left">
                            <p className="eyebrow">{steamDetails ? 'Steam enhanced profile' : 'Game profile'}</p>
                            <h1 className="mt-1 text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">{game.title}</h1>
                            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-300">{primaryDescription}</p>
                            <div className="mt-4 flex flex-wrap justify-center gap-2 lg:justify-start">
                                {genres.length > 0 ? genres.map((genre: string) => (
                                    <span key={genre} className="chip">{genre}</span>
                                )) : <span className="chip">Adventure</span>}
                            </div>
                            <div className="mt-3 flex flex-wrap justify-center gap-2 lg:justify-start">
                                <PlatformBadges platforms={platforms} />
                            </div>
                            <div className="mt-4 max-w-md lg:max-w-lg">
                                <MmmScoreStrip game={game} />
                            </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
                            <button onClick={addToLibrary} className="btn-primary whitespace-nowrap">Add to Library</button>
                            <button onClick={addToWishlist} className="btn-secondary whitespace-nowrap">Add to Wishlist</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-8 lg:grid-cols-[1fr_16rem]">
                <main className="min-w-0 space-y-6">
                    {mediaItems.length > 0 && (
                        <section className="space-y-4">
                            <div className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950 shadow-card">
                                <img
                                    src={activeMedia}
                                    alt={`${game.title} media`}
                                    className="aspect-video min-h-[18rem] w-full object-cover transition-transform duration-700 group-hover:scale-[1.015] sm:min-h-[26rem] lg:min-h-[32rem]"
                                />
                                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-black/35 opacity-80" />
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/85 to-transparent" />

                                {showMediaControls && (
                                    <>
                                        <button
                                            type="button"
                                            onClick={goToPreviousMedia}
                                            className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-3xl leading-none text-white shadow-card backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-white/30 hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                                            aria-label="Previous media"
                                        >
                                            ‹
                                        </button>
                                        <button
                                            type="button"
                                            onClick={goToNextMedia}
                                            className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-black/35 text-3xl leading-none text-white shadow-card backdrop-blur-md transition-all duration-200 hover:scale-105 hover:border-white/30 hover:bg-black/55 focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
                                            aria-label="Next media"
                                        >
                                            ›
                                        </button>
                                        <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-2 backdrop-blur-md">
                                            {mediaItems.map((item: string, index: number) => (
                                                <button
                                                    type="button"
                                                    key={`dot-${item}`}
                                                    onClick={() => setActiveMediaIndex(index)}
                                                    className={`h-2 rounded-full transition-all duration-200 ${
                                                        activeMediaIndex === index ? 'w-6 bg-white' : 'w-2 bg-white/45 hover:bg-white/80'
                                                    }`}
                                                    aria-label={`Show media ${index + 1}`}
                                                />
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                            {showMediaControls && (
                                <div className="flex gap-3 overflow-x-auto pb-2">
                                    {mediaItems.map((item: string, index: number) => (
                                        <button
                                            type="button"
                                            key={item}
                                            onClick={() => setActiveMediaIndex(index)}
                                            className={`media-shell h-20 min-w-32 overflow-hidden transition-all duration-200 sm:h-24 sm:min-w-40 ${
                                                activeMediaIndex === index ? 'scale-[1.01] ring-2 ring-white ring-offset-2 ring-offset-slate-950' : 'opacity-55 hover:opacity-100'
                                            }`}
                                            aria-label={`Show media ${index + 1}`}
                                        >
                                            <img src={item} alt="" className="h-full w-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>
                    )}

                    <section className="surface rounded-xl p-5 sm:p-6">
                        <h2 className="text-lg font-black text-white">Overview</h2>
                        <p className="mt-3 text-base leading-7 text-slate-300">
                            {detailedDescription}
                        </p>
                    </section>

                    {(steamDetails?.requirements?.minimum || steamDetails?.requirements?.recommended) && (
                        <section>
                            <div className="mb-4">
                                <h2 className="text-xl font-black text-white sm:text-2xl">Requirements</h2>
                                <p className="mt-1 text-sm text-slate-400">Minimum and recommended PC specs when available.</p>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-2">
                                <RequirementBlock title="Minimum" value={steamDetails.requirements.minimum} />
                                <RequirementBlock title="Recommended" value={steamDetails.requirements.recommended} />
                            </div>
                        </section>
                    )}

                    <section>
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black text-white sm:text-2xl">Store Prices</h2>
                                <p className="mt-1 text-sm text-slate-400">Verified PC deals and console store links when available.</p>
                            </div>
                            <span className="chip">{prices.length} offers</span>
                        </div>

                        <div className="grid gap-3">
                            {prices.length === 0 && (
                                <div className="surface rounded-xl p-5 text-sm text-slate-400">
                                    No saved store offer is available for this game right now.
                                </div>
                            )}
                            {prices.map((price, idx) => {
                                const isBest = lowestPrice !== null && Number(price.price) === lowestPrice;
                                const hasDiscount = Number(price.normalPrice) > Number(price.price);

                                return (
                                    <div key={idx} className={`store-card ${isBest ? 'store-card-best' : ''}`}>
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="text-lg font-black text-white">{price.storeName}</h3>
                                                {isBest && (
                                                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-emerald-300">
                                                        Best price
                                                    </span>
                                                )}
                                            </div>
                                            {(price.source === 'cheapshark' || price.source === 'steam' || price.source === 'console-store') && (
                                                <span className="mt-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs font-semibold text-slate-400">
                                                    {price.source === 'steam' ? 'Steam live price' : price.source === 'console-store' ? 'Console store price' : 'Verified source'}
                                                </span>
                                            )}
                                            {price.matchedTitle && (
                                                <p className="mt-2 truncate text-xs text-slate-500">Matched: {price.matchedTitle}</p>
                                            )}
                                        </div>
                                        <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                                            <div className="text-right">
                                                <div className="text-2xl font-black text-cyan-300">${Number(price.price).toFixed(2)}</div>
                                                {hasDiscount && (
                                                    <div className="text-xs font-semibold text-slate-500 line-through">${Number(price.normalPrice).toFixed(2)}</div>
                                                )}
                                            </div>
                                            {price.url && price.url !== '#' && (
                                                <a href={price.url} target="_blank" rel="noreferrer" className="btn-primary whitespace-nowrap">
                                                    View Deal
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section>
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black text-white sm:text-2xl">Community</h2>
                                <p className="mt-1 text-sm text-slate-400">Share notes and opinions with other players.</p>
                            </div>
                            <span className="chip">{comments.length} comments</span>
                        </div>

                        <form onSubmit={submitComment} className="surface-elevated mb-5 rounded-xl p-4 sm:p-5">
                            <label className="sidebar-label" htmlFor="comment-body">Write a comment</label>
                            <textarea
                                id="comment-body"
                                value={commentBody}
                                onChange={(e) => setCommentBody(e.target.value)}
                                className="field min-h-24 resize-y"
                                placeholder="What do you think about this game?"
                                maxLength={800}
                            />
                            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-slate-500">{commentBody.length}/800</p>
                                <button className="btn-primary sm:w-auto" disabled={!commentBody.trim()}>Post Comment</button>
                            </div>
                            {commentError && <p className="mt-3 text-sm text-red-300">{commentError}</p>}
                        </form>

                        <div className="space-y-4">
                            {comments.length === 0 && (
                                <div className="empty-state py-10">
                                    <p className="text-slate-400">No comments yet. Be the first to share your thoughts.</p>
                                </div>
                            )}
                            {comments.map(comment => (
                                <article key={comment.id} className="comment-thread">
                                    <div className="flex gap-3 sm:gap-4">
                                        <Link to={`/users/${comment.userId}`} className="shrink-0">
                                            <UserAvatar user={comment} />
                                        </Link>
                                        <div className="min-w-0 flex-1">
                                            <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                <Link to={`/users/${comment.userId}`} className="font-bold text-white hover:text-cyan-300">
                                                    {comment.username}
                                                </Link>
                                                <time className="text-xs text-slate-500" dateTime={comment.createdAt}>
                                                    {formatRelativeTime(comment.createdAt)}
                                                </time>
                                            </div>
                                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{comment.body}</p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleLike(comment.id)}
                                                    className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${comment.likedByMe ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200'}`}
                                                >
                                                    ♥ {comment.likeCount || 0}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setReplyingTo(replyingTo === comment.id ? null : comment.id);
                                                        setReplyBody('');
                                                    }}
                                                    className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-slate-400 transition-all duration-200 hover:border-white/20 hover:text-slate-200"
                                                >
                                                    Reply
                                                </button>
                                            </div>

                                            {replyingTo === comment.id && (
                                                <div className="mt-4 rounded-xl border border-white/[0.06] bg-slate-950/40 p-3">
                                                    <textarea
                                                        value={replyBody}
                                                        onChange={(e) => setReplyBody(e.target.value)}
                                                        className="field min-h-20 resize-y"
                                                        placeholder={`Reply to ${comment.username}...`}
                                                        maxLength={800}
                                                    />
                                                    <div className="mt-3 flex justify-end gap-2">
                                                        <button type="button" onClick={() => setReplyingTo(null)} className="btn-secondary py-1.5 text-xs">Cancel</button>
                                                        <button type="button" onClick={() => submitReply(comment.id)} disabled={!replyBody.trim()} className="btn-primary py-1.5 text-xs">Post Reply</button>
                                                    </div>
                                                </div>
                                            )}

                                            {comment.replies?.length > 0 && (
                                                <div className="mt-4 space-y-3 border-l-2 border-cyan-400/20 pl-4">
                                                    {comment.replies.map((reply: any) => (
                                                        <div key={reply.id} className="comment-reply">
                                                            <div className="flex gap-3">
                                                                <Link to={`/users/${reply.userId}`} className="shrink-0">
                                                                    <UserAvatar user={reply} size="sm" />
                                                                </Link>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="mb-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                                                        <Link to={`/users/${reply.userId}`} className="text-sm font-bold text-white hover:text-cyan-300">
                                                                            {reply.username}
                                                                        </Link>
                                                                        <time className="text-xs text-slate-500" dateTime={reply.createdAt}>
                                                                            {formatRelativeTime(reply.createdAt)}
                                                                        </time>
                                                                    </div>
                                                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{reply.body}</p>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => toggleLike(reply.id, comment.id)}
                                                                        className={`mt-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-all duration-200 ${reply.likedByMe ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200' : 'border-white/10 bg-white/[0.04] text-slate-400 hover:border-white/20 hover:text-slate-200'}`}
                                                                    >
                                                                        ♥ {reply.likeCount || 0}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </section>

                    {relatedGames.length > 0 && (
                        <section>
                            <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <h2 className="text-xl font-black text-white sm:text-2xl">{game.title} players also liked</h2>
                                    <p className="mt-1 text-sm text-slate-400">More games from nearby genres and catalog signals.</p>
                                </div>
                                <Link to="/" className="btn-secondary px-3 py-2 text-xs">View All</Link>
                            </div>
                            <div className="flex gap-4 overflow-x-auto pb-3">
                                {relatedGames.map((related: any) => (
                                    <RelatedGameCard key={related.id} game={related} />
                                ))}
                            </div>
                        </section>
                    )}
                </main>

                <aside className="space-y-4">
                    <div className="surface sticky top-24 rounded-xl p-5 lg:static">
                        {(steamDetails?.capsuleImage || game.coverUrl) && (
                            <div className="mb-5 overflow-hidden rounded-xl border border-white/[0.08] bg-slate-950">
                                {steamDetails?.capsuleImage ? (
                                    <img src={steamDetails.capsuleImage} alt={game.title} className="w-full object-cover" />
                                ) : (
                                    <CoverArt game={game} className="card-cover" />
                                )}
                            </div>
                        )}
                        <p className="text-sm leading-6 text-slate-300">{primaryDescription}</p>
                        <div className="mt-4">
                            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Mini Mid Max score</p>
                            <MmmScoreStrip game={game} />
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {(steamDetails?.genres?.length ? steamDetails.genres : genres).slice(0, 4).map((item: string) => (
                                <span key={item} className="rounded-md border border-emerald-400/20 bg-emerald-400/10 px-2 py-1 text-[0.65rem] font-black uppercase tracking-wide text-emerald-300">
                                    {item}
                                </span>
                            ))}
                        </div>
                        <dl className="mt-5 space-y-3 text-sm">
                            {(developers || publishers) && (
                                <div className="flex gap-3 border-t border-white/[0.06] pt-3">
                                    <dt className="min-w-20 text-slate-500">Studio</dt>
                                    <dd className="text-right font-bold text-slate-200">{developers || publishers}</dd>
                                </div>
                            )}
                            {releaseDate && (
                                <div className="flex gap-3 border-t border-white/[0.06] pt-3">
                                    <dt className="min-w-20 text-slate-500">Release</dt>
                                    <dd className="text-right font-bold text-slate-200">{releaseDate}</dd>
                                </div>
                            )}
                            <div className="flex gap-3 border-t border-white/[0.06] pt-3">
                                <dt className="min-w-20 text-slate-500">Platform</dt>
                                <dd className="flex flex-1 justify-end"><PlatformBadges platforms={platforms} /></dd>
                            </div>
                            {typeof steamDetails?.metacriticScore === 'number' && (
                                <div className="flex gap-3 border-t border-white/[0.06] pt-3">
                                    <dt className="min-w-20 text-slate-500">Metacritic</dt>
                                    <dd className="text-right font-black text-emerald-300">{steamDetails.metacriticScore}</dd>
                                </div>
                            )}
                        </dl>
                        {steamDetails?.website && (
                            <a href={steamDetails.website} target="_blank" rel="noreferrer" className="btn-secondary mt-5 flex w-full justify-center">
                                Official Website
                            </a>
                        )}
                    </div>

                    <div className="surface sticky top-24 rounded-xl p-5">
                        <p className="sidebar-label">Community Rating</p>
                        <div className="flex items-end gap-2">
                            <span className="text-5xl font-black text-cyan-300">
                                {game.ratingSummary?.average ? game.ratingSummary.average.toFixed(1) : '—'}
                            </span>
                            <span className="pb-2 text-sm font-semibold text-slate-500">/ 5</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-400">
                            {game.ratingSummary?.count ? `${game.ratingSummary.count} user ratings` : 'No ratings yet'}
                        </p>
                        {game.ratingSummary?.average && (
                            <div className="mt-4 confidence-track">
                                <div
                                    className="confidence-fill bg-gradient-to-r from-cyan-600 to-cyan-400"
                                    style={{ '--bar-width': `${(game.ratingSummary.average / 5) * 100}%` } as CSSProperties}
                                />
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
}
