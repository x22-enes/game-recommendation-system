import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { findBestCover } from './coverProvider';
import { findVerifiedPrices } from './priceProvider';
import { platformsForTitle } from './platformProvider';
import { buildRecommendations } from './recommendationEngine';
import { inferGenresForTitle } from './genreProvider';
import { fetchSteamDetails, steamAppIdFromUrl } from './steamProvider';
import { fetchLizardByteGameDetails, lizardByteIdFromSource, lizardByteMetadataForGame } from './lizardByteProvider';

dotenv.config();
const app = express();
const prisma = new PrismaClient();

const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: allowedOrigins.length
        ? (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'));
        }
        : true,
}));
app.use(express.json({ limit: '3mb' }));

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && (!process.env.JWT_SECRET || JWT_SECRET === 'secret' || JWT_SECRET.length < 32)) {
    throw new Error('Set JWT_SECRET to a strong value before running in production.');
}

const hasUsableCover = (coverUrl?: string | null) =>
    Boolean(coverUrl && coverUrl.startsWith('http') && !coverUrl.includes('screenshot'));

const hasSpecificPlatforms = (platforms?: string | null) => {
    const parsed = parseJsonArray(platforms);
    return parsed.length > 0 && !parsed.includes('Console');
};

const parseJsonArray = (value?: string | null): string[] => {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
        return [];
    }
};

const unique = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b));

const cleanSearchQuery = (value: unknown) =>
    String(value || '')
        .trim()
        .replace(/[%_]/g, '')
        .replace(/\s+/g, ' ')
        .slice(0, 80);

const looseSearchKey = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');

const cleanCatalogFilter = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text || text === 'All') return '';
    return text.replace(/[%_"]/g, '').replace(/\s+/g, ' ').slice(0, 40);
};

const signUserToken = (userId: string) => jwt.sign({ userId }, JWT_SECRET);

const publicAuthUser = (user: any) => ({
    id: user.id,
    username: user.username,
    email: user.email,
    emailVerified: user.emailVerified,
});

const buildProfile = (user: any) => {
    const ratedGames = user.library.filter((item: any) => item.rating !== null && item.rating !== undefined);
    const completedGames = user.library.filter((item: any) => item.status === 'Completed');
    const playingGames = user.library.filter((item: any) => item.status === 'Playing');

    const genreCounts = new Map<string, number>();
    user.library.forEach((item: any) => {
        parseJsonArray(item.game.genres).forEach(genre => {
            genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
        });
    });

    const topGenres = [...genreCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, count]) => ({ genre, count }));

    const recentRated = ratedGames
        .sort((a: any, b: any) => (b.rating || 0) - (a.rating || 0))
        .slice(0, 6)
        .map((item: any) => ({
            id: item.game.id,
            title: item.game.title,
            coverUrl: item.game.coverUrl,
            genres: item.game.genres,
            rating: item.rating,
        }));

    return {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        steamProfileUrl: user.steamProfileUrl,
        favoriteGenres: parseJsonArray(user.favoriteGenres),
        stats: {
            libraryCount: user.library.length,
            wishlistCount: user.wishlist.length,
            ratedCount: ratedGames.length,
            completedCount: completedGames.length,
            playingCount: playingGames.length,
            commentsCount: user.comments.length,
        },
        topGenres,
        recentRated,
    };
};

const getRatingSummary = async (gameId: string) => {
    const ratings = await prisma.userGame.findMany({
        where: { gameId, rating: { not: null } },
        select: { rating: true },
    });

    const count = ratings.length;
    const average = count
        ? Number((ratings.reduce((sum, item) => sum + (item.rating || 0), 0) / count).toFixed(1))
        : null;

    return { average, count };
};

const topGamesLimit = (value: unknown) => {
    const requested = Number(value);
    return [25, 50, 100].includes(requested) ? requested : 25;
};

