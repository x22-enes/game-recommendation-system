import { PrismaClient } from '@prisma/client';

type GameRecord = {
    id: string;
    title: string;
    genres: string | null;
    platforms: string | null;
    description: string | null;
    coverUrl: string | null;
    source: string | null;
    criticScore: number | null;
    criticSource: string | null;
};

type LibraryItem = {
    gameId: string;
    status: string | null;
    rating: number | null;
    game: GameRecord;
};

type WishlistItem = {
    gameId: string;
    game: GameRecord;
};

type StorePriceRecord = {
    gameId: string;
    storeName: string;
    price: number;
    url: string;
    source: string;
};

type CollaborativeSignals = {
    scores: Map<string, number>;
    games: Map<string, GameRecord>;
};

type WeightedLabel = {
    weight: number;
    display: string;
};

type ScoreBreakdown = {
    contentScore: number;
    tasteScore: number;
    qualityScore: number;
    platformScore: number;
    priceScore: number;
    collaborativeBoost: number;
    penalty: number;
    rawScore: number;
    genreAffinity: number;
    dislikedPenalty: number;
    bestLikedSimilarity: number;
    bestLikedTitle: string | null;
    bestLikedSharedTitleTokens: number;
    bestDislikedSimilarity: number;
    bestDislikedTitle: string | null;
    bestDislikedSharedTitleTokens: number;
};

type ScoredGame = {
    game: GameRecord;
    score: number;
    confidence: number;
    reasons: string[];
    debugBreakdown?: ScoreBreakdown;
    debug: {
        primaryGenre: string;
        franchise: string;
    };
};

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'edition', 'deluxe', 'ultimate',
    'remastered', 'remake', 'game', 'games', 'pack', 'bundle', 'season',
]);

const DEFAULT_FAVORITE_GENRES = ['RPG', 'Action', 'Adventure'];
const DEFAULT_PLATFORM = 'PC';
const MAX_TITLE_TOKEN_QUERIES = 12;
const MAX_CANDIDATES = 6000;
const INCLUDE_RECOMMENDATION_DEBUG = process.env.NODE_ENV !== 'production';

// Hand-tuned scoring constants. Run `npm run audit:recommendations --prefix backend`
// against a representative database before changing these weights.
const SCORE_WEIGHTS = {
    genreAffinityMultiplier: 2.2,
    contentScoreCap: 24,
    similarLikedMultiplier: 16,
    similarLikedCap: 11,
    wishlistScore: 12,
    activeGenreOverlapScore: 4,
    tasteScoreCap: 25,
    criticScoreCap: 11,
    coverQualityBonus: 2,
    seedQualityBonus: 2,
    noPlatformScore: 2,
    exactPlatformScore: 10,
    pcFallbackPlatformScore: 7,
    otherPlatformScore: 3,
    collaborativeMultiplier: 8,
    collaborativeCap: 12,
    dislikedGenreMultiplier: 1.8,
    dislikedSimilarityMultiplier: 8,
    penaltyCap: 18,
};

function parseJsonArray(value?: string | null): string[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function unique(values: string[]) {
    return [...new Set(values.filter(Boolean))];
}

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/\s+/g, ' ');
}

function titleTokens(title: string) {
    return normalizeText(title)
        .split(' ')
        .filter(token => token.length >= 4 && !STOP_WORDS.has(token));
}

function genreKey(value: string) {
    return value.toLowerCase();
}

function hasCover(game: GameRecord) {
    return Boolean(game.coverUrl?.startsWith('http'));
}

function franchiseKey(title: string) {
    const normalized = normalizeText(title.split(':')[0].split('-')[0]);
    const tokens = normalized.split(' ').filter(Boolean);
    return tokens.slice(0, Math.min(2, tokens.length)).join(' ') || normalized;
}

function overlapScore(a: string[], b: string[]) {
    if (a.length === 0 || b.length === 0) return 0;
    const bSet = new Set(b);
    const shared = a.filter(item => bSet.has(item)).length;
    return shared / Math.max(a.length, b.length);
}

function addWeight(weights: Map<string, number>, key: string, amount: number) {
    weights.set(key, (weights.get(key) || 0) + amount);
}

function addLabeledWeight(weights: Map<string, WeightedLabel>, label: string, amount: number) {
    const key = genreKey(label);
    const existing = weights.get(key);
    weights.set(key, {
        weight: (existing?.weight || 0) + amount,
        display: existing?.display || label,
    });
}

