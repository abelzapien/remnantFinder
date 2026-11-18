/**
 * Remnant 2 Build & Loot Overseer — Automated 1080p@60fps Promotional Demo Recorder
 *
 * Generates:
 *   - media/demo-showcase.mp4  (1920x1080 @ 60fps H.264)
 *   - media/demo.gif           (Optimized palette GIF < 10 MB)
 *   - docs/demo.gif            (Ready for GitHub README)
 *
 * Zero pollution to production dependencies: uses Microsoft Edge headless + isolated
 * playwright-core & ffmpeg-static from DEMO_DEPS_DIR (or auto-bootstraps in os.tmpdir()).
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const FPS = 60;
const WIDTH = 1920;
const HEIGHT = 1080;
const DEMO_PORT = 5197;

function ensureIsolatedDemoDeps() {
  const candidates = [
    process.env.DEMO_DEPS_DIR,
    path.join(os.tmpdir(), 'r2-overseer-demo-deps'),
  ].filter(Boolean);

  for (const dir of candidates) {
    const pwPkg = path.join(dir, 'node_modules', 'playwright-core', 'package.json');
    const ffPkg = path.join(dir, 'node_modules', 'ffmpeg-static', 'package.json');
    if (fs.existsSync(pwPkg) && fs.existsSync(ffPkg)) {
      const req = createRequire(pwPkg);
      return {
        playwright: req('playwright-core'),
        ffmpegPath: req('ffmpeg-static'),
      };
    }
  }

  const fallbackDir = candidates[candidates.length - 1];
  fs.mkdirSync(fallbackDir, { recursive: true });
  const pkgJson = path.join(fallbackDir, 'package.json');
  if (!fs.existsSync(pkgJson)) {
    fs.writeFileSync(pkgJson, JSON.stringify({ name: 'r2-demo-deps', private: true }));
  }
  console.log(`[deps] Bootstrapping playwright-core & ffmpeg-static in ${fallbackDir}...`);
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  execFileSync(npmCmd, ['install', 'playwright-core', 'ffmpeg-static', '--no-audit', '--no-fund'], {
    cwd: fallbackDir,
    stdio: 'inherit',
  });
  const req = createRequire(path.join(fallbackDir, 'package.json'));
  return {
    playwright: req('playwright-core'),
    ffmpegPath: req('ffmpeg-static'),
  };
}

function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Could not find Microsoft Edge or Google Chrome executable on this machine.');
  }
  return found;
}

function findBackendCommand() {
  const releaseExe = path.join(
    REPO_ROOT,
    'release',
    'Remnant2-BuildLootOverseer-v1.0.0-win-x64',
    'Remnant2BuildLootOverseer.exe'
  );
  if (fs.existsSync(releaseExe)) {
    return {
      cmd: releaseExe,
      args: ['--server-only', '--port', String(DEMO_PORT)],
      cwd: path.dirname(releaseExe),
      env: { ...process.env },
    };
  }

  const debugExe = path.join(
    REPO_ROOT,
    'BuildLootOverseer.Backend',
    'bin',
    'Debug',
    'net10.0-windows',
    'BuildLootOverseer.Backend.exe'
  );
  const dotnetRoot = path.join(os.homedir(), '.dotnet');
  return {
    cmd: debugExe,
    args: ['--server-only', '--port', String(DEMO_PORT)],
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      DOTNET_ROOT: fs.existsSync(dotnetRoot) ? dotnetRoot : process.env.DOTNET_ROOT,
    },
  };
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for backend server at ${url}`);
}

/**
 * Prepares an ultra-clean, realistic showcase snapshot based on the user's real save dataset
 * so Scene 1 starts inside Yaesha (La Arboleda Prohibida) with visible door connectivity badges
 * and unowned Gold/Purple/Green items, without touching any files on disk.
 */
