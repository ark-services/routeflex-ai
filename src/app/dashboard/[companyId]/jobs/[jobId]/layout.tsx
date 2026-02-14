// This layout passes the jobId down to the AppShell
export default async function JobLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // The jobId will be extracted by the page component
  // This layout just passes children through
  return <>{children}</>;
}
