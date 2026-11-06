import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading usage" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2"><Skeleton className="h-8 w-1/4" /><Skeleton className="h-4 w-1/2" /></div>
      <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-28 w-full" />)}</div>
      <Skeleton className="h-72 w-full" />
      <Skeleton className="h-72 w-full" />
    </div>
  );
}
