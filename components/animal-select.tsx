import { FormSelect } from "@/components/form-select";

export function AnimalSelect({
  animals,
  name = "animalId",
}: {
  animals: { id: string; code: string; name: string | null }[];
  name?: string;
}) {
  return (
    <FormSelect
      name={name}
      required
      options={animals.map((animal) => ({
        value: animal.id,
        label: animal.name ? `${animal.code} · ${animal.name}` : animal.code,
      }))}
    />
  );
}
