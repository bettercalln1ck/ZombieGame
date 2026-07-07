# Zombie Defense Strategy Game - Design Specification

**Date:** July 7, 2026  
**Project:** Browser-based Real-Time Horror Zombie Defense Game  
**Version:** 1.0

---

## 1. Overview

A real-time horror strategy game where the player manages a character in a zombie-infested town, gathers resources during calm phases, and defends a home base from increasingly difficult zombie waves. The game spans 10 rounds, with each round consisting of a 2-minute resource gathering phase followed by a 2-minute defense phase.

**Core Loop:** Gather resources → Build/prepare defenses → Survive zombie wave → Repeat for 10 rounds → Victory or Game Over.

**Platform:** Browser-based (no install, login, wallet required). Playable on desktop with keyboard and mouse. Hosted on GitHub Pages or Netlify.

---

## 2. Gameplay Structure

### 2.1 Round Format
Each game consists of 10 rounds. Each round is divided into two phases:

**Gather Phase:**
- Duration: **45 seconds in Round 1** (kept short so combat/threat appears early), **90 seconds in Rounds 2-10**
- Player character freely moves around the town map
- Resources (wood, metal, food) are scattered across the screen
- Walking over a resource auto-collects it with visual feedback
- Resources respawn in different locations each round
- A few slow, harmless "wanderer" zombies drift across the map during the gather phase for atmosphere and motion (they do not attack the base during this phase; they can be shot by existing turrets). This ensures the screen has threat and movement from the very first seconds.
- Player can review current inventory and defenses placed from previous rounds
- Resources persist between rounds (unused resources carry forward)

**Defend Phase (2 minutes):**
- Zombie wave spawns from map edges and attacks the base
- Player can place new defenses or activate explosive traps during the wave
- All placed defenses (barricades, walls, turrets, spikes) auto-fire/activate
- Wave ends after 2 minutes or when all zombies are killed
- Damage to base is cumulative across rounds
- Next gather phase begins

### 2.2 Win/Loss Conditions
- **Victory:** Survive all 10 rounds without base health reaching 0
- **Game Over:** Base health hits 0 at any point (instant failure)
- Base starts at 100 HP
- Health persists across rounds (damage carries forward)

---

## 3. Map & Environment

**Layout:**
- Single fixed top-down screen (logical size ~800x600)
- Town setting with clear visual theme (pixel art or flat vector style)
- Base/home building visually centered
- Resource pickups scattered around the map
- Zombies spawn from all four edges of the screen

**Key Visual Elements:**
- Base is a clear focal point (defended location)
- Defense placement grid for snap-to-grid alignment
- Resource pickups are bright, distinct, and animated
- Zombie spawning zones at screen edges

---

## 4. Player Character

**Movement:**
- Controlled with **WASD** or **Arrow Keys**
- Smooth continuous movement, no acceleration ramps needed
- Can move freely around the map during **both** the gather and defend phases (the player keeps placing defenses, detonating bombs, and eating food while the wave is active)
- **The player character cannot be killed or damaged.** Zombies ignore and pass through the player — they target only the base and defensive structures. This keeps the game focused on strategy (protecting the base) rather than twitch dodging, which suits a 2-second reaction time. Only the base has health; when its HP reaches 0, it's Game Over.

**Resource Collection:**
- Automatic when walking over pickups
- Triggers visual feedback: sparkle effect, "+5 wood" floating text, chime sound
- No manual interaction required (passive collection)

**Defense Placement:**
- Press **1/2/3/4/5** keys or click toolbar to select defense type
- Click on map to place selected defense
- Defenses snap to grid for clarity
- Invalid placements show red outline + "can't place here" message
- Costs deducted from inventory immediately upon placement

---

## 5. Resources

Three resource types with distinct purposes:

| Resource | Source | Value per pickup | Primary Use |
|----------|--------|------------------|-------------|
| **Wood** | Scattered pickups | +5 wood | Barricades, Walls |
| **Metal** | Scattered pickups | +5 metal | Turrets, Spikes |
| **Food** | Scattered pickups | +1 food item | Heal 10 HP when eaten (press **F**) |

