/* Тест режима «Полёт по маршруту»: включаем тур, проверяем HUD,
   прогресс перелётов, выход по Esc; скриншот в полёте. */
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const errors = [];
const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true,
  args: [...chromium.args, '--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--window-size=1280,800'],
  env: { ...process.env, LD_LIBRARY_PATH: '/tmp/al2023/lib' },
  protocolTimeout: 180000,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error' && !/gpu|swiftshader|dbus|vaapi/i.test(msg.text())) errors.push(`[console.error] ${msg.text()}`);
  });

  await page.goto('http://127.0.0.1:8000/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading')?.classList.contains('done'), { timeout: 90000 });
  await new Promise(r => setTimeout(r, 3500)); // дождаться конца интро

  // включаем тур
  await page.click('label:has(#tg-tour) span');
  await new Promise(r => setTimeout(r, 5000));

  const mid = await page.evaluate(() => ({
    hudShown: document.getElementById('tour-hud').classList.contains('show'),
    leg: document.getElementById('tour-leg').textContent,
    count: document.getElementById('tour-count').textContent,
    info: document.getElementById('tour-info').textContent,
    checked: document.getElementById('tg-tour').checked,
  }));
  console.log('TOUR MID:', JSON.stringify(mid, null, 2));
  await page.screenshot({ path: 'docs/screenshot-tour.png' });

  // прогресс: через 4 секунды перелёт/счётчик должен смениться
  await new Promise(r => setTimeout(r, 4000));
  const later = await page.evaluate(() => ({
    leg: document.getElementById('tour-leg').textContent,
    count: document.getElementById('tour-count').textContent,
  }));
  console.log('TOUR LATER:', JSON.stringify(later));

  const progressOk = later.leg !== mid.leg || later.count !== mid.count;
  console.log('progress changes:', progressOk);

  // выход по Esc
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 700));
  const exited = await page.evaluate(() => ({
    hudShown: document.getElementById('tour-hud').classList.contains('show'),
    checked: document.getElementById('tg-tour').checked,
  }));
  console.log('AFTER ESC:', JSON.stringify(exited));

  const ok = mid.hudShown && progressOk && !exited.hudShown && !exited.checked && errors.length === 0;
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS ERRORS');
  console.log(ok ? 'TOUR TEST PASSED ✅' : 'TOUR TEST FAILED ❌');
  process.exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}
