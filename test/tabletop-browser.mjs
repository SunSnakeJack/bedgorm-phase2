import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright-core';
import {AxeBuilder} from '@axe-core/playwright';
import {serve} from '../server/index.mjs';
import {decode, encode, keys} from '../dist/session.mjs';
import {cats} from '../dist/engine.mjs';

const snapshots = process.env.BEDGORM_SCREENSHOTS;
const baseline = process.env.BEDGORM_BASELINE_SERVER;
const mobileComparison = process.env.BEDGORM_MOBILE_UX_CAPTURE;
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
  if (!mobileComparison && [1440, 768, 390].includes(width)) await capture(page, variant + '-lobby-' + width + '.png');
  await page.locator('summary').click();
  await page.locator('[name=seed]').fill('42');
  await page.locator('#lobby [type=submit]').click();
  await page.locator('.board').waitFor();
  if (mobileComparison && width<=390) await capture(page, variant+'-game-'+width+'.png');
  if (!mobileComparison && [1440, 768, 390].includes(width) && snapshots) {
    await page.screenshot({path:join(snapshots, variant + '-game-' + width + '.png'), animations:'disabled', fullPage:true});
  }
  if (!mobileComparison && width === 1440) {
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

  if (width<=390) {
    const dock=await page.locator('.action-panel').boundingBox();
    const field=await page.locator('.board').boundingBox();
    assert.ok(field.y+field.height<=dock.y,'The collapsed dock obscures the board');
    assert.ok(dock.y+dock.height<=page.viewportSize().height);
    assert.equal(await page.locator('.quick-roll').isVisible(),true);
    assert.equal(await page.locator('#action-details').isVisible(),false);
  }
  await page.locator('[data-panel=leg]').click();
  assert.equal(await page.locator('[data-panel=leg]').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('[data-act^=leg]').count(), 5);
  if(width<=390){
    const dock=await page.locator('.action-panel').boundingBox();
    const track=await page.locator('.board').boundingBox();
    assert.ok(track.y>=0&&track.y+track.height<=dock.y,'The expanded betting controls must keep the track visible');
  }
  if (mobileComparison&&width===390) await capture(page,'after-action-details-390.png');
  await page.locator('[data-panel=item]').click();
  assert.equal(await page.locator('[data-item]').count(), 2);
  await page.locator('[data-panel=overall]').click();
  assert.equal(await page.locator('[data-overall]').count(), 5);
  if (width<=390) {
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#action-details').isVisible(),false);
    await page.locator('.quick-roll').focus();
  } else {
    await page.locator('[data-panel=roll]').focus();
    await page.keyboard.press('Enter');
  }
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.matches(':focus-visible')), true);
  assert.equal(await page.locator('.track-cat').first().evaluate(node => {
    node.classList.add('moving-cat');
    return getComputedStyle(node).animationName;
  }), 'none');
  assert.equal(await page.locator('.action-panel').evaluate(node => getComputedStyle(node).position==='fixed'),width<=390);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
  assert.deepEqual(errors, []);
  if (width === 390) {
    const audit = await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();
    assert.deepEqual(audit.violations.map(({id,nodes}) => [id,nodes.map(node => node.target)]), []);
  }
  for (const count of width===390?[2,3,7]:[]) {
    const fixture=decode(stored).game;
    const stack=Array.from({length:count},(_,i)=>i);
    fixture.track={3:stack,14:cats.map((_,i)=>i).slice(count)};
    await page.evaluate(([key,value])=>localStorage.setItem(key,value),[keys.match,encode(fixture,null)]);
    await page.reload();
    const cell=page.locator('[data-space="3"]');
    assert.equal(await cell.locator('.stack-count').textContent(),String(count));
    const pieces=await cell.locator('.stack-piece').evaluateAll(nodes=>nodes.map(node=>({
      top:node.getBoundingClientRect().top,left:node.getBoundingClientRect().left
    })));
    assert.equal(new Set(pieces.map(({top,left})=>top+':'+left)).size,count);
    if(mobileComparison&&count===7)await capture(page,'after-seven-cats-390.png');
    await cell.click();
    assert.deepEqual(await page.locator('dialog li > span:last-of-type').allTextContents(),[...stack].reverse().map(id=>cats[id].name));
    assert.equal(await page.locator('dialog small').count(),count);
    await page.keyboard.press('Escape');
  }
}

async function onlineGame(url) {
  const host = await browser.newPage();
  const guest = await browser.newPage({viewport:{width:390,height:640}});
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
    const roll = '.action-options [data-act^=roll]';
    const guestRoll = '.quick-roll';
    await guest.locator(guestRoll + ':disabled').waitFor();
    await host.locator(roll + ':enabled').click();
    await guest.locator(guestRoll + ':enabled').waitFor();
    await guest.reload();
    await guest.locator(guestRoll + ':enabled').waitFor();
    assert.equal(await guest.locator('[data-space]').count(), 16);
    await guest.locator(guestRoll + ':enabled').click();
    const replay=guest.locator('#bot-replay span');
    await replay.filter({hasText:/บอต 1 /}).waitFor();
    const time=Date.now();
    await replay.filter({hasText:/บอต 2 /}).waitFor();
    assert.ok(Date.now()-time>=1200,'The first bot result should remain readable before the next');
    const field=await guest.locator('.board').boundingBox();
    const dock=await guest.locator('.action-panel').boundingBox();
    assert.ok(field.y+field.height<=dock.y,'Bot feedback plus the dock must leave the track readable');
    if(mobileComparison)await capture(guest,'after-bot-action.png');
    await host.locator(roll + ':enabled').waitFor();
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
    const height=width<=390?640:width>768?1080:1000;
    const context = await browser.newContext({viewport:{width,height}, reducedMotion:'reduce'});
    const page = await context.newPage();
    try {
      await localGame(page, app.url, 'after', width, true);
      if (previous && (mobileComparison?width<=390:[1440,768,390].includes(width))) {
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
