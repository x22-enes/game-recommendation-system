import { PrismaClient } from '@prisma/client';

type NotificationType = 'price_drop' | 'comment_reply' | 'comment_like';

export async function createNotification(
    prisma: PrismaClient,
    input: {
        userId: string;
        type: NotificationType;
        title: string;
        body: string;
        link?: string | null;
    }
) {
    return prisma.notification.create({
        data: {
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link || null,
        },
    });
}

export async function createPriceDropNotifications(
    prisma: PrismaClient,
    input: {
        gameId: string;
        gameTitle: string;
        storeName: string;
        previousPrice: number;
        price: number;
    }
) {
    const [wishlistItems, plannedLibraryItems] = await Promise.all([
        prisma.wishlistItem.findMany({
            where: { gameId: input.gameId },
            select: { userId: true },
        }),
        prisma.userGame.findMany({
            where: { gameId: input.gameId, status: 'Plan to Play' },
            select: { userId: true },
        }),
    ]);

    const userIds = [...new Set([
        ...wishlistItems.map(item => item.userId),
        ...plannedLibraryItems.map(item => item.userId),
    ])];

    if (userIds.length === 0) return 0;

    await prisma.notification.createMany({
        data: userIds.map(userId => ({
            userId,
            type: 'price_drop',
            title: `${input.gameTitle} is on sale`,
            body: `${input.storeName}: was $${input.previousPrice.toFixed(2)}, now $${input.price.toFixed(2)}`,
            link: `/games/${input.gameId}`,
        })),
    });

    return userIds.length;
}
