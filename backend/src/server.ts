import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { Prisma, PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { findBestCover } from './coverProvider';
import { findVerifiedPrices } from './priceProvider';
import { hasKnownPlatformRule, platformsForKnownTitle } from './platformProvider';
import { buildRecommendations } from './recommendationEngine';
import { inferGenresForTitle } from './genreProvider';
import { fetchSteamDetails, steamAppIdFromUrl } from './steamProvider';
import { fetchLizardByteGameDetails, lizardByteIdFromSource, lizardByteMetadataForGame } from './lizardByteProvider';

dotenv.config();
const app = express();
const prisma = new PrismaClient();
const isProduction = process.env.NODE_ENV === 'production';

const allowedOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: isProduction
        ? {
            directives: {
                defaultSrc: ["'self'"],
                baseUri: ["'self'"],
                connectSrc: ["'self'", ...allowedOrigins],
                fontSrc: ["'self'", 'data:'],
                formAction: ["'self'"],
                frameAncestors: ["'none'"],
                imgSrc: ["'self'", 'data:', 'https:'],
                objectSrc: ["'none'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                upgradeInsecureRequests: [],
            },
        }
        : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'no-referrer' },
}));

app.use(cors({
    origin: allowedOrigins.length
        ? (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error('Not allowed by CORS'));
        }
        : isProduction ? false : true,
}));
app.use(express.json({ limit: '128kb', strict: true }));

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 700,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' },
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Please try again later.' },
});

const writeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many changes. Please try again later.' },
});

app.use('/api', apiLimiter);

const JWT_SECRET = process.env.JWT_SECRET || 'secret';

if (isProduction && (!process.env.JWT_SECRET || JWT_SECRET === 'secret' || JWT_SECRET.length < 32)) {
    throw new Error('Set JWT_SECRET to a strong value before running in production.');
}

const hasUsableCover = (coverUrl?: string | null) =>
    Boolean(coverUrl && coverUrl.startsWith('http') && !coverUrl.includes('screenshot'));

const hasSpecificPlatforms = (platforms?: string | null) => {
    const parsed = parseJsonArray(platforms);
    return parsed.length > 0 && !parsed.includes('Console');
};

const isDefaultPlatformFallback = (platforms?: string | null) => {
    const parsed = parseJsonArray(platforms).sort();
    return parsed.length === 3 &&
        parsed[0] === 'PC' &&
        parsed[1] === 'PlayStation' &&
        parsed[2] === 'Xbox';
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

const cleanBrowseSeed = (value: unknown) =>
    String(value || '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 80);

const isSafeUsername = (value: string) => /^[a-zA-Z0-9_-]{3,24}$/.test(value);

const signUserToken = (userId: string) => jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });

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

