import axios from 'axios';
import { Prisma, PrismaClient } from '@prisma/client';
import { inferGenresForTitle } from './genreProvider';
import { lizardByteSource } from './lizardByteProvider';

const prisma = new PrismaClient();

const GITHUB_BUCKETS_URL = 'https://api.github.com/repos/LizardByte/GameDB/contents/buckets?ref=gh-pages';
const SOURCE_NAME = 'LizardByte/GameDB';
const CHUNK_SIZE = 1000;
const FETCH_CONCURRENCY = 10;

type GitHubContent = {
    name: string;
    type: string;
    download_url?: string | null;
};

type BucketEntry = {
    name?: unknown;
};

type ImportedGame = {
    id: string;
    title: string;
};

function asString(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function titleKey(title: string) {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

async function listBucketFiles() {
    const response = await axios.get<GitHubContent[]>(GITHUB_BUCKETS_URL, {
        headers: { 'User-Agent': 'game-recommendation-system-importer' },
        timeout: 30000,
    });

    return response.data
        .filter(item => item.type === 'file' && item.name.endsWith('.json') && item.download_url)
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchBucket(file: GitHubContent) {
    const response = await axios.get<Record<string, BucketEntry>>(file.download_url!, {
        headers: { 'User-Agent': 'game-recommendation-system-importer' },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
    });

    const entries = Object.entries(response.data || {})
        .map(([id, item]) => ({ id, title: asString(item.name) }))
        .filter(item => item.id && item.title);

    return entries;
}

async function loadLizardByteIndex() {
    const files = await listBucketFiles();
    const imported = new Map<string, ImportedGame>();
    let rawRows = 0;

    for (const group of chunk(files, FETCH_CONCURRENCY)) {
        const buckets = await Promise.all(group.map(fetchBucket));

        for (const entries of buckets) {
            rawRows += entries.length;

            for (const entry of entries) {
                const key = titleKey(entry.title);
                if (!key || imported.has(key)) continue;
                imported.set(key, entry);
            }
        }

        console.log(`Read ${Math.min(rawRows, 999999).toLocaleString()} bucket entries from ${files.length} bucket files...`);
    }

    console.log(`Loaded ${rawRows.toLocaleString()} ${SOURCE_NAME} rows, ${imported.size.toLocaleString()} unique normalized titles`);
    return imported;
}

async function importMissingGames(imported: Map<string, ImportedGame>) {
    const existingGames = await prisma.game.findMany({
        select: { title: true },
    });
    const existingKeys = new Set(existingGames.map(game => titleKey(game.title)).filter(Boolean));
    const toCreate: Prisma.GameCreateManyInput[] = [];

    for (const [key, game] of imported) {
        if (existingKeys.has(key)) continue;

        toCreate.push({
            title: game.title,
            genres: inferGenresForTitle(game.title),
            platforms: JSON.stringify([]),
            description: null,
            coverUrl: null,
            source: lizardByteSource(game.id),
        });
        existingKeys.add(key);
    }

    for (const [index, batch] of chunk(toCreate, CHUNK_SIZE).entries()) {
        await prisma.game.createMany({ data: batch });
        console.log(`Inserted ${Math.min((index + 1) * CHUNK_SIZE, toCreate.length).toLocaleString()} / ${toCreate.length.toLocaleString()} missing games`);
    }

    console.log(`Missing ${SOURCE_NAME} games inserted: ${toCreate.length.toLocaleString()}`);
    return toCreate.length;
}

async function main() {
    const before = await prisma.game.count();
    console.log(`Current local games: ${before.toLocaleString()}`);

    const imported = await loadLizardByteIndex();
    const inserted = await importMissingGames(imported);

    const after = await prisma.game.count();
    console.log(`Local games after import: ${after.toLocaleString()}`);
    console.log(`Added: ${inserted.toLocaleString()}`);
}

main()
    .catch(error => {
        console.error('LizardByte/GameDB import failed:', error);
        process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
