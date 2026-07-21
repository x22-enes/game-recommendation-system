import { PrismaClient } from '@prisma/client';
import { inferGenresForTitle } from './genreProvider';

const prisma = new PrismaClient();
const BATCH_SIZE = 500;

function needsGenres(value?: string | null) {
    if (!value) return true;
    try {
        const parsed = JSON.parse(value);
        return !Array.isArray(parsed) || parsed.length === 0;
    } catch {
        return true;
    }
}

async function main() {
    const games = await prisma.game.findMany({
        select: { id: true, title: true, genres: true },
        orderBy: { title: 'asc' },
    });

    let updated = 0;
    const missing = games.filter(game => needsGenres(game.genres));

    for (let index = 0; index < missing.length; index += BATCH_SIZE) {
        const batch = missing.slice(index, index + BATCH_SIZE);

        await prisma.$transaction(
            batch.map(game => prisma.game.update({
                where: { id: game.id },
                data: { genres: inferGenresForTitle(game.title, game.genres) },
            }))
        );

        updated += batch.length;
        console.log(`Updated ${updated} / ${missing.length} games`);
    }

    console.log(`Genre backfill complete. Updated ${updated} games.`);
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
