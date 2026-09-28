import { env } from "@OpenDiagram/env/server";
import { drizzle } from "drizzle-orm/node-postgres";
import net from "node:net";
import { Pool } from "pg";

import * as schema from "./schema";

export { and, desc, eq, exists, inArray, lt, ne, notInArray, or, sql } from "drizzle-orm";

// pg-pool 3.14's message for a new client's connect timeout. Its pool-queue
// timeout ("timeout exceeded...") is not retried: that means saturated, not unreachable.
const CONNECT_TIMEOUT = "Connection terminated due to connection timeout";

export function createDb() {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Slowest successful connect from Cloud Run over 14 days: 620ms.
    connectionTimeoutMillis: 3_000,
    // The one that bounds the 66s PATCH: that hang was a query on an already
    // checked-out client, which `connectionTimeoutMillis` does not cover. Client
    // side (`pg/lib/client.js` arms a plain timer), so unlike `statement_timeout`
    // it still fires when the pooler has dropped the socket and nothing replies.
    // Ceiling on hangs, not a target: the slowest real statement we have measured
    // is the 8.7s scene upsert.
    query_timeout: 30_000,
    stream: tracedSocket,
  });

  // Drizzle attaches no 'error' listener of its own, and pg-pool re-emits an idle
  // client's error on the pool. Unheard, that is fatal in Node, so one connection
  // dropped by the pooler would take the server down instead of one request.
  pool.on("error", (error) => {
    console.error("[db] idle client error", error);
  });

  // Retry a timed-out connect once: a new socket can reach another of the
  // pooler's addresses. Safe because no query has run yet. Workaround for
  // Cloud Run to Supavisor connects that never open (Sentry SERVER-C).
  // `pool.query` passes a callback, Drizzle transactions await the promise.
  //
  // TODO: a retry can't save an instance that can't reach the pooler at all
  // (28 Sep: 4 failures in 3 min on one instance). A liveness probe running
  // `SELECT 1` would let Cloud Run replace it.
  const connect = pool.connect.bind(pool);
  pool.connect = ((callback?: Parameters<typeof connect>[0]) => {
    if (!callback) {
      return connect().catch((error: Error) => {
        if (error.message !== CONNECT_TIMEOUT) throw error;
        return connect();
      });
    }
    connect((error, client, done) => {
      if (error?.message === CONNECT_TIMEOUT) return connect(callback);
      callback(error, client, done);
    });
  }) as typeof pool.connect;

  return drizzle(pool, { schema });
}

// Logs which addresses a connect tried when TCP never came up, which the pg
// error omits. `connectionAttempt`, not `lookup`: it also fires for IP literals.
function tracedSocket() {
  const socket = new net.Socket();
  const started = performance.now();
  const attempted: string[] = [];
  let tcpUp = false;
  socket.on("connectionAttempt", (ip: string) => attempted.push(ip));
  socket.once("connect", () => {
    tcpUp = true;
  });
  socket.once("close", () => {
    if (tcpUp) return;
    const ms = Math.round(performance.now() - started);
    console.warn(`[db] no TCP connection to ${attempted.join(", ") || "no address"} after ${ms}ms`);
  });
  return socket;
}

export const db = createDb();
