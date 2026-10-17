import "server-only";
import { ZodError } from "zod";
import { AuthError } from "./auth";

export const json = (data: unknown, init?: ResponseInit) => Response.json(data, init);

/** Wraps a route handler: maps auth/validation errors to 401/400 and logs everything else. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof AuthError) return json({ error: e.message }, { status: 401 });
      if (e instanceof ZodError) return json({ error: e.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      console.error(e);
      return json({ error: "Something went wrong" }, { status: 500 });
    }
  };
}
