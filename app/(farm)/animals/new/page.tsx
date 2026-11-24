import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { breeds, locations } from "@/db/schema";
import { AnimalForm } from "@/components/animal-form";
import { Summary } from "@/components/workspace";
import { farmToday } from "@/lib/dates";
import { requireFarm } from "@/lib/farm-context";
import { canWriteAnimals } from "@/lib/permissions";

export const metadata = { title: "Add cattle" };

export default async function NewAnimalPage() {
  const farm = await requireFarm();
  if (!canWriteAnimals(farm.roles)) redirect("/animals");
  const today = farmToday(farm.timezone);

  const [breedRows, locationRows] = await Promise.all([
    db.select().from(breeds).where(eq(breeds.farmId, farm.farmId)).orderBy(breeds.name),
    db.select().from(locations).where(eq(locations.farmId, farm.farmId)).orderBy(locations.name),
  ]);

  return (
    <div className="space-y-5">
      <Summary title="Add cattle" description="A code and QR tag are issued when the animal is saved." />
      <AnimalForm
        today={today}
        breeds={breedRows.filter((breed) => breed.active).map((breed) => ({ id: breed.id, name: breed.name }))}
        locations={locationRows.filter((location) => location.active).map((location) => ({ id: location.id, name: location.name }))}
      />
    </div>
  );
}
