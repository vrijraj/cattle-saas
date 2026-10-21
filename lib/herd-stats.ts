export type HerdAnimal = {
  id: string;
  presence: "on_farm" | "sold" | "dead" | "transferred";
  lactation: "not_applicable" | "pre_lactation" | "lactating" | "dry";
  reproduction: "not_applicable" | "open" | "bred" | "pregnant" | "fresh";
  dob: string | null;
  isDam: boolean;
};

export type HerdCounts = {
  total: number;
  lactating: number;
  dry: number;
  pregnant: number;
  calves: number;
};

export function isUnderOneYear(dob: string, today: string) {
  const birth = new Date(`${dob}T00:00:00Z`);
  const firstBirthday = new Date(birth);
  firstBirthday.setUTCFullYear(firstBirthday.getUTCFullYear() + 1);
  const current = new Date(`${today}T00:00:00Z`);
  return current < firstBirthday;
}

export function herdCounts(animals: HerdAnimal[], today: string): HerdCounts {
  const onFarm = animals.filter((animal) => animal.presence === "on_farm");
  return {
    total: onFarm.length,
    lactating: onFarm.filter((animal) => animal.lactation === "lactating").length,
    dry: onFarm.filter((animal) => animal.lactation === "dry").length,
    pregnant: onFarm.filter((animal) => animal.reproduction === "pregnant").length,
    calves: onFarm.filter(
      (animal) => animal.dob !== null && isUnderOneYear(animal.dob, today) && !animal.isDam,
    ).length,
  };
}
