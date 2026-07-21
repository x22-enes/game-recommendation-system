import { useEffect, useState } from 'react';

export const AUTH_TOKEN_KEY = 'token';
export const AUTH_TOKEN_CHANGED_EVENT = 'auth-token-changed';

export function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
}

export function clearAuthToken() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
}

export function useAuthToken() {
    const [token, setToken] = useState(() => getAuthToken());

    useEffect(() => {
        const syncToken = () => setToken(getAuthToken());
        window.addEventListener(AUTH_TOKEN_CHANGED_EVENT, syncToken);
        window.addEventListener('storage', syncToken);
        return () => {
            window.removeEventListener(AUTH_TOKEN_CHANGED_EVENT, syncToken);
            window.removeEventListener('storage', syncToken);
        };
    }, []);

    return token;
}
