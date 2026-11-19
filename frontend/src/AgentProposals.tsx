import { useRef, useState } from "react";
import { ApiError, readableApiError } from "./api";
import type { AgentRequestInit } from "./agent-progress";
export type PendingProposal = {id:string;kind:"text_application_fields"|"profile_fields"|"financial_assumptions";changes:Record<string,unknown>;caseRevision:number;profileRevision:number;status:string;unverified?:boolean};
const labels:Record<string,string>={text_application_fields:"Текст заявки",profile_fields:"Профіль бізнесу",financial_assumptions:"Фінансові припущення",projectDescription:"Опис проєкту",customers:"Клієнти",salesChannels:"Канали продажу",implementationPlan:"План реалізації",expectedResults:"Очікувані результати",businessName:"Назва бізнесу",description:"Опис",region:"Регіон"};
const financeLabels: Record<string,string> = {
 startMonth:"Перший місяць",horizonMonths:"Період, місяців",openingBalanceKopecks:"Початковий залишок",tax:"Податки",profile:"Система оподаткування",vat:"ПДВ",localSingleTaxKopecks:"Місцевий єдиний податок за місяць",selfEsv:"ЄСВ за себе",exemptionReason:"Підстава пільги",futureRates:"Сценарій майбутніх ставок",months:"Помісячні припущення",salesKopecks:"Виручка",additionalIncomeKopecks:"Інші надходження",grantKopecks:"Грантові надходження",ownKopecks:"Власні надходження",operatingCostsKopecks:"Операційні витрати",capitalCostsKopecks:"Капітальні витрати",taxableRevenueKopecks:"Оподатковуваний дохід",paidTaxKopecks:"Сплачені податки",eligiblePaidTaxKopecks:"Податки для покриття гранту",eligibleTaxBasis:"Підстава зарахування",staff:"Працівники",existingCount:"Наявні працівники",newCount:"Нові працівники",grossMonthlyKopecks:"Місячна зарплата одного працівника до утримань",employerEsvRateBasisPoints:"Ставка ЄСВ роботодавця, базисні пункти",exceptionReason:"Підстава винятку",overrides:"Ручні значення",singleTaxKopecks:"Єдиний податок",militaryLevyKopecks:"Військовий збір ФОП",selfEsvKopecks:"ЄСВ за себе",employerEsvKopecks:"ЄСВ роботодавця",employeeIncomeTaxKopecks:"ПДФО працівників",employeeMilitaryLevyKopecks:"Військовий збір працівників",legalForm:"Організаційна форма",industry:"Сфера діяльності",kved:"КВЕД",city:"Місто",teamSize:"Розмір команди",teamExperience:"Досвід команди",grantExperience:"Грантовий досвід",fundingPurpose:"Мета фінансування",requestedAmount:"Запитувана сума",ownContribution:"Власний внесок"
};
const values:Record<string,string>={fop2:"ФОП, 2 група",fop3:"ФОП, 3 група",other:"Інша система",registered:"Платник ПДВ",not_registered:"Без ПДВ",standard:"Звичайна ставка",exempt:"Пільга",unknown:"Не визначено",hold_2026_as_scenario:"Ставки 2026 року як прогнозне припущення"};
function ProposalValue({value,field=""}:{value:unknown;field?:string}) {
 if(value===null)return <span>Не визначено</span>;
 if(Array.isArray(value))return <div>{value.map((item,index)=><details key={index}><summary>{field==="months"?`Місяць ${index+1}`:`Запис ${index+1}`}</summary><ProposalValue value={item}/></details>)}</div>;
 if(typeof value==="object"&&value)return <dl>{Object.entries(value).filter(([key])=>key!=="schemaVersion").map(([key,item])=><div key={key}><dt>{financeLabels[key]??labels[key]??key}</dt><dd><ProposalValue value={item} field={key}/></dd></div>)}</dl>;
 if(typeof value==="number"&&field.endsWith("Kopecks"))return <span>{new Intl.NumberFormat("uk-UA",{style:"currency",currency:"UAH"}).format(value/100)}</span>;
 return <span style={{whiteSpace:"pre-wrap"}}>{values[String(value)]??String(value)}</span>;
}
export function AgentProposals({proposals,request,blocked,onApplied}:{proposals:PendingProposal[];request:(path:string,init?:AgentRequestInit)=>Promise<Response>;blocked?:boolean;onApplied?:()=>void}){
 const[active,setActive]=useState<string|null>(null);const[applied,setApplied]=useState<string[]>([]);const[error,setError]=useState("");const keys=useRef<Record<string,string>>({});
 async function apply(p:PendingProposal){if(active||blocked)return;setActive(p.id);setError("");try{
 const idempotencyKey=keys.current[p.id]??(keys.current[p.id]=crypto.randomUUID());
 const response=await request(`/api/agent-proposals/${p.id}/apply`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({expectedRevision:p.caseRevision,expectedProfileRevision:p.profileRevision,idempotencyKey})});
 if(!response.ok){if(response.status===409)throw Error("Проєкт або профіль змінився. Оновіть дані й попросіть нову пропозицію.");throw new ApiError("http",response.status);}
 setApplied(prev=>[...prev,p.id]);onApplied?.();
 }catch(e){setError(e instanceof ApiError?readableApiError(e,"Не вдалося підтвердити застосування. Можна повторити з тим самим ключем."):e instanceof Error?e.message:"Не вдалося застосувати пропозицію.");}finally{setActive(null);}}
 return <section className="chat-actionable-card" aria-label="Пропозиції змін">
 <strong>Запропоновані зміни</strong><p>Перегляньте значення. Збереження відбудеться лише після вашого підтвердження.</p>
 {proposals.map(p=><details key={p.id}><summary>{labels[p.kind]??"Пропозиція"}</summary>
 {p.kind==="financial_assumptions" && <p>Це вхідні припущення. Їх потрібно перевірити розрахунком перед використанням у документах.</p>}
 <ProposalValue value={p.changes}/>

 <button type="button" disabled={blocked||!!active||applied.includes(p.id)||p.status!=="pending"} onClick={()=>void apply(p)}>{applied.includes(p.id)||p.status==="applied"?"Застосовано":active===p.id?"Зберігаємо…":"Підтвердити й зберегти ці зміни"}</button>
 </details>)}{error&&<p role="alert">{error}</p>}</section>;
}