function weightedGenreScore(genres: string[], weights: Map<string, WeightedLabel>) {
    return genres.reduce((sum, genre) => sum + (weights.get(genreKey(genre))?.weight || 0), 0);
}

function bestSimilarLikedGame(candidate: GameRecord, likedGames: GameRecord[]) {
    const candidateGenres = parseJsonArray(candidate.genres).map(genreKey);
    const candidateTokens = titleTokens(candidate.title);

    return likedGames
        .map(game => {
            const likedTokens = titleTokens(game.title);
            const sharedTitleTokens = candidateTokens.filter(token => likedTokens.includes(token)).length;
            const genreSimilarity = overlapScore(candidateGenres, parseJsonArray(game.genres).map(genreKey));
            const titleSimilarity = sharedTitleTokens >= 2 ? overlapScore(candidateTokens, likedTokens) : 0;
            return {
                game,
                similarity: genreSimilarity * 0.85 + titleSimilarity * 0.15,
                sharedTitleTokens,
            };
        })
        .sort((a, b) => b.similarity - a.similarity)[0] || null;
}

function strongestPlatform(platforms: string[], userPlatforms: Set<string>) {
    const owned = platforms.filter(platform => userPlatforms.has(platform));
    if (owned.length > 0) return owned[0];
    if (platforms.includes(DEFAULT_PLATFORM)) return DEFAULT_PLATFORM;
    return platforms[0] || '';
}

function priceSignal(prices: StorePriceRecord[]) {
    if (prices.length === 0) return { score: 0, reason: '' };

    const best = [...prices].sort((a, b) => a.price - b.price)[0];
    if (best.price <= 0) {
        return { score: 10, reason: `Free on ${best.storeName}` };
    }
    if (best.price <= 5) {
        return { score: 7, reason: `Low price on ${best.storeName}` };
    }
    if (best.price <= 15) {
        return { score: 4, reason: `Available from ${best.storeName}` };
    }

    return { score: 2, reason: `Store offer available on ${best.storeName}` };
}

function buildTasteProfile(user: any, library: LibraryItem[], wishlist: WishlistItem[]) {
    const favoriteGenres = parseJsonArray(user?.favoriteGenres);
    const explicitFavorites = favoriteGenres.length > 0 ? favoriteGenres : DEFAULT_FAVORITE_GENRES;
    const genreWeights = new Map<string, WeightedLabel>();
    const dislikedGenreWeights = new Map<string, WeightedLabel>();
    const platformWeights = new Map<string, number>();

    explicitFavorites.forEach(genre => addLabeledWeight(genreWeights, genre, 4));

    for (const item of library) {
        const rating = item.rating || 0;
        const genres = parseJsonArray(item.game.genres);
        const platforms = parseJsonArray(item.game.platforms);

        const positiveWeight =
            rating >= 4.5 ? 8 :
            rating >= 4 ? 6 :
            item.status === 'Completed' ? 4 :
            item.status === 'Playing' ? 3 :
            rating >= 3 ? 1 : 0;

        if (positiveWeight > 0) {
            genres.forEach(genre => addLabeledWeight(genreWeights, genre, positiveWeight));
            platforms.forEach(platform => addWeight(platformWeights, platform, positiveWeight));
        }

        if (rating > 0 && rating <= 2) {
            genres.forEach(genre => addLabeledWeight(dislikedGenreWeights, genre, 4));
        }
    }

    for (const item of wishlist) {
        parseJsonArray(item.game.genres).forEach(genre => addLabeledWeight(genreWeights, genre, 2));
        parseJsonArray(item.game.platforms).forEach(platform => addWeight(platformWeights, platform, 1));
    }

    if (platformWeights.size === 0) platformWeights.set(DEFAULT_PLATFORM, 1);

    const likedGames = library
        .filter(item => (item.rating || 0) >= 4 || item.status === 'Completed' || item.status === 'Playing')
        .map(item => item.game);
    const dislikedGames = library
        .filter(item => (item.rating || 0) > 0 && (item.rating || 0) <= 2)
        .map(item => item.game);
    const activeGames = library
        .filter(item => item.status === 'Playing')
        .map(item => item.game);

    return {
        favoriteGenres: explicitFavorites,
        genreWeights,
        dislikedGenreWeights,
        userPlatforms: new Set(platformWeights.keys()),
        likedGames,
        dislikedGames,
        activeGames,
    };
}

