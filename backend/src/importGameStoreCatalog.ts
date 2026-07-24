import axios from 'axios';
import { Prisma, PrismaClient } from '@prisma/client';
import { inferGenresForTitle } from './genreProvider';
import { updateStorePriceAndNotify } from './storePriceService';

const prisma = new PrismaClient();

const GITHUB_API_BASE = 'https://api.github.com/repos/Ephellon/game-store-catalog/contents';
const CATALOG_SOURCE = 'game-store-catalog';
const IMPORT_DIRS = ['steam', 'epic', 'nintendo', 'psn', 'ps4', 'ps5', 'xbox', 'xbox-console', 'xbox-pc'];
const CHUNK_SIZE = 500;

type GitHubContent = {
    name: string;
    type: string;
    download_url?: string | null;
};

type CatalogItem = {
    name?: unknown;
    type?: unknown;
    price?: unknown;
    image?: unknown;
    href?: unknown;
    platforms?: unknown;
};

type CatalogPrice = {
    storeName: string;
    price: number;
    url: string;
};

type ImportedGame = {
    title: string;
    coverUrl: string;
    platforms: Set<string>;
    prices: Map<string, CatalogPrice>;
};

const STORE_NAMES: Record<string, string> = {
    steam: 'Steam',
    epic: 'Epic Games Store',
    nintendo: 'Nintendo eShop',
    psn: 'PlayStation Store',
    ps4: 'PlayStation Store',
    ps5: 'PlayStation Store',
    xbox: 'Xbox Store',
    'xbox-console': 'Xbox Store',
    'xbox-pc': 'Xbox Store',
};