const WORLD_TOP_GAMES = [
    { title: 'The Legend of Zelda: Ocarina of Time', score: 99, note: 'Metacritic all-time rank' },
    { title: 'SoulCalibur', score: 98, note: 'Metacritic all-time rank' },
    { title: 'Super Mario Galaxy 2', score: 98, note: 'Metacritic all-time rank' },
    { title: 'Grand Theft Auto IV', score: 98, note: 'Metacritic all-time rank' },
    { title: 'Super Mario Galaxy', score: 97, note: 'Metacritic all-time rank' },
    { title: 'The Legend of Zelda: Breath of the Wild', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Perfect Dark', score: 97, note: 'Metacritic all-time rank' },
    { title: "Tony Hawk's Pro Skater 3", score: 97, note: 'Metacritic all-time rank' },
    { title: 'Red Dead Redemption 2', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Grand Theft Auto V', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Metroid Prime', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Grand Theft Auto III', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Super Mario Odyssey', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Halo: Combat Evolved', score: 97, note: 'Metacritic all-time rank' },
    { title: 'NFL 2K1', score: 97, note: 'Metacritic all-time rank' },
    { title: 'Half-Life 2', score: 96, note: 'Metacritic all-time rank' },
    { title: 'BioShock', score: 96, note: 'Metacritic all-time rank' },
    { title: 'GoldenEye 007', score: 96, note: 'Metacritic all-time rank' },
    { title: 'Uncharted 2: Among Thieves', score: 96, note: 'Metacritic all-time rank' },
    { title: 'Resident Evil 4', score: 96, note: 'Metacritic all-time rank' },
    { title: "Baldur's Gate 3", score: 96, note: 'Metacritic all-time rank' },
    { title: 'The Orange Box', score: 96, note: 'Metacritic all-time rank' },
    { title: 'Tekken 3', score: 96, note: 'Metacritic all-time rank' },
    { title: 'Mass Effect 2', score: 96, note: 'Metacritic all-time rank' },
    { title: 'The Elder Scrolls V: Skyrim', score: 96, note: 'Metacritic all-time rank' },
    { title: 'The Last of Us', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'Red Dead Redemption', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'Portal 2', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'Elden Ring', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'God of War', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Metal Gear Solid V: The Phantom Pain', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'Persona 5 Royal', score: 95, note: 'Highly acclaimed all-time ranking' },
    { title: 'The Witcher 3: Wild Hunt', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'God of War Ragnarok', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Batman: Arkham City', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Minecraft', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Half-Life: Alyx', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Hades', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Divinity: Original Sin II', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'The Last of Us Part II', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Undertale', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Bloodborne', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'The Legend of Zelda: Tears of the Kingdom', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Super Smash Bros. Ultimate', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Mass Effect 3', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Resident Evil 2', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Sekiro: Shadows Die Twice', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Shadow of the Colossus', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Animal Crossing: New Horizons', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Doom Eternal', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Final Fantasy VII Remake', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Final Fantasy XIV Online', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Disco Elysium', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Celeste', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Inside', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'The Elder Scrolls IV: Oblivion', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Fallout 3', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Fallout: New Vegas', score: 84, note: 'Community classic ranking' },
    { title: 'Dark Souls', score: 89, note: 'Community classic ranking' },
    { title: 'Dark Souls III', score: 89, note: 'Community classic ranking' },
    { title: 'Demon\'s Souls', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Hollow Knight', score: 90, note: 'Community classic ranking' },
    { title: 'Stardew Valley', score: 89, note: 'Community classic ranking' },
    { title: 'Terraria', score: 83, note: 'Community classic ranking' },
    { title: 'Civilization VI', score: 88, note: 'Community classic ranking' },
    { title: 'Sid Meier\'s Civilization V', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'XCOM 2', score: 88, note: 'Community classic ranking' },
    { title: 'StarCraft II: Wings of Liberty', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Diablo III', score: 88, note: 'Community classic ranking' },
    { title: 'World of Warcraft', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Overwatch', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Apex Legends', score: 89, note: 'Community classic ranking' },
    { title: 'Fortnite', score: 81, note: 'Community classic ranking' },
    { title: 'Counter-Strike 2', score: 82, note: 'Global esports ranking' },
    { title: 'Counter-Strike: Global Offensive', score: 83, note: 'Global esports ranking' },
    { title: 'Dota 2', score: 90, note: 'Global esports ranking' },
    { title: 'League of Legends', score: 78, note: 'Global esports ranking' },
    { title: 'Valorant', score: 80, note: 'Global esports ranking' },
    { title: 'Rocket League', score: 86, note: 'Community classic ranking' },
    { title: 'Rainbow Six Siege', score: 79, note: 'Community classic ranking' },
    { title: 'Call of Duty 4: Modern Warfare', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Call of Duty: Modern Warfare 2', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Halo 3', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Halo: Reach', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Gears of War', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Uncharted 4: A Thief\'s End', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Uncharted 3: Drake\'s Deception', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Tomb Raider', score: 86, note: 'Community classic ranking' },
    { title: 'Rise of the Tomb Raider', score: 88, note: 'Community classic ranking' },
    { title: 'Assassin\'s Creed II', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Assassin\'s Creed IV: Black Flag', score: 88, note: 'Community classic ranking' },
    { title: 'Metal Gear Solid 4: Guns of the Patriots', score: 94, note: 'Highly acclaimed all-time ranking' },
    { title: 'Death Stranding', score: 82, note: 'Community classic ranking' },
    { title: 'Control', score: 85, note: 'Community classic ranking' },
    { title: 'Alan Wake 2', score: 89, note: 'Community classic ranking' },
    { title: 'Resident Evil Village', score: 84, note: 'Community classic ranking' },
    { title: 'Resident Evil 7: Biohazard', score: 86, note: 'Community classic ranking' },
    { title: 'Monster Hunter: World', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Monster Hunter Rise', score: 88, note: 'Community classic ranking' },
    { title: 'Forza Horizon 5', score: 92, note: 'Highly acclaimed all-time ranking' },
    { title: 'Gran Turismo 7', score: 87, note: 'Community classic ranking' },
    { title: 'Microsoft Flight Simulator', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'The Sims 4', score: 70, note: 'Popular catalog ranking' },
    { title: 'The Sims 3', score: 86, note: 'Community classic ranking' },
    { title: 'RimWorld', score: 87, note: 'Community classic ranking' },
    { title: 'Factorio', score: 90, note: 'Community classic ranking' },
    { title: 'Satisfactory', score: 85, note: 'Community classic ranking' },
    { title: 'Subnautica', score: 87, note: 'Community classic ranking' },
    { title: 'No Man\'s Sky', score: 83, note: 'Community classic ranking' },
    { title: 'HITMAN World of Assassination', score: 87, note: 'Community classic ranking' },
    { title: 'NieR: Automata', score: 88, note: 'Community classic ranking' },
    { title: 'Ori and the Will of the Wisps', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Dead Cells', score: 89, note: 'Community classic ranking' },
    { title: 'Slay the Spire', score: 89, note: 'Community classic ranking' },
    { title: 'Balatro', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Cuphead', score: 88, note: 'Community classic ranking' },
    { title: 'Firewatch', score: 81, note: 'Popular catalog ranking' },
    { title: 'What Remains of Edith Finch', score: 88, note: 'Community classic ranking' },
    { title: 'Outer Wilds', score: 85, note: 'Community classic ranking' },
    { title: 'Tunic', score: 85, note: 'Community classic ranking' },
    { title: 'Return of the Obra Dinn', score: 89, note: 'Community classic ranking' },
    { title: 'Braid', score: 93, note: 'Highly acclaimed all-time ranking' },
    { title: 'Limbo', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Papers, Please', score: 85, note: 'Community classic ranking' },
    { title: 'Hotline Miami', score: 85, note: 'Community classic ranking' },
    { title: 'FTL: Faster Than Light', score: 84, note: 'Community classic ranking' },
    { title: 'Into the Breach', score: 89, note: 'Community classic ranking' },
    { title: 'The Binding of Isaac: Rebirth', score: 86, note: 'Community classic ranking' },
    { title: 'Spelunky 2', score: 91, note: 'Highly acclaimed all-time ranking' },
    { title: 'Rogue Legacy 2', score: 88, note: 'Community classic ranking' },
    { title: 'Vampire Survivors', score: 86, note: 'Community classic ranking' },
    { title: 'Dave the Diver', score: 90, note: 'Highly acclaimed all-time ranking' },
    { title: 'Pizza Tower', score: 89, note: 'Community classic ranking' },
    { title: 'Hi-Fi RUSH', score: 89, note: 'Community classic ranking' },
    { title: 'Sea of Stars', score: 87, note: 'Community classic ranking' },
    { title: 'Lies of P', score: 84, note: 'Community classic ranking' },
];

const TRENDING_GAMES = [
    { title: 'Counter-Strike 2', score: 1_219_924, note: 'Steam peak today' },
    { title: 'Palworld', score: 804_856, note: 'Steam peak today' },
    { title: 'Dota 2', score: 758_395, note: 'Steam peak today' },
    { title: 'PUBG: BATTLEGROUNDS', score: 753_162, note: 'Steam peak today' },
    { title: 'TBH: Task Bar Hero', score: 269_645, note: 'Steam peak today' },
    { title: 'Bongo Cat', score: 174_646, note: 'Steam peak today' },
    { title: 'FiveM', score: 182_902, note: 'Steam peak today' },
    { title: 'Marvel Rivals', score: 117_912, note: 'Steam peak today' },
    { title: 'EA SPORTS FC 26', score: 130_304, note: 'Steam peak today' },
    { title: 'The Binding of Isaac: Rebirth', score: 131_073, note: 'Steam peak today' },
    { title: 'Apex Legends', score: 197_638, note: 'Steam peak today' },
    { title: 'Slay the Spire 2', score: 101_419, note: 'Steam peak today' },
    { title: 'Rust', score: 131_964, note: 'Steam peak today' },
    { title: 'Grand Theft Auto V Enhanced', score: 105_615, note: 'Steam peak today' },
    { title: 'Delta Force', score: 125_163, note: 'Steam peak today' },
    { title: 'Stardew Valley', score: 103_768, note: 'Steam peak today' },
    { title: 'Dead by Daylight', score: 82_806, note: 'Steam peak today' },
    { title: "Tom Clancy's Rainbow Six Siege", score: 68_666, note: 'Steam peak today' },
    { title: 'Warframe', score: 71_918, note: 'Steam peak today' },
    { title: 'Battlefield 6', score: 81_745, note: 'Steam peak today' },
    { title: 'VRChat', score: 57_312, note: 'Steam peak today' },
    { title: 'Deadlock', score: 59_840, note: 'Steam peak today' },
    { title: 'Overwatch 2', score: 55_273, note: 'Steam peak today' },
    { title: 'Grand Theft Auto V Legacy', score: 93_912, note: 'Steam peak today' },
    { title: 'Destiny 2', score: 54_302, note: 'Steam peak today' },
    { title: 'Team Fortress 2', score: 58_766, note: 'Steam peak today' },
    { title: 'Limbus Company', score: 44_573, note: 'Steam peak today' },
    { title: 'Cyberpunk 2077', score: 60_013, note: 'Steam peak today' },
    { title: 'War Thunder', score: 69_285, note: 'Steam peak today' },
    { title: 'NARAKA: BLADEPOINT', score: 97_291, note: 'Steam peak today' },
    { title: 'Geometry Dash', score: 63_496, note: 'Steam peak today' },
    { title: 'Crosshair X', score: 46_699, note: 'Steam peak today' },
    { title: 'MECCHA CHAMELEON', score: 53_882, note: 'Steam peak today' },
    { title: 'Left 4 Dead 2', score: 34_946, note: 'Steam peak today' },
    { title: 'PAYDAY 2', score: 34_276, note: 'Steam peak today' },
    { title: 'Don\'t Starve Together', score: 65_252, note: 'Steam peak today' },
    { title: 'Hearts of Iron IV', score: 53_133, note: 'Steam peak today' },
    { title: 'Red Dead Redemption 2', score: 45_047, note: 'Steam peak today' },
    { title: 'Granblue Fantasy: Relink', score: 53_936, note: 'Steam peak today' },
    { title: 'ARK: Survival Ascended', score: 38_675, note: 'Steam peak today' },
    { title: 'Terraria', score: 40_514, note: 'Steam peak today' },
    { title: 'Path of Exile 2', score: 49_462, note: 'Steam peak today' },
    { title: 'ARC Raiders', score: 48_414, note: 'Steam peak today' },
    { title: 'tModLoader', score: 40_974, note: 'Steam peak today' },
    { title: 'Assassin\'s Creed Black Flag Resynced', score: 46_472, note: 'Steam peak today' },
    { title: 'RimWorld', score: 33_728, note: 'Steam peak today' },
    { title: 'Sid Meier\'s Civilization VI', score: 39_233, note: 'Steam peak today' },
    { title: 'ELDEN RING', score: 35_974, note: 'Steam peak today' },
    { title: 'Call of Duty', score: 36_521, note: 'Steam peak today' },
    { title: 'DayZ', score: 54_118, note: 'Steam peak today' },
    { title: 'Project Zomboid', score: 32_737, note: 'Steam peak today' },
    { title: '7 Days to Die', score: 39_021, note: 'Steam peak today' },
    { title: 'NBA 2K26', score: 34_970, note: 'Steam peak today' },
    { title: 'The Elder Scrolls V: Skyrim Special Edition', score: 32_258, note: 'Steam peak today' },
    { title: 'HELLDIVERS 2', score: 30_832, note: 'Steam peak today' },
    { title: 'R.E.P.O.', score: 32_845, note: 'Steam peak today' },
    { title: 'Forza Horizon 6', score: 36_740, note: 'Steam peak today' },
    { title: 'Mount & Blade II: Bannerlord', score: 35_744, note: 'Steam peak today' },
    { title: 'Garry\'s Mod', score: 35_169, note: 'Steam peak today' },
    { title: 'The Sims 4', score: 31_147, note: 'Steam peak today' },
    { title: 'Football Manager 26', score: 44_357, note: 'Steam peak today' },
    { title: 'ARK: Survival Evolved', score: 26_350, note: 'Steam peak today' },
    { title: 'Escape from Tarkov', score: 30_161, note: 'Steam peak today' },
    { title: 'Total War: WARHAMMER III', score: 29_734, note: 'Steam peak today' },
    { title: 'Black Desert', score: 19_661, note: 'Steam peak today' },
    { title: 'FINAL FANTASY XIV Online', score: 22_373, note: 'Steam peak today' },
    { title: 'Arena Breakout: Infinite', score: 31_975, note: 'Steam peak today' },
    { title: 'Crusader Kings III', score: 24_637, note: 'Steam peak today' },
    { title: 'Monster Hunter: World', score: 28_359, note: 'Steam peak today' },
    { title: 'eFootball', score: 25_861, note: 'Steam peak today' },
    { title: 'Street Fighter 6', score: 31_184, note: 'Steam peak today' },
    { title: 'Unturned', score: 15_824, note: 'Steam peak today' },
    { title: 'ELDEN RING NIGHTREIGN', score: 32_468, note: 'Steam peak today' },
    { title: 'Satisfactory', score: 25_916, note: 'Steam peak today' },
    { title: 'Euro Truck Simulator 2', score: 45_806, note: 'Steam peak today' },
    { title: 'Age of Empires II: Definitive Edition', score: 20_522, note: 'Steam peak today' },
    { title: 'Rocket League', score: 25_969, note: 'Steam peak today' },
    { title: 'BeamNG.drive', score: 28_182, note: 'Steam peak today' },
    { title: 'Banana', score: 12_564, note: 'Steam peak today' },
    { title: 'Phasmophobia', score: 22_615, note: 'Steam peak today' },
    { title: 'Valheim', score: 27_742, note: 'Steam peak today' },
    { title: 'THE FINALS', score: 18_791, note: 'Steam peak today' },
    { title: 'Monster Hunter Wilds', score: 25_396, note: 'Steam peak today' },
    { title: 'Factorio', score: 22_815, note: 'Steam peak today' },
    { title: 'Diablo IV', score: 18_308, note: 'Steam peak today' },
    { title: 'Yu-Gi-Oh! Master Duel', score: 18_561, note: 'Steam peak today' },
    { title: 'MapleStory', score: 11_430, note: 'Steam peak today' },
    { title: 'SpiritVale', score: 19_847, note: 'Steam peak today' },
    { title: 'PEAK', score: 16_235, note: 'Steam peak today' },
    { title: 'Farming Simulator 25', score: 44_560, note: 'Steam peak today' },
    { title: 'MIR4', score: 11_028, note: 'Steam peak today' },
    { title: 'Heartopia', score: 17_381, note: 'Steam peak today' },
    { title: 'BidKing', score: 13_280, note: 'Steam peak today' },
    { title: 'Stellaris', score: 15_188, note: 'Steam peak today' },
    { title: 'The Outlast Trials', score: 17_735, note: 'Steam peak today' },
    { title: 'Wuthering Waves', score: 18_425, note: 'Steam peak today' },
    { title: 'Kingdom Come: Deliverance II', score: 21_185, note: 'Steam peak today' },
    { title: 'Warhammer 40,000: Darktide', score: 15_369, note: 'Steam peak today' },
    { title: 'Football Manager 2024', score: 19_679, note: 'Steam peak today' },
    { title: 'Russian Fishing 4', score: 20_570, note: 'Steam peak today' },
    { title: 'Marathon', score: 14_809, note: 'Steam peak today' },
    { title: 'The Isle', score: 16_144, note: 'Steam peak today' },
    { title: 'Once Human', score: 16_652, note: 'Steam peak today' },
    { title: 'DELTARUNE', score: 13_935, note: 'Steam peak today' },
    { title: 'Warhammer 40,000: Space Marine 2', score: 16_011, note: 'Steam peak today' },
    { title: 'Sid Meier\'s Civilization V', score: 16_157, note: 'Steam peak today' },
    { title: 'Schedule I', score: 13_898, note: 'Steam peak today' },
    { title: 'Oxygen Not Included', score: 15_617, note: 'Steam peak today' },
    { title: 'The Witcher 3: Wild Hunt', score: 22_182, note: 'Steam peak today' },
    { title: 'Fallout 4', score: 14_142, note: 'Steam peak today' },
];

const normalizeRankingTitle = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

let availableGenresCache: { value: string[]; expiresAt: number } | null = null;
const AVAILABLE_GENRES_CACHE_MS = 30 * 60 * 1000;

const buildCuratedRanking = async (
    list: { title: string; score: number; note: string }[],
    limit: number,
    source: string
) => {
    const requested = list.slice(0, Math.min(list.length, limit + 40));
    const exactCandidates = await prisma.game.findMany({
        where: {
            OR: requested.map(item => ({
                title: { equals: item.title, mode: 'insensitive' as const },
            })),
        },
        take: Math.max(100, requested.length * 3),
    });
    const looseCandidates = await prisma.game.findMany({
        where: {
            OR: requested.map(item => ({
                title: { contains: item.title, mode: 'insensitive' as const },
            })),
        },
        take: Math.max(200, requested.length * 8),
    });
    const candidates = [...exactCandidates, ...looseCandidates];
    const byNormalizedTitle = new Map(candidates.map(game => [normalizeRankingTitle(game.title), game]));
    const rows = [];

    for (const item of requested) {
        if (rows.length >= limit) break;
        const normalizedTitle = normalizeRankingTitle(item.title);
        const game =
            byNormalizedTitle.get(normalizedTitle) ||
            candidates.find(candidate => {
                const normalizedCandidate = normalizeRankingTitle(candidate.title);
                return normalizedCandidate.startsWith(`${normalizedTitle} `);
            }) ||
            candidates.find(candidate => normalizeRankingTitle(candidate.title).includes(normalizedTitle));
        if (!game) continue;
        rows.push({
            rank: rows.length + 1,
            score: item.score,
            source,
            note: item.note,
            referenceTitle: item.title,
            game,
        });
    }

    return rows;
};

const getAvailableGenres = async () => {
    if (availableGenresCache && availableGenresCache.expiresAt > Date.now()) {
        return availableGenresCache.value;
    }

    const games = await prisma.game.findMany({
        select: { genres: true },
    });
    const genres = unique(games.flatMap(game => parseJsonArray(game.genres)));
    availableGenresCache = {
        value: genres,
        expiresAt: Date.now() + AVAILABLE_GENRES_CACHE_MS,
    };
    return genres;
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
    const hasLikelyFallbackPlatforms = isDefaultPlatformFallback(game.platforms) && !hasKnownPlatformRule(game.title);

    if (lizardByteId && (
        !hasUsableCover(game.coverUrl) ||
        parseJsonArray(game.genres).length === 0 ||
        !hasSpecificPlatforms(game.platforms) ||
        hasLikelyFallbackPlatforms ||
        !game.description ||
        !game.criticScore
    )) {
        const details = await fetchLizardByteGameDetails(lizardByteId);
        const metadata = lizardByteMetadataForGame(details);

        if (!hasUsableCover(game.coverUrl) && metadata.coverUrl) updates.coverUrl = metadata.coverUrl;
        if (parseJsonArray(game.genres).length === 0 && metadata.genres?.length) updates.genres = JSON.stringify(metadata.genres);
        if ((!hasSpecificPlatforms(game.platforms) || hasLikelyFallbackPlatforms) && metadata.platforms?.length) {
            updates.platforms = JSON.stringify(metadata.platforms);
        }
        if (!game.description && metadata.description) updates.description = metadata.description;
        if (!game.criticScore && metadata.criticScore) {
            updates.criticScore = metadata.criticScore;
            updates.criticSource = 'IGDB via LizardByte/GameDB';
        }
    }

    if (hasLikelyFallbackPlatforms && !updates.platforms) {
        updates.platforms = JSON.stringify([]);
    }

    if (!hasUsableCover(game.coverUrl)) {
        const coverUrl = await findBestCover(game.title);
        if (coverUrl) {
            updates.coverUrl = coverUrl;
            if (!lizardByteId) updates.source = 'cover-provider';
        }
    }

    if (!hasSpecificPlatforms(updates.platforms ?? game.platforms)) {
        const knownPlatforms = platformsForKnownTitle(game.title);
        if (knownPlatforms) updates.platforms = JSON.stringify(knownPlatforms);
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
app.post('/api/auth/login', authLimiter, async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signUserToken(user.id), user: publicAuthUser(user) });
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');

    if (!isSafeUsername(username)) {
        return res.status(400).json({ error: 'Username must be 3-24 characters and use only letters, numbers, _ or -.' });
    }
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

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
    const browseSeed = cleanBrowseSeed(req.query.seed);
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
                : browseSeed
                    ? Prisma.sql`
                    CASE WHEN "coverUrl" LIKE 'http%' THEN 0 ELSE 1 END,
                    md5("id" || ${browseSeed})
                `
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
        const [worldTop, trendingTop, communityTop] = await Promise.all([
            buildCuratedRanking(WORLD_TOP_GAMES, limit, 'Metacritic all-time'),
            buildCuratedRanking(TRENDING_GAMES, limit, 'Steam current players'),
            rankCommunityGames(limit),
        ]);

        res.json({
            limit,
            worldTop,
            trendingTop,
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

app.post('/api/games/:id/comments', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.post('/api/comments/:id/like', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.post('/api/library/:gameId', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.patch('/api/library/:gameId', writeLimiter, authenticate, async (req: any, res: any) => {
    try {
        const { rating, status } = req.body;
        await prisma.userGame.updateMany({ where: { userId: req.user.userId, gameId: req.params.gameId }, data: { rating, status } });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: 'Failed to update library entry' }); }
});

app.delete('/api/library/:gameId', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.post('/api/wishlist/:gameId', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.delete('/api/wishlist/:gameId', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.patch('/api/preferences', writeLimiter, authenticate, async (req: any, res: any) => {
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

app.patch('/api/profile', writeLimiter, authenticate, async (req: any, res: any) => {
    try {
        const avatarUrl = String(req.body.avatarUrl || '').trim();
        const steamProfileUrl = String(req.body.steamProfileUrl || '').trim();

        const isAvatar = (value: string) => !value || /^data:image\/(png|jpe?g|webp);base64,/i.test(value) || /^https?:\/\/\S+\.\S+/.test(value);
        const isUrl = (value: string) => !value || /^https?:\/\/\S+\.\S+/.test(value);
        if (!isAvatar(avatarUrl)) return res.status(400).json({ error: 'Avatar must be an image file' });
        if (!isUrl(steamProfileUrl)) return res.status(400).json({ error: 'Steam profile must be a valid URL' });
        if (avatarUrl.length > 100_000 || steamProfileUrl.length > 500) {
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
