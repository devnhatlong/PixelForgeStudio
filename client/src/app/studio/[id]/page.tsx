import { EditorPage } from "@/components/editor/EditorPage";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPage id={decodeURIComponent(id)} />;
}