async function collectCandidates(
    prisma: PrismaClient,
    profile: ReturnType<typeof buildTasteProfile>,
    libraryGameIds: string[],
    wishlist: WishlistItem[],
    collaborativeSignals: CollaborativeSignals
) {
    const candidates = new Map<string, GameRecord>();
    const excluded = new Set(libraryGameIds);

    const addGames = (games: GameRecord[]) => {
        for (const game of games) {
            if (!excluded.has(game.id)) candidates.set(game.id, game);
        }
    };

    addGames(wishlist.map(item => item.game));
    addGames([...collaborativeSignals.games.values()]);

    const candidateQueries: Promise<GameRecord[]>[] = [
        prisma.game.findMany({
            where: { id: { notIn: libraryGameIds }, criticScore: { not: null } },
            orderBy: [{ criticScore: 'desc' }, { title: 'asc' }],
            take: 700,
        }),
        prisma.game.findMany({
            where: { id: { notIn: libraryGameIds }, source: 'seed' },
            orderBy: { title: 'asc' },
            take: 500,
        }),
    ];

    const genres = unique([
        ...profile.favoriteGenres,
        ...[...profile.genreWeights.values()].map(item => item.display),
    ]).slice(0, 14);

    for (const genre of genres) {
        candidateQueries.push(prisma.game.findMany({
            where: {
                id: { notIn: libraryGameIds },
                genres: { contains: `"${genre}"`, mode: 'insensitive' },
            },
            orderBy: [{ criticScore: 'desc' }, { title: 'asc' }],
            take: 250,
        }));
    }

    const tokenCounts = new Map<string, number>();
    for (const game of [...profile.likedGames, ...profile.activeGames]) {
        for (const token of titleTokens(game.title)) {
            tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
        }
    }

    const titleSearchTokens = [...tokenCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, MAX_TITLE_TOKEN_QUERIES)
        .map(([token]) => token);

    for (const token of titleSearchTokens) {
        candidateQueries.push(prisma.game.findMany({
            where: {
                id: { notIn: libraryGameIds },
                title: { contains: token, mode: 'insensitive' },
            },
            orderBy: { title: 'asc' },
            take: 120,
        }));
    }

    const queryResults = await Promise.all(candidateQueries);
    queryResults.forEach(addGames);

    const dealPrices = await prisma.storePrice.findMany({
        where: { gameId: { notIn: libraryGameIds } },
        orderBy: { price: 'asc' },
        take: 900,
        include: { game: true },
    });
    addGames(dealPrices.map(price => price.game));

    return [...candidates.values()].slice(0, MAX_CANDIDATES);
}

async function pricesForCandidates(prisma: PrismaClient, gameIds: string[]) {
    if (gameIds.length === 0) return new Map<string, StorePriceRecord[]>();

    const prices = await prisma.storePrice.findMany({
        where: { gameId: { in: gameIds } },
        orderBy: { price: 'asc' },
        take: 12000,
    });

    const byGameId = new Map<string, StorePriceRecord[]>();
    for (const price of prices) {
        const existing = byGameId.get(price.gameId) || [];
        if (existing.length < 8) existing.push(price);
        byGameId.set(price.gameId, existing);
    }

    return byGameId;
}

