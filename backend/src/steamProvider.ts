import axios from 'axios';

type SteamAppDetailsResponse = {
    success?: boolean;
    data?: {
        type?: string;
        name?: string;
        steam_appid?: number;
        short_description?: string;
        detailed_description?: string;
        about_the_game?: string;
        header_image?: string;
        capsule_image?: string;
        capsule_imagev5?: string;
        background_raw?: string;
        website?: string;
        developers?: string[];
        publishers?: string[];
        release_date?: {
            coming_soon?: boolean;
            date?: string;
        };
        pc_requirements?: {
            minimum?: string;
            recommended?: string;
        } | unknown[];
        screenshots?: Array<{
            id?: number;
            path_thumbnail?: string;
            path_full?: string;
        }>;
        movies?: Array<{
            id?: number;
            name?: string;
            thumbnail?: string;
            webm?: {
                max?: string;
                480?: string;
            };
            mp4?: {
                max?: string;
                480?: string;
            };
        }>;
        genres?: Array<{ id?: string; description?: string }>;
        categories?: Array<{ id?: number; description?: string }>;
        metacritic?: {
            score?: number;
            url?: string;
        };
    };
};

export type SteamDetails = {
    appId: string;
    name: string;
    shortDescription: string;
    detailedDescription: string;
    headerImage: string;
    capsuleImage: string;
    backgroundRaw: string;
    website: string;
    developers: string[];
    publishers: string[];
    releaseDate: string;
    screenshots: string[];
    movies: Array<{
        name: string;
        thumbnail: string;
        videoUrl: string;
    }>;
    genres: string[];
    categories: string[];
    metacriticScore: number | null;
    metacriticUrl: string;
    requirements: {
        minimum: string;
        recommended: string;
    };
};

const steamDetailsCache = new Map<string, { expiresAt: number; details: SteamDetails | null }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;

export function steamAppIdFromUrl(url?: string | null) {
    const match = String(url || '').match(/store\.steampowered\.com\/app\/(\d+)/i);
    return match?.[1] || '';
}

function decodeEntities(value: string) {
    return value
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

function cleanHtml(value?: string) {
    return decodeEntities(String(value || '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim());
}

function cleanRequirement(value?: string) {
    return cleanHtml(value)
        .replace(/^Minimum:/i, '')
        .replace(/^Recommended:/i, '')
        .trim();
}

export async function fetchSteamDetails(appId: string): Promise<SteamDetails | null> {
    if (!appId) return null;

    const cached = steamDetailsCache.get(appId);
    if (cached && cached.expiresAt > Date.now()) return cached.details;

    try {
        const response = await axios.get<Record<string, SteamAppDetailsResponse>>(
            'https://store.steampowered.com/api/appdetails',
            {
                params: {
                    appids: appId,
                    filters: 'basic,genres,categories,screenshots,movies,release_date,developers,publishers,metacritic,pc_requirements',
                },
                timeout: 10000,
                headers: { 'User-Agent': 'game-recommendation-system' },
            }
        );

        const app = response.data?.[appId];
        if (!app?.success || !app.data || app.data.type !== 'game') {
            steamDetailsCache.set(appId, { expiresAt: Date.now() + CACHE_TTL_MS, details: null });
            return null;
        }

        const data = app.data;
        const requirements = Array.isArray(data.pc_requirements) ? {} : (data.pc_requirements || {});
        const details: SteamDetails = {
            appId,
            name: data.name || '',
            shortDescription: cleanHtml(data.short_description),
            detailedDescription: cleanHtml(data.about_the_game || data.detailed_description),
            headerImage: data.header_image || '',
            capsuleImage: data.capsule_imagev5 || data.capsule_image || '',
            backgroundRaw: data.background_raw || '',
            website: data.website || '',
            developers: data.developers || [],
            publishers: data.publishers || [],
            releaseDate: data.release_date?.date || '',
            screenshots: (data.screenshots || [])
                .map(screenshot => screenshot.path_full || screenshot.path_thumbnail || '')
                .filter(Boolean)
                .slice(0, 8),
            movies: (data.movies || [])
                .map(movie => ({
                    name: movie.name || 'Trailer',
                    thumbnail: movie.thumbnail || '',
                    videoUrl: movie.webm?.max || movie.mp4?.max || movie.webm?.[480] || movie.mp4?.[480] || '',
                }))
                .filter(movie => movie.videoUrl)
                .slice(0, 2),
            genres: (data.genres || []).map(item => item.description || '').filter(Boolean),
            categories: (data.categories || []).map(item => item.description || '').filter(Boolean).slice(0, 8),
            metacriticScore: typeof data.metacritic?.score === 'number' ? data.metacritic.score : null,
            metacriticUrl: data.metacritic?.url || '',
            requirements: {
                minimum: cleanRequirement(requirements.minimum),
                recommended: cleanRequirement(requirements.recommended),
            },
        };

        steamDetailsCache.set(appId, { expiresAt: Date.now() + CACHE_TTL_MS, details });
        return details;
    } catch {
        steamDetailsCache.set(appId, { expiresAt: Date.now() + 1000 * 60 * 10, details: null });
        return null;
    }
}
