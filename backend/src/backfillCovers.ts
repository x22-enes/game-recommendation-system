import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { findBestCover } from './coverProvider';

dotenv.config();

const prisma = new PrismaClient();

const hasUsableCover = (coverUrl?: string | null) =>
    Boolean(coverUrl && coverUrl.startsWith('http') && !coverUrl.includes('screenshot'));

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
    const games = await prisma.game.findMany({ orderBy: { title: 'asc' } });
    let updated = 0;
    let skipped = 0;

    for (const game of games) {
        if (hasUsableCover(game.coverUrl)) {
            skipped++;
            continue;
        }

        await wait(700);
        const coverUrl = await findBestCover(game.title);
        if (!coverUrl) {
            skipped++;
            console.log(`No confident cover: ${game.title}`);
            continue;
        }

        await prisma.game.update({
            where: { id: game.id },
            data: { coverUrl, source: 'cover-provider' },
        });

        updated++;
        console.log(`Updated: ${game.title}`);
    }

    console.log(`Cover backfill complete. Updated ${updated}, skipped ${skipped}.`);
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
