import { redirect } from "next/navigation";

export default async function DocumentsRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/docs/${id}`);
}
