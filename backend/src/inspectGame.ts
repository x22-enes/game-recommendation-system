import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();
const searchTitle = process.argv.slice(2).join(' ').trim() || 'Elden Ring';

async function ratingSummary(gameId: string) {
    const ratings = await prisma.userGame.findMany({
        where: { gameId, rating: { not: null } },
        select: { rating: true },
    });

    const count = ratings.length;
    const average = count
        ? Number((ratings.reduce((sum, item) => sum + (item.rating || 0), 0) / count).toFixed(2))
        : null;

    return { average, count };
}

async function main() {
    const games = await prisma.game.findMany({
        where: { title: { contains: searchTitle, mode: 'insensitive' } },
        include: {
            storePrices: {
                orderBy: [{ price: 'asc' }, { storeName: 'asc' }],
            },
        },
        orderBy: [{ criticScore: 'desc' }, { title: 'asc' }],
        take: 10,
    });

    if (games.length === 0) {
        console.log(`No games found for "${searchTitle}".`);
        return;
    }

    for (const game of games) {
        const summary = await ratingSummary(game.id);
        const bestPrice = game.storePrices[0] || null;

        console.log(JSON.stringify({
            id: game.id,
            title: game.title,
            source: game.source,
            genres: game.genres ? JSON.parse(game.genres) : [],
            platforms: game.platforms ? JSON.parse(game.platforms) : [],
            criticScore: game.criticScore,
            criticSource: game.criticSource,
            ratingSummary: summary,
            bestPrice: bestPrice
                ? {
                    storeName: bestPrice.storeName,
                    price: bestPrice.price,
                    url: bestPrice.url,
                    source: bestPrice.source,
                }
                : null,
            storePrices: game.storePrices.map(price => ({
                storeName: price.storeName,
                price: price.price,
                url: price.url,
                source: price.source,
            })),
        }, null, 2));
    }
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
