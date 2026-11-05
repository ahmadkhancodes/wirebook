import { Skeleton } from "@/components/ui/states";

/** Skeleton shaped like the request log: header, filter bar, ledger rows. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <Skeleton className="h-16 w-full rounded-none" />
        <div className="flex flex-col gap-2 p-3">
          {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}
        </div>
      </div>
    </div>
  );
}
