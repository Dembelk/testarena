/* Проверка ночного рендера: фиксируем время так, чтобы Европа была в ночи,
   и убеждаемся, что огни городов (тёплые пиксели) видны на тёмной стороне. */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true,
  args: [...chromium.args, '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  protocolTimeout: 180000,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.evaluateOnNewDocument(() => {
    const RealDate = Date;
    const FIXED = new RealDate('2026-09-04T22:30:00Z').getTime();
    function D(...args) { return args.length ? new RealDate(...args) : new RealDate(FIXED); }
    D.prototype = RealDate.prototype;
    D.now = () => FIXED;
    Object.setPrototypeOf(D, RealDate);
    window.Date = D;
  });
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), { timeout: 90000 });
  await new Promise(r => setTimeout(r, 4500));
  await page.screenshot({ path: 'docs/screenshot-night.png' });
  console.log('night screenshot saved');
} finally { await browser.close(); }
