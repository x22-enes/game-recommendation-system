import { normalizeTitle } from './coverProvider';

export type PlatformName = 'PC' | 'PlayStation' | 'Xbox' | 'Nintendo';
export type ConsoleStoreName = 'Nintendo eShop' | 'PlayStation Store' | 'Xbox Store';

type PlatformRule = {
    titles: string[];
    platforms: PlatformName[];
    consoleStore?: ConsoleStoreName;
    premiumTitles?: string[];
};

const DEFAULT_PLATFORMS: PlatformName[] = ['PC', 'PlayStation', 'Xbox'];

const platformRules: PlatformRule[] = [
    {
        platforms: ['Nintendo'],
        consoleStore: 'Nintendo eShop',
        premiumTitles: ['The Legend of Zelda: Tears of the Kingdom'],
        titles: [
            'Animal Crossing: New Horizons',
            'Bayonetta 2',
            'Donkey Kong Country: Tropical Freeze',
            "Luigi's Mansion",
            'Mario Kart 8 Deluxe',
            'Metroid Dread',
            'Metroid Prime',
            'Pikmin 3',
            'Splatoon 2',
            'Super Mario 64',
            'Super Mario Galaxy',
            'Super Mario Odyssey',
            'Super Mario Sunshine',
            'Super Smash Bros. Melee',
            'Super Smash Bros. Ultimate',
            'The Legend of Zelda: Breath of the Wild',
            "The Legend of Zelda: Majora's Mask",
            'The Legend of Zelda: Ocarina of Time',
            'The Legend of Zelda: Tears of the Kingdom',
            'The Legend of Zelda: The Wind Waker',
            'The Legend of Zelda: Twilight Princess',
        ],
    },
    {
        platforms: ['PC', 'PlayStation'],
        consoleStore: 'PlayStation Store',
        titles: [
            'Days Gone',
            'Detroit: Become Human',
            'Ghost of Tsushima',
            'God of War (2018)',
            'God of War Ragnarok',
            'God of War Ragnarök',
            'Horizon Forbidden West',
            'Horizon Zero Dawn',
            'Ratchet & Clank: Rift Apart',
            'Returnal',
            'Spider-Man Remastered',
            'Spider-Man: Miles Morales',
            'The Last of Us Part I',
            'The Last of Us Part II',
            "Uncharted 4: A Thief's End",
            'Until Dawn',
        ],
    },
    {
        platforms: ['PlayStation'],
        consoleStore: 'PlayStation Store',
        titles: [
            'Bloodborne',
            "Demon's Souls",
            'Gran Turismo 7',
            'Infamous Second Son',
            'Metal Gear Solid 4: Guns of the Patriots',
            'Shadow of the Colossus',
            'Uncharted 2: Among Thieves',
        ],
    },
    {
        platforms: ['PC', 'Xbox'],
        consoleStore: 'Xbox Store',
        titles: [
            'Gears 5',
            'Gears of War',
            'Gears of War 2',
            'Halo 2',
            'Halo 3',
            'Halo Infinite',
            'Halo: Combat Evolved',
            'Halo: Reach',
        ],
    },
    {
        platforms: ['PC'],
        titles: [
            'Counter-Strike 2',
            'Dota 2',
            'League of Legends',
            'StarCraft II',
            'Team Fortress 2',
            'Valorant',
            'World of Warcraft',
        ],
    },
];

const ruleByTitle = new Map<string, PlatformRule>();
const premiumTitleKeys = new Set<string>();

for (const rule of platformRules) {
    for (const title of rule.titles) {
        ruleByTitle.set(normalizeTitle(title), rule);
    }
    for (const title of rule.premiumTitles || []) {
        premiumTitleKeys.add(normalizeTitle(title));
    }
}

export function platformsForTitle(title: string): PlatformName[] {
    const rule = ruleByTitle.get(normalizeTitle(title));
    return [...(rule?.platforms || DEFAULT_PLATFORMS)];
}

export function platformsForKnownTitle(title: string): PlatformName[] | null {
    const rule = ruleByTitle.get(normalizeTitle(title));
    return rule ? [...rule.platforms] : null;
}

export function hasKnownPlatformRule(title: string) {
    return ruleByTitle.has(normalizeTitle(title));
}

export function consoleStoreForTitle(title: string) {
    const rule = ruleByTitle.get(normalizeTitle(title));
    if (!rule?.consoleStore) return null;

    const price = premiumTitleKeys.has(normalizeTitle(title)) ? 69.99 : 59.99;
    return {
        storeName: rule.consoleStore,
        price,
    };
}
