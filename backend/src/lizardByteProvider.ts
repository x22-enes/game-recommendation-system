import axios from 'axios';

const GAMEDB_BASE_URL = 'https://app.lizardbyte.dev/GameDB';
const LIZARDBYTE_SOURCE_PREFIX = 'lizardbyte-gamedb:';

type NamedItem = {
    name?: string;
};

type ImageItem = {
    url?: string;
};

type ExternalGame = {
    url?: string;
    external_game_source?: NamedItem;
};

type LizardByteGameDetails = {
    id?: number;
    name?: string;
    summary?: string;
    storyline?: string;
    cover?: ImageItem;
    artworks?: ImageItem[];
    screenshots?: ImageItem[];
    genres?: NamedItem[];
    themes?: NamedItem[];
    platforms?: number[];
    rating?: number;
    aggregated_rating?: number;
    external_games?: ExternalGame[];
};

type LizardByteGameMetadata = {
    title?: string;
    description?: string;
    coverUrl?: string;
    genres?: string[];
    platforms?: string[];
    criticScore?: number | null;
    steamUrl?: string;
};

const detailCache = new Map<string, LizardByteGameDetails | null>();

const PLATFORM_NAMES: Record<number, string> = {
    3: 'Linux',
    6: 'PC',
    14: 'Mac',
    48: 'PlayStation',
    49: 'Xbox',
    130: 'Nintendo',
    167: 'PlayStation',
    169: 'Xbox',
};

export function lizardByteSource(gameId: string | number) {
    return `${LIZARDBYTE_SOURCE_PREFIX}${gameId}`;
}

export function lizardByteIdFromSource(source?: string | null) {
    if (!source?.startsWith(LIZARDBYTE_SOURCE_PREFIX)) return '';
    return source.slice(LIZARDBYTE_SOURCE_PREFIX.length).trim();
}

function normalizeIgdbImageUrl(url?: string, size = 't_cover_big') {
    if (!url) return '';
    const withProtocol = url.startsWith('//') ? `https:${url}` : url;
    return withProtocol.replace('/t_thumb/', `/${size}/`);
}

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}

function normalizePlatforms(platformIds?: number[]) {
    if (!Array.isArray(platformIds)) return [];
    return unique(platformIds.map(id => PLATFORM_NAMES[id]).filter(Boolean));
}

export async function fetchLizardByteGameDetails(gameId: string) {
    if (!gameId) return null;
    if (detailCache.has(gameId)) return detailCache.get(gameId) || null;

    try {
        const response = await axios.get<LizardByteGameDetails>(`${GAMEDB_BASE_URL}/games/${gameId}.json`, {
            headers: { 'User-Agent': 'game-recommendation-system' },
            timeout: 30000,
        });
        const details = response.data && typeof response.data === 'object' ? response.data : null;
        detailCache.set(gameId, details);
        return details;
    } catch {
        detailCache.set(gameId, null);
        return null;
    }
}

export function lizardByteMetadataForGame(details: LizardByteGameDetails | null): LizardByteGameMetadata {
    if (!details) return {};

    const genres = unique([
        ...(details.genres || []).map(item => item.name || ''),
        ...(details.themes || []).map(item => item.name || ''),
    ]).slice(0, 6);
    const coverUrl =
        normalizeIgdbImageUrl(details.cover?.url, 't_cover_big') ||
        normalizeIgdbImageUrl(details.artworks?.[0]?.url, 't_cover_big') ||
        normalizeIgdbImageUrl(details.screenshots?.[0]?.url, 't_screenshot_big');
    const platforms = normalizePlatforms(details.platforms);
    const criticScore = Math.round(Number(details.aggregated_rating || details.rating || 0));
    const steamUrl = details.external_games?.find(item =>
        item.external_game_source?.name === 'Steam' && item.url
    )?.url;

    return {
        title: details.name || '',
        description: details.summary || details.storyline || '',
        coverUrl,
        genres,
        platforms,
        criticScore: Number.isFinite(criticScore) && criticScore > 0 ? criticScore : null,
        steamUrl: steamUrl || '',
    };
}
