import { PrismaClient } from '@prisma/client';
import { createPriceDropNotifications } from './notificationService';

const PRICE_DROP_THRESHOLD = 0.1;

export async function updateStorePriceAndNotify(
    prisma: PrismaClient,
    input: {
        gameId: string;
        gameTitle: string;
        storeName: string;
        price: number;
        url: string;
        source: string;
    }
) {
    const existing = await prisma.storePrice.findFirst({
        where: {
            gameId: input.gameId,
            storeName: input.storeName,
            url: input.url,
        },
    });

    if (!existing) {
        await prisma.storePrice.create({
            data: {
                gameId: input.gameId,
                storeName: input.storeName,
                price: input.price,
                url: input.url,
                source: input.source,
            },
        });
        return { created: true, updated: false, notified: 0 };
    }

    const previousPrice = existing.price;
    const hasPriceDrop = Number.isFinite(previousPrice) &&
        previousPrice > 0 &&
        input.price < previousPrice &&
        (previousPrice - input.price) / previousPrice >= PRICE_DROP_THRESHOLD;

    await prisma.storePrice.update({
        where: { id: existing.id },
        data: {
            previousPrice,
            price: input.price,
            source: input.source,
        },
    });

    const notified = hasPriceDrop
        ? await createPriceDropNotifications(prisma, {
            gameId: input.gameId,
            gameTitle: input.gameTitle,
            storeName: input.storeName,
            previousPrice,
            price: input.price,
        })
        : 0;

    return { created: false, updated: true, notified };
}
