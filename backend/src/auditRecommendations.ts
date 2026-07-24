import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { buildRecommendations } from './recommendationEngine';

dotenv.config();

const prisma = new PrismaClient();
const runId = Date.now();
const createdUserIds: string[] = [];

function parseJsonArray(value?: string | null): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
        return [];
    }
}

async function createAuditUser(username: string, favoriteGenres: string[]) {
    const user = await prisma.user.create({
        data: {
            username: `${username}-${runId}`,
            passwordHash: 'audit-only',
            emailVerified: true,
            favoriteGenres: JSON.stringify(favoriteGenres),
        },
    });
    createdUserIds.push(user.id);
    return user;
}

async function findGamesByGenre(genre: string, take: number, excludedIds: string[] = []) {
    return prisma.game.findMany({
        where: {
            id: { notIn: excludedIds },
            genres: { contains: `"${genre}"`, mode: 'insensitive' },
            coverUrl: { startsWith: 'http' },
        },
        orderBy: [{ criticScore: 'desc' }, { title: 'asc' }],
        take,
    });
}

async function findBudgetGames(take: number) {
    const prices = await prisma.storePrice.findMany({
        where: { price: { lte: 5 } },
        orderBy: [{ price: 'asc' }],
        include: { game: true },
        take: take * 4,
    });

    const byGame = new Map<string, typeof prices[number]>();
    for (const price of prices) {
        if (!byGame.has(price.gameId)) byGame.set(price.gameId, price);
    }

    return [...byGame.values()].slice(0, take);
}

async function addLibrary(userId: string, gameId: string, rating: number, status = 'Completed') {
    await prisma.userGame.create({
        data: { userId, gameId, rating, status },
    });
}

function topLine(item: any, index: number) {
    const genres = parseJsonArray(item.game.genres).join(', ') || 'No genres';
    const breakdown = item.debugBreakdown
        ? ` content=${item.debugBreakdown.contentScore} taste=${item.debugBreakdown.tasteScore} quality=${item.debugBreakdown.qualityScore} platform=${item.debugBreakdown.platformScore} price=${item.debugBreakdown.priceScore} collab=${item.debugBreakdown.collaborativeBoost} penalty=${item.debugBreakdown.penalty}`
        : '';
    return `${String(index + 1).padStart(2, '0')}. ${item.game.title} [${genres}] score=${item.score}${breakdown}`;
}

async function printScenario(title: string, userId: string) {
    const recommendations = await buildRecommendations(prisma, userId);
    console.log(`\n=== ${title} ===`);
    recommendations.slice(0, 10).forEach((item: any, index: number) => console.log(topLine(item, index)));

    const titleSimilarityWarnings = recommendations
        .filter((item: any) => item.debugBreakdown?.bestLikedTitle && item.debugBreakdown.bestLikedSharedTitleTokens < 2)
        .map((item: any) => `${item.game.title} -> ${item.debugBreakdown.bestLikedTitle} (${item.debugBreakdown.bestLikedSimilarity})`);

    if (titleSimilarityWarnings.length) {
        console.log('Title similarity guarded or genre-only matches to inspect:');
        titleSimilarityWarnings.slice(0, 5).forEach((line: string) => console.log(`  - ${line}`));
    }
}

async function run() {
    const rpgUser = await createAuditUser('audit-rpg-only', ['RPG']);
    await printScenario('Cold start with explicit RPG preference', rpgUser.id);

    const budgetUser = await createAuditUser('audit-budget-leaning', ['Casual', 'Puzzle', 'Platformer']);
    const budgetGames = await findBudgetGames(2);
    for (const item of budgetGames) {
        await addLibrary(budgetUser.id, item.gameId, 4.5);
    }
    await printScenario('Budget-leaning profile with cheap liked games', budgetUser.id);

    const [overlapGame, peerCandidate] = await findGamesByGenre('Action', 2);
    if (overlapGame && peerCandidate) {
        const currentUser = await createAuditUser('audit-collab-current', ['Action']);
        const peerUser = await createAuditUser('audit-collab-peer', ['Action']);
        await addLibrary(currentUser.id, overlapGame.id, 5);
        await addLibrary(peerUser.id, overlapGame.id, 5);
        await addLibrary(peerUser.id, peerCandidate.id, 5);
        await printScenario(`Collaborative signal via shared ${overlapGame.title}`, currentUser.id);
    } else {
        console.log('\n=== Collaborative signal ===');
        console.log('Skipped: not enough Action games found.');
    }
}

run()
    .catch(error => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        if (createdUserIds.length) {
            await prisma.userGame.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.wishlistItem.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.commentLike.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.gameComment.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.emailVerificationCode.deleteMany({ where: { userId: { in: createdUserIds } } });
            await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
        }
        await prisma.$disconnect();
    });
