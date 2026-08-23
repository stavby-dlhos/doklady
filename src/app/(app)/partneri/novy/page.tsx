import { Nadpis, Odkaz } from "@/components/ui";
import { FormularPartnera } from "../formular";

export default function NovyPartner() {
  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-3">
        <Nadpis popis="Zadaj IČO a klikni Dohľadať — názov a adresu doplní register.">Nový partner</Nadpis>
        <Odkaz href="/partneri" variant="tichy">
          ← Späť
        </Odkaz>
      </div>
      <FormularPartnera />
    </>
  );
}
