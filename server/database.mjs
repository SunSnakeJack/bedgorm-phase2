import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import pg from 'pg';

const schema = file => readFileSync(new URL(file, import.meta.url), 'utf8');

export async function openDatabase({file, databaseUrl}) {
  if (!databaseUrl) {
    const db = new DatabaseSync(file);
    db.exec(schema('schema.sql'));
    db.exec('PRAGMA busy_timeout = 5000');
    const tx = {
      get: (sql, ...args) => db.prepare(sql).get(...args),
      all: (sql, ...args) => db.prepare(sql).all(...args),
      run: (sql, ...args) => db.prepare(sql).run(...args)
    };
    let queue = Promise.resolve();
    return {
      transaction(work) {
        const job = queue.then(async () => {
          db.exec('BEGIN IMMEDIATE');
          try {
            const result = await work(tx);
            db.exec('COMMIT');
            return result;
          } catch (error) {
            db.exec('ROLLBACK');
            throw error;
          }
        });
        queue = job.catch(() => {});
        return job;
      },
      async close() {
        await queue;
        db.close();
      }
    };
  }

  const pool = new pg.Pool({
    connectionString: databaseUrl,
    max: 4,
    connectionTimeoutMillis: 5000,
    statement_timeout: 5000,
    idle_in_transaction_session_timeout: 10000,
    types: {getTypeParser: (oid, format) => oid === 20 ? Number : pg.types.getTypeParser(oid, format)}
  });
  pool.on('error', () => console.error('Idle database connection lost'));
  async function transaction(work) {
    const client = await pool.connect();
    let broken;
    try {
      await client.query('BEGIN');
      // Serialize room mutations and ticks across app processes, as with SQLite.
      await client.query('SELECT pg_advisory_xact_lock(588227, 3)');
      const query = (sql, args) => {
        let index = 0;
        return client.query(sql.replace(/\?/g, () => '$' + ++index), args);
      };
      const result = await work({
        get: async (sql, ...args) => (await query(sql, args)).rows[0],
        all: async (sql, ...args) => (await query(sql, args)).rows,
        run: (sql, ...args) => query(sql, args)
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { broken = rollbackError; }
      throw error;
    } finally {
      client.release(broken);
    }
  }

  try {
    await transaction(tx => tx.run(schema('postgres.sql')));
  } catch (error) {
    await pool.end();
    throw error;
  }
  return {transaction, close: () => pool.end()};
}