const getAvailableGenres = async () => {
    const games = await prisma.game.findMany({
        select: { genres: true },
    });
    return unique(games.flatMap(game => parseJsonArray(game.genres)));
};

const rankCommunityGames = async (limit = 25) => {
    const ratingGroups = await prisma.userGame.groupBy({
        by: ['gameId'],
        where: { rating: { not: null } },
        _avg: { rating: true },
        _count: { rating: true },
    });

    const gameIds = ratingGroups.map(group => group.gameId);
    const games = await prisma.game.findMany({ where: { id: { in: gameIds } } });
    const gameById = new Map(games.map(game => [game.id, game]));

    return ratingGroups
        .map(group => ({
            game: gameById.get(group.gameId),
            averageRating: group._avg.rating || 0,
            ratingCount: group._count.rating,
        }))
        .filter(item => item.game)
        .sort((a, b) => b.averageRating - a.averageRating || b.ratingCount - a.ratingCount || a.game!.title.localeCompare(b.game!.title))
        .slice(0, limit)
        .map((item, index) => ({
            rank: index + 1,
            score: Number((item.averageRating * 20).toFixed(0)),
            averageRating: Number(item.averageRating.toFixed(1)),
            ratingCount: item.ratingCount,
            game: item.game,
        }));
};

const formatComment = (comment: any, viewerId?: string) => ({
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
    username: comment.user.username,
    avatarUrl: comment.user.avatarUrl,
    userId: comment.userId,
    likeCount: comment.likes?.length || 0,
    likedByMe: viewerId ? Boolean(comment.likes?.some((like: any) => like.userId === viewerId)) : false,
    replies: (comment.replies || []).map((reply: any) => formatComment(reply, viewerId)),
});

const getOptionalUserId = (req: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return undefined;
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        return decoded.userId as string;
    } catch {
        return undefined;
    }
};

const withFreshGameMetadata = async (game: any) => {
    if (!game) return game;

    const updates: any = {};
    const lizardByteId = lizardByteIdFromSource(game.source);

    if (lizardByteId && (
        !hasUsableCover(game.coverUrl) ||
        parseJsonArray(game.genres).length === 0 ||
        !hasSpecificPlatforms(game.platforms) ||
        !game.description ||
        !game.criticScore
    )) {
        const details = await fetchLizardByteGameDetails(lizardByteId);
        const metadata = lizardByteMetadataForGame(details);

        if (!hasUsableCover(game.coverUrl) && metadata.coverUrl) updates.coverUrl = metadata.coverUrl;
        if (parseJsonArray(game.genres).length === 0 && metadata.genres?.length) updates.genres = JSON.stringify(metadata.genres);
        if (!hasSpecificPlatforms(game.platforms) && metadata.platforms?.length) updates.platforms = JSON.stringify(metadata.platforms);
        if (!game.description && metadata.description) updates.description = metadata.description;
        if (!game.criticScore && metadata.criticScore) {
            updates.criticScore = metadata.criticScore;
            updates.criticSource = 'IGDB via LizardByte/GameDB';
        }
    }

    if (!hasUsableCover(game.coverUrl)) {
        const coverUrl = await findBestCover(game.title);
        if (coverUrl) {
            updates.coverUrl = coverUrl;
            if (!lizardByteId) updates.source = 'cover-provider';
        }
    }

    if (!hasSpecificPlatforms(game.platforms)) {
        updates.platforms = JSON.stringify(platformsForTitle(game.title));
    }

    if (parseJsonArray(game.genres).length === 0) {
        updates.genres = inferGenresForTitle(game.title, game.genres);
    }

    if (Object.keys(updates).length === 0) return game;

    await prisma.game.update({
        where: { id: game.id },
        data: updates,
    });

    return { ...game, ...updates };
};

