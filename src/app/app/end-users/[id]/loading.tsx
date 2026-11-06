import { Skeleton } from "@/components/ui/states";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading company file" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pb-2"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-4 w-1/4" /></div>
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
