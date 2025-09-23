let firstRunExperience = true;
let quickStartUsed = false;
let state = { gameState: 'ready' };
let config = null;
let basePlayerConfig = null;
let baseDashConfig = null;
let baseProjectileSettings = null;
let activeDifficultyPreset = 'medium';
let spawnTimers = { obstacle: 0, collectible: 0, powerUp: 0 };
let shellScale = 1;
let metaProgressManager = null;
let latestMetaSnapshot = null;
let swapPilotButton = null;
let preflightSwapPilotButton = null;
let swapWeaponButton = null;
let preflightSwapWeaponButton = null;
let openWeaponSelectButton = null;

const weaponPatternStates = new Map();

const weaponLoadouts = {};

const serviceWorkerSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof navigator.serviceWorker?.register === 'function';
let serviceWorkerRegistrationPromise = null;

function markOfflineCapabilityReady() {
    if (typeof document !== 'undefined' && document.body) {
        document.body.dataset.offlineReady = 'true';
    }
}

function registerGameServiceWorker() {
    if (!serviceWorkerSupported) {
        return null;
    }
    if (serviceWorkerRegistrationPromise) {
        return serviceWorkerRegistrationPromise;
    }
    const scriptUrl = new URL('../service-worker.js', import.meta.url);
    serviceWorkerRegistrationPromise = navigator.serviceWorker
        .register(scriptUrl.href, { updateViaCache: 'none' })
        .then((registration) => {
            console.info('[service-worker] Registered', registration.scope);
            navigator.serviceWorker.ready
                .then(() => {
                    markOfflineCapabilityReady();
                })
                .catch(() => {
                    // No-op: readiness is best-effort.
                });
            return registration;
        })
        .catch((error) => {
            console.warn('[service-worker] Registration failed', error);
            return null;
        });
    return serviceWorkerRegistrationPromise;
}

if (serviceWorkerSupported) {
    if (navigator.serviceWorker.controller) {
        markOfflineCapabilityReady();
    }
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        markOfflineCapabilityReady();
    });
    window.addEventListener('load', () => {
        registerGameServiceWorker();
    });
}

const pilotRoster = [
    {
        id: 'nova',
        name: 'Nova',
        role: 'Squad Vanguard',
        image: 'assets/player.png',
        summary:
            'Balanced thrusters and pinpoint instincts keep Nova stable during any sortie. A dependable captain for first-time flyers.',
        highlights: [
            'Responsive handling with forgiving dash timing.',
            'Launches with the Rainbow stream for clear trail visibility.',
            'Pairs naturally with versatile cannon loadouts.'
        ]
    },
    {
        id: 'aurora',
        name: 'Aurora',
        role: 'Skystreak Ace',
        image: 'assets/player2.png',
        summary:
            'Aurora’s tuned reactors favour evasive manoeuvres and quick recoveries, perfect for weaving through dense asteroid fields.',
        highlights: [
            'Improved dash recharge for aggressive repositioning.',
            'Ships with a cool-tone Midnight hull finish.',
            'Excels when paired with wide coverage weapon arrays.'
        ]
    },
    {
        id: 'ember',
        name: 'Ember',
        role: 'Siegebreak Specialist',
        image: 'assets/player3.png',
        summary:
            'Ember thrives when the pressure spikes—charging forward with heavier ordinance to shatter shielded foes and bosses.',
        highlights: [
            'Higher impact tolerance before combo decay.',
            'Ships with a Sunrise hull tuned for power bursts.',
            'Loves precision weapon kits that trade speed for force.'
        ]
    }
];

const pilotIndex = new Map(pilotRoster.map((pilot) => [pilot.id, pilot]));

const SKIN_LABELS = {
    default: 'Aurora Standard',
    midnight: 'Midnight Mirage',
    sunrise: 'Solar Flare'
};

const TRAIL_LABELS = {
    rainbow: 'Spectrum Stream',
    aurora: 'Aurora Wake',
    ember: 'Ember Wake',
    ion: 'Ion Surge',
    solstice: 'Solstice Bloom',
    quantum: 'Quantum Drift'
};

Object.assign(weaponLoadouts, {
    pulse: {
        id: 'pulse',
        name: 'Pulse Array',
        icon: 'assets/weapon-pulse.svg',
        rarity: 'common',
        summary: 'Reliable dual-phase cannons that excel at steady clears.',
        description:
            'Baseline cannons engineered for all pilots. Fires a focused plasma bolt with every trigger pull and keeps combos stable.',
        highlights: [
            'Balanced cadence with no cooldown penalties.',
            'Bolts travel straight with a luminous trail for easy tracking.',
            'Pairs with any pilot that favours consistent damage.'
        ],
        cooldownMultiplier: 1,
        speedMultiplier: 1,
        createPatternState: () => ({}),
        resetPatternState() {},
        pattern(createProjectile) {
            createProjectile(0, 'standard');
        }
    },
    scatter: {
        id: 'scatter',
        name: 'Scatter Volley',
        icon: 'assets/weapon-scatter.svg',
        rarity: 'rare',
        summary: 'Triple-shot volley that carpets the lane with plasma.',
        description:
            'A close-quarters spread built for clearing swarms. Fires three bolts in a cone, saturating obstacles that drift too close.',
        highlights: [
            'Widens coverage to keep asteroid clusters in check.',
            'Slightly slower recharge to compensate for the volley.',
            'Best with agile pilots who stay on top of positioning.'
        ],
        cooldownMultiplier: 1.12,
        speedMultiplier: 0.98,
        createPatternState: () => ({}),
        resetPatternState() {},
        pattern(createProjectile) {
            const spread = 0.22;
            createProjectile(-spread, 'scatter', { audioType: 'scatter' });
            createProjectile(0, 'scatter', { audioType: 'scatter' });
            createProjectile(spread, 'scatter', { audioType: 'scatter' });
        }
    },
    lance: {
        id: 'lance',
        name: 'Photon Lance',
        icon: 'assets/weapon-lance.svg',
        rarity: 'epic',
        summary: 'Charged spear shot that pierces heavy armour and bosses.',
        description:
            'Focuses the ship’s reactors into a piercing lance. The beam slows the firing rhythm but rips through anything aligned with the nose.',
        highlights: [
            'High impact projectile that pierces multiple targets.',
            'Reduced fire rate—make every shot count.',
            'Pairs with tanky pilots who can line up long shots.'
        ],
        cooldownMultiplier: 1.32,
        speedMultiplier: 1.18,
        createPatternState: () => ({}),
        resetPatternState() {},
        pattern(createProjectile) {
            createProjectile(0, 'lance', { applyLoadoutSpeed: false, audioType: 'lance' });
        }
    }
});

if (typeof window !== 'undefined') {
    window.weaponLoadouts = weaponLoadouts;
}

function getGlobalScope() {
    if (typeof globalThis !== 'undefined') {
        return globalThis;
    }
    if (typeof window !== 'undefined') {
        return window;
    }
    if (typeof self !== 'undefined') {
        return self;
    }
    return null;
}

function getWeaponLoadoutCollection() {
    const scope = getGlobalScope();
    if (scope && scope.weaponLoadouts && typeof scope.weaponLoadouts === 'object') {
        return scope.weaponLoadouts;
    }
    if (
        typeof weaponLoadouts !== 'undefined' &&
        weaponLoadouts &&
        typeof weaponLoadouts === 'object'
    ) {
        return weaponLoadouts;
    }
    return null;
}

function synchronizeActiveWeaponLoadout(loadout) {
    const scope = getGlobalScope();
    if (!scope) {
        return loadout && typeof loadout === 'object' ? loadout : null;
    }
    if (loadout && typeof loadout === 'object') {
        scope.activeWeaponLoadout = loadout;
        return loadout;
    }
    scope.activeWeaponLoadout = null;
    return null;
}

function getActiveWeaponId(candidate) {
    if (typeof candidate === 'string' && candidate) {
        return candidate;
    }
    if (typeof activeWeaponId !== 'undefined' && typeof activeWeaponId === 'string' && activeWeaponId) {
        return activeWeaponId;
    }
    const equippedWeapon = state?.cosmetics?.equipped?.weapon;
    if (typeof equippedWeapon === 'string' && equippedWeapon) {
        return equippedWeapon;
    }
    return 'pulse';
}

function getActiveWeaponLoadout() {
    const collection = getWeaponLoadoutCollection();
    if (!collection) {
        return synchronizeActiveWeaponLoadout(null);
    }

    const activeId = getActiveWeaponId();
    if (activeId && typeof collection[activeId] === 'object') {
        return synchronizeActiveWeaponLoadout(collection[activeId]);
    }

    if (typeof collection.pulse === 'object') {
        return synchronizeActiveWeaponLoadout(collection.pulse);
    }

    const fallback = Object.values(collection).find((entry) => entry && typeof entry === 'object') ?? null;
    return synchronizeActiveWeaponLoadout(fallback);
}

function getWeaponPatternState(weaponId = null, { createIfMissing = true } = {}) {
    const resolvedId = getActiveWeaponId(weaponId);
    if (!resolvedId) {
        return null;
    }
    if (!weaponPatternStates.has(resolvedId)) {
        if (!createIfMissing) {
            return null;
        }
        weaponPatternStates.set(resolvedId, {});
    }
    const state = weaponPatternStates.get(resolvedId);
    return state && typeof state === 'object' ? state : null;
}

function resetWeaponPatternState(weaponId = null) {
    if (weaponId === null || weaponId === undefined) {
        weaponPatternStates.clear();
        return;
    }
    const resolvedId = getActiveWeaponId(weaponId);
    if (!resolvedId) {
        weaponPatternStates.clear();
        return;
    }
    weaponPatternStates.delete(resolvedId);
}

function getChallengeManager() {
    const scope =
        typeof globalThis !== 'undefined'
            ? globalThis
            : typeof window !== 'undefined'
              ? window
              : null;
    if (!scope) {
        return null;
    }
    const manager = scope.challengeManager;
    if (manager && typeof manager.recordEvent === 'function') {
        return manager;
    }
    return null;
}

const DOUBLE_TEAM_POWER = 'doubleTeam';
const HYPER_BEAM_POWER = 'hyperBeam';
const SHIELD_POWER = 'radiantShield';
const PUMP_POWER = 'pumpDrive';
const TIME_DILATION_POWER = 'timeDilation';
const SCORE_SURGE_POWER = 'scoreSurge';
const MAGNET_POWER = 'starlightMagnet';
const FLAME_WHIP_POWER = 'flameWhip';
const gamepadCursorBounds = { left: 0, top: 0, right: 0, bottom: 0 };
const gamepadCursorState = {
    x: 0,
    y: 0,
    axisX: 0,
    axisY: 0,
    active: false,
    lastUpdate: null,
    lastInputTime: 0,
    pointerDownTarget: null,
    buttonHeld: false
};

function resetGamepadCursorState() {
    gamepadCursorState.x = 0;
    gamepadCursorState.y = 0;
    gamepadCursorState.axisX = 0;
    gamepadCursorState.axisY = 0;
    gamepadCursorState.active = false;
    gamepadCursorState.lastUpdate = null;
    gamepadCursorState.lastInputTime = 0;
    gamepadCursorState.pointerDownTarget = null;
    gamepadCursorState.buttonHeld = false;
}

const fontLoadCache = new Map();

function loadCustomFont(fontFamily) {
    if (typeof fontFamily !== 'string') {
        return Promise.resolve();
    }

    const normalizedFont = fontFamily.trim();
    if (!normalizedFont) {
        return Promise.resolve();
    }

    if (fontLoadCache.has(normalizedFont)) {
        return fontLoadCache.get(normalizedFont);
    }

    const supportsFontLoadingApi =
        typeof document !== 'undefined' && document.fonts && typeof document.fonts.load === 'function';

    if (supportsFontLoadingApi && document.fonts.check(`1rem "${normalizedFont}"`)) {
        const alreadyLoaded = Promise.resolve();
        fontLoadCache.set(normalizedFont, alreadyLoaded);
        return alreadyLoaded;
    }

    const fontPromises = [];

    if (supportsFontLoadingApi) {
        const fontQueries = [`1rem "${normalizedFont}"`, `700 1rem "${normalizedFont}"`];
        for (const query of fontQueries) {
            fontPromises.push(
                document.fonts
                    .load(query)
                    .catch(() => null)
            );
        }
    }

    const fontAssetSources = {
        'Flight Time': 'assets/FlightTime.ttf'
    };

    const assetSource = fontAssetSources[normalizedFont];
    if (assetSource && typeof window !== 'undefined' && typeof window.FontFace === 'function') {
        const fontFace = new FontFace(normalizedFont, `url(${assetSource})`);
        fontPromises.push(
            fontFace
                .load()
                .then((loadedFace) => {
                    document.fonts?.add?.(loadedFace);
                })
                .catch(() => null)
        );
    }

    if (fontPromises.length === 0) {
        const resolved = Promise.resolve();
        fontLoadCache.set(normalizedFont, resolved);
        return resolved;
    }

    const loadPromise = Promise.all(fontPromises).then(() => undefined);
    fontLoadCache.set(normalizedFont, loadPromise);
    return loadPromise;
}

document.addEventListener('DOMContentLoaded', () => {
    const GAMEPAD_CURSOR_HALF_SIZE = 11;
    // Reset onboarding flags whenever the game reinitializes. This ensures that
    // subsequent reloads (such as during development hot-reloads) don't carry
    // over stale values from previous executions.
    firstRunExperience = true;
    quickStartUsed = false;
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas?.getContext ? canvas.getContext('2d') : null;
    const controllerCursorEl = document.getElementById('controllerCursor');
    resetGamepadCursorState();

    const supportsResizeObserver =
        typeof window !== 'undefined' && typeof window.ResizeObserver === 'function';
    const reducedMotionQuery =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)')
            : null;
    const systemPrefersReducedEffects = () => Boolean(reducedMotionQuery?.matches);

    function enableHighQualitySmoothing(context) {
        if (!context) {
            return;
        }

        if (typeof context.imageSmoothingEnabled !== 'undefined') {
            context.imageSmoothingEnabled = true;
        }

        if (typeof context.imageSmoothingQuality !== 'undefined') {
            context.imageSmoothingQuality = 'high';
        }
    }

    enableHighQualitySmoothing(ctx);

    const mascotAnnouncer = createMascotAnnouncer();
    mascotAnnouncer.reset({ immediate: true });

    function createMascotAnnouncer() {
        const container = document.getElementById('mascotCallout');
        const imageEl = container?.querySelector('[data-mascot-image]');
        const textEl = container?.querySelector('[data-mascot-text]');
        if (!container || !imageEl || !textEl) {
            return {
                cheerForCombo() {},
                celebrateVictory() {},
                lamentSetback() {},
                notifyPerformanceMode() {},
                reset() {},
                hide() {}
            };
        }

        const assetPaths = {
            happy: 'assets/character-happy.png',
            cheering: 'assets/character-cheering.png',
            sad: 'assets/character-sad.png'
        };
        const assetAlt = {
            happy: 'Mission control cat smiling',
            cheering: 'Mission control cat cheering',
            sad: 'Mission control cat concerned'
        };
        const messagePools = {
            combo: [
                'Thrusters synced! {{streak}} alive!',
                'Keep threading the nebula—{{streak}} streak!',
                'Piloting instincts on point at {{streak}}!',
                'Mission control is buzzing—{{streak}} combo!',
                'Flawless maneuvers! {{streak}} locked in!',
                'Tail lasers sparkling at {{streak}}!'
            ],
            highCombo: [
                '{{streak}}? The convoy is in awe!',
                'Elite flying detected—{{streak}} streak!',
                'Sensors melting from a {{streak}} combo!'
            ],
            victory: [
                'Flight log secured — {{score}} pts in {{time}}!{{streakLine}}',
                'Mission accomplished! {{score}} pts banked!{{streakCheer}}',
                'Galactic cheers! {{score}} pts logged{{streakSuffix}}!'
            ],
            setback: [
                'We\'ll get them next wave—regroup!',
                'Shake it off! Recalibrating for the next run!',
                'No worries pilot, lining up another chance!',
                'Keep your paws steady—we\'re still in this!'
            ]
        };
        const performanceMessages = {
            enabled: [
                'Performance boost engaged—thrusters stay smooth!',
                'Mission control trimmed the effects for max response!'
            ],
            disabled: [
                'All clear—bringing full visuals back online!',
                'Systems stable, restoring every sparkle!'
            ]
        };
        const comboMilestones = [3, 5, 8, 12, 16, 20, 30];
        const MIN_SETBACK_INTERVAL = 9000;
        const GLOBAL_APPEARANCE_COOLDOWN = 10000;
        const COMBO_APPEARANCE_WEIGHT = 0.35;
        const SETBACK_APPEARANCE_WEIGHT = 0.45;
        const DEFAULT_HIDE_DELAY = 5200;
        let hideTimeout = null;
        let ariaHideTimeout = null;
        let lastComboCelebrated = 0;
        let lastSetbackAt = 0;
        let lastShownAt = 0;
        let lastPerformanceMessageAt = 0;
        const PERFORMANCE_MESSAGE_COOLDOWN = 6000;

        const toLocaleOrString = (value) => {
            if (typeof value === 'number' && Number.isFinite(value)) {
                return value.toLocaleString();
            }
            const numeric = Number(value);
            if (Number.isFinite(numeric)) {
                return numeric.toLocaleString();
            }
            return value != null ? String(value) : '0';
        };

        const randomFrom = (pool) => {
            if (!Array.isArray(pool) || pool.length === 0) {
                return '';
            }
            const index = Math.floor(Math.random() * pool.length);
            return pool[index];
        };

        const formatTemplate = (template, context = {}) => {
            if (typeof template !== 'string' || !template.length) {
                return '';
            }
            return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? '');
        };

        const nowTime = () => {
            if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
                return performance.now();
            }
            return Date.now();
        };

        const canTrigger = (weight = 1, { force = false } = {}) => {
            if (force) {
                return true;
            }
            if (weight <= 0) {
                return false;
            }
            const now = nowTime();
            if (now - lastShownAt < GLOBAL_APPEARANCE_COOLDOWN) {
                return false;
            }
            return Math.random() < Math.min(1, weight);
        };

        const hide = ({ immediate = false } = {}) => {
            window.clearTimeout(hideTimeout);
            hideTimeout = null;
            container.classList.remove('is-visible');
            window.clearTimeout(ariaHideTimeout);
            if (immediate) {
                ariaHideTimeout = null;
                container.setAttribute('aria-hidden', 'true');
                return;
            }
            ariaHideTimeout = window.setTimeout(() => {
                container.setAttribute('aria-hidden', 'true');
            }, 360);
        };

        const setMood = (mood) => {
            const asset = assetPaths[mood] ?? assetPaths.happy;
            if (imageEl.getAttribute('src') !== asset) {
                imageEl.setAttribute('src', asset);
            }
            const alt = assetAlt[mood] ?? assetAlt.happy;
            imageEl.setAttribute('alt', alt);
            imageEl.hidden = false;
        };

        const show = (mood, message) => {
            if (!message) {
                return;
            }
            window.clearTimeout(hideTimeout);
            window.clearTimeout(ariaHideTimeout);
            setMood(mood);
            textEl.textContent = message.trim();
            container.classList.add('is-visible');
            container.setAttribute('aria-hidden', 'false');
            lastShownAt = nowTime();
            hideTimeout = window.setTimeout(() => {
                hide();
            }, DEFAULT_HIDE_DELAY);
        };

        const shouldCheerForStreak = (streak) => {
            if (streak <= lastComboCelebrated || streak < 3) {
                return false;
            }
            const reachedMilestone = comboMilestones.includes(streak) || streak >= lastComboCelebrated + 4;
            if (!reachedMilestone) {
                return false;
            }
            lastComboCelebrated = streak;
            return true;
        };

        const cheerForCombo = (streak) => {
            if (!shouldCheerForStreak(streak)) {
                return;
            }
            if (!canTrigger(COMBO_APPEARANCE_WEIGHT)) {
                return;
            }
            const pool = streak >= 10 ? messagePools.highCombo : messagePools.combo;
            const message = formatTemplate(randomFrom(pool), { streak: `x${streak}` });
            show(streak >= 8 ? 'cheering' : 'happy', message);
        };

        const celebrateVictory = (summary) => {
            if (!summary) {
                return;
            }
            const scoreText = toLocaleOrString(summary.score ?? state.score ?? 0);
            const timeValue = summary.timeMs ?? state.elapsedTime ?? 0;
            const timeText = formatTime(timeValue);
            const bestStreak = Math.max(0, summary.bestStreak ?? 0);
            const streakText = bestStreak > 1 ? `x${bestStreak}` : '';
            lastComboCelebrated = Math.max(lastComboCelebrated, bestStreak);
            const message = formatTemplate(randomFrom(messagePools.victory), {
                score: scoreText,
                time: timeText,
                streakLine: streakText ? ` Tail peaked at ${streakText}.` : '',
                streakCheer: streakText ? ` Tail ${streakText}!` : '',
                streakSuffix: streakText ? ` with a ${streakText} streak` : ''
            });
            show('cheering', message);
        };

        const lamentSetback = ({ force = false } = {}) => {
            const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
                ? performance.now()
                : Date.now();
            if (!force && now - lastSetbackAt < MIN_SETBACK_INTERVAL) {
                return;
            }
            lastSetbackAt = now;
            if (!canTrigger(SETBACK_APPEARANCE_WEIGHT, { force })) {
                return;
            }
            const message = randomFrom(messagePools.setback);
            show('sad', message);
        };

        const announcePerformanceMode = (active) => {
            const now = nowTime();
            if (now - lastPerformanceMessageAt < PERFORMANCE_MESSAGE_COOLDOWN) {
                return;
            }
            lastPerformanceMessageAt = now;
            const pool = active ? performanceMessages.enabled : performanceMessages.disabled;
            const message = randomFrom(pool);
            if (!message) {
                return;
            }
            show(active ? 'happy' : 'cheering', message);
        };

        const reset = ({ immediate = false } = {}) => {
            lastComboCelebrated = 0;
            lastSetbackAt = 0;
            lastShownAt = 0;
            lastPerformanceMessageAt = 0;
            hide({ immediate });
        };

        return {
            cheerForCombo,
            celebrateVictory,
            lamentSetback,
            notifyPerformanceMode: announcePerformanceMode,
            reset,
            hide
        };
    }

    const collectibleGradientCache = new Map();
    const powerUpGradientCache = new Map();
    const supportsPath2D = typeof Path2D === 'function';
    const projectilePathCache = supportsPath2D ? new Map() : null;
    const particleColorStyleCache = typeof WeakMap === 'function' ? new WeakMap() : null;
    const STAR_FILL_COLOR = '#ffffff';
    const INV_PARTICLE_LIFE = 1 / 500;
    const powerUpTypes = [
        'powerBomb',
        'bulletSpread',
        FLAME_WHIP_POWER,
        'missiles',
        DOUBLE_TEAM_POWER,
        HYPER_BEAM_POWER,
        SHIELD_POWER,
        PUMP_POWER,
        TIME_DILATION_POWER,
        SCORE_SURGE_POWER,
        MAGNET_POWER
    ];
    const powerUpLabels = {
        powerBomb: 'Nova Pulse',
        bulletSpread: 'Starlight Spread',
        missiles: 'Comet Missiles',
        [DOUBLE_TEAM_POWER]: 'Double Team',
        [FLAME_WHIP_POWER]: 'Ember Whip',
        [HYPER_BEAM_POWER]: 'Hyper Beam',
        [SHIELD_POWER]: 'Radiant Shield',
        [PUMP_POWER]: 'Pump Drive',
        [TIME_DILATION_POWER]: 'Chrono Field',
        [SCORE_SURGE_POWER]: 'Score Surge',
        [MAGNET_POWER]: 'Flux Magnet'
    };
    const powerUpColors = {
        powerBomb: { r: 255, g: 168, b: 112 },
        bulletSpread: { r: 255, g: 128, b: 255 },
        missiles: { r: 255, g: 182, b: 92 },
        [DOUBLE_TEAM_POWER]: { r: 188, g: 224, b: 255 },
        [FLAME_WHIP_POWER]: { r: 214, g: 64, b: 56 },
        [HYPER_BEAM_POWER]: { r: 147, g: 197, b: 253 },
        [SHIELD_POWER]: { r: 148, g: 210, b: 255 },
        [PUMP_POWER]: { r: 255, g: 99, b: 247 },
        [TIME_DILATION_POWER]: { r: 120, g: 233, b: 255 },
        [SCORE_SURGE_POWER]: { r: 255, g: 228, b: 150 },
        [MAGNET_POWER]: { r: 156, g: 220, b: 255 }
    };

    const POWER_UP_RULES = {
        powerBomb: { weight: 0.65, cooldownMs: 14000 },
        bulletSpread: { weight: 0.85, cooldownMs: 11000 },
        missiles: { weight: 0.9, cooldownMs: 10500 },
        [DOUBLE_TEAM_POWER]: { weight: 0.35, cooldownMs: 20000, blockWhileActive: true, repeatPenalty: 0.25 },
        [FLAME_WHIP_POWER]: { weight: 0.7, cooldownMs: 12500 },
        [HYPER_BEAM_POWER]: { weight: 0.55, cooldownMs: 18500, blockWhileActive: true },
        [SHIELD_POWER]: { weight: 0.78, cooldownMs: 15000 },
        [PUMP_POWER]: { weight: 0.68, cooldownMs: 15000 },
        [TIME_DILATION_POWER]: { weight: 0.58, cooldownMs: 17000, blockWhileActive: true },
        [SCORE_SURGE_POWER]: { weight: 0.72, cooldownMs: 15000 },
        [MAGNET_POWER]: { weight: 0.82, cooldownMs: 12000 }
    };

    function createPowerUpSpawnDirector() {
        const HISTORY_LIMIT = 3;
        const history = [];
        const cooldowns = new Map();
        const defaultRule = {
            weight: 0.75,
            cooldownMs: 11000,
            blockWhileActive: false,
            repeatPenalty: 0.45
        };

        const resolveRule = (type) => ({ ...defaultRule, ...(POWER_UP_RULES[type] ?? {}) });

        const countActiveBoosts = () => {
            if (!state?.powerUpTimers) {
                return 0;
            }
            let active = 0;
            for (const type of powerUpTypes) {
                if (state.powerUpTimers[type] > 0) {
                    active += 1;
                }
            }
            return active;
        };

        const isOnCooldown = (type, now) => {
            const readyAt = cooldowns.get(type) ?? 0;
            return now < readyAt;
        };

        const registerHistory = (type) => {
            history.push(type);
            if (history.length > HISTORY_LIMIT) {
                history.shift();
            }
        };

        const getHistoryWeight = (type, baseWeight) => {
            if (!history.length) {
                return baseWeight;
            }
            let occurrences = 0;
            for (let i = history.length - 1; i >= 0; i--) {
                if (history[i] === type) {
                    occurrences += 1;
                }
            }
            if (occurrences === 0) {
                return baseWeight;
            }
            const rule = resolveRule(type);
            const penalty = Number.isFinite(rule.repeatPenalty) ? rule.repeatPenalty : defaultRule.repeatPenalty;
            const adjusted = baseWeight * Math.max(0, Math.pow(Math.max(0, penalty), occurrences));
            return adjusted;
        };

        const chooseType = (now = state?.elapsedTime ?? 0) => {
            const candidates = [];
            let totalWeight = 0;
            for (const type of powerUpTypes) {
                const rule = resolveRule(type);
                if (rule.blockWhileActive && state?.powerUpTimers?.[type] > 0) {
                    continue;
                }
                if (isOnCooldown(type, now)) {
                    continue;
                }
                const baseWeight = Number.isFinite(rule.weight) ? Math.max(0, rule.weight) : defaultRule.weight;
                if (baseWeight <= 0) {
                    continue;
                }
                const weight = getHistoryWeight(type, baseWeight);
                if (weight <= 0) {
                    continue;
                }
                candidates.push({ type, weight });
                totalWeight += weight;
            }

            if (!candidates.length) {
                cooldowns.clear();
                return powerUpTypes[Math.floor(Math.random() * powerUpTypes.length)];
            }

            let roll = Math.random() * totalWeight;
            for (const candidate of candidates) {
                roll -= candidate.weight;
                if (roll <= 0) {
                    return candidate.type;
                }
            }
            return candidates[candidates.length - 1].type;
        };

        const planNextInterval = (baseInterval) => {
            const safeBase = Number.isFinite(baseInterval) ? Math.max(4000, baseInterval) : 10000;
            const intensity = Number.isFinite(getSpawnIntensity('powerUp'))
                ? clamp(getSpawnIntensity('powerUp'), 0.6, 1.4)
                : 1;
            const speed = Number.isFinite(state?.gameSpeed) ? clamp(state.gameSpeed, 0, 600) : 0;
            const activeBoosts = countActiveBoosts();
            const intensityFactor = intensity >= 1
                ? lerp(1, 0.82, clamp(intensity - 1, 0, 0.8))
                : lerp(1, 1.18, clamp(1 - intensity, 0, 0.8));
            const speedFactor = lerp(1, 0.88, clamp(speed / 600, 0, 1));
            const activeFactor = 1 + activeBoosts * 0.12;
            const jitter = randomBetween(0.9, 1.25);
            const rawInterval = safeBase * intensityFactor * speedFactor * activeFactor * jitter;
            const minInterval = Math.max(6500, safeBase * 0.9);
            const maxInterval = Math.max(minInterval + 2500, safeBase * 1.4);
            return clamp(rawInterval, minInterval, maxInterval);
        };

        const recordSpawn = (type, now) => {
            const rule = resolveRule(type);
            registerHistory(type);
            if (Number.isFinite(rule.cooldownMs) && rule.cooldownMs > 0) {
                cooldowns.set(type, now + rule.cooldownMs);
            }
        };

        const reset = () => {
            history.length = 0;
            cooldowns.clear();
        };

        return {
            chooseType,
            planNextInterval,
            recordSpawn,
            reset
        };
    }

    const powerUpSpawnDirector = createPowerUpSpawnDirector();
    let nextPowerUpSpawnInterval = 10000;

    function reschedulePowerUps({ resetHistory = false, resetTimer = false, initialDelay = false } = {}) {
        if (resetHistory) {
            powerUpSpawnDirector.reset();
        }
        const baseInterval = Number.isFinite(config?.powerUpSpawnInterval)
            ? Math.max(5000, config.powerUpSpawnInterval)
            : 10000;
        const plannedInterval = powerUpSpawnDirector.planNextInterval(baseInterval);
        if (Number.isFinite(plannedInterval) && plannedInterval > 0) {
            nextPowerUpSpawnInterval = plannedInterval;
        } else {
            nextPowerUpSpawnInterval = baseInterval;
        }
        if (resetTimer) {
            spawnTimers.powerUp = initialDelay ? randomBetween(0, baseInterval * 0.4) : 0;
        }
    }
    const doubleTeamState = {
        clone: null,
        trail: [],
        wobble: 0,
        linkPulse: 0
    };
    const activePlayerBuffer = [];

    const getParticleColorStyle = (color) => {
        if (!color) {
            return 'rgb(255, 255, 255)';
        }
        if (particleColorStyleCache) {
            const cached = particleColorStyleCache.get(color);
            if (cached) {
                return cached;
            }
            const style = `rgb(${color.r ?? 255}, ${color.g ?? 255}, ${color.b ?? 255})`;
            particleColorStyleCache.set(color, style);
            return style;
        }
        return `rgb(${color.r ?? 255}, ${color.g ?? 255}, ${color.b ?? 255})`;
    };

    const getProjectilePath = (width, height) => {
        if (!projectilePathCache) {
            return null;
        }
        const key = `${width}|${height}`;
        let path = projectilePathCache.get(key);
        if (!path) {
            path = new Path2D();
            path.moveTo(0, 0);
            path.lineTo(width, height * 0.5);
            path.lineTo(0, height);
            path.closePath();
            projectilePathCache.set(key, path);
        }
        return path;
    };

    function getCachedRadialGradient(cache, context, innerRadius, outerRadius, colorStops) {
        const normalize = (value) => (typeof value === 'number' ? value.toFixed(4) : String(value));
        const key = `${normalize(innerRadius)}|${normalize(outerRadius)}|${colorStops
            .map(([offset, color]) => `${normalize(offset)}:${color}`)
            .join('|')}`;

        let gradient = cache.get(key);

        if (!gradient) {
            gradient = context.createRadialGradient(0, 0, innerRadius, 0, 0, outerRadius);
            for (const [offset, color] of colorStops) {
                gradient.addColorStop(offset, color);
            }
            cache.set(key, gradient);
        }

        return gradient;
    }
    const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

    const audioManager = (() => {
        const clamp01 = (value) => Math.max(0, Math.min(1, value));

        const audioCapabilityProbe = (() => {
            if (typeof window === 'undefined' || typeof document === 'undefined') {
                return null;
            }

            if (typeof Audio !== 'function') {
                return null;
            }

            try {
                const element = document.createElement('audio');
                return typeof element?.canPlayType === 'function' ? element : null;
            } catch {
                return null;
            }
        })();

        const supportedFormats = audioCapabilityProbe
            ? {
                mp3: audioCapabilityProbe.canPlayType('audio/mpeg') !== '',
                ogg: audioCapabilityProbe.canPlayType('audio/ogg; codecs="vorbis"') !== '',
                wav: audioCapabilityProbe.canPlayType('audio/wav; codecs="1"') !== ''
            }
            : {};

        const supportedExtensions = new Set(
            Object.entries(supportedFormats)
                .filter(([, value]) => Boolean(value))
                .map(([ext]) => ext)
        );

        const isSupported = Boolean(audioCapabilityProbe) && supportedExtensions.size > 0;

        const normalizeSources = (definition) => {
            if (!definition) {
                return [];
            }

            if (Array.isArray(definition)) {
                return definition;
            }

            if (typeof definition === 'string') {
                return [definition];
            }

            if (Array.isArray(definition.sources)) {
                return definition.sources;
            }

            if (typeof definition.src === 'string') {
                return [definition.src];
            }

            return [];
        };

        const resolveAudioSource = (definition) => {
            const sources = normalizeSources(definition);

            if (!sources.length) {
                return '';
            }

            if (!audioCapabilityProbe) {
                return sources[0];
            }

            const mimeForExtension = (ext) => {
                switch (ext) {
                    case 'mp3':
                        return 'audio/mpeg';
                    case 'ogg':
                        return 'audio/ogg';
                    case 'wav':
                        return 'audio/wav';
                    case 'aac':
                        return 'audio/aac';
                    default:
                        return '';
                }
            };

            for (const candidate of sources) {
                const extension = candidate.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
                if (extension && supportedExtensions.size > 0 && !supportedExtensions.has(extension)) {
                    continue;
                }

                const mimeType = mimeForExtension(extension);
                if (!mimeType || audioCapabilityProbe.canPlayType(mimeType) !== '') {
                    return candidate;
                }
            }

            if (supportedExtensions.size > 0) {
                const fallback = sources.find((candidate) => {
                    const extension = candidate.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
                    return !extension || supportedExtensions.has(extension);
                });
                if (fallback) {
                    return fallback;
                }
            }

            return sources[0];
        };

        const soundDefinitions = {
            projectile: {
                standard: { sources: ['assets/audio/projectile-standard.mp3'], voices: 6, volume: 0.55 },
                spread: { sources: ['assets/audio/projectile-spread.mp3'], voices: 6, volume: 0.52 },
                missile: { sources: ['assets/audio/projectile-missile.mp3'], voices: 4, volume: 0.6 },
                scatter: { sources: ['assets/audio/projectile-spread.mp3'], voices: 6, volume: 0.5 },
                lance: { sources: ['assets/audio/projectile-missile.mp3'], voices: 4, volume: 0.64 }
            },
            collect: {
                point: { sources: ['assets/audio/point.mp3'], voices: 4, volume: 0.6 }
            },
            explosion: {
                villain1: { sources: ['assets/audio/explosion-villain1.mp3'], voices: 3, volume: 0.7 },
                villain2: { sources: ['assets/audio/explosion-villain2.mp3'], voices: 3, volume: 0.7 },
                villain3: { sources: ['assets/audio/explosion-villain3.mp3'], voices: 3, volume: 0.75 },
                asteroid: { sources: ['assets/audio/explosion-asteroid.mp3'], voices: 3, volume: 0.68 },
                powerbomb: { sources: ['assets/audio/explosion-powerbomb.mp3'], voices: 2, volume: 0.76 },
                generic: { sources: ['assets/audio/explosion-generic.mp3'], voices: 3, volume: 0.66 }
            }
        };

        const state = {
            masterVolume: 0.85,
            muted: false,
            unlocked: !isSupported,
            musicEnabled: true,
            sfxEnabled: true
        };

        const pools = new Map();
        const musicDefinition = { sources: ['assets/audio/gameplay.mp3'], volume: 0.52 };
        const hyperBeamDefinition = { sources: ['assets/audio/hyperbeam.mp3'], volume: 0.62 };
        let gameplayMusic = null;
        let shouldResumeGameplayMusic = false;
        let hyperBeamAudio = null;
        let shouldResumeHyperBeam = false;
        let resumeGameplayAfterVisibility = false;
        let resumeHyperAfterVisibility = false;
        const fadeControllers = new WeakMap();
        const stopTimers = new WeakMap();

        const scheduleAnimationFrame = typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
            ? window.requestAnimationFrame.bind(window)
            : null;
        const cancelAnimationFrame = typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function'
            ? window.cancelAnimationFrame.bind(window)
            : null;

        const clearStopTimer = (audio) => {
            const timerId = stopTimers.get(audio);
            if (timerId != null) {
                window.clearTimeout(timerId);
                stopTimers.delete(audio);
            }
        };

        const stopExistingFade = (audio) => {
            const cancel = fadeControllers.get(audio);
            if (typeof cancel === 'function') {
                cancel();
                fadeControllers.delete(audio);
            }
        };

        const fadeAudio = (audio, targetVolume, duration = 220) => {
            if (!audio) {
                return;
            }

            const resolvedTarget = clamp01(targetVolume ?? 0);
            const currentVolume = clamp01(audio.volume ?? 0);

            if (Math.abs(currentVolume - resolvedTarget) < 0.001 || duration <= 0) {
                stopExistingFade(audio);
                audio.volume = resolvedTarget;
                return;
            }

            stopExistingFade(audio);

            const startVolume = currentVolume;
            const startTime = performance.now();
            let rafId = null;
            let timeoutId = null;
            const useRaf = typeof scheduleAnimationFrame === 'function';

            const cancel = () => {
                if (useRaf && rafId != null) {
                    cancelAnimationFrame?.(rafId);
                } else if (!useRaf && timeoutId != null) {
                    window.clearTimeout(timeoutId);
                }
            };

            const step = (now) => {
                const progress = clamp01((now - startTime) / duration);
                const nextVolume = startVolume + (resolvedTarget - startVolume) * progress;
                audio.volume = clamp01(nextVolume);

                if (progress < 1) {
                    if (useRaf) {
                        rafId = scheduleAnimationFrame(step);
                    } else {
                        timeoutId = window.setTimeout(() => step(performance.now()), 16);
                    }
                } else {
                    fadeControllers.delete(audio);
                }
            };

            fadeControllers.set(audio, cancel);

            if (useRaf) {
                rafId = scheduleAnimationFrame(step);
            } else {
                timeoutId = window.setTimeout(() => step(performance.now()), 16);
            }
        };

        const getLoopTargetVolume = (definition, category = 'sfx') => {
            const base = clamp01((definition.volume ?? 1) * state.masterVolume);
            if (category === 'music' && !state.musicEnabled) {
                return 0;
            }
            if (category === 'sfx' && !state.sfxEnabled) {
                return 0;
            }
            if (state.muted) {
                return 0;
            }
            return base;
        };

        const prepareLoopForPlayback = (audio, definition, category = 'sfx') => {
            if (!audio) {
                return;
            }

            clearStopTimer(audio);
            stopExistingFade(audio);

            const target = getLoopTargetVolume(definition, category);
            if (audio.paused) {
                audio.volume = 0;
            } else {
                audio.volume = Math.min(audio.volume ?? target, target);
            }
        };

        const fadeOutLoop = (audio, duration, { reset = true } = {}) => {
            if (!audio) {
                return;
            }

            stopExistingFade(audio);
            clearStopTimer(audio);

            if (duration <= 0) {
                audio.volume = 0;
                if (!audio.paused) {
                    audio.pause();
                }
                if (reset) {
                    try {
                        audio.currentTime = 0;
                    } catch {
                        // Ignore reset failures
                    }
                }
                return;
            }

            fadeAudio(audio, 0, duration);
            const stopDelay = duration + 32;
            const timerId = window.setTimeout(() => {
                stopTimers.delete(audio);
                try {
                    audio.volume = 0;
                    if (!audio.paused) {
                        audio.pause();
                    }
                    if (reset) {
                        audio.currentTime = 0;
                    }
                } catch {
                    // Ignore errors when pausing/resetting
                }
            }, stopDelay);
            stopTimers.set(audio, timerId);
        };

        const attemptPlayLoop = (audio, definition, category = 'sfx') => {
            if (!audio || !state.unlocked || state.muted) {
                return false;
            }
            if (category === 'music' && !state.musicEnabled) {
                return false;
            }
            if (category === 'sfx' && !state.sfxEnabled) {
                return false;
            }

            prepareLoopForPlayback(audio, definition, category);
            const playPromise = audio.play();
            if (playPromise?.catch) {
                playPromise.catch(() => undefined);
            }
            fadeAudio(audio, getLoopTargetVolume(definition, category), 320);
            return true;
        };

        if (isSupported) {
            try {
                const musicSrc = resolveAudioSource(musicDefinition);
                if (musicSrc) {
                    gameplayMusic = new Audio(musicSrc);
                    gameplayMusic.preload = 'auto';
                    gameplayMusic.crossOrigin = 'anonymous';
                    gameplayMusic.loop = true;
                    gameplayMusic.volume = clamp01((musicDefinition.volume ?? 1) * state.masterVolume);
                    gameplayMusic.addEventListener('error', () => {
                        gameplayMusic = null;
                        shouldResumeGameplayMusic = false;
                    });
                }
            } catch {
                gameplayMusic = null;
            }

            try {
                const hyperBeamSrc = resolveAudioSource(hyperBeamDefinition);
                if (hyperBeamSrc) {
                    hyperBeamAudio = new Audio(hyperBeamSrc);
                    hyperBeamAudio.preload = 'auto';
                    hyperBeamAudio.crossOrigin = 'anonymous';
                    hyperBeamAudio.loop = true;
                    hyperBeamAudio.volume = clamp01((hyperBeamDefinition.volume ?? 1) * state.masterVolume);
                    hyperBeamAudio.addEventListener('error', () => {
                        hyperBeamAudio = null;
                        shouldResumeHyperBeam = false;
                    });
                }
            } catch {
                hyperBeamAudio = null;
                shouldResumeHyperBeam = false;
            }
        }

        function createSoundPool(definition) {
            const { voices = 4 } = definition;
            const src = resolveAudioSource(definition);
            const elements = [];
            let disabled = !src || !isSupported;

            if (!disabled) {
                for (let i = 0; i < voices; i++) {
                    try {
                        const audio = new Audio(src);
                        audio.preload = 'auto';
                        audio.crossOrigin = 'anonymous';
                        audio.volume = clamp01((definition.volume ?? 1) * state.masterVolume);
                        if (typeof audio.load === 'function') {
                            audio.load();
                        }
                        audio.addEventListener('error', () => {
                            disabled = true;
                        });
                        elements.push(audio);
                    } catch {
                        disabled = true;
                        break;
                    }
                }
            }

            let index = 0;

            const applyVolume = () => {
                const base = clamp01((definition.volume ?? 1) * state.masterVolume);
                const finalVolume = state.sfxEnabled && !state.muted ? base : 0;
                for (const audio of elements) {
                    audio.volume = finalVolume;
                }
            };

            applyVolume();

            return {
                play() {
                    if (!isSupported || disabled || state.muted || !state.unlocked || !state.sfxEnabled) {
                        return;
                    }

                    const audio = elements[index];
                    index = (index + 1) % elements.length;
                    if (!audio) return;

                    clearStopTimer(audio);
                    stopExistingFade(audio);
                    audio.volume = clamp01((definition.volume ?? 1) * state.masterVolume);
                    try {
                        audio.currentTime = 0;
                    } catch {
                        // Ignore if resetting currentTime fails
                    }

                    const playPromise = audio.play();
                    if (playPromise?.catch) {
                        playPromise.catch(() => undefined);
                    }
                },
                updateVolume: applyVolume
            };
        }

        function updateAllPoolVolumes() {
            for (const pool of pools.values()) {
                if (typeof pool?.updateVolume === 'function') {
                    pool.updateVolume();
                }
            }
        }

        function getPool(category, key) {
            const definition = soundDefinitions[category]?.[key];
            if (!definition) {
                return null;
            }

            const mapKey = `${category}:${key}`;
            if (!pools.has(mapKey)) {
                pools.set(mapKey, createSoundPool(definition));
            }
            return pools.get(mapKey);
        }

        function play(category, key, fallbackKey) {
            if (!isSupported || state.muted || !state.sfxEnabled) return;
            const pool = getPool(category, key) ?? (fallbackKey ? getPool(category, fallbackKey) : null);
            pool?.play();
        }

        function updateGameplayMusicVolume({ immediate = false } = {}) {
            if (!gameplayMusic) return;
            const target = getLoopTargetVolume(musicDefinition, 'music');
            if (immediate) {
                stopExistingFade(gameplayMusic);
                clearStopTimer(gameplayMusic);
                gameplayMusic.volume = target;
            } else {
                fadeAudio(gameplayMusic, target, 200);
            }
        }

        function updateHyperBeamVolume({ immediate = false } = {}) {
            if (!hyperBeamAudio) return;
            const target = getLoopTargetVolume(hyperBeamDefinition, 'sfx');
            if (immediate) {
                stopExistingFade(hyperBeamAudio);
                clearStopTimer(hyperBeamAudio);
                hyperBeamAudio.volume = target;
            } else {
                fadeAudio(hyperBeamAudio, target, 200);
            }
        }

        function attemptPlayGameplayMusic() {
            if (!attemptPlayLoop(gameplayMusic, musicDefinition, 'music')) {
                return;
            }
        }

        function attemptPlayHyperBeam() {
            if (!attemptPlayLoop(hyperBeamAudio, hyperBeamDefinition, 'sfx')) {
                return;
            }
        }

        function playGameplayMusic() {
            if (!isSupported || !gameplayMusic || !state.musicEnabled) {
                shouldResumeGameplayMusic = false;
                return;
            }
            shouldResumeGameplayMusic = true;
            clearStopTimer(gameplayMusic);
            try {
                gameplayMusic.currentTime = 0;
            } catch {
                // Ignore if resetting currentTime fails (e.g., not yet loaded)
            }
            attemptPlayGameplayMusic();
        }

        function stopGameplayMusic({ reset = true } = {}) {
            shouldResumeGameplayMusic = false;
            if (!gameplayMusic) {
                return;
            }
            fadeOutLoop(gameplayMusic, 220, { reset });
        }

        function playHyperBeam() {
            if (!isSupported || !hyperBeamAudio || !state.sfxEnabled) {
                shouldResumeHyperBeam = false;
                return;
            }
            shouldResumeHyperBeam = true;
            clearStopTimer(hyperBeamAudio);
            try {
                hyperBeamAudio.currentTime = 0;
            } catch {
                // Ignore if resetting currentTime fails (e.g., not yet loaded)
            }
            attemptPlayHyperBeam();
        }

        function stopHyperBeam({ reset = true } = {}) {
            shouldResumeHyperBeam = false;
            if (!hyperBeamAudio) {
                return;
            }
            fadeOutLoop(hyperBeamAudio, 200, { reset });
        }

        function suspendForVisibilityChange() {
            if (!isSupported) {
                return;
            }

            resumeGameplayAfterVisibility = shouldResumeGameplayMusic && !!(gameplayMusic && !gameplayMusic.paused);
            resumeHyperAfterVisibility = shouldResumeHyperBeam && !!(hyperBeamAudio && !hyperBeamAudio.paused);

            if (resumeGameplayAfterVisibility) {
                fadeOutLoop(gameplayMusic, 140, { reset: false });
            }
            if (resumeHyperAfterVisibility) {
                fadeOutLoop(hyperBeamAudio, 140, { reset: false });
            }
        }

        function resumeAfterVisibilityChange() {
            if (!isSupported) {
                return;
            }

            if (resumeGameplayAfterVisibility) {
                attemptPlayGameplayMusic();
                resumeGameplayAfterVisibility = false;
            }
            if (resumeHyperAfterVisibility) {
                attemptPlayHyperBeam();
                resumeHyperAfterVisibility = false;
            }
        }

        function unlock() {
            if (state.unlocked) return;
            state.unlocked = true;
            if (shouldResumeGameplayMusic) {
                attemptPlayGameplayMusic();
            }
            if (shouldResumeHyperBeam) {
                attemptPlayHyperBeam();
            }
        }

        function setMasterVolume(volume) {
            const numeric = Number.parseFloat(volume);
            const clamped = Number.isFinite(numeric) ? clamp01(numeric) : state.masterVolume;
            if (Math.abs(clamped - state.masterVolume) < 0.001) {
                return state.masterVolume;
            }
            state.masterVolume = clamped;
            updateGameplayMusicVolume({ immediate: true });
            updateHyperBeamVolume({ immediate: true });
            updateAllPoolVolumes();
            return state.masterVolume;
        }

        function toggleMusic(forceValue) {
            const next = typeof forceValue === 'boolean' ? forceValue : !state.musicEnabled;
            if (state.musicEnabled === next) {
                updateGameplayMusicVolume({ immediate: true });
                return state.musicEnabled;
            }
            state.musicEnabled = next;
            if (!state.musicEnabled) {
                stopGameplayMusic({ reset: false });
                updateGameplayMusicVolume({ immediate: true });
            } else {
                shouldResumeGameplayMusic = true;
                updateGameplayMusicVolume({ immediate: true });
                if (state.unlocked) {
                    attemptPlayGameplayMusic();
                }
            }
            return state.musicEnabled;
        }

        function toggleSfx(forceValue) {
            const next = typeof forceValue === 'boolean' ? forceValue : !state.sfxEnabled;
            if (state.sfxEnabled === next) {
                updateHyperBeamVolume({ immediate: true });
                updateAllPoolVolumes();
                return state.sfxEnabled;
            }
            const wasHyperActive = shouldResumeHyperBeam;
            state.sfxEnabled = next;
            if (!state.sfxEnabled) {
                stopHyperBeam({ reset: false });
                updateHyperBeamVolume({ immediate: true });
            } else {
                shouldResumeHyperBeam = wasHyperActive;
                updateHyperBeamVolume({ immediate: true });
                updateAllPoolVolumes();
                if (shouldResumeHyperBeam && state.unlocked) {
                    attemptPlayHyperBeam();
                }
            }
            if (!state.sfxEnabled) {
                updateAllPoolVolumes();
            }
            return state.sfxEnabled;
        }

        const getMasterVolume = () => state.masterVolume;
        const isMusicEnabled = () => state.musicEnabled;
        const isSfxEnabled = () => state.sfxEnabled;

        return {
            playProjectile(type) {
                play('projectile', type, 'standard');
            },
            playCollect(type = 'point') {
                play('collect', type, 'point');
            },
            playExplosion(type) {
                play('explosion', type, 'generic');
            },
            playGameplayMusic,
            stopGameplayMusic,
            playHyperBeam,
            stopHyperBeam,
            suspendForVisibilityChange,
            resumeAfterVisibilityChange,
            unlock,
            setMasterVolume,
            toggleMusic,
            toggleSfx,
            getMasterVolume,
            isMusicEnabled,
            isSfxEnabled
        };
    })();

    window.addEventListener('pointerdown', audioManager.unlock, { once: true });
    window.addEventListener('keydown', audioManager.unlock, { once: true });
    if (typeof window !== 'undefined' && 'ontouchstart' in window) {
        window.addEventListener('touchstart', audioManager.unlock, { once: true });
    }

    const handleAudioSuspend = () => {
        audioManager.suspendForVisibilityChange();
    };
    const handleAudioResume = () => {
        audioManager.resumeAfterVisibilityChange();
    };

    window.addEventListener('blur', handleAudioSuspend);
    window.addEventListener('focus', handleAudioResume);

    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                if (state.gameState === 'running') {
                    pauseGame({ reason: 'hidden' });
                } else {
                    handleAudioSuspend();
                }
            } else {
                handleAudioResume();
            }
        });
    }

    const assetOverrides =
        typeof window !== 'undefined' && window.NYAN_ASSET_OVERRIDES && typeof window.NYAN_ASSET_OVERRIDES === 'object'
            ? window.NYAN_ASSET_OVERRIDES
            : {};
    const gameplayOverrides =
        typeof window !== 'undefined' && window.NYAN_GAMEPLAY_OVERRIDES && typeof window.NYAN_GAMEPLAY_OVERRIDES === 'object'
            ? window.NYAN_GAMEPLAY_OVERRIDES
            : null;
    const cosmeticOverrides =
        assetOverrides.cosmetics && typeof assetOverrides.cosmetics === 'object'
            ? assetOverrides.cosmetics
            : {};

    const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

    const DEFAULT_TRAIL_STYLES = {
        rainbow: { id: 'rainbow', type: 'dynamic' },
        aurora: {
            id: 'aurora',
            type: 'palette',
            colors: ['#38bdf8', '#8b5cf6', '#f472b6', '#22d3ee']
        },
        ember: {
            id: 'ember',
            type: 'palette',
            colors: ['#fb923c', '#f97316', '#ea580c', '#facc15']
        },
        ion: {
            id: 'ion',
            type: 'palette',
            colors: ['#22d3ee', '#38bdf8', '#818cf8', '#c4b5fd']
        },
        solstice: {
            id: 'solstice',
            type: 'palette',
            colors: ['#fbbf24', '#f472b6', '#c084fc', '#60a5fa']
        },
        quantum: {
            id: 'quantum',
            type: 'palette',
            colors: ['#a855f7', '#22d3ee', '#0ea5e9', '#9333ea']
        }
    };

    let activeTrailStyle = null;

    function sanitizeTrailStyle(id, styleDefinition, fallback = DEFAULT_TRAIL_STYLES[id]) {
        const base = fallback ? { ...fallback } : { id, type: 'dynamic' };
        const result = { ...base, id };

        const applyPaletteColors = (colors) => {
            const palette = Array.isArray(colors)
                ? colors
                      .map((color) => (typeof color === 'string' ? color.trim() : ''))
                      .filter(Boolean)
                : [];
            if (palette.length) {
                result.type = 'palette';
                result.colors = palette;
            }
        };

        if (Array.isArray(styleDefinition)) {
            applyPaletteColors(styleDefinition);
        } else if (isPlainObject(styleDefinition)) {
            if (typeof styleDefinition.type === 'string') {
                const normalizedType = styleDefinition.type.trim().toLowerCase();
                if (normalizedType === 'palette') {
                    result.type = 'palette';
                } else {
                    result.type = 'dynamic';
                }
            }
            if (Array.isArray(styleDefinition.colors)) {
                applyPaletteColors(styleDefinition.colors);
            }
        }

        if (result.type === 'palette' && (!Array.isArray(result.colors) || result.colors.length === 0)) {
            if (Array.isArray(base.colors) && base.colors.length) {
                result.colors = [...base.colors];
            } else {
                result.type = 'dynamic';
                delete result.colors;
            }
        }

        return result;
    }

    const trailStyles = (() => {
        const overrides = isPlainObject(cosmeticOverrides?.trails) ? cosmeticOverrides.trails : {};
        const styles = {};
        const assignStyle = (styleId) => {
            styles[styleId] = sanitizeTrailStyle(styleId, overrides?.[styleId]);
        };
        for (const styleId of Object.keys(DEFAULT_TRAIL_STYLES)) {
            assignStyle(styleId);
        }
        if (overrides) {
            for (const [styleId, definition] of Object.entries(overrides)) {
                if (!styles[styleId]) {
                    styles[styleId] = sanitizeTrailStyle(styleId, definition);
                }
            }
        }
        return styles;
    })();

    function resolveTrailStyle(styleId) {
        const key = typeof styleId === 'string' && styleId ? styleId : 'rainbow';
        if (!trailStyles[key]) {
            trailStyles[key] = sanitizeTrailStyle(key, null, DEFAULT_TRAIL_STYLES.rainbow);
        }
        return trailStyles[key];
    }

    function setActiveTrailStyleById(styleId) {
        activeTrailStyle = resolveTrailStyle(styleId);
        return activeTrailStyle;
    }

    function getActiveTrailStyle() {
        const equippedId =
            (state?.cosmetics?.equipped?.trail && String(state.cosmetics.equipped.trail)) ||
            null;
        if (equippedId && (!activeTrailStyle || activeTrailStyle.id !== equippedId)) {
            return setActiveTrailStyleById(equippedId);
        }
        if (!activeTrailStyle) {
            return setActiveTrailStyleById('rainbow');
        }
        return activeTrailStyle;
    }

    setActiveTrailStyleById('rainbow');

    function cloneConfig(value) {
        if (Array.isArray(value)) {
            return value.map((item) => cloneConfig(item));
        }
        if (isPlainObject(value)) {
            const cloned = {};
            for (const [key, child] of Object.entries(value)) {
                cloned[key] = cloneConfig(child);
            }
            return cloned;
        }
        return value;
    }

    function applyOverrides(base, overrides) {
        if (!isPlainObject(overrides)) {
            return base;
        }
        for (const [key, value] of Object.entries(overrides)) {
            if (value == null) {
                continue;
            }
            if (Array.isArray(value)) {
                const currentBaseArray = Array.isArray(base[key]) ? base[key] : [];
                base[key] = value.map((item, index) => {
                    if (isPlainObject(item)) {
                        const baseItem = isPlainObject(currentBaseArray[index]) ? currentBaseArray[index] : {};
                        return applyOverrides(cloneConfig(baseItem), item);
                    }
                    return cloneConfig(item);
                });
                continue;
            }
            if (isPlainObject(value)) {
                const baseValue = isPlainObject(base[key]) ? base[key] : {};
                base[key] = applyOverrides(cloneConfig(baseValue), value);
                continue;
            }
            base[key] = value;
        }
        return base;
    }

    function resolveAssetConfig(override, defaultSrc) {
        if (override == null) {
            return defaultSrc;
        }

        if (typeof override === 'string') {
            return override.trim() || defaultSrc;
        }

        if (typeof override === 'object') {
            const config = { ...override };
            if ((!config.src || typeof config.src !== 'string' || !config.src.trim()) && defaultSrc) {
                config.src = defaultSrc;
            }
            if (typeof config.src === 'string') {
                config.src = config.src.trim();
                if (!config.src) {
                    delete config.src;
                }
            }
            if (typeof config.fallback === 'string') {
                config.fallback = config.fallback.trim();
                if (!config.fallback) {
                    delete config.fallback;
                }
            }
            return config;
        }

        return defaultSrc;
    }

    const baseGameConfig = {
        baseGameSpeed: 165,
        speedGrowth: 5.4,
        baseTrailLength: 28,
        trailGrowthPerStreak: 1.5,
        trailSpacing: 7,
        tailSmoothing: { growth: 120, shrink: 160 },
        comboDecayWindow: 5200,
        comboMultiplierStep: 0.045,
        obstacleSpawnInterval: 1100,
        collectibleSpawnInterval: 1400,
        powerUpSpawnInterval: 12000,
        projectileCooldown: 180,
        projectileSpeed: 760,
        star: {
            count: 42,
            baseSpeed: 60
        },
        player: {
            width: 72,
            height: 54,
            acceleration: 3600,
            drag: 10.5,
            maxSpeed: 320,
            verticalBleed: 0.18,
            dash: {
                boostSpeed: 580,
                duration: 220,
                dragMultiplier: 0.4,
                doubleTapWindow: 220
            }
        },
        collectible: {
            size: 32,
            verticalPadding: 48,
            minSpeed: 110,
            maxSpeed: 210
        },
        powerUp: {
            size: 42,
            minSpeed: 150,
            maxSpeed: 250,
            wobbleSpeed: 2.3,
            wobbleAmplitude: 26,
            duration: {
                powerBomb: 9000,
                bulletSpread: 9000,
                missiles: 9000,
                [DOUBLE_TEAM_POWER]: 14000,
                [FLAME_WHIP_POWER]: 8000,
                [HYPER_BEAM_POWER]: 6000,
                [SHIELD_POWER]: 9000,
                [PUMP_POWER]: 8000,
                [TIME_DILATION_POWER]: 8000,
                [SCORE_SURGE_POWER]: 7000,
                [MAGNET_POWER]: 8000
            }
        },
        score: {
            collect: 84,
            destroy: 120,
            asteroid: 60,
            dodge: 18,
            villainEscape: 150
        },
        scoreSurgePower: {
            scoreMultiplier: 2
        },
        timeDilationPower: {
            worldSpeedMultiplier: 0.6,
            spawnRateMultiplier: 0.6
        },
        magnetPower: {
            pullRadius: 260,
            pullStrength: 1100,
            maxSpeed: 280
        },
        hyperBeam: {
            beamHeight: 180,
            extraLength: 80,
            waveSpeed: 0.006,
            damagePerSecond: 32,
            asteroidDamagePerSecond: 48,
            rampUp: 260,
            fadeOut: 260,
            hitSparkRate: 7,
            jitterAmplitude: 18,
            sparkInterval: 140
        },
        doubleTeamPower: {
            separation: 140,
            catchUpRate: 6.2,
            wobbleAmplitude: 16,
            wobbleSpeed: 3.2,
            trailSpacingScale: 0.82
        },
        defensePower: {
            obstacleKnockback: 540,
            obstacleBounceDuration: 520,
            obstacleSpeedMultiplier: 0.32,
            asteroidKnockback: 640,
            clearance: 48,
            hitCooldown: 600,
            auraColor: { r: 148, g: 210, b: 255 },
            auraPulse: 0.18,
            particleColor: { r: 148, g: 210, b: 255 }
        },
        difficulty: {
            rampDuration: 100000,
            speedRamp: { start: 0.24, end: 0.84 },
            spawnIntensity: {
                obstacle: { start: 0.42, end: 1.18 },
                collectible: { start: 0.64, end: 0.98 },
                powerUp: { start: 0.54, end: 0.9 }
            },
            healthRamp: { start: 0.82, end: 1.32 }
        },
        asteroid: {
            scale: 1,
            depthRange: [0.08, 0.92],
            sizeRange: [48, 148],
            speedRange: [140, 300],
            rotationSpeedRange: [-0.6, 0.6],
            driftRange: [-24, 24],
            clusterRadius: 220,
            minSpacing: 24,
            spawnOffset: 150,
            placementAttempts: 24,
            initialCount: 4,
            maxCount: 8,
            spawnInterval: 2600,
            meteorShowerInterval: 26000,
            meteorShowerVariance: 9000,
            meteorShowerCount: 5,
            meteorShowerSpeedMultiplier: 1.18,
            meteorShowerFormation: [
                { x: 0, y: 0 },
                { x: 70, y: -56 },
                { x: 70, y: 56 },
                { x: 140, y: -112 },
                { x: 140, y: 112 }
            ],
            collisionRadiusMultiplier: 1,
            flowLerp: 0.08,
            trail: {
                spacing: 36,
                maxPoints: 14,
                life: 560,
                widthScale: 0.44,
                lengthScale: 0.78
            }
        }
    };

    const SPRITE_SIZE_WEIGHTS = Object.freeze({
        basePlayerWidth: 96,
        player: 1,
        powerUp: 0.78,
        collectible: 0.62,
        villain: {
            small: { min: 1.18, max: 1.36 },
            medium: { min: 1.48, max: 1.78 },
            large: { min: 1.88, max: 2.18 }
        },
        boss: {
            sequence: [2.3, 2.55, 2.8]
        }
    });

    const BASE_COLLECTIBLE_PADDING_RATIO =
        baseGameConfig.collectible.verticalPadding / baseGameConfig.collectible.size;
    const BASE_POWER_UP_WOBBLE_RATIO = baseGameConfig.powerUp.wobbleAmplitude / baseGameConfig.powerUp.size;

    function createBalancedSpriteSizing(baseConfig, weights, options = {}) {
        const basePlayer = baseConfig.player ?? { width: 72, height: 54 };
        const playerAspect =
            basePlayer.width > 0 ? basePlayer.height / basePlayer.width : options.playerAspect ?? 0.75;
        const referenceWidth = Math.round(weights.basePlayerWidth ?? basePlayer.width);
        const playerWeight = weights.player ?? 1;
        const playerWidth = Math.round(referenceWidth * playerWeight);
        const playerHeight = Math.round(playerWidth * (options.playerAspect ?? playerAspect));

        const collectibleWeight = weights.collectible ?? 0.68;
        const collectibleSize = Math.round(referenceWidth * collectibleWeight);
        const collectiblePaddingRatio = Number.isFinite(options.collectiblePaddingRatio)
            ? options.collectiblePaddingRatio
            : BASE_COLLECTIBLE_PADDING_RATIO;
        const collectibleVerticalPadding = Math.round(collectibleSize * collectiblePaddingRatio);

        const powerUpWeight = weights.powerUp ?? 0.82;
        const powerUpSize = Math.round(referenceWidth * powerUpWeight);
        const powerUpWobbleRatio = Number.isFinite(options.powerUpWobbleRatio)
            ? options.powerUpWobbleRatio
            : BASE_POWER_UP_WOBBLE_RATIO;
        const powerUpWobbleAmplitude = Math.round(powerUpSize * powerUpWobbleRatio);

        const villainDefaults = {
            small: { min: 1.2, max: 1.4 },
            medium: { min: 1.5, max: 1.8 },
            large: { min: 1.9, max: 2.2 }
        };

        const scaleRange = (range, fallback) => {
            const source = range ?? fallback;
            const minWeight = source?.min ?? fallback.min;
            const maxWeight = source?.max ?? fallback.max;
            return {
                min: Math.round(referenceWidth * minWeight),
                max: Math.round(referenceWidth * maxWeight)
            };
        };

        const villainWeights = weights.villain ?? {};
        const villains = {
            small: scaleRange(villainWeights.small, villainDefaults.small),
            medium: scaleRange(villainWeights.medium, villainDefaults.medium),
            large: scaleRange(villainWeights.large, villainDefaults.large)
        };

        const bossWeights = Array.isArray(weights.boss?.sequence)
            ? weights.boss.sequence
            : [2.3, 2.55, 2.8];
        const bossAspect = weights.boss?.aspect ?? 1;
        const bosses = bossWeights.map((weight) => {
            const width = Math.round(referenceWidth * weight);
            return {
                width,
                height: Math.round(width * bossAspect)
            };
        });

        return {
            player: { width: playerWidth, height: playerHeight },
            collectible: { size: collectibleSize, verticalPadding: collectibleVerticalPadding },
            powerUp: { size: powerUpSize, wobbleAmplitude: powerUpWobbleAmplitude },
            villains,
            bosses,
            referenceWidth
        };
    }

    const balancedSpriteSizing = createBalancedSpriteSizing(baseGameConfig, SPRITE_SIZE_WEIGHTS, {
        collectiblePaddingRatio: BASE_COLLECTIBLE_PADDING_RATIO,
        powerUpWobbleRatio: BASE_POWER_UP_WOBBLE_RATIO
    });

    Object.assign(baseGameConfig.player, balancedSpriteSizing.player);
    baseGameConfig.collectible.size = balancedSpriteSizing.collectible.size;
    baseGameConfig.collectible.verticalPadding = balancedSpriteSizing.collectible.verticalPadding;
    baseGameConfig.powerUp.size = balancedSpriteSizing.powerUp.size;
    baseGameConfig.powerUp.wobbleAmplitude = balancedSpriteSizing.powerUp.wobbleAmplitude;

    config = applyOverrides(cloneConfig(baseGameConfig), gameplayOverrides);
    basePlayerConfig = cloneConfig(baseGameConfig.player);
    baseDashConfig = cloneConfig(baseGameConfig.player.dash);
    baseProjectileSettings = {
        speed: baseGameConfig.projectileSpeed,
        cooldown: baseGameConfig.projectileCooldown
    };

    const projectileArchetypes = Object.freeze({
        standard: {
            width: 24,
            height: 12,
            speedMultiplier: 1,
            life: 2000,
            damage: 1,
            gradient: ['#00e5ff', '#6a5acd'],
            glow: 'rgba(56, 189, 248, 0.45)',
            shadowBlur: 14,
            shadowColor: 'rgba(56, 189, 248, 0.3)'
        },
        spread: {
            width: 22,
            height: 12,
            speedMultiplier: 0.92,
            life: 1800,
            damage: 1,
            gradient: ['#ede9fe', '#a855f7'],
            glow: 'rgba(168, 85, 247, 0.38)',
            shadowBlur: 12,
            shadowColor: 'rgba(168, 85, 247, 0.24)'
        },
        scatter: {
            width: 18,
            height: 10,
            speedMultiplier: 0.9,
            life: 1500,
            damage: 1,
            gradient: ['#bfdbfe', '#60a5fa'],
            glow: 'rgba(96, 165, 250, 0.4)',
            shadowBlur: 10,
            shadowColor: 'rgba(96, 165, 250, 0.26)'
        },
        missile: {
            width: 32,
            height: 16,
            speedMultiplier: 0.88,
            life: 2600,
            damage: 2,
            glow: 'rgba(251, 191, 36, 0.5)',
            shadowBlur: 12,
            shadowColor: 'rgba(251, 191, 36, 0.3)'
        },
        lance: {
            width: 42,
            height: 14,
            speedMultiplier: 1.12,
            life: 2200,
            damage: 2,
            gradient: ['#e0f2fe', '#38bdf8', '#0284c7'],
            glow: 'rgba(56, 189, 248, 0.55)',
            shape: 'lance',
            shadowBlur: 16,
            shadowColor: 'rgba(56, 189, 248, 0.36)'
        },
        flameWhip: {
            width: 48,
            height: 26,
            speedMultiplier: 1.05,
            life: 640,
            damage: 1,
            gradient: ['#450a0a', '#9f1239', '#f97316'],
            glow: 'rgba(248, 113, 113, 0.6)',
            shape: 'flameWhip',
            shadowBlur: 18,
            shadowColor: 'rgba(248, 113, 113, 0.45)'
        }
    });

    const defaultBackgrounds = [
        'assets/background1.png',
        'assets/background2.png',
        'assets/background3.png',
        'linear-gradient(135deg, #020617 0%, #1e293b 35%, #4f46e5 100%)',
        [
            'radial-gradient(circle at 20% 20%, rgba(56, 189, 248, 0.35), transparent 55%)',
            'linear-gradient(180deg, #020617 0%, #0f172a 55%, #111827 100%)'
        ].join(', '),
        [
            'radial-gradient(circle at 80% 10%, rgba(251, 191, 36, 0.3), transparent 50%)',
            'radial-gradient(circle at 15% 80%, rgba(192, 132, 252, 0.35), transparent 55%)',
            'linear-gradient(160deg, #0b1120 0%, #1e1b4b 40%, #581c87 100%)'
        ].join(', ')
    ];
    const backgroundOverrideEntries =
        Array.isArray(assetOverrides.backgrounds) && assetOverrides.backgrounds.length
            ? assetOverrides.backgrounds
            : defaultBackgrounds;
    let backgroundImages = backgroundOverrideEntries
        .map((entry, index) => resolveAssetConfig(entry, defaultBackgrounds[index % defaultBackgrounds.length]))
        .map((config) => (typeof config === 'string' ? config : config?.src))
        .filter((src) => typeof src === 'string' && src.length);
    if (backgroundImages.length === 0) {
        backgroundImages = [...defaultBackgrounds];
    }
    const backgroundLayers = [
        document.getElementById('backgroundLayerA'),
        document.getElementById('backgroundLayerB')
    ];
    const backgroundChangeInterval = 60000;
    let currentBackgroundIndex = 0;
    let activeLayerIndex = 0;

    const scoreEl = document.getElementById('score');
    const nyanEl = document.getElementById('nyan');
    const streakEl = document.getElementById('streak');
    const bestStreakEl = document.getElementById('bestStreak');
    const mcapEl = document.getElementById('mcap');
    const volEl = document.getElementById('vol');
    const powerUpsEl = document.getElementById('powerUps');
    const comboFillEl = document.getElementById('comboFill');
    const comboMeterEl = document.getElementById('comboMeter');
    const joystickZone = document.getElementById('joystickZone');
    const joystickThumb = joystickZone?.querySelector('.joystick-thumb') ?? null;
    const fireButton = document.getElementById('fireButton');
    const touchControls = document.getElementById('touchControls');
    const debugOverlayEl = document.getElementById('debugOverlay');
    const debugOverlayLines = debugOverlayEl
        ? {
            logical: debugOverlayEl.querySelector('[data-debug-line="logical"]'),
            physical: debugOverlayEl.querySelector('[data-debug-line="physical"]'),
            ratio: debugOverlayEl.querySelector('[data-debug-line="ratio"]')
        }
        : {};

    const overlay = document.getElementById('overlay');
    const overlayMessage = document.getElementById('overlayMessage');
    const flyNowButton = document.getElementById('flyNowButton');
    const overlayButton = document.getElementById('overlayButton');
    const overlaySecondaryButton = document.getElementById('overlaySecondaryButton');
    const callsignForm = document.getElementById('callsignForm');
    const playerNameInput = document.getElementById('playerNameInput');
    const callsignHint = document.getElementById('callsignHint');
    const preflightBar = document.getElementById('preflightBar');
    const preflightPrompt = document.getElementById('preflightPrompt');
    const mobilePreflightButton = document.getElementById('mobilePreflightButton');
    const comicIntro = document.getElementById('comicIntro');
    const overlayTitle = overlay?.querySelector('h1') ?? null;
    const overlayDefaultTitle = overlayTitle?.textContent ?? '';
    const overlayDefaultMessage = overlayMessage?.textContent ?? '';
    const characterSelectModal = document.getElementById('characterSelectModal');
    const characterSelectConfirm = document.getElementById('characterSelectConfirm');
    const characterSelectCancel = document.getElementById('characterSelectCancel');
    swapPilotButton = document.getElementById('swapPilotButton');
    preflightSwapPilotButton = document.getElementById('preflightSwapPilotButton');
    const preflightLoadoutSummary = document.getElementById('preflightLoadoutSummary');
    const preflightPilotImage = document.getElementById('preflightPilotImage');
    const preflightPilotName = document.getElementById('preflightPilotName');
    const preflightPilotRole = document.getElementById('preflightPilotRole');
    const preflightWeaponImage = document.getElementById('preflightWeaponImage');
    const preflightWeaponName = document.getElementById('preflightWeaponName');
    const preflightWeaponHighlight = document.getElementById('preflightWeaponHighlight');
    const characterSelectSummary = document.getElementById('characterSelectSummary');
    const characterSelectSummaryDescription = characterSelectSummary?.querySelector(
        '[data-character-summary-description]'
    );
    const characterSelectSummaryOngoing = characterSelectSummary?.querySelector(
        '[data-character-summary-ongoing]'
    );
    const characterSelectGrid =
        characterSelectModal?.querySelector('[data-character-grid]') ??
        characterSelectModal?.querySelector('.character-grid') ??
        null;
    let characterCards = [];
    const weaponSelectModal = document.getElementById('weaponSelectModal');
    const weaponSelectConfirm = document.getElementById('weaponSelectConfirm');
    const weaponSelectCancel = document.getElementById('weaponSelectCancel');
    swapWeaponButton = document.getElementById('swapWeaponButton');
    preflightSwapWeaponButton = document.getElementById('preflightSwapWeaponButton');
    openWeaponSelectButton = document.getElementById('openWeaponSelectButton');
    const weaponSelectSummary = document.getElementById('weaponSelectSummary');
    const weaponSelectSummaryDescription = weaponSelectSummary?.querySelector(
        '[data-weapon-summary-description]'
    );
    const weaponSelectGrid =
        weaponSelectModal?.querySelector('[data-weapon-grid]') ??
        weaponSelectModal?.querySelector('.character-grid') ??
        null;
    let weaponCards = [];
    const loadingScreen = document.getElementById('loadingScreen');
    const loadingStatus = document.getElementById('loadingStatus');
    const loadingImageEl = document.getElementById('loadingImage');
    const modalFocusMemory = new WeakMap();
    const loadingSequenceTimers = new Set();

    function isModalOpen(modal) {
        return Boolean(modal && !modal.hidden && modal.getAttribute('aria-hidden') !== 'true');
    }

    function focusElement(element) {
        if (!(element instanceof HTMLElement)) {
            return;
        }
        const needsTemporaryTabIndex = element.tabIndex < 0 && !element.hasAttribute('tabindex');
        if (needsTemporaryTabIndex) {
            element.setAttribute('tabindex', '-1');
        }
        const focusFn = () => {
            try {
                element.focus({ preventScroll: true });
            } catch {
                element.focus();
            }
            if (needsTemporaryTabIndex) {
                element.addEventListener(
                    'blur',
                    () => {
                        element.removeAttribute('tabindex');
                    },
                    { once: true }
                );
            }
        };
        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(focusFn);
        } else {
            focusFn();
        }
    }

    function openModal(modal, { bodyClass, initialFocus } = {}) {
        if (!modal || isModalOpen(modal)) {
            return;
        }
        const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        modalFocusMemory.set(modal, previousFocus);
        modal.hidden = false;
        modal.setAttribute('aria-hidden', 'false');
        if (bodyClass && bodyElement) {
            bodyElement.classList.add(bodyClass);
        }
        const resolvedInitialFocus =
            typeof initialFocus === 'function'
                ? initialFocus()
                : initialFocus ??
                  modal.querySelector('[data-initial-focus]') ??
                  modal.querySelector('[autofocus]') ??
                  modal.querySelector('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        focusElement(resolvedInitialFocus instanceof HTMLElement ? resolvedInitialFocus : modal);
    }

    function closeModal(modal, { bodyClass, restoreFocus = true } = {}) {
        if (!modal || !isModalOpen(modal)) {
            return;
        }
        modal.hidden = true;
        modal.setAttribute('aria-hidden', 'true');
        if (bodyClass && bodyElement) {
            bodyElement.classList.remove(bodyClass);
        }
        const previousFocus = modalFocusMemory.get(modal);
        modalFocusMemory.delete(modal);
        if (restoreFocus && previousFocus instanceof HTMLElement) {
            focusElement(previousFocus);
        }
    }

    function clearLoadingSequenceTimers() {
        if (typeof window === 'undefined' || typeof window.clearTimeout !== 'function') {
            loadingSequenceTimers.clear();
            return;
        }
        for (const timerId of loadingSequenceTimers) {
            window.clearTimeout(timerId);
        }
        loadingSequenceTimers.clear();
    }

    function runCyborgLoadingSequence() {
        clearLoadingSequenceTimers();
        if (!loadingScreen || !loadingStatus) {
            return;
        }

        loadingScreen.classList.remove('hidden');

        const prefixEl = loadingStatus.querySelector('.loading-prefix');
        const lineEl = loadingStatus.querySelector('.loading-line');

        const steps = [
            { prefix: '[SYS-BOOT:01]', message: 'Spooling quantum cores', percent: 8, delay: 450 },
            { prefix: '[SYS-BOOT:02]', message: 'Aligning gravitic fins', percent: 22, delay: 550 },
            { prefix: '[SYS-BOOT:03]', message: 'Synchronizing neural uplink', percent: 38, delay: 620 },
            { prefix: '[SYS-BOOT:04]', message: 'Priming starlight cannons', percent: 54, delay: 520 },
            { prefix: '[SYS-BOOT:05]', message: 'Charging harmonic shields', percent: 68, delay: 560 },
            { prefix: '[SYS-BOOT:06]', message: 'Mapping asteroid trajectories', percent: 82, delay: 640 },
            { prefix: '[SYS-BOOT:07]', message: 'Finalizing launch window', percent: 94, delay: 600 },
            { prefix: '[SYS-BOOT:08]', message: 'All systems nominal', percent: 100, delay: 700 }
        ];

        const updateLoadingLine = (message, percent) => {
            if (!lineEl) {
                return;
            }
            const formattedPercent = `${String(Math.round(percent)).padStart(3, '0')}%`;
            lineEl.textContent = `${message} — `;
            const percentSpan = document.createElement('span');
            percentSpan.className = 'loading-percent';
            percentSpan.textContent = formattedPercent;
            lineEl.appendChild(percentSpan);
        };

        const runStep = (index) => {
            if (index >= steps.length) {
                if (loadingImageEl) {
                    loadingImageEl.classList.add('loaded');
                }
                const hideDelay = typeof window !== 'undefined' ? window.setTimeout : null;
                if (hideDelay) {
                    const timerId = hideDelay(() => {
                        loadingSequenceTimers.delete(timerId);
                        loadingScreen.classList.add('hidden');
                    }, 450);
                    loadingSequenceTimers.add(timerId);
                } else {
                    loadingScreen.classList.add('hidden');
                }
                return;
            }

            const step = steps[index];
            if (prefixEl) {
                prefixEl.textContent = step.prefix;
            }
            updateLoadingLine(step.message, step.percent);

            const timeoutFn = typeof window !== 'undefined' ? window.setTimeout : null;
            if (timeoutFn) {
                const timerId = timeoutFn(() => {
                    loadingSequenceTimers.delete(timerId);
                    runStep(index + 1);
                }, Math.max(0, step.delay ?? 600));
                loadingSequenceTimers.add(timerId);
            } else {
                runStep(index + 1);
            }
        };

        runStep(0);
    }

    function isCharacterSelectOpen() {
        return isModalOpen(characterSelectModal);
    }

    function openCharacterSelect(reason = '') {
        if (!characterSelectModal) {
            return;
        }
        if (reason) {
            characterSelectModal.dataset.openReason = reason;
        } else {
            delete characterSelectModal.dataset.openReason;
        }
        pendingPilotId = activePilotId;
        updatePilotSelectionState();
        openModal(characterSelectModal, {
            bodyClass: 'character-select-open',
            initialFocus: () =>
                (characterSelectConfirm && !characterSelectConfirm.disabled
                    ? characterSelectConfirm
                    : characterSelectModal.querySelector('[data-character-grid] button:not([disabled])')) ??
                characterSelectModal.querySelector('.character-select-content')
        });
    }

    function closeCharacterSelect(options = {}) {
        closeModal(characterSelectModal, {
            bodyClass: 'character-select-open',
            restoreFocus: options.restoreFocus !== false
        });
    }

    function isWeaponSelectOpen() {
        return isModalOpen(weaponSelectModal);
    }

    function openWeaponSelect(reason = '') {
        if (!weaponSelectModal) {
            return;
        }
        if (reason) {
            weaponSelectModal.dataset.openReason = reason;
        } else {
            delete weaponSelectModal.dataset.openReason;
        }
        pendingWeaponId = activeWeaponId;
        updateWeaponSelectionState();
        openModal(weaponSelectModal, {
            bodyClass: 'weapon-select-open',
            initialFocus: () =>
                (weaponSelectConfirm && !weaponSelectConfirm.disabled
                    ? weaponSelectConfirm
                    : weaponSelectModal.querySelector('[data-weapon-grid] button:not([disabled])')) ??
                weaponSelectModal.querySelector('.character-select-content')
        });
    }

    function closeWeaponSelect(options = {}) {
        closeModal(weaponSelectModal, {
            bodyClass: 'weapon-select-open',
            restoreFocus: options.restoreFocus !== false
        });
    }

    const characterSelectBackdrop =
        characterSelectModal?.querySelector('.character-select-backdrop') ?? null;
    if (characterSelectBackdrop) {
        characterSelectBackdrop.addEventListener('click', () => closeCharacterSelect());
    }
    const weaponSelectBackdrop = weaponSelectModal?.querySelector('.character-select-backdrop') ?? null;
    if (weaponSelectBackdrop) {
        weaponSelectBackdrop.addEventListener('click', () => closeWeaponSelect());
    }

    if (characterSelectCancel) {
        characterSelectCancel.addEventListener('click', () => closeCharacterSelect());
    }
    if (characterSelectConfirm) {
        characterSelectConfirm.addEventListener('click', () => {
            if (!pendingPilotId) {
                return;
            }
            setActiveLoadoutId(null);
            setActivePilot(pendingPilotId, { updatePending: true, refresh: true });
            closeCharacterSelect();
        });
    }
    if (weaponSelectCancel) {
        weaponSelectCancel.addEventListener('click', () => closeWeaponSelect());
    }
    if (weaponSelectConfirm) {
        weaponSelectConfirm.addEventListener('click', () => {
            if (!pendingWeaponId) {
                return;
            }
            setActiveLoadoutId(null);
            setActiveWeapon(pendingWeaponId, { updatePending: true, refresh: true });
            closeWeaponSelect();
        });
    }

    const characterSelectOpenButtons = [swapPilotButton, preflightSwapPilotButton];
    for (const button of characterSelectOpenButtons) {
        if (button) {
            button.addEventListener('click', () => openCharacterSelect(button.id ?? 'button'));
        }
    }

    const weaponSelectOpenButtons = [swapWeaponButton, preflightSwapWeaponButton, openWeaponSelectButton];
    for (const button of weaponSelectOpenButtons) {
        if (button) {
            button.addEventListener('click', () => openWeaponSelect(button.id ?? 'button'));
        }
    }

    function setButtonDisabledState(button, disabled) {
        if (!button) {
            return;
        }
        button.disabled = disabled;
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    function shouldDisablePreflightControls(modalAvailable) {
        if (!modalAvailable) {
            return true;
        }
        const gameState = state?.gameState;
        return gameState === 'running' || gameState === 'paused';
    }

    function updateSwapPilotButton() {
        const shouldDisable = shouldDisablePreflightControls(Boolean(characterSelectModal));
        setButtonDisabledState(swapPilotButton, shouldDisable);
        setButtonDisabledState(preflightSwapPilotButton, shouldDisable);
    }

    function updateSwapWeaponButtons() {
        const shouldDisable = shouldDisablePreflightControls(Boolean(weaponSelectModal));
        setButtonDisabledState(swapWeaponButton, shouldDisable);
        setButtonDisabledState(preflightSwapWeaponButton, shouldDisable);
        setButtonDisabledState(openWeaponSelectButton, shouldDisable);
    }

    updateSwapPilotButton();
    updateSwapWeaponButtons();

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('beforeunload', clearLoadingSequenceTimers);
    }

    const timerValueEl = document.getElementById('timerValue');
    const survivalTimerEl = document.getElementById('survivalTimer');
    const pauseOverlay = document.getElementById('pauseOverlay');
    const pauseMessageEl = document.getElementById('pauseMessage');
    const pauseHintEl = document.getElementById('pauseHint');
    const resumeButton = document.getElementById('resumeButton');
    const pauseSettingsButton = document.getElementById('pauseSettingsButton');
    const highScoreListEl = document.getElementById('highScoreList');
    const highScoreTitleEl = document.getElementById('highScoreTitle');
    const leaderboardTitleEl = document.getElementById('leaderboardTitle');
    const leaderboardListEl = document.getElementById('leaderboardList');
    const leaderboardStatusEl = document.getElementById('leaderboardStatus');
    const leaderboardTabButtons = Array.from(
        document.querySelectorAll('[data-leaderboard-scope]')
    );
    const summaryCard = document.getElementById('summaryCard');
    const summaryTabButtons = Array.from(document.querySelectorAll('[data-summary-tab]'));
    const summarySections = new Map();
    document.querySelectorAll('[data-summary-section]').forEach((section) => {
        if (!(section instanceof HTMLElement)) {
            return;
        }
        const key = section.dataset.summarySection;
        if (key) {
            summarySections.set(key, section);
        }
    });
    const runSummaryStatusEl = document.getElementById('runSummaryStatus');
    const runSummaryTimeEl = document.getElementById('runSummaryTime');
    const runSummaryScoreEl = document.getElementById('runSummaryScore');
    const runSummaryStreakEl = document.getElementById('runSummaryStreak');
    const runSummaryNyanEl = document.getElementById('runSummaryNyan');
    const runSummaryPlacementEl = document.getElementById('runSummaryPlacement');
    const runSummaryStatusState = { message: '', type: 'info' };

    let lastPauseReason = 'manual';
    const runSummaryRunsEl = document.getElementById('runSummaryRuns');
    let shareButtonClickHandler = null;
    const weaponSummaryName = document.getElementById('weaponSummaryName');
    const weaponSummaryDescription = document.getElementById('weaponSummaryDescription');
    const weaponSummaryImage = document.getElementById('weaponSummaryImage');
    const pilotPreviewGrid = document.getElementById('pilotPreviewGrid');
    const pilotPreviewDescription = document.getElementById('pilotPreviewDescription');
    const defaultPilotPreviewDescription =
        (pilotPreviewDescription?.textContent ?? '').trim() ||
        'Equip one of your saved presets instantly before launch. Manage the presets in the Custom Loadouts panel below.';
    const loadoutCreationPromptText =
        'No loadout equipped. Want to save your current pilot, suit, stream, and weapon as a preset before launch?';
    const shareButton = document.getElementById('shareButton');
    const shareStatusEl = document.getElementById('shareStatus');
    const rewardCatalogueListEl = document.getElementById('rewardCatalogueList');
    const seasonPassPanel = document.getElementById('seasonPassPanel');
    const seasonPassSummaryEl = document.getElementById('seasonPassSummary');
    const seasonPassProgressFill = document.getElementById('seasonPassProgressFill');
    const seasonPassTierListEl = document.getElementById('seasonPassTierList');
    const communityGoalListEl = document.getElementById('communityGoalList');
    const achievementBadgeListEl = document.getElementById('achievementBadgeList');
    const intelLogEl = document.getElementById('intelLog');
    const challengeListEl = document.getElementById('challengeList');
    const skinOptionsEl = document.getElementById('skinOptions');
    const trailOptionsEl = document.getElementById('trailOptions');
    const customLoadoutGrid =
        document.getElementById('customLoadoutSection')?.querySelector('[data-loadout-grid]') ?? null;
    const loadoutEditorModal = document.getElementById('loadoutEditorModal');
    const loadoutEditorContent =
        loadoutEditorModal?.querySelector('.loadout-editor-content') ?? null;
    const loadoutEditorBackdrop =
        loadoutEditorModal?.querySelector('[data-loadout-editor-dismiss="backdrop"]') ?? null;
    const loadoutEditorTitle = document.getElementById('loadoutEditorTitle');
    const loadoutEditorSubtitle = document.getElementById('loadoutEditorSubtitle');
    const loadoutEditorPilotGrid =
        loadoutEditorModal?.querySelector('[data-loadout-editor-pilots]') ?? null;
    const loadoutEditorWeaponGrid =
        loadoutEditorModal?.querySelector('[data-loadout-editor-weapons]') ?? null;
    const loadoutEditorSkinGrid =
        loadoutEditorModal?.querySelector('[data-loadout-editor-skins]') ?? null;
    const loadoutEditorTrailGrid =
        loadoutEditorModal?.querySelector('[data-loadout-editor-trails]') ?? null;
    const loadoutEditorSummaryValues = {
        pilot: loadoutEditorModal?.querySelector('[data-loadout-editor-summary="pilot"]') ?? null,
        weapon: loadoutEditorModal?.querySelector('[data-loadout-editor-summary="weapon"]') ?? null,
        skin: loadoutEditorModal?.querySelector('[data-loadout-editor-summary="skin"]') ?? null,
        trail: loadoutEditorModal?.querySelector('[data-loadout-editor-summary="trail"]') ?? null
    };
    const loadoutEditorSaveButton = document.getElementById('loadoutEditorSave');
    const loadoutEditorCancelButton = document.getElementById('loadoutEditorCancel');
    const loadoutEditorCloseButton = document.getElementById('loadoutEditorClose');
    if (loadoutEditorSaveButton) {
        loadoutEditorSaveButton.addEventListener('click', () => handleLoadoutEditorSave());
    }
    if (loadoutEditorCancelButton) {
        loadoutEditorCancelButton.addEventListener('click', () => closeLoadoutEditor());
    }
    if (loadoutEditorCloseButton) {
        loadoutEditorCloseButton.addEventListener('click', () => closeLoadoutEditor());
    }
    if (loadoutEditorBackdrop) {
        loadoutEditorBackdrop.addEventListener('click', () => closeLoadoutEditor());
    }
    if (loadoutEditorModal) {
        loadoutEditorModal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeLoadoutEditor();
            }
        });
    }
    const instructionsEl = document.getElementById('instructions');
    const instructionPanelsEl = document.getElementById('instructionPanels');
    const instructionButtonBar = document.getElementById('instructionButtonBar');
    const controlsToggleButton = document.getElementById('controlsToggleButton');
    const flightControlsSection = document.getElementById('flightControlsSection');
    const infoModal = document.getElementById('infoModal');
    const infoModalBody = document.getElementById('infoModalBody');
    const infoModalTitle = document.getElementById('infoModalTitle');
    const infoModalCloseButton = document.getElementById('infoModalClose');
    const settingsButton = document.getElementById('settingsButton');
    const settingsDrawer = document.getElementById('settingsDrawer');
    const settingsCloseButton = document.getElementById('settingsCloseButton');
    const masterVolumeSlider = document.getElementById('masterVolumeSlider');
    const masterVolumeValue = document.getElementById('masterVolumeValue');
    const musicToggle = document.getElementById('musicToggle');
    const musicToggleStatus = document.getElementById('musicToggleStatus');
    const sfxToggle = document.getElementById('sfxToggle');
    const sfxToggleStatus = document.getElementById('sfxToggleStatus');
    const reducedEffectsToggle = document.getElementById('reducedEffectsToggle');
    const reducedEffectsStatus = document.getElementById('reducedEffectsStatus');
    const difficultySelector = document.getElementById('difficultySelector');
    const difficultyRadios = difficultySelector
        ? Array.from(difficultySelector.querySelectorAll('input[name="difficultySetting"]'))
        : [];
    const difficultyDescriptionEl = document.getElementById('difficultyDescription');
    const bodyElement = document.body;
    let reducedEffectsMode = false;
    let manualReducedEffectsEnabled = false;
    let autoReducedEffectsEnabled = false;
    const PERFORMANCE_SAMPLE_SIZE = 45;
    const AUTO_REDUCED_EFFECTS_ENABLE_THRESHOLD = 1000 / 35;
    const AUTO_REDUCED_EFFECTS_DISABLE_THRESHOLD = 1000 / 50;
    const AUTO_REDUCED_EFFECTS_TRIGGER_DURATION = 800;
    const AUTO_REDUCED_EFFECTS_RECOVERY_DURATION = 1600;
    const AUTO_REDUCED_EFFECTS_MANUAL_COOLDOWN = 6000;
    const AUTO_REDUCED_EFFECTS_CHANGE_COOLDOWN = 4000;
    const MAX_FRAME_SAMPLE_MS = 160;
    const performanceMonitor = {
        lastTimestamp: null,
        samples: [],
        sampleSum: 0,
        slowTimer: 0,
        recoveryTimer: 0,
        cooldownUntil: 0
    };
    let reducedMotionListenerCleanup = null;
    const instructionButtons = instructionButtonBar
        ? Array.from(
              instructionButtonBar.querySelectorAll('button[data-panel-target]')
          ).filter((button) => button instanceof HTMLElement)
        : [];
    const coarsePointerQuery =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(pointer: coarse)')
            : null;
    let isTouchInterface = coarsePointerQuery?.matches ?? ('ontouchstart' in window);

    function getPauseOverlayContent(reason = lastPauseReason) {
        const touchResume = isTouchInterface ? 'Tap Resume' : 'Press Resume or P';
        const controllerResume = isTouchInterface
            ? 'Tap Resume or press Start on your controller'
            : 'Press Resume or the Start/Options button on your controller';

        switch (reason) {
            case 'gamepad':
                return {
                    message: 'Flight paused by your controller.',
                    hint: `${controllerResume} to continue your run.`
                };
            case 'hidden':
                return {
                    message: 'Flight paused while the game was in the background.',
                    hint: `${touchResume} when you are ready to rejoin the action.`
                };
            case 'blur':
                return {
                    message: 'Flight paused when the window lost focus.',
                    hint: `${touchResume} to continue your run.`
                };
            case 'tutorial':
                return {
                    message: 'Training flight paused.',
                    hint: `${touchResume} after reviewing your mission briefing.`
                };
            default:
                return {
                    message: 'Flight paused.',
                    hint: `${touchResume} to continue your run.`
                };
        }
    }

    function updatePauseOverlayContent(reason = lastPauseReason) {
        if (!pauseOverlay) {
            return;
        }
        const { message, hint } = getPauseOverlayContent(reason);
        if (pauseMessageEl) {
            pauseMessageEl.textContent = message;
        }
        if (pauseHintEl) {
            if (hint) {
                pauseHintEl.textContent = hint;
                pauseHintEl.hidden = false;
                pauseHintEl.setAttribute('aria-hidden', 'false');
            } else {
                pauseHintEl.textContent = '';
                pauseHintEl.hidden = true;
                pauseHintEl.setAttribute('aria-hidden', 'true');
            }
        }
    }

    function showPauseOverlay(reason = lastPauseReason) {
        if (!pauseOverlay) {
            return;
        }
        updatePauseOverlayContent(reason);
        pauseOverlay.hidden = false;
        pauseOverlay.setAttribute('aria-hidden', 'false');
        window.requestAnimationFrame(() => {
            if (!resumeButton) {
                return;
            }
            try {
                resumeButton.focus({ preventScroll: true });
            } catch {
                resumeButton.focus();
            }
        });
    }

    function hidePauseOverlay() {
        if (!pauseOverlay) {
            return;
        }
        pauseOverlay.hidden = true;
        pauseOverlay.setAttribute('aria-hidden', 'true');
        if (pauseHintEl) {
            pauseHintEl.textContent = '';
            pauseHintEl.hidden = true;
            pauseHintEl.setAttribute('aria-hidden', 'true');
        }
        if (resumeButton && document.activeElement === resumeButton) {
            resumeButton.blur();
        }
    }
    const TOUCH_SMOOTHING_RATE = 26;
    const MOTION_SMOOTHING_RATE = 18;
    const MOTION_MAX_TILT = 45;
    const MOTION_DEADZONE = 0.1;
    const MOTION_IDLE_TIMEOUT = 750;
    const hasDeviceOrientationSupport =
        typeof window !== 'undefined' && typeof window.DeviceOrientationEvent === 'function';
    const motionInput = {
        enabled: false,
        permissionState: 'unknown',
        active: false,
        moveX: 0,
        moveY: 0,
        smoothedX: 0,
        smoothedY: 0,
        lastUpdate: 0
    };
    const getTimestamp = () =>
        typeof performance !== 'undefined' && typeof performance.now === 'function'
            ? performance.now()
            : Date.now();
    const DEBUG_OVERLAY_STORAGE_KEY = 'nyanEscape.debugOverlay';
    const TARGET_ASPECT_RATIO = 16 / 9;
    const gameShell = document.getElementById('gameShell');
    const rootElement = document.documentElement;
    const viewport = {
        width: 1280,
        height: 720,
        cssWidth: 1280,
        cssHeight: 720,
        physicalWidth: 1280,
        physicalHeight: 720,
        dpr: window.devicePixelRatio || 1
    };

    let debugOverlayEnabled = false;
    let player = null;
    const stars = [];
    const asteroids = [];
    try {
        debugOverlayEnabled = window.localStorage.getItem(DEBUG_OVERLAY_STORAGE_KEY) === '1';
    } catch {
        debugOverlayEnabled = false;
    }

    let pendingResizeFrame = null;
    let devicePixelRatioQuery = null;
    let resizeObserver = null;
    let backgroundGradient = null;
    let backgroundGradientHeight = 0;

    function parsePixelValue(value, fallback = 0) {
        const numeric = Number.parseFloat(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    }

    function updateShellScale() {
        if (!gameShell || !bodyElement) {
            shellScale = 1;
            rootElement?.style.setProperty('--shell-scale', '1');
            return;
        }

        const rootStyles = rootElement ? getComputedStyle(rootElement) : null;
        const bodyStyles = getComputedStyle(bodyElement);
        const designWidth = parsePixelValue(
            rootStyles?.getPropertyValue('--shell-width'),
            gameShell.offsetWidth || viewport.width
        );
        const designHeight = parsePixelValue(
            rootStyles?.getPropertyValue('--shell-height'),
            gameShell.offsetHeight || viewport.height
        );

        const horizontalPadding =
            parsePixelValue(bodyStyles.paddingLeft) + parsePixelValue(bodyStyles.paddingRight);
        const verticalPadding =
            parsePixelValue(bodyStyles.paddingTop) + parsePixelValue(bodyStyles.paddingBottom);

        const availableWidth = Math.max(
            0,
            (window.innerWidth || designWidth) - horizontalPadding
        );
        const availableHeight = Math.max(
            0,
            (window.innerHeight || designHeight) - verticalPadding
        );

        const widthScale = designWidth > 0 ? availableWidth / designWidth : 1;
        const heightScale = designHeight > 0 ? availableHeight / designHeight : 1;
        const scale = Math.min(widthScale, heightScale);
        shellScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
        rootElement?.style.setProperty('--shell-scale', shellScale.toString());
    }

    function measureElementSize(element) {
        if (!element) {
            return { width: 0, height: 0 };
        }
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            return { width: rect.width, height: rect.height };
        }
        const computed = window.getComputedStyle(element);
        const width = parseFloat(computed.width) || element.offsetWidth || 0;
        const height = parseFloat(computed.height) || element.offsetHeight || 0;
        return { width, height };
    }

    function updateTouchControlsLayout() {
        if (!touchControls || !canvas) {
            return;
        }

        if (motionInput.enabled) {
            return;
        }

        const viewportHeight = window.visualViewport?.height ?? window.innerHeight ?? 0;
        const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
        const canvasRect = canvas.getBoundingClientRect();
        const bottomInset = Math.max(16, viewportHeight + viewportOffsetTop - canvasRect.bottom + 16);
        touchControls.style.setProperty('--touch-bottom', `${Math.round(bottomInset)}px`);

        const spacing = Math.max(16, Math.min(canvasRect.width * 0.08, 48));

        if (joystickZone) {
            const { width: joystickWidth } = measureElementSize(joystickZone);
            const availableLeft = canvasRect.left;
            let joystickLeft;
            if (availableLeft >= joystickWidth + spacing + 16) {
                joystickLeft = availableLeft - joystickWidth - spacing;
            } else {
                joystickLeft = canvasRect.left + spacing;
                if (joystickLeft + joystickWidth > window.innerWidth - 16) {
                    joystickLeft = Math.max(16, window.innerWidth * 0.5 - joystickWidth * 0.5);
                }
            }
            touchControls.style.setProperty('--joystick-left', `${Math.round(joystickLeft)}px`);
        }

        if (fireButton) {
            const { width: fireWidth } = measureElementSize(fireButton);
            const availableRight = Math.max(0, window.innerWidth - canvasRect.right);
            if (availableRight >= fireWidth + spacing + 16) {
                const fireRight = Math.max(16, availableRight - spacing);
                touchControls.style.setProperty('--fire-right', `${Math.round(fireRight)}px`);
                touchControls.style.setProperty('--fire-left', 'auto');
            } else {
                let fireLeft = canvasRect.right - fireWidth - spacing;
                if (fireLeft < 16) {
                    fireLeft = Math.max(16, canvasRect.left + canvasRect.width - fireWidth - spacing);
                }
                if (fireLeft + fireWidth > window.innerWidth - 16) {
                    fireLeft = Math.max(16, window.innerWidth - fireWidth - 16);
                }
                touchControls.style.setProperty('--fire-left', `${Math.round(fireLeft)}px`);
                touchControls.style.setProperty('--fire-right', 'auto');
            }
        }
    }

    function updateDebugOverlay() {
        if (!debugOverlayEl) {
            return;
        }

        if (!debugOverlayEnabled) {
            debugOverlayEl.classList.add('hidden');
            debugOverlayEl.setAttribute('hidden', '');
            return;
        }

        debugOverlayEl.classList.remove('hidden');
        debugOverlayEl.removeAttribute('hidden');

        if (debugOverlayLines.logical) {
            debugOverlayLines.logical.textContent = `Logical: ${Math.round(viewport.width)} × ${Math.round(viewport.height)}`;
        }
        if (debugOverlayLines.physical) {
            debugOverlayLines.physical.textContent = `Physical: ${viewport.physicalWidth} × ${viewport.physicalHeight}`;
        }
        if (debugOverlayLines.ratio) {
            debugOverlayLines.ratio.textContent = `devicePixelRatio: ${viewport.dpr.toFixed(2)} (CSS: ${Math.round(viewport.cssWidth)} × ${Math.round(viewport.cssHeight)})`;
        }
    }

    function setDebugOverlayEnabled(enabled) {
        debugOverlayEnabled = Boolean(enabled);
        try {
            if (debugOverlayEnabled) {
                window.localStorage.setItem(DEBUG_OVERLAY_STORAGE_KEY, '1');
            } else {
                window.localStorage.removeItem(DEBUG_OVERLAY_STORAGE_KEY);
            }
        } catch {
            // Ignore storage errors
        }
        updateDebugOverlay();
    }

    function toggleDebugOverlay() {
        setDebugOverlayEnabled(!debugOverlayEnabled);
    }

    function measureAvailableCanvasSize() {
        const parent = canvas?.parentElement ?? null;
        const parentRect = parent?.getBoundingClientRect();
        const measuredWidth = Number.isFinite(parentRect?.width) ? parentRect.width : viewport.width;
        const measuredHeight = Number.isFinite(parentRect?.height) ? parentRect.height : viewport.height;
        const availableWidth = Math.max(240, Math.floor(measuredWidth));
        let availableHeight = Math.floor(measuredHeight);
        if (!Number.isFinite(availableHeight) || availableHeight <= 0) {
            const fallbackHeight = (window.innerHeight || viewport.height) - 48;
            availableHeight = Math.max(240, Math.floor(fallbackHeight));
        }
        return { width: availableWidth, height: Math.max(240, availableHeight) };
    }

    function getVerticalBleedForHeight(height) {
        const bleedRatio = config?.player?.verticalBleed ?? 0;
        const referenceHeight = Number.isFinite(height) && height > 0 ? height : config?.player?.height ?? 0;
        if (!Number.isFinite(referenceHeight) || referenceHeight <= 0 || bleedRatio <= 0) {
            return 0;
        }
        return referenceHeight * bleedRatio;
    }

    function rescaleWorld(previousWidth, previousHeight, nextWidth, nextHeight) {
        if (!previousWidth || !previousHeight || previousWidth === nextWidth || previousHeight === nextHeight) {
            return;
        }
        const scaleX = nextWidth / previousWidth;
        const scaleY = nextHeight / previousHeight;

        if (Number.isFinite(scaleX) && Number.isFinite(scaleY)) {
            if (player) {
                player.x *= scaleX;
                player.y *= scaleY;
                const verticalBleed = getVerticalBleedForHeight(player.height);
                player.x = clamp(player.x, 0, Math.max(0, nextWidth - player.width));
                player.y = clamp(
                    player.y,
                    -verticalBleed,
                    Math.max(0, nextHeight - player.height + verticalBleed)
                );
            }

            if (doubleTeamState.clone) {
                doubleTeamState.clone.x *= scaleX;
                doubleTeamState.clone.y *= scaleY;
                doubleTeamState.clone.x = clamp(
                    doubleTeamState.clone.x,
                    0,
                    Math.max(0, nextWidth - doubleTeamState.clone.width)
                );
                const verticalBleed = getVerticalBleedForHeight(doubleTeamState.clone.height);
                doubleTeamState.clone.y = clamp(
                    doubleTeamState.clone.y,
                    -verticalBleed,
                    Math.max(0, nextHeight - doubleTeamState.clone.height + verticalBleed)
                );
            }

            if (doubleTeamState.trail.length) {
                for (const point of doubleTeamState.trail) {
                    point.x *= scaleX;
                    point.y *= scaleY;
                }
            }

            for (const star of stars) {
                star.x *= scaleX;
                star.y *= scaleY;
                star.x = Math.max(-star.size, Math.min(nextWidth + star.size, star.x));
                star.y = Math.max(0, Math.min(nextHeight, star.y));
            }

            for (const asteroid of asteroids) {
                asteroid.x *= scaleX;
                asteroid.y = clamp(asteroid.y * scaleY, asteroid.radius, nextHeight - asteroid.radius);
                const maxX = nextWidth + (config?.asteroid?.clusterRadius ?? 160);
                asteroid.x = Math.min(asteroid.x, maxX);
            }
        }
    }

    function updateViewportMetrics({ preserveEntities = true } = {}) {
        if (!canvas || !ctx) {
            return;
        }

        const previousWidth = viewport.width;
        const previousHeight = viewport.height;
        updateShellScale();
        const available = measureAvailableCanvasSize();

        let cssWidth = Math.min(available.width, available.height * TARGET_ASPECT_RATIO);
        if (!Number.isFinite(cssWidth) || cssWidth <= 0) {
            cssWidth = viewport.width;
        }
        if (cssWidth < 240) {
            cssWidth = Math.min(available.width, 240);
        }
        let cssHeight = cssWidth / TARGET_ASPECT_RATIO;
        if (cssHeight > available.height) {
            cssHeight = available.height;
            cssWidth = cssHeight * TARGET_ASPECT_RATIO;
        }

        const displayWidth = Math.max(1, Math.round(cssWidth));
        const displayHeight = Math.max(1, Math.round(cssHeight));
        const dpr = Math.max(1, Math.min(4, window.devicePixelRatio || 1));
        const physicalWidth = Math.max(1, Math.round(displayWidth * dpr));
        const physicalHeight = Math.max(1, Math.round(displayHeight * dpr));

        canvas.style.width = `${displayWidth}px`;
        canvas.style.height = `${displayHeight}px`;

        if (canvas.width !== physicalWidth) {
            canvas.width = physicalWidth;
        }
        if (canvas.height !== physicalHeight) {
            canvas.height = physicalHeight;
        }

        viewport.width = displayWidth;
        viewport.height = displayHeight;
        if (previousHeight !== displayHeight) {
            backgroundGradient = null;
            backgroundGradientHeight = 0;
        }
        viewport.cssWidth = displayWidth;
        viewport.cssHeight = displayHeight;
        viewport.physicalWidth = physicalWidth;
        viewport.physicalHeight = physicalHeight;
        viewport.dpr = dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        enableHighQualitySmoothing(ctx);

        if (preserveEntities) {
            rescaleWorld(previousWidth, previousHeight, displayWidth, displayHeight);
        }

        updateTouchControlsLayout();
        updateDebugOverlay();
        refreshGamepadCursorBounds();
    }

    function requestViewportUpdate() {
        updateShellScale();
        if (pendingResizeFrame !== null) {
            return;
        }
        pendingResizeFrame = window.requestAnimationFrame(() => {
            pendingResizeFrame = null;
            updateViewportMetrics();
        });
    }

    function cleanupDevicePixelRatioWatcher() {
        if (!devicePixelRatioQuery) {
            return;
        }
        if (typeof devicePixelRatioQuery.removeEventListener === 'function') {
            devicePixelRatioQuery.removeEventListener('change', handleDevicePixelRatioChange);
        } else if (typeof devicePixelRatioQuery.removeListener === 'function') {
            devicePixelRatioQuery.removeListener(handleDevicePixelRatioChange);
        }
        devicePixelRatioQuery = null;
    }

    function cleanupResizeObserver() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
    }

    function cleanupReducedMotionPreferenceWatcher() {
        if (typeof reducedMotionListenerCleanup === 'function') {
            reducedMotionListenerCleanup();
            reducedMotionListenerCleanup = null;
        }
    }

    function handleDevicePixelRatioChange() {
        cleanupDevicePixelRatioWatcher();
        requestViewportUpdate();
        watchDevicePixelRatio();
    }

    function watchDevicePixelRatio() {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
            return;
        }
        cleanupDevicePixelRatioWatcher();
        const dpr = window.devicePixelRatio || 1;
        const query = window.matchMedia(`(resolution: ${dpr}dppx)`);
        if (typeof query.addEventListener === 'function') {
            query.addEventListener('change', handleDevicePixelRatioChange, { once: true });
        } else if (typeof query.addListener === 'function') {
            query.addListener(handleDevicePixelRatioChange);
        }
        devicePixelRatioQuery = query;
    }

    updateShellScale();
    updateViewportMetrics({ preserveEntities: false });
    refreshGamepadCursorBounds({ recenter: true });
    watchDevicePixelRatio();
    updateDebugOverlay();

    window.addEventListener('resize', requestViewportUpdate);
    window.addEventListener('orientationchange', requestViewportUpdate);
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', requestViewportUpdate);
        window.visualViewport.addEventListener('scroll', requestViewportUpdate);
    }

    if (supportsResizeObserver && canvas?.parentElement) {
        resizeObserver = new ResizeObserver(() => {
            requestViewportUpdate();
        });
        resizeObserver.observe(canvas.parentElement);
    }

    const teardownViewportWatchers = () => {
        cleanupResizeObserver();
        cleanupDevicePixelRatioWatcher();
        cleanupReducedMotionPreferenceWatcher();
    };

    window.addEventListener('beforeunload', teardownViewportWatchers);
    window.addEventListener('pagehide', (event) => {
        if (event?.persisted) {
            return;
        }
        teardownViewportWatchers();
    });

    const getLaunchControlText = () => (isTouchInterface ? 'Tap Start' : 'Press Start (Enter)');
    const getRetryControlText = () => (isTouchInterface ? 'Tap Start Again' : 'Press Start (Enter) Again');

    function refreshInteractionHints() {
        if (bodyElement) {
            bodyElement.classList.toggle('touch-enabled', isTouchInterface);
        }
        if (state.gameState === 'paused') {
            updatePauseOverlayContent();
        }
        if (mobilePreflightButton) {
            mobilePreflightButton.hidden = !isTouchInterface;
            mobilePreflightButton.setAttribute('aria-hidden', isTouchInterface ? 'false' : 'true');
            mobilePreflightButton.textContent = isTouchInterface ? 'Tap Start' : 'Press Start';
            const promptVisible = preflightPrompt && !preflightPrompt.hidden;
            mobilePreflightButton.disabled = !promptVisible || !isTouchInterface;
        }
        if (callsignHint) {
            callsignHint.textContent = isTouchInterface
                ? 'Tap Start to begin a run.'
                : 'Press Start (Enter) or click Launch to begin a run.';
        }
        updateTouchControlsLayout();
        updateMotionBodyClasses();
    }

    refreshInteractionHints();

    if (coarsePointerQuery) {
        const handleCoarsePointerChange = (event) => {
            if (isTouchInterface !== event.matches) {
                isTouchInterface = event.matches;
                refreshInteractionHints();
            }
        };
        if (typeof coarsePointerQuery.addEventListener === 'function') {
            coarsePointerQuery.addEventListener('change', handleCoarsePointerChange);
        } else if (typeof coarsePointerQuery.addListener === 'function') {
            coarsePointerQuery.addListener(handleCoarsePointerChange);
        }
    } else if (typeof window !== 'undefined') {
        window.addEventListener(
            'touchstart',
            () => {
                if (!isTouchInterface) {
                    isTouchInterface = true;
                    refreshInteractionHints();
                }
            },
            { once: true, passive: true }
        );
    }
    let activeInstructionPanelId = null;
    let lastInstructionTrigger = null;

    const getInstructionPanelElement = (panelId) => {
        if (typeof panelId !== 'string' || !panelId.length) {
            return null;
        }
        const panel = document.getElementById(panelId);
        return panel instanceof HTMLElement ? panel : null;
    };

    const setInstructionButtonState = (panelId) => {
        instructionButtons.forEach((button) => {
            const targetId = button.dataset.panelTarget ?? '';
            const isActive = Boolean(panelId) && targetId === panelId;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    };

    const detachActiveInstructionPanel = () => {
        if (!activeInstructionPanelId || !instructionPanelsEl) {
            return;
        }
        const activePanel = getInstructionPanelElement(activeInstructionPanelId);
        if (activePanel && infoModalBody?.contains(activePanel)) {
            activePanel.setAttribute('hidden', '');
            instructionPanelsEl.appendChild(activePanel);
        }
    };

    const getModalFocusableElements = () => {
        if (!infoModal) {
            return [];
        }
        const nodes = infoModal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(nodes).filter(
            (node) =>
                node instanceof HTMLElement &&
                !node.hasAttribute('disabled') &&
                node.getAttribute('aria-hidden') !== 'true'
        );
    };

    const closeInstructionModal = () => {
        if (!infoModal || !instructionPanelsEl || !infoModalBody) {
            return;
        }
        detachActiveInstructionPanel();
        activeInstructionPanelId = null;
        infoModal.setAttribute('hidden', '');
        infoModal.removeAttribute('data-active-panel');
        instructionsEl?.removeAttribute('data-active-panel');
        bodyElement.classList.remove('info-modal-open');
        setInstructionButtonState(null);
        if (lastInstructionTrigger instanceof HTMLElement) {
            lastInstructionTrigger.focus();
        }
        lastInstructionTrigger = null;
    };

    const openInstructionModal = (panelId, triggerButton) => {
        if (!infoModal || !infoModalBody || !instructionPanelsEl) {
            return;
        }
        const panel = getInstructionPanelElement(panelId);
        if (!panel) {
            return;
        }

        if (triggerButton instanceof HTMLElement) {
            lastInstructionTrigger = triggerButton;
        }

        detachActiveInstructionPanel();
        infoModalBody.appendChild(panel);
        panel.removeAttribute('hidden');
        infoModalBody.scrollTop = 0;
        activeInstructionPanelId = panelId;
        infoModal.removeAttribute('hidden');
        infoModal.setAttribute('data-active-panel', panelId);
        instructionsEl?.setAttribute('data-active-panel', panelId);
        bodyElement.classList.add('info-modal-open');
        setInstructionButtonState(panelId);

        const panelHeading = panel.querySelector('.card-title') || panel.querySelector('h2');
        const buttonLabel = triggerButton?.textContent?.trim() ?? '';
        const resolvedTitle = (panelHeading?.textContent || buttonLabel || 'Panel').trim();
        if (infoModalTitle) {
            infoModalTitle.textContent = resolvedTitle;
        }
        infoModal.setAttribute('aria-label', resolvedTitle);

        const focusTarget =
            infoModalCloseButton instanceof HTMLElement ? infoModalCloseButton : infoModal;
        focusTarget.focus();
    };

    if (instructionButtons.length && instructionPanelsEl && infoModal && infoModalBody) {
        instructionButtons.forEach((button) => {
            button.setAttribute('aria-pressed', 'false');
            button.addEventListener('click', () => {
                const targetId = button.dataset.panelTarget;
                if (!targetId) {
                    return;
                }
                if (activeInstructionPanelId === targetId) {
                    closeInstructionModal();
                } else {
                    openInstructionModal(targetId, button);
                }
            });
        });

        infoModalCloseButton?.addEventListener('click', () => {
            closeInstructionModal();
        });

        infoModal.addEventListener('click', (event) => {
            if (event.target === infoModal) {
                closeInstructionModal();
            }
        });

        infoModal.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeInstructionModal();
                return;
            }
            if (event.key === 'Tab' && activeInstructionPanelId) {
                const focusable = getModalFocusableElements();
                if (!focusable.length) {
                    event.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                const activeElement = document.activeElement;
                if (event.shiftKey) {
                    if (!infoModal.contains(activeElement) || activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    }
                } else if (activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && activeInstructionPanelId && !event.defaultPrevented) {
                event.preventDefault();
                closeInstructionModal();
            }
        });
    }

    if (controlsToggleButton && flightControlsSection) {
        const setFlightControlsVisibility = (visible) => {
            const shouldShow = Boolean(visible);
            flightControlsSection.hidden = !shouldShow;
            controlsToggleButton.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
            controlsToggleButton.textContent = shouldShow ? 'Hide Controls' : 'Show Controls';
        };

        setFlightControlsVisibility(false);

        controlsToggleButton.addEventListener('click', () => {
            const isExpanded = controlsToggleButton.getAttribute('aria-expanded') === 'true';
            setFlightControlsVisibility(!isExpanded);
        });
    }

    function updateSocialFeedPanel() {}

    function addSocialMoment() {}

    const intelLoreEntries = [
        {
            id: 'mission',
            unlockMs: 0,
            title: 'Mission Uplink',
            text:
                'Station Echo routed all evac beacons through your hull. Keep combos alive to project a safe corridor.',
            lockedHint: ''
        },
        {
            id: 'allySignal',
            unlockMs: 20000,
            title: 'Ally Ping',
            text:
                'Pixel spotted supply pods shadowing the convoy. Collect Points fast and the pods will spill power cores.',
            lockedHint: 'Survive 00:20 to decode Aurora’s priority feed.'
        },
        {
            id: 'syndicateIntel',
            unlockMs: 40000,
            title: 'Syndicate Patterns',
            text:
                'Gravity Syndicate wings stagger volleys—dash diagonally after each shot to bait their aim wide.',
            lockedHint: 'Last 00:40 to crack the Syndicate firing matrix.'
        },
        {
            id: 'reclaimerBrief',
            unlockMs: 70000,
            title: 'Void Reclaimer Brief',
            text:
                'Void Reclaimers absorb stray bolts until Hyper Beam charge hits 60%. Ride power cores and dump the beam point-blank.',
            lockedHint: 'Endure 01:10 and Aurora will transmit Reclaimer weak points.'
        },
        {
            id: 'convoyHope',
            unlockMs: 100000,
            title: 'Convoy Hope',
            text:
                'Colonists have begun their burn toward daylight. Every extra second you survive widens their escape corridor.',
            lockedHint: 'Hold for 01:40 to hear the convoy break radio silence.'
        }
    ];

    function formatLoreUnlock(ms) {
        const totalSeconds = Math.max(0, Math.round(ms / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    intelLoreEntries.forEach((entry) => {
        if (entry.unlockMs === 0) {
            entry.unlocked = true;
        }
    });

    function renderIntelLog() {
        if (!intelLogEl) {
            return;
        }
        intelLogEl.innerHTML = '';
        for (const entry of intelLoreEntries) {
            const item = document.createElement('li');
            const unlocked = Boolean(entry.unlocked || entry.unlockMs === 0);
            item.classList.toggle('locked', !unlocked);
            const title = document.createElement('p');
            title.className = 'intel-title';
            title.textContent = entry.title;
            const body = document.createElement('p');
            body.className = 'intel-text';
            if (unlocked) {
                body.textContent = entry.text;
            } else {
                const hint = entry.lockedHint || `Survive ${formatLoreUnlock(entry.unlockMs)} to decode.`;
                body.textContent = hint;
            }
            item.appendChild(title);
            item.appendChild(body);
            intelLogEl.appendChild(item);
        }
    }

    let storedLoreProgressMs = 0;

    function updateIntelLore(currentTimeMs) {
        if (!intelLoreEntries.length) {
            return;
        }
        const effectiveTime = Math.max(currentTimeMs ?? 0, storedLoreProgressMs ?? 0);
        let updated = false;
        for (const entry of intelLoreEntries) {
            if (!entry.unlocked && effectiveTime >= entry.unlockMs) {
                entry.unlocked = true;
                updated = true;
            }
        }
        if (updated) {
            storedLoreProgressMs = Math.max(storedLoreProgressMs, effectiveTime);
            renderIntelLog();
            if (storageAvailable) {
                writeStorage(STORAGE_KEYS.loreProgress, String(storedLoreProgressMs));
            }
        }
    }

    renderIntelLog();

    const hudCache = {
        score: '',
        nyan: '',
        comboMultiplier: '',
        bestTailLength: '',
        marketCap: '',
        volume: '',
        powerUps: ''
    };
    let lastComboPercent = -1;
    let lastFormattedTimer = '';

    const isCanvasElement =
        typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement;

    if (!isCanvasElement || !ctx) {
        console.error('Unable to initialize the Nyan Escape flight deck: canvas support is unavailable.');

        loadingScreen?.classList.add('hidden');
        if (overlay) {
            overlay.classList.add('unsupported');
        }
        if (overlayTitle) {
            overlayTitle.textContent = 'Flight Deck Unsupported';
        }
        if (overlayMessage) {
            overlayMessage.textContent =
                'Your current browser is missing HTML canvas support, so Nyan Escape cannot launch. ' +
                'Try again with a modern browser to enter the cosmic corridor.';
        }
        if (overlayButton) {
            overlayButton.textContent = 'Unavailable';
            overlayButton.setAttribute('aria-disabled', 'true');
            overlayButton.disabled = true;
            if (overlayButton.dataset.launchMode) {
                delete overlayButton.dataset.launchMode;
            }
        }
        if (intelLogEl) {
            intelLogEl.innerHTML = '';
            const item = document.createElement('li');
            item.classList.add('locked');
            const title = document.createElement('p');
            title.className = 'intel-title';
            title.textContent = 'Flight Status Offline';
            const body = document.createElement('p');
            body.className = 'intel-text';
            body.textContent =
                'Canvas rendering is disabled. Upgrade your browser to restore full mission control visuals.';
            item.appendChild(title);
            item.appendChild(body);
            intelLogEl.appendChild(item);
        }

        return;
    }

    if (loadingImageEl) {
        const defaultLogo = loadingImageEl.getAttribute('src') || 'assets/logo.png';
        const loadingLogoConfig = resolveAssetConfig(assetOverrides.loadingLogo, defaultLogo);
        if (typeof loadingLogoConfig === 'string') {
            loadingImageEl.src = loadingLogoConfig;
        } else if (loadingLogoConfig && typeof loadingLogoConfig === 'object') {
            if (loadingLogoConfig.crossOrigin === true) {
                loadingImageEl.crossOrigin = 'anonymous';
            } else if (typeof loadingLogoConfig.crossOrigin === 'string' && loadingLogoConfig.crossOrigin) {
                loadingImageEl.crossOrigin = loadingLogoConfig.crossOrigin;
            }
            if (typeof loadingLogoConfig.src === 'string' && loadingLogoConfig.src) {
                loadingImageEl.src = loadingLogoConfig.src;
            }
        }
    }

    function createCanvasTexture(width, height, draw) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) {
            return null;
        }
        enableHighQualitySmoothing(context);
        draw(context, width, height);
        return canvas.toDataURL('image/png');
    }

    function loadImageWithFallback(config, fallbackFactory) {
        const image = new Image();
        image.decoding = 'async';

        let src = null;
        let fallbackSrc = null;

        if (typeof config === 'string') {
            src = config;
        } else if (config && typeof config === 'object') {
            if (config.crossOrigin === true) {
                image.crossOrigin = 'anonymous';
            } else if (typeof config.crossOrigin === 'string' && config.crossOrigin) {
                image.crossOrigin = config.crossOrigin;
            }

            if (typeof config.src === 'string' && config.src) {
                src = config.src;
            }

            if (typeof config.fallback === 'string' && config.fallback) {
                fallbackSrc = config.fallback;
            }
        }

        if (!fallbackSrc && typeof fallbackFactory === 'function') {
            fallbackSrc = fallbackFactory() ?? null;
        }

        const assignFallback = () => {
            if (fallbackSrc) {
                image.src = fallbackSrc;
            } else if (!src) {
                image.removeAttribute('src');
            }
        };

        if (fallbackSrc && src && src !== fallbackSrc) {
            const handleError = () => {
                image.removeEventListener('error', handleError);
                assignFallback();
            };
            image.addEventListener('error', handleError, { once: true });
        }

        if (src) {
            image.src = src;
        } else {
            assignFallback();
        }

        return image;
    }

    function createCollectibleFallbackDataUrl(tier) {
        const size = 128;
        const font = '700 28px "Segoe UI", Tahoma, sans-serif';
        return (
            createCanvasTexture(size, size, (context, width, height) => {
                context.clearRect(0, 0, width, height);
                const center = width / 2;
                const radius = width * 0.42;
                const glow = tier?.glow ?? {};
                const innerGlow = glow.inner ?? 'rgba(255, 255, 255, 0.95)';
                const outerGlow = glow.outer ?? 'rgba(255, 215, 0, 0.28)';
                const gradient = context.createRadialGradient(
                    center,
                    center,
                    radius * 0.2,
                    center,
                    center,
                    radius
                );
                gradient.addColorStop(0, innerGlow);
                gradient.addColorStop(1, outerGlow);
                context.fillStyle = gradient;
                context.beginPath();
                context.arc(center, center, radius, 0, Math.PI * 2);
                context.fill();
                context.lineWidth = 4;
                context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                context.stroke();
                const label = tier?.label ?? 'POINT';
                context.font = font;
                context.textAlign = 'center';
                context.textBaseline = 'middle';
                context.fillStyle = 'rgba(15, 23, 42, 0.82)';
                context.fillText(label, center, center);
            }) ?? tier?.src
        );
    }

    function createAsteroidFallbackDataUrl(seed = 0) {
        const size = 196;
        return createCanvasTexture(size, size, (context, width, height) => {
            context.clearRect(0, 0, width, height);
            context.save();
            context.translate(width / 2, height / 2);
            const radius = width * 0.42;
            const sides = 9;
            context.beginPath();
            for (let i = 0; i < sides; i++) {
                const angle = (i / sides) * Math.PI * 2;
                const noise = 0.74 + (Math.sin(angle * (seed + 2.3)) + 1) * 0.12;
                const r = radius * noise;
                const x = Math.cos(angle) * r;
                const y = Math.sin(angle) * r;
                if (i === 0) {
                    context.moveTo(x, y);
                } else {
                    context.lineTo(x, y);
                }
            }
            context.closePath();
            const gradient = context.createRadialGradient(0, -radius * 0.25, radius * 0.15, 0, 0, radius);
            gradient.addColorStop(0, '#f8fafc');
            gradient.addColorStop(0.6, '#a1a1aa');
            gradient.addColorStop(1, '#4b5563');
            context.fillStyle = gradient;
            context.fill();
            context.lineWidth = 6;
            context.strokeStyle = 'rgba(15, 23, 42, 0.45)';
            context.stroke();

            const craterCount = 3 + (seed % 3);
            for (let i = 0; i < craterCount; i++) {
                const angle = (i / craterCount) * Math.PI * 2;
                const distance = radius * 0.45;
                const cx = Math.cos(angle + seed) * distance * 0.55;
                const cy = Math.sin(angle * 1.2 + seed) * distance * 0.55;
                const craterRadius = radius * (0.12 + (i / (craterCount + 2)) * 0.12);
                const craterGradient = context.createRadialGradient(
                    cx,
                    cy,
                    craterRadius * 0.15,
                    cx,
                    cy,
                    craterRadius
                );
                craterGradient.addColorStop(0, 'rgba(226, 232, 240, 0.7)');
                craterGradient.addColorStop(1, 'rgba(15, 23, 42, 0.7)');
                context.fillStyle = craterGradient;
                context.beginPath();
                context.arc(cx, cy, craterRadius, 0, Math.PI * 2);
                context.fill();
            }
            context.restore();
        });
    }

    function createPlayerFallbackDataUrl() {
        const width = 160;
        const height = 120;
        return createCanvasTexture(width, height, (context) => {
            const gradient = context.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#38bdf8');
            gradient.addColorStop(1, '#6366f1');
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);

            context.fillStyle = 'rgba(15, 23, 42, 0.65)';
            context.beginPath();
            context.moveTo(width * 0.22, height * 0.78);
            context.lineTo(width * 0.5, height * 0.18);
            context.lineTo(width * 0.78, height * 0.78);
            context.closePath();
            context.fill();

            context.fillStyle = '#fdf4ff';
            context.beginPath();
            context.ellipse(width * 0.5, height * 0.58, width * 0.28, height * 0.2, 0, 0, Math.PI * 2);
            context.fill();
        });
    }

    function createPlayerVariantDataUrl(variant) {
        const width = 160;
        const height = 120;
        const palettes = {
            default: {
                baseStart: '#38bdf8',
                baseEnd: '#6366f1',
                accent: '#fdf4ff',
                visor: 'rgba(15, 23, 42, 0.65)',
                glow: 'rgba(125, 211, 252, 0.35)'
            },
            midnight: {
                baseStart: '#0f172a',
                baseEnd: '#4338ca',
                accent: '#c7d2fe',
                visor: 'rgba(12, 19, 38, 0.75)',
                glow: 'rgba(147, 197, 253, 0.28)'
            },
            sunrise: {
                baseStart: '#fb7185',
                baseEnd: '#f97316',
                accent: '#fff7ed',
                visor: 'rgba(88, 28, 28, 0.6)',
                glow: 'rgba(252, 211, 77, 0.3)'
            },
            starlight: {
                baseStart: '#38bdf8',
                baseEnd: '#c084fc',
                accent: '#fef9ff',
                visor: 'rgba(30, 64, 175, 0.6)',
                glow: 'rgba(192, 132, 252, 0.38)'
            },
            ionShroud: {
                baseStart: '#1f2937',
                baseEnd: '#22d3ee',
                accent: '#cffafe',
                visor: 'rgba(12, 74, 110, 0.75)',
                glow: 'rgba(56, 189, 248, 0.4)'
            },
            embercore: {
                baseStart: '#7c2d12',
                baseEnd: '#f97316',
                accent: '#fde68a',
                visor: 'rgba(69, 10, 10, 0.78)',
                glow: 'rgba(249, 115, 22, 0.45)'
            }
        };
        const palette = palettes[variant] ?? palettes.default;
        return createCanvasTexture(width, height, (context) => {
            const gradient = context.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, palette.baseStart);
            gradient.addColorStop(1, palette.baseEnd);
            context.fillStyle = gradient;
            context.fillRect(0, 0, width, height);

            context.fillStyle = palette.visor;
            context.beginPath();
            context.moveTo(width * 0.22, height * 0.78);
            context.lineTo(width * 0.5, height * 0.18);
            context.lineTo(width * 0.78, height * 0.78);
            context.closePath();
            context.fill();

            if (palette.glow) {
                const glowGradient = context.createRadialGradient(
                    width * 0.5,
                    height * 0.52,
                    height * 0.12,
                    width * 0.5,
                    height * 0.52,
                    height * 0.4
                );
                glowGradient.addColorStop(0, palette.glow);
                glowGradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
                context.fillStyle = glowGradient;
                context.beginPath();
                context.ellipse(width * 0.5, height * 0.58, width * 0.32, height * 0.26, 0, 0, Math.PI * 2);
                context.fill();
            }

            context.fillStyle = palette.accent;
            context.beginPath();
            context.ellipse(width * 0.5, height * 0.58, width * 0.28, height * 0.2, 0, 0, Math.PI * 2);
            context.fill();
        });
    }

    const playerSkinOverrides =
        isPlainObject(cosmeticOverrides?.skins) && cosmeticOverrides.skins
            ? cosmeticOverrides.skins
            : {};
    const DEFAULT_PLAYER_SKIN_ID = 'default';
    const playerSkinBaseSources = {
        default: 'assets/player.png',
        midnight: 'assets/player2.png',
        sunrise: 'assets/player3.png'
    };
    const playerSkinImages = new Map();
    let activePlayerImage = null;

    function resolvePlayerSkinAsset(id) {
        const normalizedId = typeof id === 'string' && id ? id : DEFAULT_PLAYER_SKIN_ID;
        return resolveAssetConfig(playerSkinOverrides?.[normalizedId], playerSkinBaseSources[normalizedId] ?? null);
    }

    function getPlayerSkinImage(id) {
        const normalizedId = typeof id === 'string' && id ? id : DEFAULT_PLAYER_SKIN_ID;
        if (!playerSkinImages.has(normalizedId)) {
            const assetConfig = resolvePlayerSkinAsset(normalizedId);
            playerSkinImages.set(
                normalizedId,
                loadImageWithFallback(assetConfig, () => createPlayerVariantDataUrl(normalizedId))
            );
        }
        return playerSkinImages.get(normalizedId);
    }

    function setActivePlayerSkinById(id) {
        const normalizedId = typeof id === 'string' && id ? id : DEFAULT_PLAYER_SKIN_ID;
        activePlayerImage = getPlayerSkinImage(normalizedId);
        return activePlayerImage;
    }

    setActivePlayerSkinById(DEFAULT_PLAYER_SKIN_ID);

    const villainFallbackPalette = ['#f472b6', '#34d399', '#fde68a'];
    function createVillainFallbackDataUrl(index = 0) {
        const size = 128;
        const baseColor = villainFallbackPalette[index % villainFallbackPalette.length];
        return createCanvasTexture(size, size, (context, width, height) => {
            context.clearRect(0, 0, width, height);
            context.save();
            context.translate(width / 2, height / 2);
            context.rotate((index % 4) * Math.PI * 0.12);
            const gradient = context.createLinearGradient(-width / 2, -height / 2, width / 2, height / 2);
            gradient.addColorStop(0, baseColor);
            gradient.addColorStop(1, '#111827');
            context.fillStyle = gradient;
            context.beginPath();
            context.moveTo(0, -height * 0.38);
            context.lineTo(width * 0.32, 0);
            context.lineTo(0, height * 0.38);
            context.lineTo(-width * 0.32, 0);
            context.closePath();
            context.fill();
            context.strokeStyle = 'rgba(15, 23, 42, 0.65)';
            context.lineWidth = 6;
            context.stroke();

            context.fillStyle = 'rgba(15, 23, 42, 0.75)';
            context.beginPath();
            context.arc(0, 0, width * 0.14, 0, Math.PI * 2);
            context.fill();
            context.restore();
        });
    }

    const fallbackFontStack = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
    const customFontFamily = 'Flight Time';
    const primaryFontStack = customFontFamily
        ? `"${customFontFamily}", ${fallbackFontStack}`
        : fallbackFontStack;
    const fontsReady = customFontFamily ? loadCustomFont(customFontFamily) : Promise.resolve();

    const STORAGE_KEYS = {
        playerName: 'nyanEscape.playerName',
        highScores: 'nyanEscape.highScores',
        leaderboard: 'nyanEscape.leaderboard',
        submissionLog: 'nyanEscape.submissionLog',
        loreProgress: 'nyanEscape.loreProgress',
        firstRunComplete: 'nyanEscape.firstRunComplete',
        settings: 'nyanEscape.settings',
        challenges: 'nyanEscape.challenges',
        deviceId: 'nyanEscape.deviceId',
        customLoadouts: 'nyanEscape.customLoadouts',
        metaProgress: 'nyanEscape.metaProgress'
    };

    let storageAvailable = false;
    try {
        const testKey = '__nyanEscapeTest__';
        localStorage.setItem(testKey, '1');
        localStorage.removeItem(testKey);
        storageAvailable = true;
    } catch (error) {
        storageAvailable = false;
    }

    function readStorage(key) {
        if (!storageAvailable) return null;
        try {
            return localStorage.getItem(key);
        } catch (error) {
            storageAvailable = false;
            return null;
        }
    }

    function writeStorage(key, value) {
        if (!storageAvailable) return;
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            storageAvailable = false;
        }
    }

    const CUSTOM_LOADOUT_VERSION = 1;
    const CUSTOM_LOADOUT_SLOTS = [
        { slot: 'slotA', defaultName: 'Custom Loadout A' },
        { slot: 'slotB', defaultName: 'Custom Loadout B' }
    ];
    const MAX_LOADOUT_NAME_LENGTH = 32;

    function sanitizeLoadoutName(name, fallback) {
        const base = typeof name === 'string' ? name.trim() : '';
        if (!base) {
            return fallback;
        }
        return base.slice(0, MAX_LOADOUT_NAME_LENGTH);
    }

    function createDefaultCustomLoadout(slotMeta, index = 0) {
        const fallbackName = slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
        return {
            slot: slotMeta?.slot ?? `slot${index + 1}`,
            name: fallbackName,
            characterId: 'nova',
            weaponId: 'pulse',
            skinId: 'default',
            trailId: 'rainbow'
        };
    }

    function coerceLoadoutRecord(entry, fallback, slotMeta, index) {
        const base = fallback ?? createDefaultCustomLoadout(slotMeta, index);
        if (!entry || typeof entry !== 'object') {
            return { ...base };
        }
        const slotId = slotMeta?.slot ?? base.slot;
        const defaultName = slotMeta?.defaultName ?? base.name;
        return {
            slot: slotId,
            name: sanitizeLoadoutName(entry.name, defaultName),
            characterId:
                typeof entry.characterId === 'string' && entry.characterId
                    ? entry.characterId
                    : base.characterId,
            weaponId:
                typeof entry.weaponId === 'string' && entry.weaponId ? entry.weaponId : base.weaponId,
            skinId: typeof entry.skinId === 'string' && entry.skinId ? entry.skinId : base.skinId,
            trailId: typeof entry.trailId === 'string' && entry.trailId ? entry.trailId : base.trailId
        };
    }

    function loadCustomLoadouts() {
        const defaults = CUSTOM_LOADOUT_SLOTS.map((slotMeta, index) =>
            createDefaultCustomLoadout(slotMeta, index)
        );
        if (!storageAvailable) {
            return defaults;
        }
        const raw = readStorage(STORAGE_KEYS.customLoadouts);
        if (!raw) {
            return defaults;
        }
        try {
            const parsed = JSON.parse(raw);
            const slots = Array.isArray(parsed?.slots) ? parsed.slots : [];
            const sanitized = CUSTOM_LOADOUT_SLOTS.map((slotMeta, index) => {
                const match =
                    slots.find((entry) => entry && typeof entry.slot === 'string' && entry.slot === slotMeta.slot) ??
                    slots[index];
                return coerceLoadoutRecord(match, defaults[index], slotMeta, index);
            });
            return sanitized;
        } catch (error) {
            return defaults;
        }
    }

    function persistCustomLoadouts(loadouts = customLoadouts) {
        if (!storageAvailable) {
            return;
        }
        const payload = {
            version: CUSTOM_LOADOUT_VERSION,
            slots: Array.isArray(loadouts)
                ? loadouts.map((entry, index) => {
                      const slotMeta = CUSTOM_LOADOUT_SLOTS[index] ?? null;
                      const expectedSlot = slotMeta?.slot ?? entry?.slot ?? `slot${index + 1}`;
                      const defaultName = slotMeta?.defaultName ?? entry?.name ?? `Custom Loadout ${index + 1}`;
                      return {
                          slot: expectedSlot,
                          name: sanitizeLoadoutName(entry?.name, defaultName),
                          characterId: entry?.characterId ?? 'nova',
                          weaponId: entry?.weaponId ?? 'pulse',
                          skinId: entry?.skinId ?? 'default',
                          trailId: entry?.trailId ?? 'rainbow'
                      };
                  })
                : []
        };
        writeStorage(STORAGE_KEYS.customLoadouts, JSON.stringify(payload));
    }

    let customLoadouts = loadCustomLoadouts();
    const loadoutStatusMessages = new Map();
    let latestCosmeticSnapshot = null;
    let activeLoadoutId = null;
    let suppressActiveLoadoutSync = 0;
    let loadoutEditorActiveSlotId = null;
    let loadoutEditorReturnFocus = null;
    let loadoutEditorPilotButtons = [];
    let loadoutEditorWeaponButtons = [];
    let loadoutEditorPendingCharacterId = null;
    let loadoutEditorPendingWeaponId = null;
    let loadoutEditorSkinButtons = [];
    let loadoutEditorTrailButtons = [];
    let loadoutEditorPendingSkinId = null;
    let loadoutEditorPendingTrailId = null;

    let activePilotId = pilotRoster[0]?.id ?? 'nova';
    let pendingPilotId = activePilotId;
    let activeWeaponId = 'pulse';
    let pendingWeaponId = activeWeaponId;

    function getPilotDefinition(pilotId) {
        if (pilotIndex.has(pilotId)) {
            return pilotIndex.get(pilotId);
        }
        return pilotRoster[0];
    }

    function getWeaponDefinition(weaponId) {
        if (weaponId && weaponLoadouts[weaponId]) {
            return weaponLoadouts[weaponId];
        }
        return weaponLoadouts.pulse;
    }

    function getSkinLabel(skinId) {
        return SKIN_LABELS[skinId] ?? 'Prototype Hull';
    }

    function getTrailLabel(trailId) {
        return TRAIL_LABELS[trailId] ?? 'Stellar Stream';
    }

    function getTrailGradientStyle(trailId) {
        const style = resolveTrailStyle(trailId);
        const colors = Array.isArray(style?.colors) ? style.colors : null;
        if (!colors || !colors.length) {
            return 'linear-gradient(90deg, rgba(56,189,248,0.8), rgba(99,102,241,0.8))';
        }
        const stops = colors
            .map((color, index) => {
                const percent = Math.round((index / Math.max(1, colors.length - 1)) * 100);
                return `${color} ${percent}%`;
            })
            .join(', ');
        return `linear-gradient(90deg, ${stops})`;
    }

    function ensureCosmeticsState() {
        if (!isPlainObject(state)) {
            state = { gameState: 'ready' };
        }
        if (!isPlainObject(state.cosmetics)) {
            state.cosmetics = createDefaultCosmeticsState();
            return state.cosmetics;
        }

        const defaults = createDefaultCosmeticsState();

        if (!Array.isArray(state.cosmetics.ownedSkins)) {
            state.cosmetics.ownedSkins = [...defaults.ownedSkins];
        }
        if (!Array.isArray(state.cosmetics.ownedTrails)) {
            state.cosmetics.ownedTrails = [...defaults.ownedTrails];
        }
        if (!Array.isArray(state.cosmetics.ownedWeapons)) {
            state.cosmetics.ownedWeapons = [...defaults.ownedWeapons];
        }
        if (!isPlainObject(state.cosmetics.equipped)) {
            state.cosmetics.equipped = { ...defaults.equipped };
        }
        return state.cosmetics;
    }

    function updatePilotSummary(pilot) {
        const definition = pilot ?? getPilotDefinition(activePilotId);
        if (characterSelectSummaryDescription) {
            characterSelectSummaryDescription.textContent = definition?.summary ?? '';
        }
        if (characterSelectSummaryOngoing) {
            characterSelectSummaryOngoing.innerHTML = '';
            const details = Array.isArray(definition?.highlights) ? definition.highlights : [];
            if (details.length) {
                characterSelectSummaryOngoing.hidden = false;
                characterSelectSummaryOngoing.setAttribute('aria-hidden', 'false');
                for (const item of details) {
                    const li = document.createElement('li');
                    li.textContent = item;
                    characterSelectSummaryOngoing.appendChild(li);
                }
            } else {
                characterSelectSummaryOngoing.hidden = true;
                characterSelectSummaryOngoing.setAttribute('aria-hidden', 'true');
            }
        }
    }

    function updateWeaponSelectSummary(weapon) {
        const definition = weapon ?? getWeaponDefinition(activeWeaponId);
        if (weaponSelectSummaryDescription) {
            weaponSelectSummaryDescription.textContent = definition?.description ?? '';
        }
    }

    function refreshWeaponSummary(weapon) {
        const definition = weapon ?? getWeaponDefinition(activeWeaponId);
        if (weaponSummaryName) {
            weaponSummaryName.textContent = definition?.name ?? 'Weapon Loadout';
        }
        if (weaponSummaryDescription) {
            const highlight = Array.isArray(definition?.highlights) ? definition.highlights[0] : '';
            weaponSummaryDescription.textContent = highlight || definition?.summary || '';
        }
        if (weaponSummaryImage && definition?.icon) {
            weaponSummaryImage.src = definition.icon;
            weaponSummaryImage.alt = `${definition.name ?? 'Weapon'} schematic`;
        }
    }

    function updatePreflightSummary() {
        const pilot = getPilotDefinition(activePilotId);
        const weapon = getWeaponDefinition(activeWeaponId);
        if (preflightLoadoutSummary) {
            const hasData = Boolean(pilot || weapon);
            preflightLoadoutSummary.hidden = !hasData;
            preflightLoadoutSummary.setAttribute('aria-hidden', hasData ? 'false' : 'true');
        }
        if (preflightPilotName) {
            preflightPilotName.textContent = pilot?.name ?? 'Nova';
        }
        if (preflightPilotRole) {
            preflightPilotRole.textContent = pilot?.role ?? '';
        }
        if (preflightPilotImage) {
            preflightPilotImage.src = pilot?.image ?? 'assets/player.png';
            preflightPilotImage.alt = pilot?.name ? `${pilot.name} portrait` : 'Active pilot portrait';
        }
        if (preflightWeaponName) {
            preflightWeaponName.textContent = weapon?.name ?? 'Pulse Array';
        }
        if (preflightWeaponHighlight) {
            const highlight = Array.isArray(weapon?.highlights) && weapon.highlights.length
                ? weapon.highlights[0]
                : weapon?.summary ?? '';
            preflightWeaponHighlight.textContent = highlight;
        }
        if (preflightWeaponImage) {
            preflightWeaponImage.src = weapon?.icon ?? 'assets/weapon-pulse.svg';
            preflightWeaponImage.alt = weapon?.name ? `${weapon.name} schematic` : 'Active weapon schematic';
        }
    }

    function updatePilotSelectionState() {
        const selectedId = pendingPilotId;
        for (const card of characterCards) {
            if (!(card instanceof HTMLElement)) {
                continue;
            }
            const id = card.dataset.characterId;
            card.classList.toggle('selected', id === selectedId);
        }
        const pilot = getPilotDefinition(selectedId);
        updatePilotSummary(pilot);
        if (characterSelectConfirm) {
            const disabled = !selectedId;
            characterSelectConfirm.disabled = disabled;
            characterSelectConfirm.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
    }

    function updateWeaponSelectionState() {
        const selectedId = pendingWeaponId;
        for (const card of weaponCards) {
            if (!(card instanceof HTMLElement)) {
                continue;
            }
            const id = card.dataset.weaponId;
            card.classList.toggle('selected', id === selectedId);
        }
        const weapon = getWeaponDefinition(selectedId);
        updateWeaponSelectSummary(weapon);
        if (weaponSelectConfirm) {
            const disabled = !selectedId;
            weaponSelectConfirm.disabled = disabled;
            weaponSelectConfirm.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        }
    }

    function setActivePilot(pilotId, { updatePending = true, refresh = true } = {}) {
        const definition = getPilotDefinition(pilotId);
        activePilotId = definition?.id ?? activePilotId;
        state.activePilotId = activePilotId;
        if (updatePending) {
            pendingPilotId = activePilotId;
        }
        if (refresh) {
            updatePilotSelectionState();
            renderCustomLoadoutCollections();
            updatePreflightSummary();
        }
        return definition;
    }

    function setActiveWeapon(
        weaponId,
        { updatePending = true, refresh = true, fromLoadout = false } = {}
    ) {
        const definition = getWeaponDefinition(weaponId);
        activeWeaponId = definition?.id ?? activeWeaponId;
        const cosmetics = ensureCosmeticsState();
        if (!cosmetics.ownedWeapons.includes(activeWeaponId)) {
            cosmetics.ownedWeapons.push(activeWeaponId);
        }
        cosmetics.equipped.weapon = activeWeaponId;
        synchronizeActiveWeaponLoadout(definition);
        resetWeaponPatternState(activeWeaponId);
        if (updatePending) {
            pendingWeaponId = activeWeaponId;
        }
        if (refresh) {
            updateWeaponSelectionState();
            refreshWeaponSummary(definition);
            if (!fromLoadout) {
                renderCustomLoadoutCollections();
            }
            updatePreflightSummary();
        }
        return definition;
    }

    function showLoadoutStatus(slotId, message, type = 'info') {
        if (!slotId) {
            return;
        }
        loadoutStatusMessages.set(slotId, { message, type, timestamp: Date.now() });
    }

    function buildPreviewRow({ title, value, image }) {
        const row = document.createElement('div');
        row.className = 'custom-loadout-preview-row';

        if (image) {
            const thumb = document.createElement('div');
            thumb.className = 'custom-loadout-preview-thumb';
            const img = document.createElement('img');
            img.src = image;
            img.alt = value;
            img.loading = 'lazy';
            img.decoding = 'async';
            thumb.appendChild(img);
            row.appendChild(thumb);
        }

        const info = document.createElement('div');
        info.className = 'custom-loadout-preview-info';
        const label = document.createElement('span');
        label.className = 'custom-loadout-preview-title';
        label.textContent = title;
        const val = document.createElement('span');
        val.className = 'custom-loadout-preview-value';
        val.textContent = value;
        info.appendChild(label);
        info.appendChild(val);
        row.appendChild(info);
        return row;
    }

    function buildLoadoutCard(loadout, { context = 'panel' } = {}) {
        const slotId = loadout?.slot ?? `slot-${Math.random().toString(36).slice(2)}`;
        const card = document.createElement('article');
        card.className = 'custom-loadout-card';
        card.dataset.loadoutSlot = slotId;
        if (activeLoadoutId && slotId === activeLoadoutId) {
            card.classList.add('is-active');
        }

        const pilot = getPilotDefinition(loadout?.characterId);
        const weapon = getWeaponDefinition(loadout?.weaponId);
        const skinId = loadout?.skinId ?? ensureCosmeticsState().equipped.skin;
        const trailId = loadout?.trailId ?? ensureCosmeticsState().equipped.trail;

        const header = document.createElement('div');
        header.className = 'custom-loadout-header';
        const nameField = document.createElement('div');
        nameField.className = 'custom-loadout-name-field';
        const nameLabel = document.createElement('span');
        nameLabel.className = 'custom-loadout-name-label';
        nameLabel.textContent = 'Preset';
        const nameValue = document.createElement('p');
        nameValue.className = 'custom-loadout-preview-value';
        nameValue.textContent = loadout?.name ?? 'Custom Loadout';
        nameField.appendChild(nameLabel);
        nameField.appendChild(nameValue);
        header.appendChild(nameField);

        if (context === 'panel') {
            const headerActions = document.createElement('div');
            headerActions.className = 'custom-loadout-header-actions';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'custom-loadout-edit';
            editButton.textContent = 'Edit';
            editButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openLoadoutEditor(slotId, { trigger: editButton });
            });
            headerActions.appendChild(editButton);
            header.appendChild(headerActions);
        }
        card.appendChild(header);

        const body = document.createElement('div');
        body.className = 'custom-loadout-body';
        body.appendChild(
            buildPreviewRow({ title: 'Pilot', value: pilot?.name ?? 'Nova', image: pilot?.image ?? 'assets/player.png' })
        );
        body.appendChild(
            buildPreviewRow({
                title: 'Weapon',
                value: weapon?.name ?? 'Pulse Array',
                image: weapon?.icon ?? 'assets/weapon-pulse.svg'
            })
        );

        const tags = document.createElement('div');
        tags.className = 'custom-loadout-tags';

        const skinTag = document.createElement('div');
        skinTag.className = 'custom-loadout-tag';
        const skinLabel = document.createElement('span');
        skinLabel.className = 'custom-loadout-tag-label';
        skinLabel.textContent = 'Suit';
        const skinValue = document.createElement('span');
        skinValue.className = 'custom-loadout-tag-value';
        skinValue.textContent = getSkinLabel(skinId);
        skinTag.appendChild(skinLabel);
        skinTag.appendChild(skinValue);
        tags.appendChild(skinTag);

        const trailTag = document.createElement('div');
        trailTag.className = 'custom-loadout-tag';
        const trailLabel = document.createElement('span');
        trailLabel.className = 'custom-loadout-tag-label';
        trailLabel.textContent = 'Stream';
        const trailValue = document.createElement('span');
        trailValue.className = 'custom-loadout-tag-value';
        trailValue.textContent = getTrailLabel(trailId);
        const swatch = document.createElement('span');
        swatch.className = 'custom-loadout-trail-swatch';
        swatch.style.background = getTrailGradientStyle(trailId);
        trailTag.appendChild(trailLabel);
        trailTag.appendChild(trailValue);
        trailTag.appendChild(swatch);
        tags.appendChild(trailTag);

        body.appendChild(tags);
        card.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'custom-loadout-footer';
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.className = 'custom-loadout-apply';
        applyButton.textContent = context === 'overlay' ? 'Equip Now' : 'Equip Loadout';
        applyButton.addEventListener('click', (event) => {
            event.stopPropagation();
            applyCustomLoadout(loadout);
        });
        footer.appendChild(applyButton);

        const statusMessage = document.createElement('p');
        statusMessage.className = 'custom-loadout-status';
        const status = loadoutStatusMessages.get(slotId);
        if (status) {
            statusMessage.textContent = status.message;
            if (status.type === 'success') {
                statusMessage.classList.add('success');
            } else if (status.type === 'error') {
                statusMessage.classList.add('error');
            }
        }
        footer.appendChild(statusMessage);
        card.appendChild(footer);

        card.addEventListener('click', () => {
            applyCustomLoadout(loadout);
        });

        return card;
    }

    function renderLoadoutGrid(container, context) {
        if (!(container instanceof HTMLElement)) {
            return;
        }
        container.innerHTML = '';
        const now = Date.now();
        for (const [slotKey, entry] of loadoutStatusMessages) {
            if (entry?.timestamp && now - entry.timestamp > 6000) {
                loadoutStatusMessages.delete(slotKey);
            }
        }
        const entries = Array.isArray(customLoadouts) ? customLoadouts : [];
        if (!entries.length) {
            const empty = document.createElement('p');
            empty.className = 'custom-loadout-status';
            empty.textContent = 'No custom presets saved yet.';
            container.appendChild(empty);
            return;
        }
        for (const loadout of entries) {
            const card = buildLoadoutCard(loadout, context);
            container.appendChild(card);
        }
    }

    function renderCustomLoadoutCollections() {
        renderLoadoutGrid(customLoadoutGrid, { context: 'panel' });
        renderLoadoutGrid(pilotPreviewGrid, { context: 'overlay' });
    }

    function getAllSkinOptions() {
        const cosmetics = ensureCosmeticsState();
        const owned = Array.isArray(cosmetics.ownedSkins) ? cosmetics.ownedSkins : [];
        const catalogue = Object.keys(SKIN_LABELS);
        return Array.from(new Set([...owned, ...catalogue])).map((skinId) => ({
            id: skinId,
            label: getSkinLabel(skinId)
        }));
    }

    function getAllTrailOptions() {
        const cosmetics = ensureCosmeticsState();
        const owned = Array.isArray(cosmetics.ownedTrails) ? cosmetics.ownedTrails : [];
        const catalogue = Object.keys(TRAIL_LABELS);
        return Array.from(new Set([...owned, ...catalogue])).map((trailId) => ({
            id: trailId,
            label: getTrailLabel(trailId)
        }));
    }

    function updateLoadoutEditorSummary() {
        const pilot = getPilotDefinition(loadoutEditorPendingCharacterId ?? activePilotId);
        const weapon = getWeaponDefinition(loadoutEditorPendingWeaponId ?? activeWeaponId);
        const skinLabel = getSkinLabel(loadoutEditorPendingSkinId ?? ensureCosmeticsState().equipped.skin);
        const trailLabel = getTrailLabel(loadoutEditorPendingTrailId ?? ensureCosmeticsState().equipped.trail);

        if (loadoutEditorSummaryValues.pilot) {
            loadoutEditorSummaryValues.pilot.textContent = pilot?.name ?? 'Nova';
        }
        if (loadoutEditorSummaryValues.weapon) {
            loadoutEditorSummaryValues.weapon.textContent = weapon?.name ?? 'Pulse Array';
        }
        if (loadoutEditorSummaryValues.skin) {
            loadoutEditorSummaryValues.skin.textContent = skinLabel;
        }
        if (loadoutEditorSummaryValues.trail) {
            loadoutEditorSummaryValues.trail.textContent = trailLabel;
        }
    }

    function updateLoadoutEditorPilotSelection() {
        for (const button of loadoutEditorPilotButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const selected = button.dataset.characterId === loadoutEditorPendingCharacterId;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        }
    }

    function updateLoadoutEditorWeaponSelection() {
        for (const button of loadoutEditorWeaponButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const selected = button.dataset.weaponId === loadoutEditorPendingWeaponId;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        }
    }

    function updateLoadoutEditorSkinSelection() {
        for (const button of loadoutEditorSkinButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const selected = button.dataset.skinId === loadoutEditorPendingSkinId;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
        }
    }

    function updateLoadoutEditorTrailSelection() {
        for (const button of loadoutEditorTrailButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const selected = button.dataset.trailId === loadoutEditorPendingTrailId;
            button.classList.toggle('selected', selected);
            button.setAttribute('aria-checked', selected ? 'true' : 'false');
        }
    }

    function refreshLoadoutEditorSelectionState() {
        updateLoadoutEditorPilotSelection();
        updateLoadoutEditorWeaponSelection();
        updateLoadoutEditorSkinSelection();
        updateLoadoutEditorTrailSelection();
        updateLoadoutEditorSummary();
    }

    function renderLoadoutEditorPilotGrid() {
        if (!(loadoutEditorPilotGrid instanceof HTMLElement)) {
            return;
        }
        loadoutEditorPilotButtons = [];
        loadoutEditorPilotGrid.innerHTML = '';
        for (const pilot of pilotRoster) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'character-card';
            button.dataset.characterId = pilot.id;

            const img = document.createElement('img');
            img.src = pilot.image;
            img.alt = `${pilot.name} portrait`;
            img.loading = 'lazy';
            img.decoding = 'async';
            button.appendChild(img);

            const name = document.createElement('span');
            name.className = 'character-name';
            name.textContent = pilot.name;
            button.appendChild(name);

            const role = document.createElement('span');
            role.className = 'character-role';
            role.textContent = pilot.role;
            button.appendChild(role);

            if (Array.isArray(pilot.highlights) && pilot.highlights.length) {
                const details = document.createElement('div');
                details.className = 'character-details';
                const title = document.createElement('strong');
                title.textContent = 'Flight notes';
                const list = document.createElement('ul');
                for (const entry of pilot.highlights) {
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(title);
                details.appendChild(list);
                button.appendChild(details);
            }

            button.addEventListener('click', () => {
                loadoutEditorPendingCharacterId = pilot.id;
                refreshLoadoutEditorSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    loadoutEditorPendingCharacterId = pilot.id;
                    refreshLoadoutEditorSelectionState();
                }
            });

            loadoutEditorPilotGrid.appendChild(button);
            loadoutEditorPilotButtons.push(button);
        }
        refreshLoadoutEditorSelectionState();
    }

    function renderLoadoutEditorWeaponGrid() {
        if (!(loadoutEditorWeaponGrid instanceof HTMLElement)) {
            return;
        }
        loadoutEditorWeaponButtons = [];
        loadoutEditorWeaponGrid.innerHTML = '';
        for (const weapon of Object.values(weaponLoadouts)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'character-card weapon-card';
            button.dataset.weaponId = weapon.id;

            if (weapon.icon) {
                const img = document.createElement('img');
                img.src = weapon.icon;
                img.alt = `${weapon.name} icon`;
                img.loading = 'lazy';
                img.decoding = 'async';
                button.appendChild(img);
            }

            const name = document.createElement('span');
            name.className = 'character-name';
            name.textContent = weapon.name;
            button.appendChild(name);

            const role = document.createElement('span');
            role.className = 'character-role';
            role.textContent = weapon.summary ?? 'Weapon Loadout';
            button.appendChild(role);

            if (Array.isArray(weapon.highlights) && weapon.highlights.length) {
                const details = document.createElement('div');
                details.className = 'character-details';
                const title = document.createElement('strong');
                title.textContent = 'Highlights';
                const list = document.createElement('ul');
                for (const entry of weapon.highlights) {
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(title);
                details.appendChild(list);
                button.appendChild(details);
            }

            button.addEventListener('click', () => {
                loadoutEditorPendingWeaponId = weapon.id;
                refreshLoadoutEditorSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    loadoutEditorPendingWeaponId = weapon.id;
                    refreshLoadoutEditorSelectionState();
                }
            });

            loadoutEditorWeaponGrid.appendChild(button);
            loadoutEditorWeaponButtons.push(button);
        }
        refreshLoadoutEditorSelectionState();
    }

    function buildLoadoutEditorOptionButton({
        id,
        label,
        type
    }) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'loadout-editor-option';
        button.setAttribute('role', 'radio');

        const thumb = document.createElement('span');
        thumb.className = 'loadout-editor-option-thumb';

        if (type === 'skin') {
            const asset = resolvePlayerSkinAsset(id);
            const src =
                (typeof asset === 'string' && asset) ||
                (asset && typeof asset === 'object' && asset.src) ||
                playerSkinBaseSources[id] ||
                playerSkinBaseSources.default;
            const img = document.createElement('img');
            img.src = src;
            img.alt = `${label} preview`;
            img.loading = 'lazy';
            img.decoding = 'async';
            thumb.appendChild(img);
        } else {
            const preview = document.createElement('span');
            preview.className = 'loadout-editor-trail-preview';
            preview.style.background = getTrailGradientStyle(id);
            thumb.appendChild(preview);
        }

        const meta = document.createElement('span');
        meta.className = 'loadout-editor-option-meta';
        const title = document.createElement('strong');
        title.textContent = label;
        const subtitle = document.createElement('span');
        subtitle.textContent = type === 'skin' ? 'Suit' : 'Stream';
        meta.appendChild(title);
        meta.appendChild(subtitle);

        button.appendChild(thumb);
        button.appendChild(meta);
        return button;
    }

    function renderLoadoutEditorSkinOptions() {
        if (!(loadoutEditorSkinGrid instanceof HTMLElement)) {
            return;
        }
        loadoutEditorSkinButtons = [];
        loadoutEditorSkinGrid.innerHTML = '';
        for (const option of getAllSkinOptions()) {
            const button = buildLoadoutEditorOptionButton({ id: option.id, label: option.label, type: 'skin' });
            button.dataset.skinId = option.id;
            button.addEventListener('click', () => {
                loadoutEditorPendingSkinId = option.id;
                refreshLoadoutEditorSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    loadoutEditorPendingSkinId = option.id;
                    refreshLoadoutEditorSelectionState();
                }
            });
            loadoutEditorSkinGrid.appendChild(button);
            loadoutEditorSkinButtons.push(button);
        }
        refreshLoadoutEditorSelectionState();
    }

    function renderLoadoutEditorTrailOptions() {
        if (!(loadoutEditorTrailGrid instanceof HTMLElement)) {
            return;
        }
        loadoutEditorTrailButtons = [];
        loadoutEditorTrailGrid.innerHTML = '';
        for (const option of getAllTrailOptions()) {
            const button = buildLoadoutEditorOptionButton({ id: option.id, label: option.label, type: 'trail' });
            button.dataset.trailId = option.id;
            button.addEventListener('click', () => {
                loadoutEditorPendingTrailId = option.id;
                refreshLoadoutEditorSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    loadoutEditorPendingTrailId = option.id;
                    refreshLoadoutEditorSelectionState();
                }
            });
            loadoutEditorTrailGrid.appendChild(button);
            loadoutEditorTrailButtons.push(button);
        }
        refreshLoadoutEditorSelectionState();
    }

    function ensureLoadoutEditorPendingValues() {
        const cosmetics = ensureCosmeticsState();
        if (!loadoutEditorPendingCharacterId) {
            loadoutEditorPendingCharacterId = activePilotId;
        }
        if (!loadoutEditorPendingWeaponId) {
            loadoutEditorPendingWeaponId = activeWeaponId;
        }
        if (!loadoutEditorPendingSkinId) {
            loadoutEditorPendingSkinId = cosmetics.equipped.skin;
        }
        if (!loadoutEditorPendingTrailId) {
            loadoutEditorPendingTrailId = cosmetics.equipped.trail;
        }
    }

    function openLoadoutEditor(slotId, { trigger } = {}) {
        if (!loadoutEditorModal) {
            return;
        }
        const loadout = getCustomLoadout(slotId);
        if (!loadout) {
            return;
        }
        loadoutEditorActiveSlotId = slotId;
        loadoutEditorReturnFocus = trigger instanceof HTMLElement ? trigger : null;
        latestCosmeticSnapshot = {
            characterId: loadout.characterId ?? activePilotId,
            weaponId: loadout.weaponId ?? activeWeaponId,
            skinId: loadout.skinId ?? ensureCosmeticsState().equipped.skin,
            trailId: loadout.trailId ?? ensureCosmeticsState().equipped.trail
        };
        loadoutEditorPendingCharacterId = latestCosmeticSnapshot.characterId;
        loadoutEditorPendingWeaponId = latestCosmeticSnapshot.weaponId;
        loadoutEditorPendingSkinId = latestCosmeticSnapshot.skinId;
        loadoutEditorPendingTrailId = latestCosmeticSnapshot.trailId;
        ensureLoadoutEditorPendingValues();

        const slotMeta = getLoadoutSlotMeta(slotId);
        if (loadoutEditorTitle) {
            const slotName = loadout?.name?.trim() || slotMeta?.defaultName || 'Custom Loadout';
            loadoutEditorTitle.textContent = `Customize ${slotName}`;
        }
        if (loadoutEditorSubtitle) {
            const slotName = slotMeta?.defaultName || slotId;
            loadoutEditorSubtitle.textContent = `Adjust the selections saved to ${slotName}. Changes are stored instantly when you save.`;
        }
        if (loadoutEditorSaveButton) {
            const saveLabel = slotMeta?.defaultName ? `Save ${slotMeta.defaultName}` : 'Save Loadout';
            loadoutEditorSaveButton.textContent = saveLabel;
        }

        renderLoadoutEditorPilotGrid();
        renderLoadoutEditorWeaponGrid();
        renderLoadoutEditorSkinOptions();
        renderLoadoutEditorTrailOptions();

        openModal(loadoutEditorModal, {
            bodyClass: 'loadout-editor-open',
            initialFocus: () =>
                loadoutEditorPilotButtons.find((button) => button.classList.contains('selected')) ??
                loadoutEditorPilotButtons[0] ??
                loadoutEditorSaveButton
        });
    }

    function closeLoadoutEditor({ restoreFocus = true } = {}) {
        if (!loadoutEditorModal) {
            return;
        }
        closeModal(loadoutEditorModal, { bodyClass: 'loadout-editor-open', restoreFocus: false });
        if (restoreFocus && loadoutEditorReturnFocus instanceof HTMLElement) {
            focusElement(loadoutEditorReturnFocus);
        }
        loadoutEditorReturnFocus = null;
        loadoutEditorActiveSlotId = null;
        latestCosmeticSnapshot = null;
    }

    function handleLoadoutEditorSave() {
        if (!loadoutEditorActiveSlotId) {
            closeLoadoutEditor();
            return;
        }
        ensureLoadoutEditorPendingValues();
        const updates = {
            characterId: loadoutEditorPendingCharacterId,
            weaponId: loadoutEditorPendingWeaponId,
            skinId: loadoutEditorPendingSkinId,
            trailId: loadoutEditorPendingTrailId
        };
        const snapshot = latestCosmeticSnapshot;
        const hasChanges =
            !snapshot ||
            snapshot.characterId !== updates.characterId ||
            snapshot.weaponId !== updates.weaponId ||
            snapshot.skinId !== updates.skinId ||
            snapshot.trailId !== updates.trailId;

        if (!hasChanges) {
            showLoadoutStatus(loadoutEditorActiveSlotId, 'Preset already up to date', 'info');
            closeLoadoutEditor();
            return;
        }

        const result = updateCustomLoadout(loadoutEditorActiveSlotId, updates);
        if (result) {
            showLoadoutStatus(loadoutEditorActiveSlotId, 'Preset saved', 'success');
            if (activeLoadoutId === loadoutEditorActiveSlotId) {
                applyCustomLoadout(result, { silent: true });
                pendingPilotId = activePilotId;
                pendingWeaponId = activeWeaponId;
                updatePilotSelectionState();
                updateWeaponSelectionState();
                refreshWeaponSummary();
                updatePreflightSummary();
            }
            renderCustomLoadoutCollections();
        } else {
            showLoadoutStatus(loadoutEditorActiveSlotId, 'Unable to save preset', 'error');
        }
        closeLoadoutEditor();
    }

    function renderPilotSelectGrid() {
        if (!(characterSelectGrid instanceof HTMLElement)) {
            return;
        }
        characterCards = [];
        characterSelectGrid.innerHTML = '';
        for (const pilot of pilotRoster) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'character-card';
            button.dataset.characterId = pilot.id;

            const img = document.createElement('img');
            img.src = pilot.image;
            img.alt = `${pilot.name} portrait`;
            img.loading = 'lazy';
            img.decoding = 'async';
            button.appendChild(img);

            const name = document.createElement('span');
            name.className = 'character-name';
            name.textContent = pilot.name;
            button.appendChild(name);

            const role = document.createElement('span');
            role.className = 'character-role';
            role.textContent = pilot.role;
            button.appendChild(role);

            if (Array.isArray(pilot.highlights) && pilot.highlights.length) {
                const details = document.createElement('div');
                details.className = 'character-details';
                const title = document.createElement('strong');
                title.textContent = 'Flight notes';
                const list = document.createElement('ul');
                for (const entry of pilot.highlights) {
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(title);
                details.appendChild(list);
                button.appendChild(details);
            }

            button.addEventListener('click', () => {
                pendingPilotId = pilot.id;
                updatePilotSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pendingPilotId = pilot.id;
                    updatePilotSelectionState();
                }
            });

            characterSelectGrid.appendChild(button);
            characterCards.push(button);
        }
        updatePilotSelectionState();
    }

    function renderWeaponSelectGrid() {
        if (!(weaponSelectGrid instanceof HTMLElement)) {
            return;
        }
        weaponCards = [];
        weaponSelectGrid.innerHTML = '';
        for (const weapon of Object.values(weaponLoadouts)) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'character-card weapon-card';
            button.dataset.weaponId = weapon.id;

            if (weapon.icon) {
                const img = document.createElement('img');
                img.src = weapon.icon;
                img.alt = `${weapon.name} icon`;
                img.loading = 'lazy';
                img.decoding = 'async';
                button.appendChild(img);
            }

            const name = document.createElement('span');
            name.className = 'character-name';
            name.textContent = weapon.name;
            button.appendChild(name);

            const role = document.createElement('span');
            role.className = 'character-role';
            role.textContent = weapon.summary ?? 'Weapon Loadout';
            button.appendChild(role);

            if (Array.isArray(weapon.highlights) && weapon.highlights.length) {
                const details = document.createElement('div');
                details.className = 'character-details';
                const title = document.createElement('strong');
                title.textContent = 'Highlights';
                const list = document.createElement('ul');
                for (const entry of weapon.highlights) {
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(title);
                details.appendChild(list);
                button.appendChild(details);
            }

            button.addEventListener('click', () => {
                pendingWeaponId = weapon.id;
                updateWeaponSelectionState();
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    pendingWeaponId = weapon.id;
                    updateWeaponSelectionState();
                }
            });

            weaponSelectGrid.appendChild(button);
            weaponCards.push(button);
        }
        updateWeaponSelectionState();
    }

    function applyCustomLoadout(loadout, { silent = false } = {}) {
        if (!loadout || typeof loadout !== 'object') {
            return;
        }
        const cosmetics = ensureCosmeticsState();
        if (loadout.skinId) {
            cosmetics.equipped.skin = loadout.skinId;
            if (!cosmetics.ownedSkins.includes(loadout.skinId)) {
                cosmetics.ownedSkins.push(loadout.skinId);
            }
            setActivePlayerSkinById(loadout.skinId);
        }
        if (loadout.trailId) {
            cosmetics.equipped.trail = loadout.trailId;
            if (!cosmetics.ownedTrails.includes(loadout.trailId)) {
                cosmetics.ownedTrails.push(loadout.trailId);
            }
            setActiveTrailStyleById(loadout.trailId);
        }
        setActivePilot(loadout.characterId ?? activePilotId, { updatePending: false, refresh: !silent });
        setActiveWeapon(loadout.weaponId ?? activeWeaponId, {
            updatePending: false,
            refresh: !silent,
            fromLoadout: true
        });
        setActiveLoadoutId(loadout.slot ?? null);
        updatePreflightSummary();
        if (!silent && loadout.slot) {
            showLoadoutStatus(loadout.slot, 'Equipped for launch', 'success');
            renderCustomLoadoutCollections();
        }
    }

    function initializeLoadoutSelections() {
        const cosmetics = ensureCosmeticsState();
        const initial = Array.isArray(customLoadouts) && customLoadouts.length ? customLoadouts[0] : null;
        if (initial) {
            activePilotId = getPilotDefinition(initial.characterId).id;
            pendingPilotId = activePilotId;
            activeWeaponId = getWeaponDefinition(initial.weaponId).id;
            pendingWeaponId = activeWeaponId;
            cosmetics.equipped.skin = initial.skinId ?? cosmetics.equipped.skin;
            cosmetics.equipped.trail = initial.trailId ?? cosmetics.equipped.trail;
            if (initial.skinId && !cosmetics.ownedSkins.includes(initial.skinId)) {
                cosmetics.ownedSkins.push(initial.skinId);
            }
            if (initial.trailId && !cosmetics.ownedTrails.includes(initial.trailId)) {
                cosmetics.ownedTrails.push(initial.trailId);
            }
            setActivePlayerSkinById(cosmetics.equipped.skin);
            setActiveTrailStyleById(cosmetics.equipped.trail);
            cosmetics.equipped.weapon = activeWeaponId;
            if (!cosmetics.ownedWeapons.includes(activeWeaponId)) {
                cosmetics.ownedWeapons.push(activeWeaponId);
            }
            synchronizeActiveWeaponLoadout(getWeaponDefinition(activeWeaponId));
            resetWeaponPatternState(activeWeaponId);
            if (initial.slot) {
                setActiveLoadoutId(initial.slot);
            }
        } else {
            activePilotId = pilotRoster[0]?.id ?? 'nova';
            pendingPilotId = activePilotId;
            activeWeaponId = getWeaponDefinition(getActiveWeaponId()).id;
            pendingWeaponId = activeWeaponId;
            cosmetics.equipped.weapon = activeWeaponId;
            if (!cosmetics.ownedWeapons.includes(activeWeaponId)) {
                cosmetics.ownedWeapons.push(activeWeaponId);
            }
            synchronizeActiveWeaponLoadout(getWeaponDefinition(activeWeaponId));
            resetWeaponPatternState(activeWeaponId);
        }
        refreshWeaponSummary();
        updatePilotSummary(getPilotDefinition(activePilotId));
        updatePreflightSummary();
    }

    function setActiveLoadoutId(slotId) {
        if (slotId && getCustomLoadout(slotId)) {
            activeLoadoutId = slotId;
        } else {
            activeLoadoutId = null;
        }
        updateActiveLoadoutPrompt();
    }

    initializeLoadoutSelections();
    renderPilotSelectGrid();
    renderWeaponSelectGrid();
    renderCustomLoadoutCollections();

    function runWithSuppressedActiveLoadoutSync(callback) {
        suppressActiveLoadoutSync += 1;
        try {
            return callback();
        } finally {
            suppressActiveLoadoutSync = Math.max(0, suppressActiveLoadoutSync - 1);
        }
    }

    function updateActiveLoadoutPrompt() {
        if (!pilotPreviewDescription) {
            return;
        }
        const hasActive = Boolean(activeLoadoutId && getCustomLoadout(activeLoadoutId));
        pilotPreviewDescription.textContent = hasActive
            ? defaultPilotPreviewDescription
            : loadoutCreationPromptText;
    }

    function getLoadoutSlotMeta(slotId) {
        return CUSTOM_LOADOUT_SLOTS.find((slot) => slot.slot === slotId) ?? null;
    }

    function getLoadoutIndex(slotId) {
        if (!slotId) {
            return -1;
        }
        return customLoadouts.findIndex((entry) => entry && entry.slot === slotId);
    }

    function getCustomLoadout(slotId) {
        const index = getLoadoutIndex(slotId);
        return index >= 0 ? customLoadouts[index] : null;
    }

    function updateCustomLoadout(slotId, updates, { persist = true } = {}) {
        const index = getLoadoutIndex(slotId);
        if (index === -1) {
            return null;
        }
        const target = customLoadouts[index];
        if (!target || !updates || typeof updates !== 'object') {
            return target;
        }
        const slotMeta = getLoadoutSlotMeta(slotId) ?? CUSTOM_LOADOUT_SLOTS[index] ?? null;
        const defaultName = slotMeta?.defaultName ?? target.name;
        if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
            target.name = sanitizeLoadoutName(updates.name, defaultName);
        } else {
            target.name = sanitizeLoadoutName(target.name, defaultName);
        }
        if (typeof updates.characterId === 'string' && updates.characterId) {
            target.characterId = updates.characterId;
        }
        if (typeof updates.weaponId === 'string' && updates.weaponId) {
            target.weaponId = updates.weaponId;
        }
        if (typeof updates.skinId === 'string' && updates.skinId) {
            target.skinId = updates.skinId;
        }
        if (typeof updates.trailId === 'string' && updates.trailId) {
            target.trailId = updates.trailId;
        }
        if (persist) {
            persistCustomLoadouts();
        }
        return target;
    }

    function setCustomLoadoutName(slotId, name, { persist = true } = {}) {
        const index = getLoadoutIndex(slotId);
        if (index === -1) {
            return null;
        }
        const slotMeta = getLoadoutSlotMeta(slotId) ?? CUSTOM_LOADOUT_SLOTS[index] ?? null;
        const defaultName = slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
        const sanitized = sanitizeLoadoutName(name, defaultName);
        const target = customLoadouts[index];
        if (target.name === sanitized) {
            return target;
        }
        target.name = sanitized;
        if (persist) {
            persistCustomLoadouts();
        }
        return target;
    }

    const API_CONFIG = (() => {
        if (typeof window === 'undefined') {
            return {
                baseUrl: '',
                timeoutMs: 8000,
                cacheTtlMs: 120000,
                scopes: ['global', 'weekly']
            };
        }
        const rootDataset = document.documentElement?.dataset ?? {};
        const bodyDataset = document.body?.dataset ?? {};
        const rawBase =
            window.NYAN_ESCAPE_API_BASE_URL ??
            rootDataset.nyanApiBase ??
            bodyDataset.nyanApiBase ??
            '';
        const baseUrl = typeof rawBase === 'string' ? rawBase.trim() : '';
        return {
            baseUrl: baseUrl ? baseUrl.replace(/\/+$/, '') : '',
            timeoutMs: 8000,
            cacheTtlMs: 120000,
            scopes: ['global', 'weekly']
        };
    })();

    function generateUuid() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        const bytes = new Uint8Array(16);
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            crypto.getRandomValues(bytes);
        } else {
            for (let i = 0; i < bytes.length; i++) {
                bytes[i] = Math.floor(Math.random() * 256);
            }
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
        return (
            `${hex[0]}${hex[1]}${hex[2]}${hex[3]}-` +
            `${hex[4]}${hex[5]}-` +
            `${hex[6]}${hex[7]}-` +
            `${hex[8]}${hex[9]}-` +
            `${hex[10]}${hex[11]}${hex[12]}${hex[13]}${hex[14]}${hex[15]}`
        );
    }

    let cachedDeviceId = null;

    function getDeviceIdentifier() {
        if (cachedDeviceId) {
            return cachedDeviceId;
        }
        const stored = readStorage(STORAGE_KEYS.deviceId);
        if (stored && typeof stored === 'string') {
            cachedDeviceId = stored;
            return stored;
        }
        const generated = generateUuid();
        cachedDeviceId = generated;
        writeStorage(STORAGE_KEYS.deviceId, generated);
        return generated;
    }

    function buildApiUrl(path = '') {
        if (!API_CONFIG.baseUrl) {
            return null;
        }
        const normalizedPath = String(path ?? '').replace(/^\/+/, '');
        const base = API_CONFIG.baseUrl.endsWith('/') ? API_CONFIG.baseUrl : `${API_CONFIG.baseUrl}/`;
        try {
            return new URL(normalizedPath, base).toString();
        } catch (error) {
            console.error('Invalid leaderboard API base URL', error);
            return null;
        }
    }

    async function fetchWithTimeout(resource, options = {}) {
        const { timeout = API_CONFIG.timeoutMs, signal, ...rest } = options ?? {};
        if (typeof AbortController === 'undefined' || !timeout || timeout <= 0) {
            return fetch(resource, { signal, ...rest });
        }
        const controller = new AbortController();
        const timers = setTimeout(() => {
            controller.abort();
        }, timeout);
        const abortListener = () => {
            controller.abort();
        };
        if (signal) {
            if (signal.aborted) {
                clearTimeout(timers);
                throw new DOMException('Aborted', 'AbortError');
            }
            signal.addEventListener('abort', abortListener, { once: true });
        }
        try {
            const combinedSignal = controller.signal;
            return await fetch(resource, { ...rest, signal: combinedSignal });
        } finally {
            clearTimeout(timers);
            if (signal) {
                signal.removeEventListener('abort', abortListener);
            }
        }
    }

    async function parseJsonSafely(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    const RUN_TOKEN_BUFFER_MS = 2000;
    let activeRunToken = null;
    let activeRunTokenExpiresAt = 0;
    let runTokenFetchPromise = null;

    function invalidateRunToken() {
        activeRunToken = null;
        activeRunTokenExpiresAt = 0;
    }

    function hasValidRunToken() {
        return (
            typeof activeRunToken === 'string' &&
            activeRunToken &&
            Number.isFinite(activeRunTokenExpiresAt) &&
            activeRunTokenExpiresAt - RUN_TOKEN_BUFFER_MS > Date.now()
        );
    }

    async function ensureRunToken(options = {}) {
        const { forceRefresh = false } = options ?? {};
        if (forceRefresh) {
            invalidateRunToken();
        }
        if (hasValidRunToken()) {
            return { token: activeRunToken, expiresAt: activeRunTokenExpiresAt };
        }
        if (runTokenFetchPromise) {
            return runTokenFetchPromise;
        }
        const endpoint = buildApiUrl('runs');
        if (!endpoint) {
            const error = new Error('Leaderboard sync not configured.');
            error.code = 'unconfigured';
            throw error;
        }
        const deviceId = getDeviceIdentifier();
        runTokenFetchPromise = (async () => {
            try {
                let response;
                try {
                    response = await fetchWithTimeout(endpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            Accept: 'application/json'
                        },
                        body: JSON.stringify({ deviceId })
                    });
                } catch (error) {
                    if (error?.name === 'AbortError') {
                        error.code = 'timeout';
                    } else {
                        error.code = 'network';
                    }
                    throw error;
                }
                const data = await parseJsonSafely(response);
                if (!response.ok) {
                    const message = data?.message || data?.error || `Run token request failed (${response.status})`;
                    const error = new Error(message);
                    error.code = response.status === 401 ? 'auth' : 'server';
                    throw error;
                }
                const token = typeof data?.runToken === 'string' ? data.runToken : null;
                const expiresAt = Number(data?.expiresAt);
                if (!token || !Number.isFinite(expiresAt)) {
                    const error = new Error('Invalid run token response from server.');
                    error.code = 'server';
                    throw error;
                }
                activeRunToken = token;
                activeRunTokenExpiresAt = expiresAt;
                return { token, expiresAt };
            } finally {
                runTokenFetchPromise = null;
            }
        })();
        return runTokenFetchPromise;
    }

    if (storageAvailable) {
        const storedFirstRun = readStorage(STORAGE_KEYS.firstRunComplete);
        firstRunExperience = storedFirstRun !== 'true';
        const rawLoreProgress = readStorage(STORAGE_KEYS.loreProgress);
        const parsedLore = rawLoreProgress != null ? Number.parseInt(rawLoreProgress, 10) : NaN;
        if (!Number.isNaN(parsedLore) && parsedLore > 0) {
            storedLoreProgressMs = parsedLore;
            updateIntelLore(storedLoreProgressMs);
        }
    }

    refreshFlyNowButton();

    if (comicIntro) {
        comicIntro.hidden = !firstRunExperience;
    }

    function loadHighScores() {
        const raw = readStorage(STORAGE_KEYS.highScores);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    function persistHighScores(data) {
        if (!storageAvailable) return;
        writeStorage(STORAGE_KEYS.highScores, JSON.stringify(data));
    }

    const DEFAULT_PLAYER_NAME = 'Ace Pilot';

    function sanitizeLeaderboardEntries(entries = []) {
        if (!Array.isArray(entries)) {
            return [];
        }
        return entries
            .filter((entry) => entry && typeof entry === 'object')
            .map((entry) => {
                const playerName = sanitizePlayerName(entry.player ?? entry.playerName ?? '') || DEFAULT_PLAYER_NAME;
                const score = Number.isFinite(entry.score) ? Math.max(0, Math.floor(entry.score)) : 0;
                const timeMs = Number.isFinite(entry.timeMs) ? Math.max(0, Math.floor(entry.timeMs)) : 0;
                const bestStreak = Number.isFinite(entry.bestStreak)
                    ? Math.max(0, Math.floor(entry.bestStreak))
                    : 0;
                const nyan = Number.isFinite(entry.nyan) ? Math.max(0, Math.floor(entry.nyan)) : 0;
                const rawTimestamp = entry.recordedAt ?? entry.createdAt ?? entry.timestamp ?? Date.now();
                let recordedAt = Date.now();
                if (typeof rawTimestamp === 'string') {
                    const parsed = Date.parse(rawTimestamp);
                    recordedAt = Number.isFinite(parsed) ? parsed : Date.now();
                } else {
                    const numeric = Number(rawTimestamp);
                    recordedAt = Number.isFinite(numeric) ? numeric : Date.now();
                }
                return {
                    player: playerName,
                    score,
                    timeMs,
                    bestStreak,
                    nyan,
                    recordedAt
                };
            })
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (b.timeMs !== a.timeMs) return b.timeMs - a.timeMs;
                return a.recordedAt - b.recordedAt;
            })
            .slice(0, 50);
    }

    function sanitizeLeaderboardSnapshot(snapshot = {}) {
        if (Array.isArray(snapshot)) {
            return {
                global: sanitizeLeaderboardEntries(snapshot),
                weekly: [],
                fetchedAt: Date.now()
            };
        }
        if (!snapshot || typeof snapshot !== 'object') {
            return { global: [], weekly: [], fetchedAt: 0 };
        }
        const fetchedRaw = snapshot.fetchedAt ?? snapshot.updatedAt ?? Date.now();
        let fetchedAt = Date.now();
        if (typeof fetchedRaw === 'string') {
            const parsed = Date.parse(fetchedRaw);
            fetchedAt = Number.isFinite(parsed) ? parsed : Date.now();
        } else {
            const numeric = Number(fetchedRaw);
            fetchedAt = Number.isFinite(numeric) ? numeric : Date.now();
        }
        return {
            global: sanitizeLeaderboardEntries(snapshot.global ?? snapshot.entries ?? []),
            weekly: sanitizeLeaderboardEntries(snapshot.weekly ?? snapshot.week ?? []),
            fetchedAt
        };
    }

    function loadLeaderboard() {
        const raw = readStorage(STORAGE_KEYS.leaderboard);
        if (!raw) {
            return { global: [], weekly: [], fetchedAt: 0 };
        }
        try {
            const parsed = JSON.parse(raw);
            return sanitizeLeaderboardSnapshot(parsed);
        } catch (error) {
            console.warn('Failed to parse cached leaderboard snapshot', error);
            return { global: [], weekly: [], fetchedAt: 0 };
        }
    }

    function persistLeaderboard(snapshot) {
        if (!storageAvailable) return;
        const sanitized = sanitizeLeaderboardSnapshot(snapshot);
        writeStorage(STORAGE_KEYS.leaderboard, JSON.stringify(sanitized));
    }

    function loadSubmissionLog() {
        const raw = readStorage(STORAGE_KEYS.submissionLog);
        if (!raw) return {};
        try {
            const parsed = JSON.parse(raw);
            if (typeof parsed !== 'object' || parsed === null) {
                return {};
            }
            const sanitized = {};
            for (const [key, value] of Object.entries(parsed)) {
                if (!Array.isArray(value)) {
                    continue;
                }
                const normalized = value
                    .map((timestamp) => Number(timestamp))
                    .filter((timestamp) => Number.isFinite(timestamp));
                sanitized[key] = normalized;
            }
            return sanitized;
        } catch (error) {
            return {};
        }
    }

    function persistSubmissionLog(log) {
        if (!storageAvailable) return;
        writeStorage(STORAGE_KEYS.submissionLog, JSON.stringify(log));
    }

    const SUBMISSION_WINDOW_MS = 24 * 60 * 60 * 1000;
    const SUBMISSION_LIMIT = 3;

    let submissionLog = loadSubmissionLog();

    let hasStoredSettings = false;

    const AVAILABLE_DIFFICULTY_IDS = ['easy', 'medium', 'hard', 'hyper'];
    const DEFAULT_DIFFICULTY_ID = 'medium';

    const DIFFICULTY_PRESETS = {
        easy: {
            id: 'easy',
            label: 'Easy',
            description: 'Gentler calibration with slower drift, sparse hostiles, and generous support drops.',
            overrides: {
                baseGameSpeed: 135,
                speedGrowth: 2.6,
                obstacleSpawnInterval: 1300,
                collectibleSpawnInterval: 1200,
                powerUpSpawnInterval: 8500,
                difficulty: {
                    rampDuration: 125000,
                    speedRamp: { start: 0.18, end: 0.68 },
                    spawnIntensity: {
                        obstacle: { start: 0.2, end: 0.72 },
                        collectible: { start: 0.85, end: 1.12 },
                        powerUp: { start: 0.82, end: 1.18 }
                    },
                    healthRamp: { start: 0.5, end: 0.9 }
                },
                score: {
                    collect: 68,
                    destroy: 102,
                    asteroid: 51,
                    dodge: 15,
                    villainEscape: 120
                }
            }
        },
        medium: {
            id: 'medium',
            label: 'Medium',
            description: 'Balanced sortie tuned for comfortable daily flights.',
            overrides: {
                baseGameSpeed: 150,
                speedGrowth: 4.2,
                obstacleSpawnInterval: 1025,
                collectibleSpawnInterval: 1325,
                powerUpSpawnInterval: 10000,
                difficulty: {
                    rampDuration: 100000,
                    speedRamp: { start: 0.24, end: 0.84 },
                    spawnIntensity: {
                        obstacle: { start: 0.34, end: 1.0 },
                        collectible: { start: 0.72, end: 1.06 },
                        powerUp: { start: 0.64, end: 1.02 }
                    },
                    healthRamp: { start: 0.7, end: 1.2 }
                }
            }
        },
        hard: {
            id: 'hard',
            label: 'Hard',
            description: 'Aggressive pacing with denser hazards and lean support drops.',
            overrides: {
                baseGameSpeed: 190,
                speedGrowth: 7.2,
                obstacleSpawnInterval: 780,
                collectibleSpawnInterval: 1600,
                powerUpSpawnInterval: 13500,
                difficulty: {
                    rampDuration: 82000,
                    speedRamp: { start: 0.4, end: 1.12 },
                    spawnIntensity: {
                        obstacle: { start: 0.56, end: 1.4 },
                        collectible: { start: 0.58, end: 0.88 },
                        powerUp: { start: 0.48, end: 0.8 }
                    },
                    healthRamp: { start: 0.95, end: 1.5 }
                },
                score: {
                    collect: 96,
                    destroy: 144,
                    asteroid: 72,
                    dodge: 22,
                    villainEscape: 168
                }
            }
        },
        hyper: {
            id: 'hyper',
            label: 'Hyper',
            description: 'Maximum threat environment demanding expert reflexes but fair windows.',
            overrides: {
                baseGameSpeed: 220,
                speedGrowth: 9,
                obstacleSpawnInterval: 660,
                collectibleSpawnInterval: 1800,
                powerUpSpawnInterval: 16000,
                difficulty: {
                    rampDuration: 72000,
                    speedRamp: { start: 0.5, end: 1.35 },
                    spawnIntensity: {
                        obstacle: { start: 0.72, end: 1.7 },
                        collectible: { start: 0.48, end: 0.76 },
                        powerUp: { start: 0.4, end: 0.66 }
                    },
                    healthRamp: { start: 1.1, end: 1.8 }
                },
                score: {
                    collect: 108,
                    destroy: 162,
                    asteroid: 81,
                    dodge: 24,
                    villainEscape: 189
                }
            }
        }
    };

    function normalizeDifficultySetting(value) {
        if (typeof value !== 'string') {
            return DEFAULT_DIFFICULTY_ID;
        }
        const normalized = value.toLowerCase();
        return AVAILABLE_DIFFICULTY_IDS.includes(normalized) ? normalized : DEFAULT_DIFFICULTY_ID;
    }

    function getDifficultyPreset(id) {
        const normalized = normalizeDifficultySetting(id);
        return DIFFICULTY_PRESETS[normalized] ?? DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY_ID];
    }

    function applyDifficultyPreset(id, { announce = false } = {}) {
        const preset = getDifficultyPreset(id);
        const normalizedId = preset?.id ?? DEFAULT_DIFFICULTY_ID;
        activeDifficultyPreset = normalizedId;

        const baseConfig = applyOverrides(cloneConfig(baseGameConfig), gameplayOverrides);
        const overrides = preset?.overrides;
        const nextConfig = overrides ? applyOverrides(baseConfig, overrides) : baseConfig;

        config = nextConfig;

        if (typeof document !== 'undefined' && document.body) {
            document.body.dataset.difficultyPreset = normalizedId;
        }

        if (announce && preset?.label) {
            const message = preset.description
                ? `${preset.label}: ${preset.description}`
                : `${preset.label} difficulty engaged`;
            console.info(`[difficulty] ${message}`);
        }

        return preset;
    }

    const DEFAULT_SETTINGS = {
        masterVolume: typeof audioManager.getMasterVolume === 'function'
            ? audioManager.getMasterVolume()
            : 0.85,
        musicEnabled: typeof audioManager.isMusicEnabled === 'function'
            ? audioManager.isMusicEnabled()
            : true,
        sfxEnabled: typeof audioManager.isSfxEnabled === 'function'
            ? audioManager.isSfxEnabled()
            : true,
        reducedEffects: systemPrefersReducedEffects(),
        difficulty: DEFAULT_DIFFICULTY_ID
    };

    let settingsState = { ...DEFAULT_SETTINGS };

    function sanitizeVolume(value, fallback = DEFAULT_SETTINGS.masterVolume) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
            return clamp(fallback, 0, 1);
        }
        return clamp(numeric, 0, 1);
    }

    function coerceSettings(partial, base = settingsState ?? DEFAULT_SETTINGS) {
        const source = { ...base };
        if (partial && typeof partial === 'object') {
            if (Object.prototype.hasOwnProperty.call(partial, 'masterVolume')) {
                source.masterVolume = partial.masterVolume;
            }
            if (Object.prototype.hasOwnProperty.call(partial, 'musicEnabled')) {
                source.musicEnabled = partial.musicEnabled;
            }
            if (Object.prototype.hasOwnProperty.call(partial, 'sfxEnabled')) {
                source.sfxEnabled = partial.sfxEnabled;
            }
            if (Object.prototype.hasOwnProperty.call(partial, 'reducedEffects')) {
                source.reducedEffects = partial.reducedEffects;
            }
            if (Object.prototype.hasOwnProperty.call(partial, 'difficulty')) {
                source.difficulty = partial.difficulty;
            }
        }
        return {
            masterVolume: sanitizeVolume(source.masterVolume, base.masterVolume ?? DEFAULT_SETTINGS.masterVolume),
            musicEnabled: source.musicEnabled !== false,
            sfxEnabled: source.sfxEnabled !== false,
            reducedEffects: source.reducedEffects === true,
            difficulty: normalizeDifficultySetting(source.difficulty ?? base.difficulty)
        };
    }

    function loadSettingsPreferences() {
        hasStoredSettings = false;
        if (!storageAvailable) {
            return { ...DEFAULT_SETTINGS };
        }
        const raw = readStorage(STORAGE_KEYS.settings);
        if (!raw) {
            return { ...DEFAULT_SETTINGS };
        }
        try {
            const parsed = JSON.parse(raw);
            const coerced = coerceSettings(parsed, DEFAULT_SETTINGS);
            hasStoredSettings = true;
            return coerced;
        } catch (error) {
            hasStoredSettings = false;
            return { ...DEFAULT_SETTINGS };
        }
    }

    function persistSettingsPreferences() {
        if (!storageAvailable) {
            return;
        }
        const payload = {
            masterVolume: Number(settingsState.masterVolume.toFixed(3)),
            musicEnabled: settingsState.musicEnabled,
            sfxEnabled: settingsState.sfxEnabled,
            reducedEffects: settingsState.reducedEffects,
            difficulty: settingsState.difficulty
        };
        writeStorage(STORAGE_KEYS.settings, JSON.stringify(payload));
    }

    const COSMETIC_RARITIES = {
        common: {
            id: 'common',
            label: 'Common',
            badge: 'Common',
            className: 'rarity-common'
        },
        rare: {
            id: 'rare',
            label: 'Rare',
            badge: 'Rare Drop',
            className: 'rarity-rare'
        },
        epic: {
            id: 'epic',
            label: 'Epic',
            badge: 'Epic',
            className: 'rarity-epic'
        },
        legendary: {
            id: 'legendary',
            label: 'Legendary',
            badge: 'Legendary',
            className: 'rarity-legendary'
        },
        mythic: {
            id: 'mythic',
            label: 'Mythic',
            badge: 'Mythic Relic',
            className: 'rarity-mythic'
        }
    };

    function getCosmeticRarityMeta(rarity) {
        const key = typeof rarity === 'string' ? rarity.toLowerCase() : 'common';
        return COSMETIC_RARITIES[key] ?? COSMETIC_RARITIES.common;
    }

    const STREAK_MILESTONES = [
        {
            id: 'streak-8',
            threshold: 8,
            title: 'Combo Initiate',
            narrative: 'Stabilise a x8 streak to light up the ion wake.',
            reward: {
                type: 'cosmetic',
                category: 'trail',
                id: 'ion',
                label: 'Ion Surge Trail',
                rarity: 'rare'
            },
            bonus: { type: 'nyan', amount: 500 }
        },
        {
            id: 'streak-14',
            threshold: 14,
            title: 'Starlight Navigator',
            narrative: 'Hold a x14 combo to earn Aurora’s starlight hull plating.',
            reward: {
                type: 'cosmetic',
                category: 'skin',
                id: 'starlight',
                label: 'Starlight Reverie Hull',
                rarity: 'epic'
            },
            bonus: { type: 'nyan', amount: 800 }
        },
        {
            id: 'streak-20',
            threshold: 20,
            title: 'Quantum Vanguard',
            narrative: 'Channel a x20 streak to unlock experimental quantum trim.',
            reward: {
                type: 'bundle',
                label: 'Quantum Vanguard Bundle',
                rarity: 'legendary',
                items: [
                    {
                        type: 'cosmetic',
                        category: 'skin',
                        id: 'ionShroud',
                        label: 'Ion Shroud Prototype'
                    },
                    {
                        type: 'cosmetic',
                        category: 'trail',
                        id: 'quantum',
                        label: 'Quantum Drift Trail'
                    }
                ]
            },
            bonus: { type: 'nyan', amount: 1200 }
        }
    ];

    const COMMUNITY_GOALS = [
        {
            id: 'fleetScore',
            label: 'Fuel the Fleet',
            description: 'Bank shared score to keep the evacuation armada moving.',
            target: 600000,
            unit: 'pts',
            type: 'score',
            rarity: 'epic'
        },
        {
            id: 'streakRelay',
            label: 'Streak Relay',
            description: 'Chain streak contributions from every pilot in the sector.',
            target: 160,
            unit: 'combo',
            type: 'streak',
            rarity: 'rare'
        }
    ];

    const SEASON_PASS_TRACK = {
        seasonId: '2024-quantum',
        label: 'Season 3 · Quantum Drift',
        tiers: [
            { id: 'tier-1', threshold: 40, label: 'Tier 1 — Recon Cache' },
            {
                id: 'tier-2',
                threshold: 100,
                label: 'Tier 2 — Quantum Wake',
                reward: {
                    type: 'cosmetic',
                    category: 'trail',
                    id: 'quantum',
                    label: 'Quantum Drift Trail',
                    rarity: 'legendary'
                }
            },
            { id: 'tier-3', threshold: 180, label: 'Tier 3 — Vanguard Cache' },
            {
                id: 'tier-4',
                threshold: 260,
                label: 'Tier 4 — Embercore Monarch',
                reward: {
                    type: 'cosmetic',
                    category: 'skin',
                    id: 'embercore',
                    label: 'Embercore Monarch Hull',
                    rarity: 'mythic'
                }
            }
        ]
    };

    const CHALLENGE_DEFINITIONS = {
        daily: [
            {
                id: 'daily-survive-90',
                slot: 'daily',
                title: 'Hold the Lane',
                description: 'Survive 90 seconds in a single run.',
                goal: { metric: 'time', target: 90000, mode: 'max' },
                reward: {
                    type: 'cosmetic',
                    category: 'trail',
                    id: 'aurora',
                    label: 'Aurora Wake Trail',
                    rarity: 'rare'
                }
            },
            {
                id: 'daily-core-collector',
                slot: 'daily',
                title: 'Core Collector',
                description: 'Secure 5 power-ups in a day.',
                goal: { metric: 'powerUp', target: 5, mode: 'sum' },
                reward: {
                    type: 'cosmetic',
                    category: 'trail',
                    id: 'ember',
                    label: 'Ember Wake Trail',
                    rarity: 'rare'
                }
            }
        ],
        weekly: [
            {
                id: 'weekly-villain-hunter',
                slot: 'weekly',
                title: 'Villain Hunter',
                description: 'Neutralize 30 villains this week.',
                goal: { metric: 'villain', target: 30, mode: 'sum' },
                reward: {
                    type: 'cosmetic',
                    category: 'skin',
                    id: 'midnight',
                    label: 'Midnight Mirage Hull',
                    rarity: 'rare'
                }
            },
            {
                id: 'weekly-score-champion',
                slot: 'weekly',
                title: 'Score Champion',
                description: 'Reach 75,000 score in a single run.',
                goal: { metric: 'score', target: 75000, mode: 'max' },
                reward: {
                    type: 'cosmetic',
                    category: 'skin',
                    id: 'sunrise',
                    label: 'Sunrise Shimmer Hull',
                    rarity: 'rare'
                }
            }
        ],
        event: [
            {
                id: 'event-solstice-surge',
                slot: 'event',
                title: 'Solstice Surge',
                description: 'Bank 90,000 points in a single run during the Solstice rotation.',
                goal: { metric: 'score', target: 90000, mode: 'max' },
                reward: {
                    type: 'bundle',
                    label: 'Solstice Celebration Bundle',
                    rarity: 'legendary',
                    items: [
                        {
                            type: 'cosmetic',
                            category: 'trail',
                            id: 'solstice',
                            label: 'Solstice Bloom Trail'
                        },
                        {
                            type: 'cosmetic',
                            category: 'trail',
                            id: 'aurora',
                            label: 'Aurora Wake Trail'
                        }
                    ]
                }
            }
        ]
    };

    function registerCosmeticRewardSource(map, reward, source) {
        if (!reward || typeof reward !== 'object') {
            return;
        }
        if (reward.type === 'bundle') {
            if (Array.isArray(reward.items)) {
                for (const item of reward.items) {
                    registerCosmeticRewardSource(map, item, {
                        ...source,
                        bundle: reward.label ?? source?.title ?? 'Bundle'
                    });
                }
            }
            return;
        }
        if (reward.type === 'cosmetic' && reward.id) {
            const list = map.get(reward.id) ?? [];
            list.push({
                ...source,
                reward
            });
            map.set(reward.id, list);
        }
    }

    const COSMETIC_REWARD_SOURCES = (() => {
        const map = new Map();
        for (const [slotKey, list] of Object.entries(CHALLENGE_DEFINITIONS)) {
            if (!Array.isArray(list)) {
                continue;
            }
            for (const definition of list) {
                if (!definition || !definition.reward) {
                    continue;
                }
                registerCosmeticRewardSource(map, definition.reward, {
                    type: 'challenge',
                    slot: slotKey,
                    title: definition.title ?? definition.id
                });
            }
        }
        for (const milestone of STREAK_MILESTONES) {
            registerCosmeticRewardSource(map, milestone.reward, {
                type: 'milestone',
                title: milestone.title ?? milestone.id
            });
        }
        if (SEASON_PASS_TRACK?.tiers) {
            for (const tier of SEASON_PASS_TRACK.tiers) {
                if (!tier || !tier.reward) {
                    continue;
                }
                registerCosmeticRewardSource(map, tier.reward, {
                    type: 'season',
                    title: tier.label ?? tier.id
                });
            }
        }
        return map;
    })();

    const ACHIEVEMENT_DEFINITIONS = [
        {
            id: 'achv-first-flight',
            title: 'Launch Cadet',
            description: 'Finish a logged run and transmit your first flight log.',
            rarity: 'common',
            icon: '🚀'
        },
        {
            id: 'achv-combo-ace',
            title: 'Combo Ace',
            description: 'Stabilise a streak of x12 or higher.',
            rarity: 'epic',
            icon: '✨'
        },
        {
            id: 'achv-score-scribe',
            title: 'Score Scribe',
            description: 'Log a single run worth 120,000 points or more.',
            rarity: 'legendary',
            icon: '📜'
        },
        {
            id: 'achv-community-signal',
            title: 'Community Signal',
            description: 'Help complete a community goal broadcast.',
            rarity: 'rare',
            icon: '🌐'
        }
    ];

    const CHALLENGE_STATE_VERSION = 1;

    function createDefaultCosmeticsState() {
        return {
            ownedSkins: ['default'],
            ownedTrails: ['rainbow'],
            ownedWeapons: ['pulse', 'scatter', 'lance'],
            equipped: { skin: 'default', trail: 'rainbow', weapon: 'pulse' }
        };
    }

    function createDefaultChallengeState() {
        const defaultState = {
            version: CHALLENGE_STATE_VERSION,
            slots: {},
            history: [],
            cosmetics: createDefaultCosmeticsState(),
            milestones: {
                streak: { achieved: [] }
            }
        };
        setActiveTrailStyleById(defaultState.cosmetics.equipped.trail);
        setActivePlayerSkinById(defaultState.cosmetics.equipped.skin);
        return defaultState;
    }

    function sanitizeChallengeGoal(goal) {
        if (!goal || typeof goal !== 'object') {
            return { metric: 'score', target: 0, mode: 'sum' };
        }
        const metric = typeof goal.metric === 'string' ? goal.metric : 'score';
        const rawTarget = Number(goal.target);
        const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 0;
        let mode = goal.mode === 'max' ? 'max' : 'sum';
        if (metric === 'time' || metric === 'score' || metric === 'streak') {
            mode = 'max';
        }
        const normalized = { metric, target, mode };
        if (goal.filter && typeof goal.filter === 'object') {
            normalized.filter = { ...goal.filter };
        }
        return normalized;
    }

    function sanitizeChallengeSlot(slotKey, entry) {
        if (!entry || typeof entry !== 'object') {
            return null;
        }
        const challengeId = typeof entry.challengeId === 'string' ? entry.challengeId : null;
        const rotation = typeof entry.rotation === 'string' ? entry.rotation : null;
        if (!challengeId || !rotation) {
            return null;
        }
        const goal = sanitizeChallengeGoal(entry.goal);
        const progressValue = Number.isFinite(entry.progressValue) ? entry.progressValue : 0;
        return {
            slot: slotKey,
            challengeId,
            rotation,
            goal,
            progressValue,
            completedAt: typeof entry.completedAt === 'number' ? entry.completedAt : null,
            claimedAt: typeof entry.claimedAt === 'number' ? entry.claimedAt : null,
            createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
            updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : Date.now()
        };
    }

    function migrateChallengeState(raw) {
        const base = createDefaultChallengeState();
        if (!isPlainObject(raw)) {
            return base;
        }
        const state = {
            version: Number.isInteger(raw.version) ? raw.version : 0,
            slots: {},
            history: Array.isArray(raw.history)
                ? raw.history
                      .filter((entry) => isPlainObject(entry))
                      .slice(-24)
                      .map((entry) => ({ ...entry }))
                : [],
            cosmetics: isPlainObject(raw.cosmetics) ? { ...raw.cosmetics } : createDefaultCosmeticsState(),
            milestones: isPlainObject(raw.milestones) ? { ...raw.milestones } : { streak: { achieved: [] } }
        };
        const slots = isPlainObject(raw.slots) ? raw.slots : {};
        for (const [slotKey, entry] of Object.entries(slots)) {
            const normalized = sanitizeChallengeSlot(slotKey, entry);
            if (normalized) {
                state.slots[slotKey] = normalized;
            }
        }
        const defaultCosmetics = createDefaultCosmeticsState();
        if (!Array.isArray(state.cosmetics.ownedSkins)) {
            state.cosmetics.ownedSkins = [...defaultCosmetics.ownedSkins];
        } else {
            state.cosmetics.ownedSkins = Array.from(
                new Set(state.cosmetics.ownedSkins.map((value) => String(value)))
            );
            if (!state.cosmetics.ownedSkins.includes('default')) {
                state.cosmetics.ownedSkins.unshift('default');
            }
        }
        if (!Array.isArray(state.cosmetics.ownedTrails)) {
            state.cosmetics.ownedTrails = [...defaultCosmetics.ownedTrails];
        } else {
            state.cosmetics.ownedTrails = Array.from(
                new Set(state.cosmetics.ownedTrails.map((value) => String(value)))
            );
            if (!state.cosmetics.ownedTrails.includes('rainbow')) {
                state.cosmetics.ownedTrails.unshift('rainbow');
            }
        }
        if (!Array.isArray(state.cosmetics.ownedWeapons)) {
            state.cosmetics.ownedWeapons = [...defaultCosmetics.ownedWeapons];
        } else {
            state.cosmetics.ownedWeapons = Array.from(
                new Set(state.cosmetics.ownedWeapons.map((value) => String(value)))
            );
            if (!state.cosmetics.ownedWeapons.includes('pulse')) {
                state.cosmetics.ownedWeapons.unshift('pulse');
            }
        }
        if (!isPlainObject(state.cosmetics.equipped)) {
            state.cosmetics.equipped = { ...defaultCosmetics.equipped };
        } else {
            const equippedSkin =
                typeof state.cosmetics.equipped.skin === 'string'
                    ? state.cosmetics.equipped.skin
                    : defaultCosmetics.equipped.skin;
            const equippedTrail =
                typeof state.cosmetics.equipped.trail === 'string'
                    ? state.cosmetics.equipped.trail
                    : defaultCosmetics.equipped.trail;
            const equippedWeapon =
                typeof state.cosmetics.equipped.weapon === 'string'
                    ? state.cosmetics.equipped.weapon
                    : defaultCosmetics.equipped.weapon;
            state.cosmetics.equipped = {
                skin: state.cosmetics.ownedSkins.includes(equippedSkin)
                    ? equippedSkin
                    : defaultCosmetics.equipped.skin,
                trail: state.cosmetics.ownedTrails.includes(equippedTrail)
                    ? equippedTrail
                    : defaultCosmetics.equipped.trail,
                weapon: state.cosmetics.ownedWeapons.includes(equippedWeapon)
                    ? equippedWeapon
                    : defaultCosmetics.equipped.weapon
            };
        }
        setActiveTrailStyleById(state.cosmetics.equipped.trail);
        setActivePlayerSkinById(state.cosmetics.equipped.skin);
        if (!isPlainObject(state.milestones)) {
            state.milestones = { streak: { achieved: [] } };
        }
        if (!isPlainObject(state.milestones.streak)) {
            state.milestones.streak = { achieved: [] };
        }
        if (!Array.isArray(state.milestones.streak.achieved)) {
            state.milestones.streak.achieved = [];
        } else {
            state.milestones.streak.achieved = Array.from(
                new Set(state.milestones.streak.achieved.map((value) => String(value)))
            );
        }
        state.version = Math.max(state.version, 1);
        if (state.version !== CHALLENGE_STATE_VERSION) {
            state.version = CHALLENGE_STATE_VERSION;
        }
        return state;
    }

    function loadChallengeState() {
        if (!storageAvailable) {
            return createDefaultChallengeState();
        }
        const raw = readStorage(STORAGE_KEYS.challenges);
        if (!raw) {
            return createDefaultChallengeState();
        }
        try {
            const parsed = JSON.parse(raw);
            return migrateChallengeState(parsed);
        } catch (error) {
            return createDefaultChallengeState();
        }
    }

    function persistChallengeState(state) {
        if (!storageAvailable) {
            return;
        }
        try {
            writeStorage(STORAGE_KEYS.challenges, JSON.stringify(state));
        } catch (error) {
            // Ignore write failures for challenge data
        }
    }

    function getDayIndex(date) {
        const start = new Date(date.getFullYear(), 0, 1);
        start.setHours(0, 0, 0, 0);
        const diff = date - start;
        return Math.floor(diff / 86400000);
    }

    function getWeekIndex(date) {
        const reference = new Date(date.getFullYear(), 0, 1);
        reference.setHours(0, 0, 0, 0);
        const day = reference.getDay();
        const offset = day === 0 ? 1 : day <= 1 ? 0 : 7 - day + 1;
        reference.setDate(reference.getDate() + offset);
        const diff = date - reference;
        return Math.max(0, Math.floor(diff / (86400000 * 7)));
    }

    function getMonthIndex(date) {
        return date.getFullYear() * 12 + date.getMonth();
    }

    function computeRotationId(slot, date) {
        if (slot === 'weekly') {
            const week = getWeekIndex(date);
            return `${date.getFullYear()}-W${week}`;
        }
        if (slot === 'event') {
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${date.getFullYear()}-M${month}`;
        }
        const day = getDayIndex(date);
        return `${date.getFullYear()}-${day}`;
    }

    function parseRotationId(slot, rotationId) {
        if (slot === 'weekly') {
            const match = /^([0-9]{4})-W([0-9]+)$/.exec(rotationId ?? '');
            if (match) {
                const year = Number(match[1]);
                const week = Number(match[2]);
                if (Number.isFinite(year) && Number.isFinite(week)) {
                    const reference = new Date(year, 0, 1);
                    reference.setHours(0, 0, 0, 0);
                    const day = reference.getDay();
                    const offset = day === 0 ? 1 : day <= 1 ? 0 : 7 - day + 1;
                    reference.setDate(reference.getDate() + offset + week * 7);
                    return reference;
                }
            }
        } else if (slot === 'event') {
            const match = /^([0-9]{4})-M([0-9]{2})$/.exec(rotationId ?? '');
            if (match) {
                const year = Number(match[1]);
                const month = Number(match[2]);
                if (Number.isFinite(year) && Number.isFinite(month)) {
                    const reference = new Date(year, month - 1, 1);
                    reference.setHours(0, 0, 0, 0);
                    return reference;
                }
            }
        } else {
            const match = /^([0-9]{4})-([0-9]+)$/.exec(rotationId ?? '');
            if (match) {
                const year = Number(match[1]);
                const day = Number(match[2]);
                if (Number.isFinite(year) && Number.isFinite(day)) {
                    const reference = new Date(year, 0, 1);
                    reference.setHours(0, 0, 0, 0);
                    reference.setDate(reference.getDate() + day);
                    return reference;
                }
            }
        }
        return new Date();
    }

    function getRotationEnd(slot, rotationId, referenceDate = new Date()) {
        const base = parseRotationId(slot, rotationId) ?? referenceDate;
        if (slot === 'weekly') {
            const end = new Date(base.getTime());
            const day = end.getDay();
            let daysUntilMonday = (8 - day) % 7;
            if (daysUntilMonday === 0) {
                daysUntilMonday = 7;
            }
            end.setDate(end.getDate() + daysUntilMonday);
            end.setHours(0, 0, 0, 0);
            return end.getTime();
        }
        if (slot === 'event') {
            const end = new Date(base.getTime());
            end.setMonth(end.getMonth() + 1, 1);
            end.setHours(0, 0, 0, 0);
            return end.getTime();
        }
        const end = new Date(base.getTime());
        end.setHours(24, 0, 0, 0);
        return end.getTime();
    }

    function formatDurationShort(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        if (minutes > 0) {
            return `${minutes}:${String(seconds).padStart(2, '0')}`;
        }
        return `${totalSeconds}s`;
    }

    function describeReward(reward) {
        if (!reward || typeof reward !== 'object') {
            return '—';
        }
        const rarityMeta = reward.rarity ? getCosmeticRarityMeta(reward.rarity) : null;
        if (typeof reward.label === 'string' && reward.label) {
            return rarityMeta ? `${reward.label} (${rarityMeta.label})` : reward.label;
        }
        if (reward.type === 'bundle') {
            const items = Array.isArray(reward.items) ? reward.items.length : 0;
            const label = reward.label || `${items || 'Multi'} cosmetic bundle`;
            return rarityMeta ? `${label} (${rarityMeta.label})` : label;
        }
        if (reward.type === 'cosmetic') {
            let baseLabel = 'Reward ready';
            if (reward.category === 'skin') {
                baseLabel = 'Hull skin unlock';
            } else if (reward.category === 'trail') {
                baseLabel = 'Trail effect unlock';
            } else if (reward.category === 'weapon') {
                baseLabel = 'Weapon system unlock';
            }
            return rarityMeta ? `${baseLabel} (${rarityMeta.label})` : baseLabel;
        }
        return 'Reward ready';
    }

    function createChallengeManager(config = {}) {
        const {
            definitions = CHALLENGE_DEFINITIONS,
            cosmeticsCatalog = null,
            onChallengeCompleted,
            onRewardClaimed
        } = config ?? {};
        let state = loadChallengeState();
        const listeners = new Set();
        const definitionIndex = new Map();
        const cosmetics = cosmeticsCatalog ?? { skins: {}, trails: {}, weapons: {} };
        let cachedSnapshot = null;

        function indexDefinitions() {
            definitionIndex.clear();
            for (const [slotKey, list] of Object.entries(definitions ?? {})) {
                if (!Array.isArray(list)) {
                    continue;
                }
                for (const definition of list) {
                    if (definition && typeof definition === 'object' && typeof definition.id === 'string') {
                        definitionIndex.set(definition.id, { ...definition, slot: slotKey });
                    }
                }
            }
        }

        function selectDefinition(slot, date) {
            const list = Array.isArray(definitions?.[slot]) ? definitions[slot] : [];
            if (!list.length) {
                return null;
            }
            let index = 0;
            if (slot === 'weekly') {
                index = getWeekIndex(date);
            } else if (slot === 'event') {
                index = getMonthIndex(date);
            } else {
                index = getDayIndex(date);
            }
            return list[index % list.length];
        }

        function formatProgress(goal, value, target) {
            if (!goal || typeof goal !== 'object') {
                return `${value} / ${target}`;
            }
            if (goal.metric === 'time') {
                return `${formatDurationShort(value)} / ${formatDurationShort(target)}`;
            }
            if (goal.metric === 'score') {
                return `${value.toLocaleString()} / ${target.toLocaleString()}`;
            }
            if (goal.metric === 'streak') {
                return `x${value} / x${target}`;
            }
            return `${value} / ${target}`;
        }

        function ensureMilestoneBucket(kind) {
            if (!state.milestones || typeof state.milestones !== 'object') {
                state.milestones = { streak: { achieved: [] } };
            }
            if (!state.milestones[kind] || typeof state.milestones[kind] !== 'object') {
                state.milestones[kind] = { achieved: [] };
            }
            if (!Array.isArray(state.milestones[kind].achieved)) {
                state.milestones[kind].achieved = [];
            }
            return state.milestones[kind];
        }

        function formatCountdown(slot, rotationId, now) {
            const resetAt = getRotationEnd(slot, rotationId, new Date(now));
            if (!resetAt) {
                return '';
            }
            const remaining = Math.max(0, resetAt - now);
            const totalSeconds = Math.ceil(remaining / 1000);
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);
            if (days > 0) {
                return `Resets in ${days}d ${hours}h`;
            }
            if (hours > 0) {
                return `Resets in ${hours}h ${minutes}m`;
            }
            return `Resets in ${Math.max(1, minutes)}m`;
        }

        function computeActiveChallenges(snapshot) {
            const list = [];
            const now = Date.now();
            for (const [slotKey, entry] of Object.entries(snapshot.slots)) {
                if (!entry) continue;
                const definition = definitionIndex.get(entry.challengeId) ?? {};
                const goal = entry.goal ?? { metric: 'score', target: 0, mode: 'sum' };
                const target = Math.max(0, Math.round(goal.target ?? 0));
                const value = Math.max(0, Math.floor(entry.progressValue ?? 0));
                const percent = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : entry.completedAt ? 100 : 0;
                const reward = definition.reward ?? null;
                const completed = Boolean(entry.completedAt) || (target > 0 && value >= target);
                const claimed = Boolean(entry.claimedAt);
                const readyToClaim = completed && !claimed && Boolean(reward);
                    list.push({
                        id: definition.id ?? entry.challengeId,
                        slot: slotKey,
                    slotLabel:
                        slotKey === 'daily'
                            ? 'Daily'
                            : slotKey === 'weekly'
                                ? 'Weekly'
                                : slotKey === 'event'
                                    ? 'Event'
                                    : slotKey,
                        title: definition.title ?? entry.challengeId,
                    description: definition.description ?? '',
                    reward,
                    rewardLabel: describeReward(reward),
                    completed,
                    claimed,
                    readyToClaim,
                    progressValue: value,
                    target,
                    progressPercent: percent,
                    progressText: formatProgress(goal, value, target),
                    statusText: claimed
                        ? 'Reward claimed'
                        : readyToClaim
                            ? 'Reward ready'
                            : `${percent}% complete`,
                    buttonLabel: claimed ? 'Claimed' : readyToClaim ? 'Claim Reward' : 'Locked',
                    rotation: entry.rotation,
                    timeRemainingLabel: formatCountdown(slotKey, entry.rotation, now)
                });
            }
            return list;
        }

        function buildSnapshot() {
            const snapshot = {
                version: CHALLENGE_STATE_VERSION,
                slots: {},
                history: Array.isArray(state.history)
                    ? state.history.slice(-24).map((entry) => ({ ...entry }))
                    : [],
                cosmetics: {
                    ownedSkins: [...state.cosmetics.ownedSkins],
                    ownedTrails: [...state.cosmetics.ownedTrails],
                    ownedWeapons: [...state.cosmetics.ownedWeapons],
                    equipped: { ...state.cosmetics.equipped }
                }
            };
            for (const [slotKey, entry] of Object.entries(state.slots)) {
                snapshot.slots[slotKey] = { ...entry, goal: { ...entry.goal }, slot: slotKey };
            }
            snapshot.milestones = {
                streak: Array.isArray(state.milestones?.streak?.achieved)
                    ? [...state.milestones.streak.achieved]
                    : []
            };
            snapshot.activeChallenges = computeActiveChallenges(snapshot);
            return snapshot;
        }

        function unlockReward(reward) {
            if (!reward || typeof reward !== 'object') {
                return false;
            }
            if (reward.type === 'bundle') {
                const items = Array.isArray(reward.items) ? reward.items : [];
                let unlockedAny = false;
                for (const item of items) {
                    if (unlockReward(item)) {
                        unlockedAny = true;
                    }
                }
                return unlockedAny;
            }
            if (reward.type !== 'cosmetic') {
                return false;
            }
            if (reward.category === 'skin') {
                if (cosmetics?.skins && !cosmetics.skins[reward.id]) {
                    return false;
                }
                let changed = false;
                if (!state.cosmetics.ownedSkins.includes(reward.id)) {
                    state.cosmetics.ownedSkins.push(reward.id);
                    changed = true;
                }
                if (state.cosmetics.equipped.skin === 'default') {
                    state.cosmetics.equipped.skin = reward.id;
                    setActivePlayerSkinById(reward.id);
                    changed = true;
                }
                return changed;
            }
            if (reward.category === 'trail') {
                if (cosmetics?.trails && !cosmetics.trails[reward.id]) {
                    return false;
                }
                let changed = false;
                if (!state.cosmetics.ownedTrails.includes(reward.id)) {
                    state.cosmetics.ownedTrails.push(reward.id);
                    changed = true;
                }
                if (state.cosmetics.equipped.trail === 'rainbow') {
                    state.cosmetics.equipped.trail = reward.id;
                    setActiveTrailStyleById(reward.id);
                    changed = true;
                }
                return changed;
            }
            if (reward.category === 'weapon') {
                if (cosmetics?.weapons && !cosmetics.weapons[reward.id]) {
                    return false;
                }
                let changed = false;
                if (!state.cosmetics.ownedWeapons.includes(reward.id)) {
                    state.cosmetics.ownedWeapons.push(reward.id);
                    changed = true;
                }
                if (state.cosmetics.equipped.weapon === 'pulse') {
                    state.cosmetics.equipped.weapon = reward.id;
                    changed = true;
                }
                return changed;
            }
            return false;
        }

        function ensureActive(date = new Date()) {
            let mutated = false;
            for (const slotKey of Object.keys(definitions ?? {})) {
                const definition = selectDefinition(slotKey, date);
                const rotationId = computeRotationId(slotKey, date);
                if (!definition) {
                    if (state.slots[slotKey]) {
                        delete state.slots[slotKey];
                        mutated = true;
                    }
                    continue;
                }
                const current = state.slots[slotKey];
                if (!current || current.challengeId !== definition.id || current.rotation !== rotationId) {
                    if (current) {
                        state.history.push({ ...current, archivedAt: Date.now(), slot: slotKey });
                        state.history = state.history.slice(-24);
                    }
                    state.slots[slotKey] = {
                        slot: slotKey,
                        challengeId: definition.id,
                        rotation: rotationId,
                        goal: sanitizeChallengeGoal(definition.goal),
                        progressValue: 0,
                        completedAt: null,
                        claimedAt: null,
                        createdAt: Date.now(),
                        updatedAt: Date.now()
                    };
                    mutated = true;
                } else {
                    const normalizedGoal = sanitizeChallengeGoal(definition.goal);
                    if (
                        current.goal.metric !== normalizedGoal.metric ||
                        current.goal.mode !== normalizedGoal.mode ||
                        current.goal.target !== normalizedGoal.target
                    ) {
                        current.goal = normalizedGoal;
                        current.progressValue = Math.min(
                            current.progressValue ?? 0,
                            normalizedGoal.target ?? current.progressValue
                        );
                        if (current.completedAt && current.progressValue < normalizedGoal.target) {
                            current.completedAt = null;
                            current.claimedAt = null;
                        }
                        current.updatedAt = Date.now();
                        mutated = true;
                    }
                }
            }
            return mutated;
        }

        function notifyListeners() {
            for (const listener of listeners) {
                try {
                    listener(cachedSnapshot);
                } catch (error) {
                    console.error('challenge listener error', error);
                }
            }
        }

        function commitState({ notify = true, completions = [], rewardClaim = null } = {}) {
            persistChallengeState(state);
            cachedSnapshot = buildSnapshot();
            if (notify) {
                notifyListeners();
            }
            if (completions.length && typeof onChallengeCompleted === 'function') {
                for (const completion of completions) {
                    try {
                        onChallengeCompleted(completion.definition, {
                            slot: completion.slot,
                            progress: { ...completion.entry },
                            reward: completion.definition?.reward ?? null
                        });
                    } catch (error) {
                        console.error('challenge completion hook error', error);
                    }
                }
            }
            if (rewardClaim && typeof onRewardClaimed === 'function') {
                try {
                    onRewardClaimed(rewardClaim.definition, rewardClaim.reward);
                } catch (error) {
                    console.error('challenge reward hook error', error);
                }
            }
        }

        function recordEvent(event, payload = {}) {
            const date = new Date();
            let mutated = ensureActive(date);
            const completions = [];
            for (const [slotKey, entry] of Object.entries(state.slots)) {
                if (!entry) continue;
                const goal = entry.goal ?? { metric: 'score', target: 0, mode: 'sum' };
                const before = entry.progressValue ?? 0;
                let after = before;
                if (goal.metric === 'time' && event === 'time') {
                    const totalMs = Number(payload.totalMs ?? 0);
                    if (Number.isFinite(totalMs) && totalMs > after) {
                        after = totalMs;
                    }
                } else if (goal.metric === 'score' && event === 'score') {
                    const totalScore = Number(payload.totalScore ?? 0);
                    if (Number.isFinite(totalScore) && totalScore > after) {
                        after = totalScore;
                    }
                } else if (goal.metric === 'villain' && event === 'villain') {
                    const count = Number(payload.count ?? 1);
                    if (Number.isFinite(count) && count > 0) {
                        after = before + count;
                    }
                } else if (goal.metric === 'powerUp' && event === 'powerUp') {
                    const allowedTypes = Array.isArray(goal.filter?.types) ? goal.filter.types : null;
                    if (!allowedTypes || allowedTypes.includes(payload.type)) {
                        after = before + 1;
                    }
                } else if (goal.metric === 'streak' && event === 'streak') {
                    const best = Number(payload.bestStreak ?? 0);
                    if (Number.isFinite(best) && best > 0) {
                        if (goal.mode === 'sum') {
                            after = before + best;
                        } else if (best > after) {
                            after = best;
                        }
                    }
                }
                if (after !== before) {
                    entry.progressValue = after;
                    entry.updatedAt = Date.now();
                    mutated = true;
                }
                const target = goal.target ?? 0;
                if (target > 0 && entry.progressValue >= target && !entry.completedAt) {
                    entry.completedAt = Date.now();
                    mutated = true;
                    const definition = definitionIndex.get(entry.challengeId) ?? {
                        id: entry.challengeId,
                        slot: slotKey
                    };
                    completions.push({ slot: slotKey, entry: { ...entry }, definition });
                }
            }
            if (mutated) {
                commitState({ notify: true, completions });
            }
        }

        function claimReward(challengeId) {
            const date = new Date();
            let mutated = ensureActive(date);
            for (const [slotKey, entry] of Object.entries(state.slots)) {
                if (!entry || entry.challengeId !== challengeId) {
                    continue;
                }
                if (!entry.completedAt || entry.claimedAt) {
                    return false;
                }
                const definition = definitionIndex.get(entry.challengeId) ?? { id: challengeId, slot: slotKey };
                const reward = definition.reward ?? null;
                if (reward) {
                    unlockReward(reward);
                }
                entry.claimedAt = Date.now();
                entry.updatedAt = Date.now();
                mutated = true;
                commitState({ notify: true, rewardClaim: { definition, reward } });
                return true;
            }
            if (mutated) {
                commitState({ notify: true });
            }
            return false;
        }

        function equipCosmetic(category, id) {
            let mutated = ensureActive(new Date());
            if (category === 'skin') {
                if (!state.cosmetics.ownedSkins.includes(id) || state.cosmetics.equipped.skin === id) {
                    return false;
                }
                if (cosmetics?.skins && !cosmetics.skins[id]) {
                    return false;
                }
                state.cosmetics.equipped.skin = id;
                setActivePlayerSkinById(id);
                mutated = true;
            } else if (category === 'trail') {
                if (!state.cosmetics.ownedTrails.includes(id) || state.cosmetics.equipped.trail === id) {
                    return false;
                }
                if (cosmetics?.trails && !cosmetics.trails[id]) {
                    return false;
                }
                state.cosmetics.equipped.trail = id;
                setActiveTrailStyleById(id);
                mutated = true;
            } else if (category === 'weapon') {
                if (!state.cosmetics.ownedWeapons.includes(id) || state.cosmetics.equipped.weapon === id) {
                    return false;
                }
                if (cosmetics?.weapons && !cosmetics.weapons[id]) {
                    return false;
                }
                state.cosmetics.equipped.weapon = id;
                mutated = true;
            } else {
                return false;
            }
            if (mutated) {
                commitState({ notify: true });
            }
            return true;
        }

        function markMilestoneAchieved(kind, milestone) {
            if (!milestone || typeof milestone !== 'object' || !milestone.id) {
                return false;
            }
            const bucket = ensureMilestoneBucket(kind);
            if (bucket.achieved.includes(milestone.id)) {
                return false;
            }
            bucket.achieved.push(milestone.id);
            bucket.achieved = Array.from(new Set(bucket.achieved)).slice(-32);
            if (!Array.isArray(state.history)) {
                state.history = [];
            }
            state.history.push({
                type: 'milestone',
                milestoneId: milestone.id,
                slot: kind,
                achievedAt: Date.now(),
                reward: milestone.reward ?? null
            });
            state.history = state.history.slice(-24);
            const rewardUnlocked = milestone.reward ? unlockReward(milestone.reward) : false;
            const definition = { id: milestone.id, title: milestone.title ?? 'Milestone', slot: kind };
            commitState({
                notify: true,
                rewardClaim: rewardUnlocked ? { definition, reward: milestone.reward } : null
            });
            return true;
        }

        function grantCosmeticReward(reward, { reason = 'system', notify = true } = {}) {
            if (!reward || typeof reward !== 'object') {
                return false;
            }
            const unlocked = unlockReward(reward);
            const definition = { id: reason, title: reward.label ?? 'Reward', slot: reason };
            commitState({ notify, rewardClaim: unlocked ? { definition, reward } : null });
            return unlocked;
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }
            listeners.add(listener);
            listener(cachedSnapshot);
            return () => {
                listeners.delete(listener);
            };
        }

        indexDefinitions();
        const initialMutated = ensureActive(new Date());
        cachedSnapshot = buildSnapshot();
        if (initialMutated) {
            persistChallengeState(state);
            cachedSnapshot = buildSnapshot();
        }

        return {
            recordEvent,
            claimReward,
            equipCosmetic,
            markMilestoneAchieved,
            grantCosmeticReward,
            subscribe,
            getSnapshot: () => cachedSnapshot
        };
    }

    function createMetaProgressManager({ challengeManager, broadcast } = {}) {
        const META_PROGRESS_VERSION = 1;

        const defaultState = () => ({
            version: META_PROGRESS_VERSION,
            achievements: {},
            seasonPass: {
                seasonId: SEASON_PASS_TRACK.seasonId,
                points: 0,
                claimedTiers: []
            },
            communityGoals: COMMUNITY_GOALS.map((goal) => ({
                id: goal.id,
                progress: 0,
                contributions: 0,
                completedAt: null,
                lastBroadcastPercent: 0
            })),
            streak: { milestonesEarned: [] }
        });

        function ensureSeasonState(state) {
            if (!state.seasonPass || state.seasonPass.seasonId !== SEASON_PASS_TRACK.seasonId) {
                state.seasonPass = {
                    seasonId: SEASON_PASS_TRACK.seasonId,
                    points: 0,
                    claimedTiers: []
                };
            } else {
                state.seasonPass.points = Number.isFinite(state.seasonPass.points)
                    ? Math.max(0, state.seasonPass.points)
                    : 0;
                state.seasonPass.claimedTiers = Array.isArray(state.seasonPass.claimedTiers)
                    ? Array.from(new Set(state.seasonPass.claimedTiers.map((value) => String(value))))
                    : [];
            }
            return state.seasonPass;
        }

        function ensureCommunityEntry(state, goalId) {
            let entry = Array.isArray(state.communityGoals)
                ? state.communityGoals.find((item) => item.id === goalId)
                : null;
            if (!entry) {
                if (!Array.isArray(state.communityGoals)) {
                    state.communityGoals = [];
                }
                entry = {
                    id: goalId,
                    progress: 0,
                    contributions: 0,
                    completedAt: null,
                    lastBroadcastPercent: 0
                };
                state.communityGoals.push(entry);
            }
            entry.progress = Number.isFinite(entry.progress) ? Math.max(0, entry.progress) : 0;
            entry.contributions = Number.isFinite(entry.contributions) ? Math.max(0, entry.contributions) : 0;
            entry.lastBroadcastPercent = Number.isFinite(entry.lastBroadcastPercent)
                ? Math.max(0, entry.lastBroadcastPercent)
                : 0;
            return entry;
        }

        function migrateMetaState(raw) {
            if (!raw || typeof raw !== 'object') {
                return defaultState();
            }
            const state = defaultState();
            if (raw.achievements && typeof raw.achievements === 'object') {
                for (const [id, entry] of Object.entries(raw.achievements)) {
                    const definition = ACHIEVEMENT_DEFINITIONS.find((candidate) => candidate.id === id);
                    if (!definition || !entry || typeof entry !== 'object') {
                        continue;
                    }
                    const unlockedAt = Number(entry.unlockedAt);
                    if (Number.isFinite(unlockedAt)) {
                        state.achievements[id] = {
                            unlockedAt,
                            context: entry.context ?? null
                        };
                    }
                }
            }
            if (raw.seasonPass && typeof raw.seasonPass === 'object') {
                state.seasonPass = {
                    seasonId: raw.seasonPass.seasonId === SEASON_PASS_TRACK.seasonId
                        ? SEASON_PASS_TRACK.seasonId
                        : SEASON_PASS_TRACK.seasonId,
                    points:
                        raw.seasonPass.seasonId === SEASON_PASS_TRACK.seasonId &&
                        Number.isFinite(raw.seasonPass.points)
                            ? Math.max(0, raw.seasonPass.points)
                            : 0,
                    claimedTiers:
                        raw.seasonPass.seasonId === SEASON_PASS_TRACK.seasonId &&
                        Array.isArray(raw.seasonPass.claimedTiers)
                            ? Array.from(new Set(raw.seasonPass.claimedTiers.map((value) => String(value))))
                            : []
                };
            }
            if (Array.isArray(raw.communityGoals)) {
                state.communityGoals = raw.communityGoals
                    .map((entry) => ({
                        id: entry?.id,
                        progress: Number.isFinite(entry?.progress) ? Math.max(0, entry.progress) : 0,
                        contributions: Number.isFinite(entry?.contributions) ? Math.max(0, entry.contributions) : 0,
                        completedAt: Number.isFinite(entry?.completedAt) ? entry.completedAt : null,
                        lastBroadcastPercent: Number.isFinite(entry?.lastBroadcastPercent)
                            ? Math.max(0, entry.lastBroadcastPercent)
                            : 0
                    }))
                    .filter((entry) => entry.id);
            }
            if (raw.streak && Array.isArray(raw.streak.milestonesEarned)) {
                state.streak.milestonesEarned = Array.from(
                    new Set(raw.streak.milestonesEarned.map((value) => String(value)))
                );
            }
            return state;
        }

        function loadMetaState() {
            if (!storageAvailable) {
                return defaultState();
            }
            try {
                const raw = readStorage(STORAGE_KEYS.metaProgress);
                if (!raw) {
                    return defaultState();
                }
                const parsed = JSON.parse(raw);
                return migrateMetaState(parsed);
            } catch (error) {
                return defaultState();
            }
        }

        let state = loadMetaState();
        state.version = META_PROGRESS_VERSION;
        ensureSeasonState(state);
        for (const goal of COMMUNITY_GOALS) {
            ensureCommunityEntry(state, goal.id);
        }
        state.streak.milestonesEarned = Array.isArray(state.streak?.milestonesEarned)
            ? Array.from(new Set(state.streak.milestonesEarned.map((value) => String(value))))
            : [];

        const listeners = new Set();

        function buildSnapshot() {
            const season = ensureSeasonState(state);
            const tiers = (SEASON_PASS_TRACK.tiers ?? []).map((tier, index, array) => {
                const previousThreshold = index > 0 ? array[index - 1].threshold : 0;
                const unlocked = season.points >= tier.threshold;
                return {
                    ...tier,
                    unlocked,
                    claimed: season.claimedTiers.includes(tier.id),
                    previousThreshold
                };
            });
            const nextTier = tiers.find((tier) => !tier.claimed && season.points < tier.threshold) ?? null;
            const currentTier = nextTier
                ? tiers[Math.max(0, tiers.indexOf(nextTier) - 1)]
                : tiers[tiers.length - 1] ?? null;

            const community = COMMUNITY_GOALS.map((goal) => {
                const entry = ensureCommunityEntry(state, goal.id);
                const percent = goal.target > 0 ? Math.min(100, Math.round((entry.progress / goal.target) * 100)) : 0;
                return {
                    ...goal,
                    progress: entry.progress,
                    contributions: entry.contributions,
                    completedAt: entry.completedAt,
                    percent
                };
            });

            return {
                achievements: ACHIEVEMENT_DEFINITIONS.map((definition) => ({
                    ...definition,
                    unlockedAt: state.achievements[definition.id]?.unlockedAt ?? null
                })),
                seasonPass: {
                    seasonId: season.seasonId,
                    label: SEASON_PASS_TRACK.label,
                    points: season.points,
                    tiers,
                    currentTier,
                    nextTier
                },
                communityGoals: community,
                streak: {
                    milestones: STREAK_MILESTONES.map((milestone) => ({
                        ...milestone,
                        earned: state.streak.milestonesEarned.includes(milestone.id)
                    }))
                }
            };
        }

        let cachedSnapshot = buildSnapshot();

        function persistState() {
            if (!storageAvailable) {
                return;
            }
            try {
                writeStorage(STORAGE_KEYS.metaProgress, JSON.stringify(state));
            } catch (error) {
                // Ignore persistence failures
            }
        }

        function notifyListeners() {
            for (const listener of listeners) {
                try {
                    listener(cachedSnapshot);
                } catch (error) {
                    console.error('meta progress listener error', error);
                }
            }
        }

        function commit({ messages = [] } = {}) {
            persistState();
            cachedSnapshot = buildSnapshot();
            notifyListeners();
            if (Array.isArray(messages) && messages.length && typeof broadcast === 'function') {
                for (const message of messages) {
                    if (!message || typeof message.text !== 'string' || !message.text.length) {
                        continue;
                    }
                    const meta = message.meta && typeof message.meta === 'object' ? message.meta : {};
                    broadcast(message.text, meta);
                }
            }
        }

        function unlockAchievement(id, context) {
            const definition = ACHIEVEMENT_DEFINITIONS.find((entry) => entry.id === id);
            if (!definition) {
                return { changed: false, message: null };
            }
            if (state.achievements[id]) {
                return { changed: false, message: null };
            }
            state.achievements[id] = {
                unlockedAt: Date.now(),
                context: context ?? null
            };
            return {
                changed: true,
                message: {
                    text: `Achievement unlocked: ${definition.title}`,
                    meta: { type: 'achievement' }
                }
            };
        }

        function addSeasonPassPoints(points) {
            if (!Number.isFinite(points) || points <= 0) {
                return { changed: false, messages: [] };
            }
            const season = ensureSeasonState(state);
            season.points += Math.max(0, Math.round(points));
            let changed = true;
            const messages = [];
            for (const tier of SEASON_PASS_TRACK.tiers ?? []) {
                if (season.points >= tier.threshold && !season.claimedTiers.includes(tier.id)) {
                    season.claimedTiers.push(tier.id);
                    messages.push({
                        text: `Season pass tier unlocked: ${tier.label ?? tier.id}`,
                        meta: { type: 'season' }
                    });
                    if (tier.reward && challengeManager?.grantCosmeticReward) {
                        try {
                            challengeManager.grantCosmeticReward(tier.reward, { reason: `season-${tier.id}` });
                        } catch (error) {
                            console.error('season reward grant failed', error);
                        }
                    }
                }
            }
            season.claimedTiers = Array.from(new Set(season.claimedTiers));
            return { changed, messages };
        }

        function addCommunityContribution(goalId, amount) {
            if (!Number.isFinite(amount) || amount <= 0) {
                return { changed: false, messages: [] };
            }
            const goal = COMMUNITY_GOALS.find((entry) => entry.id === goalId);
            if (!goal) {
                return { changed: false, messages: [] };
            }
            const entry = ensureCommunityEntry(state, goalId);
            const previous = entry.progress;
            entry.progress = Math.min(goal.target, entry.progress + Math.round(amount));
            entry.contributions += Math.round(amount);
            const messages = [];
            let changed = entry.progress !== previous;
            if (entry.progress >= goal.target && !entry.completedAt) {
                entry.completedAt = Date.now();
                entry.lastBroadcastPercent = 100;
                messages.push({ text: `${goal.label} completed!`, meta: { type: 'community' } });
                const achievement = unlockAchievement('achv-community-signal', { goalId: goal.id, label: goal.label });
                if (achievement.changed && achievement.message) {
                    messages.push(achievement.message);
                }
            } else if (entry.progress !== previous) {
                const percent = goal.target > 0 ? Math.min(100, Math.round((entry.progress / goal.target) * 100)) : 0;
                if (percent - entry.lastBroadcastPercent >= 10) {
                    entry.lastBroadcastPercent = percent;
                    messages.push({ text: `${goal.label} ${percent}%`, meta: { type: 'community' } });
                }
            }
            return { changed, messages };
        }

        function recordScore(deltaScore = 0, { totalScore = 0 } = {}) {
            const messages = [];
            let changed = false;
            const contribution = addCommunityContribution('fleetScore', Math.max(0, Math.round(deltaScore)));
            if (contribution.changed) {
                changed = true;
            }
            messages.push(...contribution.messages);
            if (totalScore >= 120000) {
                const achievement = unlockAchievement('achv-score-scribe', { totalScore });
                if (achievement.changed) {
                    changed = true;
                    if (achievement.message) {
                        messages.push(achievement.message);
                    }
                }
            }
            if (changed || messages.length) {
                commit({ messages });
            }
        }

        function recordStreak({ bestStreak = 0, delta = 0 } = {}) {
            const messages = [];
            let changed = false;
            if (delta > 0) {
                const contribution = addCommunityContribution('streakRelay', delta);
                if (contribution.changed) {
                    changed = true;
                }
                messages.push(...contribution.messages);
            }
            for (const milestone of STREAK_MILESTONES) {
                if (bestStreak >= milestone.threshold && !state.streak.milestonesEarned.includes(milestone.id)) {
                    state.streak.milestonesEarned.push(milestone.id);
                    if (challengeManager?.markMilestoneAchieved) {
                        try {
                            challengeManager.markMilestoneAchieved('streak', milestone);
                        } catch (error) {
                            console.error('streak milestone grant failed', error);
                        }
                    }
                    messages.push({ text: `${milestone.title} milestone achieved!`, meta: { type: 'milestone' } });
                    changed = true;
                }
            }
            if (changed || messages.length) {
                commit({ messages });
            }
        }

        function calculateSeasonPoints(summary = {}) {
            const score = Number(summary.score) || 0;
            const placement = Number(summary.placement);
            const recordedBonus = summary.recorded ? 12 : 6;
            const scoreBonus = Math.floor(score / 40000) * 8;
            const placementBonus = Number.isFinite(placement) && placement > 0 ? Math.max(0, 40 - Math.min(placement, 40)) : 0;
            return Math.max(0, recordedBonus + scoreBonus + placementBonus);
        }

        function recordRun(summary = {}) {
            const messages = [];
            let changed = false;
            const firstFlight = unlockAchievement('achv-first-flight', {
                recorded: summary.recorded,
                score: summary.score
            });
            if (firstFlight.changed) {
                changed = true;
                if (firstFlight.message) {
                    messages.push(firstFlight.message);
                }
            }
            if ((summary.bestStreak ?? 0) >= 12) {
                const comboAce = unlockAchievement('achv-combo-ace', { bestStreak: summary.bestStreak });
                if (comboAce.changed) {
                    changed = true;
                    if (comboAce.message) {
                        messages.push(comboAce.message);
                    }
                }
            }
            const seasonResult = addSeasonPassPoints(calculateSeasonPoints(summary));
            if (seasonResult.changed) {
                changed = true;
            }
            messages.push(...seasonResult.messages);
            if (changed || messages.length) {
                commit({ messages });
            }
        }

        function registerChallengeCompletion(definition) {
            const seasonResult = addSeasonPassPoints(20);
            if (seasonResult.changed || seasonResult.messages.length) {
                commit({ messages: seasonResult.messages });
            }
        }

        function registerRewardClaim(definition, reward) {
            if (!reward) {
                return;
            }
            const rewardLabel = describeReward(reward);
            commit({
                messages: rewardLabel
                    ? [{ text: `Reward claimed: ${rewardLabel}`, meta: { type: 'reward' } }]
                    : []
            });
        }

        function subscribe(listener) {
            if (typeof listener !== 'function') {
                return () => {};
            }
            listeners.add(listener);
            try {
                listener(cachedSnapshot);
            } catch (error) {
                console.error('meta progress subscriber error', error);
            }
            return () => {
                listeners.delete(listener);
            };
        }

        return {
            recordScore,
            recordStreak,
            recordRun,
            registerChallengeCompletion,
            registerRewardClaim,
            subscribe,
            getSnapshot: () => cachedSnapshot
        };
    }

    function syncReducedEffectsMode() {
        const next = manualReducedEffectsEnabled || autoReducedEffectsEnabled;
        const previous = reducedEffectsMode;
        reducedEffectsMode = next;
        if (bodyElement) {
            bodyElement.classList.toggle('reduced-effects', reducedEffectsMode);
            bodyElement.classList.toggle('auto-reduced-effects', autoReducedEffectsEnabled && !manualReducedEffectsEnabled);
        }
        return previous !== next;
    }

    function refreshReducedEffectsStatus() {
        if (!reducedEffectsStatus) {
            if (reducedEffectsToggle) {
                reducedEffectsToggle.indeterminate = !manualReducedEffectsEnabled && autoReducedEffectsEnabled;
            }
            return;
        }
        if (reducedEffectsToggle) {
            reducedEffectsToggle.indeterminate = !manualReducedEffectsEnabled && autoReducedEffectsEnabled;
        }
        if (manualReducedEffectsEnabled) {
            reducedEffectsStatus.textContent = 'On';
        } else if (autoReducedEffectsEnabled) {
            reducedEffectsStatus.textContent = 'Auto';
        } else {
            reducedEffectsStatus.textContent = 'Off';
        }
    }

    function applyReducedEffectsFlag(enabled, { source = 'manual', refreshUI = true } = {}) {
        const normalized = Boolean(enabled);
        if (source === 'manual') {
            manualReducedEffectsEnabled = normalized;
            if (normalized) {
                autoReducedEffectsEnabled = false;
            } else {
                if (autoReducedEffectsEnabled) {
                    autoReducedEffectsEnabled = false;
                }
                performanceMonitor.cooldownUntil = Math.max(
                    performanceMonitor.cooldownUntil,
                    getTimestamp() + AUTO_REDUCED_EFFECTS_MANUAL_COOLDOWN
                );
            }
        } else if (source === 'auto') {
            autoReducedEffectsEnabled = normalized;
            if (!normalized) {
                performanceMonitor.cooldownUntil = Math.max(
                    performanceMonitor.cooldownUntil,
                    getTimestamp() + AUTO_REDUCED_EFFECTS_CHANGE_COOLDOWN
                );
            }
        } else {
            reducedEffectsMode = normalized;
        }
        const changed = syncReducedEffectsMode();
        if (refreshUI) {
            refreshReducedEffectsStatus();
        }
        return changed;
    }

    function updateSettingsUI() {
        if (masterVolumeSlider) {
            const volumePercent = Math.round(settingsState.masterVolume * 100);
            masterVolumeSlider.value = String(volumePercent);
            masterVolumeSlider.setAttribute('aria-valuenow', String(volumePercent));
            masterVolumeSlider.setAttribute('aria-valuetext', `${volumePercent} percent`);
        }
        if (masterVolumeValue) {
            masterVolumeValue.textContent = `${Math.round(settingsState.masterVolume * 100)}%`;
        }
        if (musicToggle) {
            musicToggle.checked = settingsState.musicEnabled;
        }
        if (musicToggleStatus) {
            musicToggleStatus.textContent = settingsState.musicEnabled ? 'On' : 'Off';
        }
        if (sfxToggle) {
            sfxToggle.checked = settingsState.sfxEnabled;
        }
        if (sfxToggleStatus) {
            sfxToggleStatus.textContent = settingsState.sfxEnabled ? 'On' : 'Off';
        }
        if (reducedEffectsToggle) {
            reducedEffectsToggle.checked = settingsState.reducedEffects;
        }
        refreshReducedEffectsStatus();
        if (difficultyRadios.length) {
            const normalizedDifficulty = normalizeDifficultySetting(settingsState.difficulty);
            for (const radio of difficultyRadios) {
                const isSelected = radio.value === normalizedDifficulty;
                radio.checked = isSelected;
                radio.setAttribute('aria-checked', isSelected ? 'true' : 'false');
                const option = radio.closest('.difficulty-option');
                if (option) {
                    option.classList.toggle('selected', isSelected);
                }
            }
            if (difficultyDescriptionEl) {
                const preset = getDifficultyPreset(normalizedDifficulty);
                difficultyDescriptionEl.textContent = preset?.description
                    ? `${preset.label}: ${preset.description}`
                    : '';
            }
        } else if (difficultyDescriptionEl) {
            difficultyDescriptionEl.textContent = '';
        }
    }

    function applySettingsPreferences(partial, { persist = false, announceDifficulty = false } = {}) {
        const previousDifficulty = settingsState?.difficulty;
        settingsState = coerceSettings(partial, settingsState);
        audioManager.setMasterVolume(settingsState.masterVolume);
        audioManager.toggleMusic(settingsState.musicEnabled);
        audioManager.toggleSfx(settingsState.sfxEnabled);
        applyReducedEffectsFlag(settingsState.reducedEffects, { source: 'manual' });
        updateSettingsUI();
        const normalizedDifficulty = normalizeDifficultySetting(settingsState.difficulty);
        const difficultyChanged = normalizeDifficultySetting(previousDifficulty) !== normalizedDifficulty;
        if (!config) {
            activeDifficultyPreset = normalizedDifficulty;
        } else {
            applyDifficultyPreset(normalizedDifficulty, {
                announce: announceDifficulty && difficultyChanged
            });
        }
        if (persist) {
            persistSettingsPreferences();
            hasStoredSettings = true;
        }
        return settingsState;
    }

    settingsState = loadSettingsPreferences();
    applySettingsPreferences(settingsState, { persist: false });

    if (reducedMotionQuery) {
        const handleReducedMotionPreferenceChange = (event) => {
            if (hasStoredSettings) {
                return;
            }
            applySettingsPreferences({ reducedEffects: event.matches }, { persist: false });
        };
        if (!hasStoredSettings && settingsState.reducedEffects !== systemPrefersReducedEffects()) {
            applySettingsPreferences({ reducedEffects: systemPrefersReducedEffects() }, { persist: false });
        }
        if (typeof reducedMotionQuery.addEventListener === 'function') {
            reducedMotionQuery.addEventListener('change', handleReducedMotionPreferenceChange);
            reducedMotionListenerCleanup = () => {
                reducedMotionQuery.removeEventListener('change', handleReducedMotionPreferenceChange);
            };
        } else if (typeof reducedMotionQuery.addListener === 'function') {
            reducedMotionQuery.addListener(handleReducedMotionPreferenceChange);
            reducedMotionListenerCleanup = () => {
                reducedMotionQuery.removeListener(handleReducedMotionPreferenceChange);
            };
        }
    }

    const isSettingsDrawerOpen = () => Boolean(settingsDrawer && !settingsDrawer.hasAttribute('hidden'));

    function setSettingsDrawerOpen(open, { focusTarget = true } = {}) {
        if (!settingsDrawer) {
            return;
        }
        if (open) {
            if (state.gameState === 'running') {
                resumeAfterSettingsClose = pauseGame({ reason: 'settings', showOverlay: false });
            } else {
                resumeAfterSettingsClose = false;
            }
            settingsDrawer.hidden = false;
            settingsDrawer.setAttribute('aria-hidden', 'false');
            settingsButton?.setAttribute('aria-expanded', 'true');
            bodyElement?.classList.add('settings-open');
            const focusEl = masterVolumeSlider ?? settingsCloseButton ?? settingsButton;
            if (focusTarget && focusEl) {
                window.requestAnimationFrame(() => {
                    try {
                        focusEl.focus({ preventScroll: true });
                    } catch {
                        // Ignore focus errors
                    }
                });
            }
        } else {
            settingsDrawer.hidden = true;
            settingsDrawer.setAttribute('aria-hidden', 'true');
            settingsButton?.setAttribute('aria-expanded', 'false');
            bodyElement?.classList.remove('settings-open');
            if (resumeAfterSettingsClose) {
                resumeAfterSettingsClose = false;
                resumeGame();
            }
            if (focusTarget && settingsButton) {
                window.requestAnimationFrame(() => {
                    try {
                        settingsButton.focus({ preventScroll: true });
                    } catch {
                        // Ignore focus errors
                    }
                });
            }
        }
    }

    const openSettingsDrawer = (options = {}) => setSettingsDrawerOpen(true, options);
    const closeSettingsDrawer = (options = {}) => setSettingsDrawerOpen(false, options);
    const toggleSettingsDrawer = () => setSettingsDrawerOpen(!isSettingsDrawerOpen());

    if (settingsButton) {
        settingsButton.addEventListener('click', () => {
            toggleSettingsDrawer();
        });
    }

    if (settingsCloseButton) {
        settingsCloseButton.addEventListener('click', () => {
            closeSettingsDrawer();
        });
    }

    if (settingsDrawer) {
        settingsDrawer.addEventListener('click', (event) => {
            const target = event.target;
            if (target instanceof HTMLElement && target.dataset.settingsDismiss === 'backdrop') {
                closeSettingsDrawer();
            }
        });
    }

    if (masterVolumeSlider) {
        const handleVolumeChange = (persist) => {
            const normalized = clamp(Number(masterVolumeSlider.value) / 100, 0, 1);
            applySettingsPreferences({ masterVolume: normalized }, { persist });
        };
        masterVolumeSlider.addEventListener('input', () => handleVolumeChange(false));
        masterVolumeSlider.addEventListener('change', () => handleVolumeChange(true));
    }

    if (musicToggle) {
        musicToggle.addEventListener('change', () => {
            applySettingsPreferences({ musicEnabled: musicToggle.checked }, { persist: true });
        });
    }

    if (sfxToggle) {
        sfxToggle.addEventListener('change', () => {
            applySettingsPreferences({ sfxEnabled: sfxToggle.checked }, { persist: true });
        });
    }

    if (reducedEffectsToggle) {
        reducedEffectsToggle.addEventListener('change', () => {
            applySettingsPreferences({ reducedEffects: reducedEffectsToggle.checked }, { persist: true });
        });
    }

    if (difficultyRadios.length) {
        for (const radio of difficultyRadios) {
            radio.addEventListener('change', () => {
                if (!radio.checked) {
                    return;
                }
                const normalized = normalizeDifficultySetting(radio.value);
                applySettingsPreferences(
                    { difficulty: normalized },
                    { persist: true, announceDifficulty: true }
                );
            });
        }
    }

    function ensureSubmissionLogEntry(name) {
        if (!name) return;
        if (!Array.isArray(submissionLog[name])) {
            submissionLog[name] = [];
        }
    }

    function getSubmissionUsage(name, now = Date.now()) {
        ensureSubmissionLogEntry(name);
        const cutoff = now - SUBMISSION_WINDOW_MS;
        const recent = submissionLog[name]
            .map((timestamp) => Number(timestamp))
            .filter((timestamp) => Number.isFinite(timestamp) && timestamp >= cutoff)
            .sort((a, b) => a - b);
        submissionLog[name] = recent;
        return { recent, count: recent.length };
    }

    function trackSubmissionUsage(name, timestamp) {
        const { recent } = getSubmissionUsage(name, timestamp);
        recent.push(timestamp);
        recent.sort((a, b) => a - b);
        submissionLog[name] = recent;
        persistSubmissionLog(submissionLog);
        return recent.length;
    }

    function sanitizePlayerName(value) {
        if (typeof value !== 'string') {
            return '';
        }
        const condensed = value.replace(/\s+/g, ' ');
        const filtered = condensed.replace(/[^A-Za-z0-9 _\-]/g, '');
        return filtered.trim().slice(0, 24);
    }

    const temporaryCallsignPrefixes = [
        'Rookie',
        'Nova',
        'Echo',
        'Photon',
        'Lunar',
        'Comet',
        'Vector',
        'Aurora',
        'Orbit',
        'Nebula',
        'Zenith',
        'Glide'
    ];
    const temporaryCallsignSuffixes = [
        'Wing',
        'Spark',
        'Dash',
        'Scout',
        'Runner',
        'Pilot',
        'Flare',
        'Pulse',
        'Glider',
        'Trail',
        'Burst',
        'Rider'
    ];

    function generateTemporaryCallsign() {
        const prefix =
            temporaryCallsignPrefixes[Math.floor(Math.random() * temporaryCallsignPrefixes.length)] || 'Rookie';
        const suffix =
            temporaryCallsignSuffixes[Math.floor(Math.random() * temporaryCallsignSuffixes.length)] || 'Pilot';
        const number = Math.floor(Math.random() * 90) + 10;
        const raw = `${prefix} ${suffix}${number}`;
        const sanitized = sanitizePlayerName(raw);
        return sanitized.length >= 3 ? sanitized : 'Flight Cadet';
    }

    function refreshFlyNowButton() {
        if (!flyNowButton) {
            return;
        }
        const shouldShow = firstRunExperience && !quickStartUsed;
        flyNowButton.hidden = !shouldShow;
        flyNowButton.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        flyNowButton.disabled = !shouldShow;
    }

    function refreshOverlayLaunchButton() {
        if (!overlayButton) {
            return;
        }
        const mode = overlayButton.dataset.launchMode || (state.gameState === 'ready' ? 'launch' : 'retry');
        let label = overlayButton.textContent ?? '';
        if (mode === 'launch') {
            label = getLaunchControlText();
        } else if (mode === 'retry') {
            label = getRetryControlText();
        } else if (mode === 'prepare') {
            label = 'Confirm Callsign';
        }
        let shouldDisable = false;
        if (mode === 'prepare' && playerNameInput) {
            const pendingInput = sanitizePlayerName(playerNameInput.value);
            shouldDisable = pendingInput.length === 0;
        }
        overlayButton.disabled = shouldDisable;
        overlayButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        if (label && overlayButton.textContent !== label) {
            overlayButton.textContent = label;
        }
    }

    function startTutorialFlight() {
        if (!flyNowButton || state.gameState === 'running') {
            return;
        }
        const generatedCallsign = generateTemporaryCallsign();
        tutorialCallsign = generatedCallsign;
        quickStartUsed = true;
        refreshFlyNowButton();
        startGame({ skipCommit: true, tutorial: true, tutorialCallsign: generatedCallsign });
    }

    function getPendingPlayerName() {
        if (!playerNameInput) {
            return playerName;
        }
        const sanitized = sanitizePlayerName(playerNameInput.value);
        return sanitized || DEFAULT_PLAYER_NAME;
    }

    function loadStoredPlayerName() {
        const storedName = readStorage(STORAGE_KEYS.playerName);
        const sanitized = sanitizePlayerName(storedName);
        if (sanitized) {
            return sanitized;
        }
        return DEFAULT_PLAYER_NAME;
    }

    const MAX_STORED_HIGH_SCORES = 10;
    const DISPLAY_HIGH_SCORE_COUNT = 3;
    let highScoreData = loadHighScores();
    let playerName = loadStoredPlayerName();
    if (!highScoreData[playerName]) {
        highScoreData[playerName] = [];
    }
    updateHighScorePanel();
    ensureSubmissionLogEntry(playerName);
    writeStorage(STORAGE_KEYS.playerName, playerName);
    const cachedLeaderboards = loadLeaderboard();
    const leaderboardState = {
        scopes: {
            global: cachedLeaderboards.global ?? [],
            weekly: cachedLeaderboards.weekly ?? []
        },
        fetchedAt: cachedLeaderboards.fetchedAt ?? 0,
        source: cachedLeaderboards.fetchedAt ? 'cache' : 'empty',
        error: null
    };
    let activeLeaderboardScope = 'global';
    let leaderboardEntries = leaderboardState.scopes[activeLeaderboardScope] ?? [];
    const leaderboardStatusState = { message: '', type: 'info' };
    let leaderboardFetchPromise = null;
    let offlineModeActive = false;

    function setLeaderboardStatus(message, type = 'info') {
        leaderboardStatusState.message = typeof message === 'string' ? message.trim() : '';
        const allowedTypes = new Set(['info', 'success', 'error', 'warning', 'loading']);
        const nextType = allowedTypes.has(type) ? type : 'info';
        leaderboardStatusState.type = nextType;
        if (!leaderboardStatusEl) {
            return leaderboardStatusState;
        }
        leaderboardStatusEl.classList.remove('success', 'error', 'warning', 'loading');
        if (!leaderboardStatusState.message) {
            leaderboardStatusEl.textContent = '';
            leaderboardStatusEl.hidden = true;
            return leaderboardStatusState;
        }
        leaderboardStatusEl.hidden = false;
        leaderboardStatusEl.textContent = leaderboardStatusState.message;
        if (nextType !== 'info') {
            leaderboardStatusEl.classList.add(nextType);
        }
        return leaderboardStatusState;
    }

    function renderLeaderboardEntries(entries) {
        if (!leaderboardListEl) {
            return;
        }
        leaderboardListEl.textContent = '';
        const list = Array.isArray(entries) ? entries : [];
        if (!list.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'empty';
            emptyItem.textContent = 'No ranked flights logged yet.';
            leaderboardListEl.append(emptyItem);
            return;
        }
        list.forEach((entry) => {
            if (!entry || typeof entry !== 'object') {
                return;
            }
            const item = document.createElement('li');
            const primaryLine = document.createElement('div');
            const playerName = typeof entry.player === 'string' ? entry.player : DEFAULT_PLAYER_NAME;
            const score = Number.isFinite(entry.score) ? Math.max(0, Math.floor(entry.score)) : 0;
            const timeMs = Number.isFinite(entry.timeMs) ? Math.max(0, Math.floor(entry.timeMs)) : 0;
            primaryLine.textContent = `${playerName} — ${score.toLocaleString()} pts`;
            const metaLine = document.createElement('div');
            metaLine.className = 'meta';
            const streak = Number.isFinite(entry.bestStreak) ? Math.max(0, Math.floor(entry.bestStreak)) : 0;
            const nyan = Number.isFinite(entry.nyan) ? Math.max(0, Math.floor(entry.nyan)) : 0;
            const details = [`Time ${formatTime(timeMs)}`];
            if (streak) {
                details.push(`Tail x${streak}`);
            }
            if (nyan) {
                details.push(`${nyan.toLocaleString()} pickups`);
            }
            const recordedAt = Number.isFinite(entry.recordedAt)
                ? Math.max(0, Math.floor(entry.recordedAt))
                : Date.now();
            const relative = formatRelativeTime(recordedAt);
            if (relative) {
                details.push(relative);
            }
            metaLine.textContent = details.join(' • ');
            item.append(primaryLine, metaLine);
            leaderboardListEl.append(item);
        });
    }

    function updateLeaderboardTitle() {
        if (!leaderboardTitleEl) {
            return;
        }
        const scopeLabel = activeLeaderboardScope === 'weekly' ? 'Weekly Standings' : 'Galaxy Standings';
        const updated = leaderboardState.fetchedAt ? formatRelativeTime(leaderboardState.fetchedAt) : '';
        const finalTitle = updated ? `${scopeLabel} • Synced ${updated}` : scopeLabel;
        if (leaderboardTitleEl.textContent !== finalTitle) {
            leaderboardTitleEl.textContent = finalTitle;
        }
        leaderboardTitleEl.dataset.scope = activeLeaderboardScope;
    }

    function setActiveLeaderboardScope(nextScope) {
        const availableScopes = Array.isArray(API_CONFIG.scopes) && API_CONFIG.scopes.length
            ? API_CONFIG.scopes
            : ['global'];
        const normalized = availableScopes.includes(nextScope) ? nextScope : 'global';
        activeLeaderboardScope = normalized;
        leaderboardEntries = Array.isArray(leaderboardState.scopes[normalized])
            ? leaderboardState.scopes[normalized].slice()
            : [];
        leaderboardTabButtons.forEach((button) => {
            if (!(button instanceof HTMLElement)) {
                return;
            }
            const scope = button.dataset.leaderboardScope ?? '';
            const isActive = scope === normalized;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            button.setAttribute('tabindex', isActive ? '0' : '-1');
        });
        if (leaderboardListEl) {
            leaderboardListEl.dataset.scope = normalized;
        }
        renderLeaderboardEntries(leaderboardEntries);
        updateLeaderboardTitle();
        return leaderboardEntries;
    }

    function applyLeaderboardSnapshot(snapshot, { source = 'remote', persist = true } = {}) {
        const sanitized = sanitizeLeaderboardSnapshot(snapshot);
        leaderboardState.scopes = {
            ...leaderboardState.scopes,
            global: sanitized.global ?? [],
            weekly: sanitized.weekly ?? []
        };
        leaderboardState.fetchedAt = sanitized.fetchedAt ?? Date.now();
        leaderboardState.source = source;
        leaderboardState.error = null;
        if (persist) {
            persistLeaderboard({
                global: leaderboardState.scopes.global,
                weekly: leaderboardState.scopes.weekly,
                fetchedAt: leaderboardState.fetchedAt
            });
        }
        setActiveLeaderboardScope(activeLeaderboardScope);
        if (source === 'cache' && leaderboardState.fetchedAt) {
            const relative = formatRelativeTime(leaderboardState.fetchedAt);
            const suffix = relative ? ` — last synced ${relative}.` : '.';
            setLeaderboardStatus(`Showing cached standings${suffix}`, 'info');
        } else if (source === 'empty') {
            setLeaderboardStatus('No standings available yet. Complete a ranked run to take the lead!', 'info');
        }
        return sanitized;
    }

    function refreshLeaderboardsFromApi({ force = false } = {}) {
        if (!API_CONFIG.baseUrl) {
            return Promise.resolve(null);
        }
        if (!getIsOnline()) {
            if (force) {
                setLeaderboardStatus('Offline mode — showing cached standings.', 'warning');
            }
            offlineModeActive = true;
            return Promise.resolve(null);
        }
        offlineModeActive = false;
        const now = Date.now();
        const cacheAge = now - (leaderboardState.fetchedAt || 0);
        if (!force && leaderboardState.fetchedAt && cacheAge < API_CONFIG.cacheTtlMs) {
            return Promise.resolve(null);
        }
        if (leaderboardFetchPromise) {
            return leaderboardFetchPromise;
        }
        const scopes = Array.isArray(API_CONFIG.scopes) && API_CONFIG.scopes.length
            ? API_CONFIG.scopes.join(',')
            : 'global';
        const endpoint = buildApiUrl(`leaderboards?scopes=${encodeURIComponent(scopes)}`);
        if (!endpoint) {
            return Promise.resolve(null);
        }
        leaderboardFetchPromise = (async () => {
            try {
                setLeaderboardStatus('Syncing galaxy standings…', 'loading');
                const response = await fetchWithTimeout(endpoint, {
                    method: 'GET',
                    headers: { Accept: 'application/json' }
                });
                if (!response.ok) {
                    throw new Error(`Leaderboard request failed with status ${response.status}`);
                }
                const payload = await parseJsonSafely(response);
                if (!payload || typeof payload !== 'object') {
                    throw new Error('Invalid leaderboard response payload.');
                }
                const leaderboards =
                    payload && typeof payload === 'object' && payload.leaderboards && typeof payload.leaderboards === 'object'
                        ? payload.leaderboards
                        : {};
                const sanitized = applyLeaderboardSnapshot(
                    {
                        global: leaderboards.global ?? [],
                        weekly: leaderboards.weekly ?? [],
                        fetchedAt: payload.fetchedAt
                    },
                    { source: 'remote', persist: true }
                );
                const relative = leaderboardState.fetchedAt ? formatRelativeTime(leaderboardState.fetchedAt) : '';
                const suffix = relative ? ` — synced ${relative}.` : '.';
                setLeaderboardStatus(`Standings updated${suffix}`, 'success');
                return sanitized;
            } catch (error) {
                console.error('Failed to refresh leaderboards', error);
                leaderboardState.error = error;
                setLeaderboardStatus(
                    'Unable to sync leaderboards right now. Showing last known standings.',
                    'error'
                );
                if (!getIsOnline()) {
                    offlineModeActive = true;
                }
                return null;
            } finally {
                leaderboardFetchPromise = null;
            }
        })();
        return leaderboardFetchPromise;
    }

    function getIsOnline() {
        if (typeof navigator === 'undefined') {
            return true;
        }
        return navigator.onLine !== false;
    }

    function updateNetworkStatus({ announce = false } = {}) {
        const online = getIsOnline();
        if (announce) {
            if (!online && !offlineModeActive) {
                setLeaderboardStatus('Offline mode — showing cached standings.', 'warning');
            } else if (online && offlineModeActive && API_CONFIG.baseUrl) {
                setLeaderboardStatus('Back online — syncing standings…', 'info');
            }
        }
        offlineModeActive = !online;
        return online;
    }
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    let lastRunSummary = null;
    let pendingSubmission = null;
    let preflightOverlayDismissed = false;
    let preflightReady = false;
    let tutorialFlightActive = false;
    let tutorialCallsign = null;
    let activeSummaryTab = summarySections.has('run') ? 'run' : summarySections.keys().next().value ?? null;
    let resumeAfterSettingsClose = false;

    function setActiveSummaryTab(tabId, { focusTab = false } = {}) {
        if (!tabId || !summarySections.has(tabId)) {
            return;
        }
        activeSummaryTab = tabId;
        summarySections.forEach((section, key) => {
            const isActive = key === tabId;
            if (isActive) {
                section.hidden = false;
                section.classList.add('active');
            } else {
                section.hidden = true;
                section.classList.remove('active');
            }
        });
        summaryTabButtons.forEach((button) => {
            if (!(button instanceof HTMLElement)) {
                return;
            }
            const key = button.dataset.summaryTab;
            const isActive = key === tabId;
            button.classList.toggle('active', isActive);
            if (isActive) {
                button.setAttribute('aria-selected', 'true');
                button.setAttribute('tabindex', '0');
                if (focusTab) {
                    try {
                        button.focus({ preventScroll: true });
                    } catch {
                        button.focus();
                    }
                }
            } else {
                button.setAttribute('aria-selected', 'false');
                button.setAttribute('tabindex', '-1');
            }
        });
    }

    function focusSummaryTabByOffset(currentButton, offset) {
        if (!summaryTabButtons.length || !offset) {
            return;
        }
        const index = summaryTabButtons.indexOf(currentButton);
        if (index < 0) {
            return;
        }
        const nextIndex = (index + offset + summaryTabButtons.length) % summaryTabButtons.length;
        const nextButton = summaryTabButtons[nextIndex];
        const tabId = nextButton?.dataset?.summaryTab;
        if (tabId) {
            setActiveSummaryTab(tabId, { focusTab: true });
        }
    }

    if (summaryTabButtons.length && activeSummaryTab) {
        setActiveSummaryTab(activeSummaryTab);
        summaryTabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const tabId = button.dataset.summaryTab;
                if (tabId) {
                    setActiveSummaryTab(tabId);
                }
            });
            button.addEventListener('keydown', (event) => {
                if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusSummaryTabByOffset(button, 1);
                } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusSummaryTabByOffset(button, -1);
                }
            });
        });
    }

    function updatePlayerName(nextName) {
        const sanitized = sanitizePlayerName(nextName) || DEFAULT_PLAYER_NAME;
        if (sanitized === playerName) {
            if (playerNameInput && playerNameInput.value !== sanitized) {
                playerNameInput.value = sanitized;
            }
            return playerName;
        }
        playerName = sanitized;
        if (!highScoreData[playerName]) {
            highScoreData[playerName] = [];
        }
        ensureSubmissionLogEntry(playerName);
        persistHighScores(highScoreData);
        writeStorage(STORAGE_KEYS.playerName, playerName);
        if (playerNameInput && playerNameInput.value !== sanitized) {
            playerNameInput.value = sanitized;
        }
        updateHighScorePanel();
        if (lastRunSummary) {
            lastRunSummary.player = playerName;
            updateSharePanel();
        }
        refreshOverlayLaunchButton();
        return playerName;
    }

    function commitPlayerNameInput() {
        if (!playerNameInput) {
            return updatePlayerName(playerName);
        }
        const sanitized = sanitizePlayerName(playerNameInput.value);
        const finalName = sanitized || DEFAULT_PLAYER_NAME;
        if (playerNameInput.value !== finalName) {
            playerNameInput.value = finalName;
        }
        refreshOverlayLaunchButton();
        const updated = updatePlayerName(finalName);
        refreshHighScorePreview();
        revealGameScreenAfterNameEntry();
        return updated;
    }

    if (playerNameInput) {
        playerNameInput.value = playerName;
        refreshOverlayLaunchButton();
        refreshHighScorePreview();
        playerNameInput.addEventListener('input', () => {
            refreshOverlayLaunchButton();
            refreshHighScorePreview();
        });
        playerNameInput.addEventListener('blur', () => {
            commitPlayerNameInput();
        });
        playerNameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                event.stopPropagation();
                commitPlayerNameInput();
            }
        });
    }

    if (callsignForm) {
        callsignForm.addEventListener('submit', (event) => {
            event.preventDefault();
            event.stopPropagation?.();
            commitPlayerNameInput();
        });
    }

    if (leaderboardTabButtons.length) {
        leaderboardTabButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const scope = button?.dataset?.leaderboardScope ?? 'global';
                setActiveLeaderboardScope(scope);
            });
        });
    }

    applyLeaderboardSnapshot(cachedLeaderboards, {
        source: cachedLeaderboards.fetchedAt ? 'cache' : 'empty',
        persist: false
    });

    const initialOnline = updateNetworkStatus({ announce: true });

    if (API_CONFIG.baseUrl) {
        if (initialOnline) {
            refreshLeaderboardsFromApi({ force: true });
        }
    } else {
        setLeaderboardStatus(
            'Leaderboard sync unavailable — set NYAN_ESCAPE_API_BASE_URL to enable syncing.',
            'warning'
        );
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            const online = updateNetworkStatus({ announce: true });
            if (API_CONFIG.baseUrl && online) {
                refreshLeaderboardsFromApi({ force: true });
            }
        });
        window.addEventListener('offline', () => {
            updateNetworkStatus({ announce: true });
        });
    }

    function completeFirstRunExperience() {
        if (!firstRunExperience) {
            return;
        }
        firstRunExperience = false;
        refreshFlyNowButton();
        if (comicIntro) {
            comicIntro.hidden = true;
        }
        writeStorage(STORAGE_KEYS.firstRunComplete, 'true');
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const tenths = Math.floor((milliseconds % 1000) / 100);
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
    }

    function updateTimerDisplay() {
        if (!timerValueEl) {
            return;
        }

        let displayMs = 0;
        if (state.gameState === 'running' || state.gameState === 'paused') {
            displayMs = state.elapsedTime;
        } else if (pendingSubmission && pendingSubmission.timeMs != null) {
            const pendingMs = Number(pendingSubmission.timeMs);
            if (Number.isFinite(pendingMs)) {
                displayMs = pendingMs;
            }
        } else if (Number.isFinite(state.elapsedTime) && state.elapsedTime > 0) {
            displayMs = state.elapsedTime;
        } else if (lastRunSummary && lastRunSummary.timeMs != null) {
            const summaryMs = Number(lastRunSummary.timeMs);
            if (Number.isFinite(summaryMs)) {
                displayMs = summaryMs;
            }
        }

        if (!Number.isFinite(displayMs)) {
            displayMs = 0;
        }

        const safeMs = Math.max(0, displayMs);
        const formatted = formatTime(safeMs);
        if (formatted !== lastFormattedTimer) {
            timerValueEl.textContent = formatted;
            lastFormattedTimer = formatted;
        }

        if (survivalTimerEl) {
            const ariaPrefix = state.gameState === 'paused' ? 'Flight time paused' : 'Flight time';
            const ariaLabel = `${ariaPrefix}: ${formatted}`;
            if (survivalTimerEl.getAttribute('aria-label') !== ariaLabel) {
                survivalTimerEl.setAttribute('aria-label', ariaLabel);
            }
        }
    }

    function setRunSummaryStatus(message, type = 'info') {
        const allowedTypes = new Set(['info', 'success', 'warning', 'error']);
        const normalizedMessage = typeof message === 'string' ? message.trim() : '';
        const normalizedType = allowedTypes.has(type) ? type : 'info';
        runSummaryStatusState.message = normalizedMessage;
        runSummaryStatusState.type = normalizedType;
        if (!runSummaryStatusEl) {
            return runSummaryStatusState;
        }
        runSummaryStatusEl.classList.remove('success', 'warning', 'error');
        if (!normalizedMessage) {
            runSummaryStatusEl.textContent = '';
            runSummaryStatusEl.hidden = true;
            return runSummaryStatusState;
        }
        runSummaryStatusEl.hidden = false;
        runSummaryStatusEl.textContent = normalizedMessage;
        if (normalizedType !== 'info') {
            runSummaryStatusEl.classList.add(normalizedType);
        }
        return runSummaryStatusState;
    }

    function describeRunSummaryStatus(summary) {
        if (!summary) {
            return {
                message: 'Complete a ranked flight to log your stats.',
                type: 'info'
            };
        }

        const safeTime = Math.max(0, Math.floor(Number(summary.timeMs) || 0));
        const safeScore = Math.max(0, Math.floor(Number(summary.score) || 0));
        const baseDescriptor = `${formatTime(safeTime)} • ${safeScore.toLocaleString()} pts`;
        if (summary.recorded) {
            let suffix = '';
            const timestamp = Number(summary.recordedAt);
            if (Number.isFinite(timestamp)) {
                const relative = formatRelativeTime(timestamp);
                if (relative) {
                    suffix = ` • Logged ${relative}`;
                }
            }
            return {
                message: `Flight log recorded — ${baseDescriptor}${suffix}`,
                type: 'success'
            };
        }

        switch (summary.reason) {
            case 'tutorial':
                return {
                    message: 'Training flight complete. Confirm your callsign to prep for ranked runs.',
                    type: 'info'
                };
            case 'pending':
                return {
                    message: 'Submit this flight log to record your score.',
                    type: 'warning'
                };
            case 'limit':
                return {
                    message: 'Daily flight log limit reached. Run not submitted.',
                    type: 'warning'
                };
            case 'skipped':
                return {
                    message: 'Submission skipped. Run not recorded.',
                    type: 'info'
                };
            case 'conflict':
                return {
                    message: 'A stronger run is already on the board. Keep pushing for a higher score.',
                    type: 'warning'
                };
            case 'error':
                return {
                    message: 'Submission failed. Try again shortly.',
                    type: 'error'
                };
            default:
                return {
                    message: baseDescriptor,
                    type: 'info'
                };
        }
    }

    function setShareButtonEnabled(enabled) {
        if (!shareButton) {
            return;
        }
        shareButton.disabled = !enabled;
        shareButton.setAttribute('aria-disabled', enabled ? 'false' : 'true');
    }

    function detachShareButtonHandler() {
        if (shareButton && typeof shareButtonClickHandler === 'function') {
            shareButton.removeEventListener('click', shareButtonClickHandler);
        }
        shareButtonClickHandler = null;
    }

    function buildRunSharePayload(summary) {
        const safePlayer = sanitizePlayerName(summary?.player) || playerName || DEFAULT_PLAYER_NAME;
        const safeTime = Math.max(0, Math.floor(Number(summary?.timeMs) || 0));
        const safeScore = Math.max(0, Math.floor(Number(summary?.score) || 0));
        const safeNyan = Math.max(0, Math.floor(Number(summary?.nyan) || 0));
        const safeBestStreak = Math.max(0, Math.floor(Number(summary?.bestStreak) || 0));
        const lines = [
            `${safePlayer} survived ${formatTime(safeTime)} in Flyin' Nyan!`,
            `Score: ${safeScore.toLocaleString()} pts — Pickups: ${safeNyan.toLocaleString()}`
        ];
        if (safeBestStreak > 0) {
            lines.push(`Best tail: x${safeBestStreak}`);
        }
        if (Number.isFinite(summary?.placement) && summary.placement > 0) {
            lines.push(`Galaxy standings: #${summary.placement}`);
        }
        const hasRunsToday = typeof summary?.runsToday === 'number';
        if (hasRunsToday) {
            const runsUsed = Math.min(Math.max(summary.runsToday, 0), SUBMISSION_LIMIT);
            lines.push(`Daily log: ${runsUsed}/${SUBMISSION_LIMIT}`);
        }
        let shareUrl = 'https://flyinnyan.com';
        if (typeof window !== 'undefined' && window.location) {
            const { origin, pathname, href } = window.location;
            shareUrl = origin && pathname ? `${origin}${pathname}` : href || shareUrl;
        }
        return {
            player: safePlayer,
            title: `Flyin' Nyan – Flight log for ${safePlayer}`,
            text: lines.join('\n'),
            url: shareUrl
        };
    }

    function updateRunSummaryOverview() {
        if (!runSummaryTimeEl || !runSummaryScoreEl || !runSummaryStreakEl || !runSummaryNyanEl) {
            return;
        }

        if (!lastRunSummary) {
            runSummaryTimeEl.textContent = '—';
            runSummaryScoreEl.textContent = '—';
            runSummaryStreakEl.textContent = '—';
            runSummaryNyanEl.textContent = '—';
            if (runSummaryPlacementEl) {
                runSummaryPlacementEl.textContent = '';
                runSummaryPlacementEl.hidden = true;
            }
            if (runSummaryRunsEl) {
                runSummaryRunsEl.textContent = '';
                runSummaryRunsEl.hidden = true;
            }
            if (!runSummaryStatusState.message) {
                setRunSummaryStatus('Complete a ranked flight to log your stats.', 'info');
            }
            return;
        }

        const summary = lastRunSummary;
        const safeTime = Math.max(0, Math.floor(Number(summary.timeMs) || 0));
        const safeScore = Math.max(0, Math.floor(Number(summary.score) || 0));
        const safeBestStreak = Math.max(0, Math.floor(Number(summary.bestStreak) || 0));
        const safeNyan = Math.max(0, Math.floor(Number(summary.nyan) || 0));
        runSummaryTimeEl.textContent = formatTime(safeTime);
        runSummaryScoreEl.textContent = safeScore.toLocaleString();
        runSummaryStreakEl.textContent = `x${safeBestStreak}`;
        runSummaryNyanEl.textContent = safeNyan.toLocaleString();

        if (runSummaryPlacementEl) {
            let placementMessage = '';
            if (Number.isFinite(summary.placement) && summary.placement > 0) {
                placementMessage = `Galaxy standings: #${summary.placement}`;
            } else if (summary.recorded) {
                placementMessage = 'Galaxy standings: Awaiting placement';
            } else if (summary.reason === 'pending') {
                placementMessage = 'Submit this run to enter the galaxy standings.';
            } else if (summary.reason === 'limit') {
                placementMessage = 'Galaxy standings: Daily log limit reached';
            } else if (summary.reason === 'skipped') {
                placementMessage = 'Galaxy standings: Submission skipped';
            } else if (summary.reason === 'conflict') {
                placementMessage = 'Galaxy standings: Stronger run already recorded';
            } else if (summary.reason === 'error') {
                placementMessage = 'Galaxy standings: Submission error';
            }
            runSummaryPlacementEl.textContent = placementMessage;
            runSummaryPlacementEl.hidden = !placementMessage;
        }

        if (runSummaryRunsEl) {
            if (typeof summary.runsToday === 'number') {
                const runsUsed = Math.min(Math.max(summary.runsToday, 0), SUBMISSION_LIMIT);
                runSummaryRunsEl.textContent = `Daily logs used: ${runsUsed}/${SUBMISSION_LIMIT}`;
                runSummaryRunsEl.hidden = false;
            } else {
                runSummaryRunsEl.textContent = '';
                runSummaryRunsEl.hidden = true;
            }
        }

        const { message, type } = describeRunSummaryStatus(summary);
        setRunSummaryStatus(message, type);
    }

    function updateSharePanel() {
        if (!shareButton || !shareStatusEl) {
            return;
        }

        const summary = pendingSubmission ?? lastRunSummary;
        const hasSummary = summary && Number.isFinite(Number(summary.timeMs)) && Number.isFinite(Number(summary.score));
        if (!hasSummary) {
            detachShareButtonHandler();
            setShareButtonEnabled(false);
            shareStatusEl.textContent = 'Complete a ranked run to unlock sharing.';
            return;
        }

        const payload = buildRunSharePayload(summary);
        detachShareButtonHandler();
        const handleShareClick = async () => {
            setShareButtonEnabled(false);
            shareStatusEl.textContent = canNativeShare
                ? 'Preparing flight log…'
                : 'Copying flight log to clipboard…';
            try {
                if (canNativeShare && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
                    await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
                    shareStatusEl.textContent = 'Flight log shared with the fleet!';
                } else {
                    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null;
                    if (clipboard && typeof clipboard.writeText === 'function') {
                        await clipboard.writeText(`${payload.text}\n${payload.url}`);
                        shareStatusEl.textContent = 'Flight log copied to clipboard.';
                    } else {
                        shareStatusEl.textContent = 'Sharing unavailable — copy the flight log manually:';
                        console.info(`${payload.text}\n${payload.url}`);
                    }
                }
            } catch (error) {
                console.error('Failed to share flight log', error);
                shareStatusEl.textContent = 'Unable to share flight log right now.';
            } finally {
                setShareButtonEnabled(true);
            }
        };
        shareButton.addEventListener('click', handleShareClick);
        shareButtonClickHandler = handleShareClick;
        setShareButtonEnabled(true);
        shareStatusEl.textContent = canNativeShare
            ? 'Share your latest flight log with the fleet.'
            : 'Copy your latest flight log to the clipboard.';
    }

    function normalizeHighScoreEntry(entry = {}) {
        const normalized = {
            timeMs: Number.isFinite(entry.timeMs) ? Math.max(0, Math.floor(entry.timeMs)) : 0,
            score: Number.isFinite(entry.score) ? Math.max(0, Math.floor(entry.score)) : 0,
            bestStreak: Number.isFinite(entry.bestStreak)
                ? Math.max(0, Math.floor(entry.bestStreak))
                : 0,
            nyan: Number.isFinite(entry.nyan) ? Math.max(0, Math.floor(entry.nyan)) : 0,
            recordedAt: Number.isFinite(entry.recordedAt)
                ? Math.max(0, Math.floor(entry.recordedAt))
                : Date.now()
        };
        return normalized;
    }

    function getPlayerHighScores(name) {
        const key = sanitizePlayerName(name) || DEFAULT_PLAYER_NAME;
        if (!highScoreData[key]) {
            highScoreData[key] = [];
        }
        const entries = Array.isArray(highScoreData[key]) ? highScoreData[key] : [];
        return entries.slice();
    }

    function sortHighScores(a, b) {
        if ((b?.timeMs ?? 0) !== (a?.timeMs ?? 0)) {
            return (b?.timeMs ?? 0) - (a?.timeMs ?? 0);
        }
        if ((b?.score ?? 0) !== (a?.score ?? 0)) {
            return (b?.score ?? 0) - (a?.score ?? 0);
        }
        if ((b?.bestStreak ?? 0) !== (a?.bestStreak ?? 0)) {
            return (b?.bestStreak ?? 0) - (a?.bestStreak ?? 0);
        }
        return (a?.recordedAt ?? 0) - (b?.recordedAt ?? 0);
    }

    function describeHighScoreEntry(entry) {
        const parts = [];
        parts.push(`Flight time: ${formatTime(entry.timeMs)}`);
        parts.push(`Score: ${entry.score.toLocaleString()} pts`);
        if (entry.bestStreak) {
            parts.push(`Best tail: x${entry.bestStreak}`);
        }
        if (entry.nyan) {
            parts.push(`Pickups: ${entry.nyan.toLocaleString()}`);
        }
        if (entry.recordedAt) {
            try {
                const recordedDate = new Date(entry.recordedAt);
                if (!Number.isNaN(recordedDate.getTime())) {
                    parts.push(`Logged: ${recordedDate.toLocaleString()}`);
                }
            } catch {
                // Ignore invalid dates
            }
        }
        return parts.join('\n');
    }

    function renderHighScoreListForPlayer(name, { preview = false } = {}) {
        if (!highScoreListEl || !highScoreTitleEl) {
            return;
        }
        const targetName = sanitizePlayerName(name) || DEFAULT_PLAYER_NAME;
        const entries = getPlayerHighScores(targetName).sort(sortHighScores);
        highScoreListEl.textContent = '';
        if (!entries.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'empty';
            emptyItem.textContent = preview
                ? 'No ranked flights logged for this callsign yet.'
                : 'Log a ranked flight to track your best runs here.';
            highScoreListEl.append(emptyItem);
        } else {
            entries
                .slice(0, DISPLAY_HIGH_SCORE_COUNT)
                .forEach((entry) => {
                    const item = document.createElement('li');
                    const timeSpan = document.createElement('span');
                    timeSpan.className = 'time';
                    timeSpan.textContent = formatTime(entry.timeMs);
                    const separator = document.createTextNode(' — ');
                    const scoreSpan = document.createElement('span');
                    scoreSpan.className = 'score';
                    scoreSpan.textContent = `${entry.score.toLocaleString()} pts`;
                    item.append(timeSpan, separator, scoreSpan);
                    const tooltip = describeHighScoreEntry(entry);
                    if (tooltip) {
                        item.title = tooltip;
                    }
                    highScoreListEl.append(item);
                });
        }
        const previewLabel = preview && targetName !== playerName ? ' (preview)' : '';
        const heading = `Top Flight Times — ${targetName}${previewLabel}`;
        if (highScoreTitleEl.textContent !== heading) {
            highScoreTitleEl.textContent = heading;
        }
        highScoreTitleEl.dataset.playerName = targetName;
        highScoreTitleEl.dataset.preview = preview ? 'true' : 'false';
    }

    function updateHighScorePanel() {
        renderHighScoreListForPlayer(playerName, { preview: false });
    }

    function isOverlayVisible() {
        if (!overlay) {
            return false;
        }
        if (overlay.classList.contains('hidden')) {
            return false;
        }
        return overlay.getAttribute('aria-hidden') !== 'true';
    }

    function refreshHighScorePreview() {
        const overlayActive = isOverlayVisible();
        const pendingName = overlayActive ? getPendingPlayerName() : playerName;
        const previewMode = overlayActive && pendingName !== playerName;
        renderHighScoreListForPlayer(pendingName, { preview: previewMode });
    }

    function recordLocalHighScore(entry) {
        const targetName = sanitizePlayerName(entry?.player) || DEFAULT_PLAYER_NAME;
        const normalized = normalizeHighScoreEntry(entry);
        const scores = getPlayerHighScores(targetName);
        scores.push(normalized);
        scores.sort(sortHighScores);
        highScoreData[targetName] = scores.slice(0, MAX_STORED_HIGH_SCORES);
        persistHighScores(highScoreData);
        if (targetName === playerName) {
            updateHighScorePanel();
        }
        if (isOverlayVisible()) {
            refreshHighScorePreview();
        }
    }

    function buildRunSummaryMessage(baseMessage, summary, {
        placement = null,
        runsToday = null,
        limitReached = false,
        prompt = false,
        success = false,
        skipped = false,
        offline = false,
        conflict = false,
        errorMessage = null
    } = {}) {
        const lines = [
            baseMessage,
            `Flight Time: ${formatTime(summary.timeMs)}`,
            `Final Score: ${summary.score} — Points collected: ${summary.nyan.toLocaleString()}`
        ];
        if (placement) {
            lines.push(`Galaxy Standings: #${placement}`);
        }
        if (typeof runsToday === 'number') {
            lines.push(`Daily Log: ${Math.min(runsToday, SUBMISSION_LIMIT)}/${SUBMISSION_LIMIT} submissions used.`);
        }
        if (limitReached) {
            lines.push('Daily flight log limit reached. Try again after the cooldown.');
        }
        if (prompt) {
            lines.push('Submit this flight log to record your score?');
        }
        if (success) {
            lines.push('Score logged successfully! Ready for another run?');
        }
        if (skipped) {
            lines.push('Submission skipped. Run not recorded.');
        }
        if (conflict) {
            lines.push('Submission ignored — your best run is already on the board.');
        }
        if (offline) {
            lines.push('Offline mode: storing this flight log locally until the next sync.');
        }
        if (errorMessage) {
            lines.push(errorMessage);
        }
        return lines.join('\n');
    }

    function formatRelativeTime(timestamp) {
        if (!timestamp) return '';
        const now = Date.now();
        const diff = Math.max(0, now - timestamp);
        const seconds = Math.floor(diff / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
    }

    function createStoryManager() {
        return {
            prepareForRun() {},
            beginRun() {},
            recordEvent() {},
            completeRun() {},
            update() {},
            reset() {}
        };
    }

    const storyManager = createStoryManager();

    const asteroidImageSources =
        Array.isArray(assetOverrides.asteroids) && assetOverrides.asteroids.length
            ? assetOverrides.asteroids
            : ['assets/asteroid1.png', 'assets/asteroid2.png', 'assets/asteroid3.png'];
    const asteroidImages = asteroidImageSources.map((entry, index) =>
        loadImageWithFallback(resolveAssetConfig(entry, null), () => createAsteroidFallbackDataUrl(index))
    );

    const powerUpOverrides =
        assetOverrides.powerUps && typeof assetOverrides.powerUps === 'object' ? assetOverrides.powerUps : {};
    const powerUpImageSources = {
        powerBomb: 'assets/powerbomb.png',
        bulletSpread: 'assets/powerburger.png',
        flameWhip: 'assets/powerember.svg',
        missiles: 'assets/powerpizza.png',
        [DOUBLE_TEAM_POWER]: 'assets/powerdouble.svg',
        hyperBeam: 'assets/powerbeam.svg',
        pumpDrive: 'assets/pump.png',
        timeDilation: 'assets/powerchrono.svg',
        scoreSurge: 'assets/powerdoubler.svg',
        starlightMagnet: 'assets/powermagnet.svg'
    };

    const powerUpImages = {};
    for (const [type, defaultSrc] of Object.entries(powerUpImageSources)) {
        powerUpImages[type] = loadImageWithFallback(
            resolveAssetConfig(powerUpOverrides[type], defaultSrc),
            () => defaultSrc
        );
    }

    if (
        typeof getCharacterProfile === 'function' &&
        typeof setActiveCharacter === 'function' &&
        typeof setPendingCharacter === 'function' &&
        typeof activeCharacterId !== 'undefined'
    ) {
        const initialCharacterProfile = getCharacterProfile(activeCharacterId);
        if (initialCharacterProfile) {
            setActiveCharacter(initialCharacterProfile);
            setPendingCharacter(initialCharacterProfile.id, { updateSummary: false });
        }
    }
    if (!config || typeof config !== 'object') {
        config = {};
    }

    const defaultCollectScore = 84;
    const baseCollectScoreRaw = config?.score?.collect;
    const baseCollectScore = Number.isFinite(Number(baseCollectScoreRaw))
        ? Math.max(1, Number(baseCollectScoreRaw))
        : defaultCollectScore;
    const fallbackScoreConfig =
        typeof baseGameConfig !== 'undefined' && baseGameConfig && isPlainObject(baseGameConfig.score)
            ? baseGameConfig.score
            : {};
    if (!config.score || !isPlainObject(config.score)) {
        config.score = { ...fallbackScoreConfig };
    }
    config.score.collect = baseCollectScore;

    const collectibleTiers = [
        {
            key: 'point',
            label: 'POINT',
            src: 'assets/point.png',
            points: baseCollectScore,
            weight: 0.62,
            sizeMultiplier: 1,
            glow: {
                inner: 'rgba(255, 215, 0, 0.9)',
                outer: 'rgba(255, 215, 0, 0.25)'
            },
            particleColor: { r: 255, g: 215, b: 0 }
        },
        {
            key: 'point2',
            label: 'POINT+',
            src: 'assets/point2.png',
            points: Math.round(baseCollectScore * 1.75),
            weight: 0.26,
            sizeMultiplier: 1.08,
            glow: {
                inner: 'rgba(96, 165, 250, 0.9)',
                outer: 'rgba(96, 165, 250, 0.22)'
            },
            particleColor: { r: 96, g: 165, b: 250 }
        },
        {
            key: 'point3',
            label: 'POINT++',
            src: 'assets/point3.png',
            points: Math.round(baseCollectScore * 2.5),
            weight: 0.12,
            sizeMultiplier: 1.16,
            glow: {
                inner: 'rgba(192, 132, 252, 0.95)',
                outer: 'rgba(192, 132, 252, 0.28)'
            },
            particleColor: { r: 192, g: 132, b: 252 }
        }
    ];

    const collectibleOverrides =
        assetOverrides.collectibles && typeof assetOverrides.collectibles === 'object'
            ? assetOverrides.collectibles
            : {};
    for (const tier of collectibleTiers) {
        tier.asset = resolveAssetConfig(collectibleOverrides[tier.key], tier.src ?? null);
        if (typeof tier.asset === 'string') {
            tier.src = tier.asset;
        } else if (tier.asset && typeof tier.asset === 'object' && typeof tier.asset.src === 'string') {
            tier.src = tier.asset.src;
        }
    }

    const collectibleImages = {};
    for (const tier of collectibleTiers) {
        const fallbackSrc = createCollectibleFallbackDataUrl(tier);
        const assetConfig = tier.asset ?? tier.src ?? null;
        collectibleImages[tier.key] = loadImageWithFallback(
            assetConfig ?? fallbackSrc,
            () => fallbackSrc ?? tier.src ?? null
        );
    }

    const totalCollectibleWeight = collectibleTiers.reduce((sum, tier) => sum + tier.weight, 0);

    state = {
        score: 0,
        nyan: 0,
        streak: 0,
        bestStreak: 0,
        tailLength: config.baseTrailLength,
        tailTarget: config.baseTrailLength,
        comboTimer: 0,
        gameSpeed: config.baseGameSpeed,
        timeSinceLastShot: 0,
        gameState: 'ready',
        elapsedTime: 0,
        powerUpTimers: {
            powerBomb: 0,
            bulletSpread: 0,
            flameWhip: 0,
            missiles: 0,
            [DOUBLE_TEAM_POWER]: 0,
            hyperBeam: 0,
            radiantShield: 0,
            pumpDrive: 0,
            timeDilation: 0,
            scoreSurge: 0,
            starlightMagnet: 0
        },
        powerBombPulseTimer: 0,
        lastVillainKey: null,
        recentVillains: [],
        meteorShowerTimer: 0,
        nextMeteorShower: 0,
        dashTimer: 0,
        shieldHitPulse: 0,
        bossBattle: {
            triggered: false,
            active: false,
            bossSpawned: false,
            defeated: false,
            powerUpSpawned: false,
            alertTimer: 0,
            nextEventIndex: 0,
            currentIndex: null,
            currentConfig: null
        }
    };

    updateTimerDisplay();

    const keys = new Set();
    const dashTapTracker = new Map();
    const formControlSelector = 'input, textarea, select, button, [role="button"], [contenteditable="true"]';
    const textEntrySelector = [
        'textarea',
        '[contenteditable="true"]',
        'input:not([type])',
        'input[type="text"]',
        'input[type="search"]',
        'input[type="email"]',
        'input[type="password"]',
        'input[type="tel"]',
        'input[type="url"]',
        'input[type="number"]'
    ].join(',');

    function isFormControlTarget(target) {
        if (!target || typeof target.closest !== 'function') {
            return false;
        }
        return Boolean(target.closest(formControlSelector));
    }

    function isTextEntryTarget(target) {
        if (!target || typeof target.closest !== 'function') {
            return false;
        }
        return Boolean(target.closest(textEntrySelector));
    }

    const canonicalizeSpaceKey = (value) => {
        if (typeof value !== 'string') {
            return null;
        }

        if (value === ' ' || value === '\u00A0') {
            return 'Space';
        }

        switch (value) {
            case 'Space':
            case 'Spacebar':
            case 'space':
            case 'spacebar':
                return 'Space';
            default:
                return null;
        }
    };

    const keyAliasMap = {
        ArrowUp: 'ArrowUp',
        Up: 'ArrowUp',
        Numpad8: 'ArrowUp',
        ArrowDown: 'ArrowDown',
        Down: 'ArrowDown',
        Numpad2: 'ArrowDown',
        ArrowLeft: 'ArrowLeft',
        Left: 'ArrowLeft',
        Numpad4: 'ArrowLeft',
        ArrowRight: 'ArrowRight',
        Right: 'ArrowRight',
        Numpad6: 'ArrowRight',
        Space: 'Space',
        Spacebar: 'Space',
        ' ': 'Space'
    };
    const keyCodeAliasMap = {
        13: 'Enter',
        27: 'Escape',
        32: 'Space',
        37: 'ArrowLeft',
        38: 'ArrowUp',
        39: 'ArrowRight',
        40: 'ArrowDown',
        65: 'KeyA',
        68: 'KeyD',
        83: 'KeyS',
        87: 'KeyW'
    };
    const preventDefaultKeys = new Set([
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
        'Space'
    ]);
    function normalizeKey(event) {
        const { code, key } = event;
        const canonicalCode = canonicalizeSpaceKey(code);
        if (canonicalCode) {
            return canonicalCode;
        }
        if (code && keyAliasMap[code]) {
            return keyAliasMap[code];
        }
        if (code) {
            return code;
        }
        const canonicalKey = canonicalizeSpaceKey(key);
        if (canonicalKey) {
            return canonicalKey;
        }
        if (key && keyAliasMap[key]) {
            return keyAliasMap[key];
        }
        if (key && key.length === 1) {
            const upper = key.toUpperCase();
            if (upper >= 'A' && upper <= 'Z') {
                return `Key${upper}`;
            }
        }
        if (typeof event.keyCode === 'number' && keyCodeAliasMap[event.keyCode]) {
            return keyCodeAliasMap[event.keyCode];
        }
        if (typeof event.which === 'number' && keyCodeAliasMap[event.which]) {
            return keyCodeAliasMap[event.which];
        }
        return key ?? code;
    }
    const dashDirections = {
        ArrowUp: { x: 0, y: -1 },
        KeyW: { x: 0, y: -1 },
        ArrowDown: { x: 0, y: 1 },
        KeyS: { x: 0, y: 1 },
        ArrowLeft: { x: -1, y: 0 },
        KeyA: { x: -1, y: 0 },
        ArrowRight: { x: 1, y: 0 },
        KeyD: { x: 1, y: 0 }
    };
    const virtualInput = {
        moveX: 0,
        moveY: 0,
        firing: false,
        smoothedX: 0,
        smoothedY: 0
    };
    const gamepadInput = {
        moveX: 0,
        moveY: 0,
        firing: false
    };
    const previousGamepadButtons = [];
    const previousGamepadDirection = { x: 0, y: 0 };
    const lastGamepadMoveVector = { x: 1, y: 0 };
    let activeGamepadIndex = null;
    const hasGamepadSupport =
        typeof window !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        typeof navigator.getGamepads === 'function';
    const GAMEPAD_DEADZONE = 0.2;
    const GAMEPAD_CURSOR_DEADZONE = 0.25;
    const GAMEPAD_CURSOR_SPEED = 1500;
    const GAMEPAD_CURSOR_INACTIVITY_MS = 4000;
    const GAMEPAD_CURSOR_POINTER_ID = 999;
    const GAMEPAD_DASH_ACTIVATION_THRESHOLD = 0.6;
    const GAMEPAD_BUTTONS = {
        CROSS: 0,
        CIRCLE: 1,
        SQUARE: 2,
        TRIANGLE: 3,
        L1: 4,
        R1: 5,
        L2: 6,
        R2: 7,
        CREATE: 8,
        OPTIONS: 9,
        L3: 10,
        R3: 11,
        DPAD_UP: 12,
        DPAD_DOWN: 13,
        DPAD_LEFT: 14,
        DPAD_RIGHT: 15
    };
    const GAMEPAD_TRIGGER_THRESHOLD = 0.35;
    const GAMEPAD_DASH_ASSIST_ANALOG_THRESHOLD = 0.35;
    const GAMEPAD_HAT_TOLERANCE = 0.05;
    const GAMEPAD_STANDARD_HAT_DIRECTIONS = [
        { value: -1, x: 0, y: -1 },
        { value: -0.7142857142857143, x: 1, y: -1 },
        { value: -0.42857142857142855, x: 1, y: 0 },
        { value: -0.14285714285714285, x: 1, y: 1 },
        { value: 0.14285714285714285, x: 0, y: 1 },
        { value: 0.42857142857142855, x: -1, y: 1 },
        { value: 0.7142857142857143, x: -1, y: 0 },
        { value: 1, x: -1, y: -1 }
    ];
    const joystickState = {
        pointerId: null,
        touchId: null
    };
    let firePointerId = null;
    let fireTouchId = null;
    const projectiles = [];
    const enemyProjectiles = [];
    const obstacles = [];
    const collectibles = [];
    const powerUps = [];
    let asteroidSpawnTimer = 0;
    const particles = [];
    const villainExplosions = [];
    const trail = [];
    const pumpTailState = {
        active: false,
        bars: [],
        waveTime: 0,
        fade: 0,
        amplitude: 1,
        frequency: 1.6,
        spread: 220,
        baseHeight: 160,
        centerX: 0,
        releasePending: false,
        segments: []
    };
    const areaBursts = [];
    const floatingTexts = [];
    const cameraShake = { intensity: 0, duration: 0, elapsed: 0, offsetX: 0, offsetY: 0 };
    const hyperBeamState = {
        intensity: 0,
        wave: 0,
        sparkTimer: 0,
        bounds: null
    };
    spawnTimers = {
        obstacle: 0,
        collectible: 0,
        powerUp: 0
    };

    function resetGamepadInput() {
        gamepadInput.moveX = 0;
        gamepadInput.moveY = 0;
        gamepadInput.firing = false;
        resetGamepadCursor({ immediateHide: true });
        previousGamepadDirection.x = 0;
        previousGamepadDirection.y = 0;
    }

    function resetGamepadCursor({ immediateHide = false } = {}) {
        gamepadCursorState.axisX = 0;
        gamepadCursorState.axisY = 0;
        gamepadCursorState.lastUpdate = null;
        gamepadCursorState.pointerDownTarget = null;
        gamepadCursorState.buttonHeld = false;
        if (immediateHide) {
            gamepadCursorState.active = false;
            gamepadCursorState.lastInputTime = 0;
            setGamepadCursorClickState(false);
            setGamepadCursorVisible(false);
        } else {
            setGamepadCursorClickState(false);
        }
    }

    function setGamepadCursorVisible(visible) {
        if (!controllerCursorEl) {
            return;
        }
        controllerCursorEl.classList.toggle('visible', Boolean(visible));
        if (!visible) {
            controllerCursorEl.classList.remove('clicking');
        }
    }

    function setGamepadCursorClickState(active) {
        if (!controllerCursorEl) {
            return;
        }
        controllerCursorEl.classList.toggle('clicking', Boolean(active));
    }

    function updateGamepadCursorPosition(x, y) {
        if (!controllerCursorEl) {
            return;
        }
        controllerCursorEl.style.left = `${x}px`;
        controllerCursorEl.style.top = `${y}px`;
    }

    function markGamepadCursorActive(timestamp = performance.now()) {
        gamepadCursorState.active = true;
        gamepadCursorState.lastInputTime = timestamp;
        setGamepadCursorVisible(true);
    }

    function refreshGamepadCursorBounds({ recenter = false } = {}) {
        if (typeof window === 'undefined') {
            return;
        }
        const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0;
        const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0;
        const minX = GAMEPAD_CURSOR_HALF_SIZE;
        const minY = GAMEPAD_CURSOR_HALF_SIZE;
        const maxX = Math.max(minX, viewportWidth - GAMEPAD_CURSOR_HALF_SIZE);
        const maxY = Math.max(minY, viewportHeight - GAMEPAD_CURSOR_HALF_SIZE);
        gamepadCursorBounds.left = minX;
        gamepadCursorBounds.top = minY;
        gamepadCursorBounds.right = maxX;
        gamepadCursorBounds.bottom = maxY;

        if (!controllerCursorEl) {
            return;
        }

        if (recenter || !gamepadCursorState.active) {
            const canvasRect = canvas?.getBoundingClientRect();
            const targetX = canvasRect
                ? clamp(canvasRect.left + canvasRect.width * 0.5, minX, maxX)
                : clamp(viewportWidth * 0.5, minX, maxX);
            const targetY = canvasRect
                ? clamp(canvasRect.top + canvasRect.height * 0.5, minY, maxY)
                : clamp(viewportHeight * 0.5, minY, maxY);
            gamepadCursorState.x = targetX;
            gamepadCursorState.y = targetY;
            updateGamepadCursorPosition(targetX, targetY);
        } else {
            const clampedX = clamp(gamepadCursorState.x, minX, maxX);
            const clampedY = clamp(gamepadCursorState.y, minY, maxY);
            if (clampedX !== gamepadCursorState.x || clampedY !== gamepadCursorState.y) {
                gamepadCursorState.x = clampedX;
                gamepadCursorState.y = clampedY;
            }
            updateGamepadCursorPosition(gamepadCursorState.x, gamepadCursorState.y);
        }
    }

    function updateGamepadCursorAxes(axisX, axisY, digitalX = 0, digitalY = 0) {
        const normalizedX = clamp(axisX, -1, 1);
        const normalizedY = clamp(axisY, -1, 1);
        const normalizedDigitalX = clamp(digitalX, -1, 1);
        const normalizedDigitalY = clamp(digitalY, -1, 1);
        const combinedX = normalizedX !== 0 ? normalizedX : normalizedDigitalX;
        const combinedY = normalizedY !== 0 ? normalizedY : normalizedDigitalY;
        gamepadCursorState.axisX = combinedX;
        gamepadCursorState.axisY = combinedY;
        if (combinedX !== 0 || combinedY !== 0) {
            markGamepadCursorActive();
        }
    }

    function dispatchGamepadPointerEvent(type, target, clientX, clientY, { buttons = 0 } = {}) {
        if (!target) {
            return true;
        }
        const eventInit = {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: (window?.screenX ?? 0) + clientX,
            screenY: (window?.screenY ?? 0) + clientY,
            pointerId: GAMEPAD_CURSOR_POINTER_ID,
            pointerType: 'mouse',
            isPrimary: true,
            button: 0,
            buttons
        };
        if (typeof window !== 'undefined' && typeof window.PointerEvent === 'function') {
            const event = new PointerEvent(type, eventInit);
            return target.dispatchEvent(event);
        }
        const fallback = new MouseEvent(type.replace('pointer', 'mouse'), eventInit);
        return target.dispatchEvent(fallback);
    }

    function dispatchGamepadMouseEvent(type, target, clientX, clientY, { buttons = 0 } = {}) {
        if (!target) {
            return true;
        }
        const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX: (window?.screenX ?? 0) + clientX,
            screenY: (window?.screenY ?? 0) + clientY,
            button: 0,
            buttons
        });
        return target.dispatchEvent(event);
    }

    function processGamepadCursorPressDown() {
        const clientX = gamepadCursorState.x;
        const clientY = gamepadCursorState.y;
        const target = document.elementFromPoint?.(clientX, clientY) ?? null;
        markGamepadCursorActive();
        if (!target) {
            gamepadCursorState.pointerDownTarget = null;
            gamepadCursorState.buttonHeld = false;
            return false;
        }
        gamepadCursorState.pointerDownTarget = target;
        gamepadCursorState.buttonHeld = true;
        setGamepadCursorClickState(true);
        dispatchGamepadPointerEvent('pointerdown', target, clientX, clientY, { buttons: 1 });
        dispatchGamepadMouseEvent('mousedown', target, clientX, clientY, { buttons: 1 });
        if (typeof target.focus === 'function') {
            try {
                target.focus({ preventScroll: true });
            } catch {
                // Ignore focus errors
            }
        }
        return true;
    }

    function processGamepadCursorPressUp() {
        const clientX = gamepadCursorState.x;
        const clientY = gamepadCursorState.y;
        const upTarget = document.elementFromPoint?.(clientX, clientY) ?? null;
        const downTarget = gamepadCursorState.pointerDownTarget;
        dispatchGamepadPointerEvent('pointerup', upTarget ?? downTarget, clientX, clientY, { buttons: 0 });
        dispatchGamepadMouseEvent('mouseup', upTarget ?? downTarget, clientX, clientY, { buttons: 0 });
        if (downTarget && downTarget === upTarget) {
            const clickEvent = new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX,
                clientY,
                screenX: (window?.screenX ?? 0) + clientX,
                screenY: (window?.screenY ?? 0) + clientY,
                button: 0
            });
            downTarget.dispatchEvent(clickEvent);
        }
        gamepadCursorState.pointerDownTarget = null;
        gamepadCursorState.buttonHeld = false;
        setGamepadCursorClickState(false);
    }

    function handleGamepadCursorPress({ isPressed, justPressed, justReleased }) {
        const usingCursor =
            gamepadCursorState.active ||
            gamepadCursorState.buttonHeld ||
            gamepadCursorState.axisX !== 0 ||
            gamepadCursorState.axisY !== 0;
        let consumed = false;

        if (justPressed && usingCursor) {
            consumed = processGamepadCursorPressDown();
        }

        if (isPressed && usingCursor) {
            markGamepadCursorActive();
            if (gamepadCursorState.buttonHeld) {
                consumed = true;
            }
        }

        if (justReleased && gamepadCursorState.buttonHeld) {
            consumed = true;
            processGamepadCursorPressUp();
        }

        if (justReleased && !gamepadCursorState.buttonHeld) {
            setGamepadCursorClickState(false);
        }

        return consumed;
    }

    function updateGamepadCursor(timestamp = performance.now()) {
        if (!controllerCursorEl) {
            return;
        }
        if (gamepadCursorState.lastUpdate === null) {
            gamepadCursorState.lastUpdate = timestamp;
            if (gamepadCursorState.x === 0 && gamepadCursorState.y === 0) {
                refreshGamepadCursorBounds({ recenter: true });
            } else {
                updateGamepadCursorPosition(gamepadCursorState.x, gamepadCursorState.y);
            }
            return;
        }
        const delta = Math.max(0, Math.min(48, timestamp - gamepadCursorState.lastUpdate));
        gamepadCursorState.lastUpdate = timestamp;

        const axisX = gamepadCursorState.axisX;
        const axisY = gamepadCursorState.axisY;

        if (axisX !== 0 || axisY !== 0) {
            const distance = (GAMEPAD_CURSOR_SPEED * delta) / 1000;
            const nextX = clamp(gamepadCursorState.x + axisX * distance, gamepadCursorBounds.left, gamepadCursorBounds.right);
            const nextY = clamp(gamepadCursorState.y + axisY * distance, gamepadCursorBounds.top, gamepadCursorBounds.bottom);
            if (nextX !== gamepadCursorState.x || nextY !== gamepadCursorState.y) {
                gamepadCursorState.x = nextX;
                gamepadCursorState.y = nextY;
                updateGamepadCursorPosition(nextX, nextY);
                markGamepadCursorActive(timestamp);
            }
        }

        if (
            gamepadCursorState.active &&
            !gamepadCursorState.buttonHeld &&
            axisX === 0 &&
            axisY === 0 &&
            timestamp - gamepadCursorState.lastInputTime > GAMEPAD_CURSOR_INACTIVITY_MS
        ) {
            gamepadCursorState.active = false;
            setGamepadCursorVisible(false);
        }
    }

    function handleGamepadDashTap(key, direction, now) {
        const lastTap = dashTapTracker.get(key);
        if (lastTap && now - lastTap <= config.player.dash.doubleTapWindow) {
            dashTapTracker.delete(key);
            triggerDash(direction);
        } else {
            dashTapTracker.set(key, now);
        }
    }

    function processGamepadDashInput(digitalX, digitalY) {
        const now = performance.now();
        if (digitalX !== previousGamepadDirection.x) {
            if (digitalX !== 0) {
                const key = digitalX > 0 ? 'gamepad-right' : 'gamepad-left';
                handleGamepadDashTap(key, { x: digitalX, y: 0 }, now);
            }
        }
        if (digitalY !== previousGamepadDirection.y) {
            if (digitalY !== 0) {
                const key = digitalY > 0 ? 'gamepad-down' : 'gamepad-up';
                handleGamepadDashTap(key, { x: 0, y: digitalY }, now);
            }
        }
        previousGamepadDirection.x = digitalX;
        previousGamepadDirection.y = digitalY;
    }

    function normalizeDashAssistComponent(value, threshold = GAMEPAD_DASH_ASSIST_ANALOG_THRESHOLD) {
        if (Math.abs(value) < threshold) {
            return 0;
        }
        return value > 0 ? 1 : -1;
    }

    function resolveDashAssistDirection(dashX, dashY, axisX, axisY) {
        let directionX = dashX;
        let directionY = dashY;

        if (directionX === 0 && directionY === 0) {
            directionX = normalizeDashAssistComponent(axisX);
            directionY = normalizeDashAssistComponent(axisY);
        }

        if (directionX === 0 && directionY === 0) {
            const lastMagnitude = Math.hypot(lastGamepadMoveVector.x, lastGamepadMoveVector.y);
            if (lastMagnitude >= 0.3) {
                directionX = normalizeDashAssistComponent(lastGamepadMoveVector.x, 0.25);
                directionY = normalizeDashAssistComponent(lastGamepadMoveVector.y, 0.25);
            }
        }

        if (directionX === 0 && directionY === 0) {
            const playerSpeed = Math.hypot(player.vx, player.vy);
            if (playerSpeed >= 40) {
                if (Math.abs(player.vx) >= Math.abs(player.vy)) {
                    directionX = player.vx >= 0 ? 1 : -1;
                } else {
                    directionY = player.vy >= 0 ? 1 : -1;
                }
            }
        }

        if (directionX === 0 && directionY === 0) {
            directionX = 1;
        }

        return { x: directionX, y: directionY };
    }

    function triggerDashAssist(dashX, dashY, axisX, axisY) {
        const direction = resolveDashAssistDirection(dashX, dashY, axisX, axisY);
        if (!direction) {
            return;
        }
        triggerDash(direction);
    }

    function applyGamepadDeadZone(value, threshold = GAMEPAD_DEADZONE) {
        if (Math.abs(value) < threshold) {
            return 0;
        }
        const normalized = (Math.abs(value) - threshold) / (1 - threshold);
        const sign = value < 0 ? -1 : 1;
        return normalized * sign;
    }

    function getGamepadHatDirection(value) {
        if (typeof value !== 'number') {
            return null;
        }

        for (const direction of GAMEPAD_STANDARD_HAT_DIRECTIONS) {
            if (Math.abs(value - direction.value) <= GAMEPAD_HAT_TOLERANCE) {
                return direction;
            }
        }

        return null;
    }

    function handleGamepadPrimaryAction() {
        if (state.gameState === 'paused') {
            resumeGame();
            return;
        }

        if (state.gameState === 'ready') {
            if (preflightReady) {
                startGame();
            } else {
                const mode = overlayButton?.dataset.launchMode || 'launch';
                handleOverlayAction(mode);
            }
            return;
        }

        if (state.gameState === 'gameover') {
            const mode = overlayButton?.dataset.launchMode || (pendingSubmission ? 'submit' : 'retry');
            handleOverlayAction(mode);
        }
    }

    function handleGamepadMetaActions(buttonStates, { suppressCross = false } = {}) {
        if (!buttonStates) {
            return;
        }
        const wasPressed = (index) => Boolean(previousGamepadButtons[index]);
        const isPressed = (index) => Boolean(buttonStates[index]);
        const justPressed = (index) => isPressed(index) && !wasPressed(index);

        if (justPressed(GAMEPAD_BUTTONS.OPTIONS)) {
            if (state.gameState === 'running') {
                pauseGame({ reason: 'gamepad' });
                return;
            }
            if (state.gameState === 'paused') {
                resumeGame();
                return;
            }
            handleGamepadPrimaryAction();
            return;
        }

        if (!suppressCross && state.gameState !== 'running' && justPressed(GAMEPAD_BUTTONS.CROSS)) {
            handleGamepadPrimaryAction();
        }
    }

    function updateGamepadInput() {
        if (!hasGamepadSupport) {
            return;
        }
        const getGamepads = navigator.getGamepads?.bind(navigator);
        if (typeof getGamepads !== 'function') {
            return;
        }
        const gamepads = getGamepads() || [];
        let gamepad = null;

        if (activeGamepadIndex !== null) {
            gamepad = gamepads[activeGamepadIndex] || null;
        }

        if (!gamepad) {
            activeGamepadIndex = null;
            for (const candidate of gamepads) {
                if (candidate) {
                    activeGamepadIndex = candidate.index;
                    gamepad = candidate;
                    break;
                }
            }
        }

        if (!gamepad) {
            resetGamepadInput();
            if (previousGamepadButtons.length) {
                previousGamepadButtons.length = 0;
            }
            return;
        }

        const axes = gamepad.axes || [];
        const axisX = applyGamepadDeadZone(axes[0] ?? 0);
        const axisY = applyGamepadDeadZone(axes[1] ?? 0);
        const pointerAxisX = applyGamepadDeadZone(axes[2] ?? 0, GAMEPAD_CURSOR_DEADZONE);
        const pointerAxisY = applyGamepadDeadZone(axes[3] ?? 0, GAMEPAD_CURSOR_DEADZONE);

        const buttons = gamepad.buttons || [];
        const buttonStates = buttons.map((button) => Boolean(button?.pressed));

        const crossPressed = Boolean(buttons[GAMEPAD_BUTTONS.CROSS]?.pressed);
        const previousCross = Boolean(previousGamepadButtons[GAMEPAD_BUTTONS.CROSS]);
        const crossJustPressed = crossPressed && !previousCross;
        const crossJustReleased = !crossPressed && previousCross;
        const cursorConsumed = handleGamepadCursorPress({
            isPressed: crossPressed,
            justPressed: crossJustPressed,
            justReleased: crossJustReleased
        });

        handleGamepadMetaActions(buttonStates, { suppressCross: cursorConsumed });

        const dashAssistQueued = state.gameState === 'running' && crossJustPressed && !cursorConsumed;

        let dpadX = (buttons[GAMEPAD_BUTTONS.DPAD_RIGHT]?.pressed ? 1 : 0) -
            (buttons[GAMEPAD_BUTTONS.DPAD_LEFT]?.pressed ? 1 : 0);
        let dpadY = (buttons[GAMEPAD_BUTTONS.DPAD_DOWN]?.pressed ? 1 : 0) -
            (buttons[GAMEPAD_BUTTONS.DPAD_UP]?.pressed ? 1 : 0);

        if (dpadX === 0 && dpadY === 0) {
            const hatDirection = getGamepadHatDirection(axes[9]);
            if (hatDirection) {
                dpadX = hatDirection.x;
                dpadY = hatDirection.y;
            }
        }

        const allowDigitalCursorControl = state.gameState !== 'running';
        updateGamepadCursorAxes(
            pointerAxisX,
            pointerAxisY,
            allowDigitalCursorControl ? dpadX : 0,
            allowDigitalCursorControl ? dpadY : 0
        );

        gamepadInput.moveX = clamp(axisX + dpadX, -1, 1);
        gamepadInput.moveY = clamp(axisY + dpadY, -1, 1);

        const moveMagnitude = Math.hypot(gamepadInput.moveX, gamepadInput.moveY);
        if (moveMagnitude >= 0.3) {
            lastGamepadMoveVector.x = gamepadInput.moveX;
            lastGamepadMoveVector.y = gamepadInput.moveY;
        }

        const analogDashX = Math.abs(axisX) >= GAMEPAD_DASH_ACTIVATION_THRESHOLD ? (axisX > 0 ? 1 : -1) : 0;
        const analogDashY = Math.abs(axisY) >= GAMEPAD_DASH_ACTIVATION_THRESHOLD ? (axisY > 0 ? 1 : -1) : 0;
        const dashX = dpadX !== 0 ? dpadX : analogDashX;
        const dashY = dpadY !== 0 ? dpadY : analogDashY;
        if (dashX !== 0 || dashY !== 0) {
            lastGamepadMoveVector.x = dashX;
            lastGamepadMoveVector.y = dashY;
        }
        processGamepadDashInput(dashX, dashY);

        const rightTrigger = buttons[GAMEPAD_BUTTONS.R2];
        const leftTrigger = buttons[GAMEPAD_BUTTONS.L2];
        const triggerPressed = Boolean((rightTrigger?.value ?? 0) > GAMEPAD_TRIGGER_THRESHOLD || rightTrigger?.pressed);
        const altTriggerPressed = Boolean((leftTrigger?.value ?? 0) > GAMEPAD_TRIGGER_THRESHOLD || leftTrigger?.pressed);
        const faceButtonPressed = Boolean(
            buttons[GAMEPAD_BUTTONS.CROSS]?.pressed || buttons[GAMEPAD_BUTTONS.SQUARE]?.pressed
        );
        const bumperPressed = Boolean(
            buttons[GAMEPAD_BUTTONS.R1]?.pressed || buttons[GAMEPAD_BUTTONS.L1]?.pressed
        );

        gamepadInput.firing = triggerPressed || altTriggerPressed || faceButtonPressed || bumperPressed;

        if (dashAssistQueued) {
            triggerDashAssist(dashX, dashY, axisX, axisY);
        }

        previousGamepadButtons.length = buttonStates.length;
        for (let i = 0; i < buttonStates.length; i++) {
            previousGamepadButtons[i] = buttonStates[i];
        }
    }

    if (hasGamepadSupport) {
        window.addEventListener('gamepadconnected', (event) => {
            if (typeof event?.gamepad?.index === 'number') {
                activeGamepadIndex = event.gamepad.index;
            }
        });
        window.addEventListener('gamepaddisconnected', (event) => {
            if (typeof event?.gamepad?.index === 'number' && event.gamepad.index === activeGamepadIndex) {
                activeGamepadIndex = null;
                resetGamepadInput();
                previousGamepadButtons.length = 0;
            }
        });
    }


    const villainExplosionPalettes = {
        villain1: {
            core: { r: 255, g: 170, b: 255 },
            halo: { r: 140, g: 195, b: 255 },
            spark: { r: 210, g: 240, b: 255 }
        },
        villain2: {
            core: { r: 120, g: 255, b: 214 },
            halo: { r: 90, g: 200, b: 255 },
            spark: { r: 180, g: 255, b: 220 }
        },
        villain3: {
            core: { r: 255, g: 120, b: 160 },
            halo: { r: 255, g: 200, b: 120 },
            spark: { r: 255, g: 180, b: 140 }
        },
        boss: {
            core: { r: 255, g: 105, b: 180 },
            halo: { r: 120, g: 190, b: 255 },
            spark: { r: 240, g: 255, b: 255 }
        }
    };

    const BOSS_ALERT_DURATION = 2000;
    const bossSizeProfiles = balancedSpriteSizing.bosses ?? [];
    const villainSizeProfiles = balancedSpriteSizing.villains ?? {};
    const bossBattleDefinitions = [
        {
            timeMs: 60000,
            villain: {
                key: 'bossAlpha',
                name: 'Celestial Behemoth',
                imageSrc: 'assets/boss1.png',
                width: bossSizeProfiles[0]?.width ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.3),
                height: bossSizeProfiles[0]?.height ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.3),
                health: 36,
                speed: 110,
                rotation: { min: 0, max: 0 },
                behavior: { type: 'hover', amplitude: 72, verticalSpeed: 70 },
                isBoss: true
            },
            attack: {
                type: 'focused',
                cooldown: 2400,
                projectileSpeed: 360,
                projectileSize: { width: 32, height: 14 },
                color: '#f472b6',
                onHitMessage: 'The boss vaporized your ship!'
            }
        },
        {
            timeMs: 180000,
            villain: {
                key: 'bossBeta',
                name: 'Solar Basilisk',
                imageSrc: 'assets/boss1.png',
                width: bossSizeProfiles[1]?.width ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.55),
                height: bossSizeProfiles[1]?.height ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.55),
                health: 52,
                speed: 125,
                rotation: { min: 0, max: 0 },
                behavior: { type: 'sweep', amplitude: 180, speed: 1.8, followSpeed: 2.1 },
                isBoss: true
            },
            attack: {
                type: 'spread',
                cooldown: 2200,
                projectileSpeed: 420,
                projectileSize: { width: 28, height: 12 },
                color: '#fb923c',
                spreadAngle: Math.PI / 12,
                count: 3,
                onHitMessage: 'Solar Basilisk scorched your hull!'
            }
        },
        {
            timeMs: 300000,
            villain: {
                key: 'bossOmega',
                name: 'Void Hydra',
                imageSrc: 'assets/boss1.png',
                width: bossSizeProfiles[2]?.width ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.8),
                height: bossSizeProfiles[2]?.height ?? Math.round((balancedSpriteSizing.referenceWidth ?? 96) * 2.8),
                health: 72,
                speed: 140,
                rotation: { min: 0, max: 0 },
                behavior: { type: 'tracker', acceleration: 340, maxSpeed: 360 },
                isBoss: true
            },
            attack: {
                type: 'barrage',
                cooldown: 4600,
                projectileSpeed: 520,
                projectileSize: { width: 30, height: 14 },
                color: '#60a5fa',
                burstCount: 5,
                burstInterval: 200,
                onHitMessage: 'Void Hydra speared your ship!'
            }
        }
    ];

    const villainTypes = [
        {
            key: 'villain1',
            name: 'Void Raider',
            imageSrc: 'assets/villain1.png',
            size: { ...(villainSizeProfiles.small ?? { min: 59, max: 77 }) },
            speedOffset: { min: 14, max: 34 },
            rotation: { min: -1.8, max: 1.8 },
            baseHealth: 1,
            healthGrowth: 0.7,
            behavior: { type: 'sine', amplitude: 36, speed: 2.8 }
        },
        {
            key: 'villain2',
            name: 'Nebula Marauder',
            imageSrc: 'assets/villain2.png',
            size: { ...(villainSizeProfiles.medium ?? { min: 93, max: 126 }) },
            speedOffset: { min: 8, max: 30 },
            rotation: { min: -1.4, max: 1.4 },
            baseHealth: 2.3,
            healthGrowth: 1.2,
            behavior: { type: 'drift', verticalSpeed: 120 }
        },
        {
            key: 'villain3',
            name: 'Abyss Overlord',
            imageSrc: 'assets/villain3.png',
            size: { ...(villainSizeProfiles.large ?? { min: 135, max: 183 }) },
            speedOffset: { min: -2, max: 32 },
            rotation: { min: -1, max: 1 },
            baseHealth: 3.4,
            healthGrowth: 1.8,
            behavior: { type: 'tracker', acceleration: 200, maxSpeed: 260 }
        }
    ];

    const villainOverrides =
        assetOverrides.villains && typeof assetOverrides.villains === 'object'
            ? assetOverrides.villains
            : {};
    for (const villain of villainTypes) {
        villain.asset = resolveAssetConfig(villainOverrides[villain.key], villain.imageSrc);
        if (typeof villain.asset === 'string') {
            villain.imageSrc = villain.asset;
        } else if (villain.asset && typeof villain.asset === 'object' && typeof villain.asset.src === 'string') {
            villain.imageSrc = villain.asset.src;
        }
    }

    function getVillainWeights() {
        const progress = getDifficultyProgress();
        const eased = easeInOutQuad(progress);
        const baseWeights = [0.55, 0.32, 0.13];
        const villain2Boost = lerp(0, 0.12, eased);
        const villain3Boost = lerp(0, 0.07, Math.pow(progress, 1.4));

        const weights = [
            Math.max(0.28, baseWeights[0] - (villain2Boost * 0.45 + villain3Boost)),
            baseWeights[1] + villain2Boost,
            Math.max(0.08, baseWeights[2] + villain3Boost)
        ];

        const total = weights.reduce((sum, weight) => sum + weight, 0);
        return weights.map((weight) => (total > 0 ? weight / total : 1 / weights.length));
    }

    function selectVillainType() {
        const weights = getVillainWeights();
        const adjustedWeights = [...weights];

        if (state.lastVillainKey) {
            const lastIndex = villainTypes.findIndex((villain) => villain.key === state.lastVillainKey);
            if (lastIndex >= 0) {
                adjustedWeights[lastIndex] *= 0.45;
            }
        }

        if (state.recentVillains.length) {
            const recentCounts = {};
            for (const key of state.recentVillains) {
                recentCounts[key] = (recentCounts[key] ?? 0) + 1;
            }
            const historySize = Math.max(1, state.recentVillains.length);
            for (let i = 0; i < villainTypes.length; i++) {
                const key = villainTypes[i].key;
                const recentCount = recentCounts[key] ?? 0;
                if (recentCount > 0) {
                    const dampen = 1 + recentCount / historySize;
                    adjustedWeights[i] /= dampen;
                }
            }
        }

        if (villainTypes.length > 0) {
            adjustedWeights[villainTypes.length - 1] *= 0.85;
        }

        const adjustedTotal = adjustedWeights.reduce((sum, weight) => sum + weight, 0);
        const normalizedTotal = adjustedTotal > 0 ? adjustedTotal : 1;
        const roll = Math.random();
        let cumulative = 0;

        for (let i = 0; i < villainTypes.length; i++) {
            cumulative += adjustedWeights[i] / normalizedTotal;
            if (roll <= cumulative) {
                return villainTypes[i];
            }
        }

        return villainTypes[villainTypes.length - 1];
    }

    const villainImages = {};
    for (const [index, villain] of villainTypes.entries()) {
        const image = loadImageWithFallback(
            villain.asset ?? villain.imageSrc,
            () => createVillainFallbackDataUrl(index) ?? villain.imageSrc
        );
        villainImages[villain.key] = image;
        villain.image = image;
    }

    for (const [index, bossDef] of bossBattleDefinitions.entries()) {
        const villain = bossDef.villain;
        villain.asset = resolveAssetConfig(villainOverrides[villain.key], villain.imageSrc);
        if (typeof villain.asset === 'string') {
            villain.imageSrc = villain.asset;
        } else if (
            villain.asset &&
            typeof villain.asset === 'object' &&
            typeof villain.asset.src === 'string'
        ) {
            villain.imageSrc = villain.asset.src;
        }
        const image = loadImageWithFallback(
            villain.imageSrc,
            () => createVillainFallbackDataUrl(villainTypes.length + index) ?? villain.imageSrc
        );
        villain.image = image;
    }

    player = {
        x: viewport.width * 0.18,
        y: viewport.height * 0.5,
        width: config.player.width,
        height: config.player.height,
        vx: 0,
        vy: 0
    };

    function resetGame() {
        storyManager.prepareForRun();
        state.score = 0;
        state.nyan = 0;
        state.streak = 0;
        state.bestStreak = 0;
        state.tailLength = config.baseTrailLength;
        state.tailTarget = config.baseTrailLength;
        state.comboTimer = 0;
        state.gameSpeed = config.baseGameSpeed;
        state.timeSinceLastShot = 0;
        state.elapsedTime = 0;
        state.powerUpTimers.powerBomb = 0;
        state.powerUpTimers.bulletSpread = 0;
        state.powerUpTimers[FLAME_WHIP_POWER] = 0;
        state.powerUpTimers.missiles = 0;
        state.powerUpTimers[DOUBLE_TEAM_POWER] = 0;
        state.powerUpTimers.radiantShield = 0;
        state.powerUpTimers[HYPER_BEAM_POWER] = 0;
        state.powerUpTimers.pumpDrive = 0;
        state.powerUpTimers.timeDilation = 0;
        state.powerUpTimers.scoreSurge = 0;
        state.powerUpTimers.starlightMagnet = 0;
        state.powerBombPulseTimer = 0;
        state.shieldHitPulse = 0;
        state.lastVillainKey = null;
        state.recentVillains.length = 0;
        state.dashTimer = 0;
        state.bossBattle.triggered = false;
        state.bossBattle.active = false;
        state.bossBattle.bossSpawned = false;
        state.bossBattle.defeated = false;
        state.bossBattle.powerUpSpawned = false;
        state.bossBattle.alertTimer = 0;
        state.bossBattle.nextEventIndex = 0;
        state.bossBattle.currentIndex = null;
        state.bossBattle.currentConfig = null;
        hyperBeamState.intensity = 0;
        hyperBeamState.wave = 0;
        hyperBeamState.sparkTimer = 0;
        hyperBeamState.bounds = null;
        const weaponCollection =
            typeof weaponLoadouts !== 'undefined' && weaponLoadouts ? weaponLoadouts : null;
        if (weaponCollection && typeof weaponCollection === 'object') {
            const idsToReset =
                typeof activeWeaponId === 'string' && activeWeaponId.length > 0
                    ? [activeWeaponId]
                    : Object.keys(weaponCollection);

            for (const id of idsToReset) {
                const loadout = weaponCollection[id];
                if (!loadout || typeof loadout !== 'object') {
                    continue;
                }

                if (typeof loadout.resetPatternState === 'function') {
                    loadout.resetPatternState();
                } else if (typeof loadout.createPatternState === 'function') {
                    loadout.patternState = loadout.createPatternState();
                } else if ('patternState' in loadout) {
                    loadout.patternState = undefined;
                }
            }
        }
        player.x = viewport.width * 0.18;
        player.y = viewport.height * 0.5;
        player.vx = 0;
        player.vy = 0;
        projectiles.length = 0;
        enemyProjectiles.length = 0;
        obstacles.length = 0;
        collectibles.length = 0;
        powerUps.length = 0;
        villainExplosions.length = 0;
        particles.length = 0;
        trail.length = 0;
        endDoubleTeam(true);
        pumpTailState.active = false;
        pumpTailState.bars.length = 0;
        pumpTailState.fade = 0;
        pumpTailState.waveTime = 0;
        pumpTailState.releasePending = false;
        pumpTailState.centerX = 0;
        areaBursts.length = 0;
        spawnTimers.obstacle = 0;
        spawnTimers.collectible = 0;
        reschedulePowerUps({ resetHistory: true, resetTimer: true, initialDelay: true });
        state.meteorShowerTimer = 0;
        state.nextMeteorShower = 0;
        audioManager.stopHyperBeam();
        createInitialStars();
        scheduleNextMeteorShower();
        comboFillEl.style.width = '100%';
        if (comboMeterEl) {
            comboMeterEl.setAttribute('aria-valuenow', '100');
        }
        lastComboPercent = 100;
        lastFormattedTimer = '';
        updateHUD();
        updateTimerDisplay();
        resetVirtualControls();
    }

    function createInitialStars() {
        stars.length = 0;
        for (let i = 0; i < config.star.count; i++) {
            stars.push({
                x: Math.random() * viewport.width,
                y: Math.random() * viewport.height,
                speed: (Math.random() * 0.8 + 0.4) * config.star.baseSpeed,
                size: Math.random() * 2.5 + 0.6,
                twinkleOffset: Math.random() * Math.PI * 2
            });
        }
    }

    function createAsteroid(initial = false) {
        const settings = config.asteroid;
        const scale = settings?.scale ?? 1;
        const depth = randomBetween(settings.depthRange[0], settings.depthRange[1]);
        const baseSize = lerp(settings.sizeRange[0], settings.sizeRange[1], depth);
        const size = baseSize * scale;
        const asteroid = {
            depth,
            baseSize,
            size,
            radius: size * 0.5,
            mass: Math.max(1, size * size * 0.0004),
            speed: lerp(settings.speedRange[0], settings.speedRange[1], depth),
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed:
                randomBetween(settings.rotationSpeedRange[0], settings.rotationSpeedRange[1]) *
                (0.4 + depth),
            drift:
                randomBetween(settings.driftRange[0], settings.driftRange[1]) *
                Math.max(0.12, 1 - depth * 0.6),
            vx: 0,
            vy: 0,
            x: 0,
            y: 0,
            image: asteroidImages[Math.floor(Math.random() * asteroidImages.length)] ?? null,
            bobOffset: Math.random() * Math.PI * 2,
            health: Math.max(1, Math.round(size / 32)),
            hitFlash: 0,
            shieldCooldown: 0,
            flameSeed: Math.random() * Math.PI * 2,
            flameScale: randomBetween(0.82, 1.18),
            trail: [],
            trailPulse: Math.random() * Math.PI * 2
        };
        placeAsteroid(asteroid, initial);
        asteroid.vx = -asteroid.speed * (0.6 + asteroid.depth * 0.8);
        asteroid.vy = asteroid.drift;
        return asteroid;
    }

    function placeAsteroid(asteroid, initial = false) {
        const settings = config.asteroid ?? {};
        const clusterRadius = settings.clusterRadius ?? 160;
        const minSpacing = settings.minSpacing ?? 12;
        const spawnOffset = settings.spawnOffset ?? 140;
        const attempts = settings.placementAttempts ?? 24;

        for (let attempt = 0; attempt < attempts; attempt++) {
            let anchor = null;
            if (asteroids.length && (initial || Math.random() < 0.85)) {
                anchor = asteroids[Math.floor(Math.random() * asteroids.length)];
            }

            let candidateX;
            let candidateY;

            if (anchor) {
                candidateX = anchor.x + randomBetween(-clusterRadius, clusterRadius);
                if (!initial) {
                    candidateX = Math.max(candidateX, viewport.width - clusterRadius * 0.8);
                }
                candidateY = anchor.y + randomBetween(-clusterRadius * 0.6, clusterRadius * 0.6);
            } else if (initial) {
                candidateX = Math.random() * viewport.width;
                candidateY = Math.random() * viewport.height;
            } else {
                candidateX = viewport.width + spawnOffset + Math.random() * clusterRadius;
                candidateY = Math.random() * viewport.height;
            }

            candidateX = clamp(candidateX, asteroid.radius + minSpacing, viewport.width + clusterRadius);
            candidateY = clamp(
                candidateY,
                asteroid.radius + minSpacing,
                viewport.height - asteroid.radius - minSpacing
            );

            let overlaps = false;
            for (const other of asteroids) {
                const dx = other.x - candidateX;
                const dy = other.y - candidateY;
                const minDist = asteroid.radius + other.radius + minSpacing;
                if (dx * dx + dy * dy < minDist * minDist) {
                    overlaps = true;
                    break;
                }
            }

            if (!overlaps) {
                asteroid.x = candidateX;
                asteroid.y = candidateY;
                return;
            }
        }

        asteroid.x = initial ? Math.random() * viewport.width : viewport.width + asteroid.size;
        asteroid.y = clamp(Math.random() * viewport.height, asteroid.radius, viewport.height - asteroid.radius);
    }

    function resolveAsteroidCollisions() {
        if (asteroids.length < 2) return;
        const settings = config.asteroid ?? {};
        const minSpacing = settings.minSpacing ?? 12;
        const restitution = settings.bounceRestitution ?? 0.9;

        for (let i = 0; i < asteroids.length - 1; i++) {
            const a = asteroids[i];
            for (let j = i + 1; j < asteroids.length; j++) {
                const b = asteroids[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const minDistance = a.radius + b.radius + minSpacing;
                const distanceSq = dx * dx + dy * dy;
                if (distanceSq === 0 || distanceSq >= minDistance * minDistance) {
                    continue;
                }

                const distance = Math.sqrt(distanceSq);
                const nx = dx / distance;
                const ny = dy / distance;
                const overlap = minDistance - distance;
                const massA = a.mass ?? 1;
                const massB = b.mass ?? 1;
                const totalMass = massA + massB;

                const moveA = overlap * (massB / totalMass);
                const moveB = overlap * (massA / totalMass);

                a.x -= nx * moveA;
                a.y -= ny * moveA;
                b.x += nx * moveB;
                b.y += ny * moveB;

                const relativeVelocity = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
                if (relativeVelocity > 0) {
                    continue;
                }

                const impulse = -(1 + restitution) * relativeVelocity;
                const impulsePerMassA = impulse * (massB / totalMass);
                const impulsePerMassB = impulse * (massA / totalMass);

                a.vx += nx * impulsePerMassA;
                a.vy += ny * impulsePerMassA;
                b.vx -= nx * impulsePerMassB;
                b.vy -= ny * impulsePerMassB;
            }
        }
    }

    function createInitialAsteroids() {
        asteroids.length = 0;
        asteroidSpawnTimer = 0;
        const settings = config.asteroid ?? {};
        const count = settings.initialCount ?? settings.maxCount ?? 0;
        for (let i = 0; i < count; i++) {
            asteroids.push(createAsteroid(true));
        }
        resolveAsteroidCollisions();
    }

    function scheduleNextMeteorShower() {
        const settings = config.asteroid ?? {};
        const interval = settings.meteorShowerInterval ?? 0;
        state.meteorShowerTimer = 0;
        if (!interval || interval <= 0) {
            state.nextMeteorShower = 0;
            return;
        }
        const variance = settings.meteorShowerVariance ?? 0;
        if (!variance) {
            state.nextMeteorShower = interval;
            return;
        }
        const minInterval = Math.max(2000, interval - variance);
        const maxInterval = interval + variance;
        state.nextMeteorShower = randomBetween(minInterval, maxInterval);
    }

    function spawnMeteorShower() {
        const settings = config.asteroid ?? {};
        const formation = settings.meteorShowerFormation ?? [
            { x: 0, y: 0 },
            { x: 70, y: -56 },
            { x: 70, y: 56 },
            { x: 140, y: -112 },
            { x: 140, y: 112 }
        ];
        const desiredCount = settings.meteorShowerCount ?? formation.length;
        if (!desiredCount || desiredCount < 1) {
            return false;
        }

        const offsets = formation.slice(0, desiredCount);
        if (!offsets.length) {
            return false;
        }

        const required = offsets.length;
        if (settings.maxCount && required > settings.maxCount) {
            return false;
        }
        if (settings.maxCount && asteroids.length + required > settings.maxCount) {
            const excess = asteroids.length + required - settings.maxCount;
            if (excess > 0) {
                const removable = asteroids
                    .map((asteroid, index) => ({ index, x: asteroid.x }))
                    .sort((a, b) => b.x - a.x)
                    .slice(0, excess)
                    .map((item) => item.index)
                    .sort((a, b) => b - a);
                for (const removeIndex of removable) {
                    asteroids.splice(removeIndex, 1);
                }
            }
        }

        const spawnOffset = settings.spawnOffset ?? 140;
        const spawnX = viewport.width + spawnOffset;
        const scale = settings.scale ?? 1;
        const minSize = Array.isArray(settings.sizeRange) ? settings.sizeRange[0] ?? 40 : 40;
        const actualSize = minSize * scale;
        const minSpacing = settings.minSpacing ?? 12;
        const minY = actualSize * 0.5 + minSpacing;
        const maxY = viewport.height - actualSize * 0.5 - minSpacing;
        const centerY = clamp(Math.random() * (maxY - minY) + minY, minY, maxY);
        const speedMultiplier = settings.meteorShowerSpeedMultiplier ?? 1;

        let spawnedAny = false;
        for (const offset of offsets) {
            const asteroid = createAsteroid(false);
            asteroid.depth = settings.depthRange ? settings.depthRange[0] : asteroid.depth;
            asteroid.baseSize = minSize;
            asteroid.size = actualSize;
            asteroid.radius = asteroid.size * 0.5;
            asteroid.mass = Math.max(1, asteroid.size * asteroid.size * 0.0004);
            const hasSpeedRange = Array.isArray(settings.speedRange);
            const baseSpeed = hasSpeedRange
                ? lerp(settings.speedRange[0], settings.speedRange[1], 1)
                : asteroid.speed;
            asteroid.speed = baseSpeed * speedMultiplier;
            asteroid.rotationSpeed = randomBetween(
                settings.rotationSpeedRange?.[0] ?? -0.6,
                settings.rotationSpeedRange?.[1] ?? 0.6
            ) * (0.4 + asteroid.depth);
            const driftRangeMin = settings.driftRange?.[0] ?? -18;
            const driftRangeMax = settings.driftRange?.[1] ?? 18;
            const driftScale = Math.max(0.18, 1 - asteroid.depth * 0.6);
            asteroid.drift = randomBetween(driftRangeMin * 0.4, driftRangeMax * 0.4) * driftScale;
            asteroid.vx = -asteroid.speed * (0.6 + asteroid.depth * 0.8);
            asteroid.vy = asteroid.drift;
            asteroid.x = spawnX + offset.x;
            asteroid.y = clamp(centerY + offset.y, minY, maxY);
            asteroid.health = Math.max(1, Math.round(asteroid.size / 32));
            asteroid.hitFlash = 0;
            asteroids.push(asteroid);
            spawnedAny = true;
        }

        if (spawnedAny) {
            asteroidSpawnTimer = 0;
        }

        return spawnedAny;
    }

    function updateAsteroidTrailState(asteroid, scaledDelta) {
        const trailConfig = config.asteroid?.trail ?? {};
        const spacing = Math.max(12, Number(trailConfig.spacing) || 0);
        const maxPoints = Math.max(1, Math.round(Number(trailConfig.maxPoints) || 10));
        const maxLife = Math.max(120, Number(trailConfig.life) || 480);

        if (!Array.isArray(asteroid.trail)) {
            asteroid.trail = [];
        }

        const points = asteroid.trail;
        for (let i = points.length - 1; i >= 0; i--) {
            const point = points[i];
            point.life -= scaledDelta;
            if (point.life <= 0) {
                points.splice(i, 1);
            }
        }

        const lastPoint = points[points.length - 1];
        const needsSample =
            !lastPoint ||
            Math.hypot(asteroid.x - lastPoint.x, asteroid.y - lastPoint.y) >= spacing;

        if (needsSample) {
            const velocityX = asteroid.vx !== 0 ? asteroid.vx : -asteroid.speed;
            const velocityY = asteroid.vy !== 0 ? asteroid.vy : asteroid.drift;
            const angle = Math.atan2(-velocityY, -velocityX);
            points.push({
                x: asteroid.x,
                y: asteroid.y,
                life: maxLife,
                maxLife,
                angle,
                size: asteroid.size,
                depth: asteroid.depth,
                seed: Math.random() * Math.PI * 2
            });
        }

        while (points.length > maxPoints) {
            points.shift();
        }
    }

    function updateAsteroids(delta) {
        const settings = config.asteroid ?? {};
        const spawnInterval = settings.spawnInterval ?? 0;
        if (state.gameState === 'running') {
            asteroidSpawnTimer += getScaledSpawnDelta(delta);
        }

        let spawned = false;
        if (state.gameState === 'running' && settings.maxCount > 0 && spawnInterval > 0) {
            while (asteroidSpawnTimer >= spawnInterval && asteroids.length < settings.maxCount) {
                asteroidSpawnTimer -= spawnInterval;
                asteroids.push(createAsteroid(false));
                spawned = true;
            }

            if (asteroids.length >= settings.maxCount) {
                asteroidSpawnTimer = Math.min(asteroidSpawnTimer, spawnInterval);
            }
        }

        if (state.gameState !== 'running') {
            state.meteorShowerTimer = 0;
        } else if (state.nextMeteorShower > 0) {
            state.meteorShowerTimer += getScaledSpawnDelta(delta);
            if (state.meteorShowerTimer >= state.nextMeteorShower) {
                const created = spawnMeteorShower();
                if (created) {
                    spawned = true;
                    scheduleNextMeteorShower();
                } else {
                    state.meteorShowerTimer = state.nextMeteorShower * 0.6;
                }
            }
        }

        if (spawned) {
            resolveAsteroidCollisions();
        }

        if (!asteroids.length) return;

        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        const parallaxFactor = 0.4 + state.gameSpeed / 900;
        const flowLerp = settings.flowLerp ?? 0.08;

        for (let i = asteroids.length - 1; i >= 0; i--) {
            const asteroid = asteroids[i];
            const targetVx = -asteroid.speed * parallaxFactor * (0.6 + asteroid.depth * 0.8);
            asteroid.vx += (targetVx - asteroid.vx) * flowLerp;
            const targetVy = asteroid.drift;
            asteroid.vy += (targetVy - asteroid.vy) * flowLerp;

            asteroid.x += asteroid.vx * deltaSeconds;
            asteroid.y += asteroid.vy * deltaSeconds;
            asteroid.rotation += asteroid.rotationSpeed * deltaSeconds;

            updateAsteroidTrailState(asteroid, scaledDelta);

            if (asteroid.hitFlash > 0) {
                asteroid.hitFlash = Math.max(0, asteroid.hitFlash - scaledDelta);
            }

            if (asteroid.shieldCooldown > 0) {
                asteroid.shieldCooldown = Math.max(0, asteroid.shieldCooldown - scaledDelta);
            }

            if (asteroid.y < asteroid.radius) {
                asteroid.y = asteroid.radius;
                asteroid.vy = Math.abs(asteroid.vy || targetVy);
            } else if (asteroid.y > viewport.height - asteroid.radius) {
                asteroid.y = viewport.height - asteroid.radius;
                asteroid.vy = -Math.abs(asteroid.vy || targetVy);
            }

            if (asteroid.x < -asteroid.size) {
                asteroids.splice(i, 1);
                asteroidSpawnTimer = 0;
                continue;
            }

            if (state.gameState === 'running') {
                const collisionRadius = asteroid.radius * (settings.collisionRadiusMultiplier ?? 1);
                const activePlayers = getActivePlayerEntities();
                let collidedEntity = null;
                for (const entity of activePlayers) {
                    if (circleRectOverlap({ x: asteroid.x, y: asteroid.y, radius: collisionRadius }, entity)) {
                        collidedEntity = entity;
                        break;
                    }
                }
                if (collidedEntity) {
                    if (isShieldActive() && asteroid.shieldCooldown <= 0) {
                        repelAsteroidFromPlayer(asteroid, collidedEntity);
                        continue;
                    }
                    triggerGameOver('An asteroid shattered your shields!');
                    return;
                }

                if (isPumpTailDamaging()) {
                    if (pumpTailIntersectsCircle({ x: asteroid.x, y: asteroid.y, radius: collisionRadius })) {
                        destroyAsteroid(i);
                        continue;
                    }
                } else {
                    const evaluateTailCollision = (points, sourceEntity) => {
                        if (!points?.length) {
                            return 'none';
                        }
                        for (let j = points.length - 1; j >= 0; j--) {
                            const t = points[j];
                            if (Math.hypot(asteroid.x - t.x, asteroid.y - t.y) <= collisionRadius + 10) {
                                if (isShieldActive()) {
                                    if (asteroid.shieldCooldown <= 0) {
                                        repelAsteroidFromPlayer(asteroid, sourceEntity ?? player);
                                    }
                                    return 'shielded';
                                }
                                triggerGameOver('Your tail clipped an asteroid!');
                                return 'gameOver';
                            }
                        }
                        return 'none';
                    };

                    const tailResult = evaluateTailCollision(trail, player);
                    if (tailResult === 'gameOver') {
                        return;
                    }
                    if (tailResult === 'shielded') {
                        continue;
                    }

                    if (isDoubleTeamActive()) {
                        const cloneTailResult = evaluateTailCollision(doubleTeamState.trail, doubleTeamState.clone);
                        if (cloneTailResult === 'gameOver') {
                            return;
                        }
                        if (cloneTailResult === 'shielded') {
                            continue;
                        }
                    }
                }
            }
        }

        resolveAsteroidCollisions();

        const maxX = viewport.width + (settings.clusterRadius ?? 160);
        for (const asteroid of asteroids) {
            asteroid.y = clamp(asteroid.y, asteroid.radius, viewport.height - asteroid.radius);
            asteroid.x = Math.min(asteroid.x, maxX);
        }
    }

    function getAsteroidScoreValue(asteroid) {
        const base = config.score?.asteroid ?? 0;
        return base + Math.round((asteroid.size ?? 0) * 0.4);
    }

    function createAsteroidDebris(asteroid) {
        createParticles({
            x: asteroid.x,
            y: asteroid.y,
            color: { r: 196, g: 206, b: 220 },
            count: Math.round(12 + asteroid.radius * 0.6),
            speedRange: [80, 360],
            sizeRange: [0.7, 2.4],
            lifeRange: [380, 760]
        });
    }

    function destroyAsteroid(index, options = {}) {
        const asteroid = asteroids[index];
        if (!asteroid) return;
        createAsteroidDebris(asteroid);
        audioManager.playExplosion('asteroid');
        if (options.createSpark !== false) {
            createHitSpark({ x: asteroid.x, y: asteroid.y, color: { r: 186, g: 198, b: 214 } });
        }
        if (state.gameState === 'running' && options.awardScore !== false) {
            awardScore(getAsteroidScoreValue(asteroid), {
                x: asteroid.x,
                y: asteroid.y,
                type: 'asteroid',
                color: '#fca5a5'
            });
            triggerScreenShake(Math.min(10, 4 + asteroid.radius * 0.04), 220);
        }
        asteroids.splice(index, 1);
        asteroidSpawnTimer = 0;
    }

    function damageAsteroid(asteroid, damage, index) {
        asteroid.health -= damage;
        asteroid.hitFlash = 220;
        if (asteroid.health <= 0) {
            destroyAsteroid(index);
        } else {
            createHitSpark({ x: asteroid.x, y: asteroid.y, color: { r: 172, g: 184, b: 204 } });
        }
    }

    function drawAsteroidTrail(asteroid, time) {
        if (!asteroid?.trail?.length) {
            return;
        }
        const trailConfig = config.asteroid?.trail ?? {};
        const baseLengthScale = Number(trailConfig.lengthScale) || 0.78;
        const baseWidthScale = Number(trailConfig.widthScale) || 0.42;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const point of asteroid.trail) {
            const progress = clamp(point.life / point.maxLife, 0, 1);
            if (progress <= 0) {
                continue;
            }
            const depthFactor = 1 - clamp(point.depth ?? asteroid.depth ?? 0.5, 0, 1);
            const flicker = 0.75 + Math.sin(time * 0.004 + (point.seed ?? 0)) * 0.25;
            const length = (point.size ?? asteroid.size) * baseLengthScale * (0.6 + 0.4 * progress) * flicker;
            const width = (point.size ?? asteroid.size) * baseWidthScale * (0.7 + depthFactor * 0.4);
            const innerRadius = Math.max(2, width * 0.14);
            const outerRadius = Math.max(width, length);

            ctx.save();
            ctx.translate(point.x, point.y);
            ctx.rotate(point.angle ?? 0);
            ctx.globalAlpha = Math.min(0.78, 0.18 + progress * 0.62);
            const gradient = ctx.createRadialGradient(-length * 0.65, 0, innerRadius, -length * 0.65, 0, outerRadius);
            gradient.addColorStop(0, 'rgba(255, 245, 218, 0.92)');
            gradient.addColorStop(0.32, 'rgba(255, 196, 106, 0.75)');
            gradient.addColorStop(0.7, 'rgba(255, 116, 34, 0.42)');
            gradient.addColorStop(1, 'rgba(255, 68, 16, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.ellipse(-length * 0.65, 0, length, width, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        ctx.restore();
    }

    function drawAsteroids(time) {
        if (!asteroids.length) return;
        ctx.save();
        for (const asteroid of asteroids) {
            drawAsteroidTrail(asteroid, time);
            const bob = Math.sin(time * 0.0012 + asteroid.bobOffset) * asteroid.depth * 8;
            const alpha = clamp(0.25 + asteroid.depth * 0.6, 0, 1);
            const drawSize = asteroid.size;
            ctx.save();
            ctx.translate(asteroid.x, asteroid.y + bob);
            ctx.rotate(asteroid.rotation);
            ctx.globalAlpha = alpha;
            const image = asteroid.image;
            const flamePulse = 0.78 + Math.sin(time * 0.004 + (asteroid.flameSeed ?? 0)) * 0.22;
            const flameFlicker = 0.5 + Math.sin(time * 0.009 + (asteroid.flameSeed ?? 0) * 1.7) * 0.5;
            const flameLength = drawSize * (0.62 + (1 - asteroid.depth) * 0.55) * flamePulse * (asteroid.flameScale ?? 1);
            const flameWidth = drawSize * (0.32 + (1 - asteroid.depth) * 0.28) * (0.72 + flameFlicker * 0.4);
            const flameOffset = drawSize * 0.58;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const flameGradient = ctx.createRadialGradient(
                -flameOffset,
                0,
                drawSize * 0.08,
                -flameOffset,
                0,
                Math.max(flameLength, drawSize * 0.2)
            );
            flameGradient.addColorStop(0, 'rgba(255, 247, 206, 0.92)');
            flameGradient.addColorStop(0.35, 'rgba(255, 196, 104, 0.8)');
            flameGradient.addColorStop(0.7, 'rgba(255, 132, 48, 0.55)');
            flameGradient.addColorStop(1, 'rgba(255, 72, 22, 0)');
            ctx.fillStyle = flameGradient;
            ctx.beginPath();
            ctx.ellipse(-flameOffset, 0, flameLength, flameWidth, 0, 0, Math.PI * 2);
            ctx.fill();

            const coreAlpha = 0.28 + flameFlicker * 0.22;
            ctx.fillStyle = `rgba(255, 244, 214, ${coreAlpha.toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(-flameOffset * 0.78, 0, flameLength * 0.42, flameWidth * 0.52, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            const flashStrength = clamp((asteroid.hitFlash ?? 0) / 220, 0, 1);
            if (flashStrength > 0) {
                ctx.filter = `brightness(${1 + flashStrength * 0.6}) saturate(${1 + flashStrength * 0.3})`;
            }
            if (image && image.complete && image.naturalWidth > 0) {
                ctx.drawImage(image, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            } else {
                ctx.fillStyle = `rgba(94, 106, 134, ${alpha})`;
                ctx.beginPath();
                ctx.arc(0, 0, drawSize / 2, 0, Math.PI * 2);
                ctx.fill();
            }
            if (flashStrength > 0) {
                ctx.filter = 'none';
            }
            ctx.restore();
        }
        ctx.restore();
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function normalizeColor(color) {
        if (!color) {
            return null;
        }
        if (typeof color === 'object') {
            const r = Number.isFinite(color.r) ? color.r : Number(color.red);
            const g = Number.isFinite(color.g) ? color.g : Number(color.green);
            const b = Number.isFinite(color.b) ? color.b : Number(color.blue);
            if ([r, g, b].every(Number.isFinite)) {
                return {
                    r: clamp(Math.round(r), 0, 255),
                    g: clamp(Math.round(g), 0, 255),
                    b: clamp(Math.round(b), 0, 255)
                };
            }
            if (typeof color.hex === 'string') {
                return normalizeColor(color.hex);
            }
        }
        if (typeof color === 'string') {
            const value = color.trim();
            const hexMatch = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
            if (hexMatch) {
                const hex = hexMatch[1];
                if (hex.length === 3) {
                    return {
                        r: parseInt(hex[0] + hex[0], 16),
                        g: parseInt(hex[1] + hex[1], 16),
                        b: parseInt(hex[2] + hex[2], 16)
                    };
                }
                return {
                    r: parseInt(hex.slice(0, 2), 16),
                    g: parseInt(hex.slice(2, 4), 16),
                    b: parseInt(hex.slice(4, 6), 16)
                };
            }
            const rgbaMatch = value.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
            if (rgbaMatch) {
                return {
                    r: clamp(Math.round(Number(rgbaMatch[1])), 0, 255),
                    g: clamp(Math.round(Number(rgbaMatch[2])), 0, 255),
                    b: clamp(Math.round(Number(rgbaMatch[3])), 0, 255)
                };
            }
        }
        return null;
    }

    function moveTowards(value, target, maxDelta) {
        if (value < target) {
            return Math.min(target, value + maxDelta);
        }
        if (value > target) {
            return Math.max(target, value - maxDelta);
        }
        return value;
    }

    function randomBetween(min, max) {
        return Math.random() * (max - min) + min;
    }

    function lerp(a, b, t) {
        return a + (b - a) * t;
    }

    function easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }

    const tutorialDifficultyTuning = {
        baseSpeedScale: 0.72,
        speedRampScale: 0.65,
        spawnScale: {
            obstacle: 0.5,
            collectible: 1.12,
            powerUp: 1.25
        },
        healthScale: 0.6
    };

    function getDifficultyProgress() {
        if (!config.difficulty) return 1;
        return clamp(state.elapsedTime / config.difficulty.rampDuration, 0, 1);
    }

    function getSpeedRampMultiplier() {
        if (!config.difficulty?.speedRamp) return 1;
        const eased = easeInOutQuad(getDifficultyProgress());
        const base = lerp(config.difficulty.speedRamp.start, config.difficulty.speedRamp.end, eased);
        if (tutorialFlightActive) {
            return clamp(base * tutorialDifficultyTuning.speedRampScale, 0.12, base);
        }
        return base;
    }

    function getSpawnIntensity(type) {
        const settings = config.difficulty?.spawnIntensity?.[type];
        if (!settings) return 1;
        const eased = easeInOutQuad(getDifficultyProgress());
        const base = lerp(settings.start, settings.end, eased);
        if (tutorialFlightActive) {
            const scale = tutorialDifficultyTuning.spawnScale[type] ?? 1;
            return Math.max(0.12, base * scale);
        }
        return base;
    }

    function getHealthRampMultiplier() {
        const settings = config.difficulty?.healthRamp;
        if (!settings) return 1;
        const eased = easeInOutQuad(getDifficultyProgress());
        const base = lerp(settings.start, settings.end, eased);
        if (tutorialFlightActive) {
            return Math.max(0.25, base * tutorialDifficultyTuning.healthScale);
        }
        return base;
    }

    function setPreflightPromptVisibility(visible) {
        if (preflightBar) {
            preflightBar.hidden = !visible;
            preflightBar.setAttribute('aria-hidden', visible ? 'false' : 'true');
        }
        if (preflightPrompt) {
            preflightPrompt.hidden = !visible;
            preflightPrompt.setAttribute('aria-hidden', visible ? 'false' : 'true');
        }
        if (mobilePreflightButton) {
            mobilePreflightButton.disabled = !visible || !isTouchInterface;
        }
        if (preflightSwapPilotButton) {
            preflightSwapPilotButton.hidden = !visible;
            preflightSwapPilotButton.setAttribute('aria-hidden', visible ? 'false' : 'true');
            const shouldDisable = !visible || !characterSelectModal;
            preflightSwapPilotButton.disabled = shouldDisable;
            preflightSwapPilotButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        }
        if (preflightSwapWeaponButton) {
            preflightSwapWeaponButton.hidden = !visible;
            preflightSwapWeaponButton.setAttribute('aria-hidden', visible ? 'false' : 'true');
            const shouldDisable = !visible || !weaponSelectModal;
            preflightSwapWeaponButton.disabled = shouldDisable;
            preflightSwapWeaponButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        }
        updateSwapPilotButton();
        updateSwapWeaponButtons();
    }

    function showPreflightPrompt() {
        setPreflightPromptVisibility(true);
    }

    function hidePreflightPrompt() {
        setPreflightPromptVisibility(false);
    }

    function enterPreflightReadyState({ focusCanvas = true } = {}) {
        preflightOverlayDismissed = true;
        state.gameState = 'ready';
        updateSwapPilotButton();
        updateSwapWeaponButtons();
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        hidePauseOverlay();
        preflightReady = true;
        if (overlayButton) {
            overlayButton.dataset.launchMode = 'launch';
            refreshOverlayLaunchButton();
        }
        hideOverlay();
        showPreflightPrompt();
        if (focusCanvas) {
            focusGameCanvas();
        }
    }

    function revealGameScreenAfterNameEntry() {
        if (preflightOverlayDismissed) {
            return;
        }
        if (!overlay || overlay.classList.contains('hidden')) {
            return;
        }
        const mode = overlayButton?.dataset.launchMode;
        if (mode !== 'prepare' && mode !== 'launch') {
            return;
        }
        enterPreflightReadyState();
    }

    function showOverlay(message, buttonText = getLaunchControlText(), options = {}) {
        hidePauseOverlay();
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        hidePreflightPrompt();
        preflightOverlayDismissed = false;
        preflightReady = false;
        overlayMessage.textContent = message;
        const resolvedButtonText = buttonText || getLaunchControlText();
        if (overlayButton) {
            const enableButton = options.enableButton ?? false;
            overlayButton.textContent = resolvedButtonText;
            overlayButton.disabled = !enableButton;
            overlayButton.setAttribute('aria-disabled', enableButton ? 'false' : 'true');
            if (enableButton && options.launchMode) {
                overlayButton.dataset.launchMode = options.launchMode;
                if (
                    options.launchMode === 'launch' ||
                    options.launchMode === 'retry' ||
                    options.launchMode === 'prepare'
                ) {
                    refreshOverlayLaunchButton();
                }
            } else if (overlayButton.dataset.launchMode) {
                overlayButton.textContent = resolvedButtonText;
                delete overlayButton.dataset.launchMode;
            }
        }
        if (overlaySecondaryButton) {
            const secondaryConfig = options.secondaryButton;
            if (secondaryConfig && secondaryConfig.text && secondaryConfig.launchMode) {
                overlaySecondaryButton.hidden = false;
                overlaySecondaryButton.disabled = Boolean(secondaryConfig.disabled);
                overlaySecondaryButton.setAttribute(
                    'aria-disabled',
                    secondaryConfig.disabled ? 'true' : 'false'
                );
                overlaySecondaryButton.textContent = secondaryConfig.text;
                overlaySecondaryButton.dataset.launchMode = secondaryConfig.launchMode;
            } else {
                overlaySecondaryButton.hidden = true;
                overlaySecondaryButton.disabled = true;
                overlaySecondaryButton.setAttribute('aria-disabled', 'true');
                if (overlaySecondaryButton.dataset.launchMode) {
                    delete overlaySecondaryButton.dataset.launchMode;
                }
            }
        }
        if (overlayTitle) {
            const titleText = options.title ?? overlayDefaultTitle;
            overlayTitle.textContent = titleText;
        }
        const shouldShowComic = options.showComic ?? firstRunExperience;
        if (comicIntro) {
            comicIntro.hidden = !shouldShowComic;
        }
        resetVirtualControls();
        if (overlay) {
            overlay.classList.remove('hidden');
            overlay.setAttribute('aria-hidden', 'false');
        }
        refreshHighScorePreview();
        refreshFlyNowButton();
        window.requestAnimationFrame(() => {
            try {
                if (playerNameInput) {
                    playerNameInput.focus({ preventScroll: true });
                    playerNameInput.select?.();
                } else if (overlayButton) {
                    overlayButton.focus({ preventScroll: true });
                }
            } catch {
                // Ignore focus errors (e.g., if element is detached)
            }
        });
    }

    function setOverlaySubmittingState(isSubmitting) {
        if (overlayButton) {
            if (isSubmitting && !overlayButton.dataset.originalLabel) {
                overlayButton.dataset.originalLabel = overlayButton.textContent ?? '';
            }
            overlayButton.disabled = isSubmitting;
            overlayButton.setAttribute('aria-disabled', isSubmitting ? 'true' : 'false');
            if (isSubmitting) {
                overlayButton.textContent = 'Submitting…';
            } else if (overlayButton.dataset.originalLabel) {
                if ((overlayButton.textContent ?? '') === 'Submitting…') {
                    overlayButton.textContent = overlayButton.dataset.originalLabel;
                }
                delete overlayButton.dataset.originalLabel;
            }
        }
        if (overlaySecondaryButton) {
            const shouldDisable = isSubmitting || overlaySecondaryButton.hidden;
            overlaySecondaryButton.disabled = shouldDisable;
            overlaySecondaryButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        }
    }

    function hideOverlay() {
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.setAttribute('aria-hidden', 'true');
        }
        if (overlayButton && typeof document !== 'undefined') {
            const activeElement = document.activeElement;
            if (activeElement === overlayButton) {
                overlayButton.blur();
            }
        }
        if (overlaySecondaryButton && !overlaySecondaryButton.hidden) {
            overlaySecondaryButton.hidden = true;
            overlaySecondaryButton.disabled = true;
            overlaySecondaryButton.setAttribute('aria-disabled', 'true');
            if (overlaySecondaryButton.dataset.launchMode) {
                delete overlaySecondaryButton.dataset.launchMode;
            }
        }
        if (playerNameInput && document.activeElement === playerNameInput) {
            playerNameInput.blur();
        }
        refreshHighScorePreview();
    }

    function setJoystickThumbPosition(dx, dy) {
        if (!joystickThumb) return;
        const xValue = typeof dx === 'number' ? `${dx}px` : dx;
        const yValue = typeof dy === 'number' ? `${dy}px` : dy;
        joystickThumb.style.setProperty('--thumb-x', xValue);
        joystickThumb.style.setProperty('--thumb-y', yValue);
    }

    function resetMotionInput() {
        motionInput.moveX = 0;
        motionInput.moveY = 0;
        motionInput.smoothedX = 0;
        motionInput.smoothedY = 0;
        motionInput.lastUpdate = getTimestamp();
    }

    function updateMotionBodyClasses() {
        if (!bodyElement) {
            return;
        }
        bodyElement.classList.toggle('motion-controls-enabled', motionInput.enabled);
        bodyElement.classList.toggle(
            'motion-controls-landscape',
            motionInput.enabled && motionInput.active
        );
    }

    function normalizeOrientationAngle(angle) {
        if (!Number.isFinite(angle)) {
            return 0;
        }
        let normalized = angle % 360;
        if (normalized < 0) {
            normalized += 360;
        }
        if (normalized >= 315 || normalized < 45) {
            return 0;
        }
        if (normalized >= 45 && normalized < 135) {
            return 90;
        }
        if (normalized >= 135 && normalized < 225) {
            return 180;
        }
        return 270;
    }

    function getOrientationAngle() {
        if (typeof window === 'undefined') {
            return 0;
        }
        const orientation = window.screen?.orientation;
        if (orientation && typeof orientation.angle === 'number') {
            return normalizeOrientationAngle(orientation.angle);
        }
        if (typeof window.orientation === 'number') {
            return normalizeOrientationAngle(window.orientation);
        }
        return 0;
    }

    function isLandscapeOrientation() {
        const angle = getOrientationAngle();
        return angle === 90 || angle === 270;
    }

    function applyMotionVector(xTilt, yTilt) {
        const normalizedX = clamp(xTilt / MOTION_MAX_TILT, -1, 1);
        const normalizedY = clamp(yTilt / MOTION_MAX_TILT, -1, 1);
        motionInput.moveX = Math.abs(normalizedX) < MOTION_DEADZONE ? 0 : normalizedX;
        motionInput.moveY = Math.abs(normalizedY) < MOTION_DEADZONE ? 0 : normalizedY;
        motionInput.lastUpdate = getTimestamp();
    }

    function updateMotionOrientationState() {
        motionInput.active = isLandscapeOrientation();
        if (!motionInput.active) {
            resetMotionInput();
        }
        updateMotionBodyClasses();
    }

    function handleOrientationChange() {
        if (!motionInput.enabled) {
            return;
        }
        updateMotionOrientationState();
    }

    function handleDeviceOrientation(event) {
        if (!motionInput.enabled) {
            return;
        }
        const landscape = isLandscapeOrientation();
        motionInput.active = landscape;
        if (!landscape) {
            resetMotionInput();
            updateMotionBodyClasses();
            return;
        }
        const beta = typeof event.beta === 'number' ? event.beta : null;
        const gamma = typeof event.gamma === 'number' ? event.gamma : null;
        if (beta == null || gamma == null) {
            return;
        }
        const angle = getOrientationAngle();
        let xTilt;
        let yTilt;
        if (angle === 90) {
            xTilt = gamma;
            yTilt = -beta;
        } else if (angle === 270) {
            xTilt = -gamma;
            yTilt = beta;
        } else if (angle === 180) {
            xTilt = -gamma;
            yTilt = beta;
        } else {
            xTilt = gamma;
            yTilt = beta;
        }
        applyMotionVector(xTilt, yTilt);
        updateMotionBodyClasses();
    }

    function enableMotionControls() {
        if (motionInput.enabled) {
            return;
        }
        motionInput.enabled = true;
        resetJoystick();
        resetMotionInput();
        updateMotionOrientationState();
        window.addEventListener('deviceorientation', handleDeviceOrientation);
        window.addEventListener('orientationchange', handleOrientationChange);
    }

    function shouldAttemptMotionControls() {
        return isTouchInterface && hasDeviceOrientationSupport;
    }

    async function tryEnableMotionControls() {
        if (!shouldAttemptMotionControls()) {
            return;
        }
        if (motionInput.permissionState === 'granted') {
            enableMotionControls();
            return;
        }
        if (motionInput.permissionState === 'denied' || motionInput.permissionState === 'pending') {
            return;
        }
        motionInput.permissionState = 'pending';
        let granted = false;
        try {
            if (
                typeof DeviceOrientationEvent !== 'undefined' &&
                typeof DeviceOrientationEvent.requestPermission === 'function'
            ) {
                const result = await DeviceOrientationEvent.requestPermission();
                granted = result === 'granted';
            } else {
                granted = true;
            }
        } catch {
            granted = false;
        }
        motionInput.permissionState = granted ? 'granted' : 'denied';
        if (!granted) {
            updateMotionBodyClasses();
            return;
        }
        enableMotionControls();
    }

    function resetJoystick() {
        const pointerId = joystickState.pointerId;
        if (pointerId !== null && joystickZone?.hasPointerCapture?.(pointerId)) {
            joystickZone.releasePointerCapture(pointerId);
        }
        joystickState.pointerId = null;
        joystickState.touchId = null;
        virtualInput.moveX = 0;
        virtualInput.moveY = 0;
        virtualInput.smoothedX = 0;
        virtualInput.smoothedY = 0;
        setJoystickThumbPosition('0px', '0px');
    }

    function resetFiring() {
        const pointerId = firePointerId;
        if (pointerId !== null && fireButton?.hasPointerCapture?.(pointerId)) {
            fireButton.releasePointerCapture(pointerId);
        }
        firePointerId = null;
        fireTouchId = null;
        virtualInput.firing = false;
        if (fireButton) {
            fireButton.classList.remove('active');
        }
    }

    function resetVirtualControls() {
        resetJoystick();
        resetFiring();
        if (motionInput.enabled) {
            resetMotionInput();
        }
    }

    function updateJoystickFromPointer(event) {
        if (!joystickZone) return;
        const rect = joystickZone.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        let dx = event.clientX - centerX;
        let dy = event.clientY - centerY;
        const maxDistance = rect.width * 0.5;
        const distance = Math.hypot(dx, dy);
        if (distance > maxDistance && distance > 0) {
            const scale = maxDistance / distance;
            dx *= scale;
            dy *= scale;
        }

        setJoystickThumbPosition(dx, dy);

        const normalizedX = clamp(dx / maxDistance, -1, 1);
        const normalizedY = clamp(dy / maxDistance, -1, 1);
        const deadZone = 0.14;
        virtualInput.moveX = Math.abs(normalizedX) < deadZone ? 0 : normalizedX;
        virtualInput.moveY = Math.abs(normalizedY) < deadZone ? 0 : normalizedY;
    }

    function endJoystickControl() {
        resetJoystick();
    }

    function handleJoystickPointerEnd(event) {
        if (joystickState.pointerId !== event.pointerId) {
            return;
        }
        if (joystickZone?.hasPointerCapture?.(event.pointerId)) {
            joystickZone.releasePointerCapture(event.pointerId);
        }
        endJoystickControl();
    }

    function getTouchById(touchList, identifier) {
        if (!touchList || identifier == null) {
            return null;
        }
        for (let i = 0; i < touchList.length; i++) {
            const touch = touchList.item ? touchList.item(i) : touchList[i];
            if (touch?.identifier === identifier) {
                return touch;
            }
        }
        return null;
    }

    function handleJoystickTouchEnd(identifier) {
        if (joystickState.touchId !== identifier) {
            return;
        }
        endJoystickControl();
    }

    function engageFireControl(event, options = {}) {
        const pointerId = event?.pointerId ?? null;
        const { pointerCapture = true } = options;
        firePointerId = pointerId;
        fireTouchId = null;
        virtualInput.firing = true;
        if (fireButton) {
            fireButton.classList.add('active');
            if (pointerCapture && pointerId !== null) {
                fireButton.setPointerCapture?.(pointerId);
            }
        }
    }

    function engageFireTouchControl(identifier) {
        firePointerId = null;
        fireTouchId = identifier;
        virtualInput.firing = true;
        if (fireButton) {
            fireButton.classList.add('active');
        }
    }

    function handleFirePointerEnd(event) {
        if (firePointerId !== event.pointerId) {
            return;
        }
        if (fireButton?.hasPointerCapture?.(event.pointerId)) {
            fireButton.releasePointerCapture(event.pointerId);
        }
        resetFiring();
    }

    function handleFireTouchEnd(identifier) {
        if (fireTouchId !== identifier) {
            return;
        }
        resetFiring();
    }

    function focusGameCanvas() {
        if (!canvas) return;
        try {
            canvas.focus({ preventScroll: true });
        } catch {
            canvas.focus();
        }
    }

    async function startGame(options = {}) {
        const { skipCommit = false, tutorial = false, tutorialCallsign: callSignOverride = null } = options;
        hidePreflightPrompt();
        preflightOverlayDismissed = false;
        preflightReady = false;
        if (!skipCommit) {
            commitPlayerNameInput();
        }
        if (tutorial) {
            tutorialFlightActive = true;
            if (typeof callSignOverride === 'string' && callSignOverride.length) {
                tutorialCallsign = callSignOverride;
            }
        } else {
            tutorialFlightActive = false;
            tutorialCallsign = null;
            completeFirstRunExperience();
        }
        resetGame();
        const currentCallsign = tutorial ? tutorialCallsign || playerName : playerName;
        storyManager.beginRun({ callSign: currentCallsign, tutorial });
        mascotAnnouncer.reset({ immediate: true });
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        hidePauseOverlay();
        if (tutorial) {
            state.gameSpeed = config.baseGameSpeed * tutorialDifficultyTuning.baseSpeedScale;
        }
        pendingSubmission = null;
        invalidateRunToken();
        try {
            await ensureRunToken();
        } catch (error) {
            if (error?.code === 'unconfigured') {
                // No remote leaderboard configured; continue without a token.
            } else if (error?.code === 'timeout') {
                console.warn('Run token request timed out before launch', error);
            } else if (error?.code === 'network') {
                console.warn('Unable to fetch run token before launch', error);
            } else {
                console.error('Run token request failed before launch', error);
            }
        }
        state.gameState = 'running';
        updateSwapPilotButton();
        updateSwapWeaponButtons();
        lastTime = null;
        accumulatedDelta = 0;
        hideOverlay();
        audioManager.unlock();
        audioManager.playGameplayMusic();
        focusGameCanvas();
    }

    if (flyNowButton) {
        flyNowButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (flyNowButton.disabled) {
                return;
            }
            startTutorialFlight();
        });
    }

    overlayButton.addEventListener('click', (event) => {
        event.preventDefault();
        if (overlayButton.disabled) {
            if (playerNameInput) {
                playerNameInput.focus({ preventScroll: true });
                playerNameInput.select?.();
            }
            return;
        }
        const mode = overlayButton.dataset.launchMode || (state.gameState === 'ready' ? 'launch' : 'retry');
        handleOverlayAction(mode);
    });

    if (!supportsPointerEvents && overlayButton) {
        overlayButton.addEventListener('touchstart', (event) => {
            event.preventDefault();
            if (overlayButton.disabled) {
                if (playerNameInput) {
                    playerNameInput.focus({ preventScroll: true });
                    playerNameInput.select?.();
                }
                return;
            }
            const mode = overlayButton.dataset.launchMode || (state.gameState === 'ready' ? 'launch' : 'retry');
            handleOverlayAction(mode);
        }, { passive: false });
    }

    if (overlaySecondaryButton) {
        overlaySecondaryButton.addEventListener('click', (event) => {
            event.preventDefault();
            if (overlaySecondaryButton.disabled) {
                return;
            }
            const mode = overlaySecondaryButton.dataset.launchMode || 'retry';
            handleOverlayAction(mode);
        });
        if (!supportsPointerEvents) {
            overlaySecondaryButton.addEventListener('touchstart', (event) => {
                event.preventDefault();
                if (overlaySecondaryButton.disabled) {
                    return;
                }
                const mode = overlaySecondaryButton.dataset.launchMode || 'retry';
                handleOverlayAction(mode);
            }, { passive: false });
        }
    }

    if (resumeButton) {
        resumeButton.addEventListener('click', () => {
            resumeGame();
        });
    }

    if (pauseOverlay) {
        pauseOverlay.addEventListener('click', (event) => {
            if (event.target === pauseOverlay) {
                resumeGame();
            }
        });
    }

    if (pauseSettingsButton) {
        pauseSettingsButton.addEventListener('click', () => {
            openSettingsDrawer();
        });
    }

    if (mobilePreflightButton) {
        mobilePreflightButton.addEventListener('click', () => {
            if (state.gameState === 'ready') {
                if (preflightReady) {
                    startGame();
                } else {
                    const mode = overlayButton?.dataset.launchMode || 'launch';
                    handleOverlayAction(mode);
                }
            } else if (state.gameState === 'gameover') {
                const mode = overlayButton?.dataset.launchMode || (pendingSubmission ? 'submit' : 'retry');
                handleOverlayAction(mode);
            }
        });
    }

    function shouldUseMotionFire(pointerType = null) {
        if (!motionInput.enabled || !motionInput.active) {
            return false;
        }
        if (!isTouchInterface) {
            return false;
        }
        if (state.gameState !== 'running') {
            return false;
        }
        if (pointerType && pointerType !== 'touch') {
            return false;
        }
        return true;
    }

    if (canvas) {
        canvas.addEventListener('pointerdown', (event) => {
            focusGameCanvas();
            const pointerType = typeof event.pointerType === 'string' ? event.pointerType.toLowerCase() : null;
            if (pointerType === 'touch') {
                if (!isTouchInterface) {
                    isTouchInterface = true;
                    refreshInteractionHints();
                }
                tryEnableMotionControls();
            }
            if (shouldUseMotionFire(pointerType)) {
                event.preventDefault();
                engageFireControl(event, { pointerCapture: false });
            }
        });
        if (!supportsPointerEvents) {
            canvas.addEventListener(
                'touchstart',
                (event) => {
                    focusGameCanvas();
                    if (!isTouchInterface) {
                        isTouchInterface = true;
                        refreshInteractionHints();
                    }
                    tryEnableMotionControls();
                    if (!shouldUseMotionFire()) {
                        return;
                    }
                    const touch = event.changedTouches?.item?.(0) ?? event.changedTouches?.[0];
                    if (!touch) {
                        return;
                    }
                    event.preventDefault();
                    engageFireTouchControl(touch.identifier);
                },
                { passive: false }
            );
        }
    }

    if (supportsPointerEvents) {
        window.addEventListener(
            'pointerdown',
            (event) => {
                const pointerType = typeof event.pointerType === 'string' ? event.pointerType.toLowerCase() : null;
                if (pointerType === 'touch') {
                    if (!isTouchInterface) {
                        isTouchInterface = true;
                        refreshInteractionHints();
                    }
                    tryEnableMotionControls();
                }
            },
            { passive: true }
        );
    } else if (typeof window !== 'undefined') {
        window.addEventListener(
            'touchstart',
            () => {
                if (!isTouchInterface) {
                    isTouchInterface = true;
                    refreshInteractionHints();
                }
                tryEnableMotionControls();
            },
            { passive: true }
        );
    }

    if (joystickZone) {
        if (supportsPointerEvents) {
            joystickZone.addEventListener('pointerdown', (event) => {
                if (typeof event.pointerType === 'string' && event.pointerType.toLowerCase() === 'touch') {
                    if (!isTouchInterface) {
                        isTouchInterface = true;
                        refreshInteractionHints();
                    }
                }
                joystickState.pointerId = event.pointerId;
                joystickState.touchId = null;
                focusGameCanvas();
                event.preventDefault();
                joystickZone.setPointerCapture?.(event.pointerId);
                updateJoystickFromPointer(event);
            });

            joystickZone.addEventListener('pointermove', (event) => {
                if (joystickState.pointerId !== event.pointerId) return;
                updateJoystickFromPointer(event);
            });

            joystickZone.addEventListener('pointerup', (event) => {
                handleJoystickPointerEnd(event);
            });

            joystickZone.addEventListener('pointercancel', (event) => {
                handleJoystickPointerEnd(event);
            });

            joystickZone.addEventListener('lostpointercapture', (event) => {
                if (joystickState.pointerId === event.pointerId) {
                    endJoystickControl();
                }
            });
        } else {
            const handleTouchMove = (event) => {
                const touch = getTouchById(event.changedTouches, joystickState.touchId);
                if (!touch) {
                    return;
                }
                event.preventDefault();
                updateJoystickFromPointer(touch);
            };

            const handleTouchEnd = (event) => {
                const touch = getTouchById(event.changedTouches, joystickState.touchId);
                if (!touch) {
                    return;
                }
                event.preventDefault();
                handleJoystickTouchEnd(touch.identifier);
            };

            joystickZone.addEventListener('touchstart', (event) => {
                if (joystickState.touchId !== null) {
                    return;
                }
                const touch = event.changedTouches.item(0);
                if (!touch) {
                    return;
                }
                if (!isTouchInterface) {
                    isTouchInterface = true;
                    refreshInteractionHints();
                }
                joystickState.touchId = touch.identifier;
                joystickState.pointerId = null;
                focusGameCanvas();
                event.preventDefault();
                updateJoystickFromPointer(touch);
            }, { passive: false });

            joystickZone.addEventListener('touchmove', handleTouchMove, { passive: false });
            joystickZone.addEventListener('touchend', handleTouchEnd, { passive: false });
            joystickZone.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        }
    }

    if (fireButton) {
        if (supportsPointerEvents) {
            fireButton.addEventListener('pointerdown', (event) => {
                if (typeof event.pointerType === 'string' && event.pointerType.toLowerCase() === 'touch') {
                    if (!isTouchInterface) {
                        isTouchInterface = true;
                        refreshInteractionHints();
                    }
                }
                focusGameCanvas();
                event.preventDefault();
                engageFireControl(event);
            });

            fireButton.addEventListener('pointerup', (event) => {
                handleFirePointerEnd(event);
            });

            fireButton.addEventListener('pointercancel', (event) => {
                handleFirePointerEnd(event);
            });

            fireButton.addEventListener('lostpointercapture', (event) => {
                if (firePointerId === event.pointerId) {
                    resetFiring();
                }
            });
        } else {
            const handleTouchEnd = (event) => {
                const touch = getTouchById(event.changedTouches, fireTouchId);
                if (!touch) {
                    return;
                }
                event.preventDefault();
                handleFireTouchEnd(touch.identifier);
            };

            fireButton.addEventListener('touchstart', (event) => {
                if (fireTouchId !== null) {
                    return;
                }
                const touch = event.changedTouches.item(0);
                if (!touch) {
                    return;
                }
                if (!isTouchInterface) {
                    isTouchInterface = true;
                    refreshInteractionHints();
                }
                focusGameCanvas();
                event.preventDefault();
                engageFireTouchControl(touch.identifier);
            }, { passive: false });

            fireButton.addEventListener('touchend', handleTouchEnd, { passive: false });
            fireButton.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        }
    }

    if (supportsPointerEvents) {
        window.addEventListener('pointerup', (event) => {
            if (firePointerId !== null && event.pointerId === firePointerId) {
                resetFiring();
            }
        });
        window.addEventListener('pointercancel', (event) => {
            if (firePointerId !== null && event.pointerId === firePointerId) {
                resetFiring();
            }
        });
    } else {
        window.addEventListener(
            'touchend',
            (event) => {
                if (fireTouchId === null) {
                    return;
                }
                const touch = getTouchById(event.changedTouches, fireTouchId);
                if (!touch) {
                    return;
                }
                event.preventDefault();
                handleFireTouchEnd(touch.identifier);
            },
            { passive: false }
        );
        window.addEventListener(
            'touchcancel',
            (event) => {
                if (fireTouchId === null) {
                    return;
                }
                const touch = getTouchById(event.changedTouches, fireTouchId);
                if (!touch) {
                    return;
                }
                event.preventDefault();
                handleFireTouchEnd(touch.identifier);
            },
            { passive: false }
        );
        window.addEventListener('mouseup', () => {
            if (virtualInput.firing) {
                resetFiring();
            }
        });
    }

    window.addEventListener('keydown', (event) => {
        const normalizedKey = normalizeKey(event);
        if (!normalizedKey) {
            return;
        }
        if (isWeaponSelectOpen()) {
            if (normalizedKey === 'Escape') {
                event.preventDefault();
                closeWeaponSelect();
            }
            return;
        }
        if (isCharacterSelectOpen()) {
            if (normalizedKey === 'Escape') {
                event.preventDefault();
                closeCharacterSelect();
            }
            return;
        }
        if (event.ctrlKey && event.shiftKey && normalizedKey === 'KeyD') {
            event.preventDefault();
            toggleDebugOverlay();
            return;
        }
        const target = event.target;
        const isFormControl = isFormControlTarget(target);
        const isTextEntry = isTextEntryTarget(target);
        if (normalizedKey === 'KeyP') {
            if (isTextEntry) {
                return;
            }
            event.preventDefault();
            togglePause('manual');
            return;
        }
        if (normalizedKey === 'Escape') {
            if (isSettingsDrawerOpen()) {
                event.preventDefault();
                closeSettingsDrawer();
                return;
            }
            if (!isTextEntry) {
                event.preventDefault();
                openSettingsDrawer();
                return;
            }
        }
        if (preventDefaultKeys.has(normalizedKey) && !isFormControl) {
            event.preventDefault();
        }
        if (isTextEntry && normalizedKey !== 'Enter') {
            return;
        }
        keys.add(normalizedKey);
        if (!event.repeat) {
            const dashDirection = dashDirections[normalizedKey];
            if (dashDirection) {
                const now = performance.now();
                const lastTap = dashTapTracker.get(normalizedKey);
                if (lastTap && now - lastTap <= config.player.dash.doubleTapWindow) {
                    dashTapTracker.delete(normalizedKey);
                    triggerDash(dashDirection);
                } else {
                    dashTapTracker.set(normalizedKey, now);
                }
            }
        }
        if (normalizedKey === 'Enter') {
            if (state.gameState === 'ready') {
                if (preflightReady) {
                    event.preventDefault();
                    startGame();
                } else {
                    const mode = overlayButton?.dataset.launchMode || 'launch';
                    handleOverlayAction(mode);
                }
            } else if (state.gameState === 'gameover') {
                const mode = overlayButton?.dataset.launchMode || (pendingSubmission ? 'submit' : 'retry');
                handleOverlayAction(mode);
            }
        }
    });

    window.addEventListener('keyup', (event) => {
        const normalizedKey = normalizeKey(event);
        if (!normalizedKey) {
            return;
        }
        keys.delete(normalizedKey);
    });

    window.addEventListener('blur', () => {
        if (state.gameState === 'running') {
            pauseGame({ reason: 'blur' });
        }
        keys.clear();
        dashTapTracker.clear();
        resetVirtualControls();
        resetGamepadInput();
    });

    function triggerDash(direction) {
        const dashConfig = config.player.dash;
        state.dashTimer = dashConfig.duration;
        if (direction.x !== 0) {
            player.vx = direction.x * dashConfig.boostSpeed;
        }
        if (direction.y !== 0) {
            player.vy = direction.y * dashConfig.boostSpeed;
        }
    }

    function isPowerUpActive(type) {
        return state.powerUpTimers[type] > 0;
    }

    function getWorldTimeScale() {
        if (!isPowerUpActive(TIME_DILATION_POWER)) {
            return 1;
        }
        const configured = Number(config.timeDilationPower?.worldSpeedMultiplier);
        if (Number.isFinite(configured)) {
            return clamp(configured, 0.2, 1);
        }
        return 0.6;
    }

    function getSpawnTimeScale() {
        if (!isPowerUpActive(TIME_DILATION_POWER)) {
            return 1;
        }
        const configured = Number(config.timeDilationPower?.spawnRateMultiplier);
        if (Number.isFinite(configured)) {
            return clamp(configured, 0.2, 1);
        }
        return 0.65;
    }

    function getScaledDelta(delta) {
        return delta * getWorldTimeScale();
    }

    function getScaledSpawnDelta(delta) {
        return delta * getSpawnTimeScale();
    }

    function isDoubleTeamActive() {
        return Boolean(doubleTeamState.clone && state.powerUpTimers[DOUBLE_TEAM_POWER] > 0);
    }

    function getActivePlayerEntities() {
        activePlayerBuffer.length = 0;
        activePlayerBuffer.push(player);
        if (isDoubleTeamActive()) {
            activePlayerBuffer.push(doubleTeamState.clone);
        }
        return activePlayerBuffer;
    }

    function ensureDoubleTeamCloneDimensions() {
        if (doubleTeamState.clone) {
            doubleTeamState.clone.width = config.player.width;
            doubleTeamState.clone.height = config.player.height;
        }
    }

    function getScoreSurgeMultiplier() {
        if (!isPowerUpActive(SCORE_SURGE_POWER)) {
            return 1;
        }
        const configured = Number(config.scoreSurgePower?.scoreMultiplier);
        if (Number.isFinite(configured)) {
            return Math.max(1, configured);
        }
        return 1.5;
    }

    function isShieldActive() {
        return isPowerUpActive(SHIELD_POWER);
    }

    function getPlayerCenter(entity = null) {
        if (entity) {
            return {
                x: entity.x + entity.width * 0.5,
                y: entity.y + entity.height * 0.5
            };
        }
        const players = getActivePlayerEntities();
        if (players.length > 1) {
            const sum = players.reduce(
                (acc, current) => {
                    acc.x += current.x + current.width * 0.5;
                    acc.y += current.y + current.height * 0.5;
                    return acc;
                },
                { x: 0, y: 0 }
            );
            return {
                x: sum.x / players.length,
                y: sum.y / players.length
            };
        }
        return {
            x: player.x + player.width * 0.5,
            y: player.y + player.height * 0.5
        };
    }

    function triggerShieldImpact(x, y, normalX = 0, normalY = 0) {
        const shieldConfig = config.defensePower ?? {};
        const color = shieldConfig.particleColor ?? { r: 148, g: 210, b: 255 };
        const offsetX = x + normalX * 12;
        const offsetY = y + normalY * 12;
        createParticles({
            x: offsetX,
            y: offsetY,
            color,
            count: 16,
            speedRange: [160, 420],
            sizeRange: [1.2, 3.2],
            lifeRange: [320, 640]
        });
        state.shieldHitPulse = Math.min(1.2, (state.shieldHitPulse ?? 0) + 0.5);
    }

    function repelObstacleFromPlayer(obstacle, source = player) {
        const shieldConfig = config.defensePower ?? {};
        const { x: playerCenterX, y: playerCenterY } = getPlayerCenter(source);
        const obstacleCenterX = obstacle.x + obstacle.width * 0.5;
        const obstacleCenterY = obstacle.y + obstacle.height * 0.5;
        const dx = obstacleCenterX - playerCenterX;
        const dy = obstacleCenterY - playerCenterY;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const normalX = dx / distance;
        const normalY = dy / distance;
        const clearance = shieldConfig.clearance ?? 12;
        const playerHalfWidth = source.width * 0.5;
        const playerHalfHeight = source.height * 0.5;
        const obstacleHalfWidth = obstacle.width * 0.5;
        const obstacleHalfHeight = obstacle.height * 0.5;
        const targetCenterX = playerCenterX + normalX * (playerHalfWidth + obstacleHalfWidth + clearance);
        const targetCenterY = playerCenterY + normalY * (playerHalfHeight + obstacleHalfHeight + clearance);

        obstacle.x = targetCenterX - obstacleHalfWidth;
        obstacle.y = clamp(targetCenterY - obstacleHalfHeight, 16, viewport.height - obstacle.height - 16);

        const knockback = shieldConfig.obstacleKnockback ?? 520;
        obstacle.vx = normalX * knockback;
        obstacle.vy = normalY * (knockback * 0.7);
        obstacle.bounceTimer = shieldConfig.obstacleBounceDuration ?? 520;
        const speedMultiplier = shieldConfig.obstacleSpeedMultiplier ?? 1.1;
        obstacle.speed = -Math.max(Math.abs(obstacle.speed), state.gameSpeed) * speedMultiplier;
        obstacle.shieldCooldown = shieldConfig.hitCooldown ?? 400;
        obstacle.hitFlash = 160;

        triggerShieldImpact(targetCenterX, targetCenterY, normalX, normalY);
    }

    function repelAsteroidFromPlayer(asteroid, source = player) {
        const shieldConfig = config.defensePower ?? {};
        const { x: playerCenterX, y: playerCenterY } = getPlayerCenter(source);
        const dx = asteroid.x - playerCenterX;
        const dy = asteroid.y - playerCenterY;
        const distance = Math.max(Math.hypot(dx, dy), 1);
        const normalX = dx / distance;
        const normalY = dy / distance;
        const clearance = shieldConfig.clearance ?? 12;
        const playerRadius = Math.max(source.width, source.height) * 0.5;
        const targetDistance = playerRadius + asteroid.radius + clearance;
        asteroid.x = playerCenterX + normalX * targetDistance;
        asteroid.y = clamp(playerCenterY + normalY * targetDistance, asteroid.radius, viewport.height - asteroid.radius);

        const knockback = shieldConfig.asteroidKnockback ?? 420;
        asteroid.vx = normalX * knockback;
        asteroid.vy = normalY * (knockback * 0.75);
        asteroid.shieldCooldown = shieldConfig.hitCooldown ?? 400;
        asteroid.hitFlash = 180;

        triggerShieldImpact(asteroid.x, asteroid.y, normalX, normalY);
    }


    function attemptShoot(delta) {
        state.timeSinceLastShot += delta;
        const loadout = getActiveWeaponLoadout();
        const cooldownMultiplier = loadout?.cooldownMultiplier ?? 1;
        const cooldownOffset = loadout?.cooldownOffset ?? 0;
        const cooldown = Math.max(60, config.projectileCooldown * cooldownMultiplier + cooldownOffset);
        if ((keys.has('Space') || virtualInput.firing || gamepadInput.firing) && state.timeSinceLastShot >= cooldown) {
            spawnProjectiles();
            state.timeSinceLastShot = 0;
        }
    }

    function spawnProjectiles() {
        const firedTypes = new Set();
        const shooters = getActivePlayerEntities();
        for (const shooter of shooters) {
            spawnProjectilesFromEntity(shooter, firedTypes);
        }
        for (const type of firedTypes) {
            audioManager.playProjectile(type);
        }
    }

    function spawnProjectilesFromEntity(entity, firedTypes) {
        if (!entity) {
            return;
        }
        const originX = entity.x + entity.width - 12;
        const originY = entity.y + entity.height * 0.5 - 6;
        const loadout = getActiveWeaponLoadout();
        const weaponId = getActiveWeaponId(loadout?.id ?? null);
        const patternState = getWeaponPatternState(weaponId);
        const loadoutSpeedMultiplier = loadout?.speedMultiplier ?? 1;
        const createProjectile = (angle, type = 'standard', overrides = {}) => {
            const archetype = projectileArchetypes[type] ?? projectileArchetypes.standard;
            const applyLoadoutSpeed = overrides.applyLoadoutSpeed !== false;
            const speedMultiplier =
                (overrides.speedMultiplier ?? archetype?.speedMultiplier ?? 1) *
                (applyLoadoutSpeed ? loadoutSpeedMultiplier : 1);
            const speed = config.projectileSpeed * speedMultiplier;
            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;
            const projectile = {
                x: originX + (overrides.offsetX ?? 0),
                y: originY + (overrides.offsetY ?? 0),
                width: overrides.width ?? archetype?.width ?? 24,
                height: overrides.height ?? archetype?.height ?? 12,
                vx,
                vy,
                life: overrides.life ?? archetype?.life ?? 2000,
                type,
                damage: overrides.damage ?? archetype?.damage ?? 1,
                gradient: overrides.gradient ?? archetype?.gradient ?? null,
                glow: overrides.glow ?? archetype?.glow ?? null,
                shape: overrides.shape ?? archetype?.shape ?? null,
                shadowBlur: overrides.shadowBlur ?? archetype?.shadowBlur ?? 0,
                shadowColor: overrides.shadowColor ?? archetype?.shadowColor ?? null
            };
            if (overrides.wavePhase !== undefined) projectile.wavePhase = overrides.wavePhase;
            if (overrides.waveFrequency !== undefined) projectile.waveFrequency = overrides.waveFrequency;
            if (overrides.waveAmplitude !== undefined) projectile.waveAmplitude = overrides.waveAmplitude;
            if (overrides.waveDrift !== undefined) projectile.waveDrift = overrides.waveDrift;
            if (overrides.sparkInterval !== undefined) projectile.sparkInterval = overrides.sparkInterval;
            if (overrides.segmentIndex !== undefined) projectile.segmentIndex = overrides.segmentIndex;
            if (overrides.segmentCount !== undefined) projectile.segmentCount = overrides.segmentCount;
            if (overrides.curve !== undefined) projectile.curve = overrides.curve;
            projectiles.push(projectile);
            if (firedTypes) {
                firedTypes.add(overrides.audioType ?? type);
            }
            return projectile;
        };

        const spawnFlameWhipBurst = () => {
            const segmentCount = reducedEffectsMode ? 4 : 6;
            const basePhase = (state.elapsedTime ?? 0) * 0.008;
            for (let i = 0; i < segmentCount; i++) {
                const t = segmentCount > 1 ? i / (segmentCount - 1) : 0;
                const amplitude = 12 + t * 22;
                const frequency = 8 + t * 3.8;
                const drift = 26 + t * 28;
                const life = 520 + i * 70;
                createProjectile(0, 'flameWhip', {
                    applyLoadoutSpeed: false,
                    offsetX: i * 18,
                    offsetY: (t - 0.5) * 26,
                    width: 48,
                    height: 26,
                    speedMultiplier: 1.24 + t * 0.18,
                    life,
                    damage: i >= segmentCount - 2 ? 2 : 1,
                    gradient: ['#450a0a', '#9f1239', '#f97316', '#fde68a'],
                    glow: 'rgba(248, 113, 113, 0.6)',
                    shadowBlur: 18,
                    shadowColor: 'rgba(248, 113, 113, 0.45)',
                    shape: 'flameWhip',
                    wavePhase: basePhase + t * Math.PI * 0.8,
                    waveFrequency: frequency,
                    waveAmplitude: amplitude,
                    waveDrift: drift,
                    sparkInterval: reducedEffectsMode ? 150 : 95,
                    segmentIndex: i,
                    segmentCount,
                    curve: 0,
                    audioType: 'flameWhip'
                });
            }

            const emberColor = { r: 255, g: 120, b: 78 };
            createParticles({
                x: originX,
                y: originY,
                color: emberColor,
                count: reducedEffectsMode ? 8 : 14,
                speedRange: [120, 360],
                sizeRange: [0.9, 2.4],
                lifeRange: [260, 520]
            });
        };

        if (isPowerUpActive(FLAME_WHIP_POWER)) {
            spawnFlameWhipBurst();
        } else if (isPowerUpActive('missiles')) {
            createProjectile(0, 'missile', { applyLoadoutSpeed: false });
            createProjectile(0.12, 'missile', { applyLoadoutSpeed: false, offsetY: 10 });
        } else if (isPowerUpActive('bulletSpread')) {
            const spread = 0.22;
            createProjectile(-spread, 'spread', { applyLoadoutSpeed: false });
            createProjectile(0, 'spread', { applyLoadoutSpeed: false });
            createProjectile(spread, 'spread', { applyLoadoutSpeed: false });
        } else if (typeof loadout?.pattern === 'function') {
            loadout.pattern(createProjectile, { originX, originY, state: patternState, weaponId });
        } else {
            createProjectile(0, 'standard');
        }
    }

    function updateTailLength(delta) {
        const deltaSeconds = delta / 1000;
        if (state.tailLength < state.tailTarget) {
            state.tailLength = Math.min(
                state.tailTarget,
                state.tailLength + config.tailSmoothing.growth * deltaSeconds
            );
        } else if (state.tailLength > state.tailTarget) {
            state.tailLength = Math.max(
                state.tailTarget,
                state.tailLength - config.tailSmoothing.shrink * deltaSeconds
            );
        }
    }

    function updateDoubleTeamTrail(deltaSeconds) {
        if (!doubleTeamState.clone) {
            if (doubleTeamState.trail.length) {
                doubleTeamState.trail.length = 0;
            }
            return;
        }

        const clone = doubleTeamState.clone;
        const centerX = clone.x + clone.width * 0.45;
        const centerY = clone.y + clone.height * 0.55;
        const powerConfig = config.doubleTeamPower ?? {};
        const spacing = Math.max(6, config.trailSpacing * (powerConfig.trailSpacingScale ?? 0.85));
        const last = doubleTeamState.trail[doubleTeamState.trail.length - 1];
        if (!last || Math.hypot(centerX - last.x, centerY - last.y) > spacing) {
            doubleTeamState.trail.push({ x: centerX, y: centerY });
        }

        const maxLength = Math.max(4, Math.round(state.tailLength * (powerConfig.trailSpacingScale ?? 0.85)));
        while (doubleTeamState.trail.length > maxLength) {
            doubleTeamState.trail.shift();
        }
    }

    function updateDoubleTeamFormation(deltaSeconds) {
        if (!doubleTeamState.clone) {
            doubleTeamState.linkPulse = Math.max(0, doubleTeamState.linkPulse - deltaSeconds);
            doubleTeamState.wobble = 0;
            return;
        }

        const powerConfig = config.doubleTeamPower ?? {};
        const clone = doubleTeamState.clone;
        ensureDoubleTeamCloneDimensions();

        const separation = powerConfig.separation ?? Math.max(120, player.height * 0.9);
        const catchUpRate = Math.max(0, powerConfig.catchUpRate ?? 6.5);
        const wobbleAmplitude = powerConfig.wobbleAmplitude ?? 6.5;
        const playerCenter = getPlayerCenter(player);
        const cloneCenter = getPlayerCenter(clone);
        const offsetX = cloneCenter.x - playerCenter.x;
        const offsetY = cloneCenter.y - playerCenter.y;
        const targetOffsetX = wobbleAmplitude
            ? Math.sin(doubleTeamState.wobble) * wobbleAmplitude
            : 0;
        const targetOffsetY = -separation;
        const diffX = targetOffsetX - offsetX;
        const diffY = targetOffsetY - offsetY;
        const catchUpFactor = clamp(catchUpRate * deltaSeconds, 0, 0.92);

        if (catchUpFactor > 0) {
            clone.x += diffX * catchUpFactor;
            clone.y += diffY * catchUpFactor;

            if (deltaSeconds > 0) {
                const invDelta = 1 / deltaSeconds;
                const velocityBlend = Math.min(1, catchUpRate * deltaSeconds) * 0.45;
                clone.vx += (diffX * invDelta) * velocityBlend;
                clone.vy += (diffY * invDelta) * velocityBlend;
            }
        }

        const cloneVerticalBleed = getVerticalBleedForHeight(clone.height);
        clone.x = clamp(clone.x, 0, viewport.width - clone.width);
        clone.y = clamp(clone.y, -cloneVerticalBleed, viewport.height - clone.height + cloneVerticalBleed);

        const wobbleSpeed = powerConfig.wobbleSpeed ?? 3.2;
        doubleTeamState.wobble += deltaSeconds * wobbleSpeed;
        if (doubleTeamState.wobble > Math.PI * 2) {
            doubleTeamState.wobble %= Math.PI * 2;
        }
        doubleTeamState.linkPulse = Math.max(0, doubleTeamState.linkPulse - deltaSeconds * 0.6);
    }

    function createDoubleTeamClone() {
        return {
            x: player.x,
            y: player.y,
            width: config.player.width,
            height: config.player.height,
            vx: player.vx ?? 0,
            vy: player.vy ?? 0
        };
    }

    function startDoubleTeam() {
        ensureDoubleTeamCloneDimensions();
        if (!doubleTeamState.clone) {
            doubleTeamState.clone = createDoubleTeamClone();
        } else {
            doubleTeamState.clone.x = player.x;
            doubleTeamState.clone.y = player.y;
        }
        const clone = doubleTeamState.clone;
        clone.vx = player.vx;
        clone.vy = player.vy;
        const powerConfig = config.doubleTeamPower ?? {};
        const separation = powerConfig.separation ?? Math.max(120, player.height * 0.9);
        const verticalBleed = getVerticalBleedForHeight(player.height);
        player.x = clamp(player.x, 0, viewport.width - player.width);
        player.y = clamp(player.y, -verticalBleed, viewport.height - player.height + verticalBleed);

        clone.x = clamp(player.x, 0, viewport.width - clone.width);
        let targetCloneY = player.y - separation;
        const cloneVerticalBleed = getVerticalBleedForHeight(clone.height);
        const minCloneY = -cloneVerticalBleed;
        const maxCloneY = viewport.height - clone.height + cloneVerticalBleed;
        if (targetCloneY < minCloneY) {
            const diff = minCloneY - targetCloneY;
            targetCloneY = minCloneY;
            player.y = clamp(player.y + diff, -verticalBleed, viewport.height - player.height + verticalBleed);
        } else if (targetCloneY > maxCloneY) {
            const diff = targetCloneY - maxCloneY;
            targetCloneY = maxCloneY;
            player.y = clamp(player.y - diff, -verticalBleed, viewport.height - player.height + verticalBleed);
        }
        clone.y = targetCloneY;
        doubleTeamState.trail.length = 0;
        doubleTeamState.linkPulse = 1.1;
        doubleTeamState.wobble = 0;

        const color = powerUpColors[DOUBLE_TEAM_POWER] ?? { r: 188, g: 224, b: 255 };
        const center = getPlayerCenter();
        createParticles({
            x: center.x,
            y: center.y,
            color,
            count: reducedEffectsMode ? 10 : 18,
            speedRange: [160, 420],
            sizeRange: [1, 2.6],
            lifeRange: [320, 560]
        });
    }

    function endDoubleTeam(force = false) {
        if (!doubleTeamState.clone) {
            doubleTeamState.trail.length = 0;
            if (force) {
                doubleTeamState.linkPulse = 0;
            }
            return;
        }

        if (!force) {
            const color = powerUpColors[DOUBLE_TEAM_POWER] ?? { r: 188, g: 224, b: 255 };
            const center = getPlayerCenter(doubleTeamState.clone);
            createParticles({
                x: center.x,
                y: center.y,
                color,
                count: reducedEffectsMode ? 6 : 12,
                speedRange: [140, 360],
                sizeRange: [0.9, 2.2],
                lifeRange: [280, 520]
            });
        }

        doubleTeamState.clone = null;
        doubleTeamState.trail.length = 0;
        doubleTeamState.wobble = 0;
        doubleTeamState.linkPulse = force ? 0 : Math.max(doubleTeamState.linkPulse, 0.5);
    }

    function updatePlayer(delta) {
        const deltaSeconds = delta / 1000;
        const keyboardX = (keys.has('ArrowRight') || keys.has('KeyD') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('KeyA') ? 1 : 0);
        const keyboardY = (keys.has('ArrowDown') || keys.has('KeyS') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('KeyW') ? 1 : 0);
        let virtualX = virtualInput.moveX;
        let virtualY = virtualInput.moveY;
        if (isTouchInterface) {
            const smoothingFactor = clamp(deltaSeconds * TOUCH_SMOOTHING_RATE, 0, 1);
            virtualInput.smoothedX += (virtualInput.moveX - virtualInput.smoothedX) * smoothingFactor;
            virtualInput.smoothedY += (virtualInput.moveY - virtualInput.smoothedY) * smoothingFactor;
            virtualX = virtualInput.smoothedX;
            virtualY = virtualInput.smoothedY;
        } else {
            virtualInput.smoothedX = virtualInput.moveX;
            virtualInput.smoothedY = virtualInput.moveY;
        }
        if (motionInput.enabled && motionInput.active) {
            const now = getTimestamp();
            if (now - motionInput.lastUpdate > MOTION_IDLE_TIMEOUT) {
                motionInput.moveX = 0;
                motionInput.moveY = 0;
            }
        }
        let motionX = 0;
        let motionY = 0;
        if (motionInput.enabled) {
            if (motionInput.active) {
                const motionSmoothing = clamp(deltaSeconds * MOTION_SMOOTHING_RATE, 0, 1);
                motionInput.smoothedX += (motionInput.moveX - motionInput.smoothedX) * motionSmoothing;
                motionInput.smoothedY += (motionInput.moveY - motionInput.smoothedY) * motionSmoothing;
                motionX = motionInput.smoothedX;
                motionY = motionInput.smoothedY;
            } else {
                motionInput.smoothedX = motionInput.moveX;
                motionInput.smoothedY = motionInput.moveY;
            }
        }
        const inputX = clamp(keyboardX + virtualX + gamepadInput.moveX + motionX, -1, 1);
        const inputY = clamp(keyboardY + virtualY + gamepadInput.moveY + motionY, -1, 1);

        const accel = config.player.acceleration;
        const drag = config.player.drag;
        const dashConfig = config.player.dash;
        const isDashing = state.dashTimer > 0;
        const effectiveDrag = isDashing ? drag * dashConfig.dragMultiplier : drag;
        const maxSpeed = isDashing ? dashConfig.boostSpeed : config.player.maxSpeed;
        const moveEntity = (entity) => {
            if (!entity) {
                return;
            }
            const verticalBleed = getVerticalBleedForHeight(entity.height);
            entity.vx += (inputX * accel - entity.vx * effectiveDrag) * deltaSeconds;
            entity.vy += (inputY * accel - entity.vy * effectiveDrag) * deltaSeconds;
            entity.vx = clamp(entity.vx, -maxSpeed, maxSpeed);
            entity.vy = clamp(entity.vy, -maxSpeed, maxSpeed);
            entity.x += entity.vx * deltaSeconds;
            entity.y += entity.vy * deltaSeconds;
            entity.x = clamp(entity.x, 0, viewport.width - entity.width);
            entity.y = clamp(entity.y, -verticalBleed, viewport.height - entity.height + verticalBleed);
        };

        const players = getActivePlayerEntities();
        for (const entity of players) {
            moveEntity(entity);
        }

        if (state.dashTimer > 0) {
            state.dashTimer = Math.max(0, state.dashTimer - delta);
        }

        attemptShoot(delta);

        updateTailLength(delta);
        if (isPowerUpActive(PUMP_POWER) || pumpTailState.fade > 0.001) {
            if (isPowerUpActive(PUMP_POWER)) {
                ensurePumpTailInitialized();
            }
        } else {
            updateTrail();
        }

        updateDoubleTeamFormation(deltaSeconds);
        updateDoubleTeamTrail(deltaSeconds);
    }

    function updateTrail() {
        const centerX = player.x + player.width * 0.45;
        const centerY = player.y + player.height * 0.55;
        const lastPoint = trail[trail.length - 1];
        if (!lastPoint || Math.hypot(centerX - lastPoint.x, centerY - lastPoint.y) > config.trailSpacing) {
            trail.push({
                x: centerX,
                y: centerY
            });
            if (trail.length > state.tailLength) {
                trail.shift();
            }
        }
    }

    function ensurePumpTailInitialized() {
        if (pumpTailState.active) {
            return;
        }
        pumpTailState.bars.length = 0;
        const barCount = Math.max(6, Math.round(state.tailLength));
        pumpTailState.active = true;
        pumpTailState.waveTime = 0;
        pumpTailState.fade = 0;
        pumpTailState.centerX = player.x + player.width * 0.3;
        pumpTailState.spread = Math.min(viewport.width * 0.85, Math.max(180, barCount * 26));
        const lengthFactor = state.tailLength / Math.max(1, config.baseTrailLength);
        pumpTailState.baseHeight = Math.min(
            viewport.height * 0.52,
            viewport.height * (0.16 + Math.min(0.32, lengthFactor * 0.26))
        );
        pumpTailState.amplitude = 0.38 + Math.min(1.1, lengthFactor * 0.5);
        pumpTailState.frequency = 1.6 + Math.min(1.6, lengthFactor * 0.35);
        pumpTailState.bars = Array.from({ length: barCount }, (_, index) => ({
            offset: index - (barCount - 1) / 2,
            phase: Math.random() * Math.PI * 2,
            weight: 0.75 + Math.random() * 0.55
        }));
        pumpTailState.releasePending = false;
        trail.length = 0;
        updatePumpTailSegments();
    }

    function stopPumpTailEffect() {
        pumpTailState.active = false;
        pumpTailState.releasePending = true;
    }

    function updatePumpTailSegments() {
        const segments = pumpTailState.segments;
        segments.length = 0;

        if (!pumpTailState.bars.length || pumpTailState.fade <= 0) {
            return;
        }

        const baseY = viewport.height - 28;
        const barCount = pumpTailState.bars.length;
        const spacing = barCount > 1 ? pumpTailState.spread / (barCount - 1) : 0;
        const startX = pumpTailState.centerX - (barCount > 1 ? pumpTailState.spread / 2 : 0);
        const baseWidth = barCount > 0 ? Math.min(48, Math.max(10, spacing * 0.52)) : 16;

        for (let i = 0; i < barCount; i++) {
            const bar = pumpTailState.bars[i];
            const normalizedIndex = barCount > 1 ? i / (barCount - 1) : 0;
            const x = clamp(
                startX + i * spacing,
                baseWidth * 0.5,
                viewport.width - baseWidth * 0.5
            );
            const wave = Math.sin(pumpTailState.waveTime + normalizedIndex * 1.6 + bar.phase);
            const normalizedWave = wave * 0.5 + 0.5;
            const height = pumpTailState.baseHeight * (
                0.3 + pumpTailState.amplitude * bar.weight * normalizedWave
            );
            const scaledHeight = height * pumpTailState.fade;

            if (scaledHeight <= 0) {
                continue;
            }

            const topY = baseY - scaledHeight;
            segments.push({
                x: x - baseWidth / 2,
                y: topY,
                width: baseWidth,
                height: scaledHeight,
                centerX: x,
                normalizedIndex,
                baseY
            });
        }
    }

    function updatePumpTail(delta) {
        const deltaSeconds = delta / 1000;
        const isActive = isPowerUpActive(PUMP_POWER);
        if (isActive) {
            ensurePumpTailInitialized();
        } else if (pumpTailState.active) {
            stopPumpTailEffect();
        }

        const fadeTarget = isActive ? 1 : 0;
        const fadeSpeed = isActive ? 2.6 : 3.5;
        pumpTailState.fade = moveTowards(pumpTailState.fade, fadeTarget, deltaSeconds * fadeSpeed);

        if (pumpTailState.fade <= 0.001 && !isActive) {
            pumpTailState.fade = 0;
            if (pumpTailState.releasePending) {
                pumpTailState.bars.length = 0;
                pumpTailState.releasePending = false;
            }
        }

        if (pumpTailState.fade <= 0 && !isActive) {
            pumpTailState.segments.length = 0;
            return;
        }

        const waveAdvance = pumpTailState.frequency * Math.PI * 2 * (isActive ? 1 : 0.6);
        pumpTailState.waveTime += deltaSeconds * waveAdvance;
        if (pumpTailState.bars.length) {
            const targetX = player.x + player.width * 0.3;
            pumpTailState.centerX = moveTowards(
                pumpTailState.centerX,
                targetX,
                deltaSeconds * 420
            );
            const lengthFactor = state.tailLength / Math.max(1, config.baseTrailLength);
            const targetAmplitude = 0.38 + Math.min(1.1, lengthFactor * 0.5);
            pumpTailState.amplitude = moveTowards(
                pumpTailState.amplitude,
                targetAmplitude,
                deltaSeconds * 2.4
            );
            const targetBaseHeight = Math.min(
                viewport.height * 0.52,
                viewport.height * (0.16 + Math.min(0.32, lengthFactor * 0.26))
            );
            pumpTailState.baseHeight = moveTowards(
                pumpTailState.baseHeight,
                targetBaseHeight,
                deltaSeconds * viewport.height * 0.6
            );
            const targetSpread = Math.min(
                viewport.width * 0.85,
                Math.max(180, Math.round(state.tailLength) * 26)
            );
            pumpTailState.spread = moveTowards(
                pumpTailState.spread,
                targetSpread,
                deltaSeconds * 260
            );
        }

        updatePumpTailSegments();
    }

    function drawPumpTail() {
        if (!pumpTailState.segments.length || pumpTailState.fade <= 0) {
            return;
        }

        const time = performance.now();

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.shadowBlur = 24 * pumpTailState.fade;

        for (const segment of pumpTailState.segments) {
            const hue = (segment.normalizedIndex * 280 + time * 0.08) % 360;
            const gradient = ctx.createLinearGradient(segment.centerX, segment.y, segment.centerX, segment.baseY);
            gradient.addColorStop(0, `hsla(${hue}, 100%, 74%, ${0.72 * pumpTailState.fade})`);
            gradient.addColorStop(1, `hsla(${(hue + 40) % 360}, 100%, 48%, ${0.18 * pumpTailState.fade})`);
            ctx.fillStyle = gradient;
            ctx.shadowColor = `hsla(${hue}, 100%, 70%, ${0.45 * pumpTailState.fade})`;
            ctx.fillRect(segment.x, segment.y, segment.width, segment.height);

            if (segment.height > 12) {
                ctx.fillStyle = `hsla(${(hue + 60) % 360}, 100%, 85%, ${0.35 * pumpTailState.fade})`;
                ctx.fillRect(segment.x, segment.y - 6, segment.width, 6);
            }
        }

        ctx.restore();
    }

    function isPumpTailDamaging() {
        return pumpTailState.segments.length > 0 && pumpTailState.fade > 0;
    }

    function pumpTailIntersectsRect(rect) {
        if (!isPumpTailDamaging()) {
            return false;
        }
        for (const segment of pumpTailState.segments) {
            if (rectOverlap(segment, rect)) {
                return true;
            }
        }
        return false;
    }

    function pumpTailIntersectsCircle(circle) {
        if (!isPumpTailDamaging()) {
            return false;
        }
        for (const segment of pumpTailState.segments) {
            if (circleRectOverlap(circle, segment)) {
                return true;
            }
        }
        return false;
    }

    function findNearestObstacle(projectile) {
        let closest = null;
        let closestDistSq = Infinity;
        const projCenterX = projectile.x + projectile.width * 0.5;
        const projCenterY = projectile.y + projectile.height * 0.5;
        for (const obstacle of obstacles) {
            const centerX = obstacle.x + obstacle.width * 0.5;
            const centerY = obstacle.y + obstacle.height * 0.5;
            const dx = centerX - projCenterX;
            const dy = centerY - projCenterY;
            const distSq = dx * dx + dy * dy;
            if (distSq < closestDistSq) {
                closest = { obstacle, dx, dy, distSq };
                closestDistSq = distSq;
            }
        }
        return closest?.obstacle ?? null;
    }

    function updateProjectiles(delta) {
        const deltaSeconds = delta / 1000;
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const projectile = projectiles[i];

            if (projectile.type === 'missile') {
                const target = findNearestObstacle(projectile);
                if (target) {
                    const centerX = projectile.x + projectile.width * 0.5;
                    const centerY = projectile.y + projectile.height * 0.5;
                    const targetX = target.x + target.width * 0.5;
                    const targetY = target.y + target.height * 0.5;
                    const angle = Math.atan2(targetY - centerY, targetX - centerX);
                    const desiredSpeed = config.projectileSpeed * 1.05;
                    const desiredVx = Math.cos(angle) * desiredSpeed;
                    const desiredVy = Math.sin(angle) * desiredSpeed;
                    const turnStrength = Math.min(1, deltaSeconds * 3.5);
                    projectile.vx += (desiredVx - projectile.vx) * turnStrength;
                    projectile.vy += (desiredVy - projectile.vy) * turnStrength;
                }
            }

            if (projectile.type === 'flameWhip') {
                projectile.waveTime = (projectile.waveTime ?? 0) + delta;
                const phase = projectile.wavePhase ?? 0;
                const frequency = projectile.waveFrequency ?? 9;
                const amplitude = projectile.waveAmplitude ?? 18;
                const drift = projectile.waveDrift ?? 28;
                const waveSeconds = projectile.waveTime / 1000;
                projectile.curve = Math.sin(waveSeconds * frequency + phase) * amplitude;
                projectile.y += Math.cos(waveSeconds * (frequency * 0.55) + phase * 1.1) * drift * deltaSeconds * 0.12;

                const interval = projectile.sparkInterval ?? (reducedEffectsMode ? 150 : 95);
                projectile.sparkTimer = (projectile.sparkTimer ?? interval) - delta;
                if (projectile.sparkTimer <= 0) {
                    projectile.sparkTimer += interval;
                    if (!reducedEffectsMode) {
                        const sparkX = projectile.x + projectile.width * (0.3 + Math.random() * 0.7);
                        const sparkY = projectile.y + projectile.height * (0.2 + Math.random() * 0.6);
                        const sparkColor = { r: 255, g: 170 + Math.random() * 40, b: 104 };
                        particles.push({
                            x: sparkX,
                            y: sparkY,
                            vx: 60 + Math.random() * 80,
                            vy: (Math.random() - 0.5) * 120,
                            life: 240 + Math.random() * 160,
                            color: sparkColor,
                            colorStyle: getParticleColorStyle(sparkColor),
                            size: 1.1 + Math.random() * 1.4
                        });
                    }
                }
            }

            projectile.x += projectile.vx * deltaSeconds;
            projectile.y += projectile.vy * deltaSeconds;
            projectile.life -= delta;

            if (
                projectile.x > viewport.width + 80 ||
                projectile.x + projectile.width < -80 ||
                projectile.y < -120 ||
                projectile.y > viewport.height + 120 ||
                projectile.life <= 0
            ) {
                projectiles.splice(i, 1);
            }
        }
    }

    function getVillainHealth(size, villainType) {
        const range = villainType.size.max - villainType.size.min;
        const normalized = range > 0 ? (size - villainType.size.min) / range : 0;
        const base = villainType.baseHealth + normalized * villainType.healthGrowth;
        const scaled = base * getHealthRampMultiplier();
        return Math.max(1, Math.round(scaled));
    }

    function createVillainBehaviorState(villainType, size) {
        const behavior = villainType.behavior ?? { type: 'none' };
        const state = { type: behavior.type };

        switch (behavior.type) {
            case 'sine': {
                const amplitude = behavior.amplitude ?? 40;
                const available = Math.max(0, viewport.height - size - amplitude * 2);
                const baseY = available > 0 ? Math.random() * available + amplitude : Math.random() * (viewport.height - size);
                const phase = Math.random() * Math.PI * 2;
                const initialY = clamp(baseY + Math.sin(phase) * amplitude, 0, viewport.height - size);
                Object.assign(state, {
                    amplitude,
                    speed: behavior.speed ?? 3,
                    phase,
                    baseY,
                    initialY
                });
                break;
            }
            case 'hover': {
                const amplitude = behavior.amplitude ?? 40;
                const center = Math.random() * (viewport.height - size);
                const lowerBound = 16;
                const upperBound = Math.max(lowerBound, viewport.height - size - lowerBound);
                let minY = clamp(center - amplitude, lowerBound, upperBound);
                let maxY = clamp(center + amplitude, lowerBound, upperBound);
                if (minY > maxY) {
                    const mid = (minY + maxY) / 2;
                    minY = mid;
                    maxY = mid;
                }
                Object.assign(state, {
                    minY,
                    maxY,
                    speed: behavior.verticalSpeed ?? 60,
                    direction: Math.random() < 0.5 ? -1 : 1,
                    initialY: clamp(center, minY, maxY)
                });
                break;
            }
            case 'drift': {
                const initialY = Math.random() * (viewport.height - size);
                const maxVertical = behavior.verticalSpeed ?? 120;
                Object.assign(state, {
                    vy: randomBetween(-maxVertical, maxVertical),
                    verticalSpeed: maxVertical,
                    initialY
                });
                break;
            }
            case 'tracker': {
                const initialY = Math.random() * (viewport.height - size);
                Object.assign(state, {
                    vy: 0,
                    acceleration: behavior.acceleration ?? 120,
                    maxSpeed: behavior.maxSpeed ?? 180,
                    initialY
                });
                break;
            }
            default: {
                state.initialY = Math.random() * (viewport.height - size);
                break;
            }
        }

        return state;
    }

    function isBossObstacle(obstacle) {
        return Boolean(obstacle?.villainType?.isBoss);
    }

    function completeBossBattle() {
        state.bossBattle.active = false;
        state.bossBattle.bossSpawned = false;
        state.bossBattle.defeated = true;
        state.bossBattle.powerUpSpawned = false;
        state.bossBattle.alertTimer = 0;
        state.bossBattle.triggered = false;
        if (typeof state.bossBattle.currentIndex === 'number') {
            state.bossBattle.nextEventIndex = Math.max(
                state.bossBattle.nextEventIndex,
                state.bossBattle.currentIndex + 1
            );
        }
        state.bossBattle.currentIndex = null;
        state.bossBattle.currentConfig = null;
        enemyProjectiles.length = 0;
        spawnTimers.obstacle = 0;
        spawnTimers.collectible = 0;
        spawnTimers.powerUp = 0;
    }

    function createBossBehaviorState(villainType, spawnY, bounds) {
        const behavior = villainType?.behavior ?? { type: 'hover' };
        const lowerBound = bounds?.lowerBound ?? 16;
        const upperBound = bounds?.upperBound ?? Math.max(lowerBound, viewport.height - (villainType?.height ?? 0) - lowerBound);
        const clampedSpawn = clamp(spawnY, lowerBound, upperBound);
        switch (behavior.type) {
            case 'hover': {
                const amplitude = behavior.amplitude ?? 0;
                let minY = clamp(clampedSpawn - amplitude, lowerBound, upperBound);
                let maxY = clamp(clampedSpawn + amplitude, lowerBound, upperBound);
                if (minY > maxY) {
                    const mid = (minY + maxY) / 2;
                    minY = mid;
                    maxY = mid;
                }
                return {
                    type: 'hover',
                    speed: behavior.verticalSpeed ?? 60,
                    minY,
                    maxY,
                    direction: 1
                };
            }
            case 'sweep': {
                return {
                    type: 'sweep',
                    phase: 0,
                    speed: behavior.speed ?? 1.6,
                    amplitude: behavior.amplitude ?? 160,
                    centerY: clampedSpawn,
                    followSpeed: behavior.followSpeed ?? 1.2
                };
            }
            case 'tracker': {
                return {
                    type: 'tracker',
                    vy: 0,
                    acceleration: behavior.acceleration ?? 240,
                    maxSpeed: behavior.maxSpeed ?? 280,
                    initialY: clampedSpawn
                };
            }
            default:
                return { type: behavior.type ?? 'hover' };
        }
    }

    function spawnBoss() {
        const bossConfig = state.bossBattle.currentConfig;
        if (!bossConfig) {
            return;
        }
        const villainType = bossConfig.villain;
        const width = villainType.width;
        const height = villainType.height ?? width;
        const spawnY = clamp(
            viewport.height * 0.5 - height * 0.5,
            32,
            viewport.height - height - 32
        );
        const lowerBound = 16;
        const upperBound = Math.max(lowerBound, viewport.height - height - lowerBound);
        const behaviorState = createBossBehaviorState(villainType, spawnY, { lowerBound, upperBound });
        const attackConfig = bossConfig.attack ?? null;
        const cooldown = attackConfig?.cooldown ?? 2000;
        const initialDelay = attackConfig
            ? attackConfig.initialDelay ?? Math.max(400, cooldown * 0.5)
            : 0;

        obstacles.push({
            x: viewport.width + width,
            y: clamp(spawnY, lowerBound, upperBound),
            width,
            height,
            speed: villainType.speed ?? Math.max(60, state.gameSpeed * 0.22),
            rotation: 0,
            rotationSpeed: 0,
            health: villainType.health,
            maxHealth: villainType.health,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            bounceTimer: 0,
            shieldCooldown: 0,
            villainType,
            behaviorState,
            image: villainType.image,
            bossState: {
                attackConfig,
                attackTimer: initialDelay,
                burstShotsRemaining: 0,
                burstTimer: 0
            }
        });
        state.bossBattle.bossSpawned = true;
        state.lastVillainKey = villainType.key;
    }

    function startBossBattle() {
        if (state.bossBattle.active) {
            return;
        }
        const nextIndex = state.bossBattle.nextEventIndex;
        const bossConfig = bossBattleDefinitions[nextIndex];
        if (!bossConfig) {
            return;
        }
        state.bossBattle.triggered = true;
        state.bossBattle.active = true;
        state.bossBattle.bossSpawned = false;
        state.bossBattle.powerUpSpawned = false;
        state.bossBattle.alertTimer = BOSS_ALERT_DURATION;
        state.bossBattle.currentIndex = nextIndex;
        state.bossBattle.currentConfig = bossConfig;
        state.bossBattle.defeated = false;
        storyManager.recordEvent('boss', {
            status: 'engaged',
            boss: bossConfig?.villain?.key ?? null,
            name: bossConfig?.villain?.name ?? null
        });
        enemyProjectiles.length = 0;
        obstacles.length = 0;
        collectibles.length = 0;
        powerUps.length = 0;
        spawnTimers.obstacle = 0;
        spawnTimers.collectible = 0;
        spawnTimers.powerUp = 0;
        spawnBoss();
        spawnBossSupportPowerUp();
    }

    function spawnObstacle() {
        if (state.bossBattle.active) {
            if (!state.bossBattle.bossSpawned) {
                spawnBoss();
            }
            return;
        }
        const villainType = selectVillainType();
        const size = randomBetween(villainType.size.min, villainType.size.max);
        const health = getVillainHealth(size, villainType);
        const behaviorState = createVillainBehaviorState(villainType, size);
        const spawnY = behaviorState.initialY ?? Math.random() * (viewport.height - size);
        delete behaviorState.initialY;
        const rotationSpeed = randomBetween(villainType.rotation.min, villainType.rotation.max);
        obstacles.push({
            x: viewport.width + size,
            y: spawnY,
            width: size,
            height: size,
            speed: state.gameSpeed + randomBetween(villainType.speedOffset.min, villainType.speedOffset.max),
            rotation: Math.random() * Math.PI * 2,
            rotationSpeed,
            health,
            maxHealth: health,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            bounceTimer: 0,
            shieldCooldown: 0,
            villainType,
            behaviorState,
            image: villainImages[villainType.key]
        });
        state.lastVillainKey = villainType.key;
        state.recentVillains.push(villainType.key);
        if (state.recentVillains.length > 6) {
            state.recentVillains.shift();
        }
        if (behaviorState.baseY === undefined) {
            behaviorState.baseY = spawnY;
        }
    }

    function spawnCollectible() {
        const tier = selectCollectibleTier();
        const baseSize = config.collectible.size ?? 32;
        const size = baseSize * (tier.sizeMultiplier ?? 1);
        const verticalPadding = config.collectible.verticalPadding ?? 48;
        const spawnRange = Math.max(viewport.height - size - verticalPadding * 2, 0);
        const spawnY = verticalPadding + Math.random() * spawnRange;
        collectibles.push({
            x: viewport.width + size,
            y: spawnY,
            width: size,
            height: size,
            speed: state.gameSpeed + (Math.random() * (config.collectible.maxSpeed - config.collectible.minSpeed) + config.collectible.minSpeed),
            wobbleTime: Math.random() * Math.PI * 2,
            type: tier.key,
            points: tier.points,
            sprite: collectibleImages[tier.key],
            glow: tier.glow,
            particleColor: tier.particleColor,
            label: tier.label
        });
    }

    function selectCollectibleTier() {
        if (collectibleTiers.length === 0) {
            return {
                key: 'point',
                label: 'POINT',
                src: 'assets/point.png',
                points: baseCollectScore,
                weight: 1,
                sizeMultiplier: 1,
                glow: null,
                particleColor: { r: 255, g: 215, b: 0 }
            };
        }

        const roll = Math.random() * (totalCollectibleWeight || 1);
        let cumulative = 0;
        for (const tier of collectibleTiers) {
            cumulative += tier.weight;
            if (roll <= cumulative) {
                return tier;
            }
        }
        return collectibleTiers[collectibleTiers.length - 1];
    }

    function spawnPowerUp(forcedType) {
        const now = state?.elapsedTime ?? 0;
        const type = forcedType ?? powerUpSpawnDirector.chooseType(now);
        if (!type) {
            return null;
        }
        const size = config.powerUp.size;
        powerUps.push({
            x: viewport.width + size,
            y: Math.random() * (viewport.height - size * 2) + size,
            width: size,
            height: size,
            speed: state.gameSpeed + (Math.random() * (config.powerUp.maxSpeed - config.powerUp.minSpeed) + config.powerUp.minSpeed),
            wobbleTime: Math.random() * Math.PI * 2,
            type
        });
        powerUpSpawnDirector.recordSpawn(type, now);
        return powerUps[powerUps.length - 1];
    }

    function spawnBossSupportPowerUp() {
        if (state.bossBattle.powerUpSpawned) {
            return;
        }
        const powerUp = spawnPowerUp();
        if (powerUp) {
            powerUp.x = viewport.width - powerUp.width * 0.5;
        }
        state.bossBattle.powerUpSpawned = true;
        spawnTimers.powerUp = 0;
        const plannedInterval = powerUpSpawnDirector.planNextInterval(config?.powerUpSpawnInterval);
        if (Number.isFinite(plannedInterval) && plannedInterval > 0) {
            nextPowerUpSpawnInterval = plannedInterval;
        }
    }

    function getBossProjectileOrigin(obstacle) {
        if (!obstacle) {
            return { x: 0, y: 0 };
        }
        const originX = obstacle.x + obstacle.width * 0.12;
        const originY = obstacle.y + obstacle.height * 0.5;
        return { x: originX, y: originY };
    }

    function spawnBossProjectile({
        originX,
        originY,
        angle,
        speed,
        size,
        color,
        onHitMessage,
        ownerKey
    }) {
        const width = size?.width ?? 24;
        const height = size?.height ?? 12;
        const velocity = speed ?? 360;
        const vx = Math.cos(angle) * velocity;
        const vy = Math.sin(angle) * velocity;
        enemyProjectiles.push({
            x: originX - width * 0.5,
            y: originY - height * 0.5,
            width,
            height,
            vx,
            vy,
            life: 8000,
            color: color ?? '#f87171',
            onHitMessage: onHitMessage ?? null,
            ownerKey: ownerKey ?? null
        });
    }

    function fireBossProjectiles(obstacle, attackConfig) {
        if (!attackConfig || !player) {
            return;
        }
        const origin = getBossProjectileOrigin(obstacle);
        const target = {
            x: player.x + player.width * 0.5,
            y: player.y + player.height * 0.5
        };
        const baseAngle = Math.atan2(target.y - origin.y, target.x - origin.x);
        const speed = attackConfig.projectileSpeed ?? 360;
        const size = attackConfig.projectileSize ?? { width: 28, height: 12 };
        const color = attackConfig.color ?? '#f87171';
        const ownerKey = obstacle?.villainType?.key ?? null;
        const message = attackConfig.onHitMessage;
        const spawnShot = (angle) => {
            spawnBossProjectile({
                originX: origin.x,
                originY: origin.y,
                angle,
                speed,
                size,
                color,
                onHitMessage: message,
                ownerKey
            });
        };

        switch (attackConfig.type) {
            case 'spread': {
                const count = Math.max(1, attackConfig.count ?? 3);
                const spreadAngle = attackConfig.spreadAngle ?? Math.PI / 10;
                if (count === 1) {
                    spawnShot(baseAngle);
                    break;
                }
                const totalSpread = spreadAngle * (count - 1);
                for (let i = 0; i < count; i++) {
                    const offset = -totalSpread / 2 + spreadAngle * i;
                    spawnShot(baseAngle + offset);
                }
                break;
            }
            default:
                spawnShot(baseAngle);
                break;
        }
    }

    function handleBossAttack(obstacle, deltaMs) {
        if (!isBossObstacle(obstacle) || !state.bossBattle.active) {
            return;
        }
        const bossState = obstacle.bossState;
        if (!bossState || !bossState.attackConfig) {
            return;
        }
        const attackConfig = bossState.attackConfig;

        if (bossState.burstShotsRemaining > 0) {
            bossState.burstTimer -= deltaMs;
            if (bossState.burstTimer <= 0) {
                fireBossProjectiles(obstacle, attackConfig);
                bossState.burstShotsRemaining -= 1;
                bossState.burstTimer = attackConfig.burstInterval ?? 160;
                if (bossState.burstShotsRemaining <= 0) {
                    bossState.attackTimer = attackConfig.cooldown ?? 2000;
                }
            }
            return;
        }

        bossState.attackTimer -= deltaMs;
        if (bossState.attackTimer > 0) {
            return;
        }

        if (attackConfig.type === 'barrage') {
            bossState.burstShotsRemaining = Math.max(1, attackConfig.burstCount ?? 3);
            bossState.burstTimer = 0;
            fireBossProjectiles(obstacle, attackConfig);
            bossState.burstShotsRemaining -= 1;
            bossState.burstTimer = attackConfig.burstInterval ?? 160;
            bossState.attackTimer = attackConfig.cooldown ?? 2000;
            return;
        }

        fireBossProjectiles(obstacle, attackConfig);
        bossState.attackTimer = attackConfig.cooldown ?? 2000;
    }

    function applyVillainBehavior(obstacle, deltaSeconds) {
        const behaviorState = obstacle.behaviorState;
        const villainBehavior = obstacle.villainType?.behavior;
        if (!behaviorState || !villainBehavior) {
            return;
        }

        switch (villainBehavior.type) {
            case 'sine': {
                behaviorState.phase += deltaSeconds * (behaviorState.speed ?? villainBehavior.speed ?? 3);
                const amplitude = behaviorState.amplitude ?? villainBehavior.amplitude ?? 40;
                const targetY = behaviorState.baseY + Math.sin(behaviorState.phase) * amplitude;
                obstacle.y = clamp(targetY, 0, viewport.height - obstacle.height);
                break;
            }
            case 'hover': {
                const speed = behaviorState.speed ?? villainBehavior.verticalSpeed ?? 60;
                const minY =
                    behaviorState.minY ?? clamp(obstacle.y - (villainBehavior.amplitude ?? 0), 16, viewport.height - obstacle.height - 16);
                const maxY =
                    behaviorState.maxY ?? clamp(obstacle.y + (villainBehavior.amplitude ?? 0), 16, viewport.height - obstacle.height - 16);
                if (behaviorState.minY === undefined) {
                    behaviorState.minY = minY;
                }
                if (behaviorState.maxY === undefined) {
                    behaviorState.maxY = maxY;
                }
                const direction = behaviorState.direction ?? 1;
                obstacle.y += speed * direction * deltaSeconds;
                if (obstacle.y <= behaviorState.minY) {
                    obstacle.y = behaviorState.minY;
                    behaviorState.direction = 1;
                } else if (obstacle.y >= behaviorState.maxY) {
                    obstacle.y = behaviorState.maxY;
                    behaviorState.direction = -1;
                } else {
                    behaviorState.direction = direction;
                }
                break;
            }
            case 'sweep': {
                behaviorState.phase = (behaviorState.phase ?? 0) +
                    deltaSeconds * (behaviorState.speed ?? villainBehavior.speed ?? 1.6);
                const amplitude = behaviorState.amplitude ?? villainBehavior.amplitude ?? 140;
                const halfHeight = obstacle.height * 0.5;
                const minCenter = 16 + halfHeight;
                const maxCenter = viewport.height - halfHeight - 16;
                const baseCenter = clamp(behaviorState.centerY ?? obstacle.y + halfHeight, minCenter, maxCenter);
                const playerCenterY = clamp(getPlayerCenter().y, minCenter, maxCenter);
                const followRate = Math.min(3.5, behaviorState.followSpeed ?? villainBehavior.followSpeed ?? 1.2);
                const updatedCenter = baseCenter + (playerCenterY - baseCenter) * Math.min(1, deltaSeconds * followRate);
                behaviorState.centerY = clamp(updatedCenter, minCenter, maxCenter);
                const offset = Math.sin(behaviorState.phase) * amplitude;
                const targetY = behaviorState.centerY + offset - halfHeight;
                obstacle.y = clamp(targetY, 16, viewport.height - obstacle.height - 16);
                break;
            }
            case 'drift': {
                obstacle.y += behaviorState.vy * deltaSeconds;
                if (obstacle.y < 24) {
                    obstacle.y = 24;
                    behaviorState.vy = Math.abs(behaviorState.vy);
                } else if (obstacle.y + obstacle.height > viewport.height - 24) {
                    obstacle.y = viewport.height - 24 - obstacle.height;
                    behaviorState.vy = -Math.abs(behaviorState.vy);
                }
                break;
            }
            case 'tracker': {
                const { y: trackerY } = getPlayerCenter();
                const targetY = trackerY - obstacle.height * 0.5;
                const direction = targetY - obstacle.y;
                const accel = Math.sign(direction) * (behaviorState.acceleration ?? villainBehavior.acceleration ?? 120);
                behaviorState.vy += accel * deltaSeconds;
                const maxSpeed = behaviorState.maxSpeed ?? villainBehavior.maxSpeed ?? 180;
                behaviorState.vy = clamp(behaviorState.vy, -maxSpeed, maxSpeed);
                obstacle.y += behaviorState.vy * deltaSeconds;
                obstacle.y = clamp(obstacle.y, 16, viewport.height - obstacle.height - 16);
                break;
            }
            default:
                break;
        }
    }

    function updateObstacles(delta) {
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obstacle = obstacles[i];
            const isBoss = isBossObstacle(obstacle);
            obstacle.x -= obstacle.speed * deltaSeconds;
            obstacle.rotation += obstacle.rotationSpeed * deltaSeconds;
            if (obstacle.hitFlash > 0) {
                obstacle.hitFlash = Math.max(0, obstacle.hitFlash - scaledDelta);
            }

            if (obstacle.shieldCooldown > 0) {
                obstacle.shieldCooldown = Math.max(0, obstacle.shieldCooldown - scaledDelta);
            }

            if (obstacle.bounceTimer > 0) {
                obstacle.bounceTimer = Math.max(0, obstacle.bounceTimer - scaledDelta);
                const damping = Math.exp(-(config.defensePower?.bounceDrag ?? 3.4) * deltaSeconds);
                obstacle.x += obstacle.vx * deltaSeconds;
                obstacle.y += obstacle.vy * deltaSeconds;
                obstacle.vx *= damping;
                obstacle.vy *= damping;
                if (obstacle.bounceTimer === 0) {
                    obstacle.speed = Math.abs(obstacle.speed);
                    obstacle.vx = 0;
                    obstacle.vy = 0;
                }
            }

            applyVillainBehavior(obstacle, deltaSeconds);

            if (isBoss) {
                handleBossAttack(obstacle, scaledDelta);
            }

            if (obstacle.x + obstacle.width < 0) {
                obstacles.splice(i, 1);
                if (isBoss) {
                    return triggerGameOver('The boss overwhelmed your defenses!');
                }
                handleVillainEscape(obstacle);
                continue;
            }

            obstacle.y = clamp(obstacle.y, 16, viewport.height - obstacle.height - 16);

            if (isPumpTailDamaging() && pumpTailIntersectsRect(obstacle)) {
                obstacles.splice(i, 1);
                awardDestroy(obstacle);
                createVillainExplosion(obstacle);
                continue;
            }

            const activePlayers = getActivePlayerEntities();
            let collidedEntity = null;
            for (const entity of activePlayers) {
                if (rectOverlap(entity, obstacle)) {
                    collidedEntity = entity;
                    break;
                }
            }
            if (collidedEntity) {
                if (isBoss) {
                    return triggerGameOver('The boss crushed your ship!');
                }
                if (isShieldActive() && obstacle.shieldCooldown <= 0) {
                    repelObstacleFromPlayer(obstacle, collidedEntity);
                    continue;
                }
                return triggerGameOver('Your rainbow ship took a direct hit!');
            }

            if (!isPumpTailDamaging()) {
                const evaluateTailCollision = (points, sourceEntity) => {
                    if (!points?.length) {
                        return 'none';
                    }
                    for (let j = points.length - 1; j >= 0; j--) {
                        const t = points[j];
                        if (circleRectOverlap({ x: t.x, y: t.y, radius: 10 }, obstacle)) {
                            if (isShieldActive() && !isBoss) {
                                if (obstacle.shieldCooldown <= 0) {
                                    repelObstacleFromPlayer(obstacle, sourceEntity ?? player);
                                }
                                return 'shielded';
                            }
                            return 'hit';
                        }
                    }
                    return 'none';
                };

                const tailResult = evaluateTailCollision(trail, player);
                if (tailResult === 'shielded') {
                    continue;
                }
                if (tailResult === 'hit') {
                    return triggerGameOver(
                        isBoss
                            ? 'The boss shattered your tail formation!'
                            : 'Your tail tangled with space junk!'
                    );
                }

                if (isDoubleTeamActive()) {
                    const cloneTailResult = evaluateTailCollision(doubleTeamState.trail, doubleTeamState.clone);
                    if (cloneTailResult === 'shielded') {
                        continue;
                    }
                    if (cloneTailResult === 'hit') {
                        return triggerGameOver(
                            isBoss
                                ? 'The boss shattered your tail formation!'
                                : 'Your tail tangled with space junk!'
                        );
                    }
                }
            }
        }
    }

    function updateCollectibles(delta) {
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        const magnetActive = isPowerUpActive(MAGNET_POWER);
        const magnetConfig = config.magnetPower ?? {};
        const magnetRadius = magnetActive ? Math.max(0, magnetConfig.pullRadius ?? 0) : 0;
        const magnetStrength = magnetConfig.pullStrength ?? 0;
        const magnetMaxSpeed = magnetConfig.maxSpeed ?? 0;
        const playerCenter = magnetActive ? getPlayerCenter() : null;
        for (let i = collectibles.length - 1; i >= 0; i--) {
            const collectible = collectibles[i];
            collectible.x -= collectible.speed * deltaSeconds;
            collectible.wobbleTime += deltaSeconds * 4;
            collectible.y += Math.sin(collectible.wobbleTime) * 18 * deltaSeconds;
            if (magnetActive && magnetRadius > 0 && playerCenter) {
                const centerX = collectible.x + collectible.width * 0.5;
                const centerY = collectible.y + collectible.height * 0.5;
                const dx = playerCenter.x - centerX;
                const dy = playerCenter.y - centerY;
                const distance = Math.hypot(dx, dy);
                if (distance > 0 && distance < magnetRadius) {
                    const strength = 1 - distance / magnetRadius;
                    const pull = magnetStrength * strength * deltaSeconds;
                    const maxStep = magnetMaxSpeed > 0 ? magnetMaxSpeed * deltaSeconds : pull;
                    const step = Math.min(pull, maxStep);
                    const normalX = dx / distance;
                    const normalY = dy / distance;
                    collectible.x += normalX * step;
                    collectible.y += normalY * step;
                }
            }
            const verticalPadding = config.collectible.verticalPadding ?? 48;
            collectible.y = clamp(collectible.y, verticalPadding, viewport.height - collectible.height - verticalPadding);

            if (collectible.x + collectible.width < 0) {
                collectibles.splice(i, 1);
                resetStreak();
                continue;
            }

            const activePlayers = getActivePlayerEntities();
            let collected = false;
            for (const entity of activePlayers) {
                if (rectOverlap(entity, collectible)) {
                    collected = true;
                    break;
                }
            }
            if (collected) {
                collectibles.splice(i, 1);
                awardCollect(collectible);
                createParticles({
                    x: collectible.x + collectible.width * 0.5,
                    y: collectible.y + collectible.height * 0.5,
                    color: collectible.particleColor ?? { r: 255, g: 215, b: 0 }
                });
            }
        }
    }

    function triggerPowerBombPulse() {
        const { x: centerX, y: centerY } = getPlayerCenter();
        const burst = {
            x: centerX,
            y: centerY,
            radius: 0,
            maxRadius: 360,
            speed: 760,
            life: 650,
            hitSet: new WeakSet()
        };
        areaBursts.push(burst);
        audioManager.playExplosion('powerbomb');
        createParticles({
            x: centerX,
            y: centerY,
            color: { r: 255, g: 196, b: 128 }
        });
    }

    function activatePowerUp(type) {
        const duration = config.powerUp.duration[type];
        if (duration) {
            state.powerUpTimers[type] = duration;
        }
        if (type === 'powerBomb') {
            triggerPowerBombPulse();
            state.powerBombPulseTimer = 900;
        } else if (type === SHIELD_POWER) {
            state.shieldHitPulse = Math.max(state.shieldHitPulse, 0.6);
            const { x, y } = getPlayerCenter();
            triggerShieldImpact(x, y);
        } else if (type === HYPER_BEAM_POWER) {
            hyperBeamState.sparkTimer = 0;
            hyperBeamState.intensity = Math.max(hyperBeamState.intensity, 0.25);
            audioManager.playHyperBeam();
        } else if (type === PUMP_POWER) {
            ensurePumpTailInitialized();
        } else if (type === FLAME_WHIP_POWER) {
            triggerScreenShake(3, 160);
            const { x, y } = getPlayerCenter();
            const color = powerUpColors[FLAME_WHIP_POWER] ?? { r: 214, g: 64, b: 56 };
            createParticles({
                x,
                y,
                color,
                count: 24,
                speedRange: [160, 420],
                sizeRange: [1.1, 3.2],
                lifeRange: [320, 520]
            });
        } else if (type === TIME_DILATION_POWER) {
            triggerScreenShake(4, 220);
            const { x, y } = getPlayerCenter();
            const color = powerUpColors[TIME_DILATION_POWER] ?? { r: 120, g: 233, b: 255 };
            createParticles({
                x,
                y,
                color,
                count: 22,
                speedRange: [180, 420],
                sizeRange: [1.2, 3.4],
                lifeRange: [320, 620]
            });
        } else if (type === SCORE_SURGE_POWER) {
            const { x, y } = getPlayerCenter();
            spawnFloatingText({
                text: 'Score Surge!',
                x,
                y,
                color: '#fde68a',
                life: 900,
                variant: 'score',
                multiplier: getScoreSurgeMultiplier()
            });
        } else if (type === DOUBLE_TEAM_POWER) {
            startDoubleTeam();
        } else if (type === MAGNET_POWER) {
            const { x, y } = getPlayerCenter();
            const color = powerUpColors[MAGNET_POWER] ?? { r: 156, g: 220, b: 255 };
            createParticles({
                x,
                y,
                color,
                count: 18,
                speedRange: [140, 360],
                sizeRange: [1.4, 3.6],
                lifeRange: [360, 680]
            });
        }
    }

    function updatePowerUps(delta) {
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        for (let i = powerUps.length - 1; i >= 0; i--) {
            const powerUp = powerUps[i];
            powerUp.x -= powerUp.speed * deltaSeconds;
            powerUp.wobbleTime += deltaSeconds * config.powerUp.wobbleSpeed;
            powerUp.y += Math.sin(powerUp.wobbleTime) * config.powerUp.wobbleAmplitude * deltaSeconds;
            powerUp.y = clamp(powerUp.y, 32, viewport.height - 32 - powerUp.height);

            if (powerUp.x + powerUp.width < 0) {
                powerUps.splice(i, 1);
                continue;
            }

            const activePlayers = getActivePlayerEntities();
            let collected = false;
            for (const entity of activePlayers) {
                if (rectOverlap(entity, powerUp)) {
                    collected = true;
                    break;
                }
            }
            if (collected) {
                powerUps.splice(i, 1);
                activatePowerUp(powerUp.type);
                const activeChallengeManager = getChallengeManager();
                if (activeChallengeManager) {
                    activeChallengeManager.recordEvent('powerUp', { type: powerUp.type });
                }
                storyManager.recordEvent('powerUp', { type: powerUp.type });
                const color = powerUpColors[powerUp.type] ?? { r: 200, g: 200, b: 255 };
                createParticles({
                    x: powerUp.x + powerUp.width * 0.5,
                    y: powerUp.y + powerUp.height * 0.5,
                    color
                });
            }
        }
    }

    function updatePowerUpTimers(delta) {
        for (const type of powerUpTypes) {
            if (state.powerUpTimers[type] > 0) {
                state.powerUpTimers[type] = Math.max(0, state.powerUpTimers[type] - delta);
                if (type === 'powerBomb' && state.powerUpTimers[type] === 0) {
                    state.powerBombPulseTimer = 0;
                }
                if (type === SHIELD_POWER && state.powerUpTimers[type] === 0) {
                    state.shieldHitPulse = 0;
                }
                if (type === HYPER_BEAM_POWER && state.powerUpTimers[type] === 0) {
                    hyperBeamState.sparkTimer = 0;
                    audioManager.stopHyperBeam();
                }
                if (type === PUMP_POWER && state.powerUpTimers[type] === 0) {
                    stopPumpTailEffect();
                }
                if (type === DOUBLE_TEAM_POWER && state.powerUpTimers[type] === 0) {
                    endDoubleTeam();
                }
            }
        }
    }

    function updatePowerBomb(delta) {
        if (!isPowerUpActive('powerBomb')) return;
        state.powerBombPulseTimer -= delta;
        if (state.powerBombPulseTimer <= 0) {
            triggerPowerBombPulse();
            state.powerBombPulseTimer = 900;
        }
    }

    function computeHyperBeamBounds(hyperConfig) {
        const startX = player.x + player.width * 0.55;
        const width = Math.max(0, viewport.width - startX + (hyperConfig.extraLength ?? 40));
        if (width <= 0) {
            return null;
        }
        const { y: centerY } = getPlayerCenter();
        const height = Math.min(hyperConfig.beamHeight ?? 180, viewport.height);
        let top = centerY - height / 2;
        if (top < 0) {
            top = 0;
        } else if (top + height > viewport.height) {
            top = Math.max(0, viewport.height - height);
        }
        return { x: startX, y: top, width, height };
    }

    function applyHyperBeamDamage(bounds, delta, hyperConfig) {
        if (!bounds) return;
        const intensity = hyperBeamState.intensity;
        if (intensity <= 0) return;

        const deltaSeconds = delta / 1000;
        const sparkColor = powerUpColors[HYPER_BEAM_POWER] ?? { r: 147, g: 197, b: 253 };
        const hitSparkRate = hyperConfig.hitSparkRate ?? 7;
        const damage = (hyperConfig.damagePerSecond ?? 20) * deltaSeconds * intensity;
        const asteroidDamage = (hyperConfig.asteroidDamagePerSecond ?? damage) * deltaSeconds * intensity;

        for (let i = obstacles.length - 1; i >= 0; i--) {
            const obstacle = obstacles[i];
            if (!rectOverlap(bounds, obstacle)) continue;

            obstacle.health -= damage;
            obstacle.hitFlash = Math.max(obstacle.hitFlash ?? 0, 180 * intensity);

            if (obstacle.health <= 0) {
                obstacles.splice(i, 1);
                awardDestroy(obstacle);
                createVillainExplosion(obstacle);
                continue;
            }

            if (Math.random() < deltaSeconds * hitSparkRate * intensity) {
                createHitSpark({
                    x: obstacle.x + obstacle.width * randomBetween(0.4, 0.9),
                    y: obstacle.y + obstacle.height * randomBetween(0.2, 0.8),
                    color: sparkColor
                });
            }
        }

        for (let i = asteroids.length - 1; i >= 0; i--) {
            const asteroid = asteroids[i];
            const radius = asteroid.radius * (config.asteroid?.collisionRadiusMultiplier ?? 1);
            if (!circleRectOverlap({ x: asteroid.x, y: asteroid.y, radius }, bounds)) continue;
            damageAsteroid(asteroid, asteroidDamage, i);
        }
    }

    function spawnHyperBeamParticles(bounds, delta, hyperConfig) {
        if (!bounds) return;
        const intensity = hyperBeamState.intensity;
        if (intensity <= 0) return;

        hyperBeamState.sparkTimer -= delta;
        if (hyperBeamState.sparkTimer > 0) {
            return;
        }

        const baseInterval = hyperConfig.sparkInterval ?? 140;
        const intervalScale = reducedEffectsMode ? 1.4 : 1;
        const scaledInterval = (baseInterval / Math.max(0.45, intensity)) * intervalScale;
        hyperBeamState.sparkTimer = randomBetween(scaledInterval * 0.6, scaledInterval * 1.4);

        const color = powerUpColors[HYPER_BEAM_POWER] ?? { r: 147, g: 197, b: 253 };
        const particleScale = reducedEffectsMode ? 0.6 : 1;
        const count = Math.max(1, Math.round((1 + intensity * 2) * particleScale));
        const velocityScale = reducedEffectsMode ? 0.7 : 1;
        const lifeScale = reducedEffectsMode ? 0.75 : 1;
        const sizeScale = reducedEffectsMode ? 0.85 : 1;
        for (let i = 0; i < count; i++) {
            const spawnX = randomBetween(bounds.x + bounds.width * 0.2, bounds.x + bounds.width * 0.9);
            const spawnY = randomBetween(bounds.y, bounds.y + bounds.height);
            particles.push({
                x: spawnX,
                y: spawnY,
                vx: randomBetween(120, 240) * velocityScale,
                vy: randomBetween(-140, 140) * velocityScale,
                life: randomBetween(240, 420) * lifeScale,
                color,
                colorStyle: getParticleColorStyle(color),
                size: randomBetween(1.2, 2.6) * sizeScale
            });
        }
    }

    function updateHyperBeam(delta) {
        const hyperConfig = config.hyperBeam ?? {};
        const isActive = isPowerUpActive(HYPER_BEAM_POWER);
        const rampUp = Math.max(1, hyperConfig.rampUp ?? 240);
        const fadeOut = Math.max(1, hyperConfig.fadeOut ?? 240);

        if (isActive) {
            hyperBeamState.intensity = Math.min(1, hyperBeamState.intensity + (delta / rampUp));
        } else {
            hyperBeamState.intensity = Math.max(0, hyperBeamState.intensity - (delta / fadeOut));
        }

        if (hyperBeamState.intensity <= 0) {
            hyperBeamState.sparkTimer = 0;
            hyperBeamState.bounds = null;
            hyperBeamState.wave = 0;
            audioManager.stopHyperBeam();
            return;
        }

        const bounds = computeHyperBeamBounds(hyperConfig);
        hyperBeamState.bounds = bounds;
        hyperBeamState.wave = (hyperBeamState.wave + delta * (hyperConfig.waveSpeed ?? 0.006)) % (Math.PI * 2);

        if (!bounds) {
            return;
        }

        if (state.gameState === 'running' && isActive) {
            applyHyperBeamDamage(bounds, delta, hyperConfig);
            spawnHyperBeamParticles(bounds, delta, hyperConfig);
        }
    }

    function updateShieldEffects(delta) {
        if (state.shieldHitPulse > 0) {
            state.shieldHitPulse = Math.max(0, state.shieldHitPulse - delta / 900);
        }
    }

    function updateAreaBursts(delta) {
        const deltaSeconds = delta / 1000;
        for (let i = areaBursts.length - 1; i >= 0; i--) {
            const burst = areaBursts[i];
            burst.radius = Math.min(burst.maxRadius, burst.radius + burst.speed * deltaSeconds);
            burst.life -= delta;

            for (let j = obstacles.length - 1; j >= 0; j--) {
                const obstacle = obstacles[j];
                if (burst.hitSet.has(obstacle)) continue;
                const centerX = obstacle.x + obstacle.width * 0.5;
                const centerY = obstacle.y + obstacle.height * 0.5;
                const distance = Math.hypot(centerX - burst.x, centerY - burst.y);
                const hitRadius = burst.radius + obstacle.width * 0.5;
                if (distance <= hitRadius) {
                    burst.hitSet.add(obstacle);
                    obstacles.splice(j, 1);
                    awardDestroy(obstacle);
                    createVillainExplosion(obstacle);
                }
            }

            for (let j = asteroids.length - 1; j >= 0; j--) {
                const asteroid = asteroids[j];
                if (burst.hitSet.has(asteroid)) continue;
                const distance = Math.hypot(asteroid.x - burst.x, asteroid.y - burst.y);
                const hitRadius = burst.radius + asteroid.radius;
                if (distance <= hitRadius) {
                    burst.hitSet.add(asteroid);
                    destroyAsteroid(j);
                }
            }

            if (burst.life <= 0) {
                areaBursts.splice(i, 1);
            }
        }
    }

    function updateVillainExplosions(delta) {
        const deltaSeconds = delta / 1000;
        for (let i = villainExplosions.length - 1; i >= 0; i--) {
            const explosion = villainExplosions[i];

            if (typeof explosion.expansionSpeed === 'number' && typeof explosion.maxRadius === 'number') {
                explosion.radius = Math.min(
                    explosion.maxRadius,
                    explosion.radius + explosion.expansionSpeed * deltaSeconds
                );
            }

            if (typeof explosion.ringRadius === 'number' && typeof explosion.ringGrowth === 'number') {
                const maxRing = explosion.maxRingRadius ?? Number.POSITIVE_INFINITY;
                explosion.ringRadius = Math.min(maxRing, explosion.ringRadius + explosion.ringGrowth * deltaSeconds);
            }

            switch (explosion.type) {
                case 'nova': {
                    explosion.pulse = (explosion.pulse ?? 0) + deltaSeconds * 5;
                    if (explosion.spokes) {
                        for (const spoke of explosion.spokes) {
                            spoke.length = Math.min(spoke.maxLength, spoke.length + spoke.growth * deltaSeconds);
                        }
                    }
                    break;
                }
                case 'ionBurst': {
                    if (explosion.orbits) {
                        for (const orbit of explosion.orbits) {
                            if (orbit.radius < orbit.targetRadius) {
                                orbit.radius = Math.min(
                                    orbit.targetRadius,
                                    orbit.radius + orbit.growth * deltaSeconds
                                );
                            }
                            orbit.angle += orbit.rotationSpeed * deltaSeconds;
                            if (orbit.targetEccentricity !== undefined) {
                                orbit.eccentricity +=
                                    (orbit.targetEccentricity - orbit.eccentricity) * deltaSeconds * 0.8;
                            }
                        }
                    }
                    if (explosion.sparks) {
                        for (const spark of explosion.sparks) {
                            spark.distance += spark.speed * deltaSeconds;
                            spark.angle += spark.drift * deltaSeconds;
                        }
                    }
                    if (explosion.swirl) {
                        explosion.swirl.angle += explosion.swirl.speed * deltaSeconds;
                    }
                    break;
                }
                case 'gravityRift': {
                    if (explosion.core) {
                        explosion.core.radius = Math.max(
                            explosion.core.minRadius,
                            explosion.core.radius - explosion.core.collapseSpeed * deltaSeconds
                        );
                    }
                    if (explosion.shockwaves) {
                        for (const shock of explosion.shockwaves) {
                            if (shock.delay > 0) {
                                shock.delay = Math.max(0, shock.delay - delta);
                                continue;
                            }
                            shock.radius = Math.min(shock.maxRadius, shock.radius + shock.speed * deltaSeconds);
                        }
                    }
                    if (explosion.fractures) {
                        for (const fracture of explosion.fractures) {
                            fracture.length = Math.min(
                                fracture.maxLength,
                                fracture.length + fracture.growth * deltaSeconds
                            );
                        }
                    }
                    if (explosion.embers) {
                        for (const ember of explosion.embers) {
                            ember.radius += ember.growth * deltaSeconds;
                            ember.angle += ember.rotationSpeed * deltaSeconds;
                            ember.opacity = Math.max(0, ember.opacity - delta / explosion.maxLife);
                        }
                    }
                    break;
                }
                default:
                    break;
            }

            explosion.life -= delta;
            if (explosion.life <= 0) {
                villainExplosions.splice(i, 1);
            }
        }
    }

    function updateStars(delta) {
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        for (let i = stars.length - 1; i >= 0; i--) {
            const star = stars[i];
            star.x -= star.speed * deltaSeconds * (0.4 + state.gameSpeed / 600);
            if (star.x < -star.size) {
                star.x = viewport.width + star.size;
                star.y = Math.random() * viewport.height;
                star.speed = (Math.random() * 0.8 + 0.4) * config.star.baseSpeed;
            }
        }
    }

    function updateParticles(delta) {
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];
            particle.life -= scaledDelta;
            if (particle.life <= 0) {
                particles.splice(i, 1);
                continue;
            }
            particle.x += particle.vx * deltaSeconds;
            particle.y += particle.vy * deltaSeconds;
            particle.vx *= 0.96;
            particle.vy *= 0.96;
        }
    }

    function updateSpawns(delta) {
        const spawnDelta = getScaledSpawnDelta(delta);
        spawnTimers.obstacle += spawnDelta;
        spawnTimers.collectible += spawnDelta;
        spawnTimers.powerUp += spawnDelta;

        if (state.bossBattle.active) {
            if (!state.bossBattle.bossSpawned) {
                spawnBoss();
            }
            return;
        }

        const obstacleInterval = config.obstacleSpawnInterval / (1 + state.gameSpeed * 0.005 * getSpawnIntensity('obstacle'));
        const collectibleInterval = config.collectibleSpawnInterval / (1 + state.gameSpeed * 0.004 * getSpawnIntensity('collectible'));
        if (spawnTimers.obstacle >= obstacleInterval) {
            spawnTimers.obstacle = 0;
            spawnObstacle();
        }

        if (spawnTimers.collectible >= collectibleInterval) {
            spawnTimers.collectible = 0;
            spawnCollectible();
        }

        if (spawnTimers.powerUp >= nextPowerUpSpawnInterval) {
            spawnTimers.powerUp = 0;
            const spawned = spawnPowerUp();
            const plannedInterval = powerUpSpawnDirector.planNextInterval(config?.powerUpSpawnInterval);
            if (Number.isFinite(plannedInterval) && plannedInterval > 0) {
                nextPowerUpSpawnInterval = plannedInterval;
            }
            if (!spawned) {
                const fallback = Number.isFinite(config?.powerUpSpawnInterval)
                    ? Math.max(7000, config.powerUpSpawnInterval)
                    : nextPowerUpSpawnInterval;
                nextPowerUpSpawnInterval = fallback;
            }
        }
    }

    function getProjectileDamage(projectile) {
        if (!projectile) {
            return 1;
        }
        if (Number.isFinite(projectile.damage)) {
            return Math.max(1, projectile.damage);
        }
        switch (projectile.type) {
            case 'missile':
                return 2;
            default:
                return 1;
        }
    }

    function updateProjectilesCollisions() {
        for (let i = projectiles.length - 1; i >= 0; i--) {
            const projectile = projectiles[i];
            let projectileRemoved = false;
            for (let j = obstacles.length - 1; j >= 0; j--) {
                const obstacle = obstacles[j];
                if (!rectOverlap(projectile, obstacle)) continue;

                const damage = getProjectileDamage(projectile);
                obstacle.health -= damage;
                obstacle.hitFlash = 160;

                projectiles.splice(i, 1);
                projectileRemoved = true;

                if (obstacle.health <= 0) {
                    obstacles.splice(j, 1);
                    awardDestroy(obstacle);
                    createVillainExplosion(obstacle);
                } else {
                    createHitSpark({
                        x: obstacle.x + obstacle.width * 0.5,
                        y: obstacle.y + obstacle.height * 0.5,
                        color: { r: 159, g: 168, b: 218 }
                    });
                }
                break;
            }

            if (projectileRemoved) {
                continue;
            }

            for (let j = asteroids.length - 1; j >= 0; j--) {
                const asteroid = asteroids[j];
                const radius = asteroid.radius * (config.asteroid?.collisionRadiusMultiplier ?? 1);
                if (!circleRectOverlap({ x: asteroid.x, y: asteroid.y, radius }, projectile)) continue;

                const damage = getProjectileDamage(projectile);
                projectiles.splice(i, 1);
                damageAsteroid(asteroid, damage, j);
                projectileRemoved = true;
                break;
            }
        }
    }

    function updateEnemyProjectiles(delta) {
        if (!enemyProjectiles.length) {
            return;
        }
        const scaledDelta = getScaledDelta(delta);
        const deltaSeconds = scaledDelta / 1000;
        const playerHitbox = player
            ? { x: player.x, y: player.y, width: player.width, height: player.height }
            : null;

        for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
            const projectile = enemyProjectiles[i];
            projectile.x += projectile.vx * deltaSeconds;
            projectile.y += projectile.vy * deltaSeconds;
            projectile.life = (projectile.life ?? 0) - scaledDelta;

            if (
                projectile.life <= 0 ||
                projectile.x + projectile.width < -120 ||
                projectile.x > viewport.width + 120 ||
                projectile.y + projectile.height < -120 ||
                projectile.y > viewport.height + 120
            ) {
                enemyProjectiles.splice(i, 1);
                continue;
            }

            if (!playerHitbox) {
                continue;
            }

            if (rectOverlap(playerHitbox, projectile)) {
                const magnitude = Math.max(Math.hypot(projectile.vx, projectile.vy), 1);
                if (isShieldActive()) {
                    triggerShieldImpact(
                        projectile.x + projectile.width * 0.5,
                        projectile.y + projectile.height * 0.5,
                        projectile.vx / magnitude,
                        projectile.vy / magnitude
                    );
                    enemyProjectiles.splice(i, 1);
                    continue;
                }
                const message = projectile.onHitMessage ?? 'A boss laser pierced your ship!';
                enemyProjectiles.splice(i, 1);
                triggerGameOver(message);
                return;
            }
        }
    }

    function rectOverlap(a, b) {
        return a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y;
    }

    function circleRectOverlap(circle, rect) {
        const closestX = clamp(circle.x, rect.x, rect.x + rect.width);
        const closestY = clamp(circle.y, rect.y, rect.y + rect.height);
        const distanceX = circle.x - closestX;
        const distanceY = circle.y - closestY;
        return (distanceX * distanceX + distanceY * distanceY) < (circle.radius * circle.radius);
    }

    function createHitSpark({ x, y, color }) {
        const sparkCount = reducedEffectsMode ? 4 : 8;
        const speedScale = reducedEffectsMode ? 0.7 : 1;
        const lifeScale = reducedEffectsMode ? 0.75 : 1;
        const sizeScale = reducedEffectsMode ? 0.85 : 1;
        for (let i = 0; i < sparkCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (Math.random() * 180 + 80) * speedScale;
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: (300 + Math.random() * 200) * lifeScale,
                color,
                colorStyle: getParticleColorStyle(color),
                size: (Math.random() * 2 + 0.8) * sizeScale
            });
        }
    }

    function createParticles({ x, y, color, count = 18, speedRange = [60, 340], sizeRange = [1.4, 4.4], lifeRange = [500, 900] }) {
        const intensity = reducedEffectsMode ? 0.6 : 1;
        const spawnCount = Math.max(1, Math.round(count * intensity));
        const speedScale = reducedEffectsMode ? 0.75 : 1;
        const lifeScale = reducedEffectsMode ? 0.75 : 1;
        const sizeScale = reducedEffectsMode ? 0.85 : 1;
        for (let i = 0; i < spawnCount; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = randomBetween(speedRange[0], speedRange[1]) * speedScale;
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: randomBetween(lifeRange[0], lifeRange[1]) * lifeScale,
                color,
                colorStyle: getParticleColorStyle(color),
                size: randomBetween(sizeRange[0], sizeRange[1]) * sizeScale
            });
        }
    }

    function spawnFloatingText({
        text,
        x,
        y,
        color = '#facc15',
        life = 1200,
        variant = 'score',
        multiplier = 1
    }) {
        if (!text) return;
        const scale = 1 + Math.max(0, multiplier - 1) * 0.4;
        floatingTexts.push({
            text,
            x,
            y,
            color,
            life,
            maxLife: life,
            vx: (Math.random() * 24 - 12) * 0.4,
            vy: -60 - Math.random() * 30,
            gravity: 38,
            scale,
            variant
        });
    }

    function updateFloatingTexts(delta) {
        const deltaSeconds = delta / 1000;
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
            const entry = floatingTexts[i];
            entry.life -= delta;
            if (entry.life <= 0) {
                floatingTexts.splice(i, 1);
                continue;
            }
            entry.x += entry.vx * deltaSeconds;
            entry.y += entry.vy * deltaSeconds;
            entry.vy += entry.gravity * deltaSeconds;
        }
    }

    function drawFloatingTexts() {
        if (!floatingTexts.length) return;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const entry of floatingTexts) {
            const alpha = clamp(entry.life / entry.maxLife, 0, 1);
            const fontSize = 14 + entry.scale * 4;
            ctx.globalAlpha = alpha;
            ctx.font = `700 ${fontSize}px ${primaryFontStack}`;
            ctx.fillStyle = entry.color;
            let shadowColor = 'rgba(244, 114, 182, 0.65)';
            if (entry.variant === 'collect') {
                shadowColor = 'rgba(56, 189, 248, 0.75)';
            } else if (entry.variant === 'penalty') {
                shadowColor = 'rgba(248, 113, 113, 0.75)';
            } else if (entry.variant === 'dodge') {
                shadowColor = 'rgba(250, 204, 21, 0.65)';
            }
            ctx.shadowColor = shadowColor;
            ctx.shadowBlur = 18 * alpha;
            ctx.fillText(entry.text, entry.x, entry.y);
        }
        ctx.restore();
    }

    function drawBossAlert(time) {
        const remaining = state.bossBattle.alertTimer;
        if (!canvas || remaining <= 0) {
            return;
        }
        const elapsed = BOSS_ALERT_DURATION - remaining;
        const flashPeriod = 200;
        const flashOn = Math.floor(elapsed / flashPeriod) % 2 === 0;
        if (!flashOn) {
            return;
        }
        const alpha = clamp(remaining / BOSS_ALERT_DURATION, 0, 1);
        const centerX = viewport.width / 2;
        const centerY = viewport.height / 2;
        const fontSize = 64 + Math.sin(time * 0.008) * 4;
        const bossName = state.bossBattle.currentConfig?.villain?.name ?? null;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = alpha;
        ctx.font = `900 ${fontSize}px ${primaryFontStack}`;
        const gradient = ctx.createLinearGradient(centerX - 220, centerY, centerX + 220, centerY);
        gradient.addColorStop(0, '#facc15');
        gradient.addColorStop(0.5, '#f472b6');
        gradient.addColorStop(1, '#38bdf8');
        ctx.lineJoin = 'round';
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeText('BOSS FIGHT!', centerX, centerY);
        ctx.shadowColor = 'rgba(248, 250, 252, 0.85)';
        ctx.shadowBlur = 22;
        ctx.fillStyle = gradient;
        ctx.fillText('BOSS FIGHT!', centerX, centerY);
        if (bossName) {
            const labelFont = Math.max(32, fontSize * 0.42);
            ctx.font = `700 ${labelFont}px ${primaryFontStack}`;
            ctx.shadowBlur = 16;
            ctx.fillText(bossName.toUpperCase(), centerX, centerY + fontSize * 0.7);
        }
        ctx.restore();
    }

    function triggerScreenShake(strength = 6, duration = 220) {
        const strengthScale = reducedEffectsMode ? 0.65 : 1;
        const durationScale = reducedEffectsMode ? 0.75 : 1;
        const effectiveStrength = strength * strengthScale;
        const effectiveDuration = duration * durationScale;
        cameraShake.intensity = Math.max(cameraShake.intensity, effectiveStrength);
        cameraShake.duration = Math.max(cameraShake.duration, effectiveDuration);
        cameraShake.elapsed = 0;
    }

    function updateCameraShake(delta) {
        if (cameraShake.duration <= 0) {
            cameraShake.offsetX = 0;
            cameraShake.offsetY = 0;
            return;
        }
        cameraShake.elapsed += delta;
        if (cameraShake.elapsed >= cameraShake.duration) {
            cameraShake.intensity = 0;
            cameraShake.duration = 0;
            cameraShake.offsetX = 0;
            cameraShake.offsetY = 0;
            return;
        }
        const progress = cameraShake.elapsed / cameraShake.duration;
        const falloff = Math.pow(1 - progress, 2);
        const magnitude = cameraShake.intensity * falloff;
        cameraShake.offsetX = (Math.random() * 2 - 1) * magnitude;
        cameraShake.offsetY = (Math.random() * 2 - 1) * magnitude;
    }

    function createVillainExplosion(obstacle) {
        const centerX = obstacle.x + obstacle.width * 0.5;
        const centerY = obstacle.y + obstacle.height * 0.5;
        const palette = villainExplosionPalettes[obstacle.villainType?.key] ?? villainExplosionPalettes.villain1;
        const sizeFactor = obstacle.width;
        const villainKey = obstacle.villainType?.key;
        let explosion;

        switch (villainKey) {
            case 'villain2': {
                const orbitCount = 3 + Math.floor(sizeFactor / 36);
                const orbits = Array.from({ length: orbitCount }, (_, index) => {
                    const depth = index / Math.max(1, orbitCount - 1);
                    const targetRadius = sizeFactor * (0.5 + depth * 0.65);
                    return {
                        radius: targetRadius * 0.45,
                        targetRadius,
                        growth: (260 + sizeFactor * 1.8) * (0.4 + depth * 0.8),
                        thickness: Math.max(3, sizeFactor * (0.035 + depth * 0.018)),
                        angle: Math.random() * Math.PI * 2,
                        rotationSpeed: randomBetween(-1.8, 1.8),
                        eccentricity: randomBetween(0.45, 0.7),
                        targetEccentricity: randomBetween(0.75, 1.05)
                    };
                });
                const sparks = Array.from({ length: 14 + Math.floor(sizeFactor / 12) }, () => ({
                    angle: Math.random() * Math.PI * 2,
                    distance: sizeFactor * randomBetween(0.28, 0.6),
                    speed: randomBetween(160, 260),
                    size: randomBetween(2, 5),
                    drift: randomBetween(-1.2, 1.2)
                }));
                explosion = {
                    type: 'ionBurst',
                    x: centerX,
                    y: centerY,
                    palette,
                    radius: sizeFactor * 0.34,
                    maxRadius: sizeFactor * 1.72,
                    expansionSpeed: 240 + sizeFactor * 1.6,
                    ringRadius: sizeFactor * 0.58,
                    maxRingRadius: sizeFactor * 2.8,
                    ringGrowth: 260 + sizeFactor * 1.8,
                    ringThickness: Math.max(4, sizeFactor * 0.08),
                    life: 640,
                    maxLife: 640,
                    orbits,
                    sparks,
                    swirl: { angle: Math.random() * Math.PI * 2, speed: randomBetween(1.1, 1.8) }
                };
                break;
            }
            case 'villain3': {
                const shockwaves = [
                    {
                        radius: sizeFactor * 0.62,
                        maxRadius: sizeFactor * 3.3,
                        speed: 520 + sizeFactor * 2.4,
                        lineWidth: Math.max(9, sizeFactor * 0.14),
                        opacity: 0.55,
                        delay: 0
                    },
                    {
                        radius: sizeFactor * 0.34,
                        maxRadius: sizeFactor * 2.6,
                        speed: 420 + sizeFactor * 2.0,
                        lineWidth: Math.max(6, sizeFactor * 0.1),
                        opacity: 0.38,
                        delay: 140
                    }
                ];
                const fractures = Array.from({ length: 10 + Math.floor(sizeFactor / 12) }, () => ({
                    angle: Math.random() * Math.PI * 2,
                    length: sizeFactor * randomBetween(0.35, 0.8),
                    maxLength: sizeFactor * randomBetween(1.1, 1.8),
                    growth: randomBetween(160, 320),
                    width: Math.max(1.2, sizeFactor * 0.015)
                }));
                const embers = Array.from({ length: 18 + Math.floor(sizeFactor / 10) }, () => ({
                    radius: sizeFactor * randomBetween(0.6, 1.6),
                    growth: randomBetween(40, 120),
                    angle: Math.random() * Math.PI * 2,
                    rotationSpeed: randomBetween(-0.8, 0.8),
                    size: randomBetween(2.2, 5),
                    opacity: 0.65
                }));
                explosion = {
                    type: 'gravityRift',
                    x: centerX,
                    y: centerY,
                    palette,
                    radius: sizeFactor * 0.46,
                    maxRadius: sizeFactor * 1.52,
                    expansionSpeed: 300 + sizeFactor * 1.4,
                    life: 720,
                    maxLife: 720,
                    shockwaves,
                    fractures,
                    embers,
                    core: { radius: sizeFactor * 0.26, minRadius: sizeFactor * 0.08, collapseSpeed: 220 + sizeFactor * 0.9 }
                };
                break;
            }
            default: {
                const spokes = Array.from({ length: 6 + Math.floor(sizeFactor / 16) }, () => ({
                    angle: Math.random() * Math.PI * 2,
                    length: sizeFactor * randomBetween(0.4, 0.7),
                    maxLength: sizeFactor * randomBetween(1, 1.6),
                    growth: randomBetween(180, 320),
                    width: Math.max(2, sizeFactor * 0.04)
                }));
                explosion = {
                    type: 'nova',
                    x: centerX,
                    y: centerY,
                    palette,
                    radius: sizeFactor * 0.45,
                    maxRadius: sizeFactor * 1.85,
                    expansionSpeed: 320 + sizeFactor * 2.1,
                    ringRadius: sizeFactor * 0.7,
                    maxRingRadius: sizeFactor * 2.4,
                    ringGrowth: 480 + sizeFactor * 2.6,
                    ringThickness: Math.max(4, sizeFactor * 0.12),
                    life: 520,
                    maxLife: 520,
                    spokes,
                    pulse: Math.random() * Math.PI * 2
                };
                break;
            }
        }

        villainExplosions.push(explosion);
        audioManager.playExplosion(villainKey ?? 'generic');
        triggerScreenShake(Math.min(18, 8 + (sizeFactor ?? 0) * 0.05), 340);

        switch (explosion.type) {
            case 'ionBurst': {
                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.core,
                    count: 34,
                    speedRange: [140, 360],
                    sizeRange: [1.2, 3.2],
                    lifeRange: [420, 700]
                });
                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.spark,
                    count: 22,
                    speedRange: [200, 480],
                    sizeRange: [0.8, 2.2],
                    lifeRange: [320, 560]
                });
                break;
            }
            case 'gravityRift': {
                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.core,
                    count: 42,
                    speedRange: [180, 520],
                    sizeRange: [1.6, 4.8],
                    lifeRange: [520, 880]
                });
                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.spark,
                    count: 28,
                    speedRange: [220, 620],
                    sizeRange: [1, 2.6],
                    lifeRange: [360, 640]
                });
                createHitSpark({ x: centerX, y: centerY, color: palette.halo });
                break;
            }
            default: {
                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.core,
                    count: 28,
                    speedRange: [160, 420],
                    sizeRange: [1.1, 3.4],
                    lifeRange: [360, 620]
                });

                createParticles({
                    x: centerX,
                    y: centerY,
                    color: palette.spark,
                    count: 18,
                    speedRange: [220, 520],
                    sizeRange: [0.6, 1.6],
                    lifeRange: [260, 480]
                });
                break;
            }
        }
    }

    function awardCollect(collectible) {
        const points = collectible?.points ?? config.score.collect;
        state.nyan += points;
        awardScore(points, {
            x: collectible.x + collectible.width * 0.5,
            y: collectible.y + collectible.height * 0.5,
            type: 'collect',
            color: '#7dd3fc'
        });
        triggerScreenShake(3, 160);
        audioManager.playCollect(collectible?.key ?? 'point');
        storyManager.recordEvent('collectible', {
            type: collectible?.key ?? 'point',
            points
        });
    }

    function awardDestroy(obstacle) {
        const sizeBonus = Math.floor(obstacle.width * 0.6);
        const durabilityBonus = (obstacle.maxHealth ? obstacle.maxHealth - 1 : 0) * 90;
        awardScore(config.score.destroy + sizeBonus + durabilityBonus, {
            x: obstacle.x + obstacle.width * 0.5,
            y: obstacle.y + obstacle.height * 0.5,
            type: 'villain',
            color: '#f9a8d4'
        });
        triggerScreenShake(12, 300);
        const activeChallengeManager = getChallengeManager();
        if (activeChallengeManager) {
            activeChallengeManager.recordEvent('villain', {
                count: 1,
                type: obstacle?.villainType?.key ?? null
            });
        }
        if (isBossObstacle(obstacle)) {
            completeBossBattle();
            spawnFloatingText({
                text: 'Boss Neutralized!',
                x: obstacle.x + obstacle.width * 0.5,
                y: obstacle.y,
                color: '#38bdf8',
                life: 1400,
                variant: 'score',
                multiplier: 1
            });
            storyManager.recordEvent('boss', {
                status: 'defeated',
                boss: obstacle?.villainType?.key ?? null,
                name: obstacle?.villainType?.name ?? null
            });
        }
    }

    function awardDodge() {
        state.score += config.score.dodge;
        state.comboTimer = Math.max(0, state.comboTimer - 400);
        const center = getPlayerCenter();
        spawnFloatingText({
            text: `+${config.score.dodge} Dodge`,
            x: center.x + player.width * 0.5,
            y: center.y,
            color: '#fde68a',
            life: 900,
            variant: 'dodge'
        });
    }

    function getVillainEscapePenalty(obstacle) {
        const basePenalty = config.score?.villainEscape ?? 0;
        const durabilityPenalty = Math.max(0, (obstacle.maxHealth ?? 0) - 1) * 45;
        const sizePenalty = Math.round((obstacle.width ?? 0) * 0.35);
        return Math.max(0, basePenalty + durabilityPenalty + sizePenalty);
    }

    function handleVillainEscape(obstacle) {
        const penalty = getVillainEscapePenalty(obstacle);
        if (penalty > 0) {
            state.score = Math.max(0, state.score - penalty);
            const center = getPlayerCenter();
            spawnFloatingText({
                text: `-${penalty} pts`,
                x: center.x,
                y: center.y,
                color: '#f87171',
                life: 1100,
                variant: 'penalty'
            });
            triggerScreenShake(8, 240);
        }
        state.comboTimer = config.comboDecayWindow;
        resetStreak();
        const sparkCenter = getPlayerCenter();
        createHitSpark({
            x: sparkCenter.x,
            y: sparkCenter.y,
            color: { r: 255, g: 120, b: 120 }
        });
    }

    function awardScore(basePoints, source = {}) {
        state.comboTimer = 0;
        const previousBest = state.bestStreak;
        state.streak += 1;
        const activeChallengeManager = getChallengeManager();
        if (state.streak > state.bestStreak) {
            state.bestStreak = state.streak;
            if (state.bestStreak >= 4 && state.bestStreak > previousBest) {
                addSocialMoment(`${playerName} pushed a x${state.bestStreak} streak!`, {
                    type: 'combo'
                });
            }
            storyManager.recordEvent('streak', { bestStreak: state.bestStreak });
            if (activeChallengeManager) {
                activeChallengeManager.recordEvent('streak', { bestStreak: state.bestStreak });
            }
            if (metaProgressManager) {
                metaProgressManager.recordStreak({
                    bestStreak: state.bestStreak,
                    delta: state.bestStreak - previousBest
                });
            }
        }
        state.tailTarget = config.baseTrailLength + state.streak * config.trailGrowthPerStreak;
        mascotAnnouncer.cheerForCombo(state.streak);
        const comboMultiplier = 1 + state.streak * config.comboMultiplierStep;
        const surgeMultiplier = getScoreSurgeMultiplier();
        const totalMultiplier = comboMultiplier * surgeMultiplier;
        const finalPoints = Math.floor(basePoints * totalMultiplier);
        state.score += finalPoints;
        storyManager.recordEvent('score', { totalScore: state.score, deltaScore: finalPoints });
        if (activeChallengeManager) {
            activeChallengeManager.recordEvent('score', { totalScore: state.score, deltaScore: finalPoints });
        }
        if (metaProgressManager) {
            metaProgressManager.recordScore(finalPoints, { totalScore: state.score });
        }
        const originX = source.x ?? player.x + player.width * 0.5;
        const originY = source.y ?? player.y;
        const text = `+${finalPoints.toLocaleString()}${totalMultiplier > 1.01 ? ` x${totalMultiplier.toFixed(2)}` : ''}`;
        spawnFloatingText({
            text,
            x: originX,
            y: originY,
            color: source.color ?? '#fbbf24',
            variant: source.type ?? 'score',
            multiplier: totalMultiplier
        });
        if (finalPoints >= 600) {
            triggerScreenShake(Math.min(16, 6 + finalPoints / 400), 280);
        }
    }

    function resetStreak() {
        const hadStreak = state.streak > 0;
        state.streak = 0;
        state.tailTarget = config.baseTrailLength;
        if (hadStreak && state.gameState === 'running') {
            mascotAnnouncer.lamentSetback();
        }
    }

    function finalizePendingSubmission({ recorded, reason = null, placement = null, runsToday = 0 } = {}) {
        if (!pendingSubmission) {
            return null;
        }
        const summary = { ...pendingSubmission };
        const formattedTime = formatTime(summary.timeMs);
        const formattedScore = summary.score.toLocaleString();
        const timestamp = summary.recordedAt;
        lastRunSummary = {
            player: summary.player,
            timeMs: summary.timeMs,
            score: summary.score,
            nyan: summary.nyan,
            bestStreak: summary.bestStreak,
            placement,
            recordedAt: timestamp,
            runsToday,
            recorded,
            reason
        };
        updateRunSummaryOverview();
        updateSharePanel();
        const runDescriptor = runsToday
            ? ` (${Math.min(runsToday, SUBMISSION_LIMIT)}/${SUBMISSION_LIMIT} today)`
            : '';
        if (recorded) {
            recordLocalHighScore({
                player: summary.player,
                timeMs: summary.timeMs,
                score: summary.score,
                bestStreak: summary.bestStreak,
                nyan: summary.nyan,
                recordedAt: summary.recordedAt
            });
            if (placement && placement <= 7) {
                addSocialMoment(`${summary.player} entered the galaxy standings at #${placement}!${runDescriptor}`, {
                    type: 'leaderboard',
                    timestamp
                });
            } else {
                addSocialMoment(`${summary.player} logged ${formattedTime} for ${formattedScore} pts${runDescriptor}.`, {
                    type: 'score',
                    timestamp
                });
            }
            mascotAnnouncer.celebrateVictory(summary);
        } else if (reason === 'limit') {
            addSocialMoment(`${summary.player} maxed out their daily flight logs for now.`, {
                type: 'limit',
                timestamp
            });
        } else if (reason === 'skipped') {
            addSocialMoment(`${summary.player} survived ${formattedTime} for ${formattedScore} pts.`, {
                type: 'score',
                timestamp
            });
        } else if (reason === 'conflict') {
            addSocialMoment(`${summary.player} already has a stronger log on the board.`, {
                type: 'limit',
                timestamp
            });
        } else if (reason === 'error') {
            addSocialMoment(`${summary.player}'s log hit turbulence. Retry shortly.`, {
                type: 'limit',
                timestamp
            });
        }
        if (metaProgressManager) {
            metaProgressManager.recordRun({
                score: summary.score,
                bestStreak: summary.bestStreak,
                placement,
                timeMs: summary.timeMs,
                recorded,
                runsToday
            });
        }
        pendingSubmission = null;
        return { summary, formattedTime, formattedScore };
    }

    function triggerGameOver(message) {
        if (state.gameState !== 'running') return;
        state.gameState = 'gameover';
        updateSwapPilotButton();
        updateSwapWeaponButtons();
        mascotAnnouncer.lamentSetback({ force: true });
        hidePauseOverlay();
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        audioManager.stopGameplayMusic();
        audioManager.stopHyperBeam();
        const finalTimeMs = state.elapsedTime;
        storyManager.completeRun({
            timeMs: finalTimeMs,
            score: state.score,
            bestStreak: state.bestStreak,
            nyan: state.nyan
        });
        const runTimestamp = Date.now();
        if (tutorialFlightActive) {
            pendingSubmission = null;
            const summaryPlayer = tutorialCallsign || playerName;
            lastRunSummary = {
                player: summaryPlayer,
                timeMs: finalTimeMs,
                score: state.score,
                nyan: state.nyan,
                bestStreak: state.bestStreak,
                placement: null,
                recordedAt: runTimestamp,
                runsToday: 0,
                recorded: false,
                reason: 'tutorial'
            };
            tutorialFlightActive = false;
            const label = tutorialCallsign
                ? `Temporary callsign ${tutorialCallsign}`
                : 'Training flight';
            setRunSummaryStatus(
                'Training flight complete. Confirm your callsign to prep for ranked runs.',
                'info'
            );
            updateRunSummaryOverview();
            updateSharePanel();
            updateTimerDisplay();
            const messageLines = [
                `${label} completed a practice escape.`,
                'Confirm your callsign to review the full mission briefing and launch a ranked flight.'
            ];
            showOverlay(messageLines.join('\n\n'), 'Confirm Callsign', {
                title: overlayDefaultTitle,
                enableButton: true,
                launchMode: 'prepare',
                showComic: true
            });
            tutorialCallsign = null;
            refreshFlyNowButton();
            return;
        }
        const usage = getSubmissionUsage(playerName, runTimestamp);
        const limitReached = usage.count >= SUBMISSION_LIMIT;
        pendingSubmission = {
            player: playerName,
            timeMs: finalTimeMs,
            score: state.score,
            nyan: state.nyan,
            bestStreak: state.bestStreak,
            recordedAt: runTimestamp,
            baseMessage: message,
            quotaCount: usage.count,
            limitReached
        };
        lastRunSummary = {
            player: playerName,
            timeMs: finalTimeMs,
            score: state.score,
            nyan: state.nyan,
            bestStreak: state.bestStreak,
            placement: null,
            recordedAt: runTimestamp,
            runsToday: usage.count,
            recorded: false,
            reason: limitReached ? 'limit' : 'pending'
        };
        updateRunSummaryOverview();
        updateSharePanel();
        updateTimerDisplay();
        const promptMessage = buildRunSummaryMessage(message, pendingSubmission, {
            runsToday: usage.count,
            limitReached,
            prompt: !limitReached
        });
        const primaryText = limitReached ? 'Retry Flight' : 'Submit Flight Log';
        const primaryMode = limitReached ? 'retry' : 'submit';
        const secondaryConfig = limitReached
            ? null
            : { text: 'Skip Submission', launchMode: 'retry' };
        showOverlay(promptMessage, primaryText, {
            title: '',
            enableButton: true,
            launchMode: primaryMode,
            secondaryButton: secondaryConfig
        });
    }

    function skipScoreSubmission() {
        if (!pendingSubmission) {
            return;
        }
        pendingSubmission.player = getPendingPlayerName();
        const runsToday = pendingSubmission.limitReached
            ? Math.min(
                typeof pendingSubmission.quotaCount === 'number'
                    ? pendingSubmission.quotaCount
                    : SUBMISSION_LIMIT,
                SUBMISSION_LIMIT
            )
            : getSubmissionUsage(pendingSubmission.player, pendingSubmission.recordedAt).count;
        const reason = pendingSubmission.limitReached ? 'limit' : 'skipped';
        finalizePendingSubmission({
            recorded: false,
            reason,
            runsToday
        });
    }

    async function attemptSubmitScore() {
        if (!pendingSubmission) {
            return;
        }
        const submission = { ...pendingSubmission };
        submission.player = commitPlayerNameInput();
        pendingSubmission.player = submission.player;
        setOverlaySubmittingState(true);
        try {
            const result = await recordHighScore(submission.timeMs, submission.score, {
                player: submission.player,
                bestStreak: submission.bestStreak,
                nyan: submission.nyan,
                recordedAt: submission.recordedAt
            });
            if (!result || !result.recorded) {
                const runsToday = result?.runsToday ?? getSubmissionUsage(submission.player, submission.recordedAt).count;
                const reason = result?.reason ?? 'limit';
                const placement = result?.placement ?? null;
                finalizePendingSubmission({ recorded: false, reason, placement, runsToday });
                const message = buildRunSummaryMessage(submission.baseMessage, submission, {
                    runsToday,
                    limitReached: reason === 'limit',
                    conflict: reason === 'conflict',
                    errorMessage: result?.message ?? null
                });
                setOverlaySubmittingState(false);
                const primaryLabel = reason === 'limit' ? 'Retry Flight' : getRetryControlText();
                showOverlay(message, primaryLabel, { title: '', enableButton: true, launchMode: 'retry' });
                return;
            }
            const runsToday = result.runsToday ?? getSubmissionUsage(submission.player, submission.recordedAt).count;
            const placement = result.placement ?? null;
            finalizePendingSubmission({
                recorded: true,
                reason: result.reason ?? null,
                placement,
                runsToday
            });
            updateHighScorePanel();
            const message = buildRunSummaryMessage(submission.baseMessage, submission, {
                placement,
                runsToday,
                success: result.source === 'remote',
                offline: result.source === 'offline',
                errorMessage: result.message ?? null
            });
            setOverlaySubmittingState(false);
            showOverlay(message, getRetryControlText(), { title: '', enableButton: true, launchMode: 'retry' });
        } catch (error) {
            console.error('Unexpected score submission failure', error);
            const runsToday = getSubmissionUsage(submission.player, submission.recordedAt).count;
            finalizePendingSubmission({ recorded: false, reason: 'error', runsToday });
            const message = buildRunSummaryMessage(submission.baseMessage, submission, {
                runsToday,
                errorMessage: 'Unexpected error while submitting. Try again shortly.'
            });
            setOverlaySubmittingState(false);
            showOverlay(message, 'Retry Flight', { title: '', enableButton: true, launchMode: 'retry' });
        }
    }

    function handleOverlayAction(mode) {
        const action = mode || (state.gameState === 'ready' ? 'launch' : 'retry');
        if (action === 'submit') {
            const submissionPromise = attemptSubmitScore();
            if (submissionPromise && typeof submissionPromise.catch === 'function') {
                submissionPromise.catch((error) => {
                    console.error('Unhandled submission error', error);
                });
            }
            return;
        }
        if (action === 'prepare') {
            commitPlayerNameInput();
            return;
        }
        if (action === 'retry') {
            skipScoreSubmission();
            commitPlayerNameInput();
            enterPreflightReadyState();
            return;
        }
        if (action === 'launch') {
            commitPlayerNameInput();
            if (state.gameState === 'ready' && preflightReady) {
                startGame();
            } else {
                enterPreflightReadyState();
            }
            return;
        }
        openCharacterSelect('launch');
    }

    function updateCombo(delta) {
        state.comboTimer += delta;
        if (state.comboTimer >= config.comboDecayWindow && state.streak > 0) {
            resetStreak();
        }
        const ratio = clamp(1 - state.comboTimer / config.comboDecayWindow, 0, 1);
        const percentage = Math.round(ratio * 100);
        if (percentage !== lastComboPercent) {
            if (comboFillEl) {
                comboFillEl.style.width = `${percentage}%`;
            }
            comboMeterEl?.setAttribute('aria-valuenow', String(percentage));
            lastComboPercent = percentage;
        }
        if (comboMeterEl) {
            const charged = state.streak >= 5 && ratio > 0.4;
            comboMeterEl.classList.toggle('charged', charged);
        }
    }

    function updateHUD() {
        const formattedScore = state.score.toLocaleString();
        if (formattedScore !== hudCache.score) {
            hudCache.score = formattedScore;
            if (scoreEl) {
                scoreEl.textContent = formattedScore;
            }
        }

        const formattedNyan = state.nyan.toLocaleString();
        if (formattedNyan !== hudCache.nyan) {
            hudCache.nyan = formattedNyan;
            if (nyanEl) {
                nyanEl.textContent = formattedNyan;
            }
        }

        const comboMultiplierText = `x${(1 + state.streak * config.comboMultiplierStep).toFixed(2)}`;
        if (comboMultiplierText !== hudCache.comboMultiplier) {
            hudCache.comboMultiplier = comboMultiplierText;
            if (streakEl) {
                streakEl.textContent = comboMultiplierText;
            }
        }

        const bestTailLengthText = `${Math.round(
            config.baseTrailLength + state.bestStreak * config.trailGrowthPerStreak
        )}`;
        if (bestTailLengthText !== hudCache.bestTailLength) {
            hudCache.bestTailLength = bestTailLengthText;
            if (bestStreakEl) {
                bestStreakEl.textContent = bestTailLengthText;
            }
        }

        const marketCapText = `${(6.6 + state.score / 1400).toFixed(1)}K`;
        if (marketCapText !== hudCache.marketCap) {
            hudCache.marketCap = marketCapText;
            if (mcapEl) {
                mcapEl.textContent = marketCapText;
            }
        }

        const normalizedCollects = state.nyan / baseCollectScore;
        const volumeText = `${(2.8 + normalizedCollects * 0.6 + state.streak * 0.3).toFixed(1)}K`;
        if (volumeText !== hudCache.volume) {
            hudCache.volume = volumeText;
            if (volEl) {
                volEl.textContent = volumeText;
            }
        }

        const activeBoosts = powerUpTypes
            .filter((type) => isPowerUpActive(type))
            .map((type) => `${powerUpLabels[type]} ${(state.powerUpTimers[type] / 1000).toFixed(1)}s`);
        const powerUpText = activeBoosts.length ? activeBoosts.join(' | ') : 'None';
        if (powerUpText !== hudCache.powerUps) {
            hudCache.powerUps = powerUpText;
            if (powerUpsEl) {
                powerUpsEl.textContent = powerUpText;
            }
        }
    }

    function drawBackground() {
        ctx.fillStyle = '#05091f';
        ctx.fillRect(0, 0, viewport.width, viewport.height);
        let gradient = backgroundGradient;
        if (!gradient || backgroundGradientHeight !== viewport.height) {
            gradient = ctx.createLinearGradient(0, 0, 0, viewport.height);
            gradient.addColorStop(0, 'rgba(26, 35, 126, 0.85)');
            gradient.addColorStop(0.5, 'rgba(21, 11, 45, 0.85)');
            gradient.addColorStop(1, 'rgba(0, 2, 12, 0.95)');
            backgroundGradient = gradient;
            backgroundGradientHeight = viewport.height;
        }
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, viewport.width, viewport.height);
    }

    function drawStars(time) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = STAR_FILL_COLOR;
        for (const star of stars) {
            const twinkle = (Math.sin(time * 0.002 + star.twinkleOffset) + 1) * 0.5;
            ctx.globalAlpha = 0.3 + twinkle * 0.7;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawTrailSegments(points, style, now, { width = 72, height = 12, alphaScale = 1, hueOffset = 0 } = {}) {
        if (!points || points.length < 2) {
            return;
        }
        const halfWidth = width / 2;
        const halfHeight = height / 2;

        ctx.save();
        if (style.type === 'palette' && Array.isArray(style.colors) && style.colors.length) {
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const progress = i / points.length;
                const alpha = Math.max(0, Math.min(1, progress * alphaScale));
                if (alpha <= 0) {
                    continue;
                }
                const colorIndex = Math.min(style.colors.length - 1, Math.floor(progress * style.colors.length));
                ctx.globalAlpha = alpha;
                ctx.fillStyle = style.colors[colorIndex] ?? '#7dd3fc';
                ctx.fillRect(point.x - halfWidth, point.y - halfHeight, width, height);
            }
        } else {
            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                const progress = i / points.length;
                const alpha = Math.max(0, Math.min(1, progress * alphaScale));
                if (alpha <= 0) {
                    continue;
                }
                const hue = (progress * 300 + now * 0.05 + hueOffset) % 360;
                ctx.fillStyle = `hsla(${hue}, 100%, 60%, ${alpha})`;
                ctx.fillRect(point.x - halfWidth, point.y - halfHeight, width, height);
            }
        }
        ctx.restore();
    }

    function drawTrail() {
        if (isPowerUpActive(PUMP_POWER) || pumpTailState.fade > 0) {
            drawPumpTail();
            return;
        }
        const style = getActiveTrailStyle() ?? trailStyles.rainbow;
        const now = performance.now();
        drawTrailSegments(trail, style, now, { width: 72, height: 12, alphaScale: 1 });
        if (doubleTeamState.trail.length >= 2) {
            drawTrailSegments(doubleTeamState.trail, style, now, {
                width: 58,
                height: 10,
                alphaScale: 0.85,
                hueOffset: 36
            });
        }
    }

    function drawShieldAura(entity, drawX, drawY, time = performance.now()) {
        if (!isShieldActive()) return;
        const shieldConfig = config.defensePower ?? {};
        const auraColor = normalizeColor(shieldConfig.auraColor) ?? { r: 150, g: 214, b: 255 };
        const duration = config.powerUp.duration[SHIELD_POWER] ?? 1;
        const remaining = clamp(state.powerUpTimers[SHIELD_POWER] / duration, 0, 1);
        const auraPulse = Number.isFinite(shieldConfig.auraPulse)
            ? shieldConfig.auraPulse
            : Number.isFinite(Number(shieldConfig.auraPulse))
                ? Number(shieldConfig.auraPulse)
                : 0.18;
        const pulseStrength = Math.sin(time * 0.007) * clamp(auraPulse, -2, 2);
        const hitPulse = state.shieldHitPulse ?? 0;
        const baseRadius = Math.max(entity.width, entity.height) * (0.65 + pulseStrength + hitPulse * 0.18);
        const safeBaseRadius = Math.max(baseRadius, 6);
        const centerX = drawX + entity.width * 0.5;
        const centerY = drawY + entity.height * 0.5;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.globalCompositeOperation = 'lighter';

        const gradient = ctx.createRadialGradient(0, 0, safeBaseRadius * 0.35, 0, 0, safeBaseRadius);
        gradient.addColorStop(0, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${0.55 + hitPulse * 0.25})`);
        gradient.addColorStop(0.58, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${0.28 + remaining * 0.35})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, safeBaseRadius, 0, Math.PI * 2);
        ctx.fill();

        const ringRadius = safeBaseRadius * (0.88 + 0.06 * Math.sin(time * 0.012 + hitPulse));
        ctx.strokeStyle = `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${0.35 + remaining * 0.4})`;
        ctx.lineWidth = 4.2 + hitPulse * 2.6;
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
        ctx.stroke();

        const sparkCount = 7;
        for (let i = 0; i < sparkCount; i++) {
            const angle = time * 0.0035 + i * (Math.PI * 2 / sparkCount);
            const sparkRadius = ringRadius * (0.92 + 0.08 * Math.sin(time * 0.01 + i));
            const px = Math.cos(angle) * sparkRadius;
            const py = Math.sin(angle) * sparkRadius;
            const sparkAlpha = 0.55 + 0.35 * Math.sin(time * 0.02 + i * 1.3 + hitPulse * 0.6);
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(angle);
            ctx.fillStyle = `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${sparkAlpha})`;
            ctx.beginPath();
            ctx.ellipse(0, 0, 7 + hitPulse * 3, 2.4 + hitPulse * 1.2, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    }

    function drawDoubleTeamLink(time) {
        if (!isDoubleTeamActive()) {
            return;
        }
        const clone = doubleTeamState.clone;
        const origin = getPlayerCenter(player);
        const cloneCenter = getPlayerCenter(clone);
        const dx = cloneCenter.x - origin.x;
        const dy = cloneCenter.y - origin.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 6) {
            return;
        }
        const color = powerUpColors[DOUBLE_TEAM_POWER] ?? { r: 188, g: 224, b: 255 };
        const pulse = 0.6 + Math.sin(time * 0.006 + doubleTeamState.wobble) * 0.2;
        const alpha = 0.32 + (doubleTeamState.linkPulse ?? 0) * 0.2;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(3, 6 * pulse);
        const gradient = ctx.createLinearGradient(origin.x, origin.y, cloneCenter.x, cloneCenter.y);
        gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
        gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.85})`);
        ctx.strokeStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(cloneCenter.x, cloneCenter.y);
        ctx.stroke();

        const midX = (origin.x + cloneCenter.x) / 2;
        const midY = (origin.y + cloneCenter.y) / 2;
        const orbRadius = Math.min(18, 6 + distance * 0.05) * pulse;
        const orbGradient = ctx.createRadialGradient(midX, midY, 0, midX, midY, orbRadius);
        orbGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${0.38 + pulse * 0.2})`);
        orbGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = orbGradient;
        ctx.beginPath();
        ctx.arc(midX, midY, orbRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawPlayerSprite(entity, time, index) {
        if (!entity) {
            return;
        }
        const isClone = entity !== player;
        const bobOffset = isClone ? (index + 1) * 120 : 0;
        const bob = Math.sin((time + bobOffset) * 0.005) * 4;
        const drawX = entity.x;
        const drawY = entity.y + bob;

        drawShieldAura(entity, drawX, drawY, time);

        ctx.save();
        if (isClone) {
            ctx.globalAlpha = 0.9;
        }
        if (activePlayerImage.complete && activePlayerImage.naturalWidth !== 0) {
            ctx.drawImage(activePlayerImage, drawX, drawY, entity.width, entity.height);
        } else {
            const gradient = ctx.createLinearGradient(drawX, drawY, drawX + entity.width, drawY + entity.height);
            gradient.addColorStop(0, '#ff9a9e');
            gradient.addColorStop(0.5, '#fad0c4');
            gradient.addColorStop(1, '#fad0c4');
            ctx.fillStyle = gradient;
            ctx.fillRect(drawX, drawY, entity.width, entity.height);
        }
        if (isClone) {
            const color = powerUpColors[DOUBLE_TEAM_POWER] ?? { r: 188, g: 224, b: 255 };
            ctx.globalCompositeOperation = 'lighter';
            const overlay = ctx.createLinearGradient(drawX, drawY, drawX + entity.width, drawY + entity.height);
            overlay.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.45)`);
            overlay.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = overlay;
            ctx.fillRect(drawX, drawY, entity.width, entity.height);
        }
        ctx.restore();

        if (isShieldActive()) {
            drawShieldAura(entity, drawX, drawY, time + 40);
        }
    }

    function drawPlayer() {
        const now = performance.now();
        drawDoubleTeamLink(now);
        const players = getActivePlayerEntities();
        for (let i = 0; i < players.length; i++) {
            drawPlayerSprite(players[i], now, i);
        }
    }

    function drawObstacles() {
        for (const obstacle of obstacles) {
            ctx.save();
            ctx.translate(obstacle.x + obstacle.width / 2, obstacle.y + obstacle.height / 2);
            ctx.rotate(obstacle.rotation);

            if (obstacle.image && obstacle.image.complete && obstacle.image.naturalWidth > 0) {
                ctx.drawImage(
                    obstacle.image,
                    -obstacle.width / 2,
                    -obstacle.height / 2,
                    obstacle.width,
                    obstacle.height
                );
            } else {
                const radius = obstacle.width / 2;
                ctx.beginPath();
                ctx.moveTo(radius, 0);
                for (let i = 1; i < 6; i++) {
                    const angle = i * (Math.PI * 2 / 6);
                    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
                }
                ctx.closePath();
                ctx.fillStyle = '#4f46e5';
                ctx.fill();
                ctx.strokeStyle = 'rgba(255,255,255,0.25)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }

            if (obstacle.hitFlash > 0) {
                const flashAlpha = clamp(obstacle.hitFlash / 160, 0, 1);
                ctx.fillStyle = `rgba(255, 255, 255, ${0.35 * flashAlpha})`;
                ctx.fillRect(-obstacle.width / 2, -obstacle.height / 2, obstacle.width, obstacle.height);
            }

            ctx.restore();

            if (obstacle.maxHealth > 1) {
                const ratio = clamp(obstacle.health / obstacle.maxHealth, 0, 1);
                const barWidth = obstacle.width;
                const barHeight = 6;
                const barX = obstacle.x;
                const barY = obstacle.y - 10;
                ctx.fillStyle = 'rgba(79,70,229,0.35)';
                ctx.fillRect(barX, barY, barWidth, barHeight);
                ctx.fillStyle = '#a5b4fc';
                ctx.fillRect(barX, barY, barWidth * ratio, barHeight);
            }
        }
    }

    function drawCollectibles(time) {
        for (const collectible of collectibles) {
            ctx.save();
            ctx.translate(collectible.x + collectible.width / 2, collectible.y + collectible.height / 2);
            ctx.rotate(Math.sin(time * 0.004 + collectible.wobbleTime) * 0.2);
            const pulse = Math.sin(time * 0.004 + collectible.wobbleTime);
            const sprite = collectible.sprite;
            const spriteReady = sprite?.complete && sprite.naturalWidth > 0;
            const glowColors = collectible.glow ?? {};
            const innerGlow = glowColors.inner ?? 'rgba(255, 255, 255, 0.9)';
            const outerGlow = glowColors.outer ?? 'rgba(255, 215, 0, 0.2)';

            const glowRadius = collectible.width * (0.62 + 0.08 * pulse);
            const gradient = getCachedRadialGradient(
                collectibleGradientCache,
                ctx,
                glowRadius * 0.35,
                glowRadius,
                [
                    [0, innerGlow],
                    [1, outerGlow]
                ]
            );
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
            ctx.fill();

            if (spriteReady) {
                const drawSize = collectible.width * (0.9 + 0.1 * pulse);
                ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            } else {
                const fallbackRadius = collectible.width * 0.48;
                const fallbackGradient = getCachedRadialGradient(
                    collectibleGradientCache,
                    ctx,
                    4,
                    fallbackRadius,
                    [
                        [0, innerGlow],
                        [1, outerGlow]
                    ]
                );
                ctx.fillStyle = fallbackGradient;
                ctx.beginPath();
                ctx.arc(0, 0, fallbackRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#0f172a';
                ctx.font = `700 10px ${primaryFontStack}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(collectible.label ?? 'POINTS', 0, 0);
            }
            ctx.restore();
        }
    }

    function drawPowerUps(time) {
        for (const powerUp of powerUps) {
            ctx.save();
            ctx.translate(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
            const pulse = 0.15 * Math.sin(time * 0.006 + powerUp.wobbleTime);
            const radius = powerUp.width * (0.36 + pulse);
            const color = powerUpColors[powerUp.type] ?? { r: 220, g: 220, b: 255 };
            const gradient = getCachedRadialGradient(
                powerUpGradientCache,
                ctx,
                radius * 0.25,
                radius,
                [
                    [0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.95)`],
                    [0.65, `rgba(${color.r}, ${color.g}, ${color.b}, 0.6)`],
                    [1, 'rgba(255,255,255,0.1)']
                ]
            );
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,255,255,0.4)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
            ctx.stroke();

            const sprite = powerUpImages[powerUp.type];
            const isSpriteReady = sprite?.complete && sprite.naturalWidth !== 0;
            if (isSpriteReady) {
                const drawSize = powerUp.width;
                ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
            } else {
                ctx.fillStyle = '#060b28';
                ctx.font = `700 12px ${primaryFontStack}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const label = powerUpLabels[powerUp.type] ?? 'BOOST';
                ctx.fillText(label.split(' ')[0], 0, -6);
                if (label.includes(' ')) {
                    ctx.fillText(label.split(' ')[1], 0, 8);
                }
            }
            ctx.restore();
        }
    }

    function drawAreaBursts() {
        if (!areaBursts.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const burst of areaBursts) {
            const opacity = clamp(burst.life / 650, 0, 1);
            const gradient = ctx.createRadialGradient(burst.x, burst.y, burst.radius * 0.4, burst.x, burst.y, burst.radius);
            gradient.addColorStop(0, `rgba(255, 185, 130, ${0.35 * opacity})`);
            gradient.addColorStop(1, 'rgba(255, 120, 80, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(burst.x, burst.y, burst.radius, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = `rgba(255, 200, 150, ${0.5 * opacity})`;
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.arc(burst.x, burst.y, burst.radius * 0.85, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawVillainExplosions() {
        if (!villainExplosions.length) return;
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        for (const explosion of villainExplosions) {
            const palette = explosion.palette ?? villainExplosionPalettes.villain1;
            const alpha = clamp(explosion.life / explosion.maxLife, 0, 1);

            switch (explosion.type) {
                case 'ionBurst': {
                    const gradient = ctx.createRadialGradient(
                        explosion.x,
                        explosion.y,
                        Math.max(6, explosion.radius * 0.2),
                        explosion.x,
                        explosion.y,
                        Math.max(explosion.radius, 1)
                    );
                    gradient.addColorStop(
                        0,
                        `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.65 * alpha})`
                    );
                    gradient.addColorStop(
                        0.6,
                        `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, ${0.4 * alpha})`
                    );
                    gradient.addColorStop(1, `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, 0)`);
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
                    ctx.fill();

                    if (explosion.orbits) {
                        for (const orbit of explosion.orbits) {
                            const orbitAlpha = alpha * 0.35;
                            ctx.save();
                            ctx.translate(explosion.x, explosion.y);
                            ctx.rotate(orbit.angle);
                            ctx.strokeStyle = `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, ${orbitAlpha})`;
                            ctx.lineWidth = orbit.thickness;
                            ctx.beginPath();
                            ctx.ellipse(0, 0, orbit.radius, orbit.radius * orbit.eccentricity, 0, 0, Math.PI * 2);
                            ctx.stroke();
                            ctx.restore();
                        }
                    }

                    if (typeof explosion.ringRadius === 'number') {
                        ctx.strokeStyle = `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.25 * alpha})`;
                        ctx.lineWidth = explosion.ringThickness ?? 6;
                        ctx.beginPath();
                        ctx.arc(explosion.x, explosion.y, explosion.ringRadius, 0, Math.PI * 2);
                        ctx.stroke();
                    }

                    if (explosion.swirl) {
                        const swirlSegments = 18;
                        ctx.strokeStyle = `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.4 * alpha})`;
                        ctx.lineWidth = Math.max(2, (explosion.ringThickness ?? 6) * 0.4);
                        ctx.beginPath();
                        for (let i = 0; i < swirlSegments; i++) {
                            const t = i / (swirlSegments - 1);
                            const angle = explosion.swirl.angle + t * Math.PI * 2;
                            const radius = explosion.radius * (0.2 + t * 0.8);
                            const px = explosion.x + Math.cos(angle) * radius;
                            const py = explosion.y + Math.sin(angle) * radius * 0.6;
                            if (i === 0) {
                                ctx.moveTo(px, py);
                            } else {
                                ctx.lineTo(px, py);
                            }
                        }
                        ctx.stroke();
                    }

                    if (explosion.sparks) {
                        for (const spark of explosion.sparks) {
                            const px = explosion.x + Math.cos(spark.angle) * spark.distance;
                            const py = explosion.y + Math.sin(spark.angle) * spark.distance * 0.9;
                            const sparkAlpha = alpha * 0.65;
                            ctx.fillStyle = `rgba(${palette.spark.r}, ${palette.spark.g}, ${palette.spark.b}, ${sparkAlpha})`;
                            ctx.beginPath();
                            ctx.arc(px, py, spark.size, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                    break;
                }
                case 'gravityRift': {
                    const gradient = ctx.createRadialGradient(
                        explosion.x,
                        explosion.y,
                        Math.max(4, explosion.radius * 0.12),
                        explosion.x,
                        explosion.y,
                        Math.max(explosion.radius, 1)
                    );
                    gradient.addColorStop(
                        0,
                        `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.7 * alpha})`
                    );
                    gradient.addColorStop(
                        0.5,
                        `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, ${0.45 * alpha})`
                    );
                    gradient.addColorStop(1, `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, 0)`);
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
                    ctx.fill();

                    if (explosion.shockwaves) {
                        for (const shock of explosion.shockwaves) {
                            if (shock.delay > 0) continue;
                            const shockAlpha = alpha * shock.opacity;
                            ctx.strokeStyle = `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, ${shockAlpha})`;
                            ctx.lineWidth = shock.lineWidth;
                            ctx.beginPath();
                            ctx.arc(explosion.x, explosion.y, shock.radius, 0, Math.PI * 2);
                            ctx.stroke();
                        }
                    }

                    if (explosion.fractures) {
                        ctx.lineCap = 'round';
                        for (const fracture of explosion.fractures) {
                            const fx = explosion.x + Math.cos(fracture.angle) * fracture.length;
                            const fy = explosion.y + Math.sin(fracture.angle) * fracture.length;
                            ctx.strokeStyle = `rgba(${palette.spark.r}, ${palette.spark.g}, ${palette.spark.b}, ${0.35 * alpha})`;
                            ctx.lineWidth = fracture.width;
                            ctx.beginPath();
                            ctx.moveTo(explosion.x, explosion.y);
                            ctx.lineTo(fx, fy);
                            ctx.stroke();
                        }
                    }

                    if (explosion.embers) {
                        for (const ember of explosion.embers) {
                            if (ember.opacity <= 0) continue;
                            const ex = explosion.x + Math.cos(ember.angle) * ember.radius;
                            const ey = explosion.y + Math.sin(ember.angle) * ember.radius * 0.85;
                            const emberAlpha = alpha * ember.opacity;
                            ctx.fillStyle = `rgba(${palette.spark.r}, ${palette.spark.g}, ${palette.spark.b}, ${emberAlpha})`;
                            ctx.beginPath();
                            ctx.arc(ex, ey, ember.size, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }

                    if (explosion.core) {
                        ctx.save();
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.fillStyle = 'rgba(6, 8, 20, 0.85)';
                        ctx.beginPath();
                        ctx.arc(explosion.x, explosion.y, explosion.core.radius, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.restore();
                    }
                    break;
                }
                default: {
                    const gradient = ctx.createRadialGradient(
                        explosion.x,
                        explosion.y,
                        Math.max(6, explosion.radius * 0.2),
                        explosion.x,
                        explosion.y,
                        Math.max(explosion.radius, 1)
                    );
                    gradient.addColorStop(
                        0,
                        `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.55 * alpha})`
                    );
                    gradient.addColorStop(1, `rgba(${palette.halo.r}, ${palette.halo.g}, ${palette.halo.b}, 0)`);
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
                    ctx.fill();

                    if (typeof explosion.ringRadius === 'number') {
                        const pulse = Math.sin(explosion.pulse ?? 0) * 0.5 + 0.5;
                        ctx.strokeStyle = `rgba(${palette.core.r}, ${palette.core.g}, ${palette.core.b}, ${0.35 * alpha * pulse})`;
                        ctx.lineWidth = explosion.ringThickness;
                        ctx.beginPath();
                        ctx.arc(explosion.x, explosion.y, explosion.ringRadius, 0, Math.PI * 2);
                        ctx.stroke();
                    }

                    if (explosion.spokes) {
                        ctx.lineCap = 'round';
                        for (const spoke of explosion.spokes) {
                            const sx = explosion.x + Math.cos(spoke.angle) * spoke.length;
                            const sy = explosion.y + Math.sin(spoke.angle) * spoke.length;
                            ctx.strokeStyle = `rgba(${palette.spark.r}, ${palette.spark.g}, ${palette.spark.b}, ${0.6 * alpha})`;
                            ctx.lineWidth = spoke.width;
                            ctx.beginPath();
                            ctx.moveTo(explosion.x, explosion.y);
                            ctx.lineTo(sx, sy);
                            ctx.stroke();
                        }
                    }
                    break;
                }
            }
        }
        ctx.restore();
    }

    function drawHyperBeam(time) {
        const bounds = hyperBeamState.bounds;
        const intensity = hyperBeamState.intensity;
        if (!bounds || intensity <= 0) {
            return;
        }

        const hyperConfig = config.hyperBeam ?? {};
        const color = powerUpColors[HYPER_BEAM_POWER] ?? { r: 147, g: 197, b: 253 };
        const effectScale = reducedEffectsMode ? 0.7 : 1;
        const jitterAmplitude = (hyperConfig.jitterAmplitude ?? 18) * effectScale;
        const verticalJitter = Math.sin(time * 0.008 + hyperBeamState.wave) * jitterAmplitude * intensity;
        const top = clamp(bounds.y + verticalJitter * -0.5, 0, Math.max(0, viewport.height - bounds.height));
        const height = Math.min(bounds.height, viewport.height - top);
        if (height <= 0) {
            return;
        }
        const midY = clamp(top + height / 2 + verticalJitter * 0.3, top, top + height);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const outerGradient = ctx.createLinearGradient(bounds.x, top, bounds.x + bounds.width, top);
        const outerAlpha = Math.min(1, (0.32 + intensity * 0.28) * effectScale);
        const midAlpha = Math.min(1, (0.5 + intensity * 0.3) * effectScale);
        outerGradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${outerAlpha})`);
        outerGradient.addColorStop(0.45, `rgba(${color.r}, ${color.g}, ${color.b}, ${midAlpha})`);
        outerGradient.addColorStop(1, 'rgba(17, 24, 39, 0)');
        ctx.fillStyle = outerGradient;
        ctx.fillRect(bounds.x, top, bounds.width, height);

        const coreHeight = Math.max(18, height * 0.36 * (reducedEffectsMode ? 0.85 : 1));
        const coreTop = clamp(midY - coreHeight / 2, top, top + height - coreHeight);
        const coreWidth = bounds.width * (reducedEffectsMode ? 0.8 : 0.9);
        const coreGradient = ctx.createLinearGradient(bounds.x, coreTop, bounds.x + coreWidth, coreTop);
        coreGradient.addColorStop(0, `rgba(236, 254, 255, ${Math.min(1, 0.85 * intensity * effectScale)})`);
        coreGradient.addColorStop(1, 'rgba(148, 210, 255, 0)');
        ctx.fillStyle = coreGradient;
        ctx.fillRect(bounds.x, coreTop, coreWidth, coreHeight);

        ctx.strokeStyle = `rgba(236, 254, 255, ${Math.min(1, 0.55 * intensity * effectScale)})`;
        ctx.lineWidth = Math.max(2, height * 0.12 * intensity * effectScale);
        ctx.beginPath();
        ctx.moveTo(bounds.x, midY + Math.sin(time * 0.014 + hyperBeamState.wave) * height * 0.08);
        ctx.lineTo(bounds.x + bounds.width, midY + Math.sin(time * 0.017 + hyperBeamState.wave) * height * 0.05);
        ctx.stroke();

        ctx.restore();
    }

    function drawProjectiles() {
        for (const projectile of projectiles) {
            if (projectile.type === 'missile') {
                ctx.save();
                const halfWidth = projectile.width * 0.5;
                const halfHeight = projectile.height * 0.5;
                ctx.translate(projectile.x + halfWidth, projectile.y + halfHeight);
                const angle = Math.atan2(projectile.vy, projectile.vx);
                ctx.rotate(angle);
                const bodyWidth = projectile.width;
                const bodyHeight = projectile.height * 0.7;
                ctx.fillStyle = '#ffb74d';
                ctx.fillRect(-halfWidth, -bodyHeight * 0.5, bodyWidth, bodyHeight);
                ctx.fillStyle = '#ff7043';
                ctx.beginPath();
                const finX = -bodyWidth * 0.6;
                const finY = projectile.height * 0.5;
                ctx.moveTo(finX, -finY);
                ctx.lineTo(-bodyWidth * 0.2, 0);
                ctx.lineTo(finX, finY);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#263238';
                ctx.fillRect(bodyWidth * 0.1, -halfHeight * 0.4, bodyWidth * 0.5, halfHeight * 0.8);
                ctx.restore();
            } else {
                ctx.save();
                if (projectile.shadowBlur) {
                    ctx.shadowBlur = projectile.shadowBlur;
                    ctx.shadowColor = projectile.shadowColor ?? projectile.glow ?? 'rgba(14, 165, 233, 0.4)';
                } else if (projectile.glow) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = projectile.glow;
                }

                if (projectile.shape === 'lance' || projectile.type === 'lance') {
                    const colors =
                        Array.isArray(projectile.gradient) && projectile.gradient.length
                            ? projectile.gradient
                            : ['#e0f2fe', '#38bdf8'];
                    const gradient = ctx.createLinearGradient(
                        projectile.x,
                        projectile.y,
                        projectile.x + projectile.width,
                        projectile.y
                    );
                    colors.forEach((color, index) => {
                        const stop = colors.length > 1 ? index / (colors.length - 1) : 0;
                        gradient.addColorStop(stop, color);
                    });
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = gradient;
                    const halfHeight = projectile.height * 0.5;
                    ctx.beginPath();
                    ctx.moveTo(projectile.x, projectile.y + halfHeight * 0.25);
                    ctx.lineTo(projectile.x + projectile.width * 0.82, projectile.y);
                    ctx.lineTo(projectile.x + projectile.width, projectile.y + halfHeight);
                    ctx.lineTo(projectile.x + projectile.width * 0.82, projectile.y + projectile.height);
                    ctx.lineTo(projectile.x, projectile.y + projectile.height - halfHeight * 0.25);
                    ctx.closePath();
                    ctx.fill();
                    if (projectile.glow) {
                        ctx.strokeStyle = projectile.glow;
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }
                } else if (projectile.shape === 'flameWhip' || projectile.type === 'flameWhip') {
                    const colors =
                        Array.isArray(projectile.gradient) && projectile.gradient.length
                            ? projectile.gradient
                            : ['#450a0a', '#9f1239', '#f97316'];
                    const gradient = ctx.createLinearGradient(
                        projectile.x,
                        projectile.y,
                        projectile.x + projectile.width,
                        projectile.y + projectile.height * 0.6
                    );
                    colors.forEach((color, index) => {
                        const stop = colors.length > 1 ? index / (colors.length - 1) : 0;
                        gradient.addColorStop(stop, color);
                    });
                    ctx.globalCompositeOperation = 'lighter';
                    ctx.fillStyle = gradient;
                    const halfHeight = projectile.height * 0.5;
                    const curve = projectile.curve ?? 0;
                    ctx.beginPath();
                    ctx.moveTo(projectile.x, projectile.y + halfHeight - curve * 0.25);
                    ctx.quadraticCurveTo(
                        projectile.x + projectile.width * 0.26,
                        projectile.y + halfHeight + curve * 0.6,
                        projectile.x + projectile.width * 0.52,
                        projectile.y + halfHeight - curve * 0.25
                    );
                    ctx.quadraticCurveTo(
                        projectile.x + projectile.width * 0.82,
                        projectile.y + halfHeight - curve * 0.8,
                        projectile.x + projectile.width,
                        projectile.y + halfHeight - curve * 0.15
                    );
                    ctx.quadraticCurveTo(
                        projectile.x + projectile.width * 0.74,
                        projectile.y + halfHeight + curve * 0.35,
                        projectile.x + projectile.width * 0.36,
                        projectile.y + halfHeight + curve * 0.55
                    );
                    ctx.quadraticCurveTo(
                        projectile.x + projectile.width * 0.08,
                        projectile.y + halfHeight + curve * 0.18,
                        projectile.x,
                        projectile.y + halfHeight - curve * 0.25
                    );
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = 'rgba(255, 244, 214, 0.38)';
                    ctx.lineWidth = 1.2;
                    ctx.stroke();
                    ctx.globalCompositeOperation = 'source-over';
                } else {
                    const colors =
                        Array.isArray(projectile.gradient) && projectile.gradient.length
                            ? projectile.gradient
                            : projectile.type === 'spread'
                                ? ['#b39ddb', '#7e57c2']
                                : ['#00e5ff', '#6a5acd'];
                    const gradient = ctx.createLinearGradient(
                        projectile.x,
                        projectile.y,
                        projectile.x + projectile.width,
                        projectile.y + projectile.height
                    );
                    colors.forEach((color, index) => {
                        const stop = colors.length > 1 ? index / (colors.length - 1) : 0;
                        gradient.addColorStop(stop, color);
                    });
                    ctx.fillStyle = gradient;
                    if (supportsPath2D) {
                        const path = getProjectilePath(projectile.width, projectile.height);
                        if (path) {
                            ctx.translate(projectile.x, projectile.y);
                            ctx.fill(path);
                        } else {
                            ctx.beginPath();
                            ctx.moveTo(projectile.x, projectile.y);
                            ctx.lineTo(projectile.x + projectile.width, projectile.y + projectile.height * 0.5);
                            ctx.lineTo(projectile.x, projectile.y + projectile.height);
                            ctx.closePath();
                            ctx.fill();
                        }
                    } else {
                        ctx.beginPath();
                        ctx.moveTo(projectile.x, projectile.y);
                        ctx.lineTo(projectile.x + projectile.width, projectile.y + projectile.height * 0.5);
                        ctx.lineTo(projectile.x, projectile.y + projectile.height);
                        ctx.closePath();
                        ctx.fill();
                    }
                }
                ctx.restore();
            }
        }
    }

    function drawEnemyProjectiles() {
        if (!enemyProjectiles.length) {
            return;
        }
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const projectile of enemyProjectiles) {
            const color = projectile.color ?? '#f87171';
            const gradient = ctx.createLinearGradient(
                projectile.x,
                projectile.y,
                projectile.x + projectile.width,
                projectile.y + projectile.height
            );
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            gradient.addColorStop(1, color);
            ctx.fillStyle = gradient;
            const radius = Math.min(8, Math.min(projectile.width, projectile.height) * 0.5);
            if (typeof ctx.roundRect === 'function') {
                ctx.beginPath();
                ctx.roundRect(projectile.x, projectile.y, projectile.width, projectile.height, radius);
                ctx.fill();
            } else {
                ctx.fillRect(projectile.x, projectile.y, projectile.width, projectile.height);
            }
        }
        ctx.restore();
    }

    function drawParticles() {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const particle of particles) {
            const alpha = clamp(particle.life * INV_PARTICLE_LIFE, 0, 1);
            ctx.globalAlpha = alpha;
            if (!particle.colorStyle) {
                particle.colorStyle = getParticleColorStyle(particle.color);
            }
            ctx.fillStyle = particle.colorStyle;
            ctx.beginPath();
            ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function stepNonRunning(delta) {
        updateCameraShake(delta);
        updateStars(delta);
        updateAsteroids(delta);
        updateParticles(delta);
        updateFloatingTexts(delta);
        updateAreaBursts(delta);
        updateVillainExplosions(delta);
        updateShieldEffects(delta);
        updateHyperBeam(delta);
        updatePumpTail(delta);
    }

    function stepRunning(delta) {
        state.elapsedTime += delta;
        const activeChallengeManager = getChallengeManager();
        if (activeChallengeManager) {
            activeChallengeManager.recordEvent('time', { totalMs: state.elapsedTime });
        }
        updateIntelLore(state.elapsedTime);
        storyManager.recordEvent('time', { totalMs: state.elapsedTime });
        state.gameSpeed += config.speedGrowth * getSpeedRampMultiplier() * (getScaledDelta(delta) / 1000);
        if (state.bossBattle.alertTimer > 0) {
            state.bossBattle.alertTimer = Math.max(0, state.bossBattle.alertTimer - delta);
        }

        const upcomingBoss = bossBattleDefinitions[state.bossBattle.nextEventIndex];
        if (upcomingBoss && !state.bossBattle.active && state.elapsedTime >= upcomingBoss.timeMs) {
            startBossBattle();
        }

        updateCameraShake(delta);
        updatePlayer(delta);
        updateProjectiles(delta);
        updateObstacles(delta);
        updateCollectibles(delta);
        updatePowerUps(delta);
        updateHyperBeam(delta);
        updateProjectilesCollisions();
        updateEnemyProjectiles(delta);
        updateStars(delta);
        updateAsteroids(delta);
        updateParticles(delta);
        updateFloatingTexts(delta);
        updateSpawns(delta);
        updatePowerUpTimers(delta);
        updatePumpTail(delta);
        updatePowerBomb(delta);
        updateShieldEffects(delta);
        updateAreaBursts(delta);
        updateVillainExplosions(delta);
        updateCombo(delta);
    }

    function renderFrame(timestamp) {
        drawBackground();
        ctx.save();
        ctx.translate(cameraShake.offsetX ?? 0, cameraShake.offsetY ?? 0);
        drawStars(timestamp);
        drawAsteroids(timestamp);
        drawTrail();
        drawCollectibles(timestamp);
        drawPowerUps(timestamp);
        drawAreaBursts();
        drawVillainExplosions();
        drawObstacles();
        drawHyperBeam(timestamp);
        drawProjectiles();
        drawEnemyProjectiles();
        drawParticles();
        drawPlayer();
        drawFloatingTexts();
        ctx.restore();
        drawBossAlert(timestamp);
    }

    let lastTime = null;
    let accumulatedDelta = 0;
    const FIXED_TIMESTEP = 1000 / 60; // Use a precise 60 Hz simulation step to avoid browser-specific rounding.
    const MAX_ACCUMULATED_TIME = FIXED_TIMESTEP * 6;

    function pauseGame({ reason = 'manual', showOverlay = true } = {}) {
        if (state.gameState !== 'running') {
            return false;
        }
        lastPauseReason = reason;
        state.gameState = 'paused';
        updateSwapPilotButton();
        updateSwapWeaponButtons();
        bodyElement?.classList.add('paused');
        survivalTimerEl?.classList.add('paused');
        audioManager.suspendForVisibilityChange();
        keys.clear();
        dashTapTracker.clear();
        resetVirtualControls();
        lastTime = null;
        accumulatedDelta = 0;
        if (showOverlay) {
            showPauseOverlay(reason);
        } else {
            hidePauseOverlay();
        }
        updateTimerDisplay();
        return true;
    }

    function resumeGame({ focusCanvas = true } = {}) {
        if (state.gameState !== 'paused') {
            return false;
        }
        state.gameState = 'running';
        updateSwapPilotButton();
        updateSwapWeaponButtons();
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        hidePauseOverlay();
        audioManager.resumeAfterVisibilityChange();
        lastTime = null;
        accumulatedDelta = 0;
        updateTimerDisplay();
        if (focusCanvas) {
            focusGameCanvas();
        }
        return true;
    }

    function togglePause(reason = 'manual') {
        if (state.gameState === 'running') {
            pauseGame({ reason });
        } else if (state.gameState === 'paused') {
            resumeGame();
        }
    }

    function monitorFramePerformance(timestamp) {
        if (!Number.isFinite(timestamp)) {
            return;
        }
        const monitor = performanceMonitor;
        if (state.gameState !== 'running') {
            monitor.samples.length = 0;
            monitor.sampleSum = 0;
            monitor.slowTimer = 0;
            monitor.recoveryTimer = 0;
            monitor.lastTimestamp = timestamp;
            return;
        }
        if (monitor.lastTimestamp !== null) {
            const rawDelta = Math.max(0, timestamp - monitor.lastTimestamp);
            const frameTime = Math.min(rawDelta, MAX_FRAME_SAMPLE_MS);
            monitor.samples.push(frameTime);
            monitor.sampleSum += frameTime;
            if (monitor.samples.length > PERFORMANCE_SAMPLE_SIZE) {
                const removed = monitor.samples.shift();
                if (typeof removed === 'number') {
                    monitor.sampleSum -= removed;
                }
            }
            const average = monitor.samples.length
                ? monitor.sampleSum / monitor.samples.length
                : frameTime;
            if (autoReducedEffectsEnabled) {
                if (average <= AUTO_REDUCED_EFFECTS_DISABLE_THRESHOLD) {
                    monitor.recoveryTimer += frameTime;
                    if (monitor.recoveryTimer >= AUTO_REDUCED_EFFECTS_RECOVERY_DURATION) {
                        monitor.recoveryTimer = 0;
                        monitor.slowTimer = 0;
                        if (applyReducedEffectsFlag(false, { source: 'auto' })) {
                            mascotAnnouncer.notifyPerformanceMode(false);
                        }
                    }
                } else {
                    monitor.recoveryTimer = 0;
                }
            } else if (!manualReducedEffectsEnabled) {
                if (average >= AUTO_REDUCED_EFFECTS_ENABLE_THRESHOLD && getTimestamp() >= monitor.cooldownUntil) {
                    monitor.slowTimer += frameTime;
                    if (monitor.slowTimer >= AUTO_REDUCED_EFFECTS_TRIGGER_DURATION) {
                        monitor.slowTimer = 0;
                        monitor.recoveryTimer = 0;
                        if (applyReducedEffectsFlag(true, { source: 'auto' })) {
                            mascotAnnouncer.notifyPerformanceMode(true);
                        }
                    }
                } else {
                    monitor.slowTimer = 0;
                }
            } else {
                monitor.slowTimer = 0;
                monitor.recoveryTimer = 0;
            }
        }
        monitor.lastTimestamp = timestamp;
    }

    function gameLoop(timestamp = performance.now()) {
        requestAnimationFrame(gameLoop);
        monitorFramePerformance(timestamp);

        updateGamepadInput();
        updateGamepadCursor(timestamp);

        if (state.gameState === 'ready') {
            stepNonRunning(FIXED_TIMESTEP);
            renderFrame(timestamp);
            updateHUD();
            updateTimerDisplay();
            lastTime = timestamp;
            accumulatedDelta = 0;
            return;
        }

        if (state.gameState === 'paused') {
            renderFrame(timestamp);
            updateHUD();
            updateTimerDisplay();
            lastTime = timestamp;
            accumulatedDelta = 0;
            return;
        }

        if (lastTime === null) {
            lastTime = timestamp;
        }

        let delta = timestamp - lastTime;
        lastTime = timestamp;

        if (delta > 200) {
            delta = 200;
        } else if (delta < 0) {
            delta = 0;
        }

        accumulatedDelta = Math.min(accumulatedDelta + delta, MAX_ACCUMULATED_TIME);

        while (accumulatedDelta >= FIXED_TIMESTEP) {
            if (state.gameState === 'running') {
                stepRunning(FIXED_TIMESTEP);
            } else {
                stepNonRunning(FIXED_TIMESTEP);
            }
            accumulatedDelta -= FIXED_TIMESTEP;
        }

        renderFrame(timestamp);
        updateHUD();
        updateTimerDisplay();
    }

    runCyborgLoadingSequence();
    createInitialStars();
    scheduleNextMeteorShower();
    requestAnimationFrame(gameLoop);
});

