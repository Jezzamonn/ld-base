import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const GOLDEN_DIR = path.join(__dirname, 'goldens');
const ACTUAL_DIR = path.join(__dirname, 'actuals');
const DIFF_DIR = path.join(__dirname, 'diffs');
const APPROVE = process.env.APPROVE === 'true';

async function runTest() {
    console.log('Starting screenshot tests...');

    if (!fs.existsSync(ACTUAL_DIR)) fs.mkdirSync(ACTUAL_DIR, { recursive: true });
    if (!fs.existsSync(DIFF_DIR)) fs.mkdirSync(DIFF_DIR, { recursive: true });

    const browser = await puppeteer.launch({
        headless: true,
        // Since we skipped download, we try to find a local chrome
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 }); // Large enough for the game

        // We assume the game is running on localhost:3000 (as per vite.config.ts)
        const baseUrl = 'http://localhost:3000/?test';

        // Test 1: Initial State
        await performTest(page, 'initial-state', async (p) => {
            await p.goto(baseUrl);
            await p.waitForFunction(() => (window as any).game !== undefined);
            // Wait for assets to load (Game.preload is called in main.ts)
            // We can check if game is started
            await p.evaluate(async () => {
                await (window as any).advanceFrames(1);
            });
        });

        // Test 2: Hold Right for 1 Second
        await performTest(page, 'hold-right-1s', async (p) => {
            await p.goto(baseUrl);
            await p.waitForFunction(() => (window as any).game !== undefined);
            await p.evaluate(async () => {
                const game = (window as any).game;
                const keys = game.keys;
                keys.press('ArrowRight');
                await (window as any).advanceFrames(60);
                keys.release('ArrowRight');
                await (window as any).advanceFrames(1); // Render last frame
            });
        });

        console.log('All tests completed.');
    } finally {
        await browser.close();
    }
}

async function performTest(page: Page, name: string, setup: (page: Page) => Promise<void>) {
    console.log(`Running test: ${name}`);
    await setup(page);

    const canvas = await page.$('.canvas');
    if (!canvas) {
        throw new Error('Could not find canvas');
    }

    const screenshotPath = path.join(ACTUAL_DIR, `${name}.png`);
    await canvas.screenshot({ path: screenshotPath });

    const goldenPath = path.join(GOLDEN_DIR, `${name}.png`);

    if (APPROVE || !fs.existsSync(goldenPath)) {
        console.log(`  Updating golden for ${name}`);
        if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });
        fs.copyFileSync(screenshotPath, goldenPath);
        return;
    }

    const img1 = PNG.sync.read(fs.readFileSync(goldenPath));
    const img2 = PNG.sync.read(fs.readFileSync(screenshotPath));
    const { width, height } = img1;
    const diff = new PNG({ width, height });

    const numDiffPixels = pixelmatch(
        img1.data,
        img2.data,
        diff.data,
        width,
        height,
        { threshold: 0.1 }
    );

    if (numDiffPixels > 0) {
        const diffPath = path.join(DIFF_DIR, `${name}.png`);
        fs.writeFileSync(diffPath, PNG.sync.write(diff));
        throw new Error(`Test ${name} failed: ${numDiffPixels} pixels differ. Diff saved to ${diffPath}`);
    }

    console.log(`  Test ${name} passed.`);
}

runTest().catch(err => {
    console.error(err);
    process.exit(1);
});