const withListPriceMetadata = async (games: any[]) => {
    const gameIds = games.map(game => game.id).filter(Boolean);
    if (gameIds.length === 0) return games;

    const priceGroups = await prisma.storePrice.groupBy({
        by: ['gameId'],
        where: { gameId: { in: gameIds } },
        _min: { price: true },
    });
    const bestPriceByGameId = new Map(priceGroups.map(group => [group.gameId, group._min.price]));

    return games.map(game => ({
        ...game,
        bestPrice: bestPriceByGameId.has(game.id)
            ? { price: bestPriceByGameId.get(game.id) }
            : null,
    }));
};

const findRelatedGames = async (game: any) => {
    const genres = parseJsonArray(game.genres);
    const genreFilter = genres[0]
        ? Prisma.sql`"genres" LIKE ${`%"${genres[0]}"%`} AND "id" <> ${game.id}`
        : Prisma.sql`"id" <> ${game.id}`;

    const related = await prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT *
        FROM "Game"
        WHERE ${genreFilter}
        ORDER BY RANDOM()
        LIMIT 10
    `);

    return withListPriceMetadata(related.slice(0, 8));
};

const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); } 
    catch { res.status(401).json({ error: 'Invalid token' }); }
};

// Auth
app.post('/api/auth/login', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signUserToken(user.id), user: publicAuthUser(user) });
});

app.post('/api/auth/register', async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters.' });

    try {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing) return res.status(400).json({ error: 'Username already taken' });

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: {
                username,
                emailVerified: true,
                passwordHash,
                favoriteGenres: JSON.stringify(['RPG', 'Action']),
            },
        });

        res.json({
            token: signUserToken(user.id),
            user: publicAuthUser(user),
        });
    } catch (error) {
        console.error('Registration failed:', error);
        res.status(500).json({ error: 'Could not create account' });
    }
});

// Games
app.get('/api/genres', async (_req, res) => {
    try {
        res.json(await getAvailableGenres());
    } catch (error) {
        console.error('Failed to load genres:', error);
        res.status(500).json({ error: 'Failed to load genres' });
    }
});

app.get('/api/games', async (req, res) => {
    const search = cleanSearchQuery(req.query.search);
    const genreFilter = cleanCatalogFilter(req.query.genre);
    const platformFilter = cleanCatalogFilter(req.query.platform);
    const shouldShuffle = req.query.shuffle === '1';
    const filters = [
        ...(genreFilter ? [Prisma.sql`"genres" LIKE ${`%"${genreFilter}"%`}`] : []),
        ...(platformFilter ? [Prisma.sql`"platforms" LIKE ${`%"${platformFilter}"%`}`] : []),
    ];
    let localGames: any[];

    if (search) {
        const normalizedSearch = search.toLowerCase();
        const looseSearch = looseSearchKey(search);
        const compactSearch = looseSearch.replace(/\s+/g, '');
        const looseTitleSql = Prisma.sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("title", '-', ' '), ':', ' '), '.', ' '), '_', ' '), '™', ''), '®', ''))`;
        const compactTitleSql = Prisma.sql`LOWER(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE("title", '-', ''), ':', ''), '.', ''), '_', ''), ' ', ''), '™', ''), '®', ''))`;
        const searchFilters = [
            Prisma.sql`(
                LOWER("title") LIKE ${`%${normalizedSearch}%`} OR
                ${looseTitleSql} LIKE ${`%${looseSearch}%`} OR
                ${compactTitleSql} LIKE ${`%${compactSearch}%`}
            )`,
            ...filters,
        ];
        const candidates = await prisma.$queryRaw<any[]>`
            SELECT *,
                CASE
                    WHEN LOWER("title") = ${normalizedSearch} THEN 0
                    WHEN ${looseTitleSql} = ${looseSearch} THEN 0
                    WHEN ${compactTitleSql} = ${compactSearch} THEN 0
                    WHEN LOWER("title") LIKE ${`${normalizedSearch}:%`} THEN 1
                    WHEN ${looseTitleSql} LIKE ${`${looseSearch} %`} THEN 1
                    WHEN LOWER("title") LIKE ${`${normalizedSearch} -%`} THEN 2
                    WHEN LOWER("title") LIKE ${`${normalizedSearch} %`} THEN 3
                    WHEN ${compactTitleSql} LIKE ${`${compactSearch}%`} THEN 3
                    WHEN LOWER("title") LIKE ${`${normalizedSearch}%`} THEN 4
                    WHEN LOWER("title") LIKE ${`% ${normalizedSearch}:%`} THEN 5
                    WHEN LOWER("title") LIKE ${`% ${normalizedSearch} -%`} THEN 6
                    WHEN LOWER("title") LIKE ${`% ${normalizedSearch} %`} THEN 7
                    WHEN ${looseTitleSql} LIKE ${`% ${looseSearch} %`} THEN 7
                    ELSE 9
                END AS "searchRank"
            FROM "Game"
            WHERE ${Prisma.join(searchFilters, ' AND ')}
            ORDER BY
                "searchRank",
                CASE WHEN "coverUrl" LIKE 'http%' THEN 0 ELSE 1 END,
                LENGTH("title") ASC,
                LOWER("title") ASC
            LIMIT 1000
        `;

        const priceGroups = candidates.length
            ? await prisma.storePrice.groupBy({
                by: ['gameId'],
                where: { gameId: { in: candidates.map(game => game.id) } },
                _count: { gameId: true },
            })
            : [];
        const priceCountByGameId = new Map(priceGroups.map(group => [group.gameId, group._count.gameId]));

        localGames = candidates
            .sort((a, b) =>
                Number(a.searchRank) - Number(b.searchRank) ||
                (String(b.coverUrl || '').startsWith('http') ? 1 : 0) - (String(a.coverUrl || '').startsWith('http') ? 1 : 0) ||
                (priceCountByGameId.get(b.id) || 0) - (priceCountByGameId.get(a.id) || 0) ||
                String(a.title || '').length - String(b.title || '').length ||
                String(a.title || '').localeCompare(String(b.title || ''))
            )
            .slice(0, 300)
            .map(({ searchRank, ...game }) => game);
    } else {
        const whereSql = filters.length > 0
            ? Prisma.sql`WHERE ${Prisma.join(filters, ' AND ')}`
            : Prisma.empty;

        localGames = await prisma.$queryRaw<any[]>(Prisma.sql`
            SELECT *
            FROM "Game"
            ${whereSql}
            ORDER BY ${shouldShuffle
                ? Prisma.sql`RANDOM()`
                : Prisma.sql`
                    CASE WHEN "coverUrl" LIKE 'http%' THEN 0 ELSE 1 END,
                    LOWER("title") ASC
                `}
            LIMIT 300
        `);
    }

    const games = await Promise.all(localGames.map(withFreshGameMetadata));
    res.json(await withListPriceMetadata(games));
});

