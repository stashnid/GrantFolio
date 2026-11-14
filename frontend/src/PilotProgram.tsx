import program from "../../docs/research/vlasna-sprava-sources.json";
import "./PilotProgram.css";

export function PilotProgram() {
  const source = program.sources.find((item) => item.id === "diia-service")!;
  return (
    <aside className="pilot-program" aria-labelledby="pilot-title">
      <div className="pilot-program-label">ПІЛОТНА ПРОГРАМА</div>
      <h2 id="pilot-title">{program.title}</h2>
      <p>{program.summary}</p>
      <p><strong>Відкритий прийом не підтверджено.</strong> Перевірте актуальні умови та строки на офіційній сторінці.</p>
      <p>План у GrantFolio — це чернетка, а не офіційна заявка.</p>
      <a href={source.url} target="_blank" rel="noopener noreferrer">Офіційна сторінка Дії ↗</a>
    </aside>
  );
}