function scoreGame(
    game: GameRecord,
    profile: ReturnType<typeof buildTasteProfile>,
    wishlistGameIds: Set<string>,
    prices: StorePriceRecord[],
    collaborativeScore: number
): ScoredGame {
    const genres = parseJsonArray(game.genres);
    const genreKeys = genres.map(genreKey);
    const platforms = parseJsonArray(game.platforms);
    const reasons: string[] = [];

    const genreAffinity = weightedGenreScore(genres, profile.genreWeights);
    const dislikedPenalty = weightedGenreScore(genres, profile.dislikedGenreWeights);
    const bestLiked = bestSimilarLikedGame(game, profile.likedGames);
    const bestDisliked = bestSimilarLikedGame(game, profile.dislikedGames);

    const similarLikedScore = clamp(
        (bestLiked?.similarity || 0) * SCORE_WEIGHTS.similarLikedMultiplier,
        0,
        SCORE_WEIGHTS.similarLikedCap
    );
    const contentScore = clamp(
        genreAffinity * SCORE_WEIGHTS.genreAffinityMultiplier,
        0,
        SCORE_WEIGHTS.contentScoreCap
    ) + similarLikedScore;

    const wishlistScore = wishlistGameIds.has(game.id) ? SCORE_WEIGHTS.wishlistScore : 0;
    const activeGenreOverlap = profile.activeGames.some(activeGame =>
        overlapScore(genreKeys, parseJsonArray(activeGame.genres).map(genreKey)) > 0
    ) ? SCORE_WEIGHTS.activeGenreOverlapScore : 0;
    const tasteScore = clamp(wishlistScore + activeGenreOverlap + genreAffinity, 0, SCORE_WEIGHTS.tasteScoreCap);

    const criticScore = game.criticScore
        ? clamp((game.criticScore / 100) * SCORE_WEIGHTS.criticScoreCap, 0, SCORE_WEIGHTS.criticScoreCap)
        : 0;
    const qualityScore = criticScore +
        (hasCover(game) ? SCORE_WEIGHTS.coverQualityBonus : 0) +
        (game.source === 'seed' ? SCORE_WEIGHTS.seedQualityBonus : 0);

    const platform = strongestPlatform(platforms, profile.userPlatforms);
    const platformScore = platforms.length === 0
        ? SCORE_WEIGHTS.noPlatformScore
        : profile.userPlatforms.has(platform)
            ? SCORE_WEIGHTS.exactPlatformScore
            : platforms.includes(DEFAULT_PLATFORM)
                ? SCORE_WEIGHTS.pcFallbackPlatformScore
                : SCORE_WEIGHTS.otherPlatformScore;

    const dealSignal = priceSignal(prices);
    const priceScore = dealSignal.score;
    const collaborativeBoost = clamp(
        collaborativeScore * SCORE_WEIGHTS.collaborativeMultiplier,
        0,
        SCORE_WEIGHTS.collaborativeCap
    );

    const penalty = clamp(
        dislikedPenalty * SCORE_WEIGHTS.dislikedGenreMultiplier +
            ((bestDisliked?.similarity || 0) * SCORE_WEIGHTS.dislikedSimilarityMultiplier),
        0,
        SCORE_WEIGHTS.penaltyCap
    );
    const rawScore = contentScore + tasteScore + qualityScore + platformScore + priceScore + collaborativeBoost - penalty;

    const matchedGenres = genres.filter(genre => profile.genreWeights.has(genreKey(genre))).slice(0, 3);
    if (wishlistGameIds.has(game.id)) reasons.push('Already saved in your wishlist');
    if (matchedGenres.length > 0) reasons.push(`Matches your taste in ${matchedGenres.join(', ')}`);
    if (bestLiked && bestLiked.similarity >= 0.25) reasons.push(`Similar to ${bestLiked.game.title}`);
    if (collaborativeBoost >= 4) reasons.push('Liked by users with similar ratings');
    if (platform) reasons.push(`Playable on ${platform}`);
    if (dealSignal.reason) reasons.push(dealSignal.reason);
    if (game.criticScore) reasons.push(`Strong critic score (${game.criticScore})`);

    if (reasons.length === 0) {
        reasons.push(hasCover(game) ? 'Fresh discovery from the catalog' : 'Exploration pick outside your usual pattern');
    }

    const score = Number(clamp(rawScore, 0, 100).toFixed(2));

    const debugBreakdown = INCLUDE_RECOMMENDATION_DEBUG
        ? {
            contentScore: Number(contentScore.toFixed(2)),
            tasteScore: Number(tasteScore.toFixed(2)),
            qualityScore: Number(qualityScore.toFixed(2)),
            platformScore: Number(platformScore.toFixed(2)),
            priceScore: Number(priceScore.toFixed(2)),
            collaborativeBoost: Number(collaborativeBoost.toFixed(2)),
            penalty: Number(penalty.toFixed(2)),
            rawScore: Number(rawScore.toFixed(2)),
            genreAffinity: Number(genreAffinity.toFixed(2)),
            dislikedPenalty: Number(dislikedPenalty.toFixed(2)),
            bestLikedSimilarity: Number((bestLiked?.similarity || 0).toFixed(3)),
            bestLikedTitle: bestLiked?.game.title || null,
            bestLikedSharedTitleTokens: bestLiked?.sharedTitleTokens || 0,
            bestDislikedSimilarity: Number((bestDisliked?.similarity || 0).toFixed(3)),
            bestDislikedTitle: bestDisliked?.game.title || null,
            bestDislikedSharedTitleTokens: bestDisliked?.sharedTitleTokens || 0,
        }
        : undefined;

    return {
        game,
        score,
        confidence: clamp(Math.round(35 + score * 0.63), 35, 98),
        reasons: unique(reasons).slice(0, 3),
        ...(debugBreakdown ? { debugBreakdown } : {}),
        debug: {
            primaryGenre: genres[0] || 'Unknown',
            franchise: franchiseKey(game.title),
        },
    };
}

