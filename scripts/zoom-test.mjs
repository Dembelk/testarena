/* LOD-тест: при приближении должны появляться города мира (лат. названия) */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true,
  args: [...chromium.args, '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  protocolTimeout: 180000,
});
const errors = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', err => errors.push(err.message));
  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), { timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000));

  const before = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#labels .glabel')];
    return {
      visible: els.filter(l => parseFloat(l.style.opacity || '0') > 0.3).length,
      minor: els.filter(l => l.className.includes('minor') && parseFloat(l.style.opacity || '0') > 0.3).length,
      country: els.filter(l => l.className.includes('country') && parseFloat(l.style.opacity || '0') > 0.3).length,
    };
  });
  console.log('ДАЛЕКО:', JSON.stringify(before), '(страны + избранные, без мелких)');

  // приближаемся: колесо к центру экрана (над Европой после интро)
  for (let i = 0; i < 6; i++) { await page.mouse.wheel({ deltaY: -240 }); await new Promise(r => setTimeout(r, 350)); }
  await new Promise(r => setTimeout(r, 1200));

  const after = await page.evaluate(() => {
    const els = [...document.querySelectorAll('#labels .glabel')];
    return {
      visible: els.filter(l => parseFloat(l.style.opacity || '0') > 0.3).length,
      minor: els.filter(l => l.className.includes('minor') && parseFloat(l.style.opacity || '0') > 0.3).length,
      minorNames: els.filter(l => l.className.includes('minor') && parseFloat(l.style.opacity || '0') > 0.3).slice(0, 6).map(l => l.textContent),
    };
  });
  console.log('БЛИЗКО:', JSON.stringify(after, null, 2));
  await page.screenshot({ path: 'docs/screenshot-zoom.png' });

  const ok = after.minor > 3 && errors.length === 0;
  console.log(errors.length ? 'ERRORS: ' + errors.join(' | ') : 'NO JS ERRORS');
  console.log(ok ? 'LOD TEST PASSED ✅' : 'LOD TEST FAILED ❌');
  process.exitCode = ok ? 0 : 1;
} finally { await browser.close(); }
