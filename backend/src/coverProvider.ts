import axios from 'axios';

type SteamSearchItem = {
    id: number;
    name: string;
};

type IgdbGame = {
    name: string;
    cover?: {
        image_id?: string;
    };
};

type WikidataSearchResult = {
    id: string;
    label?: string;
    description?: string;
};

type RawgGame = {
    name: string;
    background_image?: string | null;
};

const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_COVER_CDN = 'https://cdn.akamai.steamstatic.com/steam/apps';
const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const RAWG_SEARCH_URL = 'https://api.rawg.io/api/games';
const WIKIMEDIA_HEADERS = {
    'User-Agent': 'game-recommendation-system/1.0 (local capstone project)',
};

let igdbAccessToken: string | null = null;
let igdbTokenExpiresAt = 0;

const removeEditionNoise = (value: string) =>
    value
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(remastered|remake|definitive edition|game of the year|goty|complete edition|standard edition)\b/gi, ' ')
        .replace(/\b(part|episode)\s+/gi, ' ')
        .replace(/&/g, ' and ');

export function normalizeTitle(value: string) {
    return removeEditionNoise(value)
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

const STEAM_APP_OVERRIDES: Record<string, number> = {
    [normalizeTitle("Assassin's Creed II")]: 33230,
    [normalizeTitle('Battlefield Bad Company 2')]: 24960,
    [normalizeTitle('BioShock Infinite')]: 8870,
    [normalizeTitle('Control')]: 870780,
    [normalizeTitle('DOOM (2016)')]: 379720,
    [normalizeTitle('Dead Space Remake')]: 1693980,
    [normalizeTitle('God of War (2018)')]: 1593500,
    [normalizeTitle('Overwatch 2')]: 2357570,
    [normalizeTitle('Resident Evil Remake')]: 304240,
    [normalizeTitle('Resident Evil 2 Remake')]: 883710,
    [normalizeTitle('Resident Evil 3 Remake')]: 952060,
    [normalizeTitle('Resident Evil 4 Remake')]: 2050650,
    [normalizeTitle('Resident Evil 7: Biohazard')]: 418370,
    [normalizeTitle('Rocket League')]: 252950,
    [normalizeTitle('The Elder Scrolls IV: Oblivion')]: 22330,
    [normalizeTitle('Yakuza 0')]: 638970,
    [normalizeTitle('Yakuza Kiwami')]: 834530,
};

export function scoreTitleMatch(queryTitle: string, candidateTitle: string) {
    const query = normalizeTitle(queryTitle);
    const candidate = normalizeTitle(candidateTitle);
    if (!query || !candidate) return 0;
    if (query === candidate) return 100;

    const queryTokens = new Set(query.split(' '));
    const candidateTokens = new Set(candidate.split(' '));
    const shared = [...queryTokens].filter(token => candidateTokens.has(token));
    const coverage = shared.length / queryTokens.size;

    if (candidate.includes(query) || query.includes(candidate)) return Math.max(82, coverage * 95);
    return coverage * 80;
}

async function imageExists(url: string) {
    try {
        const response = await axios.head(url, { timeout: 5000 });
        return response.status >= 200 && response.status < 400;
    } catch {
        return false;
    }
}

function escapeIgdbSearch(value: string) {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function getIgdbToken() {
    const clientId = process.env.IGDB_CLIENT_ID;
    const clientSecret = process.env.IGDB_CLIENT_SECRET;
    if (!clientId || !clientSecret) return null;

    if (igdbAccessToken && Date.now() < igdbTokenExpiresAt) return igdbAccessToken;

    const response = await axios.post(TWITCH_TOKEN_URL, null, {
        params: {
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: 'client_credentials',
        },
        timeout: 8000,
    });

    igdbAccessToken = response.data.access_token;
    igdbTokenExpiresAt = Date.now() + Math.max(60, response.data.expires_in - 300) * 1000;
    return igdbAccessToken;
}

async function findIgdbCover(title: string): Promise<string | null> {
    try {
        const clientId = process.env.IGDB_CLIENT_ID;
        const token = await getIgdbToken();
        if (!clientId || !token) return null;

        const response = await axios.post(
            IGDB_GAMES_URL,
            `search "${escapeIgdbSearch(title)}"; fields name,cover.image_id; limit 10;`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Client-ID': clientId,
                    'Authorization': `Bearer ${token}`,
                },
                timeout: 8000,
            }
        );

        const games: IgdbGame[] = response.data || [];
        const best = games
            .map(game => ({ game, score: scoreTitleMatch(title, game.name) }))
            .filter(result => result.score >= 72 && result.game.cover?.image_id)
            .sort((a, b) => b.score - a.score)[0];

        return best?.game.cover?.image_id
            ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${best.game.cover.image_id}.jpg`
            : null;
    } catch {
        return null;
    }
}

async function findRawgCover(title: string): Promise<string | null> {
    try {
        const apiKey = process.env.RAWG_API_KEY;
        if (!apiKey) return null;

        const response = await axios.get(RAWG_SEARCH_URL, {
            params: {
                key: apiKey,
                search: title,
                page_size: 10,
                search_precise: true,
            },
            timeout: 8000,
        });

        const games: RawgGame[] = response.data?.results || [];
        const best = games
            .map(game => ({ game, score: scoreTitleMatch(title, game.name) }))
            .filter(result => result.score >= 82 && result.game.background_image)
            .sort((a, b) => b.score - a.score)[0];

        return best?.game.background_image || null;
    } catch {
        return null;
    }
}

function wikimediaFileUrl(filename: string) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=600`;
}

function looksLikeScreenshot(filename: string) {
    return /screenshot|gameplay|screen\s?shot/i.test(filename);
}

async function findWikidataCover(title: string): Promise<string | null> {
    try {
        const searchResponse = await axios.get(WIKIDATA_API_URL, {
            params: {
                action: 'wbsearchentities',
                search: title,
                language: 'en',
                format: 'json',
                limit: 8,
            },
            headers: WIKIMEDIA_HEADERS,
            timeout: 8000,
        });

        const candidates: WikidataSearchResult[] = searchResponse.data?.search || [];
        const best = candidates
            .map(item => ({
                item,
                score: scoreTitleMatch(title, item.label || ''),
                description: (item.description || '').toLowerCase(),
            }))
            .filter(result =>
                result.score >= 82 &&
                (result.description.includes('video game') || result.description.includes('game'))
            )
            .sort((a, b) => b.score - a.score)[0];

        if (!best?.item?.id) return null;

        const entityResponse = await axios.get(WIKIDATA_API_URL, {
            params: {
                action: 'wbgetentities',
                ids: best.item.id,
                props: 'claims',
                format: 'json',
            },
            headers: WIKIMEDIA_HEADERS,
            timeout: 8000,
        });

        const imageClaim = entityResponse.data?.entities?.[best.item.id]?.claims?.P18?.[0];
        const filename = imageClaim?.mainsnak?.datavalue?.value;
        if (!filename || looksLikeScreenshot(filename)) return null;

        return wikimediaFileUrl(filename);
    } catch {
        return null;
    }
}

export async function findBestCover(title: string): Promise<string | null> {
    try {
        const igdbCover = await findIgdbCover(title);
        if (igdbCover) return igdbCover;

        const overrideAppId = STEAM_APP_OVERRIDES[normalizeTitle(title)];
        if (overrideAppId) {
            const coverUrl = `${STEAM_COVER_CDN}/${overrideAppId}/library_600x900.jpg`;
            if (await imageExists(coverUrl)) return coverUrl;
        }

        const response = await axios.get(STEAM_SEARCH_URL, {
            params: { term: title, cc: 'us', l: 'en' },
            timeout: 8000,
        });

        const items: SteamSearchItem[] = response.data?.items || [];
        const best = items
            .map(item => ({ item, score: scoreTitleMatch(title, item.name) }))
            .filter(result => result.score >= 72)
            .sort((a, b) => b.score - a.score)[0];

        if (!best?.item?.id) {
            const rawgCover = await findRawgCover(title);
            return rawgCover || await findWikidataCover(title);
        }

        const coverUrl = `${STEAM_COVER_CDN}/${best.item.id}/library_600x900.jpg`;
        if (await imageExists(coverUrl)) return coverUrl;

        const rawgCover = await findRawgCover(title);
        return rawgCover || await findWikidataCover(title);
    } catch {
        const rawgCover = await findRawgCover(title);
        return rawgCover || await findWikidataCover(title);
    }
}