**Terminology:** "pickup" = one collectible item on the map. Numbers below are **pickup counts**; multiply by the per-pickup value above to get total resources granted per round.

**Resource Spawning (pickup counts per round):**
- Round 1-3: Abundant — 5 wood pickups (+25 wood), 4 metal pickups (+20 metal), 2 food pickups (+2 food)
- Round 4-7: Moderate — 4 wood pickups (+20 wood), 3 metal pickups (+15 metal), 1 food pickup (+1 food)
- Round 8-10: Scarce — 3 wood pickups (+15 wood), 2 metal pickups (+10 metal), 1 food pickup (+1 food)

**Inventory Management:**
- Resources persist between rounds
- Food is held in inventory (up to 5 units) and consumed manually: press **F** to eat one food and instantly heal 10 HP. This lets the player time heals strategically rather than wasting them at full health.
- Wood and metal stack with no cap; UI clearly shows counts
- Clear HUD display of current resources at all times

---

## 6. Defense System

Player builds defenses to protect the base from zombie attacks. All defenses are placed by clicking on the map and remain on the map for subsequent rounds unless destroyed.

### 6.1 Defense Types

**Barricade**
- Cost: 2 wood
- HP: 20
- Purpose: Cheap, blockable obstacle; zombies must destroy it to pass
- Auto-fires: No
- Best for: Creating paths/chokepoints

**Wall**
- Cost: 5 wood
- HP: 50
- Purpose: Strong barrier; blocks zombies effectively
- Auto-fires: No
- Best for: Creating fortress perimeter around base

**Spike Trap**
- Cost: 3 metal
- HP: ∞ (indestructible)
- Purpose: Covers a tile; damages any zombie that walks over it (5 damage per 0.5s while standing on it)
- **Does NOT block movement** — zombies walk freely over spikes and take damage. Spikes are purely a damage floor, not a wall. (This prevents an indestructible spike from acting as an unbreakable barrier.)
- Auto-fires: On contact
- Best for: Damage output along expected zombie paths, pairing with walls to funnel zombies over them

**Turret**
- Cost: 8 metal + 2 wood
- HP: 30
- Range: ~200px
- Purpose: Auto-fires at closest zombie (10 damage per shot, 1 shot per second)
- Auto-fires: Continuous
- Best for: Long-range zombie elimination

**Bomb/Explosive Trap**
- Cost: 5 metal + 3 wood
- HP: ∞ (indestructible)
- Activation: Player must click to detonate during defend phase
- Damage: 30 damage in a 100px radius (also damages nearby structures/zombies indiscriminately)
- Best for: Strategic burst damage during critical moments

### 6.2 Placement Rules
- Defenses snap to a grid (**32px cells**) for clarity; each cell is a large, easy click target (matches the 32px placement zones in §8.4)
- Cannot overlap with other defenses or base
- Must be placed within reasonable distance from base (to encourage strategic positioning)
- Invalid placements show visual feedback (red outline, tooltip)
- Placed defenses persist across rounds

---

## 7. Zombie System

Three distinct zombie types with unique behaviors and escalating difficulty.

### 7.1 Zombie Types

**Fast Runner**
- HP: 20
- Speed: Fast (120px/s)
- Damage to base: 5 per hit
- Behavior: Charges directly at base, low HP but numerous
- Appearance: Thin, agile silhouette
- First appears: Round 1

**Tough Brute**
- HP: 50
- Speed: Slow (60px/s)
- Damage to base: 15 per hit
- Behavior: Slowly advances, tanks damage, harder to stop
- Appearance: Large, bulky silhouette
- First appears: Round 3

**Explosive Spitter**
- HP: 35
- Speed: Medium (90px/s)
- Damage to base: 10 per spray (ranged)
- Behavior: Stays at mid-range, sprays acid; explodes on death (30 damage to nearby structures/zombies)
- Appearance: Unique shape with projectile effect
- First appears: Round 5

