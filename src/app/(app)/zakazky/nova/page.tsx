import { Nadpis, Odkaz } from "@/components/ui";
import { FormularZakazky } from "../formular";

export default function NovaZakazka() {
  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <Nadpis popis="Ku každej zákazke potom priraďuješ doklady a faktúry.">Nová zákazka</Nadpis>
        <Odkaz href="/zakazky" variant="tichy">
          ← Späť
        </Odkaz>
      </div>
      <FormularZakazky />
    </>
  );
}
