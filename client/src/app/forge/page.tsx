import { Suspense } from "react";
import { SpriteForge } from "@/components/sprite/SpriteForge";
import { LoadingBlock } from "@/components/ui/Loading";

export default function ForgePage() {
  return (
    <Suspense fallback={<LoadingBlock label="Đang tải Sprite Forge…" />}>
      <SpriteForge />
    </Suspense>
  );
}
