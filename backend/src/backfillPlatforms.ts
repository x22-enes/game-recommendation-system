import { PrismaClient } from '@prisma/client';
import { platformsForTitle } from './platformProvider';

const prisma = new PrismaClient();

async function main() {
    const games = await prisma.game.findMany();
    for (const game of games) {
        await prisma.game.update({
            where: { id: game.id },
            data: { platforms: JSON.stringify(platformsForTitle(game.title)) },
        });
    }

    console.log(`Updated platforms for ${games.length} games.`);
}

main()
    .catch(error => {
        console.error(error);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
