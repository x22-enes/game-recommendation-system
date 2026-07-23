import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const prisma = new PrismaClient();

async function run() {
    const statements = [
        'CREATE EXTENSION IF NOT EXISTS pg_trgm',
        'CREATE INDEX IF NOT EXISTS "Game_title_lower_trgm_idx" ON "Game" USING GIN (lower("title") gin_trgm_ops)',
        'CREATE INDEX IF NOT EXISTS "Game_genres_trgm_idx" ON "Game" USING GIN ("genres" gin_trgm_ops)',
        'CREATE INDEX IF NOT EXISTS "Game_platforms_trgm_idx" ON "Game" USING GIN ("platforms" gin_trgm_ops)',
        'CREATE INDEX IF NOT EXISTS "Game_cover_title_idx" ON "Game" ((CASE WHEN "coverUrl" LIKE \'http%\' THEN 0 ELSE 1 END), lower("title"))',
    ];

    for (const statement of statements) {
        try {
            await prisma.$executeRawUnsafe(statement);
            console.log(`Database optimization applied: ${statement}`);
        } catch (error) {
            console.warn(`Database optimization skipped: ${statement}`, error);
        }
    }
}

run()
    .catch(error => {
        console.warn('Database optimization skipped:', error);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