async function buildCollaborativeSignals(
    prisma: PrismaClient,
    userId: string,
    library: LibraryItem[]
): Promise<CollaborativeSignals> {
    const currentRatings = new Map(
        library
            .filter(item => item.rating !== null && item.rating !== undefined)
            .map(item => [item.gameId, item.rating || 0])
    );

    if (currentRatings.size === 0) {
        return { scores: new Map(), games: new Map() };
    }

    const otherRatings = await prisma.userGame.findMany({
        where: {
            userId: { not: userId },
            rating: { not: null },
        },
        include: { game: true },
    }) as LibraryItem[];

    const byUser = new Map<string, LibraryItem[]>();
    for (const item of otherRatings as (LibraryItem & { userId: string })[]) {
        const items = byUser.get(item.userId) || [];
        items.push(item);
        byUser.set(item.userId, items);
    }

    const libraryGameIds = new Set(library.map(item => item.gameId));
    const scores = new Map<string, number>();
    const games = new Map<string, GameRecord>();

    for (const items of byUser.values()) {
        let dot = 0;
        let currentMagnitude = 0;
        let otherMagnitude = 0;
        let overlap = 0;

        for (const item of items) {
            const currentRating = currentRatings.get(item.gameId);
            if (!currentRating) continue;

            const centeredCurrent = currentRating - 3;
            const centeredOther = (item.rating || 0) - 3;
            dot += centeredCurrent * centeredOther;
            currentMagnitude += centeredCurrent * centeredCurrent;
            otherMagnitude += centeredOther * centeredOther;
            overlap++;
        }

        if (overlap === 0 || currentMagnitude === 0 || otherMagnitude === 0) continue;

        const similarity = dot / (Math.sqrt(currentMagnitude) * Math.sqrt(otherMagnitude));
        if (similarity <= 0) continue;

        for (const item of items) {
            if (libraryGameIds.has(item.gameId) || (item.rating || 0) < 4) continue;

            scores.set(item.gameId, (scores.get(item.gameId) || 0) + similarity * ((item.rating || 0) / 5));
            games.set(item.gameId, item.game);
        }
    }

    return { scores, games };
}

function applyDiversity(scoredGames: ScoredGame[]) {
    const genreCounts = new Map<string, number>();
    const franchiseCounts = new Map<string, number>();

    return scoredGames
        .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title))
        .map(item => {
            const genreCount = genreCounts.get(item.debug.primaryGenre) || 0;
            const franchiseCount = franchiseCounts.get(item.debug.franchise) || 0;
            const diversityPenalty = Math.min(10, genreCount * 2 + franchiseCount * 3);

            genreCounts.set(item.debug.primaryGenre, genreCount + 1);
            franchiseCounts.set(item.debug.franchise, franchiseCount + 1);

            return {
                ...item,
                score: Number(Math.max(0, item.score - diversityPenalty).toFixed(2)),
            };
        })
        .sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title));
}

export async function buildRecommendations(prisma: PrismaClient, userId: string) {
    const [user, library, wishlist] = await Promise.all([
        prisma.user.findFirst({ where: { id: userId } }),
        prisma.userGame.findMany({ where: { userId }, include: { game: true } }),
        prisma.wishlistItem.findMany({ where: { userId }, include: { game: true } }),
    ]);

    const typedLibrary = library as LibraryItem[];
    const typedWishlist = wishlist as WishlistItem[];
    const libraryGameIds = typedLibrary.map(item => item.gameId);
    const wishlistGameIds = new Set(typedWishlist.map(item => item.gameId));
    const profile = buildTasteProfile(user, typedLibrary, typedWishlist);
    const collaborativeSignals = await buildCollaborativeSignals(prisma, userId, typedLibrary);
    const candidates = await collectCandidates(prisma, profile, libraryGameIds, typedWishlist, collaborativeSignals);
    const priceMap = await pricesForCandidates(prisma, candidates.map(game => game.id));

    const scored = candidates.map(game => scoreGame(
        game,
        profile,
        wishlistGameIds,
        priceMap.get(game.id) || [],
        collaborativeSignals.scores.get(game.id) || 0
    ));

    return applyDiversity(scored)
        .slice(0, 10)
        .map(({ debug, ...item }) => item);
}
