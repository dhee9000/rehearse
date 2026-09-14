import { Show, SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { Slate } from "./ui";

/** Header controls, wearing the app's buttons rather than Clerk's. */
export function AuthControls() {
  return (
    <div className="flex items-center gap-2.5">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button className="slate px-3 py-2 text-muted transition-colors hover:text-paper">
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="slate rounded-page bg-marker px-4 py-2.5 text-ink transition-colors hover:bg-[#ffc736]">
            Get started
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <Slate className="hidden text-faint sm:inline">Self-tape prep</Slate>
        <UserButton
          appearance={{
            elements: {
              avatarBox: "h-8 w-8 rounded-full ring-1 ring-stage-600",
            },
          }}
        />
      </Show>
    </div>
  );
}
