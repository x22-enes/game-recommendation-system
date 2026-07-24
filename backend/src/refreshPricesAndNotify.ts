import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { findVerifiedPrices } from './priceProvider';
import { updateStorePriceAndNotify } from './storePriceService';

dotenv.config();

const prisma = new PrismaClient();
const REFRESH_LIMIT = Number(process.env.PRICE_REFRESH_LIMIT || 80);
const REQUEST_DELAY_MS = Number(process.env.PRICE_REFRESH_DELAY_MS || 350);

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function loadTrackedGames() {
    const [wishlistItems, plannedItems] = await Promise.all([
        prisma.wishlistItem.findMany({
            include: { game: true },
        }),
        prisma.userGame.findMany({
            where: { status: 'Plan to Play' },
            include: { game: true },
        }),
    ]);

    const byGameId = new Map<string, typeof wishlistItems[number]['game']>();
    for (const item of wishlistItems) byGameId.set(item.gameId, item.game);
    for (const item of plannedItems) byGameId.set(item.gameId, item.game);

    return [...byGameId.values()]
        .filter(game => game?.id && game.title)
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, Number.isFinite(REFRESH_LIMIT) && REFRESH_LIMIT > 0 ? REFRESH_LIMIT : 80);
}

async function main() {
    const games = await loadTrackedGames();
    let checked = 0;
    let offers = 0;
    let notifications = 0;

    console.log(`Refreshing prices for ${games.length} tracked games...`);

    for (const game of games) {
        checked += 1;
        const prices = await findVerifiedPrices(game.title).catch(() => []);

        for (const price of prices) {
            const result = await updateStorePriceAndNotify(prisma, {
                gameId: game.id,
                gameTitle: game.title,
                storeName: price.storeName,
                price: price.price,
                url: price.url,
                source: price.source,
            });
            offers += result.created || result.updated ? 1 : 0;
            notifications += result.notified;
        }

        console.log(`${checked}/${games.length} ${game.title}: ${prices.length} offers, ${notifications} notifications total`);
        await wait(REQUEST_DELAY_MS);
    }

    console.log(`Done. Checked ${checked} games, updated ${offers} offers, created ${notifications} notifications.`);
}

main()
    .catch(error => {
        console.error('Price refresh failed:', error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
