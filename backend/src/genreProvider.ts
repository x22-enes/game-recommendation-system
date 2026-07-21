import { normalizeTitle } from './coverProvider';

type GenreRule = {
    genres: string[];
    patterns: RegExp[];
};

const exactGenreOverrides: Record<string, string[]> = {
    [normalizeTitle('ARK: Survival Ascended')]: ['Survival', 'Adventure', 'Action'],
    [normalizeTitle('ARK: Survival Evolved')]: ['Survival', 'Adventure', 'Action'],
    [normalizeTitle('Elden Ring')]: ['Action', 'RPG', 'Open World'],
    [normalizeTitle('Path of Exile')]: ['RPG', 'Action'],
    [normalizeTitle('Warframe')]: ['Action', 'RPG', 'Shooter'],
    [normalizeTitle('Minecraft')]: ['Survival', 'Simulation', 'Adventure'],
    [normalizeTitle('Grand Theft Auto V')]: ['Action', 'Open World'],
    [normalizeTitle('Red Dead Redemption 2')]: ['Action', 'Open World', 'Adventure'],
    [normalizeTitle('The Witcher 3: Wild Hunt')]: ['RPG', 'Open World', 'Adventure'],
    [normalizeTitle('Cyberpunk 2077')]: ['Action', 'RPG', 'Open World'],
    [normalizeTitle('Portal')]: ['Puzzle', 'Adventure'],
    [normalizeTitle('Portal 2')]: ['Puzzle', 'Adventure'],
};

const franchiseRules: GenreRule[] = [
    { genres: ['Survival', 'Adventure', 'Action'], patterns: [/\bark\b/, /\bsubnautica\b/, /\bforest\b/, /\bdayz\b/, /\brust\b/] },
    { genres: ['Action', 'RPG'], patterns: [/\bdark souls\b/, /\bdemon s souls\b/, /\bbloodborne\b/, /\bsekiro\b/, /\bnioh\b/, /\bdiablo\b/, /\byakuza\b/] },
    { genres: ['RPG', 'Open World'], patterns: [/\belder scrolls\b/, /\bfallout\b/, /\bwitcher\b/, /\bdragon age\b/, /\bmass effect\b/] },
    { genres: ['Action', 'Open World'], patterns: [/\bgrand theft auto\b/, /\bgta\b/, /\bred dead\b/, /\bsaints row\b/, /\bjust cause\b/] },
    { genres: ['Shooter', 'Action'], patterns: [/\bdoom\b/, /\bhalo\b/, /\bcall of duty\b/, /\bbattlefield\b/, /\bcounter strike\b/, /\btitanfall\b/, /\bbioshock\b/] },
    { genres: ['Horror', 'Survival'], patterns: [/\bresident evil\b/, /\bsilent hill\b/, /\bdead space\b/, /\boutlast\b/, /\bamnesia\b/, /\balan wake\b/] },
    { genres: ['Platformer', 'Adventure'], patterns: [/\bmario\b/, /\bsonic\b/, /\bori\b/, /\bceleste\b/, /\bshovel knight\b/, /\bcuphead\b/] },
    { genres: ['Adventure', 'Open World'], patterns: [/\bzelda\b/, /\bhorizon\b/, /\bghost of tsushima\b/] },
    { genres: ['Strategy', 'Simulation'], patterns: [/\bcivilization\b/, /\bage of empires\b/, /\bstarcraft\b/, /\bxcom\b/, /\bcities skylines\b/, /\bcrusader kings\b/] },
    { genres: ['Racing', 'Sports'], patterns: [/\bforza\b/, /\bgran turismo\b/, /\bneed for speed\b/, /\bmoto ?gp\b/, /\bf1\b/, /\bfifa\b/, /\bnba\b/, /\bfootball\b/] },
];

