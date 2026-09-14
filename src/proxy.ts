import { clerkMiddleware } from "@clerk/nextjs/server";

/**
 * Attaches Clerk's auth context to every request. It deliberately does NOT
 * decide what's protected: Core 3 deprecated `createRouteMatcher` because path
 * matching can diverge from how Next actually routes, leaving protected
 * resources reachable. Enforcement lives next to the data instead — every API
 * route and protected page checks the signed-in user and the owning row.
 *
 * Next 16 renamed this file convention from `middleware` to `proxy`; the
 * runtime is nodejs and cannot be set to edge.
 */
export default clerkMiddleware();

export const config = {
  matcher: [
    // Everything but Next internals and static files, plus all API routes.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|cur|heic|heif|mp4)(?:$|[?#])|[^?]*\\.(?:json|xml|txt)(?:$|[?#])).*)",
    "/(api|trpc)(.*)",
  ],
};
