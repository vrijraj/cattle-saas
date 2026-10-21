import { inputClass } from "@/components/workspace";

export function AnimalSelect({
  animals,
  name = "animalId",
}: {
  animals: { id: string; code: string; name: string | null }[];
  name?: string;
}) {
  return (
    <select name={name} required className={inputClass}>
      {animals.map((animal) => (
        <option key={animal.id} value={animal.id}>
          {animal.code}
          {animal.name ? ` · ${animal.name}` : ""}
        </option>
      ))}
    </select>
  );
}
