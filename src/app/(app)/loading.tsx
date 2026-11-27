export default function AppLoading() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]" role="status">
      <div className="flex flex-col items-center gap-3">
        <div aria-hidden="true" className="h-8 w-8 animate-spin motion-reduce:animate-none rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Loading Invexiqs workspace…</p>
      </div>
    </div>
  );
}
