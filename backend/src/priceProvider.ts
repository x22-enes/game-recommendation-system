import axios from 'axios';
import { normalizeTitle, scoreTitleMatch } from './coverProvider';
import { ConsoleStoreName, consoleStoreForTitle } from './platformProvider';

type CheapSharkStore = {
    storeID: string;
    storeName: string;
    isActive: number;
};

type CheapSharkGame = {
    gameID: string;
    steamAppID?: string;
    cheapest?: string;
    cheapestDealID?: string;
    external: string;
};

type CheapSharkDeal = {
    dealID: string;
    storeID: string;
    title: string;
    salePrice: string;
    normalPrice: string;
    savings: string;
};

type SteamSearchItem = {
    id: number;
    name: string;
};

type SteamAppDetails = {
    success: boolean;
    data?: {
        name: string;
        is_free?: boolean;
        price_overview?: {
            final: number;
            initial: number;
            discount_percent: number;
            final_formatted?: string;
            initial_formatted?: string;
        };
    };
};

export type VerifiedPrice = {
    storeName: string;
    price: number;
    normalPrice: number;
    savings: number;
    url: string;
    source: 'cheapshark' | 'steam' | 'console-store';
    matchedTitle: string;
};

const CHEAPSHARK_BASE_URL = 'https://www.cheapshark.com/api/1.0';
const STEAM_SEARCH_URL = 'https://store.steampowered.com/api/storesearch/';
const STEAM_APP_DETAILS_URL = 'https://store.steampowered.com/api/appdetails';

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

const CONSOLE_STORE_SEARCH_URLS: Record<ConsoleStoreName, string> = {
    'Nintendo eShop': 'https://www.nintendo.com/us/search/#q=',
    'PlayStation Store': 'https://store.playstation.com/en-us/search/',
    'Xbox Store': 'https://www.xbox.com/en-us/search?q=',
};

let storeNameCache: Record<string, string> | null = null;

async function getStoreNames() {
    if (storeNameCache) return storeNameCache;

    const response = await axios.get<CheapSharkStore[]>(`${CHEAPSHARK_BASE_URL}/stores`, { timeout: 8000 });
    storeNameCache = {};

    for (const store of response.data) {
        if (store.isActive) storeNameCache[store.storeID] = store.storeName;
    }

    return storeNameCache;
}

function asMoney(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isStrongMatch(queryTitle: string, candidateTitle: string) {
    return scoreTitleMatch(queryTitle, candidateTitle) >= 82;
}

async function findCheapSharkGame(title: string) {
    const response = await axios.get<CheapSharkGame[]>(`${CHEAPSHARK_BASE_URL}/games`, {
        params: { title, limit: 20 },
        timeout: 8000,
    });

    return (response.data || [])
        .map(game => ({ game, score: scoreTitleMatch(title, game.external) }))
        .filter(result => result.score >= 82)
        .sort((a, b) => b.score - a.score)[0]?.game || null;
}

async function findSteamAppId(title: string) {
    const overrideAppId = STEAM_APP_OVERRIDES[normalizeTitle(title)];
    if (overrideAppId) return overrideAppId;

    const response = await axios.get(STEAM_SEARCH_URL, {
        params: { term: title, cc: 'us', l: 'en' },
        timeout: 8000,
    });

    const items: SteamSearchItem[] = response.data?.items || [];
    return items
        .map(item => ({ item, score: scoreTitleMatch(title, item.name) }))
        .filter(result => result.score >= 82)
        .sort((a, b) => b.score - a.score)[0]?.item.id || null;
}

async function findSteamPrice(title: string): Promise<VerifiedPrice | null> {
    try {
        const appId = await findSteamAppId(title);
        if (!appId) return null;

        const response = await axios.get<Record<string, SteamAppDetails>>(STEAM_APP_DETAILS_URL, {
            params: {
                appids: appId,
                cc: 'us',
                l: 'en',
                filters: 'price_overview,basic',
            },
            timeout: 8000,
        });

        const details = response.data?.[String(appId)];
        if (!details?.success || !details.data) return null;

        if (details.data.is_free) {
            return {
                storeName: 'Steam',
                price: 0,
                normalPrice: 0,
                savings: 0,
                url: `https://store.steampowered.com/app/${appId}`,
                source: 'steam',
                matchedTitle: details.data.name,
            };
        }

        const price = details.data.price_overview;
        if (!price) return null;

        return {
            storeName: 'Steam',
            price: price.final / 100,
            normalPrice: price.initial / 100,
            savings: price.discount_percent,
            url: `https://store.steampowered.com/app/${appId}`,
            source: 'steam',
            matchedTitle: details.data.name,
        };
    } catch {
        return null;
    }
}

function searchUrl(baseUrl: string, title: string) {
    return `${baseUrl}${encodeURIComponent(title)}`;
}

function findConsoleStorePrice(title: string): VerifiedPrice | null {
    const consoleStore = consoleStoreForTitle(title);
    if (!consoleStore) return null;

    return {
        storeName: consoleStore.storeName,
        price: consoleStore.price,
        normalPrice: consoleStore.price,
        savings: 0,
        url: searchUrl(CONSOLE_STORE_SEARCH_URLS[consoleStore.storeName], title),
        source: 'console-store',
        matchedTitle: title,
    };
}

async function findCheapSharkPrices(title: string): Promise<VerifiedPrice[]> {
    const matchedGame = await findCheapSharkGame(title);
    if (!matchedGame) return [];

    const [stores, response] = await Promise.all([
        getStoreNames(),
        axios.get<CheapSharkDeal[]>(`${CHEAPSHARK_BASE_URL}/deals`, {
            params: {
                title: matchedGame.external,
                exact: 1,
                pageSize: 60,
                sortBy: 'Price',
            },
            timeout: 8000,
        }),
    ]);

    const byStore = new Map<string, VerifiedPrice>();

    for (const deal of response.data || []) {
        if (!deal.dealID || !isStrongMatch(matchedGame.external, deal.title)) continue;

        const price: VerifiedPrice = {
            storeName: stores[deal.storeID] || `Store #${deal.storeID}`,
            price: asMoney(deal.salePrice),
            normalPrice: asMoney(deal.normalPrice),
            savings: Number(deal.savings || 0),
            url: `https://www.cheapshark.com/redirect?dealID=${deal.dealID}`,
            source: 'cheapshark',
            matchedTitle: deal.title,
        };

        const existing = byStore.get(price.storeName);
        if (!existing || price.price < existing.price) byStore.set(price.storeName, price);
    }

    return [...byStore.values()].sort((a, b) => a.price - b.price).slice(0, 8);
}

export async function findVerifiedPrices(title: string): Promise<VerifiedPrice[]> {
    const [cheapSharkPrices, steamPrice, consolePrice] = await Promise.all([
        findCheapSharkPrices(title).catch(() => []),
        findSteamPrice(title),
        Promise.resolve(findConsoleStorePrice(title)),
    ]);

    const byStore = new Map<string, VerifiedPrice>();
    for (const price of cheapSharkPrices) byStore.set(price.storeName, price);
    if (steamPrice) byStore.set('Steam', steamPrice);
    if (consolePrice) byStore.set(consolePrice.storeName, consolePrice);

    return [...byStore.values()].sort((a, b) => a.price - b.price).slice(0, 8);
}
