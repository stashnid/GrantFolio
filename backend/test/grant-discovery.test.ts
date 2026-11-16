import test from "node:test";
import assert from "node:assert/strict";
import { searchGrants as discover, friendlyTitle } from "../src/grant-discovery.js";
import { GRANT_CATALOG } from "../src/grant-catalog-data.js";

const searchGrants = (query:string) => discover(query, GRANT_CATALOG, new Date("2026-11-16T15:00:00Z"));

test("business needs, transport, typos and unrelated requests", () => {
  for (const q of ["авто", "автмо", "потрібен фургон для доставки"]) {
    const r = searchGrants(q);
    assert.equal(r.matches[0]?.programId, "vlasna-sprava");
    assert.match(r.matches[0].reason, /комерційний/);
  }
  assert.equal(searchGrants("авто для особистих потреб").matches.length, 0);
  for (const q of ["автоклав", "автоматизація", "autoclave"])
    assert(!searchGrants(q).intents.includes("transport"));
  const service = searchGrants("грант на автосервіс");
  assert.equal(service.matches[0]?.programId, "vlasna-sprava");
  assert.doesNotMatch(service.matches[0].reason, /комерційний/);
  for (const q of [
    "хочу відкрити кавярню",
    "стартап",
    "інноваційний бізнес",
    "навчання персоналу бізнесу",
  ])
    assert(searchGrants(q).matches.some(m=>m.programId==="vlasna-sprava"),q);
  const production=searchGrants("обладнання для виробництва");
  assert(production.matches.some(m=>m.programId==="bloom-sme"));
  assert(!production.matches.some(m=>m.programId==="processing-business"));
  assert(!searchGrants("хочу посадити ягідник").matches.some(m=>m.programId==="agro-gardens"));
  assert.equal(searchGrants("полетіти на марс").matches.length, 0);
  assert(GRANT_CATALOG.every((p) => friendlyTitle(p).length > 5));
});
test("student and youth are applicants, not a grant eligibility determination", () => {
  for (const q of [
    "гранти для студентів",
    "гранти студентам на кафе",
    "грант для молоді",
    "я студент хочу відкрити кафе",
  ]) {
    const r = searchGrants(q);
    assert.equal(r.matches[0]?.programId, "vlasna-sprava", q);
    assert.match(r.matches[0].reason, /вік/);
    assert.match(r.matches[0].caution, /уточнити/);
  }
});
test("personal education is outside business scope", () => {
  for (const q of [
    "хочу навчатися за кордоном",
    "студенту стипендія на магістратуру",
    "не хочу авто, хочу навчатися",
    "не знаю який грант на навчання",
    "хочу навчатися без досвіду",
  ]) {
    const r = searchGrants(q);
    assert.equal(r.matches.length, 0, q);
    assert.match(r.explanation, /бізнес/);
  }
});
test("negative needs and unrelated missing prerequisites retain positive business intent", () => {
  assert.equal(
    searchGrants("не для навчання, потрібне авто").matches[0]?.programId,
    "vlasna-sprava",
  );
  assert.equal(
    searchGrants("потрібне авто без кредиту").matches[0]?.programId,
    "vlasna-sprava",
  );
  const mixed = searchGrants(
    "Я студент, хочу відкрити кафе. Для навчання гроші не потрібні. Хочу обладнання для бізнесу.",
  );
  assert.equal(mixed.matches[0]?.programId, "vlasna-sprava");
  assert(!searchGrants("не авто а навчання").intents.includes("transport"));
});

test("business queries tolerate common variants and guard eligibility", () => {
 for(const q of ["харчування", "пекарня", "швейна майстерня", "кофейня", "bakery", "rfdzhzyz", "обладнання для виробництва"]) assert(searchGrants(q).matches.some(m=>m.programId==='vlasna-sprava'),q);
 for(const q of ["ветеран покупки", "veteran equipment"]) assert.equal(searchGrants(q).matches[0]?.programId,'uvf-reimbursement',q);
 for(const q of ["техстартап", "Prosper Global", "міська мобільність"]) assert(searchGrants(q).matches.length>0,q);
 for(const q of ["особисте авто", "personal car", "стипендія на магістратуру", "scholarship for university", "полетіти на марс"]) assert.equal(searchGrants(q).matches.length,0,q);
 assert(!searchGrants('обладнання для кавярні').matches.some(m=>m.programId==='uvf-reimbursement'));
 const candidates=searchGrants('кавярня').matches;const restricted=candidates.find(m=>m.programId==='bloom-sme');if(restricted)assert.match(restricted.reason,/соціальн/);
});
test("retrieval uses sourced applicant, cost, document and donor fields without treating exclusions as approval", () => {
 const base=GRANT_CATALOG.find(p=>p.id==='vlasna-sprava')!;const p={...base,id:'fixture-search',title:'Програма підтримки',provider:'Організатор Azurium',searchTerms:[],eligibleCosts:['Енергоефективні котли'],targetAudience:'Пасічники',details:{...base.details,costs:['Енергоефективні котли'],eligibility:['Пасічники'],documents:['Довідка про експорт'],exclusions:['Азартні заклади'],funding:[],obligations:[],steps:[],overview:'Фінансування розвитку'}};
 const at=new Date('2026-11-16T15:00:00Z');for(const q of ['azurium','пасічники','котли','експорт'])assert.equal(discover(q,[p],at).matches[0]?.programId,'fixture-search',q);
 assert.equal(discover('азартні заклади',[p],at).matches.length,0);
 const expired={...p,availability:{...p.availability!,validUntil:'2026-01-01T00:00:00Z'}};assert.equal(discover('котли',[expired],at).matches.length,0);
});