app.get('/api/games/:id', async (req, res) => {
    try {
        const game = await prisma.game.findFirst({ where: { id: req.params.id } });
        if (!game) return res.status(404).json({ error: 'Game not found' });
        const [freshGame, ratingSummary, steamPrice] = await Promise.all([
            withFreshGameMetadata(game),
            getRatingSummary(game.id),
            prisma.storePrice.findFirst({
                where: {
                    gameId: game.id,
                    OR: [
                        { storeName: { contains: 'Steam' } },
                        { url: { contains: 'store.steampowered.com/app/' } },
                    ],
                },
                orderBy: { price: 'asc' },
            }),
        ]);
        const steamAppId = steamAppIdFromUrl(steamPrice?.url);
        const [steamDetails, relatedGames] = await Promise.all([
            steamAppId ? fetchSteamDetails(steamAppId) : Promise.resolve(null),
            findRelatedGames(freshGame),
        ]);
        res.json({ ...freshGame, ratingSummary, steamDetails, relatedGames });
    } catch (e) {
        console.error('Failed to fetch game details:', e);
        res.status(500).json({ error: 'Database error' });
    }
});

app.get('/api/top-games', async (req, res) => {
    try {
        const limit = topGamesLimit(req.query.limit);
        const [criticGames, communityTop] = await Promise.all([
            prisma.game.findMany({
                where: { criticScore: { not: null } },
                orderBy: [{ criticScore: 'desc' }, { title: 'asc' }],
                take: limit,
            }),
            rankCommunityGames(limit),
        ]);

        res.json({
            limit,
            criticTop: criticGames.map((game, index) => ({
                rank: index + 1,
                score: game.criticScore,
                source: game.criticSource || 'Critic score',
                game,
            })),
            communityTop,
        });
    } catch (error) {
        console.error('Failed to fetch top games:', error);
        res.status(500).json({ error: 'Failed to fetch top games' });
    }
});

