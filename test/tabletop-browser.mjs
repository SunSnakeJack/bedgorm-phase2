import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {AxeBuilder} from '@axe-core/playwright';
import {serve} from '../server/index.mjs';
import {decode, keys} from '../dist/session.mjs';
import {cats} from '../dist/engine.mjs';

const snapshots = process.env.BEDGORM_SCREENSHOTS;
const baseline = process.env.BEDGORM_BASELINE_SERVER;
const browserOptions = process.env.BEDGORM_CHROME
  ? {executablePath: process.env.BEDGORM_CHROME}
  : {channel: 'chrome'};
const browser = await chromium.launch(browserOptions);
let app;
let previous;

async function capture(target, filename) {
  if (snapshots) await target.screenshot({path: join(snapshots, filename), animations: 'disabled'});
}

async function localGame(page, url, variant, width, check) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.locator('.hero [data-route=lobby]').click();
  await page.locator('#lobby input[name=name]').fill('QA Host');
  if ([1440, 768, 390].includes(width)) await capture(page, variant + '-lobby-' + width + '.png');
  await page.locator('summary').click();
  await page.locator('[name=seed]').fill('42');
  await page.locator('#lobby [type=submit]').click();
  await page.locator('.board').waitFor();
  if ([1440, 768, 390].includes(width) && snapshots) {
    await page.screenshot({path:join(snapshots, variant + '-game-' + width + '.png'), animations:'disabled', fullPage:true});
  }
  if (width === 1440) {
    await capture(page.locator('.board-panel'), variant + '-board.png');
    await capture(page.locator('.action-panel'), variant + '-actions.png');
  }
  if (!check) return;

  const tiles = await page.locator('[data-space]').evaluateAll(nodes =>
    nodes.map(node => [Number(node.dataset.space), Number(node.style.gridRowStart), Number(node.style.gridColumnStart)]));
  assert.equal(tiles.length, 16);
  for (const [index, [space, row, col]] of tiles.entries()) {
    assert.equal(space, index + 1);
    const [, nextRow, nextCol] = tiles[(index + 1) % tiles.length];
    assert.equal(Math.abs(row - nextRow) + Math.abs(col - nextCol), 1);
  }
  assert.equal(await page.locator('.track-cat').count(), 7);
  assert.equal(await page.locator('.track-cat.reverse-cat').count(), 2);
  const stacked = page.locator('.space:has(.stack-count)').first();
  const space = Number(await stacked.getAttribute('data-space'));
  const stored = await page.evaluate(key => localStorage.getItem(key), keys.match);
  const stack = decode(stored).game.track[space];
  await stacked.click();
  const labels = await page.locator('dialog li > span:last-of-type').allTextContents();
  assert.deepEqual(labels.map(label => label.trim()), [...stack].reverse().map(id => cats[id].name));
  await page.keyboard.press('Escape');

  await page.locator('[data-panel=leg]').click();
  assert.equal(await page.locator('[data-panel=leg]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-act^=leg]').count(), 5);
  await page.locator('[data-panel=item]').click();
  assert.equal(await page.locator('[data-item]').count(), 2);
  await page.locator('[data-panel=overall]').click();
  assert.equal(await page.locator('[data-overall]').count(), 5);
  await page.locator('[data-panel=roll]').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.matches(':focus-visible')), true);
  assert.equal(await page.locator('.track-cat').first().evaluate(node => {
    node.classList.add('moving-cat');
    return getComputedStyle(node).animationName;
  }), 'none');
  assert.equal(await page.locator('.action-panel').evaluate(node => getComputedStyle(node).position === 'sticky'), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  assert.deepEqual(errors, []);
  if (width === 390) {
    const audit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(audit.violations.map(({id,nodes}) => [id,nodes.map(node => node.target)]), []);
  }
}

async function onlineGame(url) {
  const host = await browser.newPage();
  const guest = await browser.newPage();
  try {
    await host.goto(url + '/#online');
    await host.locator('#create-room [name=name]').fill('QA Host');
    await host.locator('#create-room [name=seats]').selectOption('4');
    await host.locator('#create-room [name=botCount]').selectOption('2');
    await host.locator('#create-room [name=timer]').selectOption('0');
    await host.locator('#create-room button').click();
    const invite = await host.locator('input[type=url]').inputValue();
    await guest.goto(invite);
    await guest.locator('#join-room [name=name]').fill('QA Guest');
    await guest.locator('#join-room button').click();
    await guest.locator('[data-online-cmd=ready]').click();
    await host.locator('[data-online-cmd=start]:enabled').click();
    const roll = '[data-act^=roll]';
    await guest.locator(roll + ':disabled').waitFor();
    await host.locator(roll + ':enabled').click();
    await guest.locator(roll + ':enabled').waitFor();
    await guest.reload();
    await guest.locator(roll + ':enabled').waitFor();
    assert.equal(await guest.locator('[data-space]').count(), 16);
  } finally {
    await host.close();
    await guest.close();
  }
}

try {
  if (snapshots) await mkdir(snapshots, {recursive:true});
  app = await serve({port:0, file:':memory:'});
  if (baseline) previous = await (await import(pathToFileURL(baseline).href)).serve({port:0,file:':memory:'});
  assert.equal((await fetch(app.url + '/cat-park.svg')).headers.get('content-type'), 'image/svg+xml');
  for (const width of [1440,1024,768,390,360]) {
    const context = await browser.newContext({viewport:{width,height:width > 768 ? 1080 : 1000}, reducedMotion:'reduce'});
    const page = await context.newPage();
    try {
      await localGame(page, app.url, 'after', width, true);
      if (previous && [1440,768,390].includes(width)) {
        await page.evaluate(() => localStorage.clear());
        await localGame(page, previous.url, 'before', width, false);
      }
    } finally { await context.close(); }
  }
  await onlineGame(app.url);
  console.log('Tabletop browser checks passed at 1440, 1024, 768, 390 and 360 px including axe and independent guest reconnect.');
} finally {
  await browser.close();
  await app?.close();
  await previous?.close();
}
