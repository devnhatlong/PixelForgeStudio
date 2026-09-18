import { Suspense } from "react";
import { HomeScreen } from "@/components/home/HomeScreen";
import { LoadingBlock } from "@/components/ui/Loading";

export default function StudioPage() {
  return (
    <Suspense fallback={<LoadingBlock label="Đang tải Studio…" />}>
      <HomeScreen />
    </Suspense>
  );
}
