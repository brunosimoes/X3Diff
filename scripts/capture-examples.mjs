// Retakes the pictures of the landing page from the running workbench.
//
//   npm run dev -- --port 5199        (in another terminal)
//   node scripts/capture-examples.mjs [http://127.0.0.1:5199] [cards|preview|mobile]
//
// cards    The example cards: the stage of one view, without the controls around it, so they
//          stay true whatever the buttons look like. public/media/x3diff-example-<name>.jpg
// preview  The Motion paths card, which is also the link preview of the site: the whole
//          workbench at exactly 1200 × 630. public/media/x3diff-motion-paths.jpg
// mobile   The same card on a phone, where the whole workbench would be unreadable: the stage
//          pushed in on the route, and the gap chart. public/media/x3diff-motion-paths-mobile.jpg
//
// Without a third argument all of them are retaken.
import { chromium } from '@playwright/test';

const base = (process.argv[2] ?? 'http://127.0.0.1:5199').replace(/\/$/, '');
const only = process.argv[3];
const wanted = (name) => !only || only === name;
/** `zoom` keeps the middle of the stage: 2 shows half its width, twice as large. */
const STAGES = [
  { name: 'brickhaven', example: 'brickhaven', tab: 'differences', zoom: 1.75 },
  { name: 'dolphin', example: 'dolphin', tab: 'volume', zoom: 1.55 },
  { name: 'fitlab', example: 'fitlab', tab: 'volume', zoom: 1.15 },
];
const RATIO = 16 / 10;
const PREVIEW = { width: 1200, height: 630 };
/** Nothing but the scene: no note, no loading text, no preview remarks over it. */
const BARE = '.note, .viewer-state, .preview-notice { display: none !important }';

const browser = await chromium.launch({
  channel: process.platform === 'win32' ? 'msedge' : undefined,
});
async function open(context, example, tab) {
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem('x3diff-theme', 'light');
    localStorage.removeItem('x3diff-workbench-side');
  });
  await page.goto(`${base}/app.html?example=${example}#${tab}`);
  await page.locator('.workspace[aria-busy="false"]').waitFor();
  await page.locator(`#tab-${tab}[aria-selected="true"]`).waitFor();
  await page.locator('.viewer-state:empty').waitFor({ state: 'attached' });
  return page;
}
/** Put the time cursor where the two trains are well apart. */
async function scrub(page) {
  const chart = await page.locator('.gap-chart').boundingBox();
  await page.mouse.click(chart.x + chart.width * 0.62, chart.y + chart.height / 2);
  await page.waitForTimeout(1500);
}

if (wanted('cards')) {
  const sharp = await browser.newContext({
    viewport: { width: 1700, height: 1000 },
    deviceScaleFactor: 2,
  });
  for (const shot of STAGES) {
    const page = await open(sharp, shot.example, shot.tab);
    await page.addStyleTag({ content: BARE });
    await page.waitForTimeout(1500);
    const stage = await page.locator('#stage').boundingBox();
    const full = Math.min(stage.width, stage.height * RATIO);
    const width = Math.floor(full / shot.zoom),
      height = Math.floor(width / RATIO);
    const file = `public/media/x3diff-example-${shot.name}.jpg`;
    await page.screenshot({
      path: file,
      type: 'jpeg',
      quality: 84,
      clip: {
        x: Math.round(stage.x + (stage.width - width) / 2),
        y: Math.round(stage.y + (stage.height - height) / 2),
        width,
        height,
      },
    });
    console.log(`${file}  ${width * 2}×${height * 2}`);
    await page.close();
  }
}

if (wanted('preview')) {
  // The workbench fills the window less the margins and the header; measure, then size the
  // window so that the workbench itself is exactly the size of a link preview.
  const plain = await browser.newContext({
    viewport: { width: PREVIEW.width + 28, height: PREVIEW.height + 70 },
    deviceScaleFactor: 1,
  });
  const page = await open(plain, 'brickhaven', 'motion');
  const first = await page.locator('.workspace').boundingBox();
  await page.setViewportSize({
    width: Math.round(PREVIEW.width + 28 + (PREVIEW.width - first.width)),
    height: Math.round(PREVIEW.height + 70 + (PREVIEW.height - first.height)),
  });
  await page.waitForTimeout(800);
  await scrub(page);
  await page
    .locator('.workspace')
    .screenshot({ path: 'public/media/x3diff-motion-paths.jpg', type: 'jpeg', quality: 86 });
  const box = await page.locator('.workspace').boundingBox();
  console.log(`public/media/x3diff-motion-paths.jpg  ${box.width}×${box.height}`);
}

if (wanted('mobile')) {
  // Narrow enough for the panel to sit under the stage; the controls between the stage and
  // the chart are left out, so the picture is the route and the gap along it.
  const narrow = await browser.newContext({
    viewport: { width: 700, height: 1300 },
    deviceScaleFactor: 1.5,
  });
  const page = await open(narrow, 'brickhaven', 'motion');
  await page.addStyleTag({
    content: `${BARE} #side > h2:first-child, #side .field { display: none !important }`,
  });
  const stage = await page.locator('#stage').boundingBox();
  await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(250);
  }
  await scrub(page);
  const chart = await page.locator('.gap-chart').boundingBox();
  const top = Math.floor(stage.y);
  const clip = {
    x: Math.floor(stage.x),
    y: top,
    width: Math.floor(stage.width),
    height: Math.ceil(chart.y + chart.height + 16 - top),
  };
  await page.screenshot({
    path: 'public/media/x3diff-motion-paths-mobile.jpg',
    type: 'jpeg',
    quality: 84,
    clip,
  });
  console.log(
    `public/media/x3diff-motion-paths-mobile.jpg  ${Math.round(clip.width * 1.5)}×${Math.round(clip.height * 1.5)}`,
  );
}
await browser.close();
