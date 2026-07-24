import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { platformsForTitle } from '../src/platformProvider';

const prisma = new PrismaClient();

const massiveLibrary = [
    // FromSoftware & Soulslikes
    { title: "Dark Souls: Remastered", genres: ["Action", "RPG"] }, { title: "Dark Souls II", genres: ["Action", "RPG"] }, { title: "Dark Souls II: Scholar of the First Sin", genres: ["Action", "RPG"] }, { title: "Dark Souls III", genres: ["Action", "RPG"] }, { title: "Demon's Souls", genres: ["Action", "RPG"] }, { title: "Bloodborne", genres: ["Action", "RPG", "Horror"] }, { title: "Sekiro: Shadows Die Twice", genres: ["Action", "Adventure"] }, { title: "Elden Ring", genres: ["Action", "RPG", "Open World"] }, { title: "Lies of P", genres: ["Action", "RPG"] }, { title: "Nioh 2", genres: ["Action", "RPG"] },
    
    // Rockstar
    { title: "Grand Theft Auto III", genres: ["Action", "Open World"] }, { title: "Grand Theft Auto: Vice City", genres: ["Action", "Open World"] }, { title: "Grand Theft Auto: San Andreas", genres: ["Action", "Open World"] }, { title: "Grand Theft Auto IV", genres: ["Action", "Open World"] }, { title: "Grand Theft Auto V", genres: ["Action", "Open World"] }, { title: "Red Dead Redemption", genres: ["Action", "Open World"] }, { title: "Red Dead Redemption 2", genres: ["Action", "Open World"] }, { title: "Bully", genres: ["Action", "Adventure"] }, { title: "Max Payne 3", genres: ["Shooter", "Action"] }, { title: "L.A. Noire", genres: ["Adventure", "Mystery"] },

    // RPGs & Bethesda
    { title: "The Elder Scrolls III: Morrowind", genres: ["RPG", "Open World"] }, { title: "The Elder Scrolls IV: Oblivion", genres: ["RPG", "Open World"] }, { title: "The Elder Scrolls V: Skyrim", genres: ["RPG", "Open World"] }, { title: "Fallout 3", genres: ["RPG", "Open World"] }, { title: "Fallout: New Vegas", genres: ["RPG", "Open World"] }, { title: "Fallout 4", genres: ["RPG", "Open World"] }, { title: "The Witcher", genres: ["RPG"] }, { title: "The Witcher 2: Assassins of Kings", genres: ["RPG"] }, { title: "The Witcher 3: Wild Hunt", genres: ["RPG", "Open World"] }, { title: "Cyberpunk 2077", genres: ["Action", "RPG"] }, { title: "Mass Effect", genres: ["RPG", "Shooter"] }, { title: "Mass Effect 2", genres: ["RPG", "Shooter"] }, { title: "Mass Effect 3", genres: ["RPG", "Shooter"] }, { title: "Dragon Age: Origins", genres: ["RPG"] }, { title: "Dragon Age: Inquisition", genres: ["RPG"] },

    // Nintendo & Platformers
    { title: "The Legend of Zelda: Ocarina of Time", genres: ["Adventure"] }, { title: "The Legend of Zelda: Majora's Mask", genres: ["Adventure"] }, { title: "The Legend of Zelda: The Wind Waker", genres: ["Adventure"] }, { title: "The Legend of Zelda: Twilight Princess", genres: ["Adventure"] }, { title: "The Legend of Zelda: Breath of the Wild", genres: ["Adventure", "Open World"] }, { title: "The Legend of Zelda: Tears of the Kingdom", genres: ["Adventure", "Open World"] }, { title: "Super Mario 64", genres: ["Platformer"] }, { title: "Super Mario Sunshine", genres: ["Platformer"] }, { title: "Super Mario Galaxy", genres: ["Platformer"] }, { title: "Super Mario Odyssey", genres: ["Platformer"] }, { title: "Metroid Prime", genres: ["Adventure", "Shooter"] }, { title: "Metroid Dread", genres: ["Adventure", "Platformer"] }, { title: "Super Smash Bros. Melee", genres: ["Fighting"] }, { title: "Super Smash Bros. Ultimate", genres: ["Fighting"] }, { title: "Mario Kart 8 Deluxe", genres: ["Racing"] }, { title: "Animal Crossing: New Horizons", genres: ["Simulation"] }, { title: "Splatoon 2", genres: ["Shooter"] }, { title: "Donkey Kong Country: Tropical Freeze", genres: ["Platformer"] }, { title: "Luigi's Mansion", genres: ["Adventure"] }, { title: "Pikmin 3", genres: ["Adventure", "Puzzle"] },

    // Sony Exclusives
    { title: "God of War (2018)", genres: ["Action", "Adventure"] }, { title: "God of War Ragnarök", genres: ["Action", "Adventure"] }, { title: "The Last of Us Part I", genres: ["Action", "Horror"] }, { title: "The Last of Us Part II", genres: ["Action", "Horror"] }, { title: "Uncharted 2: Among Thieves", genres: ["Action", "Adventure"] }, { title: "Uncharted 4: A Thief's End", genres: ["Action", "Adventure"] }, { title: "Spider-Man Remastered", genres: ["Action", "Adventure"] }, { title: "Spider-Man: Miles Morales", genres: ["Action", "Adventure"] }, { title: "Ghost of Tsushima", genres: ["Action", "Open World"] }, { title: "Horizon Zero Dawn", genres: ["Action", "RPG"] }, { title: "Horizon Forbidden West", genres: ["Action", "RPG"] }, { title: "Bloodborne", genres: ["Action", "RPG"] }, { title: "Shadow of the Colossus", genres: ["Adventure"] }, { title: "Infamous Second Son", genres: ["Action", "Adventure"] }, { title: "Ratchet & Clank: Rift Apart", genres: ["Platformer", "Action"] }, { title: "Returnal", genres: ["Shooter", "Action"] }, { title: "Days Gone", genres: ["Action", "Horror"] }, { title: "Until Dawn", genres: ["Action", "Adventure"] }, { title: "Detroit: Become Human", genres: ["Horror", "Adventure"] }, { title: "Gran Turismo 7", genres: ["Racing"] },

    // Shooters (FPS / TPS)
    { title: "Half-Life", genres: ["Shooter", "Action"] }, { title: "Half-Life 2", genres: ["Shooter", "Action"] }, { title: "Portal", genres: ["Puzzle", "Adventure"] }, { title: "Portal 2", genres: ["Puzzle", "Adventure"] }, { title: "Left 4 Dead 2", genres: ["Shooter", "Horror"] }, { title: "Team Fortress 2", genres: ["Shooter"] }, { title: "Counter-Strike 2", genres: ["Shooter"] }, { title: "Halo: Combat Evolved", genres: ["Shooter", "Action"] }, { title: "Halo 2", genres: ["Shooter", "Action"] }, { title: "Halo 3", genres: ["Shooter", "Action"] }, { title: "Halo: Reach", genres: ["Shooter", "Action"] }, { title: "Halo Infinite", genres: ["Shooter", "Action"] }, { title: "Gears of War", genres: ["Shooter", "Action"] }, { title: "Gears of War 2", genres: ["Shooter", "Action"] }, { title: "Gears 5", genres: ["Shooter", "Action"] }, { title: "DOOM (2016)", genres: ["Shooter", "Action"] }, { title: "DOOM Eternal", genres: ["Shooter", "Action"] }, { title: "Wolfenstein: The New Order", genres: ["Shooter", "Action"] }, { title: "Wolfenstein II: The New Colossus", genres: ["Shooter", "Action"] }, { title: "BioShock", genres: ["Shooter", "RPG"] }, { title: "BioShock Infinite", genres: ["Shooter", "Adventure"] }, { title: "Call of Duty 4: Modern Warfare", genres: ["Shooter"] }, { title: "Call of Duty: Modern Warfare 2", genres: ["Shooter"] }, { title: "Call of Duty: Black Ops", genres: ["Shooter"] }, { title: "Call of Duty: Black Ops II", genres: ["Shooter"] }, { title: "Battlefield Bad Company 2", genres: ["Shooter"] }, { title: "Battlefield 3", genres: ["Shooter"] }, { title: "Battlefield 4", genres: ["Shooter"] }, { title: "Battlefield 1", genres: ["Shooter"] }, { title: "Titanfall 2", genres: ["Shooter", "Action"] },

    // Horror & Survival
    { title: "Resident Evil Remake", genres: ["Horror", "Survival"] }, { title: "Resident Evil 2 Remake", genres: ["Horror", "Survival"] }, { title: "Resident Evil 3 Remake", genres: ["Horror", "Survival"] }, { title: "Resident Evil 4 Remake", genres: ["Horror", "Survival"] }, { title: "Resident Evil 7: Biohazard", genres: ["Horror", "Survival"] }, { title: "Resident Evil Village", genres: ["Horror", "Survival"] }, { title: "Silent Hill 2", genres: ["Horror", "Survival"] }, { title: "Silent Hill 3", genres: ["Horror", "Survival"] }, { title: "Dead Space Remake", genres: ["Horror", "Survival"] }, { title: "Dead Space 2", genres: ["Horror", "Survival"] }, { title: "Amnesia: The Dark Descent", genres: ["Horror", "Adventure"] }, { title: "Outlast", genres: ["Horror", "Adventure"] }, { title: "Alien: Isolation", genres: ["Horror", "Survival"] }, { title: "Alan Wake", genres: ["Horror", "Adventure"] }, { title: "Alan Wake 2", genres: ["Horror", "Adventure"] }, { title: "The Evil Within", genres: ["Horror", "Survival"] }, { title: "SOMA", genres: ["Horror", "Adventure"] }, { title: "Phasmophobia", genres: ["Horror", "Co-op"] }, { title: "Dying Light", genres: ["Horror", "Action"] }, { title: "Dying Light 2 Stay Human", genres: ["Horror", "Action"] },

    // Action / Adventure & Stealth
    { title: "Metal Gear Solid", genres: ["Stealth", "Action"] }, { title: "Metal Gear Solid 2: Sons of Liberty", genres: ["Stealth", "Action"] }, { title: "Metal Gear Solid 3: Snake Eater", genres: ["Stealth", "Action"] }, { title: "Metal Gear Solid 4: Guns of the Patriots", genres: ["Stealth", "Action"] }, { title: "Metal Gear Solid V: The Phantom Pain", genres: ["Stealth", "Action"] }, { title: "Assassin's Creed II", genres: ["Action", "Adventure"] }, { title: "Assassin's Creed Brotherhood", genres: ["Action", "Adventure"] }, { title: "Assassin's Creed IV: Black Flag", genres: ["Action", "Adventure"] }, { title: "Assassin's Creed Origins", genres: ["Action", "RPG"] }, { title: "Assassin's Creed Odyssey", genres: ["Action", "RPG"] }, { title: "Batman: Arkham Asylum", genres: ["Action", "Adventure"] }, { title: "Batman: Arkham City", genres: ["Action", "Adventure"] }, { title: "Batman: Arkham Knight", genres: ["Action", "Adventure"] }, { title: "Tomb Raider", genres: ["Action", "Adventure"] }, { title: "Rise of the Tomb Raider", genres: ["Action", "Adventure"] }, { title: "Shadow of the Tomb Raider", genres: ["Action", "Adventure"] }, { title: "Dishonored", genres: ["Stealth", "Action"] }, { title: "Dishonored 2", genres: ["Stealth", "Action"] }, { title: "Prey", genres: ["Action", "Adventure"] }, { title: "Deathloop", genres: ["Action", "Shooter"] }, { title: "Control", genres: ["Action", "Adventure"] }, { title: "Devil May Cry 3", genres: ["Action", "Hack and Slash"] }, { title: "Devil May Cry 5", genres: ["Action", "Hack and Slash"] }, { title: "Bayonetta", genres: ["Action", "Hack and Slash"] }, { title: "Bayonetta 2", genres: ["Action", "Hack and Slash"] },

    // JRPGs
    { title: "Final Fantasy VII Remake", genres: ["RPG", "Action"] }, { title: "Final Fantasy X", genres: ["RPG"] }, { title: "Final Fantasy XIV", genres: ["RPG", "MMO"] }, { title: "Final Fantasy XVI", genres: ["RPG", "Action"] }, { title: "Persona 3 Reload", genres: ["RPG"] }, { title: "Persona 4 Golden", genres: ["RPG"] }, { title: "Persona 5 Royal", genres: ["RPG"] }, { title: "Dragon Quest XI S", genres: ["RPG"] }, { title: "Chrono Trigger", genres: ["RPG"] }, { title: "Nier: Automata", genres: ["RPG", "Action"] }, { title: "Yakuza 0", genres: ["Action", "RPG"] }, { title: "Yakuza Kiwami", genres: ["Action", "RPG"] }, { title: "Yakuza: Like a Dragon", genres: ["RPG"] }, { title: "Monster Hunter: World", genres: ["Action", "RPG"] }, { title: "Monster Hunter Rise", genres: ["Action", "RPG"] },

    // Strategy & Simulation
    { title: "Civilization VI", genres: ["Strategy"] }, { title: "Age of Empires II: Definitive Edition", genres: ["Strategy"] }, { title: "StarCraft II", genres: ["Strategy"] }, { title: "XCOM 2", genres: ["Strategy"] }, { title: "Cities: Skylines", genres: ["Simulation", "Strategy"] }, { title: "The Sims 4", genres: ["Simulation"] }, { title: "Planet Coaster", genres: ["Simulation"] }, { title: "Factorio", genres: ["Simulation", "Strategy"] }, { title: "Crusader Kings III", genres: ["Strategy"] }, { title: "Stellaris", genres: ["Strategy", "Simulation"] },

    // Live Service, Multiplayer, Loot Shooters
    { title: "World of Warcraft", genres: ["MMO", "RPG"] }, { title: "League of Legends", genres: ["MOBA", "Strategy"] }, { title: "Dota 2", genres: ["MOBA", "Strategy"] }, { title: "Overwatch 2", genres: ["Shooter", "Multiplayer"] }, { title: "Valorant", genres: ["Shooter", "Multiplayer"] }, { title: "Apex Legends", genres: ["Shooter", "Multiplayer"] }, { title: "Rocket League", genres: ["Sports", "Multiplayer"] }, { title: "Rainbow Six Siege", genres: ["Shooter", "Multiplayer"] }, { title: "Destiny 2", genres: ["Shooter", "RPG"] }, { title: "Warframe", genres: ["Action", "RPG"] }, { title: "Borderlands 2", genres: ["Shooter", "RPG"] }, { title: "Borderlands 3", genres: ["Shooter", "RPG"] }, { title: "Diablo II: Resurrected", genres: ["RPG", "Action"] }, { title: "Diablo III", genres: ["RPG", "Action"] }, { title: "Diablo IV", genres: ["RPG", "Action"] }, { title: "Path of Exile", genres: ["RPG", "Action"] },

    // Legends & Indies
    { title: "Minecraft", genres: ["Survival", "Indie"] }, { title: "Terraria", genres: ["Survival", "Indie"] }, { title: "Stardew Valley", genres: ["Simulation", "Indie"] }, { title: "Hollow Knight", genres: ["Adventure", "Platformer"] }, { title: "Hades", genres: ["Action", "RPG"] }, { title: "Celeste", genres: ["Platformer", "Indie"] }, { title: "Dead Cells", genres: ["Action", "Platformer"] }, { title: "Ori and the Blind Forest", genres: ["Platformer", "Adventure"] }, { title: "Ori and the Will of the Wisps", genres: ["Platformer", "Adventure"] }, { title: "Undertale", genres: ["RPG", "Indie"] }, { title: "Cuphead", genres: ["Action", "Platformer"] }, { title: "Outer Wilds", genres: ["Adventure", "Indie"] }, { title: "Subnautica", genres: ["Survival", "Adventure"] }, { title: "Disco Elysium", genres: ["RPG", "Mystery"] }, { title: "Return of the Obra Dinn", genres: ["Puzzle", "Mystery"] }, { title: "Inside", genres: ["Puzzle", "Platformer"] }, { title: "Spelunky 2", genres: ["Platformer", "Indie"] }, { title: "Shovel Knight", genres: ["Platformer", "Indie"] }, { title: "Slay the Spire", genres: ["Strategy", "Indie"] }, { title: "Vampire Survivors", genres: ["Action", "Indie"] }
];

