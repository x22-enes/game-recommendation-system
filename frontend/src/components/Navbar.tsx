import { Link, NavLink, useNavigate } from 'react-router-dom';
import { clearAuthToken, useAuthToken } from '../auth';

export default function Navbar() {
    const navigate = useNavigate();
    const isLoggedIn = !!useAuthToken();

    const navClass = ({ isActive }: { isActive: boolean }) =>
        `nav-link ${isActive ? 'nav-link-active' : ''}`;

    return (
        <nav className="sticky top-0 z-30 -mx-4 mb-8 border-b border-white/[0.08] bg-[#080b10]/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <Link to="/" className="group flex shrink-0 items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-gradient-to-br from-cyan-400 to-cyan-500 text-base font-black text-slate-950 shadow-glow-cyan transition-transform duration-200 group-hover:scale-105">
                        MMM
                    </span>
                    <span>
                        <span className="block text-base font-black tracking-tight text-white transition-colors group-hover:text-cyan-200">
                            MMM Recs
                        </span>
                        <span className="block text-[0.68rem] font-medium text-slate-500">
                            Mini Mid Max recommendations
                        </span>
                    </span>
                </Link>

                <div className="nav-strip">
                    <NavLink to="/" end className={navClass}>Browse</NavLink>

                    {isLoggedIn && (
                        <span className="mx-1 hidden h-5 w-px bg-white/10 md:block" aria-hidden />
                    )}

                    {isLoggedIn ? (
                        <>
                            <NavLink to="/library" className={navClass}>Library</NavLink>
                            <NavLink to="/wishlist" className={navClass}>Wishlist</NavLink>
                            <NavLink to="/recommendations" className={navClass}>For You</NavLink>
                            <NavLink to="/preferences" className={navClass}>Preferences</NavLink>
                            <NavLink to="/profile" className={navClass}>Profile</NavLink>
                            <button onClick={() => { clearAuthToken(); navigate('/login'); }} className="btn-danger ml-1">
                                Logout
                            </button>
                        </>
                    ) : (
                        <Link to="/login" className="btn-primary ml-1">Login / Register</Link>
                    )}
                </div>
            </div>
        </nav>
    );
}
