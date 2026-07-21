import axios from 'axios';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();
const RAWG_API_KEY = process.env.RAWG_API_KEY;

const normalizeTitle = (value: string) =>
    value
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .replace(/\b(game of the year|goty|remastered|remake|definitive|complete|edition|deluxe)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

const scoreTitleMatch = (expected: string, actual: string) => {
    const expectedTitle = normalizeTitle(expected);
    const actualTitle = normalizeTitle(actual);
    if (!expectedTitle || !actualTitle) return 0;
    if (expectedTitle === actualTitle) return 100;
    if (actualTitle.includes(expectedTitle) || expectedTitle.includes(actualTitle)) return 90;

    const expectedWords = new Set(expectedTitle.split(' '));
    const actualWords = new Set(actualTitle.split(' '));
    const overlap = [...expectedWords].filter(word => actualWords.has(word)).length;
    return Math.round((overlap / Math.max(expectedWords.size, actualWords.size)) * 100);
};

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function findCriticScore(title: string) {
    if (!RAWG_API_KEY) return null;

    try {
        const response = await axios.get('https://api.rawg.io/api/games', {
            params: {
                key: RAWG_API_KEY,
                search: title,
                search_precise: true,
                page_size: 10,
            },
            timeout: 10000,
        });

        const results = Array.isArray(response.data?.results) ? response.data.results : [];
        const best = results
            .map((game: any) => ({
                game,
                matchScore: scoreTitleMatch(title, String(game.name || '')),
            }))
            .filter((item: any) => item.matchScore >= 78 && Number.isFinite(item.game.metacritic))
            .sort((a: any, b: any) => b.matchScore - a.matchScore || (b.game.metacritic || 0) - (a.game.metacritic || 0))[0];

        if (!best) return null;

        return {
            criticScore: Number(best.game.metacritic),
            criticSource: 'RAWG / Metacritic',
        };
    } catch (error) {
        console.warn(`Could not fetch critic score for ${title}`);
        return null;
    }
}

async function main() {
    const games = await prisma.game.findMany({
        orderBy: { title: 'asc' },
        select: { id: true, title: true, criticScore: true },
    });

    let updated = 0;
    let missing = 0;

    for (const game of games) {
        const score = await findCriticScore(game.title);
        if (score) {
            await prisma.game.update({
                where: { id: game.id },
                data: score,
            });
            updated += 1;
            console.log(`${game.title}: ${score.criticScore}`);
        } else {
            missing += 1;
            console.log(`${game.title}: no critic score found`);
        }

        await wait(180);
    }

    console.log(`Done. Updated ${updated}, missing ${missing}.`);
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