async function main() {
    console.log('Wiping database...');
    await prisma.notification.deleteMany({});
    await prisma.storePrice.deleteMany({});
    await prisma.wishlistItem.deleteMany({});
    await prisma.userGame.deleteMany({});
    await prisma.game.deleteMany({});
    await prisma.user.deleteMany({});

    console.log('Creating demo user...');
    const passwordHash = await bcrypt.hash('demo123', 10);
    const user = await prisma.user.create({
        data: {
            username: 'demo',
            email: 'demo@gmail.com',
            emailVerified: true,
            passwordHash,
            favoriteGenres: JSON.stringify(['RPG', 'Action', 'Open World']),
        }
    });

    console.log(`Inserting ${massiveLibrary.length} clean games with NO covers...`);
    let count = 0;
    for (const g of massiveLibrary) {
        // Prevent duplicates
        const existing = await prisma.game.findFirst({ where: { title: g.title } });
        if (existing) continue;

        await prisma.game.create({
            data: {
                title: g.title,
                genres: JSON.stringify(g.genres),
                platforms: JSON.stringify(platformsForTitle(g.title)),
                coverUrl: '', // EMPTY!
                description: `Experience the hit game: ${g.title}.`,
                source: 'seed'
            }
        });
        count++;
    }
    console.log(`\n✅ SUCCESS: Inserted ${count} games successfully!`);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
