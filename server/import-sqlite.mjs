import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from './database.mjs';

const [source] = process.argv.slice(2);
if (!source || !process.env.DATABASE_URL) {
  console.error('Provide the path to a SQLite backup and set DATABASE_URL.');
  process.exit(1);
}
const tables = {
  rooms: ['code', 'name', 'settings', 'expires_at'],
  players: ['room_code', 'seat', 'name', 'avatar', 'bot', 'ready', 'seen_at'],
  guest_sessions: ['token_hash', 'room_code', 'seat'],
  games: ['room_code', 'state', 'deadline', 'bot_at'],
  actions: ['room_code', 'seat', 'action_id', 'version', 'payload', 'reason'],
  results: ['room_code', 'finished_at', 'result']
};
let sqlite;
let postgres;
try {
  sqlite = new DatabaseSync(source, {readOnly: true});
  sqlite.exec('BEGIN');
  if (sqlite.prepare('PRAGMA foreign_key_check').get()) throw new Error('Invalid source foreign keys');
  postgres = await openDatabase({databaseUrl: process.env.DATABASE_URL});
  const counts = await postgres.transaction(async tx => {
    const counts = {};
    for (const [table, columns] of Object.entries(tables)) {
      if (await tx.get('SELECT 1 FROM ' + table + ' LIMIT 1')) throw new Error('Target must be empty');
      const names = columns.join(',');
      const insert = 'INSERT INTO ' + table + ' (' + names + ') VALUES (' + columns.map(() => '?').join(',') + ')';
      counts[table] = 0;
      for (const row of sqlite.prepare('SELECT ' + names + ' FROM ' + table).iterate()) {
        await tx.run(insert, ...columns.map(name => row[name]));
        counts[table]++;
      }
    }
    return counts;
  });
  console.log(counts);
} catch {
  console.error('Import failed. Check the backup integrity, target emptiness and database connectivity.');
  process.exitCode = 1;
} finally {
  await postgres?.close();
  sqlite?.close();
}
