import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {serve} from '../server/index.mjs';

for (const [humans, bots] of [[2, 2], [4, 0], [8, 0]]) {
  test(`${humans} guests and ${bots} bots finish a multiplayer game`, async () => {
    let now = 100_000;
    const app = await serve({port: 0, file: ':memory:', clock: () => now, tickMs: 0});

    async function call(path, body, token, expected = 200) {
      const headers = {};
      if (body) headers['Content-Type'] = 'application/json';
      if (token) headers.Authorization = 'Bearer ' + token;
      const response = await fetch(app.url + '/api/' + path, {
        method: body ? 'POST' : 'GET',
        body: body ? JSON.stringify(body) : undefined,
        headers
      });
      assert.equal(response.status, expected);
      return response.json();
    }

    try {
      const host = await call('rooms', {
        name: 'QA Host', avatar: 0, seats: humans + bots,
        bots: Array.from({length: bots}, () => 'normal'), timer: 0
      }, null, 201);
      const room = 'rooms/' + host.code;
      const seats = new Map([[0, host.token]]);
      for (let i = 1; i < humans; i++) {
        const guest = await call(room + '/join', {name: 'QA Guest ' + i, avatar: 0}, null, 201);
        seats.set(guest.me, guest.token);
        await call(room + '/ready', {ready: true}, guest.token);
      }
      let {game} = await call(room + '/start', {}, host.token);
      for (let turn = 0; !game.ended && turn < 180; turn++) {
        const token = seats.get(game.turn);
        if (token) {
          ({game} = await call(room + '/move', {
            version: game.step, move: {type: 'roll'}, id: randomUUID()
          }, token));
        } else {
          now += 800;
          await app.tick();
          ({game} = await call(room, undefined, host.token));
        }
      }
      assert.ok(game.ended);
      assert.ok(game.winners.length);
      const scores = game.players.map(player => player.score);
      for (const [seat, token] of seats) {
        const reconnected = await call(room, undefined, token);
        assert.equal(reconnected.me, seat);
        assert.equal(reconnected.game.step, game.step);
        assert.deepEqual(reconnected.game.players.map(player => player.score), scores);
      }
      now += 31 * 86_400_000;
      await app.tick();
      await call(room, undefined, host.token, 404);
    } finally {
      await app.close();
    }
  });
}