const keywordRules: GenreRule[] = [
    { genres: ['Puzzle'], patterns: [/\bpuzzle\b/, /\bchess\b/, /\bmahjong\b/, /\bsudoku\b/, /\bsolitaire\b/, /\bmatch ?3\b/, /\bhidden object\b/, /\bhidden cats\b/] },
    { genres: ['Horror'], patterns: [/\bhorror\b/, /\bnightmare\b/, /\bhaunted\b/, /\bghost\b/, /\bterror\b/, /\bfear\b/, /\bzombie\b/] },
    { genres: ['Survival'], patterns: [/\bsurvival\b/, /\bsurvive\b/, /\bcraft\b/, /\bwilderness\b/, /\bpost apocalyptic\b/] },
    { genres: ['Shooter'], patterns: [/\bshooter\b/, /\bsniper\b/, /\bguns?\b/, /\bwarfare\b/, /\bbullet\b/, /\bfps\b/] },
    { genres: ['Action'], patterns: [/\baction\b/, /\bbattle\b/, /\bcombat\b/, /\bfight(?:er|ing)?\b/, /\bwarrior\b/, /\bninja\b/, /\bsamurai\b/] },
    { genres: ['RPG'], patterns: [/\brpg\b/, /\brole playing\b/, /\bdungeon\b/, /\bquest\b/, /\bkingdom\b/, /\bfantasy\b/, /\bdragon\b/] },
    { genres: ['Adventure'], patterns: [/\badventure\b/, /\bjourney\b/, /\bstory\b/, /\bmystery\b/, /\bdetective\b/, /\bescape\b/, /\bisland\b/] },
    { genres: ['Strategy'], patterns: [/\bstrategy\b/, /\btactics?\b/, /\btycoon\b/, /\bempire\b/, /\bwar chess\b/, /\bdefense\b/, /\btower defense\b/] },
    { genres: ['Simulation'], patterns: [/\bsim(?:ulator|ulation)?\b/, /\bfarming\b/, /\btruck\b/, /\btrain\b/, /\bflight\b/, /\bmanager\b/, /\bmanagement\b/] },
    { genres: ['Racing'], patterns: [/\bracing\b/, /\brace\b/, /\bdrift\b/, /\bcars?\b/, /\bkart\b/, /\bmotor\b/] },
    { genres: ['Sports'], patterns: [/\bsports?\b/, /\bsoccer\b/, /\bbasketball\b/, /\btennis\b/, /\bgolf\b/, /\bbaseball\b/, /\bhockey\b/] },
    { genres: ['Platformer'], patterns: [/\bplatform(?:er)?\b/, /\bparkour\b/, /\brunner\b/, /\bjump\b/] },
    { genres: ['Visual Novel'], patterns: [/\bvisual novel\b/, /\bdating\b/, /\bromance\b/, /\bnovel\b/] },
    { genres: ['Music'], patterns: [/\bmusic\b/, /\brhythm\b/, /\bdance\b/, /\bguitar\b/] },
    { genres: ['Arcade'], patterns: [/\barcade\b/, /\bpinball\b/, /\bbreakout\b/, /\bretro\b/] },
    { genres: ['VR'], patterns: [/\bvr\b/, /\bvirtual reality\b/] },
    { genres: ['Multiplayer'], patterns: [/\bmultiplayer\b/, /\bonline\b/, /\bco op\b/, /\bmmo\b/, /\bbattle royale\b/] },
    { genres: ['Casual'], patterns: [/\bcasual\b/, /\bclicker\b/, /\bidle\b/, /\bcoloring\b/, /\bjigsaw\b/] },
];

const preferredGenreOrder = [
    'Action',
    'Adventure',
    'RPG',
    'Open World',
    'Survival',
    'Shooter',
    'Horror',
    'Strategy',
    'Simulation',
    'Puzzle',
    'Platformer',
    'Racing',
    'Sports',
    'Fighting',
    'Visual Novel',
    'Music',
    'Arcade',
    'Multiplayer',
    'VR',
    'Casual',
    'Indie',
];

function hasGenres(value?: string | null) {
    if (!value) return false;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.length > 0;
    } catch {
        return false;
    }
}

function addGenres(target: Set<string>, genres: string[]) {
    genres.forEach(genre => target.add(genre));
}

export function inferGenresForTitle(title: string, currentGenres?: string | null) {
    if (hasGenres(currentGenres)) return currentGenres!;

    const normalized = normalizeTitle(title);
    const genres = new Set<string>();
    const exact = Object.prototype.hasOwnProperty.call(exactGenreOverrides, normalized)
        ? exactGenreOverrides[normalized]
        : undefined;
    if (Array.isArray(exact)) addGenres(genres, exact);

    for (const rule of [...franchiseRules, ...keywordRules]) {
        if (rule.patterns.some(pattern => pattern.test(normalized))) {
            addGenres(genres, rule.genres);
        }
    }

    if (genres.size === 0) {
        addGenres(genres, ['Adventure']);
    }

    const sorted = [...genres].sort((a, b) => {
        const aIndex = preferredGenreOrder.indexOf(a);
        const bIndex = preferredGenreOrder.indexOf(b);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex) || a.localeCompare(b);
    });

    return JSON.stringify(sorted.slice(0, 3));
}
