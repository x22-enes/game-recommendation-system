import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { setAuthToken } from '../auth';

type AuthMode = 'login' | 'register';

const siteHighlights = [
    {
        title: 'Mini',
        copy: 'MiniMidMax indie game recommendations for quick, focused, and easy-to-start games.',
    },
    {
        title: 'Mid',
        copy: 'Best low-spec PC game recommendations for balanced games that fit everyday play.',
    },
    {
        title: 'Max',
        copy: 'Short story games recommendations plus deeper premium picks when you want a bigger experience.',
    },
];

export default function Login() {
    const [user, setUser] = useState('');
    const [pwd, setPwd] = useState('');
    const [mode, setMode] = useState<AuthMode>('login');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: any) => {
        e.preventDefault();
        setError('');
        setNotice('');
        setLoading(true);
        try {
            if (mode === 'register') {
                const res = await api.post('/auth/register', { username: user, password: pwd });
                setAuthToken(res.data.token);
                navigate('/');
                return;
            }

            const res = await api.post('/auth/login', { username: user, password: pwd });
            setAuthToken(res.data.token);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (nextMode: AuthMode) => {
        setMode(nextMode);
        setError('');
        setNotice('');
    };

    const title = mode === 'register' ? 'Register' : 'Login';
    const eyebrow = mode === 'register' ? 'Create account' : 'Sign in';

    return (
        <div className="page-enter mx-auto grid max-w-5xl gap-8 lg:grid-cols-[1fr_24rem] lg:items-center">
            <section className="surface-elevated rounded-xl p-6 sm:p-8">
                <p className="eyebrow">Built by gamer for gamers</p>
                <h1 className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
                    MMM Recs finds your next game.
                </h1>
                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                    MMM Recs is a MiniMidMax game discovery system: Mini for light and low-spec picks, Mid for balanced everyday games, and Max for deeper premium titles.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-3">
                    {siteHighlights.map((item) => (
                        <div key={item.title} className="rounded-lg border border-white/10 bg-white/5 p-4 transition-colors duration-200 hover:border-cyan-400/20 hover:bg-white/[0.07]">
                            <p className="text-sm font-black text-white">{item.title}</p>
                            <p className="mt-2 text-xs leading-5 text-slate-500">{item.copy}</p>
                        </div>
                    ))}
                </div>

                <div className="mt-6 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] p-4">
                    <p className="text-sm font-bold text-cyan-100">How Mini / Mid / Max scores work</p>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        Each game gets Mini, Mid, and Max scores from its genre, platform, price, critic data, and your own library signals. The highest score shows the best way to approach that game.
                    </p>
                </div>
            </section>

            <form onSubmit={handleSubmit} className="surface-elevated rounded-xl p-6" autoComplete="on">
                <div className="mb-6">
                    <p className="eyebrow">{eyebrow}</p>
                    <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
                    <p className="mt-2 text-sm text-slate-400">
                        {mode === 'login'
                            ? 'Enter your username and password to continue.'
                            : 'Choose a username and password. No extra code is required.'}
                    </p>
                </div>

                {error && <div className="mb-4 rounded-md border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-100">{error}</div>}
                {notice && <div className="mb-4 rounded-md border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">{notice}</div>}

                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
                    Username
                </label>
                <input
                    className="field mb-4"
                    value={user}
                    onChange={e => setUser(e.target.value)}
                    placeholder="Username"
                    autoComplete="username"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                />

                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Password</label>
                <input
                    className="field mb-6"
                    type="password"
                    value={pwd}
                    onChange={e => setPwd(e.target.value)}
                    placeholder="Password"
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    required
                    minLength={mode === 'register' ? 8 : 1}
                />

                <button className="btn-primary mb-4 w-full" disabled={loading}>
                    {loading ? 'Please wait...' : mode === 'register' ? 'Create Account' : 'Login'}
                </button>

                {mode === 'login' ? (
                    <button type="button" onClick={() => switchMode('register')} className="w-full rounded-md px-4 py-2 text-sm font-bold text-cyan-200 transition hover:bg-white/5">
                        Need an account? Register
                    </button>
                ) : (
                    <button type="button" onClick={() => switchMode('login')} className="w-full rounded-md px-4 py-2 text-sm font-bold text-cyan-200 transition hover:bg-white/5">
                        Back to login
                    </button>
                )}
            </form>
        </div>
    );
}
