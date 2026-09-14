import { auth } from "@clerk/nextjs/server";

/**
 * The signed-in user's id, or null. The proxy already blocks unauthenticated
 * requests to these routes; this is the second check, so a route can never
 * read data without an owner even if the matcher is later loosened.
 */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}
