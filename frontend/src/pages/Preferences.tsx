import { useEffect, useState } from 'react';
import api from '../api';

export default function Preferences() {
    const [availableGenres, setAvailableGenres] = useState<string[]>([]);
    const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        api.get('/preferences')
            .then(res => {
                setAvailableGenres(res.data.availableGenres || []);
                setFavoriteGenres(res.data.favoriteGenres || []);
            })
            .catch(() => setMessage('Could not load preferences. Please log in again.'));
    }, []);

    const toggleGenre = (genre: string) => {
        setMessage('');
        setFavoriteGenres(current => {
            if (current.includes(genre)) return current.filter(item => item !== genre);
            if (current.length >= 8) {
                setMessage('Choose up to 8 favorite genres for cleaner recommendations.');
                return current;
            }
            return [...current, genre];
        });
    };

    const save = async () => {
        setSaving(true);
        setMessage('');
        try {
            const res = await api.patch('/preferences', { favoriteGenres });
            setFavoriteGenres(res.data.favoriteGenres || []);
            setMessage('Preferences saved. Your recommendations will use these genres.');
        } catch {
            setMessage('Could not save preferences.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="page-enter">
            <div className="page-heading">
                <div>
                    <p className="eyebrow">Tuning</p>
                    <h1 className="section-title">Recommendation Preferences</h1>
                    <p className="section-copy">
                        Pick the genres you most want the engine to prioritize. Ratings still matter, but this gives the system a clearer signal.
                    </p>
                </div>
                <button onClick={save} disabled={saving} className="btn-primary disabled:cursor-not-allowed disabled:opacity-60">
                    {saving ? 'Saving...' : 'Save Preferences'}
                </button>
            </div>

            {message && (
                <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                    {message}
                </div>
            )}

            <section className="surface rounded-lg p-5">
                <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-xl font-black text-white">Favorite Genres</h2>
                        <p className="mt-1 text-sm text-slate-400">Selected {favoriteGenres.length} of 8.</p>
                    </div>
                    <button
                        onClick={() => setFavoriteGenres([])}
                        className="btn-secondary"
                        type="button"
                    >
                        Clear
                    </button>
                </div>

                <div className="flex flex-wrap gap-2">
                    {availableGenres.map(genre => {
                        const selected = favoriteGenres.includes(genre);
                        return (
                            <button
                                key={genre}
                                onClick={() => toggleGenre(genre)}
                                className={selected ? 'genre-chip-active' : 'genre-chip'}
                                type="button"
                            >
                                {genre}
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}