function prepareShowcaseSaveSnapshot(rawSave) {
  const save = JSON.parse(JSON.stringify(rawSave));
  const ch = save.characters?.[save.activeCharacterListIndex] || save.characters?.[0];
  if (!ch) return save;

  ch.activeWorldSlot = 'Campaign';
  const camp = ch.campaign;
  if (!camp || !Array.isArray(camp.zones)) return save;

  // Locate Yaesha explicitly first, then fallback to any biome with populated loot
  let yaeshaIdx = camp.zones.findIndex((z) => z.name.toLowerCase().includes('yaesha'));
  if (yaeshaIdx < 0) {
    yaeshaIdx = camp.zones.findIndex((z) => z.locations.some((l) => l.items?.length >= 5));
  }
  if (yaeshaIdx < 0) return save;

  camp.zones.forEach((z, idx) => {
    z.isPlayerHere = idx === yaeshaIdx;
    z.locations.forEach((l) => {
      l.isRespawnLocation = false;
      if (l.explorationStatus === 'Current') l.explorationStatus = 'Visited';
    });
  });

  const targetZone = camp.zones[yaeshaIdx];
  const overworld1 =
    targetZone.locations.find((l) => l.zoneRole === 'Overworld' && l.overworldIndex === 1) ||
    targetZone.locations[0];

  if (overworld1) {
    overworld1.isRespawnLocation = true;
    overworld1.explorationStatus = 'Current';
    overworld1.isVisited = true;
    camp.currentLocationName = overworld1.name;
    camp.currentLocationNameEs = overworld1.nameEs;
    camp.currentWorldName = targetZone.name;
    camp.currentWorldNameEs = targetZone.nameEs;
    camp.respawnPointFormatted = `Piedra de Mundo: ${overworld1.nameEs}`;
    camp.respawnPointFormattedEn = `World Stone: ${overworld1.name}`;

    // Make sure at least one optional direct door appears pending/uncrossed so door badges shine
    if (Array.isArray(overworld1.doorLinks)) {
      for (const dl of overworld1.doorLinks) {
        if (!dl.isMainPath) {
          dl.isUsed = false;
          const childLoc = targetZone.locations.find(
            (x) => x.name.trim().toLowerCase() === dl.targetLocationName.trim().toLowerCase()
          );
          if (childLoc) {
            childLoc.isVisited = false;
            childLoc.explorationStatus = 'Undiscovered';
            // Ensure specific items in that adjacent dungeon have unowned highlights to display on click
            childLoc.items.forEach((it, idx) => {
              if (it.originType !== 'WorldDrop' && idx < 4) {
                it.isOwned = false;
              }
            });
          }
        }
      }
    }
  }

  // Recompute visited/pending counters cleanly
  targetZone.visitedLocations = targetZone.locations.filter((l) => l.isVisited).length;
  targetZone.pendingLocations = targetZone.locations.length - targetZone.visitedLocations;

  return save;
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

async function main() {
  const { playwright, ffmpegPath } = ensureIsolatedDemoDeps();
  const browserExe = findBrowserExecutable();

  const mediaDir = path.join(REPO_ROOT, 'media');
  const docsDir = path.join(REPO_ROOT, 'docs');
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const mp4Path = path.join(mediaDir, 'demo-showcase.mp4');
  const mediaGifPath = path.join(mediaDir, 'demo.gif');
  const docsGifPath = path.join(docsDir, 'demo.gif');

  // 1. Start local backend server in headless --server-only mode
  const backendSpec = findBackendCommand();
  console.log(`[1/5] Starting backend server on port ${DEMO_PORT}...`);
  const serverProc = spawn(backendSpec.cmd, backendSpec.args, {
    cwd: backendSpec.cwd,
    env: backendSpec.env,
    stdio: 'ignore',
    windowsHide: true,
  });

  let browser = null;
  try {
    const baseUrl = `http://127.0.0.1:${DEMO_PORT}`;
    await waitForServer(`${baseUrl}/api/health`);

    // Fetch real save dataset once to prepare our non-destructive showcase snapshot
    const rawSaveRes = await fetch(`${baseUrl}/api/save`);
    if (!rawSaveRes.ok) {
      throw new Error(`Failed to fetch /api/save (${rawSaveRes.status})`);
    }
    const rawSaveJson = await rawSaveRes.json();
    const showcaseSave = prepareShowcaseSaveSnapshot(rawSaveJson);

    // Pick 2 real unowned specific items from the starting location & adjacent location for Gold Wishlist priority
    const activeChar =
      showcaseSave.characters?.[showcaseSave.activeCharacterListIndex] ||
      showcaseSave.characters?.[0];
    const yaeshaZone = activeChar?.campaign?.zones?.find((z) => z.isPlayerHere);
    const startLoc = yaeshaZone?.locations?.find((l) => l.isRespawnLocation);
    const firstSpecificUnowned =
      startLoc?.items?.find(
        (i) =>
          i.originType !== 'WorldDrop' &&
          !i.isOwned &&
          (i.type === 'ring' || i.type === 'amulet' || i.type === 'weapon')
      ) ||
      startLoc?.items?.find((i) => i.originType !== 'WorldDrop' && !i.isOwned) ||
      startLoc?.items?.[0];

    // Also include a couple of iconic Boss Rush / Yaesha items in Wishlist so Gold badges pop immediately
    const demoWishlistIds = [
      firstSpecificUnowned?.id,
      'Amulet_DeathsEmbrace',
      'Ring_ZaniasMalice',
      'Weapon_Nebula',
      'Weapon_Nightfall',
      'Ring_ProbabilityCord',
      'Amulet_ChainsOfAmplification',
    ].filter(Boolean);

    let inMemoryConfig = {
      language: 'es',
      hideOwnedItems: true,
      hideLootedInWorld: false,
      hasCompletedSetup: true,
      savePlatform: 'Steam',
      customSaveFolder: showcaseSave.sourceFolder,
      donationUrl: 'https://ko-fi.com/choppx',
      activeBuildId: 'demo_build',
      builds: [
        {
          id: 'demo_build',
          name: 'Build Crítico + Punto Débil',
          activeSynergyTags: [
            'Critical Chance',
            'Weakspot',
            'Ranged/Firearms',
            'Mod Power',
          ],
          wishlistItemIds: demoWishlistIds,
          wishlistToolkitIds: [],
          wishlistItemNames: [],
          importedSourceUrl: null,
          notes: '',
        },
      ],
    };

    // 2. Launch headless Edge at exact 1920x1080
    console.log('[2/5] Launching headless browser at 1920x1080...');
    browser = await playwright.chromium.launch({
      executablePath: browserExe,
      headless: true,
      args: [
        '--disable-gpu-vsync',
        '--force-color-profile=srgb',
        '--font-render-hinting=none',
      ],
    });

    const context = await browser.newContext({
      viewport: { width: WIDTH, height: HEIGHT },
      deviceScaleFactor: 1,
      colorScheme: 'dark',
    });

    const page = await context.newPage();

    // Intercept save & config endpoints in memory so disk user config is never touched
    await page.route('**/api/save**', async (route) => {
      if (route.request().url().includes('/platforms')) {
        return route.continue();
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(showcaseSave),
      });
    });

    await page.route('**/api/config', async (route) => {
      if (route.request().method() === 'POST') {
        try {
          inMemoryConfig = JSON.parse(route.request().postData() || '{}');
        } catch {
          // Keep current
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(inMemoryConfig),
      });
    });

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    await page.waitForSelector('header', { timeout: 10000 });

    // Inject sleek custom vector cursor & click ripple overlay + disable infinite CSS pulse for crisp GIF encoding
    await page.addStyleTag({
      content: `
        * { scrollbar-width: thin; }
        .animate-pulse { animation: none !important; }
        #__demo-cursor-root {
          position: fixed;
          left: 0;
          top: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 2147483647;
          overflow: hidden;
        }
        #__demo-cursor {
          position: absolute;
          left: 0;
          top: 0;
          width: 28px;
          height: 28px;
          transform: translate3d(960px, 540px, 0);
          filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.75));
          will-change: transform;
        }
        #__demo-ripple {
          position: absolute;
          left: 0;
          top: 0;
          width: 36px;
          height: 36px;
          margin-left: -18px;
          margin-top: -18px;
          border-radius: 9999px;
          border: 2.5px solid #fbbf24;
          background: rgba(251, 191, 36, 0.22);
          opacity: 0;
          transform: translate3d(960px, 540px, 0) scale(0.4);
          will-change: transform, opacity;
        }
      `,
    });

    await page.evaluate(() => {
      const root = document.createElement('div');
      root.id = '__demo-cursor-root';
      root.innerHTML = `
        <div id="__demo-ripple"></div>
        <svg id="__demo-cursor" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4.5 3.2L22.8 12.1C23.9 12.6 23.7 14.3 22.5 14.6L14.6 16.5L10.8 23.6C10.2 24.7 8.6 24.4 8.4 23.2L4.1 4.6C3.9 3.6 4.9 2.8 4.5 3.2Z"
                fill="#0f172a" stroke="#fbbf24" stroke-width="2.1" stroke-linejoin="round"/>
          <circle cx="9.8" cy="10.2" r="2" fill="#38bdf8"/>
        </svg>
      `;
      document.body.appendChild(root);

      window.__updateDemoCursor = (x, y, rippleProgress = -1) => {
        const cur = document.getElementById('__demo-cursor');
        const rip = document.getElementById('__demo-ripple');
        const scale = rippleProgress >= 0 && rippleProgress < 0.35 ? 0.9 : 1.0;
        if (cur) {
          cur.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${scale})`;
        }
        if (rip) {
          if (rippleProgress >= 0 && rippleProgress <= 1) {
            const s = 0.45 + rippleProgress * 1.35;
            const op = Math.max(0, 1 - rippleProgress);
            rip.style.opacity = op.toFixed(3);
            rip.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
          } else {
            rip.style.opacity = '0';
          }
        }
      };
    });

    // 3. Spawn ffmpeg 60fps H.264 encoder listening on stdin (image2pipe)
    console.log('[3/5] Recording 1920x1080 @ 60fps showcase sequence...');
    const ffProc = spawn(
      ffmpegPath,
      [
        '-y',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        '-framerate',
        String(FPS),
        '-i',
        '-',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '17',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(FPS),
        '-movflags',
        '+faststart',
        mp4Path,
      ],
      { stdio: ['pipe', 'ignore', 'pipe'] }
    );

    let ffStderr = '';
    ffProc.stderr.on('data', (chunk) => {
      ffStderr += chunk.toString();
    });

    let totalFrames = 0;
    let curX = 960;
    let curY = 340;

    const writeFrameBuffer = async (buf, repeatCount = 1) => {
      for (let i = 0; i < repeatCount; i++) {
        const ok = ffProc.stdin.write(buf);
        totalFrames++;
        if (!ok) {
          await new Promise((res) => ffProc.stdin.once('drain', res));
        }
      }
    };

    const captureOnce = async () => {
      return await page.screenshot({ type: 'jpeg', quality: 96 });
    };

    const hold = async (seconds) => {
      const count = Math.max(1, Math.round(seconds * FPS));
      const frame = await captureOnce();
      await writeFrameBuffer(frame, count);
    };

    const moveToPoint = async (targetX, targetY, durationSec = 0.65) => {
      const steps = Math.max(2, Math.round(durationSec * FPS));
      const startX = curX;
      const startY = curY;
      const dx = targetX - startX;
      const dy = targetY - startY;
      // Subtle natural upward arc perpendicular to movement
      const arcOffset = Math.min(26, Math.hypot(dx, dy) * 0.06);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const e = easeInOutCubic(t);
        const arc = Math.sin(Math.PI * t) * arcOffset;
        const nx = startX + dx * e;
        const ny = startY + dy * e - arc;

        await page.mouse.move(nx, ny);
        await page.evaluate(([x, y]) => window.__updateDemoCursor(x, y, -1), [nx, ny]);
        const frame = await captureOnce();
        await writeFrameBuffer(frame, 1);
      }

      curX = targetX;
      curY = targetY;
    };

    const moveToLocator = async (locator, durationSec = 0.65, offsetX = 0, offsetY = 0) => {
      const box = await locator.first().boundingBox();
      if (!box) {
        throw new Error('Target element boundingBox not found during demo choreography.');
      }
      const tx = box.x + box.width / 2 + offsetX;
      const ty = box.y + box.height / 2 + offsetY;
      await moveToPoint(tx, ty, durationSec);
    };

    const clickWithRipple = async (postSettleSec = 0.15) => {
      const clickFrames = 14; // ~0.23s ripple animation
      await page.mouse.click(curX, curY);

      for (let i = 0; i < clickFrames; i++) {
        const p = i / (clickFrames - 1);
        await page.evaluate(([x, y, prog]) => window.__updateDemoCursor(x, y, prog), [
          curX,
          curY,
          p,
        ]);
        const frame = await captureOnce();
        await writeFrameBuffer(frame, 1);
      }

      await page.evaluate(([x, y]) => window.__updateDemoCursor(x, y, -1), [curX, curY]);
      if (postSettleSec > 0) {
        await hold(postSettleSec);
      }
    };

    // Place initial cursor calmly near upper center
    await page.evaluate(([x, y]) => window.__updateDemoCursor(x, y, -1), [curX, curY]);

    // =========================================================================
    // SCENE 1 (0.0s - 5.2s): Main View in Spanish + Expand Gold Priority Item
    // =========================================================================
    console.log('  -> Scene 1: Overview & Gold Priority item expansion (ES)...');
    await hold(1.05);

    const firstHowToBtn = page.locator('button:has-text("Cómo conseguir")').first();
    await moveToLocator(firstHowToBtn, 0.72);
    await clickWithRipple(0.1);

    // Readable 2.55s pause so viewer reads Spanish stats & step-by-step guide
    await hold(2.55);

    // Close the expanded Gold item
    await clickWithRipple(0.25);

    // =========================================================================
    // SCENE 2 (5.2s - 9.0s): Door Adjacency & Instant Dungeon Switch
    // =========================================================================
    console.log('  -> Scene 2: Direct Door badge & instant zone switch...');
    const directDoorCard = page
      .locator('aside button')
      .filter({ hasText: 'Puerta aquí' })
      .first();
    await moveToLocator(directDoorCard, 0.8);
    await clickWithRipple(0.2);

    // Smoothly hover over the newly loaded dungeon's fixed loot rows & hold so viewer sees instant loot change
    const newZoneFirstRow = page.locator('button:has-text("Cómo conseguir")').first();
    if ((await newZoneFirstRow.count()) > 0) {
      await hold(1.0);
      await moveToLocator(newZoneFirstRow, 0.65, -220, 0);
      await hold(1.15);
    } else {
      await hold(2.6);
    }

    // =========================================================================
    // SCENE 3 (9.0s - 13.3s): Build Configurator Drawer & Synergy Tag Toggle
    // =========================================================================
    console.log('  -> Scene 3: Build Configurator & interactive Synergy Tag toggle...');
    const configBuildBtn = page.locator('header button:has-text("Configurar Build")').first();
    await moveToLocator(configBuildBtn, 0.75);
    await clickWithRipple(0.25);

    await hold(0.55);

    // Toggle an interactive synergy tag (e.g. Fuego / Quemadura or Sangrado)
    const fireTagBtn = page
      .locator('button')
      .filter({ hasText: /Fuego|Sangrado|Escudo/ })
      .first();
    await moveToLocator(fireTagBtn, 0.68);
    await clickWithRipple(0.15);
    await hold(0.95);

    // Close Build Configurator panel
    const closeBuildBtn = page.locator('button:has-text("Cerrar Panel")').first();
    await moveToLocator(closeBuildBtn, 0.62);
    await clickWithRipple(0.25);

    // =========================================================================
    // SCENE 4 (13.3s - 18.8s): Global Boss Rush Pool + Instant ES -> EN Switch
    // =========================================================================
    console.log('  -> Scene 4: Boss Rush global node & instant ES | EN switch...');
    const bossRushTab = page.locator('button:has-text("Boss Rush")').first();
    await moveToLocator(bossRushTab, 0.75);
    await clickWithRipple(0.2);

    // Readable pause on Boss Rush pool in Spanish
    await hold(1.75);

    // Glide up to the EN button in the top bar ES | EN switch
    const enSwitchBtn = page.locator('header button:text-is("EN")').first();
    await moveToLocator(enSwitchBtn, 0.72);
    await clickWithRipple(0.15);

    // Expand or hover calmly so viewer reads the full instant English UI & Boss Rush descriptions
    await moveToPoint(980, 310, 0.6);
    await hold(1.95);

    // Finalize MP4 encoding
    ffProc.stdin.end();
    const ffExitCode = await new Promise((resolve) => ffProc.on('close', resolve));
    if (ffExitCode !== 0) {
      throw new Error(`ffmpeg MP4 encoding failed (code ${ffExitCode}):\n${ffStderr}`);
    }

    const durationSec = (totalFrames / FPS).toFixed(2);
    const mp4SizeMb = (fs.statSync(mp4Path).size / (1024 * 1024)).toFixed(2);
    console.log(
      `[4/5] Generated MP4: ${mp4Path} (${totalFrames} frames, ${durationSec}s @ ${FPS}fps, ${mp4SizeMb} MB)`
    );

    // 4. Generate crisp palette-optimized GIF (< 10 MB) for GitHub README
    console.log('[5/5] Encoding palette-optimized GIF (< 10 MB) for GitHub README...');
    const gifConfigs = [
      { width: 1280, fps: 18 },
      { width: 1152, fps: 15 },
      { width: 1024, fps: 14 },
    ];

    for (const cfg of gifConfigs) {
      const vf = `fps=${cfg.fps},scale=${cfg.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`;
      execFileSync(ffmpegPath, ['-y', '-i', mp4Path, '-vf', vf, '-loop', '0', docsGifPath], {
        stdio: 'ignore',
      });
      const gifBytes = fs.statSync(docsGifPath).size;
      const gifMb = gifBytes / (1024 * 1024);
      console.log(
        `      Attempt (${cfg.width}px @ ${cfg.fps}fps): ${gifMb.toFixed(2)} MB`
      );
      if (gifMb < 9.5) {
        break;
      }
    }

    fs.copyFileSync(docsGifPath, mediaGifPath);
    const finalGifMb = (fs.statSync(docsGifPath).size / (1024 * 1024)).toFixed(2);
    console.log(`[DONE] Saved ${docsGifPath} & ${mediaGifPath} (${finalGifMb} MB)`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error('[record-demo ERROR]', err);
  process.exit(1);
});
