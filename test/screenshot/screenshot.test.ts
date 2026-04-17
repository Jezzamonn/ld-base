import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import puppeteer, { Browser, Page } from 'puppeteer';
import path from 'path';
import fs from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { createServer, ViteDevServer } from 'vite';

const GOLDEN_DIR = path.join(__dirname, 'goldens');
const ACTUAL_DIR = path.join(__dirname, 'actuals');
const DIFF_DIR = path.join(__dirname, 'diffs');
const APPROVE = process.env.APPROVE === 'true';

describe('Screenshot tests', () => {
    let browser: Browser;
    let server: ViteDevServer;
    let baseUrl: string;

    beforeAll(async () => {
        // Start Vite server on a random port
        server = await createServer({
            server: {
                port: 0,
                open: false,
            },
        });
        await server.listen();
        const address = server.httpServer?.address();
        const port = typeof address === 'string' ? address : address?.port;
        baseUrl = `http://localhost:${port}/?test`;

        browser = await puppeteer.launch({
            headless: true,
            // Note: This should probably just be 'chrome' but for now, this is good because I haven't installed the required deps.
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        });
    });

    afterAll(async () => {
        if (browser) await browser.close();
        if (server) await server.close();
    });

    it('initial state screenshot should match golden', async () => {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });
        
        await page.goto(baseUrl);
        await page.waitForFunction(() => (window as any).game !== undefined);
        await page.evaluate(async () => {
            await (window as any).advanceFrames(1);
        });

        const numDiffPixels = await performComparison(page, 'initial-state');
        expect(numDiffPixels).toBe(0);
        await page.close();
    });

    it('hold right for 1s screenshot should match golden', async () => {
        const page = await browser.newPage();
        await page.setViewport({ width: 800, height: 600 });

        await page.goto(baseUrl);
        await page.waitForFunction(() => (window as any).game !== undefined);
        await page.evaluate(async () => {
            const game = (window as any).game;
            const keys = game.keys;
            keys.press('ArrowRight');
            await (window as any).advanceFrames(60);
            keys.release('ArrowRight');
            await (window as any).advanceFrames(1);
        });

        const numDiffPixels = await performComparison(page, 'hold-right-1s');
        expect(numDiffPixels).toBe(0);
        await page.close();
    });
});

async function performComparison(page: Page, name: string): Promise<number> {
    if (!fs.existsSync(ACTUAL_DIR)) fs.mkdirSync(ACTUAL_DIR, { recursive: true });
    if (!fs.existsSync(DIFF_DIR)) fs.mkdirSync(DIFF_DIR, { recursive: true });

    const canvas = await page.$('.canvas');
    if (!canvas) throw new Error('Could not find canvas');

    const screenshotPath = path.join(ACTUAL_DIR, `${name}.png`);
    await canvas.screenshot({ path: screenshotPath });

    const goldenPath = path.join(GOLDEN_DIR, `${name}.png`);

    if (APPROVE || !fs.existsSync(goldenPath)) {
        if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });
        fs.copyFileSync(screenshotPath, goldenPath);
        return 0;
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
    }

    return numDiffPixels;
}
