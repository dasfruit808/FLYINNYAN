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

        const reset = ({ immediate = false } = {}) => {
            lastComboCelebrated = 0;
            lastSetbackAt = 0;
            lastShownAt = 0;
            hide({ immediate });
        };

        return {
            cheerForCombo,
            celebrateVictory,
            lamentSetback,
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
    const runSummaryRunsEl = document.getElementById('runSummaryRuns');
    const swapPilotButton = document.getElementById('swapPilotButton');
    const preflightSwapPilotButton = document.getElementById('preflightSwapPilotButton');
    const swapWeaponButton = document.getElementById('swapWeaponButton');
    const preflightSwapWeaponButton = document.getElementById('preflightSwapWeaponButton');
    const weaponSummaryName = document.getElementById('weaponSummaryName');
    const weaponSummaryDescription = document.getElementById('weaponSummaryDescription');
    const weaponSummaryImage = document.getElementById('weaponSummaryImage');
    const openWeaponSelectButton = document.getElementById('openWeaponSelectButton');
    const pilotPreviewGrid = document.getElementById('pilotPreviewGrid');
    const pilotPreviewDescription = document.getElementById('pilotPreviewDescription');
    const defaultPilotPreviewDescription =
        (pilotPreviewDescription?.textContent ?? '').trim() ||
        'Equip one of your saved presets instantly before launch. Manage the presets in the Custom Loadouts panel below.';
    const loadoutCreationPromptText =
        'No loadout equipped. Want to save your current pilot, suit, stream, and weapon as a preset before launch?';
    const shareButton = document.getElementById('shareButton');
    const shareStatusEl = document.getElementById('shareStatus');
    const socialFeedEl = document.getElementById('socialFeed');
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
    const instructionsEl = document.getElementById('instructions');
    const instructionPanelsEl = document.getElementById('instructionPanels');
    const instructionButtonBar = document.getElementById('instructionButtonBar');
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
                const verticalBleed = nextHeight * (config?.player?.verticalBleed ?? 0);
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
                const verticalBleed = nextHeight * (config?.player?.verticalBleed ?? 0);
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
            title.textContent = 'Telemetry Offline';
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
        socialFeed: 'nyanEscape.socialFeed',
        submissionLog: 'nyanEscape.submissionLog',
        loreProgress: 'nyanEscape.loreProgress',
        firstRunComplete: 'nyanEscape.firstRunComplete',
        settings: 'nyanEscape.settings',
        challenges: 'nyanEscape.challenges',
        deviceId: 'nyanEscape.deviceId',
        customLoadouts: 'nyanEscape.customLoadouts'
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

    function setActiveLoadoutId(slotId) {
        if (slotId && getCustomLoadout(slotId)) {
            activeLoadoutId = slotId;
        } else {
            activeLoadoutId = null;
        }
        updateActiveLoadoutPrompt();
    }

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

    function loadSocialFeed() {
        const raw = readStorage(STORAGE_KEYS.socialFeed);
        if (!raw) return [];
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch (error) {
            return [];
        }
    }

    function persistSocialFeed(entries) {
        if (!storageAvailable) return;
        writeStorage(STORAGE_KEYS.socialFeed, JSON.stringify(entries));
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
        return {
            version: CHALLENGE_STATE_VERSION,
            slots: {},
            history: [],
            cosmetics: createDefaultCosmeticsState()
        };
    }

    function sanitizeChallengeGoal(goal) {
        if (!goal || typeof goal !== 'object') {
            return { metric: 'score', target: 0, mode: 'sum' };
        }
        const metric = typeof goal.metric === 'string' ? goal.metric : 'score';
        const rawTarget = Number(goal.target);
        const target = Number.isFinite(rawTarget) && rawTarget > 0 ? rawTarget : 0;
        let mode = goal.mode === 'max' ? 'max' : 'sum';
        if (metric === 'time' || metric === 'score') {
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
            cosmetics: isPlainObject(raw.cosmetics) ? { ...raw.cosmetics } : createDefaultCosmeticsState()
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

    function computeRotationId(slot, date) {
        if (slot === 'weekly') {
            const week = getWeekIndex(date);
            return `${date.getFullYear()}-W${week}`;
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
        if (typeof reward.label === 'string' && reward.label) {
            return reward.label;
        }
        if (reward.type === 'cosmetic') {
            if (reward.category === 'skin') {
                return 'Hull skin unlock';
            }
            if (reward.category === 'trail') {
                return 'Trail effect unlock';
            }
            if (reward.category === 'weapon') {
                return 'Weapon system unlock';
            }
        }
        return 'Reward ready';
    }

    const CHALLENGE_DEFINITIONS = {
        daily: [
            {
                id: 'daily-survive-90',
                slot: 'daily',
                title: 'Hold the Lane',
                description: 'Survive 90 seconds in a single run.',
                goal: { metric: 'time', target: 90000, mode: 'max' },
                reward: { type: 'cosmetic', category: 'trail', id: 'aurora', label: 'Aurora Wake Trail' }
            },
            {
                id: 'daily-core-collector',
                slot: 'daily',
                title: 'Core Collector',
                description: 'Secure 5 power-ups in a day.',
                goal: { metric: 'powerUp', target: 5, mode: 'sum' },
                reward: { type: 'cosmetic', category: 'trail', id: 'ember', label: 'Ember Wake Trail' }
            }
        ],
        weekly: [
            {
                id: 'weekly-villain-hunter',
                slot: 'weekly',
                title: 'Villain Hunter',
                description: 'Neutralize 30 villains this week.',
                goal: { metric: 'villain', target: 30, mode: 'sum' },
                reward: { type: 'cosmetic', category: 'skin', id: 'midnight', label: 'Midnight Mirage Hull' }
            },
            {
                id: 'weekly-score-champion',
                slot: 'weekly',
                title: 'Score Champion',
                description: 'Reach 75,000 score in a single run.',
                goal: { metric: 'score', target: 75000, mode: 'max' },
                reward: { type: 'cosmetic', category: 'skin', id: 'sunrise', label: 'Sunrise Shimmer Hull' }
            }
        ]
    };

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
            const index = slot === 'weekly' ? getWeekIndex(date) : getDayIndex(date);
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
            return `${value} / ${target}`;
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
                    slotLabel: slotKey === 'daily' ? 'Daily' : slotKey === 'weekly' ? 'Weekly' : slotKey,
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
            snapshot.activeChallenges = computeActiveChallenges(snapshot);
            return snapshot;
        }

        function unlockReward(reward) {
            if (!reward || reward.type !== 'cosmetic') {
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
                mutated = true;
            } else if (category === 'trail') {
                if (!state.cosmetics.ownedTrails.includes(id) || state.cosmetics.equipped.trail === id) {
                    return false;
                }
                if (cosmetics?.trails && !cosmetics.trails[id]) {
                    return false;
                }
                state.cosmetics.equipped.trail = id;
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
            subscribe,
            getSnapshot: () => cachedSnapshot
        };
    }

    function applyReducedEffectsFlag(enabled) {
        reducedEffectsMode = Boolean(enabled);
        if (bodyElement) {
            bodyElement.classList.toggle('reduced-effects', reducedEffectsMode);
        }
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
        if (reducedEffectsStatus) {
            reducedEffectsStatus.textContent = settingsState.reducedEffects ? 'On' : 'Off';
        }
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
        applyReducedEffectsFlag(settingsState.reducedEffects);
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

    let highScoreData = loadHighScores();
    let playerName = loadStoredPlayerName();
    if (!highScoreData[playerName]) {
        highScoreData[playerName] = [];
    }
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
    let socialFeedData = loadSocialFeed();
    const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
    let lastRunSummary = null;
    let pendingSubmission = null;
    let preflightOverlayDismissed = false;
    let preflightReady = false;
    let tutorialFlightActive = false;
    let tutorialCallsign = null;
    let activeSummaryTab = summarySections.has('run') ? 'run' : summarySections.keys().next().value ?? null;
    let lastPauseReason = 'manual';
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

    if (API_CONFIG.baseUrl) {
        refreshLeaderboardsFromApi({ force: true });
    } else {
        setLeaderboardStatus(
            'Leaderboard sync unavailable — set NYAN_ESCAPE_API_BASE_URL to enable syncing.',
            'warning'
        );
    }

    if (typeof window !== 'undefined') {
        window.addEventListener('online', () => {
            if (API_CONFIG.baseUrl) {
                refreshLeaderboardsFromApi({ force: true });
            }
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

    function updateTimerDisplay() {
        if (!timerValueEl) return;
        const base = formatTime(state.elapsedTime);
        const displayValue = state.gameState === 'paused' ? `${base} ⏸` : base;
        if (displayValue !== lastFormattedTimer) {
            lastFormattedTimer = displayValue;
            timerValueEl.textContent = displayValue;
        } else if (timerValueEl.textContent !== displayValue) {
            timerValueEl.textContent = displayValue;
        }
        if (survivalTimerEl) {
            survivalTimerEl.classList.toggle('paused', state.gameState === 'paused');
        }
    }

    async function recordHighScore(durationMs, score, metadata = {}) {
        const baseName = sanitizePlayerName(metadata.player) || playerName;
        if (!baseName || durationMs <= 0) {
            return { recorded: false, placement: null, runsToday: 0, reason: 'invalid' };
        }
        ensureSubmissionLogEntry(baseName);
        if (!highScoreData[baseName]) {
            highScoreData[baseName] = [];
        }
        const recordedAt = metadata.recordedAt ?? Date.now();
        const usage = getSubmissionUsage(baseName, recordedAt);
        if (usage.count >= SUBMISSION_LIMIT) {
            return { recorded: false, placement: null, runsToday: usage.count, reason: 'limit' };
        }
        const entry = {
            timeMs: durationMs,
            score,
            recordedAt,
            bestStreak: metadata.bestStreak ?? 0,
            nyan: metadata.nyan ?? 0
        };
        const userScores = highScoreData[baseName] ? [...highScoreData[baseName]] : [];
        userScores.push(entry);
        userScores.sort((a, b) => {
            if (b.timeMs !== a.timeMs) return b.timeMs - a.timeMs;
            if (b.score !== a.score) return b.score - a.score;
            return b.recordedAt - a.recordedAt;
        });
        highScoreData[baseName] = userScores.slice(0, 3);
        persistHighScores(highScoreData);

        let runsToday = usage.count;
        let placement = null;
        let reason = null;
        let message = null;
        let source = 'remote';
        let recorded = false;

        const deviceId = getDeviceIdentifier();
        const submissionPayload = {
            playerName: baseName,
            deviceId,
            score: entry.score,
            timeMs: entry.timeMs,
            bestStreak: entry.bestStreak,
            nyan: entry.nyan,
            recordedAt: entry.recordedAt,
            clientSubmissionId: `${deviceId}:${entry.recordedAt}:${Math.max(0, Math.floor(entry.score))}`
        };

        const apiResult = await submitScoreToApi(submissionPayload);
        if (apiResult?.success) {
            recorded = true;
            placement = apiResult.placement ?? null;
            reason = null;
            message = apiResult.message ?? null;
            if (apiResult.leaderboards) {
                applyLeaderboardSnapshot(apiResult.leaderboards, { source: 'remote', persist: true, error: null });
            } else {
                await refreshLeaderboardsFromApi({ force: true });
            }
            runsToday = trackSubmissionUsage(baseName, recordedAt);
        } else if (apiResult?.reason === 'conflict') {
            recorded = false;
            source = 'remote';
            reason = 'conflict';
            placement = apiResult.placement ?? null;
            message = apiResult.message ?? 'Existing submission already recorded for this device.';
            if (apiResult.leaderboards) {
                applyLeaderboardSnapshot(apiResult.leaderboards, { source: 'remote', persist: true, error: null });
            } else {
                await refreshLeaderboardsFromApi({ force: true });
            }
            setLeaderboardStatus(message, 'warning');
        } else if (apiResult?.reason === 'rateLimit' || apiResult?.reason === 'validation') {
            recorded = false;
            source = 'remote';
            reason = apiResult.reason;
            message = apiResult.message ?? 'Submission rejected by the leaderboard service.';
            setLeaderboardStatus(message, 'error');
        } else if (apiResult?.reason === 'auth') {
            recorded = false;
            source = 'remote';
            reason = 'auth';
            message = apiResult.message ?? 'Run session expired. Retry the submission.';
            setLeaderboardStatus(message, 'error');
        } else if (apiResult?.reason === 'server') {
            recorded = false;
            source = 'remote';
            reason = 'server';
            message = apiResult.message ?? 'Leaderboard service rejected the submission. Try again shortly.';
            setLeaderboardStatus(message, 'error');
        } else {
            recorded = true;
            source = 'offline';
            reason = apiResult?.reason ?? 'offline';
            message = apiResult?.message ?? 'Unable to reach leaderboard service. Stored locally.';
            placement = recordLeaderboardEntry({
                player: baseName,
                timeMs: entry.timeMs,
                score: entry.score,
                bestStreak: entry.bestStreak,
                nyan: entry.nyan,
                recordedAt: entry.recordedAt
            });
            runsToday = trackSubmissionUsage(baseName, recordedAt);
        }

        return { recorded, placement, runsToday, reason, message, source };
    }

    function renderHighScorePanelForName(name) {
        if (!highScoreListEl || !highScoreTitleEl) return;
        highScoreTitleEl.textContent = `Top Flight Times — ${name}`;
        highScoreListEl.innerHTML = '';
        const entries = highScoreData[name] ?? [];
        if (!entries.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'empty';
            emptyItem.textContent = 'No recorded runs yet. Survive to set a record!';
            highScoreListEl.appendChild(emptyItem);
            return;
        }
        for (const entry of entries) {
            const item = document.createElement('li');
            const timeSpan = document.createElement('span');
            timeSpan.className = 'time';
            timeSpan.textContent = formatTime(entry.timeMs);
            const scoreSpan = document.createElement('span');
            scoreSpan.className = 'score';
            scoreSpan.textContent = ` — ${entry.score.toLocaleString()} pts`;
            item.appendChild(timeSpan);
            item.appendChild(scoreSpan);
            highScoreListEl.appendChild(item);
        }
    }

    function updateHighScorePanel() {
        renderHighScorePanelForName(playerName);
    }

    function setRunSummaryStatus(message, type = 'info') {
        if (!runSummaryStatusEl) {
            return;
        }
        runSummaryStatusEl.textContent = message ?? '';
        runSummaryStatusEl.className = 'summary-status';
        if (type && type !== 'info') {
            runSummaryStatusEl.classList.add(type);
        }
    }

    function updateRunSummaryOverview() {
        if (runSummaryTimeEl) {
            runSummaryTimeEl.textContent = lastRunSummary ? formatTime(lastRunSummary.timeMs) : '—';
        }
        if (runSummaryScoreEl) {
            runSummaryScoreEl.textContent = lastRunSummary
                ? `${lastRunSummary.score.toLocaleString()} pts`
                : '—';
        }
        if (runSummaryStreakEl) {
            const streakValue = lastRunSummary ? Math.max(0, lastRunSummary.bestStreak ?? 0) : null;
            runSummaryStreakEl.textContent = streakValue != null ? `x${streakValue}` : '—';
        }
        if (runSummaryNyanEl) {
            const pickups = lastRunSummary ? Math.max(0, lastRunSummary.nyan ?? 0) : null;
            runSummaryNyanEl.textContent = pickups != null ? pickups.toLocaleString() : '—';
        }
        if (runSummaryRunsEl) {
            const used = lastRunSummary ? Math.min(lastRunSummary.runsToday ?? 0, SUBMISSION_LIMIT) : 0;
            runSummaryRunsEl.textContent = `Logs today: ${used}/${SUBMISSION_LIMIT}`;
        }
        if (runSummaryPlacementEl) {
            let placementText = '';
            if (!lastRunSummary) {
                placementText = '';
            } else if (typeof lastRunSummary.placement === 'number' && lastRunSummary.placement > 0) {
                placementText = `Placement: #${lastRunSummary.placement}`;
            } else if (lastRunSummary.reason === 'pending') {
                placementText = 'Placement pending submission';
            } else if (lastRunSummary.reason === 'limit') {
                placementText = 'Placement unchanged (daily limit)';
            } else if (lastRunSummary.reason === 'skipped') {
                placementText = 'Placement not submitted';
            } else if (lastRunSummary.reason === 'conflict') {
                placementText = 'Placement held by stronger run';
            } else if (lastRunSummary.reason === 'offline') {
                placementText = 'Placement offline (sync later)';
            } else {
                placementText = '';
            }
            runSummaryPlacementEl.textContent = placementText;
        }

        if (!lastRunSummary) {
            setRunSummaryStatus('Survive a flight to log fresh telemetry.');
            return;
        }

        if (lastRunSummary.reason === 'pending') {
            setRunSummaryStatus('Submission pending. Log the run or skip to continue.');
            return;
        }

        if (lastRunSummary.recorded) {
            setRunSummaryStatus('Flight log transmitted successfully!', 'success');
            return;
        }

        switch (lastRunSummary.reason) {
            case 'limit':
                setRunSummaryStatus('Daily log limit reached. Fly again tomorrow or share manually.', 'warning');
                break;
            case 'skipped':
                setRunSummaryStatus('Run skipped. Fly again when you are ready.', 'info');
                break;
            case 'conflict':
                setRunSummaryStatus('Stronger flight already recorded. Beat it to climb the board.', 'warning');
                break;
            case 'error':
            case 'server':
            case 'auth':
                setRunSummaryStatus('Submission hit turbulence. Retry shortly.', 'error');
                break;
            case 'offline':
                setRunSummaryStatus('Flight stored locally. Connect to sync your rank.', 'warning');
                break;
            default:
                setRunSummaryStatus('Flight log saved. Reconnect to update the board.');
                break;
        }
    }

    function refreshOverlayLaunchButton() {
        if (!overlayButton || overlayButton.disabled) {
            return;
        }
        const mode = overlayButton.dataset.launchMode;
        if (!mode) {
            return;
        }
        const pendingName = getPendingPlayerName();
        if (mode === 'prepare') {
            overlayButton.textContent = `Confirm Callsign: ${pendingName}`;
            return;
        }
        if (mode !== 'launch' && mode !== 'retry') {
            return;
        }
        const prefix = mode === 'retry' ? 'Retry as' : 'Launch as';
        overlayButton.textContent = `${prefix} ${pendingName}`;
    }

    function refreshHighScorePreview() {
        if (!overlay || overlay.classList.contains('hidden')) {
            updateHighScorePanel();
            return;
        }
        renderHighScorePanelForName(getPendingPlayerName());
    }

    function updateLeaderboardPanel() {
        if (!leaderboardListEl) return;
        refreshLeaderboardTabState();
        leaderboardEntries = getLeaderboardEntriesForScope(activeLeaderboardScope);
        if (leaderboardTitleEl) {
            leaderboardTitleEl.textContent =
                activeLeaderboardScope === 'weekly' ? 'Weekly Standings' : 'Galaxy Standings';
        }
        leaderboardListEl.innerHTML = '';
        if (!leaderboardEntries.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent =
                activeLeaderboardScope === 'weekly'
                    ? 'No weekly standings yet. Finish a run this week to seed the board!'
                    : 'No galaxy standings yet. Finish a run to seed the board!';
            leaderboardListEl.appendChild(empty);
            return;
        }

        leaderboardEntries.forEach((entry) => {
            const item = document.createElement('li');
            const main = document.createElement('span');
            main.textContent = `${entry.player} — ${entry.score.toLocaleString()} pts`;
            const meta = document.createElement('span');
            meta.className = 'meta';
            const streakText = entry.bestStreak ? ` • x${entry.bestStreak} streak` : '';
            meta.textContent = `${formatTime(entry.timeMs)}${streakText}`;
            item.appendChild(main);
            item.appendChild(meta);
            leaderboardListEl.appendChild(item);
        });
    }

    function updateSocialFeedPanel() {
        if (!socialFeedEl) return;
        socialFeedEl.innerHTML = '';
        if (!socialFeedData.length) {
            const empty = document.createElement('li');
            empty.className = 'empty';
            empty.textContent = 'Complete missions to broadcast your squadron exploits.';
            socialFeedEl.appendChild(empty);
            return;
        }

        const visibleEntries = socialFeedData.slice(0, 8);
        for (const entry of visibleEntries) {
            const item = document.createElement('li');
            const entryType = entry.type === 'run' ? 'score' : entry.type;
            if (entryType) {
                item.classList.add(`type-${entryType}`);
            }
            const textSpan = document.createElement('span');
            textSpan.textContent = entry.message;
            const timeSpan = document.createElement('span');
            timeSpan.className = 'timestamp';
            timeSpan.textContent = formatRelativeTime(entry.timestamp);
            item.appendChild(textSpan);
            item.appendChild(timeSpan);
            socialFeedEl.appendChild(item);
        }
    }

    function addSocialMoment(message, { type = 'score', timestamp = Date.now() } = {}) {
        if (!message) return;
        socialFeedData.unshift({ message, type, timestamp });
        const limit = 12;
        socialFeedData = socialFeedData.slice(0, limit);
        persistSocialFeed(socialFeedData);
        updateSocialFeedPanel();
    }

    function getLeaderboardEntriesForScope(scope = activeLeaderboardScope) {
        const normalized = scope === 'weekly' ? 'weekly' : 'global';
        return leaderboardState.scopes[normalized] ?? [];
    }

    function refreshLeaderboardTabState() {
        if (!Array.isArray(leaderboardTabButtons) || !leaderboardTabButtons.length) {
            return;
        }
        leaderboardTabButtons.forEach((button) => {
            const scope = button?.dataset?.leaderboardScope === 'weekly' ? 'weekly' : 'global';
            const isActive = scope === activeLeaderboardScope;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    function setLeaderboardStatus(message, type = 'info') {
        leaderboardStatusState.message = message ?? '';
        leaderboardStatusState.type = type ?? 'info';
        if (!leaderboardStatusEl) {
            return;
        }
        const statusTypes = ['success', 'error', 'warning', 'loading', 'info'];
        leaderboardStatusEl.classList.remove(...statusTypes);
        if (!message) {
            leaderboardStatusEl.textContent = '';
            leaderboardStatusEl.hidden = true;
            return;
        }
        leaderboardStatusEl.hidden = false;
        leaderboardStatusEl.textContent = message;
        if (type && statusTypes.includes(type)) {
            leaderboardStatusEl.classList.add(type);
        } else {
            leaderboardStatusEl.classList.add('info');
        }
    }

    function updateLeaderboardStatus() {
        const entries = getLeaderboardEntriesForScope();
        if (!entries.length && (!leaderboardState.fetchedAt || leaderboardState.source === 'empty')) {
            setLeaderboardStatus('', 'info');
            return;
        }
        const scopeLabel = activeLeaderboardScope === 'weekly' ? 'Weekly' : 'Global';
        if (!leaderboardState.fetchedAt) {
            setLeaderboardStatus(`${scopeLabel} standings ready.`, 'info');
            return;
        }
        const relative = formatRelativeTime(leaderboardState.fetchedAt);
        if (leaderboardState.source === 'remote') {
            const text = relative === 'Just now' ? 'just now' : relative;
            setLeaderboardStatus(`${scopeLabel} standings synced ${text}.`, 'success');
            return;
        }
        if (leaderboardState.source === 'offline') {
            setLeaderboardStatus(
                `${scopeLabel} standings stored offline — last sync ${relative}.`,
                'warning'
            );
            return;
        }
        setLeaderboardStatus(`${scopeLabel} standings cached — last sync ${relative}.`, 'info');
    }

    function setActiveLeaderboardScope(scope) {
        const normalized = scope === 'weekly' ? 'weekly' : 'global';
        activeLeaderboardScope = normalized;
        leaderboardEntries = getLeaderboardEntriesForScope(normalized);
        refreshLeaderboardTabState();
        updateLeaderboardPanel();
        updateLeaderboardStatus();
    }

    function applyLeaderboardSnapshot(snapshot, { source = 'cache', persist = true, error = null } = {}) {
        const sanitized = sanitizeLeaderboardSnapshot(snapshot);
        leaderboardState.scopes.global = sanitized.global;
        leaderboardState.scopes.weekly = sanitized.weekly;
        leaderboardState.fetchedAt = sanitized.fetchedAt;
        leaderboardState.source = source;
        leaderboardState.error = error ?? null;
        if (persist) {
            persistLeaderboard({
                global: leaderboardState.scopes.global,
                weekly: leaderboardState.scopes.weekly,
                fetchedAt: leaderboardState.fetchedAt
            });
        }
        if (
            activeLeaderboardScope === 'weekly' &&
            !leaderboardState.scopes.weekly.length &&
            leaderboardState.scopes.global.length
        ) {
            activeLeaderboardScope = 'global';
        }
        leaderboardEntries = getLeaderboardEntriesForScope(activeLeaderboardScope);
        refreshLeaderboardTabState();
        updateLeaderboardPanel();
        updateLeaderboardStatus();
    }

    function recordLeaderboardEntry(entry, { scope = 'global', persist = true } = {}) {
        if (!entry || !entry.player) return null;
        const normalized = {
            player: sanitizePlayerName(entry.player) || DEFAULT_PLAYER_NAME,
            timeMs: Number.isFinite(entry.timeMs) ? Math.max(0, Math.floor(entry.timeMs)) : 0,
            score: Number.isFinite(entry.score) ? Math.max(0, Math.floor(entry.score)) : 0,
            bestStreak: Number.isFinite(entry.bestStreak) ? Math.max(0, Math.floor(entry.bestStreak)) : 0,
            nyan: Number.isFinite(entry.nyan) ? Math.max(0, Math.floor(entry.nyan)) : 0,
            recordedAt: Number.isFinite(entry.recordedAt) ? entry.recordedAt : Date.now()
        };
        const targetScope = scope === 'weekly' ? 'weekly' : 'global';
        const entries = [...getLeaderboardEntriesForScope(targetScope), normalized];
        entries.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.timeMs !== a.timeMs) return b.timeMs - a.timeMs;
            return a.recordedAt - b.recordedAt;
        });
        const limit = 7;
        const placementIndex = entries.indexOf(normalized);
        const trimmed = entries.slice(0, limit);
        leaderboardState.scopes[targetScope] = trimmed;
        if (targetScope === 'global' && !leaderboardState.scopes.weekly.length) {
            leaderboardState.scopes.weekly = trimmed;
        }
        leaderboardState.fetchedAt = Date.now();
        leaderboardState.source = 'offline';
        leaderboardState.error = null;
        if (persist) {
            persistLeaderboard({
                global: leaderboardState.scopes.global,
                weekly: leaderboardState.scopes.weekly,
                fetchedAt: leaderboardState.fetchedAt
            });
        }
        leaderboardEntries = getLeaderboardEntriesForScope(activeLeaderboardScope);
        refreshLeaderboardTabState();
        updateLeaderboardPanel();
        updateLeaderboardStatus();
        setLeaderboardStatus('Offline — storing standings locally until sync resumes.', 'warning');
        if (placementIndex >= 0 && placementIndex < limit) {
            return placementIndex + 1;
        }
        return null;
    }

    async function refreshLeaderboardsFromApi({ force = false } = {}) {
        if (!API_CONFIG.baseUrl) {
            return null;
        }
        if (leaderboardFetchPromise) {
            return leaderboardFetchPromise;
        }
        const now = Date.now();
        if (
            !force &&
            leaderboardState.source === 'remote' &&
            leaderboardState.fetchedAt &&
            now - leaderboardState.fetchedAt < API_CONFIG.cacheTtlMs
        ) {
            return null;
        }
        const endpoint = buildApiUrl('leaderboards');
        if (!endpoint) {
            return null;
        }
        const url = new URL(endpoint);
        url.searchParams.set('scopes', API_CONFIG.scopes.join(','));
        leaderboardFetchPromise = (async () => {
            try {
                setLeaderboardStatus('Syncing standings…', 'loading');
                const response = await fetchWithTimeout(url.toString(), {
                    method: 'GET',
                    headers: { Accept: 'application/json' }
                });
                const payload = await parseJsonSafely(response);
                if (!response.ok) {
                    throw new Error(payload?.error || `Leaderboard request failed (${response.status})`);
                }
                const snapshot = sanitizeLeaderboardSnapshot(payload?.leaderboards ?? payload ?? {});
                applyLeaderboardSnapshot(snapshot, { source: 'remote', persist: true, error: null });
                return snapshot;
            } catch (error) {
                console.error('Failed to refresh leaderboard', error);
                leaderboardState.error = error;
                if (!leaderboardState.scopes.global.length && !leaderboardState.scopes.weekly.length) {
                    setLeaderboardStatus('Unable to reach leaderboard server.', 'error');
                } else {
                    setLeaderboardStatus('Offline — showing last known standings.', 'warning');
                }
                return null;
            } finally {
                leaderboardFetchPromise = null;
            }
        })();
        return leaderboardFetchPromise;
    }

    async function submitScoreToApi(payload) {
        const endpoint = buildApiUrl('scores');
        if (!endpoint) {
            return {
                success: false,
                reason: 'unconfigured',
                placement: null,
                leaderboards: null,
                message: 'Leaderboard sync not configured.'
            };
        }

        let tokenInfo;
        try {
            tokenInfo = await ensureRunToken();
        } catch (error) {
            if (error?.code === 'unconfigured') {
                return {
                    success: false,
                    reason: 'unconfigured',
                    placement: null,
                    leaderboards: null,
                    message: 'Leaderboard sync not configured.'
                };
            }
            const reason =
                error?.code === 'timeout'
                    ? 'timeout'
                    : error?.code === 'network'
                        ? 'network'
                        : 'server';
            const fallbackMessage =
                reason === 'timeout'
                    ? 'Run session request timed out. Saving locally.'
                    : reason === 'network'
                        ? 'Unable to prepare run session. Saving locally.'
                        : 'Run session request failed. Try again shortly.';
            return {
                success: false,
                reason,
                placement: null,
                leaderboards: null,
                message: error?.message || fallbackMessage
            };
        }

        const submitWithToken = async (runTokenValue) => {
            const requestBody = { ...payload, runToken: runTokenValue };
            let response;
            try {
                response = await fetchWithTimeout(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    body: JSON.stringify(requestBody)
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
            const snapshot = data?.leaderboards ? sanitizeLeaderboardSnapshot(data.leaderboards) : null;
            return { response, data, snapshot };
        };

        try {
            let { response, data, snapshot } = await submitWithToken(tokenInfo.token);
            if (response.status === 401) {
                try {
                    const refreshed = await ensureRunToken({ forceRefresh: true });
                    ({ response, data, snapshot } = await submitWithToken(refreshed.token));
                } catch (error) {
                    const reason =
                        error?.code === 'timeout'
                            ? 'timeout'
                            : error?.code === 'network'
                                ? 'network'
                                : 'auth';
                    const message =
                        error?.message ||
                        data?.message ||
                        data?.error ||
                        (reason === 'timeout'
                            ? 'Run session refresh timed out. Saving locally.'
                            : reason === 'network'
                                ? 'Run session refresh failed. Saving locally.'
                                : 'Run session expired. Retry the submission.');
                    return {
                        success: false,
                        reason,
                        placement: null,
                        leaderboards: snapshot,
                        message
                    };
                }
            }

            if (response.ok) {
                return {
                    success: true,
                    placement: Number.isFinite(data?.placement) ? Number(data.placement) : null,
                    leaderboards: snapshot,
                    reason: null,
                    message: data?.message ?? null
                };
            }

            const errorMessage = data?.message || data?.error || 'Unable to submit score.';
            if (response.status === 409) {
                return {
                    success: false,
                    reason: 'conflict',
                    placement: Number.isFinite(data?.placement) ? Number(data.placement) : null,
                    leaderboards: snapshot,
                    message: errorMessage
                };
            }
            if (response.status === 429) {
                return {
                    success: false,
                    reason: 'rateLimit',
                    placement: null,
                    leaderboards: snapshot,
                    message: errorMessage
                };
            }
            if (response.status === 400) {
                return {
                    success: false,
                    reason: 'validation',
                    placement: null,
                    leaderboards: snapshot,
                    message: errorMessage
                };
            }
            if (response.status === 401) {
                return {
                    success: false,
                    reason: 'auth',
                    placement: Number.isFinite(data?.placement) ? Number(data.placement) : null,
                    leaderboards: snapshot,
                    message: errorMessage
                };
            }
            return {
                success: false,
                reason: 'server',
                placement: Number.isFinite(data?.placement) ? Number(data.placement) : null,
                leaderboards: snapshot,
                message: errorMessage
            };
        } catch (error) {
            const reason =
                error?.code === 'timeout' || error?.name === 'AbortError'
                    ? 'timeout'
                    : 'network';
            const message =
                reason === 'timeout'
                    ? 'Leaderboard service timed out. Saving locally.'
                    : 'Unable to reach leaderboard service. Saving locally.';
            return {
                success: false,
                reason,
                placement: null,
                leaderboards: null,
                message
            };
        } finally {
            invalidateRunToken();
        }
    }

    function applyEquippedCosmetics(equipped = {}) {
        lastEquippedCosmetics = equipped && typeof equipped === 'object' ? { ...equipped } : {};
        const skinId =
            equipped && typeof equipped.skin === 'string' && playerSkins[equipped.skin]
                ? equipped.skin
                : 'default';
        const trailId =
            equipped && typeof equipped.trail === 'string' && trailStyles[equipped.trail]
                ? equipped.trail
                : 'rainbow';
        const weaponId =
            equipped && typeof equipped.weapon === 'string' && weaponLoadouts[equipped.weapon]
                ? equipped.weapon
                : 'pulse';
        const baseImage = selectedCharacterImage ?? playerBaseImage;
        if (skinId === 'default') {
            activePlayerImage = baseImage;
        } else {
            activePlayerImage = playerSkins[skinId]?.image ?? baseImage;
        }
        activeTrailStyle = trailStyles[trailId] ?? trailStyles.rainbow;
        activeWeaponLoadout = weaponLoadouts[weaponId] ?? weaponLoadouts.pulse;
        if (weaponId !== activeWeaponId) {
            activeWeaponId = weaponId;
            pendingWeaponId = weaponId;
            resetWeaponPatternState(weaponId);
        }
        refreshWeaponSelectionDisplay();
        syncActiveLoadoutState();
        renderCustomLoadouts(latestCosmeticSnapshot);
    }

    function renderChallengeList(snapshot = {}) {
        if (!challengeListEl) {
            return;
        }
        challengeListEl.innerHTML = '';
        const activeChallenges = Array.isArray(snapshot.activeChallenges) ? snapshot.activeChallenges : [];
        if (!activeChallenges.length) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'challenge-item';
            const message = document.createElement('p');
            message.className = 'challenge-description';
            message.textContent = 'Challenges are calibrating. Check back soon!';
            emptyItem.appendChild(message);
            challengeListEl.appendChild(emptyItem);
            return;
        }
        for (const challenge of activeChallenges) {
            const item = document.createElement('li');
            item.className = 'challenge-item';
            if (challenge?.id) {
                item.dataset.challengeId = challenge.id;
            }

            const heading = document.createElement('div');
            heading.className = 'challenge-heading';
            const title = document.createElement('h4');
            title.className = 'challenge-title';
            const slotLabel = challenge?.slotLabel ?? 'Challenge';
            title.textContent = `${slotLabel}: ${challenge?.title ?? 'Objective'}`;
            heading.appendChild(title);
            if (challenge?.timeRemainingLabel) {
                const reset = document.createElement('span');
                reset.className = 'challenge-reset';
                reset.textContent = challenge.timeRemainingLabel;
                heading.appendChild(reset);
            }
            item.appendChild(heading);

            if (challenge?.description) {
                const description = document.createElement('p');
                description.className = 'challenge-description';
                description.textContent = challenge.description;
                item.appendChild(description);
            }

            const progress = document.createElement('div');
            progress.className = 'challenge-progress';
            const track = document.createElement('div');
            track.className = 'challenge-progress-track';
            const fill = document.createElement('div');
            fill.className = 'challenge-progress-fill';
            const percent = Math.min(100, Math.max(0, challenge?.progressPercent ?? 0));
            fill.style.width = `${percent}%`;
            track.appendChild(fill);
            progress.appendChild(track);
            const label = document.createElement('div');
            label.className = 'challenge-progress-label';
            const progressText = document.createElement('span');
            progressText.textContent = challenge?.progressText ?? '';
            label.appendChild(progressText);
            const percentText = document.createElement('span');
            percentText.textContent = `${percent}%`;
            label.appendChild(percentText);
            progress.appendChild(label);
            item.appendChild(progress);

            const meta = document.createElement('div');
            meta.className = 'challenge-meta';
            const reward = document.createElement('span');
            reward.textContent = `Reward: ${challenge?.rewardLabel ?? '—'}`;
            meta.appendChild(reward);
            const status = document.createElement('span');
            status.className = 'challenge-status';
            status.textContent = challenge?.statusText ?? '';
            meta.appendChild(status);
            item.appendChild(meta);

            const claimButton = document.createElement('button');
            claimButton.type = 'button';
            claimButton.className = 'challenge-claim';
            if (challenge?.id) {
                claimButton.dataset.challengeId = challenge.id;
            }
            claimButton.textContent = challenge?.buttonLabel ?? 'Claim Reward';
            if (!challenge?.readyToClaim || challenge?.claimed) {
                claimButton.disabled = true;
            }
            item.appendChild(claimButton);

            challengeListEl.appendChild(item);
        }
    }

    function renderCosmeticOptions(snapshot = {}) {
        if (snapshot && typeof snapshot === 'object') {
            latestCosmeticSnapshot = snapshot;
        }
        const cosmetics = snapshot?.cosmetics ?? {};
        const ownedSkins = new Set(Array.isArray(cosmetics.ownedSkins) ? cosmetics.ownedSkins : []);
        const ownedTrails = new Set(Array.isArray(cosmetics.ownedTrails) ? cosmetics.ownedTrails : []);
        const equipped = cosmetics.equipped ?? {};

        const escapeAttributeValue = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(value);
            }
            return value.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
        };

        const toDataAttributeName = (datasetKey) => datasetKey.replace(/([A-Z])/g, '-$1').toLowerCase();

        const renderCosmeticGroup = (
            container,
            items,
            { datasetKey, ownedSet, equippedId, getLockedTitle, getUnlockedTitle }
        ) => {
            if (!container || !Array.isArray(items) || !items.length) {
                return;
            }

            container.setAttribute('role', 'radiogroup');

            const attributeName = toDataAttributeName(datasetKey);
            const activeElement =
                document.activeElement instanceof HTMLElement && container.contains(document.activeElement)
                    ? document.activeElement
                    : null;
            const activeValue = activeElement?.dataset?.[datasetKey] ?? null;

            container.innerHTML = '';

            const fragment = document.createDocumentFragment();

            for (const item of items) {
                if (!item || typeof item.id !== 'string') {
                    continue;
                }

                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'cosmetic-option';
                button.dataset[datasetKey] = item.id;
                button.textContent = item.label ?? item.id;
                button.setAttribute('role', 'radio');

                const owned = ownedSet.has(item.id);
                if (!owned) {
                    button.disabled = true;
                    button.classList.add('locked');
                    const lockedTitle =
                        typeof getLockedTitle === 'function'
                            ? getLockedTitle(item)
                            : item.description
                                ? `${item.description} — Unlock by completing challenges`
                                : 'Unlock by completing challenges';
                    if (lockedTitle) {
                        button.setAttribute('title', lockedTitle);
                    } else {
                        button.removeAttribute('title');
                    }
                } else {
                    const unlockedTitle =
                        typeof getUnlockedTitle === 'function'
                            ? getUnlockedTitle(item)
                            : item.description ?? '';
                    if (unlockedTitle) {
                        button.setAttribute('title', unlockedTitle);
                    } else {
                        button.removeAttribute('title');
                    }
                }

                const isEquipped = equippedId === item.id;
                button.classList.toggle('equipped', isEquipped);
                button.setAttribute('aria-pressed', isEquipped ? 'true' : 'false');
                button.setAttribute('aria-checked', isEquipped ? 'true' : 'false');

                fragment.appendChild(button);
            }

            container.appendChild(fragment);

            if (activeValue) {
                const selectorValue = escapeAttributeValue(activeValue);
                if (selectorValue) {
                    const nextActive = container.querySelector(
                        `[data-${attributeName}="${selectorValue}"]`
                    );
                    if (nextActive instanceof HTMLElement) {
                        try {
                            nextActive.focus({ preventScroll: true });
                        } catch {
                            nextActive.focus();
                        }
                    }
                }
            }
        };

        if (skinOptionsEl) {
            const skinOrder = ['default', 'midnight', 'sunrise'];
            const items = skinOrder
                .map((skinId) => playerSkins[skinId])
                .filter((skin) => Boolean(skin));
            renderCosmeticGroup(skinOptionsEl, items, {
                datasetKey: 'skinId',
                ownedSet: ownedSkins,
                equippedId: equipped?.skin,
                getLockedTitle: () => 'Unlock by completing challenges',
                getUnlockedTitle: () => ''
            });
        }

        if (trailOptionsEl) {
            const trailOrder = ['rainbow', 'aurora', 'ember'];
            const items = trailOrder
                .map((trailId) => trailStyles[trailId])
                .filter((trail) => Boolean(trail));
            renderCosmeticGroup(trailOptionsEl, items, {
                datasetKey: 'trailId',
                ownedSet: ownedTrails,
                equippedId: equipped?.trail,
                getLockedTitle: () => 'Unlock by completing challenges',
                getUnlockedTitle: () => ''
            });
        }

        if (equipped?.weapon) {
            if (equipped.weapon !== activeWeaponId) {
                activeWeaponId = equipped.weapon;
                pendingWeaponId = equipped.weapon;
                resetWeaponPatternState(equipped.weapon);
                refreshWeaponSelectionDisplay();
            } else if (isWeaponSelectOpen()) {
                refreshWeaponSelectionDisplay();
            }
        } else {
            refreshWeaponSelectionDisplay();
        }
        syncActiveLoadoutState();
        renderCustomLoadouts(snapshot);
    }

    if (challengeListEl) {
        challengeListEl.addEventListener('click', (event) => {
            const target = event.target instanceof HTMLElement ? event.target.closest('.challenge-claim') : null;
            if (!target || target.disabled) {
                return;
            }
            const challengeId = target.dataset.challengeId;
            if (challengeId && challengeManager) {
                challengeManager.claimReward(challengeId);
            }
        });
    }

    if (skinOptionsEl) {
        skinOptionsEl.addEventListener('click', (event) => {
            const target = event.target instanceof HTMLElement ? event.target.closest('[data-skin-id]') : null;
            if (!target || target.disabled) {
                return;
            }
            const skinId = target.dataset.skinId;
            if (skinId && challengeManager) {
                challengeManager.equipCosmetic('skin', skinId);
            }
        });
    }

    if (trailOptionsEl) {
        trailOptionsEl.addEventListener('click', (event) => {
            const target = event.target instanceof HTMLElement ? event.target.closest('[data-trail-id]') : null;
            if (!target || target.disabled) {
                return;
            }
            const trailId = target.dataset.trailId;
            if (trailId && challengeManager) {
                challengeManager.equipCosmetic('trail', trailId);
            }
        });
    }

    if (customLoadoutGrid) {
        customLoadoutGrid.addEventListener('click', handleCustomLoadoutClick);
        customLoadoutGrid.addEventListener('change', handleCustomLoadoutChange);
    }

    if (loadoutEditorSaveButton) {
        loadoutEditorSaveButton.addEventListener('click', () => {
            saveLoadoutEditorSelection();
        });
    }
    if (loadoutEditorCancelButton) {
        loadoutEditorCancelButton.addEventListener('click', () => {
            closeLoadoutEditor();
        });
    }
    if (loadoutEditorCloseButton) {
        loadoutEditorCloseButton.addEventListener('click', () => {
            closeLoadoutEditor();
        });
    }
    if (loadoutEditorBackdrop) {
        loadoutEditorBackdrop.addEventListener('click', () => {
            closeLoadoutEditor();
        });
    }
    if (loadoutEditorModal) {
        loadoutEditorModal.addEventListener('click', (event) => {
            if (event.target === loadoutEditorModal) {
                closeLoadoutEditor();
            }
        });
        loadoutEditorModal.addEventListener('keydown', (event) => {
            if (!isLoadoutEditorOpen()) {
                return;
            }
            if (event.key === 'Escape') {
                event.preventDefault();
                closeLoadoutEditor();
                return;
            }
            if (event.key === 'Tab') {
                const focusable = getLoadoutEditorFocusableElements();
                if (!focusable.length) {
                    event.preventDefault();
                    return;
                }
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                const activeElement = document.activeElement;
                if (event.shiftKey) {
                    if (!loadoutEditorModal.contains(activeElement) || activeElement === first) {
                        event.preventDefault();
                        last.focus();
                    }
                } else if (activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            }
        });
    }

    if (openWeaponSelectButton) {
        openWeaponSelectButton.addEventListener('click', () => {
            if (openWeaponSelectButton.disabled) {
                return;
            }
            openWeaponSelect({ trigger: openWeaponSelectButton });
        });
    }

    function getShareText(summary) {
        if (!summary) return '';
        const formattedTime = formatTime(summary.timeMs);
        const streakText = summary.bestStreak ? ` x${summary.bestStreak}` : '';
        const core = `${summary.player} survived ${formattedTime} for ${summary.score.toLocaleString()} pts${streakText} in Nyan Escape.`;
        const quotaText = summary.recorded !== false && summary.runsToday ? ` Run ${summary.runsToday}/3 logged today.` : '';
        const pickups = summary.nyan ? ` Pickups: ${summary.nyan.toLocaleString()} energy.` : '';
        const placementText = summary.placement ? ` Ranked #${summary.placement} on the local galaxy board.` : '';
        const locationUrl = typeof window !== 'undefined' && window.location ? ` Play: ${window.location.href}` : '';
        return `${core}${quotaText}${pickups}${placementText}${locationUrl}`.trim();
    }

    function showShareStatus(message, type = 'info') {
        if (!shareStatusEl) return;
        shareStatusEl.textContent = message;
        shareStatusEl.className = '';
        if (type === 'success') {
            shareStatusEl.classList.add('success');
        } else if (type === 'error') {
            shareStatusEl.classList.add('error');
        }
    }

    function updateSharePanel() {
        if (shareButton) {
            shareButton.disabled = !lastRunSummary;
            shareButton.setAttribute('title', 'Open X to post your flight log');
        }
        if (!lastRunSummary) {
            showShareStatus('Complete a run to generate a broadcast log.');
        } else if (lastRunSummary.reason === 'pending') {
            showShareStatus('Submission pending. Log the run or skip to continue.');
        } else if (lastRunSummary.recorded === false && lastRunSummary.reason === 'limit') {
            showShareStatus('Daily log limit reached. Share this flight manually to hype the squadron.');
        } else if (lastRunSummary.reason === 'skipped') {
            showShareStatus('Run not logged. Share manually or fly again.');
        } else {
            showShareStatus('Flight log ready. Share to X and rally the squadron.');
        }
    }

    async function handleShareClick(event) {
        event?.preventDefault?.();
        if (!lastRunSummary) {
            return;
        }

        const text = getShareText(lastRunSummary);
        const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
        let popup = null;

        try {
            popup = typeof window !== 'undefined' && typeof window.open === 'function'
                ? window.open(shareUrl, '_blank', 'noopener,width=600,height=640')
                : null;
        } catch (error) {
            popup = null;
        }

        if (popup) {
            popup.focus?.();
            showShareStatus('Flight log loaded into X. Finalize your post!', 'success');
            return;
        }

        if (canNativeShare && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
            try {
                await navigator.share({
                    title: 'Nyan Escape — Flight Log',
                    text
                });
                showShareStatus('Flight log transmitted to the squadron!', 'success');
                return;
            } catch (error) {
                if (error?.name === 'AbortError') {
                    return;
                }
            }
        }

        showShareStatus('Unable to open X. Allow pop-ups or share the log manually.', 'error');
    }

    updateHighScorePanel();
    updateLeaderboardPanel();
    updateSocialFeedPanel();
    updateRunSummaryOverview();
    updateSharePanel();

    if (shareButton) {
        shareButton.addEventListener('click', handleShareClick);
    }

    if (highScoreTitleEl && typeof highScoreTitleEl.addEventListener === 'function') {
        highScoreTitleEl.addEventListener('click', () => {
            if (!playerNameInput) {
                return;
            }
            try {
                playerNameInput.focus({ preventScroll: true });
            } catch {
                playerNameInput.focus();
            }
            playerNameInput.select?.();
        });
    }

    function loadCustomFont(fontFamily) {
        if (!document.fonts?.load) {
            return Promise.resolve();
        }

        const variantsToLoad = [
            `400 16px "${fontFamily}"`,
            `700 16px "${fontFamily}"`
        ];

        return Promise.all(variantsToLoad.map((descriptor) => document.fonts.load(descriptor)))
            .then(() => undefined)
            .catch(() => undefined);
    }

    function configureOverlayForNameEntry({ focusInput = true } = {}) {
        const message = overlayDefaultMessage || overlayMessage?.textContent || '';
        showOverlay(message, 'Confirm Callsign', {
            title: overlayDefaultTitle,
            enableButton: true,
            launchMode: 'prepare'
        });
        if (playerNameInput && focusInput) {
            try {
                playerNameInput.focus({ preventScroll: true });
                playerNameInput.select?.();
            } catch {
                playerNameInput.focus();
                playerNameInput.select?.();
            }
        }
    }

    function showPreflightOverlay() {
        configureOverlayForNameEntry({ focusInput: false });
        refreshPilotPreviewStates();
    }

    function getPauseResumeInstruction() {
        return isTouchInterface
            ? 'Tap Resume to continue your run.'
            : 'Press P or tap Resume to continue your run.';
    }

    function getPauseReasonHint(reason) {
        switch (reason) {
            case 'blur':
                return 'Flight paused because the window lost focus.';
            case 'hidden':
                return 'Flight paused while the tab was hidden.';
            case 'settings':
                return 'Adjust your loadout, then close settings to continue.';
            default:
                return '';
        }
    }

    function updatePauseOverlayContent(reason = lastPauseReason) {
        if (pauseMessageEl) {
            pauseMessageEl.textContent = getPauseResumeInstruction();
        }
        if (pauseHintEl) {
            const hint = getPauseReasonHint(reason);
            if (hint) {
                pauseHintEl.textContent = hint;
                pauseHintEl.hidden = false;
            } else {
                pauseHintEl.textContent = '';
                pauseHintEl.hidden = true;
            }
        }
    }

    function showPauseOverlay(reason = 'manual') {
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
                try {
                    resumeButton.focus();
                } catch {
                    // Ignore focus failures
                }
            }
        });
    }

    function hidePauseOverlay() {
        if (!pauseOverlay) {
            return;
        }
        if (!pauseOverlay.hidden) {
            pauseOverlay.hidden = true;
            pauseOverlay.setAttribute('aria-hidden', 'true');
        }
        if (pauseOverlay.contains(document.activeElement)) {
            try {
                document.activeElement.blur();
            } catch {
                // Ignore blur failures
            }
        }
    }

    function runCyborgLoadingSequence() {
        const finishBootSequence = () => {
            showPreflightOverlay();
        };

        if (!loadingScreen || !loadingStatus) {
            fontsReady.catch(() => undefined).then(() => {
                finishBootSequence();
            });
            return;
        }

        const steps = [
            'BOOTING CYBERNETICS KERNEL',
            'CALIBRATING OPTIC RELAYS',
            'DECRYPTING NAV MATRICES',
            'AUTHORIZING FLIGHT SEQUENCE'
        ];

        let progress = 0;
        let stepIndex = 0;
        const maxIndex = steps.length - 1;

        const updateStatus = () => {
            const prefix = `[SYS-BOOT:${String(stepIndex + 1).padStart(2, '0')}]`;
            const percentText = `${progress.toString().padStart(3, '0')}%`;
            loadingStatus.innerHTML = `
                <span class="loading-prefix">${prefix}</span>
                <span class="loading-line">${steps[Math.min(stepIndex, maxIndex)]} — <span class="loading-percent">${percentText}</span></span>
            `;
        };

        const hideLoading = () => {
            loadingScreen.classList.add('hidden');
            setTimeout(() => {
                if (loadingScreen.parentElement) {
                    loadingScreen.parentElement.removeChild(loadingScreen);
                }
            }, 520);
        };

        const finishLoading = () => {
            fontsReady.catch(() => undefined).then(() => {
                hideLoading();
                finishBootSequence();
            });
        };

        const advance = () => {
            const increment = Math.floor(Math.random() * 11) + 4;
            progress = Math.min(progress + increment, 100);
            stepIndex = Math.min(maxIndex, Math.floor((progress / 100) * steps.length));
            updateStatus();

            if (progress >= 100) {
                setTimeout(finishLoading, 480);
                return;
            }

            const delay = Math.random() * 320 + 160;
            setTimeout(advance, delay);
        };

        updateStatus();
        setTimeout(advance, 420);
    }

    const gradientPrefixes = ['linear-gradient', 'radial-gradient', 'conic-gradient'];

    function isGradientSource(value) {
        if (typeof value !== 'string') {
            return false;
        }
        const trimmed = value.trim();
        return gradientPrefixes.some((prefix) => trimmed.startsWith(prefix));
    }

    function preloadImages(sources) {
        if (!Array.isArray(sources) || sources.length === 0) {
            return Promise.resolve([]);
        }
        const validSources = sources.filter((src) => typeof src === 'string' && src.length && !isGradientSource(src));
        if (validSources.length === 0) {
            return Promise.resolve([]);
        }
        return Promise.all(validSources.map((src) => new Promise((resolve) => {
            const img = new Image();
            img.onload = resolve;
            img.onerror = resolve;
            img.src = src;
        })));
    }

    function setLayerBackground(layer, src) {
        if (layer) {
            if (isGradientSource(src)) {
                layer.style.backgroundImage = src;
            } else {
                layer.style.backgroundImage = `url('${src}')`;
            }
        }
    }

    function showLayer(layer) {
        if (layer) {
            layer.classList.add('visible');
        }
    }

    function hideLayer(layer) {
        if (layer) {
            layer.classList.remove('visible');
        }
    }

    function cycleBackground() {
        if (backgroundImages.length <= 1) {
            return;
        }
        const nextIndex = (currentBackgroundIndex + 1) % backgroundImages.length;
        const nextLayerIndex = 1 - activeLayerIndex;
        const nextLayer = backgroundLayers[nextLayerIndex];
        const currentLayer = backgroundLayers[activeLayerIndex];

        setLayerBackground(nextLayer, backgroundImages[nextIndex]);

        requestAnimationFrame(() => {
            showLayer(nextLayer);
            hideLayer(currentLayer);
            activeLayerIndex = nextLayerIndex;
            currentBackgroundIndex = nextIndex;
        });
    }

    preloadImages(backgroundImages).then(() => {
        setLayerBackground(backgroundLayers[activeLayerIndex], backgroundImages[currentBackgroundIndex]);
        showLayer(backgroundLayers[activeLayerIndex]);
        if (backgroundImages.length > 1) {
            setLayerBackground(backgroundLayers[1 - activeLayerIndex], backgroundImages[(currentBackgroundIndex + 1) % backgroundImages.length]);
            setInterval(cycleBackground, backgroundChangeInterval);
        }
    });

    const skinOverrides =
        cosmeticOverrides.skins && typeof cosmeticOverrides.skins === 'object'
            ? cosmeticOverrides.skins
            : {};
    const playerBaseImage = loadImageWithFallback(
        resolveAssetConfig(assetOverrides.player, 'assets/player.png'),
        createPlayerFallbackDataUrl
    );
    const playerSkins = {
        default: {
            id: 'default',
            label: 'Standard Hull',
            image: playerBaseImage
        },
        midnight: {
            id: 'midnight',
            label: 'Midnight Mirage',
            image: loadImageWithFallback(resolveAssetConfig(skinOverrides.midnight, null), () =>
                createPlayerVariantDataUrl('midnight')
            )
        },
        sunrise: {
            id: 'sunrise',
            label: 'Sunrise Shimmer',
            image: loadImageWithFallback(resolveAssetConfig(skinOverrides.sunrise, null), () =>
                createPlayerVariantDataUrl('sunrise')
            )
        }
    };
    const characterProfiles = [
        {
            id: 'nova',
            name: 'Nova Navigator',
            role: 'Balanced Ace',
            summary:
                'Balanced thrusters keep acceleration, dash control, and blaster cadence perfectly aligned for any mission.',
            ongoing: [
                'Factory-tuned thrusters for adaptable handling.',
                'Even dash burst and recovery for reliable escapes.',
                'Baseline plasma cadence ready for any mission.'
            ],
            image: playerBaseImage,
            overrides: {}
        },
        {
            id: 'comet',
            name: 'Comet Vanguard',
            role: 'Speed Specialist',
            summary:
                'Surge thrusters push the frame faster and harder, trading a slightly larger hull and shorter dash window for burst speed and rapid-fire shots.',
            ongoing: [
                'High-output engines spike acceleration and top speed.',
                'Shorter dash cooldown built for aggressive weaving.',
                'Rapid-fire bolts keep pressure on debris clusters.'
            ],
            image: loadImageWithFallback('assets/player2.png', () => playerBaseImage),
            overrides: {
                player: {
                    width: 143,
                    height: 143,
                    acceleration: 2450,
                    drag: 5.6,
                    maxSpeed: 520,
                    verticalBleed: 0.055
                },
                dash: {
                    boostSpeed: 1050,
                    duration: 190
                },
                projectile: {
                    cooldown: 180,
                    speed: 950
                }
            }
        },
        {
            id: 'nebula',
            name: 'Nebula Warden',
            role: 'Shielded Scout',
            summary:
                'A compact hull narrows the hitbox and stretches dash uptime, sacrificing raw thrust for control while launching slower, heavy plasma volleys.',
            ongoing: [
                'Compact hull trims the hitbox for precision dodges.',
                'Extended dash window excels at sustained evasions.',
                'Heavy plasma rounds punch through asteroid armor.'
            ],
            image: loadImageWithFallback('assets/player3.png', () => playerBaseImage),
            overrides: {
                player: {
                    width: 127,
                    height: 127,
                    acceleration: 1950,
                    drag: 4.8,
                    maxSpeed: 460,
                    verticalBleed: 0.085
                },
                dash: {
                    boostSpeed: 900,
                    duration: 260
                },
                projectile: {
                    cooldown: 220,
                    speed: 880
                }
            }
        }
    ];
    const characterProfileMap = new Map(characterProfiles.map((profile) => [profile.id, profile]));

    function renderCharacterSelectCards() {
        if (!characterSelectGrid) {
            characterCards = [];
            return;
        }

        characterSelectGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const cards = [];

        for (const profile of characterProfiles) {
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'character-card';
            card.dataset.characterId = profile.id;
            card.setAttribute('role', 'listitem');

            const image = document.createElement('img');
            const imageSource =
                profile.image?.src ?? playerBaseImage?.src ?? 'assets/player.png';
            image.src = imageSource;
            image.alt = profile.name ?? '';
            image.loading = 'lazy';
            card.appendChild(image);

            const nameEl = document.createElement('div');
            nameEl.className = 'character-name';
            nameEl.textContent = profile.name ?? '';
            card.appendChild(nameEl);

            const roleEl = document.createElement('div');
            roleEl.className = 'character-role';
            roleEl.textContent = profile.role ?? '';
            card.appendChild(roleEl);

            const details = document.createElement('div');
            details.className = 'character-details';
            const detailsHeading = document.createElement('strong');
            detailsHeading.textContent = 'Flight Profile';
            details.appendChild(detailsHeading);

            const detailsList = document.createElement('ul');
            const ongoingEntries = Array.isArray(profile.ongoing) ? profile.ongoing : [];
            if (ongoingEntries.length) {
                for (const entry of ongoingEntries) {
                    if (!entry) {
                        continue;
                    }
                    const item = document.createElement('li');
                    item.textContent = entry;
                    detailsList.appendChild(item);
                }
            }
            details.appendChild(detailsList);
            card.appendChild(details);

            const characterId = profile.id;
            card.addEventListener('click', () => {
                if (!characterId) {
                    return;
                }
                if (pendingCharacterId === characterId && !characterSelectConfirm?.disabled) {
                    confirmCharacterSelection();
                } else {
                    setPendingCharacter(characterId);
                }
            });

            card.addEventListener('focus', () => {
                updateCharacterSummaryDisplay(profile);
            });

            card.addEventListener('blur', () => {
                updateCharacterSummaryDisplay(getCharacterProfile(pendingCharacterId));
            });

            card.addEventListener('mouseenter', () => {
                updateCharacterSummaryDisplay(profile);
            });

            card.addEventListener('mouseleave', () => {
                updateCharacterSummaryDisplay(getCharacterProfile(pendingCharacterId));
            });

            fragment.appendChild(card);
            cards.push(card);
        }

        characterSelectGrid.appendChild(fragment);
        characterCards = cards;
    }

    function renderPilotPreview() {
        if (!pilotPreviewGrid) {
            return;
        }
        pilotPreviewGrid.innerHTML = '';
        normalizeCustomLoadouts({ persist: false });
        const ownership = getOwnedCosmeticSets(latestCosmeticSnapshot);
        const currentSelection = getCurrentCosmeticsSelection();
        const activeCharacter = activeCharacterId;
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < customLoadouts.length; index += 1) {
            const loadout = customLoadouts[index];
            if (!loadout) {
                continue;
            }
            const slotMeta = getLoadoutSlotMeta(loadout.slot) ?? CUSTOM_LOADOUT_SLOTS[index] ?? null;
            const fallbackName = slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'pilot-preview-card';
            card.dataset.loadoutId = loadout.slot ?? `slot${index + 1}`;
            card.setAttribute('role', 'listitem');

            const nameRow = document.createElement('div');
            nameRow.className = 'pilot-preview-header-row';
            const nameEl = document.createElement('span');
            nameEl.className = 'pilot-preview-name';
            nameEl.textContent = loadout.name ?? fallbackName;
            const statusEl = document.createElement('span');
            statusEl.className = 'pilot-preview-role';
            nameRow.appendChild(nameEl);
            nameRow.appendChild(statusEl);
            card.appendChild(nameRow);

            const details = document.createElement('div');
            details.className = 'pilot-preview-meta';
            const pilotProfile = getCharacterProfile(loadout.characterId);
            const weaponProfile = getWeaponProfile(loadout.weaponId) ?? getDefaultWeaponProfile();

            const addDetailRow = (label, value) => {
                const row = document.createElement('div');
                row.className = 'pilot-preview-meta-row';
                const labelEl = document.createElement('span');
                labelEl.className = 'pilot-preview-meta-label';
                labelEl.textContent = label;
                const valueEl = document.createElement('span');
                valueEl.className = 'pilot-preview-meta-value';
                valueEl.textContent = value;
                row.appendChild(labelEl);
                row.appendChild(valueEl);
                details.appendChild(row);
            };

            addDetailRow('Pilot', pilotProfile?.name ?? loadout.characterId ?? 'Pilot');
            addDetailRow('Weapon', weaponProfile?.name ?? getWeaponLabel(loadout.weaponId));
            addDetailRow('Suit', getSkinLabel(loadout.skinId));
            addDetailRow('Stream', getTrailLabel(loadout.trailId));
            card.appendChild(details);

            const missingItems = [];
            if (!ownership.ownedSkins.has(loadout.skinId)) {
                missingItems.push(getSkinLabel(loadout.skinId));
            }
            if (!ownership.ownedTrails.has(loadout.trailId)) {
                missingItems.push(getTrailLabel(loadout.trailId));
            }
            if (!ownership.ownedWeapons.has(loadout.weaponId)) {
                missingItems.push(getWeaponLabel(loadout.weaponId));
            }

            if (missingItems.length) {
                card.classList.add('has-locked');
                const lockedNote = document.createElement('p');
                lockedNote.className = 'pilot-preview-locked';
                lockedNote.textContent = `Unlock required: ${missingItems.join(', ')}`;
                card.appendChild(lockedNote);
            }

            const matchesSelection = doesLoadoutMatchSelection(loadout, currentSelection);
            const isActive = matchesSelection && loadout.slot === activeLoadoutId;
            if (isActive) {
                card.classList.add('active');
                statusEl.textContent = 'Equipped';
            } else if (missingItems.length) {
                statusEl.textContent = 'Locked';
            } else {
                statusEl.textContent = 'Equip Loadout';
            }
            card.setAttribute('aria-pressed', isActive ? 'true' : 'false');

            fragment.appendChild(card);
        }

        pilotPreviewGrid.appendChild(fragment);
        refreshPilotPreviewStates();
    }

    function refreshPilotPreviewStates() {
        if (!pilotPreviewGrid) {
            return;
        }
        const cards = pilotPreviewGrid.querySelectorAll('.pilot-preview-card');
        const currentSelection = getCurrentCosmeticsSelection();
        const ownership = getOwnedCosmeticSets(latestCosmeticSnapshot);
        cards.forEach((card) => {
            if (!(card instanceof HTMLElement)) {
                return;
            }
            const slotId = card.dataset.loadoutId;
            const loadout = slotId ? getCustomLoadout(slotId) : null;
            const statusEl = card.querySelector('.pilot-preview-role');
            const lockedEl = card.querySelector('.pilot-preview-locked');
            const missingItems = [];
            if (loadout) {
                if (!ownership.ownedSkins.has(loadout.skinId)) {
                    missingItems.push(getSkinLabel(loadout.skinId));
                }
                if (!ownership.ownedTrails.has(loadout.trailId)) {
                    missingItems.push(getTrailLabel(loadout.trailId));
                }
                if (!ownership.ownedWeapons.has(loadout.weaponId)) {
                    missingItems.push(getWeaponLabel(loadout.weaponId));
                }
            }
            const matchesSelection = doesLoadoutMatchSelection(loadout, currentSelection);
            const isActive = Boolean(matchesSelection && loadout?.slot === activeLoadoutId);
            card.classList.toggle('active', isActive);
            card.classList.toggle('has-locked', missingItems.length > 0);
            card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (statusEl instanceof HTMLElement) {
                if (missingItems.length) {
                    statusEl.textContent = 'Locked';
                } else if (isActive) {
                    statusEl.textContent = 'Equipped';
                } else {
                    statusEl.textContent = 'Equip Loadout';
                }
            }
            if (lockedEl instanceof HTMLElement) {
                if (missingItems.length) {
                    lockedEl.textContent = `Unlock required: ${missingItems.join(', ')}`;
                    lockedEl.removeAttribute('hidden');
                } else {
                    lockedEl.textContent = '';
                    lockedEl.setAttribute('hidden', '');
                }
            }
        });
    }

    function updateSwapPilotButton() {
        const profile = getCharacterProfile(activeCharacterId);
        const label = profile ? `Swap Pilot (${profile.name})` : 'Swap Pilot';
        const ariaLabel = profile ? `Swap pilot — current ${profile.name}` : 'Swap pilot';
        const canSelectPilot = Boolean(characterSelectModal);
        if (swapPilotButton) {
            swapPilotButton.textContent = label;
            swapPilotButton.setAttribute('aria-label', ariaLabel);
            if (!canSelectPilot) {
                swapPilotButton.disabled = true;
                swapPilotButton.setAttribute('aria-disabled', 'true');
            } else {
                swapPilotButton.disabled = false;
                swapPilotButton.setAttribute('aria-disabled', 'false');
            }
        }
        if (preflightSwapPilotButton) {
            preflightSwapPilotButton.textContent = label;
            preflightSwapPilotButton.setAttribute('aria-label', ariaLabel);
            const shouldDisable = !canSelectPilot || preflightSwapPilotButton.hidden;
            preflightSwapPilotButton.disabled = shouldDisable;
            preflightSwapPilotButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        }
    }

    function getDefaultWeaponProfile() {
        if (Array.isArray(weaponProfiles) && weaponProfiles.length) {
            return weaponProfiles[0];
        }
        return {
            id: 'pulse',
            name: 'Pulse Blaster',
            summary: fallbackWeaponSummaryText,
            image: { src: defaultWeaponImageSrc }
        };
    }

    function getWeaponProfile(id) {
        return weaponProfileMap?.get(id ?? '') ?? null;
    }

    function renderWeaponSelectCards() {
        if (!weaponSelectGrid) {
            weaponCards = [];
            return;
        }

        weaponSelectGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const cards = [];

        for (const profile of weaponProfiles) {
            if (!profile || typeof profile.id !== 'string') {
                continue;
            }

            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'character-card weapon-card';
            card.dataset.weaponId = profile.id;
            card.setAttribute('role', 'listitem');

            const image = document.createElement('img');
            const imageSource = profile.image?.src ?? defaultWeaponImageSrc;
            image.src = imageSource;
            image.alt = profile.name ?? profile.id;
            image.loading = 'lazy';
            card.appendChild(image);

            const nameEl = document.createElement('div');
            nameEl.className = 'character-name';
            nameEl.textContent = profile.name ?? profile.id;
            card.appendChild(nameEl);

            const details = document.createElement('div');
            details.className = 'character-details';
            const summary = document.createElement('p');
            summary.textContent = profile.summary ?? '';
            details.appendChild(summary);
            if (Array.isArray(profile.highlights) && profile.highlights.length) {
                const list = document.createElement('ul');
                for (const entry of profile.highlights) {
                    if (!entry) {
                        continue;
                    }
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(list);
            }
            card.appendChild(details);

            fragment.appendChild(card);
            cards.push(card);
        }

        weaponSelectGrid.appendChild(fragment);
        weaponCards = cards;
        refreshWeaponCardStates();
    }

    function refreshWeaponCardStates() {
        for (const card of weaponCards) {
            if (!(card instanceof HTMLElement)) {
                continue;
            }
            const weaponId = card.dataset.weaponId;
            card.classList.toggle('active', weaponId === activeWeaponId);
            card.classList.toggle('selected', weaponId === pendingWeaponId);
        }
    }

    function updateWeaponSummaryDisplay(profile) {
        if (!weaponSelectSummary) {
            return;
        }
        const summaryText = profile?.summary ?? defaultWeaponSummaryText;
        if (weaponSelectSummaryDescription) {
            weaponSelectSummaryDescription.textContent = summaryText;
        } else {
            weaponSelectSummary.textContent = summaryText;
        }
    }

    function updateWeaponInlineSummary(profile) {
        const normalized = profile ?? getWeaponProfile(activeWeaponId) ?? getDefaultWeaponProfile();
        if (weaponSummaryName) {
            weaponSummaryName.textContent = normalized?.name ?? 'Weapon Loadout';
        }
        if (weaponSummaryDescription) {
            const summaryText = normalized?.summary?.trim()
                ? normalized.summary
                : fallbackWeaponSummaryText;
            weaponSummaryDescription.textContent = summaryText;
        }
        if (weaponSummaryImage) {
            const imageSrc = normalized?.image?.src ?? defaultWeaponImageSrc;
            weaponSummaryImage.src = imageSrc;
            weaponSummaryImage.alt = normalized?.name
                ? `${normalized.name} loadout illustration`
                : 'Weapon loadout illustration';
        }
    }

    function setPendingWeapon(weaponId, options = {}) {
        const { focusCard = false, updateSummary = true } = options;
        pendingWeaponId = weaponId;
        for (const card of weaponCards) {
            if (!(card instanceof HTMLElement)) {
                continue;
            }
            const isSelected = card.dataset.weaponId === weaponId;
            card.classList.toggle('selected', isSelected);
            if (isSelected && focusCard) {
                try {
                    card.focus({ preventScroll: true });
                } catch {
                    card.focus();
                }
            }
        }
        refreshWeaponCardStates();
        if (updateSummary) {
            updateWeaponSummaryDisplay(getWeaponProfile(weaponId));
        }
        updateWeaponConfirmState();
    }

    function updateWeaponConfirmState() {
        if (!weaponSelectConfirm) {
            return;
        }
        const profile = getWeaponProfile(pendingWeaponId);
        if (!profile) {
            weaponSelectConfirm.disabled = true;
            weaponSelectConfirm.setAttribute('aria-disabled', 'true');
            weaponSelectConfirm.textContent = 'Equip Weapon';
            return;
        }
        weaponSelectConfirm.disabled = false;
        weaponSelectConfirm.setAttribute('aria-disabled', 'false');
        const label = profile.name ?? profile.id ?? 'Weapon';
        weaponSelectConfirm.textContent = `Equip ${label}`;
    }

    function isWeaponSelectOpen() {
        return Boolean(weaponSelectModal && weaponSelectModal.hidden === false);
    }

    function openWeaponSelect(options = {}) {
        if (!weaponSelectModal) {
            return;
        }
        const { trigger = null } = options;
        weaponSelectReturnFocus = trigger instanceof HTMLElement ? trigger : null;
        weaponSelectModal.hidden = false;
        weaponSelectModal.setAttribute('aria-hidden', 'false');
        document.body?.classList.add('weapon-select-open');
        updateWeaponSummaryDisplay(null);
        setPendingWeapon(activeWeaponId, { updateSummary: false });
        updateWeaponConfirmState();
        try {
            weaponSelectConfirm?.focus?.({ preventScroll: true });
        } catch {
            weaponSelectConfirm?.focus?.();
        }
    }

    function closeWeaponSelect() {
        if (!weaponSelectModal) {
            return;
        }
        weaponSelectModal.hidden = true;
        weaponSelectModal.setAttribute('aria-hidden', 'true');
        document.body?.classList.remove('weapon-select-open');
        setPendingWeapon(activeWeaponId, { updateSummary: false });
        updateWeaponSummaryDisplay(null);
        const returnFocus = weaponSelectReturnFocus;
        weaponSelectReturnFocus = null;
        if (returnFocus && typeof returnFocus.focus === 'function') {
            try {
                returnFocus.focus({ preventScroll: true });
            } catch {
                returnFocus.focus();
            }
        }
    }

    function confirmWeaponSelection() {
        const profile = getWeaponProfile(pendingWeaponId);
        if (!profile) {
            return;
        }
        activeWeaponId = profile.id;
        pendingWeaponId = profile.id;
        resetWeaponPatternState(profile.id);
        refreshWeaponSelectionDisplay();
        let selectionApplied = false;
        if (challengeManager && typeof challengeManager.equipCosmetic === 'function') {
            selectionApplied = challengeManager.equipCosmetic('weapon', profile.id);
        }
        if (!selectionApplied) {
            const nextEquipped = { ...lastEquippedCosmetics, weapon: profile.id };
            applyEquippedCosmetics(nextEquipped);
        }
        closeWeaponSelect();
    }

    function refreshWeaponSelectionDisplay() {
        const isOpen = isWeaponSelectOpen();
        const activeProfile = getWeaponProfile(activeWeaponId) ?? getDefaultWeaponProfile();
        if (!isOpen) {
            setPendingWeapon(activeWeaponId, { updateSummary: false });
            updateWeaponSummaryDisplay(null);
        } else {
            updateWeaponSummaryDisplay(getWeaponProfile(pendingWeaponId) ?? activeProfile);
            refreshWeaponCardStates();
        }
        updateWeaponInlineSummary(activeProfile);
        updateWeaponConfirmState();
        updateSwapWeaponButtons();
    }

    function updateSwapWeaponButtons() {
        const profile = getWeaponProfile(activeWeaponId) ?? getDefaultWeaponProfile();
        const label = profile ? `Swap Weapon (${profile.name})` : 'Swap Weapon';
        const ariaLabel = profile ? `Swap weapon — current ${profile.name}` : 'Swap weapon';
        const canSelectWeapon = Boolean(weaponSelectModal);
        if (swapWeaponButton) {
            swapWeaponButton.textContent = label;
            swapWeaponButton.setAttribute('aria-label', ariaLabel);
            if (!canSelectWeapon) {
                swapWeaponButton.disabled = true;
                swapWeaponButton.setAttribute('aria-disabled', 'true');
            } else {
                swapWeaponButton.disabled = false;
                swapWeaponButton.setAttribute('aria-disabled', 'false');
            }
        }
        if (preflightSwapWeaponButton) {
            preflightSwapWeaponButton.textContent = label;
            preflightSwapWeaponButton.setAttribute('aria-label', ariaLabel);
            const shouldDisable = !canSelectWeapon || preflightSwapWeaponButton.hidden;
            preflightSwapWeaponButton.disabled = shouldDisable;
            preflightSwapWeaponButton.setAttribute('aria-disabled', shouldDisable ? 'true' : 'false');
        }
        if (openWeaponSelectButton) {
            openWeaponSelectButton.textContent = 'Change Weapon';
            openWeaponSelectButton.setAttribute(
                'aria-label',
                profile ? `Change weapon — current ${profile.name}` : 'Change weapon'
            );
            openWeaponSelectButton.disabled = !canSelectWeapon;
            openWeaponSelectButton.setAttribute('aria-disabled', canSelectWeapon ? 'false' : 'true');
        }
    }

    const defaultCharacterSummaryText = (
        characterSelectSummaryDescription?.textContent ??
        characterSelectSummary?.textContent ??
        ''
    ).trim();
    const defaultWeaponSummaryText = (
        weaponSelectSummaryDescription?.textContent ??
        weaponSelectSummary?.textContent ??
        ''
    ).trim();
    const defaultWeaponImageSrc = 'assets/weapon-pulse.svg';
    const fallbackWeaponSummaryText =
        defaultWeaponSummaryText || 'Baseline plasma bolt tuned for steady precision.';
    let weaponProfiles = [];
    let weaponProfileMap = null;
    let selectedCharacterImage = playerBaseImage;
    let activeCharacterId = 'nova';
    let pendingCharacterId = 'nova';
    let pendingLaunchAction = null;
    let characterSelectSource = 'action';
    let lastEquippedCosmetics = {};
    let activeWeaponId = 'pulse';
    let pendingWeaponId = 'pulse';
    let weaponSelectReturnFocus = null;
    const trailStyles = {
        rainbow: { id: 'rainbow', label: 'Prismatic Stream', type: 'spectrum' },
        aurora: {
            id: 'aurora',
            label: 'Aurora Wake',
            type: 'palette',
            colors: ['#38bdf8', '#8b5cf6', '#ec4899', '#22d3ee']
        },
        ember: {
            id: 'ember',
            label: 'Ember Wake',
            type: 'palette',
            colors: ['#f97316', '#fb7185', '#fde047']
        }
    };
    const createWeaponPatternState = () => ({
        pulse: { burstStep: -1, wavePhase: 0, resonanceCycle: 0 },
        scatter: { volleyStep: -1, sweepDirection: 1, twistPhase: 0 },
        lance: { chargeLevel: -1, arcFlip: 1 }
    });

    let weaponPatternState = createWeaponPatternState();

    function resetWeaponPatternState(weaponId) {
        const defaults = createWeaponPatternState();
        if (!weaponId) {
            weaponPatternState = defaults;
            return;
        }
        if (Object.prototype.hasOwnProperty.call(defaults, weaponId)) {
            weaponPatternState[weaponId] = defaults[weaponId];
        }
    }

    const weaponLoadouts = {
        pulse: {
            id: 'pulse',
            label: 'Pulse Blaster',
            description: 'Resonant bolts braid into spiraling duets before collapsing into a finisher.',
            cooldownMultiplier: 1,
            speedMultiplier: 1,
            pattern: (createProjectile) => {
                const stateRef =
                    weaponPatternState.pulse ?? (weaponPatternState.pulse = createWeaponPatternState().pulse);
                stateRef.burstStep = (stateRef.burstStep + 1) % 4;
                stateRef.wavePhase = (stateRef.wavePhase + Math.PI / 5) % (Math.PI * 2);
                stateRef.resonanceCycle = (stateRef.resonanceCycle + 1) % 6;

                if (stateRef.burstStep === 0) {
                    const tilt = Math.sin(stateRef.wavePhase) * 0.08;
                    createProjectile(tilt, 'pulseCore', {
                        speedMultiplier: 1.18,
                        audioType: 'standard'
                    });
                    return;
                }

                if (stateRef.burstStep === 1) {
                    const offset = Math.sin(stateRef.wavePhase) * 8;
                    createProjectile(-0.08, 'pulseWing', {
                        offsetY: -offset,
                        speedMultiplier: 1.05,
                        audioType: 'standard'
                    });
                    createProjectile(0.08, 'pulseWing', {
                        offsetY: offset,
                        speedMultiplier: 1.05,
                        audioType: 'standard'
                    });
                    return;
                }

                if (stateRef.burstStep === 2) {
                    const sweep = Math.cos(stateRef.wavePhase) * 0.12;
                    createProjectile(-sweep, 'pulseResonance', {
                        offsetY: -4,
                        speedMultiplier: 0.92,
                        life: 2400,
                        audioType: 'standard'
                    });
                    createProjectile(sweep, 'pulseResonance', {
                        offsetY: 4,
                        speedMultiplier: 0.92,
                        life: 2400,
                        audioType: 'standard'
                    });
                    return;
                }

                const side = stateRef.resonanceCycle % 2 === 0 ? -1 : 1;
                const arc = side * 0.18;
                createProjectile(0, 'pulseCore', {
                    offsetX: 6 * side,
                    speedMultiplier: 1.22,
                    damage: 2,
                    audioType: 'standard'
                });
                createProjectile(arc, 'pulseWing', {
                    offsetY: side * -10,
                    speedMultiplier: 1.08,
                    audioType: 'standard'
                });
                createProjectile(-arc, 'pulseWing', {
                    offsetY: side * 10,
                    speedMultiplier: 1.08,
                    audioType: 'standard'
                });
            }
        },
        scatter: {
            id: 'scatter',
            label: 'Scatter Burst',
            description: 'Chaotic fans whip sideways cyclones and ember blooms across the lane.',
            cooldownMultiplier: 1.12,
            speedMultiplier: 0.95,
            pattern: (createProjectile) => {
                const stateRef =
                    weaponPatternState.scatter ?? (weaponPatternState.scatter = createWeaponPatternState().scatter);
                stateRef.volleyStep = (stateRef.volleyStep + 1) % 3;
                stateRef.twistPhase = (stateRef.twistPhase + 1) % 9;
                if (stateRef.volleyStep === 0) {
                    stateRef.sweepDirection *= -1;
                    const bloom = 0.18 + stateRef.twistPhase * 0.01;
                    createProjectile(-bloom, 'scatterBloom', {
                        offsetY: -12,
                        audioType: 'scatter'
                    });
                    createProjectile(-0.06, 'scatter', {
                        offsetY: -4,
                        audioType: 'scatter'
                    });
                    createProjectile(0.06, 'scatter', {
                        offsetY: 4,
                        audioType: 'scatter'
                    });
                    createProjectile(bloom, 'scatterBloom', {
                        offsetY: 12,
                        audioType: 'scatter'
                    });
                    return;
                }

                if (stateRef.volleyStep === 1) {
                    const twist = stateRef.sweepDirection * (0.16 + stateRef.twistPhase * 0.01);
                    createProjectile(-twist * 0.5, 'scatterTwist', {
                        offsetY: -stateRef.sweepDirection * 6,
                        speedMultiplier: 0.96,
                        audioType: 'scatter'
                    });
                    createProjectile(0, 'scatterTwist', {
                        speedMultiplier: 1.04,
                        audioType: 'scatter'
                    });
                    createProjectile(twist * 0.5, 'scatterTwist', {
                        offsetY: stateRef.sweepDirection * 6,
                        speedMultiplier: 0.96,
                        audioType: 'scatter'
                    });
                    return;
                }

                const drift = 0.12 + (stateRef.twistPhase % 3) * 0.05;
                createProjectile(-0.16, 'scatterDrift', {
                    offsetY: -14,
                    speedMultiplier: 0.82,
                    life: 2200,
                    audioType: 'scatter'
                });
                createProjectile(0, 'scatterBurst', {
                    speedMultiplier: 1.08,
                    damage: 2,
                    audioType: 'scatter'
                });
                createProjectile(0.16, 'scatterDrift', {
                    offsetY: 14,
                    speedMultiplier: 0.82,
                    life: 2200,
                    audioType: 'scatter'
                });
                createProjectile(stateRef.sweepDirection * drift, 'scatterBloom', {
                    offsetY: -stateRef.sweepDirection * 18,
                    speedMultiplier: 0.9,
                    audioType: 'scatter'
                });
            }
        },
        lance: {
            id: 'lance',
            label: 'Star Lance',
            description: 'Builds charge through arcing jabs before releasing a radiant piercing nova.',
            cooldownMultiplier: 1.35,
            speedMultiplier: 1.1,
            pattern: (createProjectile) => {
                const stateRef =
                    weaponPatternState.lance ?? (weaponPatternState.lance = createWeaponPatternState().lance);
                stateRef.chargeLevel = (stateRef.chargeLevel + 1) % 4;
                stateRef.arcFlip *= -1;

                if (stateRef.chargeLevel === 0) {
                    createProjectile(0, 'lanceCore', {
                        offsetX: 10,
                        damage: 3,
                        speedMultiplier: 1.25,
                        audioType: 'lance'
                    });
                    createProjectile(-0.12, 'lanceEcho', {
                        offsetX: 4,
                        offsetY: -12,
                        speedMultiplier: 0.95,
                        audioType: 'lance'
                    });
                    createProjectile(0.12, 'lanceEcho', {
                        offsetX: 4,
                        offsetY: 12,
                        speedMultiplier: 0.95,
                        audioType: 'lance'
                    });
                    return;
                }

                const taper = 0.04 * stateRef.chargeLevel;
                const sway = stateRef.arcFlip * (0.03 + stateRef.chargeLevel * 0.02);
                createProjectile(sway, 'lance', {
                    offsetX: 8 + stateRef.chargeLevel * 2,
                    speedMultiplier: 1.1 + taper,
                    audioType: 'lance'
                });
                createProjectile(-sway, 'lanceTracer', {
                    offsetX: 2,
                    offsetY: stateRef.arcFlip * 10,
                    speedMultiplier: 0.85 + stateRef.chargeLevel * 0.05,
                    life: 2600,
                    audioType: 'lance'
                });
                if (stateRef.chargeLevel === 3) {
                    createProjectile(stateRef.arcFlip * -0.18, 'lanceEcho', {
                        offsetX: 4,
                        offsetY: -stateRef.arcFlip * 14,
                        speedMultiplier: 0.88,
                        audioType: 'lance'
                    });
                }
            }
        }
    };
    const weaponImages = {
        pulse: loadImageWithFallback('assets/weapon-pulse.svg', () => defaultWeaponImageSrc),
        scatter: loadImageWithFallback('assets/weapon-scatter.svg', () => defaultWeaponImageSrc),
        lance: loadImageWithFallback('assets/weapon-lance.svg', () => defaultWeaponImageSrc)
    };
    weaponProfiles = [
        {
            id: 'pulse',
            name: weaponLoadouts.pulse?.label ?? 'Pulse Blaster',
            summary: weaponLoadouts.pulse?.description ?? fallbackWeaponSummaryText,
            image: weaponImages.pulse,
            highlights: [
                'Burst cadence cycles between braided duos and a finishing strike.',
                'Wave-phased bolts weave across the lane for artful crowd control.'
            ]
        },
        {
            id: 'scatter',
            name: weaponLoadouts.scatter?.label ?? 'Scatter Burst',
            summary: weaponLoadouts.scatter?.description ?? fallbackWeaponSummaryText,
            image: weaponImages.scatter,
            highlights: [
                'Alternating blooms, twists, and drifts keep lanes in motion.',
                'Sidewinding shards can peel off flanking debris as they arc.'
            ]
        },
        {
            id: 'lance',
            name: weaponLoadouts.lance?.label ?? 'Star Lance',
            summary: weaponLoadouts.lance?.description ?? fallbackWeaponSummaryText,
            image: weaponImages.lance,
            highlights: [
                'Successive jabs crescendo into a radiant core eruption.',
                'Orbiting echoes trail each strike to scrape away stragglers.'
            ]
        }
    ];
    weaponProfileMap = new Map(weaponProfiles.map((profile) => [profile.id, profile]));
    renderWeaponSelectCards();
    refreshWeaponSelectionDisplay();

    renderCharacterSelectCards();
    renderPilotPreview();
    refreshPilotPreviewStates();
    updateSwapPilotButton();
    updateWeaponInlineSummary();
    updateSwapWeaponButtons();

    function getCurrentCosmeticsSelection() {
        const fallbackWeapon = typeof activeWeaponId === 'string' && activeWeaponId ? activeWeaponId : 'pulse';
        const equipped =
            lastEquippedCosmetics && typeof lastEquippedCosmetics === 'object' ? lastEquippedCosmetics : {};
        const currentWeapon =
            typeof equipped.weapon === 'string' && equipped.weapon ? equipped.weapon : fallbackWeapon;
        const currentSkin =
            typeof equipped.skin === 'string' && equipped.skin ? equipped.skin : 'default';
        const currentTrail =
            typeof equipped.trail === 'string' && equipped.trail ? equipped.trail : 'rainbow';
        return { weapon: currentWeapon, skin: currentSkin, trail: currentTrail };
    }

    function getSkinLabel(id) {
        if (playerSkins?.[id]?.label) {
            return playerSkins[id].label;
        }
        return typeof id === 'string' ? id : 'Hull';
    }

    function getTrailLabel(id) {
        if (trailStyles?.[id]?.label) {
            return trailStyles[id].label;
        }
        return typeof id === 'string' ? id : 'Stream';
    }

    function getWeaponLabel(id) {
        const profile = getWeaponProfile(id) ?? getDefaultWeaponProfile();
        return profile?.name ?? (typeof id === 'string' ? id : 'Weapon');
    }

    function getOwnedCosmeticSets(snapshot = latestCosmeticSnapshot) {
        const cosmetics = snapshot?.cosmetics ?? {};
        const ownedSkins = new Set(Array.isArray(cosmetics.ownedSkins) ? cosmetics.ownedSkins : []);
        if (!ownedSkins.size) {
            ownedSkins.add('default');
        }
        const ownedTrails = new Set(Array.isArray(cosmetics.ownedTrails) ? cosmetics.ownedTrails : []);
        if (!ownedTrails.size) {
            ownedTrails.add('rainbow');
        }
        const ownedWeapons = new Set(Array.isArray(cosmetics.ownedWeapons) ? cosmetics.ownedWeapons : []);
        if (!ownedWeapons.size) {
            ownedWeapons.add('pulse');
            ownedWeapons.add('scatter');
            ownedWeapons.add('lance');
        }
        return { ownedSkins, ownedTrails, ownedWeapons };
    }

    function setLoadoutStatus(slotId, message, type = 'info') {
        if (!slotId) {
            return;
        }
        if (message) {
            loadoutStatusMessages.set(slotId, { message, type });
        } else {
            loadoutStatusMessages.delete(slotId);
        }
    }

    function doesLoadoutMatchSelection(loadout, selection = getCurrentCosmeticsSelection()) {
        if (!loadout || !selection) {
            return false;
        }
        return (
            loadout.characterId === activeCharacterId &&
            loadout.weaponId === selection.weapon &&
            loadout.skinId === selection.skin &&
            loadout.trailId === selection.trail
        );
    }

    function syncActiveLoadoutState() {
        if (suppressActiveLoadoutSync > 0) {
            return;
        }
        const currentSelection = getCurrentCosmeticsSelection();
        if (activeLoadoutId) {
            const active = getCustomLoadout(activeLoadoutId);
            if (!doesLoadoutMatchSelection(active, currentSelection)) {
                const previousId = activeLoadoutId;
                setActiveLoadoutId(null);
                if (previousId) {
                    setLoadoutStatus(
                        previousId,
                        'Preset changed. Save your current setup to refresh this loadout.',
                        'info'
                    );
                }
            } else {
                updateActiveLoadoutPrompt();
            }
            return;
        }
        const matching = customLoadouts.find((entry) => doesLoadoutMatchSelection(entry, currentSelection));
        if (matching?.slot) {
            setActiveLoadoutId(matching.slot);
        } else {
            updateActiveLoadoutPrompt();
        }
    }

    function normalizeCustomLoadouts({ persist = true } = {}) {
        let mutated = false;
        const defaultCharacter = characterProfiles?.[0]?.id ?? 'nova';
        const defaultWeapon = weaponProfiles?.[0]?.id ?? 'pulse';
        for (let index = 0; index < customLoadouts.length; index += 1) {
            const entry = customLoadouts[index];
            if (!entry) {
                continue;
            }
            const slotMeta = CUSTOM_LOADOUT_SLOTS[index] ?? getLoadoutSlotMeta(entry.slot) ?? null;
            const expectedSlot = slotMeta?.slot ?? `slot${index + 1}`;
            const defaultName = slotMeta?.defaultName ?? entry.name ?? `Custom Loadout ${index + 1}`;
            const sanitizedName = sanitizeLoadoutName(entry.name, defaultName);
            if (entry.slot !== expectedSlot) {
                entry.slot = expectedSlot;
                mutated = true;
            }
            if (sanitizedName !== entry.name) {
                entry.name = sanitizedName;
                mutated = true;
            }
            if (!getCharacterProfile(entry.characterId)) {
                entry.characterId = defaultCharacter;
                mutated = true;
            }
            if (!getWeaponProfile(entry.weaponId)) {
                entry.weaponId = defaultWeapon;
                mutated = true;
            }
            if (!playerSkins?.[entry.skinId]) {
                entry.skinId = 'default';
                mutated = true;
            }
            if (!trailStyles?.[entry.trailId]) {
                entry.trailId = 'rainbow';
                mutated = true;
            }
        }
        if (mutated && persist) {
            persistCustomLoadouts();
        }
    }

    function buildTrailSwatchStyle(trail) {
        if (trail && Array.isArray(trail.colors) && trail.colors.length) {
            return `linear-gradient(90deg, ${trail.colors.join(', ')})`;
        }
        return 'linear-gradient(90deg, rgba(56, 189, 248, 0.85), rgba(129, 140, 248, 0.85))';
    }

    function isLoadoutEditorOpen() {
        return Boolean(loadoutEditorModal && loadoutEditorModal.hidden === false);
    }

    function getLoadoutEditorFocusableElements() {
        if (!loadoutEditorContent) {
            return [];
        }
        const nodes = loadoutEditorContent.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        return Array.from(nodes).filter(
            (node) =>
                node instanceof HTMLElement &&
                !node.hasAttribute('disabled') &&
                node.getAttribute('aria-hidden') !== 'true'
        );
    }

    function refreshLoadoutEditorSelectionState() {
        for (const button of loadoutEditorPilotButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const characterId = button.dataset.characterId ?? '';
            const isSelected = characterId === loadoutEditorPendingCharacterId;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        }
        for (const button of loadoutEditorWeaponButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const weaponId = button.dataset.weaponId ?? '';
            const isSelected = weaponId === loadoutEditorPendingWeaponId;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
        }
        for (const button of loadoutEditorSkinButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const skinId = button.dataset.skinId ?? '';
            const isSelected = skinId === loadoutEditorPendingSkinId;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        }
        for (const button of loadoutEditorTrailButtons) {
            if (!(button instanceof HTMLElement)) {
                continue;
            }
            const trailId = button.dataset.trailId ?? '';
            const isSelected = trailId === loadoutEditorPendingTrailId;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
            button.setAttribute('aria-checked', isSelected ? 'true' : 'false');
        }
    }

    function updateLoadoutEditorSaveState() {
        if (!loadoutEditorSaveButton) {
            return;
        }
        const hasCharacter = typeof loadoutEditorPendingCharacterId === 'string' && loadoutEditorPendingCharacterId;
        const hasWeapon = typeof loadoutEditorPendingWeaponId === 'string' && loadoutEditorPendingWeaponId;
        const hasSkin = typeof loadoutEditorPendingSkinId === 'string' && loadoutEditorPendingSkinId;
        const hasTrail = typeof loadoutEditorPendingTrailId === 'string' && loadoutEditorPendingTrailId;
        const disabled = !(hasCharacter && hasWeapon && hasSkin && hasTrail);
        loadoutEditorSaveButton.disabled = disabled;
        loadoutEditorSaveButton.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }

    function setLoadoutEditorSelection(type, value) {
        if (type === 'character' && typeof value === 'string') {
            loadoutEditorPendingCharacterId = value;
        }
        if (type === 'weapon' && typeof value === 'string') {
            loadoutEditorPendingWeaponId = value;
        }
        if (type === 'skin' && typeof value === 'string') {
            loadoutEditorPendingSkinId = value;
        }
        if (type === 'trail' && typeof value === 'string') {
            loadoutEditorPendingTrailId = value;
        }
        refreshLoadoutEditorSelectionState();
        updateLoadoutEditorSaveState();
        updateLoadoutEditorSummary();
    }

    function updateLoadoutEditorSummary() {
        const pilotLabel = loadoutEditorPendingCharacterId
            ? getCharacterProfile(loadoutEditorPendingCharacterId)?.name ??
              String(loadoutEditorPendingCharacterId)
            : '—';
        const weaponLabel = loadoutEditorPendingWeaponId
            ? getWeaponLabel(loadoutEditorPendingWeaponId)
            : '—';
        const skinLabel = loadoutEditorPendingSkinId ? getSkinLabel(loadoutEditorPendingSkinId) : '—';
        const trailLabel = loadoutEditorPendingTrailId ? getTrailLabel(loadoutEditorPendingTrailId) : '—';
        if (loadoutEditorSummaryValues.pilot) {
            loadoutEditorSummaryValues.pilot.textContent = pilotLabel;
        }
        if (loadoutEditorSummaryValues.weapon) {
            loadoutEditorSummaryValues.weapon.textContent = weaponLabel ?? '—';
        }
        if (loadoutEditorSummaryValues.skin) {
            loadoutEditorSummaryValues.skin.textContent = skinLabel ?? '—';
        }
        if (loadoutEditorSummaryValues.trail) {
            loadoutEditorSummaryValues.trail.textContent = trailLabel ?? '—';
        }
    }

    function renderLoadoutEditorOptions() {
        if (!loadoutEditorPilotGrid || !loadoutEditorWeaponGrid) {
            loadoutEditorPilotButtons = [];
            loadoutEditorWeaponButtons = [];
            return;
        }

        const ownership = getOwnedCosmeticSets(latestCosmeticSnapshot);
        const ownedSkins = ownership?.ownedSkins ?? new Set(['default']);
        const ownedTrails = ownership?.ownedTrails ?? new Set(['rainbow']);

        loadoutEditorPilotGrid.innerHTML = '';
        const pilotFragment = document.createDocumentFragment();
        const pilotButtons = [];
        for (const profile of characterProfiles) {
            if (!profile || typeof profile.id !== 'string') {
                continue;
            }
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'character-card';
            card.dataset.characterId = profile.id;
            card.setAttribute('role', 'listitem');

            const image = document.createElement('img');
            const imageSource = profile.image?.src ?? playerBaseImage?.src ?? 'assets/player.png';
            image.src = imageSource;
            image.alt = profile.name ?? profile.id ?? 'Pilot';
            image.loading = 'lazy';
            card.appendChild(image);

            const nameEl = document.createElement('div');
            nameEl.className = 'character-name';
            nameEl.textContent = profile.name ?? profile.id ?? 'Pilot';
            card.appendChild(nameEl);

            const roleEl = document.createElement('div');
            roleEl.className = 'character-role';
            roleEl.textContent = profile.role ?? '';
            card.appendChild(roleEl);

            const details = document.createElement('div');
            details.className = 'character-details';
            const detailsHeading = document.createElement('strong');
            detailsHeading.textContent = 'Flight Profile';
            details.appendChild(detailsHeading);
            if (profile.summary) {
                const summary = document.createElement('p');
                summary.textContent = profile.summary;
                details.appendChild(summary);
            }
            if (Array.isArray(profile.ongoing) && profile.ongoing.length) {
                const list = document.createElement('ul');
                for (const entry of profile.ongoing) {
                    if (!entry) {
                        continue;
                    }
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(list);
            }
            card.appendChild(details);

            card.addEventListener('click', () => {
                if (profile.id) {
                    setLoadoutEditorSelection('character', profile.id);
                }
            });

            pilotFragment.appendChild(card);
            pilotButtons.push(card);
        }
        loadoutEditorPilotGrid.appendChild(pilotFragment);
        loadoutEditorPilotButtons = pilotButtons;

        loadoutEditorWeaponGrid.innerHTML = '';
        const weaponFragment = document.createDocumentFragment();
        const weaponButtons = [];
        for (const profile of weaponProfiles) {
            if (!profile || typeof profile.id !== 'string') {
                continue;
            }
            const card = document.createElement('button');
            card.type = 'button';
            card.className = 'character-card weapon-card';
            card.dataset.weaponId = profile.id;
            card.setAttribute('role', 'listitem');

            const image = document.createElement('img');
            const imageSource = profile.image?.src ?? defaultWeaponImageSrc;
            image.src = imageSource;
            image.alt = profile.name ?? profile.id ?? 'Weapon';
            image.loading = 'lazy';
            card.appendChild(image);

            const nameEl = document.createElement('div');
            nameEl.className = 'character-name';
            nameEl.textContent = profile.name ?? profile.id ?? 'Weapon';
            card.appendChild(nameEl);

            const details = document.createElement('div');
            details.className = 'character-details';
            const summary = document.createElement('p');
            summary.textContent = profile.summary ?? '';
            details.appendChild(summary);
            if (Array.isArray(profile.highlights) && profile.highlights.length) {
                const list = document.createElement('ul');
                for (const entry of profile.highlights) {
                    if (!entry) {
                        continue;
                    }
                    const item = document.createElement('li');
                    item.textContent = entry;
                    list.appendChild(item);
                }
                details.appendChild(list);
            }
            card.appendChild(details);

            card.addEventListener('click', () => {
                if (profile.id) {
                    setLoadoutEditorSelection('weapon', profile.id);
                }
            });

            weaponFragment.appendChild(card);
            weaponButtons.push(card);
        }
        loadoutEditorWeaponGrid.appendChild(weaponFragment);
        loadoutEditorWeaponButtons = weaponButtons;

        if (loadoutEditorSkinGrid) {
            loadoutEditorSkinGrid.innerHTML = '';
            const skinFragment = document.createDocumentFragment();
            const skinButtons = [];
            const skinOrder = ['default', 'midnight', 'sunrise'];
            for (const skinId of skinOrder) {
                const skin = playerSkins?.[skinId];
                if (!skin) {
                    continue;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'loadout-editor-option';
                button.dataset.skinId = skinId;
                button.setAttribute('role', 'radio');
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-checked', 'false');

                const thumb = document.createElement('span');
                thumb.className = 'loadout-editor-option-thumb';
                const image = document.createElement('img');
                image.src = skin.image?.src ?? playerBaseImage?.src ?? 'assets/player.png';
                image.alt = '';
                image.setAttribute('aria-hidden', 'true');
                thumb.appendChild(image);
                button.appendChild(thumb);

                const meta = document.createElement('span');
                meta.className = 'loadout-editor-option-meta';
                const title = document.createElement('strong');
                title.textContent = skin.label ?? getSkinLabel(skinId);
                meta.appendChild(title);
                const subtitle = document.createElement('span');
                subtitle.textContent = skin.description ?? 'Hull finish';
                meta.appendChild(subtitle);
                button.appendChild(meta);

                if (!ownedSkins.has(skinId)) {
                    button.disabled = true;
                    button.classList.add('locked');
                    button.setAttribute('title', 'Unlock by completing challenges');
                }

                button.addEventListener('click', () => {
                    setLoadoutEditorSelection('skin', skinId);
                });

                skinFragment.appendChild(button);
                skinButtons.push(button);
            }
            loadoutEditorSkinGrid.appendChild(skinFragment);
            loadoutEditorSkinButtons = skinButtons;
        } else {
            loadoutEditorSkinButtons = [];
        }

        if (loadoutEditorTrailGrid) {
            loadoutEditorTrailGrid.innerHTML = '';
            const trailFragment = document.createDocumentFragment();
            const trailButtons = [];
            const trailOrder = ['rainbow', 'aurora', 'ember'];
            for (const trailId of trailOrder) {
                const trail = trailStyles?.[trailId];
                if (!trail) {
                    continue;
                }
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'loadout-editor-option';
                button.dataset.trailId = trailId;
                button.setAttribute('role', 'radio');
                button.setAttribute('aria-pressed', 'false');
                button.setAttribute('aria-checked', 'false');

                const preview = document.createElement('span');
                preview.className = 'loadout-editor-trail-preview';
                preview.style.background = buildTrailSwatchStyle(trail);
                button.appendChild(preview);

                const meta = document.createElement('span');
                meta.className = 'loadout-editor-option-meta';
                const title = document.createElement('strong');
                title.textContent = trail.label ?? getTrailLabel(trailId);
                meta.appendChild(title);
                const subtitle = document.createElement('span');
                if (trail.type === 'palette') {
                    subtitle.textContent = 'Color cycle stream';
                } else if (trail.type === 'spectrum') {
                    subtitle.textContent = 'Spectrum trail';
                } else {
                    subtitle.textContent = 'Trail effect';
                }
                meta.appendChild(subtitle);
                button.appendChild(meta);

                if (!ownedTrails.has(trailId)) {
                    button.disabled = true;
                    button.classList.add('locked');
                    button.setAttribute('title', 'Unlock by completing challenges');
                }

                button.addEventListener('click', () => {
                    setLoadoutEditorSelection('trail', trailId);
                });

                trailFragment.appendChild(button);
                trailButtons.push(button);
            }
            loadoutEditorTrailGrid.appendChild(trailFragment);
            loadoutEditorTrailButtons = trailButtons;
        } else {
            loadoutEditorTrailButtons = [];
        }

        refreshLoadoutEditorSelectionState();
        updateLoadoutEditorSaveState();
        updateLoadoutEditorSummary();
    }

    function closeLoadoutEditor({ restoreFocus = true } = {}) {
        if (!loadoutEditorModal) {
            return;
        }
        loadoutEditorModal.hidden = true;
        loadoutEditorModal.setAttribute('aria-hidden', 'true');
        document.body?.classList.remove('loadout-editor-open');
        loadoutEditorActiveSlotId = null;
        loadoutEditorPilotButtons = [];
        loadoutEditorWeaponButtons = [];
        loadoutEditorPendingCharacterId = null;
        loadoutEditorPendingWeaponId = null;
        loadoutEditorSkinButtons = [];
        loadoutEditorTrailButtons = [];
        loadoutEditorPendingSkinId = null;
        loadoutEditorPendingTrailId = null;
        updateLoadoutEditorSummary();
        if (restoreFocus && loadoutEditorReturnFocus instanceof HTMLElement) {
            try {
                loadoutEditorReturnFocus.focus({ preventScroll: true });
            } catch (error) {
                loadoutEditorReturnFocus.focus();
            }
        }
        loadoutEditorReturnFocus = null;
    }

    function openLoadoutEditor(slotId, { trigger = null } = {}) {
        if (!loadoutEditorModal) {
            return;
        }
        const loadout = getCustomLoadout(slotId);
        if (!loadout) {
            return;
        }
        setLoadoutStatus(slotId, null);
        loadoutEditorActiveSlotId = slotId;
        loadoutEditorReturnFocus = trigger instanceof HTMLElement ? trigger : null;
        const currentSelection = getCurrentCosmeticsSelection();
        loadoutEditorPendingCharacterId = loadout.characterId ?? activeCharacterId ?? 'nova';
        loadoutEditorPendingWeaponId =
            loadout.weaponId ?? currentSelection?.weapon ?? activeWeaponId ?? 'pulse';
        loadoutEditorPendingSkinId = loadout.skinId ?? currentSelection?.skin ?? 'default';
        loadoutEditorPendingTrailId = loadout.trailId ?? currentSelection?.trail ?? 'rainbow';
        if (loadoutEditorTitle) {
            const presetName = loadout.name ?? 'Custom Loadout';
            loadoutEditorTitle.textContent = `Customize ${presetName}`;
        }
        if (loadoutEditorSubtitle) {
            const presetName = loadout.name ?? 'this preset';
            loadoutEditorSubtitle.textContent = `Browse pilots, weapons, suits, and streams to tailor ${presetName}. Saving will store the selections to the chosen loadout slot.`;
        }
        renderLoadoutEditorOptions();
        refreshLoadoutEditorSelectionState();
        updateLoadoutEditorSaveState();
        updateLoadoutEditorSummary();

        loadoutEditorModal.hidden = false;
        loadoutEditorModal.setAttribute('aria-hidden', 'false');
        document.body?.classList.add('loadout-editor-open');

        const focusTarget =
            loadoutEditorPilotButtons.find(
                (button) => button instanceof HTMLElement && button.dataset.characterId === loadoutEditorPendingCharacterId
            ) ?? loadoutEditorCloseButton ?? loadoutEditorSaveButton;
        if (focusTarget instanceof HTMLElement) {
            try {
                focusTarget.focus({ preventScroll: true });
            } catch (error) {
                focusTarget.focus();
            }
        }
    }

    function saveLoadoutEditorSelection() {
        if (!loadoutEditorActiveSlotId) {
            return;
        }
        const characterId = loadoutEditorPendingCharacterId;
        const weaponId = loadoutEditorPendingWeaponId;
        const skinId = loadoutEditorPendingSkinId;
        const trailId = loadoutEditorPendingTrailId;
        if (!characterId || !weaponId || !skinId || !trailId) {
            return;
        }
        const slotId = loadoutEditorActiveSlotId;
        updateCustomLoadout(slotId, { characterId, weaponId, skinId, trailId }, { persist: true });
        applyCustomLoadout(slotId, { statusMessage: 'Preset saved and equipped.' });
        if (customLoadoutGrid) {
            loadoutEditorReturnFocus = customLoadoutGrid.querySelector(
                `[data-loadout-id="${slotId}"] [data-loadout-action="edit"]`
            );
        }
        closeLoadoutEditor({ restoreFocus: true });
    }

    function renderCustomLoadouts(snapshot = latestCosmeticSnapshot) {
        if (!customLoadoutGrid) {
            return;
        }
        if (snapshot !== undefined) {
            latestCosmeticSnapshot = snapshot;
        }
        normalizeCustomLoadouts({ persist: false });
        const ownership = getOwnedCosmeticSets(latestCosmeticSnapshot);
        const currentSelection = getCurrentCosmeticsSelection();
        const escapeAttributeValue = (value) => {
            if (typeof value !== 'string') {
                return '';
            }
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(value);
            }
            return value.replace(/"/g, '\\"');
        };

        const activeElement =
            document.activeElement instanceof HTMLElement && customLoadoutGrid.contains(document.activeElement)
                ? document.activeElement
                : null;
        let restoreFocusSelector = null;
        if (activeElement) {
            const activeCard = activeElement.closest('[data-loadout-id]');
            const slotId = activeCard?.dataset.loadoutId;
            if (slotId) {
                const escapedSlot = escapeAttributeValue(slotId);
                if (activeElement.dataset.loadoutAction) {
                    const escapedAction = escapeAttributeValue(activeElement.dataset.loadoutAction);
                    restoreFocusSelector = `[data-loadout-id="${escapedSlot}"] [data-loadout-action="${escapedAction}"]`;
                } else if (activeElement.dataset.loadoutControl) {
                    const escapedControl = escapeAttributeValue(activeElement.dataset.loadoutControl);
                    restoreFocusSelector = `[data-loadout-id="${escapedSlot}"] [data-loadout-control="${escapedControl}"]`;
                }
            }
        }

        customLoadoutGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        for (let index = 0; index < customLoadouts.length; index += 1) {
            const loadout = customLoadouts[index];
            if (!loadout) {
                continue;
            }
            const slotMeta = getLoadoutSlotMeta(loadout.slot) ?? CUSTOM_LOADOUT_SLOTS[index] ?? null;
            const card = document.createElement('section');
            card.className = 'custom-loadout-card';
            card.dataset.loadoutId = loadout.slot ?? `slot${index + 1}`;
            card.setAttribute('role', 'listitem');

            const matchesSelection = doesLoadoutMatchSelection(loadout, currentSelection);
            const isActive = matchesSelection && loadout.slot === activeLoadoutId;
            if (isActive) {
                card.classList.add('is-active');
                const badge = document.createElement('span');
                badge.className = 'custom-loadout-badge';
                badge.textContent = 'Active';
                card.appendChild(badge);
            }

            const header = document.createElement('div');
            header.className = 'custom-loadout-header';
            const nameField = document.createElement('div');
            nameField.className = 'custom-loadout-name-field';
            const inputId = `customLoadoutName-${loadout.slot ?? index}`;
            const nameLabel = document.createElement('label');
            nameLabel.className = 'custom-loadout-name-label';
            nameLabel.setAttribute('for', inputId);
            nameLabel.textContent = 'Preset Name';
            const nameInput = document.createElement('input');
            nameInput.id = inputId;
            nameInput.type = 'text';
            nameInput.className = 'custom-loadout-name-input';
            nameInput.value = loadout.name ?? slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
            nameInput.placeholder = slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
            nameInput.maxLength = MAX_LOADOUT_NAME_LENGTH;
            nameInput.autocomplete = 'off';
            nameInput.spellcheck = false;
            nameInput.dataset.loadoutControl = 'name';
            nameField.appendChild(nameLabel);
            nameField.appendChild(nameInput);
            header.appendChild(nameField);

            const headerActions = document.createElement('div');
            headerActions.className = 'custom-loadout-header-actions';

            const saveButton = document.createElement('button');
            saveButton.type = 'button';
            saveButton.className = 'custom-loadout-save';
            saveButton.dataset.loadoutAction = 'save';
            saveButton.textContent = 'Save Current Setup';
            headerActions.appendChild(saveButton);

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'custom-loadout-edit';
            editButton.dataset.loadoutAction = 'edit';
            editButton.textContent = 'Customize Preset';
            const presetName = loadout.name ?? slotMeta?.defaultName ?? `Custom Loadout ${index + 1}`;
            editButton.setAttribute('aria-label', `Customize ${presetName}`);
            headerActions.appendChild(editButton);

            header.appendChild(headerActions);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'custom-loadout-body';
            const pilotProfile =
                getCharacterProfile(loadout.characterId) ??
                getCharacterProfile(activeCharacter) ??
                characterProfiles?.[0] ??
                null;
            const pilotRow = document.createElement('div');
            pilotRow.className = 'custom-loadout-preview-row';
            const pilotThumb = document.createElement('div');
            pilotThumb.className = 'custom-loadout-preview-thumb';
            const pilotImage = document.createElement('img');
            const pilotSrc =
                pilotProfile?.image?.src ??
                playerSkins?.[loadout.skinId]?.image?.src ??
                playerSkins?.default?.image?.src ??
                playerBaseImage?.src ??
                'assets/player.png';
            pilotImage.src = pilotSrc;
            pilotImage.alt = pilotProfile?.name ? `${pilotProfile.name} portrait` : 'Pilot preview';
            pilotImage.loading = 'lazy';
            pilotThumb.appendChild(pilotImage);
            pilotRow.appendChild(pilotThumb);
            const pilotInfo = document.createElement('div');
            pilotInfo.className = 'custom-loadout-preview-info';
            const pilotTitle = document.createElement('span');
            pilotTitle.className = 'custom-loadout-preview-title';
            pilotTitle.textContent = 'Pilot';
            const pilotName = document.createElement('span');
            pilotName.className = 'custom-loadout-preview-value';
            pilotName.textContent = pilotProfile?.name ?? loadout.characterId ?? 'Pilot';
            const pilotButton = document.createElement('button');
            pilotButton.type = 'button';
            pilotButton.className = 'custom-loadout-link';
            pilotButton.dataset.loadoutAction = 'open-pilot';
            pilotButton.textContent = 'Choose Pilot';
            pilotInfo.appendChild(pilotTitle);
            pilotInfo.appendChild(pilotName);
            pilotInfo.appendChild(pilotButton);
            pilotRow.appendChild(pilotInfo);
            body.appendChild(pilotRow);

            const weaponRow = document.createElement('div');
            weaponRow.className = 'custom-loadout-preview-row';
            const weaponThumb = document.createElement('div');
            weaponThumb.className = 'custom-loadout-preview-thumb';
            const weaponImage = document.createElement('img');
            const weaponProfile = getWeaponProfile(loadout.weaponId) ?? getDefaultWeaponProfile();
            weaponImage.src = weaponProfile?.image?.src ?? defaultWeaponImageSrc;
            weaponImage.alt = weaponProfile?.name ? `${weaponProfile.name} loadout` : 'Weapon loadout';
            weaponImage.loading = 'lazy';
            weaponThumb.appendChild(weaponImage);
            weaponRow.appendChild(weaponThumb);
            const weaponInfo = document.createElement('div');
            weaponInfo.className = 'custom-loadout-preview-info';
            const weaponTitle = document.createElement('span');
            weaponTitle.className = 'custom-loadout-preview-title';
            weaponTitle.textContent = 'Weapon';
            const weaponName = document.createElement('span');
            weaponName.className = 'custom-loadout-preview-value';
            weaponName.textContent = weaponProfile?.name ?? loadout.weaponId ?? 'Weapon';
            const weaponButton = document.createElement('button');
            weaponButton.type = 'button';
            weaponButton.className = 'custom-loadout-link';
            weaponButton.dataset.loadoutAction = 'open-weapon';
            weaponButton.textContent = 'Choose Weapon';
            weaponInfo.appendChild(weaponTitle);
            weaponInfo.appendChild(weaponName);
            weaponInfo.appendChild(weaponButton);
            weaponRow.appendChild(weaponInfo);
            body.appendChild(weaponRow);

            const tagGrid = document.createElement('div');
            tagGrid.className = 'custom-loadout-tags';
            const suitTag = document.createElement('div');
            suitTag.className = 'custom-loadout-tag';
            const suitLabel = document.createElement('span');
            suitLabel.className = 'custom-loadout-tag-label';
            suitLabel.textContent = 'Suit';
            const suitValue = document.createElement('span');
            suitValue.className = 'custom-loadout-tag-value';
            suitValue.textContent = getSkinLabel(loadout.skinId);
            const suitButton = document.createElement('button');
            suitButton.type = 'button';
            suitButton.className = 'custom-loadout-link';
            suitButton.dataset.loadoutAction = 'open-skin';
            suitButton.textContent = 'Adjust Suit';
            suitTag.appendChild(suitLabel);
            suitTag.appendChild(suitValue);
            suitTag.appendChild(suitButton);

            const trailTag = document.createElement('div');
            trailTag.className = 'custom-loadout-tag';
            const trailLabel = document.createElement('span');
            trailLabel.className = 'custom-loadout-tag-label';
            trailLabel.textContent = 'Stream';
            const trailValue = document.createElement('span');
            trailValue.className = 'custom-loadout-tag-value';
            trailValue.textContent = getTrailLabel(loadout.trailId);
            const trailSwatch = document.createElement('span');
            trailSwatch.className = 'custom-loadout-trail-swatch';
            const trailStyle = trailStyles?.[loadout.trailId] ?? trailStyles?.rainbow;
            trailSwatch.style.background = buildTrailSwatchStyle(trailStyle);
            const trailButton = document.createElement('button');
            trailButton.type = 'button';
            trailButton.className = 'custom-loadout-link';
            trailButton.dataset.loadoutAction = 'open-trail';
            trailButton.textContent = 'Adjust Stream';
            trailTag.appendChild(trailLabel);
            trailTag.appendChild(trailValue);
            trailTag.appendChild(trailSwatch);
            trailTag.appendChild(trailButton);

            tagGrid.appendChild(suitTag);
            tagGrid.appendChild(trailTag);
            body.appendChild(tagGrid);

            const missingItems = [];
            if (!ownership.ownedSkins.has(loadout.skinId)) {
                missingItems.push(getSkinLabel(loadout.skinId));
            }
            if (!ownership.ownedTrails.has(loadout.trailId)) {
                missingItems.push(getTrailLabel(loadout.trailId));
            }
            if (!ownership.ownedWeapons.has(loadout.weaponId)) {
                missingItems.push(getWeaponLabel(loadout.weaponId));
            }
            if (missingItems.length) {
                card.classList.add('has-locked');
                const lockedNote = document.createElement('p');
                lockedNote.className = 'custom-loadout-locked';
                lockedNote.textContent = `Unlock required: ${missingItems.join(', ')}`;
                body.appendChild(lockedNote);
            }
            card.appendChild(body);

            const footer = document.createElement('div');
            footer.className = 'custom-loadout-footer';
            const applyButton = document.createElement('button');
            applyButton.type = 'button';
            applyButton.className = 'custom-loadout-apply';
            applyButton.dataset.loadoutAction = 'apply';
            applyButton.textContent = 'Equip Loadout';
            footer.appendChild(applyButton);
            const status = document.createElement('p');
            status.className = 'custom-loadout-status';
            status.setAttribute('role', 'status');
            const statusInfo = loadoutStatusMessages.get(loadout.slot);
            status.classList.remove('error');
            status.classList.remove('success');
            if (statusInfo && statusInfo.message) {
                status.textContent = statusInfo.message;
                if (statusInfo.type === 'error') {
                    status.classList.add('error');
                } else if (statusInfo.type === 'success') {
                    status.classList.add('success');
                }
                status.removeAttribute('hidden');
            } else {
                status.textContent = '';
                status.setAttribute('hidden', '');
            }
            footer.appendChild(status);
            card.appendChild(footer);

            fragment.appendChild(card);
        }

        customLoadoutGrid.appendChild(fragment);

        if (restoreFocusSelector) {
            const nextFocus = customLoadoutGrid.querySelector(restoreFocusSelector);
            if (nextFocus instanceof HTMLElement) {
                try {
                    nextFocus.focus({ preventScroll: true });
                } catch (error) {
                    nextFocus.focus();
                }
            }
        }

        updateActiveLoadoutPrompt();
        renderPilotPreview();
    }

    function focusCosmeticOption(container, datasetKey, value) {
        if (!container) {
            return;
        }
        const escapeValue = (raw) => {
            if (typeof raw !== 'string') {
                return '';
            }
            if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
                return CSS.escape(raw);
            }
            return raw.replace(/"/g, '\\"');
        };
        let selector = `[data-${datasetKey}]`;
        if (typeof value === 'string' && value) {
            selector = `[data-${datasetKey}="${escapeValue(value)}"]`;
        }
        let target = null;
        if (typeof value === 'string' && value) {
            target = container.querySelector(selector);
        }
        if (!(target instanceof HTMLElement)) {
            target = container.querySelector(`[data-${datasetKey}]`);
        }
        if (target instanceof HTMLElement) {
            try {
                target.focus({ preventScroll: false });
            } catch (error) {
                target.focus();
            }
            if (typeof target.scrollIntoView === 'function') {
                target.scrollIntoView({ block: 'center', behavior: 'smooth' });
            }
        } else if (typeof container.scrollIntoView === 'function') {
            container.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    function saveCustomLoadoutFromCurrent(slotId) {
        const loadout = getCustomLoadout(slotId);
        if (!loadout) {
            return;
        }
        const current = getCurrentCosmeticsSelection();
        updateCustomLoadout(
            slotId,
            {
                characterId: activeCharacterId ?? loadout.characterId,
                weaponId: current.weapon,
                skinId: current.skin,
                trailId: current.trail
            },
            { persist: true }
        );
        setActiveLoadoutId(slotId);
        syncActiveLoadoutState();
        setLoadoutStatus(slotId, 'Saved current setup.', 'success');
        renderCustomLoadouts(latestCosmeticSnapshot);
    }

    function applyCustomLoadout(slotId, { statusMessage = null } = {}) {
        const loadout = getCustomLoadout(slotId);
        if (!loadout) {
            return;
        }
        normalizeCustomLoadouts({ persist: false });
        const current = getCurrentCosmeticsSelection();
        const blocked = [];
        runWithSuppressedActiveLoadoutSync(() => {
            const profile = getCharacterProfile(loadout.characterId);
            if (profile && loadout.characterId !== activeCharacterId) {
                setActiveCharacter(profile);
            }
            if (challengeManager && typeof challengeManager.equipCosmetic === 'function') {
                if (loadout.skinId && loadout.skinId !== current.skin) {
                    const equippedSkin = challengeManager.equipCosmetic('skin', loadout.skinId);
                    if (!equippedSkin && loadout.skinId !== current.skin) {
                        blocked.push(getSkinLabel(loadout.skinId));
                    }
                }
                if (loadout.trailId && loadout.trailId !== current.trail) {
                    const equippedTrail = challengeManager.equipCosmetic('trail', loadout.trailId);
                    if (!equippedTrail && loadout.trailId !== current.trail) {
                        blocked.push(getTrailLabel(loadout.trailId));
                    }
                }
                if (loadout.weaponId && loadout.weaponId !== current.weapon) {
                    const equippedWeapon = challengeManager.equipCosmetic('weapon', loadout.weaponId);
                    if (!equippedWeapon && loadout.weaponId !== current.weapon) {
                        blocked.push(getWeaponLabel(loadout.weaponId));
                    }
                }
            } else {
                const nextEquipped = {
                    ...lastEquippedCosmetics,
                    skin: loadout.skinId,
                    trail: loadout.trailId,
                    weapon: loadout.weaponId
                };
                applyEquippedCosmetics(nextEquipped);
            }
        });

        if (blocked.length) {
            setLoadoutStatus(slotId, `Unlock required: ${blocked.join(', ')}`, 'error');
            syncActiveLoadoutState();
            renderCustomLoadouts(latestCosmeticSnapshot);
            return;
        }

        setActiveLoadoutId(slotId);
        syncActiveLoadoutState();
        const label = getCustomLoadout(slotId)?.name ?? 'Loadout';
        const equippedMessage = statusMessage ?? `${label} equipped.`;
        setLoadoutStatus(slotId, equippedMessage, 'success');
        renderCustomLoadouts(latestCosmeticSnapshot);
    }

    function handleCustomLoadoutClick(event) {
        const origin = event.target instanceof HTMLElement ? event.target : null;
        if (!origin) {
            return;
        }
        const slotElement = origin.closest('[data-loadout-id]');
        const slotId = slotElement?.dataset.loadoutId;
        if (!slotId) {
            return;
        }
        const trigger = origin.closest('[data-loadout-action]');
        if (!trigger) {
            const interactive = origin.closest(
                'button, input, select, textarea, label, [data-loadout-action], [data-loadout-control]'
            );
            if (!interactive) {
                event.preventDefault();
                openLoadoutEditor(slotId, { trigger: slotElement });
            }
            return;
        }
        if (trigger.disabled) {
            return;
        }
        const action = trigger.dataset.loadoutAction;
        if (action === 'save') {
            event.preventDefault();
            saveCustomLoadoutFromCurrent(slotId);
            return;
        }
        if (action === 'apply') {
            event.preventDefault();
            applyCustomLoadout(slotId);
            return;
        }
        if (action === 'open-pilot') {
            event.preventDefault();
            setLoadoutStatus(slotId, null);
            requestPilotSelection('loadout');
            return;
        }
        if (action === 'open-weapon') {
            event.preventDefault();
            setLoadoutStatus(slotId, null);
            openWeaponSelect({ trigger });
            return;
        }
        if (action === 'open-skin') {
            event.preventDefault();
            setLoadoutStatus(slotId, null);
            focusCosmeticOption(skinOptionsEl, 'skin-id', getCustomLoadout(slotId)?.skinId);
            return;
        }
        if (action === 'open-trail') {
            event.preventDefault();
            setLoadoutStatus(slotId, null);
            focusCosmeticOption(trailOptionsEl, 'trail-id', getCustomLoadout(slotId)?.trailId);
            return;
        }
        if (action === 'edit') {
            event.preventDefault();
            openLoadoutEditor(slotId, { trigger });
            return;
        }
    }

    function handleCustomLoadoutChange(event) {
        const target = event.target instanceof HTMLInputElement ? event.target : null;
        if (!target || target.dataset.loadoutControl !== 'name') {
            return;
        }
        const slotElement = target.closest('[data-loadout-id]');
        const slotId = slotElement?.dataset.loadoutId;
        if (!slotId) {
            return;
        }
        const slotMeta = getLoadoutSlotMeta(slotId) ?? null;
        const fallbackName = slotMeta?.defaultName ?? target.value ?? 'Custom Loadout';
        const sanitized = sanitizeLoadoutName(target.value, fallbackName);
        if (sanitized !== target.value) {
            target.value = sanitized;
        }
        const previous = getCustomLoadout(slotId)?.name;
        setCustomLoadoutName(slotId, sanitized, { persist: true });
        if (previous !== sanitized) {
            setLoadoutStatus(slotId, 'Name updated.', 'success');
            renderCustomLoadouts(latestCosmeticSnapshot);
        }
    }
    const projectileArchetypes = {
        standard: {
            width: 24,
            height: 12,
            life: 2000,
            speedMultiplier: 1,
            damage: 1,
            gradient: ['#00e5ff', '#6a5acd']
        },
        spread: {
            width: 24,
            height: 12,
            life: 1800,
            speedMultiplier: 1,
            damage: 1,
            gradient: ['#b39ddb', '#7e57c2']
        },
        missile: {
            width: 28,
            height: 14,
            life: 2800,
            speedMultiplier: 0.85,
            damage: 2
        },
        flameWhip: {
            width: 46,
            height: 24,
            life: 520,
            speedMultiplier: 1.24,
            damage: 1,
            gradient: ['#450a0a', '#9f1239', '#f97316'],
            glow: 'rgba(248, 113, 113, 0.55)',
            shadowBlur: 18,
            shadowColor: 'rgba(248, 113, 113, 0.4)',
            shape: 'flameWhip'
        },
        pulseCore: {
            width: 26,
            height: 12,
            life: 2100,
            speedMultiplier: 1.1,
            damage: 1,
            gradient: ['#38bdf8', '#a855f7'],
            glow: 'rgba(168, 85, 247, 0.6)',
            shadowColor: 'rgba(56, 189, 248, 0.45)',
            shadowBlur: 12
        },
        pulseWing: {
            width: 20,
            height: 10,
            life: 1900,
            speedMultiplier: 1.05,
            damage: 1,
            gradient: ['#22d3ee', '#818cf8'],
            glow: 'rgba(129, 140, 248, 0.5)',
            shadowColor: 'rgba(45, 212, 191, 0.4)',
            shadowBlur: 8
        },
        pulseResonance: {
            width: 18,
            height: 10,
            life: 2500,
            speedMultiplier: 0.9,
            damage: 1,
            gradient: ['#67e8f9', '#c4b5fd'],
            glow: 'rgba(103, 232, 249, 0.55)',
            shadowColor: 'rgba(147, 197, 253, 0.4)',
            shadowBlur: 10
        },
        scatter: {
            width: 22,
            height: 10,
            life: 1800,
            speedMultiplier: 0.92,
            damage: 1,
            gradient: ['#ffe29a', '#fb923c', '#f97316'],
            glow: 'rgba(249, 115, 22, 0.45)',
            shadowColor: 'rgba(255, 140, 66, 0.35)',
            shadowBlur: 8
        },
        scatterBloom: {
            width: 20,
            height: 10,
            life: 1850,
            speedMultiplier: 0.94,
            damage: 1,
            gradient: ['#f97316', '#f472b6'],
            glow: 'rgba(249, 115, 22, 0.45)',
            shadowColor: 'rgba(236, 72, 153, 0.35)',
            shadowBlur: 10
        },
        scatterTwist: {
            width: 18,
            height: 9,
            life: 2000,
            speedMultiplier: 0.98,
            damage: 1,
            gradient: ['#fb7185', '#fbbf24'],
            glow: 'rgba(251, 113, 133, 0.4)',
            shadowColor: 'rgba(251, 191, 36, 0.3)',
            shadowBlur: 8
        },
        scatterDrift: {
            width: 22,
            height: 11,
            life: 2300,
            speedMultiplier: 0.85,
            damage: 1,
            gradient: ['#fcd34d', '#f97316'],
            glow: 'rgba(252, 211, 77, 0.4)',
            shadowColor: 'rgba(251, 146, 60, 0.35)',
            shadowBlur: 12
        },
        scatterBurst: {
            width: 24,
            height: 12,
            life: 2000,
            speedMultiplier: 1,
            damage: 2,
            gradient: ['#fed7aa', '#fb923c'],
            glow: 'rgba(251, 191, 36, 0.4)',
            shadowColor: 'rgba(251, 146, 60, 0.35)',
            shadowBlur: 12
        },
        lance: {
            width: 34,
            height: 16,
            life: 2400,
            speedMultiplier: 1.15,
            damage: 2,
            gradient: ['#e0f2fe', '#38bdf8', '#0ea5e9'],
            glow: 'rgba(14, 165, 233, 0.7)',
            shadowColor: 'rgba(125, 211, 252, 0.5)',
            shadowBlur: 14,
            shape: 'lance'
        },
        lanceTracer: {
            width: 28,
            height: 12,
            life: 2600,
            speedMultiplier: 1.05,
            damage: 1,
            gradient: ['#bae6fd', '#818cf8'],
            glow: 'rgba(125, 211, 252, 0.55)',
            shadowColor: 'rgba(129, 140, 248, 0.35)',
            shadowBlur: 12
        },
        lanceEcho: {
            width: 20,
            height: 10,
            life: 2400,
            speedMultiplier: 0.92,
            damage: 1,
            gradient: ['#f0abfc', '#38bdf8'],
            glow: 'rgba(192, 132, 252, 0.5)',
            shadowColor: 'rgba(56, 189, 248, 0.35)',
            shadowBlur: 10
        },
        lanceCore: {
            width: 42,
            height: 18,
            life: 2600,
            speedMultiplier: 1.25,
            damage: 3,
            gradient: ['#fef3c7', '#38bdf8', '#0ea5e9'],
            glow: 'rgba(56, 189, 248, 0.8)',
            shadowColor: 'rgba(191, 219, 254, 0.6)',
            shadowBlur: 16,
            shape: 'lance'
        }
    };
    const cosmeticsCatalog = {
        skins: playerSkins,
        trails: {
            rainbow: trailStyles.rainbow,
            aurora: trailStyles.aurora,
            ember: trailStyles.ember
        },
        weapons: weaponLoadouts
    };
    const defaultCollectScore = 80;

    const baseGameConfig = {
        baseGameSpeed: 160,
        speedGrowth: 5,
        obstacleSpawnInterval: 950,
        collectibleSpawnInterval: 1400,
        powerUpSpawnInterval: 11000,
        trailSpacing: 18,
        baseTrailLength: 20,
        trailGrowthPerStreak: 0.4,
        tailSmoothing: {
            growth: 32,
            shrink: 64
        },
        comboDecayWindow: 3200,
        projectileCooldown: 200,
        projectileSpeed: 900,
        difficulty: {
            rampDuration: 90000,
            speedRamp: { start: 0.28, end: 0.9 },
            spawnIntensity: {
                obstacle: { start: 0.38, end: 1.08 },
                collectible: { start: 0.68, end: 1.02 },
                powerUp: { start: 0.58, end: 0.95 }
            },
            healthRamp: { start: 0.7, end: 1.25 }
        },
        player: {
            width: 138,
            height: 138,
            acceleration: 2100,
            drag: 5.2,
            maxSpeed: 480,
            verticalBleed: 0.069,
            dash: {
                boostSpeed: 960,
                duration: 220,
                doubleTapWindow: 260,
                dragMultiplier: 0.35
            }
        },
        obstacle: {
            minSize: 48,
            maxSize: 147,
            minSpeed: -20,
            maxSpeed: 70
        },
        collectible: {
            size: 48,
            minSpeed: -30,
            maxSpeed: 30,
            verticalPadding: 55
        },
        powerUp: {
            size: 98,
            minSpeed: -20,
            maxSpeed: 20,
            wobbleAmplitude: 28,
            wobbleSpeed: 3.4,
            duration: {
                powerBomb: 5200,
                bulletSpread: 6200,
                flameWhip: 6200,
                missiles: 5600,
                [DOUBLE_TEAM_POWER]: 6200,
                hyperBeam: 5600,
                radiantShield: 7200,
                pumpDrive: 6200,
                timeDilation: 6400,
                scoreSurge: 6200,
                starlightMagnet: 7000
            }
        },
        hyperBeam: {
            beamHeight: 190,
            extraLength: 60,
            rampUp: 280,
            fadeOut: 220,
            damagePerSecond: 24,
            asteroidDamagePerSecond: 30,
            sparkInterval: 140,
            hitSparkRate: 7,
            jitterAmplitude: 18,
            waveSpeed: 0.006
        },
        defensePower: {
            clearance: 18,
            obstacleBounceDuration: 620,
            obstacleKnockback: 520,
            obstacleSpeedMultiplier: 1.15,
            asteroidKnockback: 460,
            hitCooldown: 520,
            particleColor: { r: 148, g: 210, b: 255 },
            auraColor: { r: 150, g: 214, b: 255 },
            auraPulse: 0.18,
            bounceDrag: 3.6
        },
        timeDilationPower: {
            worldSpeedMultiplier: 0.6,
            spawnRateMultiplier: 0.65
        },
        scoreSurgePower: {
            scoreMultiplier: 1.5
        },
        magnetPower: {
            pullRadius: 320,
            pullStrength: 820,
            maxSpeed: 520
        },
        doubleTeamPower: {
            separation: 140,
            catchUpRate: 6.5,
            trailSpacingScale: 0.85,
            wobbleSpeed: 3.2,
            wobbleAmplitude: 6.5
        },
        star: {
            count: 120,
            baseSpeed: 120
        },
        asteroid: {
            initialCount: 4,
            maxCount: 6,
            spawnInterval: 2600,
            clusterRadius: 160,
            minSpacing: 14,
            scale: 0.46,
            bounceRestitution: 0.88,
            collisionRadiusMultiplier: 0.88,
            sizeRange: [104, 242],
            speedRange: [40, 140],
            rotationSpeedRange: [-0.6, 0.6],
            driftRange: [-18, 18],
            depthRange: [0.35, 1],
            meteorShowerInterval: 22000,
            meteorShowerVariance: 8000,
            meteorShowerCount: 5,
            meteorShowerSpeedMultiplier: 1.15,
            trail: {
                spacing: 34,
                maxPoints: 14,
                life: 520,
                widthScale: 0.42,
                lengthScale: 0.78
            }
        },
        comboMultiplierStep: 0.15,
        score: {
            collect: defaultCollectScore,
            destroy: 120,
            asteroid: 60,
            dodge: 18,
            villainEscape: 140
        }
    };

    function buildConfigForPreset(presetId) {
        const preset = getDifficultyPreset(presetId);
        const baseClone = cloneConfig(baseGameConfig);
        const withPreset = applyOverrides(baseClone, preset?.overrides ?? {});
        return applyOverrides(withPreset, gameplayOverrides ?? {});
    }

    const initialDifficultyPreset = normalizeDifficultySetting(
        settingsState?.difficulty ?? activeDifficultyPreset ?? DEFAULT_DIFFICULTY_ID
    );
    activeDifficultyPreset = initialDifficultyPreset;
    config = buildConfigForPreset(initialDifficultyPreset);
    basePlayerConfig = cloneConfig(config.player);
    baseDashConfig = cloneConfig(config.player.dash);
    baseProjectileSettings = {
        cooldown: config.projectileCooldown,
        speed: config.projectileSpeed
    };
    reschedulePowerUps({ resetHistory: true, resetTimer: true, initialDelay: true });
    function getCharacterProfile(id) {
        return characterProfileMap.get(id ?? '') ?? null;
    }

    function resetCharacterTuning() {
        config.player.width = basePlayerConfig.width;
        config.player.height = basePlayerConfig.height;
        config.player.acceleration = basePlayerConfig.acceleration;
        config.player.drag = basePlayerConfig.drag;
        config.player.maxSpeed = basePlayerConfig.maxSpeed;
        config.player.verticalBleed = basePlayerConfig.verticalBleed;
        config.player.dash.boostSpeed = baseDashConfig.boostSpeed;
        config.player.dash.duration = baseDashConfig.duration;
        config.player.dash.doubleTapWindow = baseDashConfig.doubleTapWindow;
        config.player.dash.dragMultiplier = baseDashConfig.dragMultiplier;
        config.projectileCooldown = baseProjectileSettings.cooldown;
        config.projectileSpeed = baseProjectileSettings.speed;
        ensureDoubleTeamCloneDimensions();
    }

    function applyCharacterOverrides(profile) {
        if (!profile) {
            return;
        }
        resetCharacterTuning();
        const overrides = profile.overrides ?? {};
        if (overrides.player && typeof overrides.player === 'object') {
            Object.assign(config.player, overrides.player);
        }
        if (overrides.dash && typeof overrides.dash === 'object') {
            Object.assign(config.player.dash, overrides.dash);
        }
        if (overrides.projectile && typeof overrides.projectile === 'object') {
            if (Number.isFinite(overrides.projectile.cooldown)) {
                config.projectileCooldown = Math.max(60, Number(overrides.projectile.cooldown));
            }
            if (Number.isFinite(overrides.projectile.speed)) {
                config.projectileSpeed = Math.max(120, Number(overrides.projectile.speed));
            }
        }
        if (player) {
            player.width = config.player.width;
            player.height = config.player.height;
            ensureDoubleTeamCloneDimensions();
        }
    }

    function applyDifficultyPreset(presetId, { announce = false } = {}) {
        const normalized = normalizeDifficultySetting(presetId);
        if (!config) {
            activeDifficultyPreset = normalized;
            return normalized;
        }
        if (normalized === activeDifficultyPreset) {
            return normalized;
        }

        const previousConfig = config;
        const previousRampDuration =
            previousConfig?.difficulty?.rampDuration ?? baseGameConfig.difficulty.rampDuration;
        const previousProgress =
            previousRampDuration > 0 ? clamp(state.elapsedTime / previousRampDuration, 0, 1) : 0;

        const nextConfig = buildConfigForPreset(normalized);
        config = nextConfig;
        basePlayerConfig = cloneConfig(config.player);
        baseDashConfig = cloneConfig(config.player.dash);
        baseProjectileSettings = {
            cooldown: config.projectileCooldown,
            speed: config.projectileSpeed
        };
        activeDifficultyPreset = normalized;

        const activeProfile = getCharacterProfile(activeCharacterId);
        if (activeProfile) {
            applyCharacterOverrides(activeProfile);
        } else {
            resetCharacterTuning();
        }

        const nextRampDuration = config.difficulty?.rampDuration ?? previousRampDuration;
        if (Number.isFinite(nextRampDuration) && nextRampDuration > 0) {
            state.elapsedTime = clamp(previousProgress, 0, 1) * nextRampDuration;
        } else {
            state.elapsedTime = 0;
        }

        if (state.gameState !== 'running') {
            state.gameSpeed = config.baseGameSpeed;
        } else {
            const approxSpeed = config.baseGameSpeed + config.speedGrowth * clamp(previousProgress, 0, 1);
            state.gameSpeed = Math.max(config.baseGameSpeed, approxSpeed);
        }

        if (spawnTimers) {
            spawnTimers.obstacle = 0;
            spawnTimers.collectible = 0;
            reschedulePowerUps({ resetHistory: true, resetTimer: true, initialDelay: true });
        }

        const baseCollectScoreRaw = config?.score?.collect;
        const baseCollectScore = Number.isFinite(Number(baseCollectScoreRaw))
            ? Math.max(1, Number(baseCollectScoreRaw))
            : defaultCollectScore;
        if (!config.score || !isPlainObject(config.score)) {
            config.score = { ...baseGameConfig.score };
        }
        config.score.collect = baseCollectScore;

        if (announce) {
            const preset = getDifficultyPreset(normalized);
            if (preset && typeof addSocialMoment === 'function') {
                addSocialMoment(`${preset.label} difficulty calibrated.`, { type: 'system' });
            }
        }

        return normalized;
    }

    function setActiveCharacter(profile) {
        if (!profile) {
            return;
        }
        applyCharacterOverrides(profile);
        selectedCharacterImage = profile.image ?? playerBaseImage;
        if (playerSkins?.default) {
            playerSkins.default.image = selectedCharacterImage;
        }
        activeCharacterId = profile.id;
        pendingCharacterId = profile.id;
        if (isCharacterSelectOpen()) {
            updateCharacterSummaryDisplay(profile);
        }
        updateCharacterConfirmState();
        applyEquippedCosmetics(lastEquippedCosmetics);
        refreshPilotPreviewStates();
        updateSwapPilotButton();
    }

    function updateCharacterSummaryDisplay(profile) {
        if (!characterSelectSummary) {
            return;
        }
        const summaryText = profile?.summary ?? defaultCharacterSummaryText;
        if (characterSelectSummaryDescription) {
            characterSelectSummaryDescription.textContent = summaryText;
        } else {
            characterSelectSummary.textContent = summaryText;
        }

        if (characterSelectSummaryOngoing) {
            characterSelectSummaryOngoing.innerHTML = '';
            const ongoingEntries = Array.isArray(profile?.ongoing) ? profile.ongoing : [];
            if (ongoingEntries.length) {
                characterSelectSummaryOngoing.removeAttribute('hidden');
                for (const entry of ongoingEntries) {
                    if (!entry) {
                        continue;
                    }
                    const item = document.createElement('li');
                    item.textContent = entry;
                    characterSelectSummaryOngoing.appendChild(item);
                }
            } else {
                characterSelectSummaryOngoing.setAttribute('hidden', '');
            }
        }
    }

    function setPendingCharacter(characterId, options = {}) {
        const { focusCard = false, updateSummary = true } = options;
        pendingCharacterId = characterId;
        const profile = getCharacterProfile(characterId);
        for (const card of characterCards) {
            const isSelected = card?.dataset?.characterId === characterId;
            card.classList.toggle('selected', isSelected);
            if (isSelected && focusCard) {
                try {
                    card.focus({ preventScroll: true });
                } catch {
                    card.focus();
                }
            }
        }
        if (updateSummary) {
            updateCharacterSummaryDisplay(profile);
        }
        updateCharacterConfirmState();
        refreshPilotPreviewStates();
    }

    function updateCharacterConfirmState() {
        if (!characterSelectConfirm) {
            return;
        }
        const profile = getCharacterProfile(pendingCharacterId);
        if (!profile) {
            characterSelectConfirm.disabled = true;
            characterSelectConfirm.setAttribute('aria-disabled', 'true');
            characterSelectConfirm.textContent = 'Select a Pilot';
            return;
        }
        const verb = pendingLaunchAction === 'retry' ? 'Retry Flight' : 'Launch Flight';
        characterSelectConfirm.disabled = false;
        characterSelectConfirm.setAttribute('aria-disabled', 'false');
        characterSelectConfirm.textContent = `${verb} as ${profile.name}`;
    }

    function isCharacterSelectOpen() {
        return Boolean(characterSelectModal && characterSelectModal.hidden === false);
    }

    function resolveCharacterSelectAction() {
        const overlayMode = overlayButton?.dataset.launchMode;
        if (overlayMode === 'retry') {
            return 'retry';
        }
        if (overlayMode === 'launch') {
            return 'launch';
        }
        return state.gameState === 'ready' ? 'launch' : 'retry';
    }

    function openCharacterSelect(action, options = {}) {
        if (!characterSelectModal) {
            if (action === 'retry') {
                skipScoreSubmission();
                commitPlayerNameInput();
                enterPreflightReadyState();
            } else {
                configureOverlayForNameEntry();
            }
            return;
        }
        const { source = 'action' } = options;
        pendingLaunchAction = action;
        characterSelectSource = source;
        characterSelectModal.hidden = false;
        characterSelectModal.setAttribute('aria-hidden', 'false');
        document.body?.classList.add('character-select-open');
        updateCharacterSummaryDisplay(null);
        setPendingCharacter(activeCharacterId, { updateSummary: false });
        updateCharacterConfirmState();
        try {
            characterSelectConfirm?.focus?.({ preventScroll: true });
        } catch {
            characterSelectConfirm?.focus?.();
        }
    }

    function requestPilotSelection(source) {
        openCharacterSelect(resolveCharacterSelectAction(), { source });
    }

    function closeCharacterSelect() {
        if (!characterSelectModal) {
            return;
        }
        characterSelectModal.hidden = true;
        characterSelectModal.setAttribute('aria-hidden', 'true');
        document.body?.classList.remove('character-select-open');
        pendingLaunchAction = null;
        characterSelectSource = 'action';
        setPendingCharacter(activeCharacterId, { updateSummary: false });
        updateCharacterSummaryDisplay(null);
        try {
            overlayButton?.focus?.({ preventScroll: true });
        } catch {
            overlayButton?.focus?.();
        }
    }

    function confirmCharacterSelection() {
        const profile = getCharacterProfile(pendingCharacterId);
        if (!profile) {
            return;
        }
        const action = pendingLaunchAction;
        const source = characterSelectSource;
        const overlayVisible = Boolean(overlay && !overlay.classList.contains('hidden'));
        setActiveCharacter(profile);
        closeCharacterSelect();
        if (action === 'retry' && source === 'action') {
            commitPlayerNameInput();
            enterPreflightReadyState();
            return;
        }
        if (action === 'launch' && source === 'action') {
            commitPlayerNameInput();
            if (overlayVisible) {
                configureOverlayForNameEntry({ focusInput: false });
            } else {
                enterPreflightReadyState();
            }
            return;
        }
        if (overlayVisible) {
            refreshOverlayLaunchButton();
            refreshHighScorePreview();
        }
    }
    let activePlayerImage = playerBaseImage;
    let activeTrailStyle = trailStyles.rainbow;
    let activeWeaponLoadout = weaponLoadouts.pulse;
    
    if (swapPilotButton) {
        swapPilotButton.addEventListener('click', () => {
            if (swapPilotButton.disabled) {
                return;
            }
            requestPilotSelection('swap');
        });
    }
    if (swapWeaponButton) {
        swapWeaponButton.addEventListener('click', () => {
            if (swapWeaponButton.disabled) {
                return;
            }
            openWeaponSelect({ trigger: swapWeaponButton });
        });
    }
    if (preflightSwapPilotButton) {
        preflightSwapPilotButton.addEventListener('click', () => {
            if (preflightSwapPilotButton.disabled) {
                return;
            }
            requestPilotSelection('preflight');
        });
    }
    if (preflightSwapWeaponButton) {
        preflightSwapWeaponButton.addEventListener('click', () => {
            if (preflightSwapWeaponButton.disabled) {
                return;
            }
            openWeaponSelect({ trigger: preflightSwapWeaponButton });
        });
    }
    if (pilotPreviewGrid) {
        pilotPreviewGrid.addEventListener('click', (event) => {
            const target = event.target instanceof HTMLElement ? event.target.closest('.pilot-preview-card') : null;
            if (!target) {
                return;
            }
            const slotId = target.dataset.loadoutId;
            if (!slotId) {
                return;
            }
            event.preventDefault();
            applyCustomLoadout(slotId);
        });
    }
    if (characterSelectConfirm) {
        characterSelectConfirm.addEventListener('click', () => {
            if (characterSelectConfirm.disabled) {
                return;
            }
            confirmCharacterSelection();
        });
    }
    if (weaponSelectGrid) {
        weaponSelectGrid.addEventListener('click', (event) => {
            const target = event.target instanceof HTMLElement ? event.target.closest('[data-weapon-id]') : null;
            if (!target) {
                return;
            }
            const weaponId = target.dataset.weaponId;
            if (!weaponId) {
                return;
            }
            setPendingWeapon(weaponId, { focusCard: true });
        });
    }
    if (characterSelectCancel) {
        characterSelectCancel.addEventListener('click', () => {
            closeCharacterSelect();
        });
    }
    if (weaponSelectConfirm) {
        weaponSelectConfirm.addEventListener('click', () => {
            if (weaponSelectConfirm.disabled) {
                return;
            }
            confirmWeaponSelection();
        });
    }
    if (weaponSelectCancel) {
        weaponSelectCancel.addEventListener('click', () => {
            closeWeaponSelect();
        });
    }
    if (characterSelectModal) {
        characterSelectModal.addEventListener('click', (event) => {
            const target = event.target;
            if (
                target === characterSelectModal ||
                (target instanceof HTMLElement && target.classList.contains('character-select-backdrop'))
            ) {
                closeCharacterSelect();
            }
        });
    }
    if (weaponSelectModal) {
        weaponSelectModal.addEventListener('click', (event) => {
            const target = event.target;
            if (
                target === weaponSelectModal ||
                (target instanceof HTMLElement && target.classList.contains('character-select-backdrop'))
            ) {
                closeWeaponSelect();
            }
        });
    }
    const challengeManager = createChallengeManager({
        definitions: CHALLENGE_DEFINITIONS,
        cosmeticsCatalog,
        onChallengeCompleted: (definition) => {
            const title = definition?.title ?? 'Challenge';
            addSocialMoment(`${title} complete!`, { type: 'challenge' });
        },
        onRewardClaimed: (definition, reward) => {
            const rewardLabel = describeReward(reward);
            const title = definition?.title ?? 'Challenge';
            addSocialMoment(`${title}: ${rewardLabel}`, { type: 'challenge' });
        }
    });
    if (challengeManager && typeof challengeManager.subscribe === 'function') {
        challengeManager.subscribe((snapshot) => {
            renderChallengeList(snapshot);
            renderCosmeticOptions(snapshot);
            applyEquippedCosmetics(snapshot?.cosmetics?.equipped);
        });
    } else {
        applyEquippedCosmetics();
        renderCustomLoadouts(latestCosmeticSnapshot);
    }

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

    const initialCharacterProfile = getCharacterProfile(activeCharacterId);
    if (initialCharacterProfile) {
        setActiveCharacter(initialCharacterProfile);
        setPendingCharacter(initialCharacterProfile.id, { updateSummary: false });
    }
    const baseCollectScoreRaw = config?.score?.collect;
    const baseCollectScore = Number.isFinite(Number(baseCollectScoreRaw))
        ? Math.max(1, Number(baseCollectScoreRaw))
        : defaultCollectScore;
    if (!config.score || !isPlainObject(config.score)) {
        config.score = { ...baseGameConfig.score };
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
            alertTimer: 0
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

    const BOSS_EVENT_TIME_MS = 60000;
    const BOSS_ALERT_DURATION = 2000;
    const bossVillainType = {
        key: 'boss',
        name: 'Celestial Behemoth',
        imageSrc: 'assets/boss1.png',
        width: 253,
        height: 253,
        health: 36,
        rotation: { min: 0, max: 0 },
        behavior: { type: 'hover', amplitude: 72, verticalSpeed: 70 }
    };

    const villainTypes = [
        {
            key: 'villain1',
            name: 'Void Raider',
            imageSrc: 'assets/villain1.png',
            size: { min: 51, max: 67 },
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
            size: { min: 81, max: 110 },
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
            size: { min: 117, max: 159 },
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

    const bossImage = loadImageWithFallback(
        bossVillainType.imageSrc,
        () => createVillainFallbackDataUrl(0) ?? bossVillainType.imageSrc
    );
    bossVillainType.image = bossImage;

    player = {
        x: viewport.width * 0.18,
        y: viewport.height * 0.5,
        width: config.player.width,
        height: config.player.height,
        vx: 0,
        vy: 0
    };

    function resetGame() {
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
        hyperBeamState.intensity = 0;
        hyperBeamState.wave = 0;
        hyperBeamState.sparkTimer = 0;
        hyperBeamState.bounds = null;
        resetWeaponPatternState(activeWeaponId);
        player.x = viewport.width * 0.18;
        player.y = viewport.height * 0.5;
        player.vx = 0;
        player.vy = 0;
        projectiles.length = 0;
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
        if (state.gameState !== 'playing') {
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
        const loadout = activeWeaponLoadout ?? weaponLoadouts.pulse;
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
        const loadout = activeWeaponLoadout ?? weaponLoadouts.pulse;
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
            loadout.pattern(createProjectile, { originX, originY });
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

        const verticalBleed = viewport.height * config.player.verticalBleed;
        clone.x = clamp(clone.x, 0, viewport.width - clone.width);
        clone.y = clamp(clone.y, -verticalBleed, viewport.height - clone.height + verticalBleed);

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
        const verticalBleed = viewport.height * config.player.verticalBleed;
        player.x = clamp(player.x, 0, viewport.width - player.width);
        player.y = clamp(player.y, -verticalBleed, viewport.height - player.height + verticalBleed);

        clone.x = clamp(player.x, 0, viewport.width - clone.width);
        let targetCloneY = player.y - separation;
        const minCloneY = -verticalBleed;
        const maxCloneY = viewport.height - clone.height + verticalBleed;
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
        const verticalBleed = viewport.height * config.player.verticalBleed;
        const moveEntity = (entity) => {
            if (!entity) {
                return;
            }
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
        return obstacle?.villainType?.key === bossVillainType.key;
    }

    function completeBossBattle() {
        state.bossBattle.active = false;
        state.bossBattle.bossSpawned = false;
        state.bossBattle.defeated = true;
        state.bossBattle.powerUpSpawned = false;
        state.bossBattle.alertTimer = 0;
        spawnTimers.obstacle = 0;
        spawnTimers.collectible = 0;
        spawnTimers.powerUp = 0;
    }

    function spawnBoss() {
        const width = bossVillainType.width;
        const height = bossVillainType.height ?? width;
        const spawnY = clamp(
            viewport.height * 0.5 - height * 0.5,
            32,
            viewport.height - height - 32
        );
        const hoverAmplitude = bossVillainType.behavior?.amplitude ?? 0;
        const hoverSpeed = bossVillainType.behavior?.verticalSpeed ?? 60;
        const lowerBound = 16;
        const upperBound = Math.max(lowerBound, viewport.height - height - lowerBound);
        let minY = clamp(spawnY - hoverAmplitude, lowerBound, upperBound);
        let maxY = clamp(spawnY + hoverAmplitude, lowerBound, upperBound);
        if (minY > maxY) {
            const mid = (minY + maxY) / 2;
            minY = mid;
            maxY = mid;
        }
        const behaviorState = {
            type: 'hover',
            speed: hoverSpeed,
            minY,
            maxY,
            direction: 1
        };

        obstacles.push({
            x: viewport.width + width,
            y: clamp(spawnY, minY, maxY),
            width,
            height,
            speed: Math.max(60, state.gameSpeed * 0.22),
            rotation: 0,
            rotationSpeed: 0,
            health: bossVillainType.health,
            maxHealth: bossVillainType.health,
            hitFlash: 0,
            vx: 0,
            vy: 0,
            bounceTimer: 0,
            shieldCooldown: 0,
            villainType: bossVillainType,
            behaviorState,
            image: bossVillainType.image
        });
        state.bossBattle.bossSpawned = true;
        state.lastVillainKey = bossVillainType.key;
    }

    function startBossBattle() {
        if (state.bossBattle.active || state.bossBattle.defeated) {
            return;
        }
        state.bossBattle.triggered = true;
        state.bossBattle.active = true;
        state.bossBattle.bossSpawned = false;
        state.bossBattle.powerUpSpawned = false;
        state.bossBattle.alertTimer = BOSS_ALERT_DURATION;
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
                if (challengeManager) {
                    challengeManager.recordEvent('powerUp', { type: powerUp.type });
                }
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
        if (challengeManager) {
            challengeManager.recordEvent('villain', {
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
        if (state.streak > state.bestStreak) {
            state.bestStreak = state.streak;
            if (state.bestStreak >= 4 && state.bestStreak > previousBest) {
                addSocialMoment(`${playerName} pushed a x${state.bestStreak} streak!`, {
                    type: 'combo'
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
        if (challengeManager) {
            challengeManager.recordEvent('score', { totalScore: state.score, deltaScore: finalPoints });
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
        pendingSubmission = null;
        return { summary, formattedTime, formattedScore };
    }

    function triggerGameOver(message) {
        if (state.gameState !== 'running') return;
        state.gameState = 'gameover';
        mascotAnnouncer.lamentSetback({ force: true });
        hidePauseOverlay();
        bodyElement?.classList.remove('paused');
        survivalTimerEl?.classList.remove('paused');
        audioManager.stopGameplayMusic();
        audioManager.stopHyperBeam();
        const finalTimeMs = state.elapsedTime;
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
        const style = activeTrailStyle ?? trailStyles.rainbow;
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
        const auraColor = shieldConfig.auraColor ?? { r: 150, g: 214, b: 255 };
        const duration = config.powerUp.duration[SHIELD_POWER] ?? 1;
        const remaining = clamp(state.powerUpTimers[SHIELD_POWER] / duration, 0, 1);
        const pulseStrength = Math.sin(time * 0.007) * (shieldConfig.auraPulse ?? 0.18);
        const hitPulse = state.shieldHitPulse ?? 0;
        const baseRadius = Math.max(entity.width, entity.height) * (0.65 + pulseStrength + hitPulse * 0.18);
        const centerX = drawX + entity.width * 0.5;
        const centerY = drawY + entity.height * 0.5;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.globalCompositeOperation = 'lighter';

        const gradient = ctx.createRadialGradient(0, 0, baseRadius * 0.35, 0, 0, baseRadius);
        gradient.addColorStop(0, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${0.55 + hitPulse * 0.25})`);
        gradient.addColorStop(0.58, `rgba(${auraColor.r}, ${auraColor.g}, ${auraColor.b}, ${0.28 + remaining * 0.35})`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
        ctx.fill();

        const ringRadius = baseRadius * (0.88 + 0.06 * Math.sin(time * 0.012 + hitPulse));
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
        if (challengeManager) {
            challengeManager.recordEvent('time', { totalMs: state.elapsedTime });
        }
        updateIntelLore(state.elapsedTime);
        state.gameSpeed += config.speedGrowth * getSpeedRampMultiplier() * (getScaledDelta(delta) / 1000);
        if (state.bossBattle.alertTimer > 0) {
            state.bossBattle.alertTimer = Math.max(0, state.bossBattle.alertTimer - delta);
        }

        if (!state.bossBattle.triggered && state.elapsedTime >= BOSS_EVENT_TIME_MS) {
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

    function gameLoop(timestamp = performance.now()) {
        requestAnimationFrame(gameLoop);

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

