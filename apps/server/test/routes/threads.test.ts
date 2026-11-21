/**
 * Thread routes through the real projects router: requireAuth, the handlers and
 * their SQL against PGlite. Only better-auth is stood in for, as a session read
 * from an `x-test-user` header (or a thrown lookup for `x-test-auth: down`).
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { project, projectFile } from "@OpenDiagram/db/schema/projects";
import { user } from "@OpenDiagram/db/schema/auth";
import { Hono } from "hono";
import { resetDb, testDb } from "../support/db";

mock.module("@OpenDiagram/auth", () => ({
  auth: {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        if (headers.get("x-test-auth") === "down") throw new Error("pooler unreachable");
        const id = headers.get("x-test-user");
        return {
          headers: new Headers(),
          response: id ? { user: { id }, session: { id: `s-${id}` } } : null,
        };
      },
    },
  },
}));
const { projectsRoute } = await import("../../src/routes/projects");

const app = new Hono()
  .use("*", async (c, next) => {
    c.set("log" as never, { set() {}, warn() {}, error() {}, info() {} } as never);
    await next();
  })
  .route("/api/projects", projectsRoute);

const call = (path: string, init: RequestInit & { as?: string } = {}) => {
  const headers = new Headers(init.headers);
  if (init.as) headers.set("x-test-user", init.as);
  if (init.body) headers.set("content-type", "application/json");
  return app.request(`/api/projects${path}`, { ...init, headers });
};

beforeEach(async () => {
  await resetDb();
  await testDb.insert(user).values([
    { id: "ann", name: "Ann", email: "ann@example.com" },
    { id: "bob", name: "Bob", email: "bob@example.com" },
  ]);
  await testDb.insert(project).values({ id: "p1", userId: "ann", name: "Shop" });
  await testDb
    .insert(projectFile)
    .values({ id: "f1", projectId: "p1", type: "diagram", name: "Canvas" });
});

describe("thread routes", () => {
  test("no session is a 401", async () => {
    expect((await call("/p1/files/f1/threads")).status).toBe(401);
  });

  test("a failed session lookup is a 503, not a logout", async () => {
    const res = await call("/p1/files/f1/threads", { headers: { "x-test-auth": "down" } });
    expect(res.status).toBe(503);
  });

  test("New chat creates a thread that the history lists", async () => {
    const created = await call("/p1/files/f1/threads", { method: "POST", as: "ann", body: "{}" });
    expect(created.status).toBe(201);
    const { thread } = (await created.json()) as { thread: { id: string; title: string } };
    expect(thread.title).toBe("New chat");
    const { threads } = (await (await call("/p1/files/f1/threads", { as: "ann" })).json()) as {
      threads: { id: string }[];
    };
    expect(threads.map((t) => t.id)).toEqual([thread.id]);
  });

  test("the history is metadata only: no message bodies, no spec", async () => {
    const { thread } = (await (
      await call("/p1/files/f1/threads", { method: "POST", as: "ann", body: "{}" })
    ).json()) as {
      thread: { id: string };
    };
    const turn = {
      messages: [{ clientId: "m1", role: "user", parts: [{ type: "text", text: "Draw a shop" }] }],
    };
    expect(
      (
        await call(`/p1/threads/${thread.id}/messages`, {
          method: "POST",
          as: "ann",
          body: JSON.stringify(turn),
        })
      ).status,
    ).toBe(201);
    const { threads } = (await (await call("/p1/files/f1/threads", { as: "ann" })).json()) as {
      threads: object[];
    };
    for (const t of threads)
      expect(Object.keys(t).sort()).toEqual(["createdAt", "id", "title", "updatedAt"]);
  });

  test("the first message names the thread", async () => {
    const { thread } = (await (
      await call("/p1/files/f1/threads", { method: "POST", as: "ann", body: "{}" })
    ).json()) as {
      thread: { id: string };
    };
    const turn = {
      messages: [
        {
          clientId: "m1",
          role: "user",
          parts: [{ type: "text", text: "Draw a shop\nwith payments" }],
        },
      ],
    };
    const res = await call(`/p1/threads/${thread.id}/messages`, {
      method: "POST",
      as: "ann",
      body: JSON.stringify(turn),
    });
    expect(((await res.json()) as { title: string }).title).toBe("Draw a shop");
  });

  test("someone else's canvas is invisible: empty history, 404 on create, append and delete", async () => {
    const { thread } = (await (
      await call("/p1/files/f1/threads", { method: "POST", as: "ann", body: "{}" })
    ).json()) as {
      thread: { id: string };
    };
    expect(
      ((await (await call("/p1/files/f1/threads", { as: "bob" })).json()) as { threads: unknown[] })
        .threads,
    ).toEqual([]);
    expect(
      (await call("/p1/files/f1/threads", { method: "POST", as: "bob", body: "{}" })).status,
    ).toBe(404);
    const turn = { messages: [{ clientId: "m1", role: "user", parts: [] }] };
    expect(
      (
        await call(`/p1/threads/${thread.id}/messages`, {
          method: "POST",
          as: "bob",
          body: JSON.stringify(turn),
        })
      ).status,
    ).toBe(404);
    expect((await call(`/p1/threads/${thread.id}`, { method: "DELETE", as: "bob" })).status).toBe(
      404,
    );
  });

  test("touching an older thread makes it the one the canvas reopens on", async () => {
    const make = async () =>
      (
        (await (
          await call("/p1/files/f1/threads", { method: "POST", as: "ann", body: "{}" })
        ).json()) as { thread: { id: string } }
      ).thread.id;
    const older = await make();
    await Bun.sleep(5);
    await make();
    await Bun.sleep(5);
    expect(
      (await call(`/p1/threads/${older}`, { method: "PATCH", as: "ann", body: "{}" })).status,
    ).toBeLessThan(300);
    const active = (await (await call("/p1/files/f1/threads/active", { as: "ann" })).json()) as {
      thread: { id: string };
    };
    expect(active.thread.id).toBe(older);
  });

  test("a canvas with no conversation yet answers 204", async () => {
    expect((await call("/p1/files/f1/threads/active", { as: "ann" })).status).toBe(204);
  });
});
