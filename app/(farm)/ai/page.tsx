import { AiChat } from "@/components/ai-chat";
import { requireFarm } from "@/lib/farm-context";
import { geminiConfigured } from "@/lib/ai/config";

export default async function AiPage() {
  const farm = await requireFarm();
  return <AiChat farmName={farm.farmName} configured={geminiConfigured()} />;
}