app.get('/api/games/:id/prices', async (req, res) => {
    const game = await prisma.game.findFirst({ where: { id: req.params.id } });
    if (!game) return res.status(404).json({ error: 'Game not found' });

    try {
        const [localPrices, livePrices] = await Promise.all([
            prisma.storePrice.findMany({
                where: { gameId: game.id },
                orderBy: { price: 'asc' },
                take: 12,
            }),
            findVerifiedPrices(game.title).catch(() => []),
        ]);

        const byOffer = new Map<string, any>();

        for (const price of localPrices) {
            byOffer.set(`${price.storeName}|${price.url}`, {
                storeName: price.storeName,
                price: price.price,
                normalPrice: price.price,
                savings: 0,
                url: price.url,
                source: price.source,
                matchedTitle: game.title,
            });
        }

        for (const price of livePrices) {
            byOffer.set(`${price.storeName}|${price.url}`, price);
        }

        res.json([...byOffer.values()].sort((a, b) => a.price - b.price).slice(0, 12));
    } catch {
        res.json([]);
    }
});

app.get('/api/games/:id/comments', async (req, res) => {
    try {
        const viewerId = getOptionalUserId(req);
        const comments = await prisma.gameComment.findMany({
            where: { gameId: req.params.id, parentId: null },
            include: {
                user: { select: { username: true, avatarUrl: true } },
                likes: { select: { userId: true } },
                replies: {
                    include: {
                        user: { select: { username: true, avatarUrl: true } },
                        likes: { select: { userId: true } },
                    },
                    orderBy: { createdAt: 'asc' },
                    take: 25,
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 50,
        });

        res.json(comments.map(comment => formatComment(comment, viewerId)));
    } catch {
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

app.post('/api/games/:id/comments', authenticate, async (req: any, res: any) => {
    try {
        const body = String(req.body.body || '').trim();
        if (body.length < 2) return res.status(400).json({ error: 'Comment is too short' });
        if (body.length > 800) return res.status(400).json({ error: 'Comment is too long' });

        const game = await prisma.game.findFirst({ where: { id: req.params.id } });
        if (!game) return res.status(404).json({ error: 'Game not found' });

        const parentId = req.body.parentId ? String(req.body.parentId) : null;
        if (parentId) {
            const parent = await prisma.gameComment.findFirst({
                where: { id: parentId, gameId: req.params.id, parentId: null },
            });
            if (!parent) return res.status(404).json({ error: 'Parent comment not found' });
        }

        const comment = await prisma.gameComment.create({
            data: {
                gameId: req.params.id,
                userId: req.user.userId,
                body,
                parentId,
            },
            include: {
                user: { select: { username: true, avatarUrl: true } },
                likes: { select: { userId: true } },
                replies: true,
            },
        });

        res.json(formatComment(comment, req.user.userId));
    } catch (error) {
        console.error('Failed to add comment:', error);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

app.post('/api/comments/:id/like', authenticate, async (req: any, res: any) => {
    try {
        const comment = await prisma.gameComment.findFirst({ where: { id: req.params.id } });
        if (!comment) return res.status(404).json({ error: 'Comment not found' });

        const existing = await prisma.commentLike.findFirst({
            where: { userId: req.user.userId, commentId: req.params.id },
        });

        if (existing) {
            await prisma.commentLike.delete({ where: { id: existing.id } });
        } else {
            await prisma.commentLike.create({
                data: { userId: req.user.userId, commentId: req.params.id },
            });
        }

        const likeCount = await prisma.commentLike.count({ where: { commentId: req.params.id } });
        res.json({ likedByMe: !existing, likeCount });
    } catch {
        res.status(500).json({ error: 'Failed to update like' });
    }
});

// Library & Wishlist
app.get('/api/library', authenticate, async (req: any, res: any) => {
    try {
        const lib = await prisma.userGame.findMany({ where: { userId: req.user.userId }, include: { game: true } });
        res.json(lib);
    } catch (e) { res.status(500).json({ error: 'Failed to fetch library' }); }
});

app.post('/api/library/:gameId', authenticate, async (req: any, res: any) => {
    try {
        const gameId = req.params.gameId;
        const userId = req.user.userId;
        const gameExists = await prisma.game.findFirst({ where: { id: gameId } });
        if (!gameExists) return res.status(404).json({ error: 'Game does not exist.' });
        let entry = await prisma.userGame.findFirst({ where: { userId, gameId } });
        if (!entry) entry = await prisma.userGame.create({ data: { userId, gameId, status: 'Plan to Play' } });
        await prisma.wishlistItem.deleteMany({ where: { userId, gameId } });
        res.json({ success: true, entry });
    } catch (e: any) { res.status(500).json({ error: 'Database crashed on library add' }); }
});

app.patch('/api/library/:gameId', authenticate, async (req: any, res: any) => {
    try {
        const { rating, status } = req.body;
        await prisma.userGame.updateMany({ where: { userId: req.user.userId, gameId: req.params.gameId }, data: { rating, status } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to update library entry' }); }
});

app.delete('/api/library/:gameId', authenticate, async (req: any, res: any) => {
    try {
        await prisma.userGame.deleteMany({ where: { userId: req.user.userId, gameId: req.params.gameId } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete' }); }
});

app.get('/api/wishlist', authenticate, async (req: any, res: any) => {
    try {
        const items = await prisma.wishlistItem.findMany({ where: { userId: req.user.userId }, include: { game: true } });
        res.json(items.map((i: any) => i.game));
    } catch (e) { res.status(500).json({ error: 'Failed to fetch wishlist' }); }
});

app.post('/api/wishlist/:gameId', authenticate, async (req: any, res: any) => {
    try {
        const gameId = req.params.gameId;
        const userId = req.user.userId;
        const gameExists = await prisma.game.findFirst({ where: { id: gameId } });
        if (!gameExists) return res.status(404).json({ error: 'Game does not exist.' });
        const inLibrary = await prisma.userGame.findFirst({ where: { userId, gameId } });
        if (inLibrary) return res.status(400).json({ error: 'Game is already in your library!' });
        const existing = await prisma.wishlistItem.findFirst({ where: { userId, gameId } });
        if (existing) return res.status(400).json({ error: 'Already in wishlist!' });
        await prisma.wishlistItem.create({ data: { userId, gameId } }); 
        res.json({ success: true }); 
    } catch (e: any) { res.status(500).json({ error: 'Database crashed on wishlist add' }); }
});

app.delete('/api/wishlist/:gameId', authenticate, async (req: any, res: any) => {
    try {
        await prisma.wishlistItem.deleteMany({ where: { userId: req.user.userId, gameId: req.params.gameId } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to delete from wishlist' }); }
});

app.get('/api/preferences', authenticate, async (req: any, res: any) => {
    try {
        const user = await prisma.user.findFirst({ where: { id: req.user.userId } });
        const games = await prisma.game.findMany({ select: { genres: true } });
        const availableGenres = unique(games.flatMap(game => parseJsonArray(game.genres)));

        res.json({
            favoriteGenres: parseJsonArray(user?.favoriteGenres),
            availableGenres,
        });
    } catch {
        res.status(500).json({ error: 'Failed to fetch preferences' });
    }
});

app.patch('/api/preferences', authenticate, async (req: any, res: any) => {
    try {
        const requestedGenres = Array.isArray(req.body.favoriteGenres) ? req.body.favoriteGenres : [];
        const games = await prisma.game.findMany({ select: { genres: true } });
        const availableGenres = new Set(games.flatMap(game => parseJsonArray(game.genres)));
        const favoriteGenres = unique(
            requestedGenres
                .map((genre: unknown) => String(genre))
                .filter((genre: string) => availableGenres.has(genre))
                .slice(0, 8)
        );

        await prisma.user.update({
            where: { id: req.user.userId },
            data: { favoriteGenres: JSON.stringify(favoriteGenres) },
        });

        res.json({ favoriteGenres });
    } catch {
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});

app.get('/api/profile', authenticate, async (req: any, res: any) => {
    try {
        const user = await prisma.user.findFirst({
            where: { id: req.user.userId },
            select: {
                id: true,
                username: true,
                favoriteGenres: true,
                avatarUrl: true,
                steamProfileUrl: true,
                library: { include: { game: true } },
                wishlist: true,
                comments: true,
            },
        });
        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json(buildProfile(user));
    } catch (error) {
        console.error('Failed to fetch profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

app.get('/api/users/:id/profile', async (req, res) => {
    try {
        const user = await prisma.user.findFirst({
            where: { id: req.params.id },
            select: {
                id: true,
                username: true,
                favoriteGenres: true,
                avatarUrl: true,
                steamProfileUrl: true,
                library: { include: { game: true } },
                wishlist: true,
                comments: true,
            },
        });
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(buildProfile(user));
    } catch {
        res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

app.patch('/api/profile', authenticate, async (req: any, res: any) => {
    try {
        const avatarUrl = String(req.body.avatarUrl || '').trim();
        const steamProfileUrl = String(req.body.steamProfileUrl || '').trim();

        const isAvatar = (value: string) => !value || /^data:image\/(png|jpe?g|webp);base64,/i.test(value) || /^https?:\/\/\S+\.\S+/.test(value);
        const isUrl = (value: string) => !value || /^https?:\/\/\S+\.\S+/.test(value);
        if (!isAvatar(avatarUrl)) return res.status(400).json({ error: 'Avatar must be an image file' });
        if (!isUrl(steamProfileUrl)) return res.status(400).json({ error: 'Steam profile must be a valid URL' });
        if (avatarUrl.length > 2_000_000 || steamProfileUrl.length > 500) {
            return res.status(400).json({ error: 'URL is too long' });
        }

        const user = await prisma.user.update({
            where: { id: req.user.userId },
            data: {
                avatarUrl: avatarUrl || null,
                steamProfileUrl: steamProfileUrl || null,
            },
            select: {
                avatarUrl: true,
                steamProfileUrl: true,
            },
        });

        res.json(user);
    } catch {
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ==========================================
// SMART RECOMMENDATION ENGINE
// ==========================================
app.get('/api/recommendations', authenticate, async (req: any, res: any) => {
    try {
        res.json(await buildRecommendations(prisma, req.user.userId));
    } catch(e) { 
        console.error(e);
        res.status(500).json([]); 
    }
});

const frontendDistCandidates = [
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
];
const frontendDist = frontendDistCandidates.find(candidate => fs.existsSync(path.join(candidate, 'index.html')));

if (frontendDist) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) {
            next();
            return;
        }
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));