### 7.2 Wave Composition & Scaling

| Round | Fast Runners | Brutes | Spitters | Total | Difficulty |
|-------|--------------|--------|----------|-------|------------|
| 1     | 8            | 0      | 0        | 8     | Intro      |
| 2     | 10           | 0      | 0        | 10    | Easy       |
| 3     | 8            | 3      | 0        | 11    | Easy       |
| 4     | 8            | 4      | 0        | 12    | Medium     |
| 5     | 8            | 5      | 2        | 15    | Medium     |
| 6     | 6            | 6      | 3        | 15    | Medium     |
| 7     | 5            | 8      | 4        | 17    | Hard       |
| 8     | 4            | 10     | 5        | 19    | Hard       |
| 9     | 3            | 12     | 6        | 21    | Very Hard  |
| 10    | 2            | 15     | 8        | 25    | Extreme    |

**Spawning Behavior:**
- Zombies spawn from map edges in waves (clustered, not all at once)
- Spawning is staggered across the 2-minute defend phase to maintain tension
- First spawn appears ~5 seconds after gather phase ends (give player time to prepare)

### 7.3 Zombie AI
- Each zombie moves in a straight line toward the base (no A*/pathfinding, for simplicity and predictability)
- If a blocking defense (barricade or wall) is directly in its path, the zombie stops and attacks that structure until it's destroyed, then continues toward the base
- Spikes do not block, so zombies walk over them (taking damage) without stopping
- Attacks the base when adjacent (deals damage based on type)
- Destroyed when HP reaches 0

---

## 8. Player Feedback & Game Feel

### 8.1 Audio
- **Defense placement:** Satisfying "thunk" sound
- **Turret firing:** Crisp gunshot with 0.2s visual muzzle flash
- **Zombie hit:** Brief screech + visual knockback (5px)
- **Resource pickup:** Musical chime (ascending pitch)
- **Base damage:** Deep thud sound
- **Round transition:** Clear audio sting (2 bars)
- **Victory/Game Over:** Distinctive theme

### 8.2 Visual Feedback
- Resource pickup: Sparkle effect + "+5 Wood" floating text (fades over 0.5s)
- Defense placement: Green outline preview while selecting location
- Turret firing: Brief muzzle flash + target highlight
- Zombie damage taken: Red flash on base / damaged zombie sprites
- Health indicator: Large, color-coded bar (green → yellow → red)
- Inventory: Always visible in top-left corner with clear resource counts

### 8.3 UI Elements
- **HUD (always visible):**
  - Current resources (wood, metal, food counts)
  - Base health bar
  - Round number + phase timer (prominent display)
  - Defense selection toolbar (1-5 keys)
  
- **Gather Phase:** Resource counter, timer, helpful tips for new players
- **Defend Phase:** Timer, incoming zombie indicator, damage notifications
- **Round Transition:** Wave summary (zombies defeated, resources earned, health status)

### 8.4 Accessibility for Slow Reaction Time
- Large clickable areas (defense placement zones are 32px × 32px)
- No rapid button-mashing required
- Defenses auto-fire (no manual targeting)
- Defense range visualization before placement
- Clear visual previews of all actions
- 2-second phase transitions with audio + visual cues

---

## 9. Progression & Difficulty Tuning

### 9.1 Difficulty Scaling
- **Zombie count:** Increases predictably from 8 to 25
- **Zombie types:** Introduced gradually (runners first, brutes at round 3, spitters at round 5)
- **Resource scarcity:** Gradually decreases, forcing tougher choices in later rounds
- **Base health scaling:** Player earns small bonuses to prevent impossible scaling:
  - +5 max HP after every 3 rounds (rounds 3, 6, 9)
  - Bonus food spawns in later rounds