function asString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function catalogTitleKey(title: string) {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function parsePrice(value: unknown) {
    const text = asString(value);
    if (!text || /unavailable|not available|coming soon/i.test(text)) return null;
    if (/free/i.test(text)) return 0;

    const match = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
    if (!match) return null;

    const price = Number(match[1]);
    return Number.isFinite(price) ? price : null;
}

function platformAliasesForStore(storeDir: string) {
    const aliases = new Set<string>();
    if (storeDir === 'steam' || storeDir === 'epic' || storeDir === 'xbox-pc') aliases.add('PC');
    if (storeDir === 'nintendo') aliases.add('Nintendo');
    if (storeDir === 'psn' || storeDir === 'ps4' || storeDir === 'ps5') aliases.add('PlayStation');
    if (storeDir === 'xbox' || storeDir === 'xbox-console') aliases.add('Xbox');
    return aliases;
}

function normalizePlatforms(storeDir: string, rawPlatforms: unknown) {
    const platforms = platformAliasesForStore(storeDir);
    const values = Array.isArray(rawPlatforms) ? rawPlatforms.map(asString) : [];

    for (const value of values) {
        const normalized = value.toLowerCase();
        if (/windows|mac|linux|pc|handheld/.test(normalized)) platforms.add('PC');
        if (/playstation|ps4|ps5/.test(normalized)) platforms.add('PlayStation');
        if (/xbox|xcloud/.test(normalized)) platforms.add('Xbox');
        if (/switch|nintendo/.test(normalized)) platforms.add('Nintendo');
    }

    return platforms;
}

function preferCover(current: string, candidate: string) {
    if (!current) return candidate;
    if (!candidate) return current;
    if (/header\.jpg/i.test(current) && !/header\.jpg/i.test(candidate)) return candidate;
    return current;
}

function chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function listJsonFiles(storeDir: string) {
    const response = await axios.get<GitHubContent[]>(`${GITHUB_API_BASE}/${storeDir}`, {
        headers: { 'User-Agent': 'game-recommendation-system-importer' },
        timeout: 30000,
    });

    return response.data.filter(file =>
        file.type === 'file' &&
        file.name.endsWith('.json') &&
        file.download_url
    );
}

async function fetchCatalogItems(downloadUrl: string) {
    const response = await axios.get<CatalogItem[]>(downloadUrl, {
        headers: { 'User-Agent': 'game-recommendation-system-importer' },
        timeout: 180000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    return Array.isArray(response.data) ? response.data : [];
}

async function loadCatalog() {
    const imported = new Map<string, ImportedGame>();
    let rawItems = 0;

    for (const storeDir of IMPORT_DIRS) {
        const files = await listJsonFiles(storeDir);
        console.log(`Reading ${storeDir}: ${files.length} files`);

        for (const file of files) {
            const items = await fetchCatalogItems(file.download_url!);
            rawItems += items.length;

            for (const item of items) {
                if (asString(item.type).toLowerCase() !== 'game') continue;

                const title = asString(item.name);
                const key = catalogTitleKey(title);
                if (!key) continue;

                const coverUrl = asString(item.image);
                const href = asString(item.href);
                const platforms = normalizePlatforms(storeDir, item.platforms);
                const price = parsePrice(item.price);

                const existing = imported.get(key);
                const game = existing || {
                    title,
                    coverUrl: '',
                    platforms: new Set<string>(),
                    prices: new Map<string, CatalogPrice>(),
                };

                game.coverUrl = preferCover(game.coverUrl, coverUrl);
                platforms.forEach(platform => game.platforms.add(platform));

                if (price !== null && href) {
                    const storeName = STORE_NAMES[storeDir] || storeDir;
                    game.prices.set(`${storeName}|${href}`, { storeName, price, url: href });
                }

                imported.set(key, game);
            }

            console.log(`  ${storeDir}/${file.name}: ${items.length} entries`);
        }
    }

    console.log(`Loaded ${rawItems} catalog rows, ${imported.size} unique game titles`);
    return imported;
}

async function importGames(imported: Map<string, ImportedGame>) {
    const existingGames = await prisma.game.findMany({
        select: { id: true, title: true, coverUrl: true, platforms: true, description: true, source: true },
    });
    const existingByKey = new Map(existingGames.map(game => [catalogTitleKey(game.title), game]));

    const toCreate: Prisma.GameCreateManyInput[] = [];
    let updated = 0;

    for (const [key, game] of imported) {
        const platforms = JSON.stringify([...game.platforms].sort());
        const existing = existingByKey.get(key);

        if (!existing) {
            toCreate.push({
                title: game.title,
                genres: inferGenresForTitle(game.title),
                platforms,
                description: `Store catalog entry imported from Ephellon/game-store-catalog for ${game.title}.`,
                coverUrl: game.coverUrl,
                source: CATALOG_SOURCE,
            });
            continue;
        }

        const data: Prisma.GameUpdateInput = {};
        if (!existing.coverUrl && game.coverUrl) data.coverUrl = game.coverUrl;
        if (!existing.platforms || existing.platforms === '[]') data.platforms = platforms;
        if (!existing.description) data.description = `Store catalog entry imported from Ephellon/game-store-catalog for ${game.title}.`;
        if (!existing.source) data.source = CATALOG_SOURCE;

        if (Object.keys(data).length > 0) {
            await prisma.game.update({ where: { id: existing.id }, data });
            updated++;
        }
    }

    for (const batch of chunk(toCreate, CHUNK_SIZE)) {
        await prisma.game.createMany({ data: batch });
        console.log(`Inserted ${Math.min(toCreate.indexOf(batch[0]) + batch.length, toCreate.length)} / ${toCreate.length} games`);
    }

    console.log(`Games inserted: ${toCreate.length}, updated: ${updated}`);
}

async function importPrices(imported: Map<string, ImportedGame>) {
    const games = await prisma.game.findMany({ select: { id: true, title: true } });
    const gameByKey = new Map(games.map(game => [catalogTitleKey(game.title), game]));
    let updated = 0;

    for (const [key, game] of imported) {
        const localGame = gameByKey.get(key);
        if (!localGame) continue;

        for (const price of game.prices.values()) {
            const result = await updateStorePriceAndNotify(prisma, {
                gameId: localGame.id,
                gameTitle: localGame.title,
                storeName: price.storeName,
                price: price.price,
                url: price.url,
                source: CATALOG_SOURCE,
            });
            if (result.created || result.updated) updated++;
        }
    }

    console.log(`Store prices updated: ${updated}`);
}

async function main() {
    const imported = await loadCatalog();
    await importGames(imported);
    await importPrices(imported);
}

main()
    .catch(error => {
        console.error('Catalog import failed:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
