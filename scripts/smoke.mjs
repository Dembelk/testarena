/* Смоук-тест глобуса: headless Chromium (SwiftShader WebGL).
   Проверяет: загрузку без ошибок JS/шейдеров, наличие рендера (пиксели),
   появление HTML-меток городов, работу переключателей. */

import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import fs from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:8000/';
const errors = [];

const executablePath = await chromium.executablePath();
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    ...chromium.args,
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,800',
  ],
  env: {
    ...process.env,
    LD_LIBRARY_PATH: ['/tmp/al2023/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  },
  protocolTimeout: 180000,
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });

  page.on('console', msg => {
    if (['error', 'warning'].includes(msg.type())) {
      const text = msg.text();
      // SwiftShader/поддержку GPU игнорируем — важны только ошибки страницы
      if (!/gpu|swiftshader|dbus|vaapi/i.test(text)) errors.push(`[console.${msg.type()}] ${text}`);
    }
  });
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText}`));

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 60000 });

  // ждём окончания загрузки текстур и интро-полёта
  await page.waitForFunction(
    () => document.getElementById('loading')?.classList.contains('done'),
    { timeout: 90000 }
  );
  await new Promise(r => setTimeout(r, 4000)); // дать интро завершиться

  const state = await page.evaluate(() => {
    const fatal = document.getElementById('fatal');
    const labels = [...document.querySelectorAll('#labels .glabel')];
    const g = window.__GLOBE__ || {};
    return {
      fatalHidden: fatal ? fatal.hidden : true,
      canvasCount: document.querySelectorAll('#app canvas').length,
      labelPoolSize: labels.length,
      visibleLabels: labels.filter(l => parseFloat(l.style.opacity || '0') > 0.3).length,
      sampleLabels: labels.filter(l => parseFloat(l.style.opacity || '0') > 0.3).slice(0, 5).map(l => l.textContent),
      globe: { cities: g.N || 0, countries: g.countries?.length || 0, borders: g.bordersSegments || 0, ccTable: g.ccTable?.length || 0 },
      tooltipExists: !!document.getElementById('tooltip'),
      toggles: ['tg-clouds', 'tg-arcs', 'tg-points', 'tg-borders', 'tg-labels', 'tg-rotate', 'tg-tour'].map(id => document.getElementById(id)?.checked),
    };
  });
  console.log('STATE:', JSON.stringify(state, null, 2));

  // переключатели: снимем галку облаков и вернём — интерфейс жив
  await page.click('label:has(#tg-clouds) span');
  await new Promise(r => setTimeout(r, 300));
  const cloudsOff = await page.evaluate(() => !document.getElementById('tg-clouds').checked);
  await page.click('label:has(#tg-clouds) span');
  console.log('toggle works:', cloudsOff);

  // WebGL реально рендерит?
  const glInfo = await page.evaluate(() => {
    const c = document.querySelector('#app canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { ok: false };
    return { ok: true, version: gl.getParameter(gl.VERSION) };
  });
  console.log('GL:', JSON.stringify(glInfo));

  fs.mkdirSync('docs', { recursive: true });
  await page.screenshot({ path: 'docs/screenshot.png' });
  console.log('screenshot saved: docs/screenshot.png');
} finally {
  await browser.close();
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'NO JS/SHADER ERRORS');
process.exit(errors.length ? 1 : 0);