### 9.2 First 90 Seconds (Round 1)
- Round 1 gather phase is a short 45 seconds with visual tutorial cues and wandering zombies on screen, so there's motion and threat immediately
- The first real wave begins at ~0:45, so the player is already watching turrets kill zombies well before the 90-second mark
- Clear cause-and-effect: place turret → watch it shoot zombies
- Player feels competent and understands the full loop by the 90-second mark
- Strong visual + audio feedback on every action

### 9.3 Long-Term Progression
- Each round teaches something new:
  - Rounds 1-2: Master basic gathering and turret placement
  - Rounds 3-4: Learn brute strategies (walls, stacking defenses)
  - Rounds 5-6: Adapt to spitters (range awareness, explosive synergies)
  - Rounds 7-10: Optimize resource economy and placement under pressure

---

## 10. Visual Style & Art

**Aesthetic:** Top-down town setting, clear pixel art or flat vector style

**Key Visuals:**
- Base: Recognizable building (house/bunker), bright distinctive color
- Zombies: Distinct silhouettes (thin runners, chunky brutes, spiky spitters)
- Defenses: Clear icons/visuals (barricade = boards, wall = solid, turret = gun symbol, spikes = visible spikes)
- Resources: Bright, glowing pickups (wood = brown box, metal = silver cube, food = green/red icon)
- Terrain: Simple town setting with buildings, streets, clear walkable areas
- Effects: Sparkles on pickup, muzzle flash on turret, blood/screech on zombie hit

**Color Palette:**
- Base: Bright (yellow/gold or blue)
- Zombies: Sickly green or dark gray
- Defenses: Varied by type (wood = brown, metal = gray, spikes = red)
- UI: High contrast for readability (white text on dark background or vice versa)

---

## 11. Technical Architecture

### 11.1 Technology Stack
- **Game Engine:** Phaser 3 (lightweight, browser-native, no dependencies on external servers)
- **Language:** TypeScript or JavaScript (client-side only)
- **Graphics:** HTML5 Canvas rendering
- **Audio:** Web Audio API or simple sound library (e.g., Howler.js)
- **Hosting:** GitHub Pages or Netlify (free, instant deployment, no server)

### 11.2 Project Structure
```
/
├── src/
│   ├── scenes/
│   │   ├── GameScene.ts          # Main game loop (gather/defend phases)
│   │   └── UIScene.ts            # HUD overlay
│   ├── objects/
│   │   ├── Player.ts             # Player character
│   │   ├── Zombie.ts             # Zombie base class
│   │   ├── Defense.ts            # Defense base class
│   │   ├── Resource.ts           # Resource pickup
│   │   └── Base.ts               # Home base
│   ├── managers/
│   │   ├── WaveManager.ts        # Zombie spawning, wave logic
│   │   ├── ResourceManager.ts    # Resource tracking
│   │   └── PhaseManager.ts       # Phase timing and transitions
│   ├── utils/
│   │   ├── constants.ts          # Game balance values
│   │   └── helpers.ts            # Utility functions
│   └── main.ts                   # Entry point
├── public/
│   ├── assets/
│   │   ├── sprites/              # PNG/SVG sprites
│   │   ├── audio/                # MP3/WAV sound effects
│   │   └── fonts/                # Web fonts
│   └── index.html
├── package.json
├── tsconfig.json
└── .github/workflows/deploy.yml  # Auto-deploy to GitHub Pages
```

### 11.3 Build & Deployment
- **Local build:** `npm run build`
- **Local dev:** `npm run dev` (Vite dev server)
- **Deploy:** Push to GitHub → GitHub Actions auto-builds and deploys to Pages
- **Game runs at:** 60 FPS, responsive (1280×720 target, scales to window)
- **No external dependencies:** Pure client-side, no backend server needed

### 11.4 Browser Compatibility
- Target: Chrome, Firefox, Safari, Edge (latest versions)
- Mobile: Not a priority, but game is playable on tablets if desired
- Keyboard + Mouse input only (no touch drag required)

---

## 12. Game Balance (Tuning Values)

