import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import { CoverArt } from '../utils/games';

const statLabels: Record<string, string> = {
    libraryCount: 'Library',
    wishlistCount: 'Wishlist',
    ratedCount: 'Rated',
    completedCount: 'Completed',
    playingCount: 'Playing',
    commentsCount: 'Comments',
};

export function ProfileView({ endpoint = '/profile', editable = true }: { endpoint?: string; editable?: boolean }) {
    const navigate = useNavigate();
    const [profile, setProfile] = useState<any>(null);
    const [avatarUrl, setAvatarUrl] = useState('');
    const [steamProfileUrl, setSteamProfileUrl] = useState('');
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);

    const loadProfile = () => {
        api.get(endpoint)
            .then(res => {
                setProfile(res.data);
                setAvatarUrl(res.data.avatarUrl || '');
                setSteamProfileUrl(res.data.steamProfileUrl || '');
            })
            .catch(() => editable ? navigate('/login') : navigate('/'));
    };

    useEffect(() => {
        loadProfile();
    }, [endpoint]);

    const resizeAvatar = (file: File) => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read image.'));
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('Could not load image.'));
            image.onload = () => {
                const size = 320;
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const context = canvas.getContext('2d');
                if (!context) {
                    reject(new Error('Could not process image.'));
                    return;
                }

                const scale = Math.max(size / image.width, size / image.height);
                const width = image.width * scale;
                const height = image.height * scale;
                const x = (size - width) / 2;
                const y = (size - height) / 2;

                context.fillStyle = '#020617';
                context.fillRect(0, 0, size, size);
                context.drawImage(image, x, y, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.82));
            };
            image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    });

    const handleAvatarFile = async (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            setMessage('Please choose an image file.');
            return;
        }
        if (file.size > 1_500_000) {
            setMessage('Image is too large. Choose a file under 1.5 MB.');
            return;
        }

        try {
            const resizedAvatar = await resizeAvatar(file);
            setAvatarUrl(resizedAvatar);
            setMessage('Avatar selected. Save profile to apply it.');
        } catch {
            setMessage('Could not process this avatar image.');
        }
    };

    const saveProfile = async (e: any) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await api.patch('/profile', {
                avatarUrl,
                steamProfileUrl: steamProfileUrl.trim(),
            });
            setMessage('Profile saved.');
            setIsEditing(false);
            loadProfile();
        } catch (error: any) {
            setMessage(error.response?.data?.error || 'Could not save profile.');
        } finally {
            setSaving(false);
        }
    };

    if (!profile) return (
        <div className="page-enter flex flex-col items-center justify-center py-32 text-center">
            <div className="mb-5 h-12 w-12 animate-spin rounded-full border-[3px] border-cyan-400/30 border-t-cyan-400" />
            <div className="text-xl font-black text-white">Loading profile</div>
        </div>
    );

    const stats = profile.stats || {};

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="media-shell h-24 w-24 bg-slate-800">
                        {profile.avatarUrl ? (
                            <img src={profile.avatarUrl} alt={profile.username} className="h-full w-full object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center text-3xl font-black text-cyan-200">
                                {profile.username.slice(0, 2).toUpperCase()}
                            </div>
                        )}
                    </div>
                    <div>
                        <p className="eyebrow">Player Profile</p>
                        <h1 className="section-title">{profile.username}</h1>
                        <p className="section-copy">
                            Your collection stats, rating habits, favorite genres, and connected profile links.
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    {profile.steamProfileUrl && (
                        <a href={profile.steamProfileUrl} target="_blank" rel="noreferrer" className="btn-secondary">
                            Open Steam Profile
                        </a>
                    )}
                    {editable && (
                        <button type="button" onClick={() => {
                            setAvatarUrl(profile.avatarUrl || '');
                            setSteamProfileUrl(profile.steamProfileUrl || '');
                            setMessage('');
                            setIsEditing(true);
                        }} className="btn-primary">
                            Edit Profile
                        </button>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
                <main className="space-y-6">
                    <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        {Object.entries(statLabels).map(([key, label]) => (
                            <div key={key} className="stat-tile">
                                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p>
                                <p className="mt-2 text-3xl font-black text-white">{stats[key] ?? 0}</p>
                            </div>
                        ))}
                    </section>

                    <section className="surface rounded-lg p-5">
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-xl font-black text-white">Top Genres</h2>
                                <p className="mt-1 text-sm text-slate-400">Based on games in your library.</p>
                            </div>
                            {editable && <Link to="/preferences" className="btn-secondary">Tune Preferences</Link>}
                        </div>
                        {profile.topGenres.length === 0 ? (
                            <p className="text-sm text-slate-400">Add games to your library to build genre stats.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {profile.topGenres.map((item: any) => (
                                    <span key={item.genre} className="chip">{item.genre} ({item.count})</span>
                                ))}
                            </div>
                        )}
                    </section>

                    <section>
                        <div className="mb-4 flex items-center justify-between gap-4">
                            <div>
                                <h2 className="text-2xl font-black text-white">Highest Rated Games</h2>
                                <p className="mt-1 text-sm text-slate-400">Your strongest rating signals for recommendations.</p>
                            </div>
                            {editable && <Link to="/library" className="btn-secondary">Open Library</Link>}
                        </div>

                        {profile.recentRated.length === 0 ? (
                            <div className="empty-state">
                                <h3 className="text-xl font-black text-white">No ratings yet</h3>
                                <p className="mt-2 text-slate-400">Rate games from your library to personalize recommendations.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                                {profile.recentRated.map((game: any, index: number) => (
                                    <Link
                                        key={game.id}
                                        to={`/games/${game.id}`}
                                        className={`game-card group overflow-hidden animate-fade-in-up stagger-${Math.min((index % 6) + 1, 6)}`}
                                        style={{ opacity: 0 }}
                                    >
                                        <div className="card-image-wrap">
                                            <CoverArt game={game} className="card-cover transition-transform duration-500 group-hover:scale-105" />
                                        </div>
                                        <div className="p-4">
                                            <h3 className="line-clamp-2 font-black text-white transition-colors group-hover:text-cyan-100">{game.title}</h3>
                                            <p className="mt-2 text-sm font-bold text-cyan-200">{Number(game.rating).toFixed(1)} / 5</p>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </section>
                </main>

                <aside className="space-y-6">
                    <section className="surface rounded-lg p-5">
                        <h2 className="text-xl font-black text-white">Favorite Genres</h2>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {profile.favoriteGenres.length ? profile.favoriteGenres.map((genre: string) => (
                                <span key={genre} className="chip">{genre}</span>
                            )) : <p className="text-sm text-slate-400">No preferences selected yet.</p>}
                        </div>
                    </section>
                </aside>
            </div>

            {editable && isEditing && (
                <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur-sm">
                    <form onSubmit={saveProfile} className="surface-elevated w-full max-w-lg p-5">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <p className="eyebrow">Profile Settings</p>
                                <h2 className="mt-2 text-2xl font-black text-white">Edit Profile</h2>
                                <p className="mt-1 text-sm text-slate-400">Choose an avatar image and optionally connect your Steam profile.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    setIsEditing(false);
                                    setMessage('');
                                    setAvatarUrl(profile.avatarUrl || '');
                                    setSteamProfileUrl(profile.steamProfileUrl || '');
                                }}
                                className="btn-secondary px-3 py-2"
                            >
                                Close
                            </button>
                        </div>

                        <label className="mb-2 mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">Avatar Image</label>
                        <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => handleAvatarFile(e.target.files?.[0])}
                            className="field"
                        />
                        {avatarUrl && (
                            <div className="mt-3 flex items-center gap-3">
                                <div className="h-20 w-20 overflow-hidden rounded-lg border border-white/10">
                                    <img src={avatarUrl} alt="Avatar preview" className="h-full w-full object-cover" />
                                </div>
                                <button type="button" className="btn-secondary px-3 py-2 text-xs" onClick={() => setAvatarUrl('')}>
                                    Remove Avatar
                                </button>
                            </div>
                        )}

                        <label className="mb-2 mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">Steam Profile URL</label>
                        <input
                            value={steamProfileUrl}
                            onChange={(e) => setSteamProfileUrl(e.target.value)}
                            className="field"
                            placeholder="https://steamcommunity.com/id/..."
                        />

                        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => {
                                    setIsEditing(false);
                                    setMessage('');
                                    setAvatarUrl(profile.avatarUrl || '');
                                    setSteamProfileUrl(profile.steamProfileUrl || '');
                                }}
                            >
                                Cancel
                            </button>
                            <button className="btn-primary" disabled={saving}>
                                {saving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                        {message && <p className="mt-3 text-sm text-slate-300">{message}</p>}
                    </form>
                </div>
            )}
        </div>
    );
}

export default function Profile() {
    return <ProfileView />;
}
