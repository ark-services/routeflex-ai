export function Avatar({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-rf-blue-tint text-rf-blue text-sm font-medium">
      {children}
    </div>
  );
}

export function AvatarFallback({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