These values are starting points; will be adjusted during playtesting.

**Zombie Damage:**
- Fast Runner: 5 damage/hit
- Brute: 15 damage/hit
- Spitter: 10 damage/spray

**Defense Balance:**
- Barricade: 2 wood, 20 HP
- Wall: 5 wood, 50 HP
- Turret: 8 metal + 2 wood, 30 HP, 10 damage/shot, 1 shot/sec
- Spike: 3 metal, ∞ HP, 5 damage/trigger
- Bomb: 5 metal + 3 wood, ∞ HP, 30 damage/100px radius

**Resource Spawning:**
- Early rounds: 5 wood, 3 metal, 2 food
- Late rounds: 3 wood, 1 metal, 1 food

**Health Bonuses:**
- Base HP: 100
- +5 max HP after rounds 3, 6, 9

---

## 13. Out of Scope

The following are explicitly NOT included in this initial version:

- Multiple bases or locations to defend
- Player upgrades or leveling system
- Leaderboards or scoring
- Multiplayer or cooperative play
- Touch/drag controls
- Mobile optimization (keyboard+mouse only)
- Procedural map generation
- NPCs or dialogue
- Story/narrative elements
- Pause menu or settings screen
- Save/load functionality
- Accessibility features beyond large click targets (subtitles, colorblind mode can be added later)

These are potential post-launch features but not required for launch.

---

## 14. Success Criteria

**Must-Have (Launch):**
- ✓ 10-round game loop playable to completion
- ✓ 3 zombie types with distinct behaviors
- ✓ 5 defense types with meaningful tactical choices
- ✓ Impressive first 90 seconds with clear feedback
- ✓ Playable with 2-second reaction time
- ✓ Hosted on live URL (GitHub Pages or Netlify)
- ✓ Keyboard + mouse input only, no drag controls
- ✓ All visuals + audio feedback complete

**Polish (Launch):**
- ✓ Victory and Game Over screens
- ✓ Clean, readable UI
- ✓ Satisfying sound effects and animations
- ✓ Smooth 60 FPS gameplay

**Out of Scope (Post-Launch):**
- Leaderboards
- Tutorial/story
- Difficulty settings
- Mobile support

---

## 15. Estimated Scope

**Complexity:** Medium  
**Development Time:** 2-3 weeks (solo developer)  
**Technical Debt:** Minimal (straightforward architecture, no complex dependencies)

---

## Appendix A: Example Round 1 Walkthrough

1. **Round 1 Gather Phase (0:00-0:45):**
   - Player spawns on map; a couple of slow wanderer zombies drift across for atmosphere
   - Tutorial text: "Use WASD to move, collect wood/metal/food"
   - 5 wood pickups (+25 wood), 4 metal pickups (+20 metal), 2 food pickups spawn on map
   - Player gathers resources (takes ~30 seconds of casual movement)
   - Tutorial text: "Press 4 to select Turret, then click to place it"
   - Player places 1-2 turrets (each costs 8 metal + 2 wood; 2 turrets = 16 metal + 4 wood, affordable with 20 metal / 25 wood on hand)
   - Screen fades, phase transitions

2. **Round 1 Defend Phase (0:45-2:45):**
   - Music shifts, zombie wave indicator appears: "Wave 1/10"
   - 8 fast runners spawn from edges over ~30 seconds
   - Turrets auto-fire as zombies approach
   - First zombie reaches base and deals 5 damage (health: 100 → 95)
   - Player watches turrets handle most zombies
   - By the 2-minute defend timer, most zombies dead, a few get through
   - Wave ends, transition screen shows: "Round 1 Complete! Health: 85/100. Ready for Round 2?"
   - Player presses key to continue

3. **First Impression Achieved (by ~1:30):**
   - Player understands: gather → place defenses → survive → repeat
   - Clear cause-and-effect with turrets
   - Felt competent, not overwhelmed
   - Ready for increasing complexity in Rounds 2-10

---

**Design Document End**
