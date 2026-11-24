import type { User } from "@supabase/supabase-js"

import { isAnonymousUser } from "@/lib/authz/roles"

/**
 * `user_metadata` flag set when a guest links an email and cleared once the password is
 * created. It only drives UI reminders: it is user-editable and never grants access.
 */
export const PASSWORD_PENDING_METADATA_KEY = "password_pending"

/** Matches the Supabase Auth default minimum password length. */
export const MIN_PASSWORD_LENGTH = 6

/**
 * Whether a converted guest still has to create the password it will sign in with.
 *
 * @param user - Current Supabase user.
 * @returns `true` for permanent accounts whose linked email has no password yet.
 */
export function needsPasswordSetup(user: Pick<User, "is_anonymous" | "user_metadata"> | null | undefined): boolean {
  return Boolean(user) && !isAnonymousUser(user) && user?.user_metadata?.[PASSWORD_PENDING_METADATA_KEY] === true
}
