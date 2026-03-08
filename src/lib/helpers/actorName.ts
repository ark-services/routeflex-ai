/** Returns actor display name from user metadata for activity log entries. */
export function actorName(
  user: { user_metadata?: { full_name?: string }; email?: string } | null
): string {
  return user?.user_metadata?.full_name ?? user?.email ?? "Someone";
}
