import { Loader } from "@/components/ui/loader";

export default function Loading() {
  return (
    <div className="flex items-center justify-center py-32">
      <Loader label="Chargement…" />
    </div>
  );
}
