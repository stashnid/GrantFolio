// Forecast, not billing data. USD list prices checked 2026-11-18.
export const assumptions = {
  hoursPerMonth: 730, days: 30, activeUsers: 100,
  callsPerActiveUser: 50, inputTokensPerCall: 4000, outputTokensPerCall: 800,
  monitorProfiles: 22, monitorRunsPerDay: 1, changedFraction: 1,
  monitorInputTokens: 12000, monitorOutputTokens: 1000,
  inputUsdPerMillion: 0.33, outputUsdPerMillion: 2.75,
  sqlUsdPerHour: 0.0105, ssdGiB: 10, ssdUsdGiBHour: 0.000232877,
  backupGiB: 10, backupUsdGiBHour: 0.000109589,
  loadBalancerUsdHour: 0.025,
  // Conservative gross charges without applying any free allowances.
  serviceSeconds: 28500, serviceRequests: 55440,
  hourlyJobExecutions: 1440, hourlyJobBilledSeconds: 60,
  smartJobExecutions: 30, smartJobSeconds: 300,
  egressGiB: 10, lbProcessedGiB: 20, artifactGiB: 5,
  schedulerJobs: 3, secretVersions: 6, buildMinutes: 40,
  usdUah: 45.3436,
  // Optional internal planning sensitivity, not a market wage or measured effort.
  supportHoursLow: 8, supportHoursHigh: 16, internalHourlyUsd: 10,
  commercialPriceScenariosUah: [100,300], pilotPriceUah:5,
};
export function calculate(a=assumptions) {
 const callCost=(a.inputTokensPerCall*a.inputUsdPerMillion+a.outputTokensPerCall*a.outputUsdPerMillion)/1e6;
 const calls=a.activeUsers*a.callsPerActiveUser;
 const rows={
  sql:a.hoursPerMonth*a.sqlUsdPerHour,
  ssd:a.hoursPerMonth*a.ssdGiB*a.ssdUsdGiBHour,
  backup:a.hoursPerMonth*a.backupGiB*a.backupUsdGiBHour,
  https:a.hoursPerMonth*a.loadBalancerUsdHour,
  chat:calls*callCost,
  monitor:a.monitorProfiles*a.days*a.monitorRunsPerDay*a.changedFraction*(a.monitorInputTokens*a.inputUsdPerMillion+a.monitorOutputTokens*a.outputUsdPerMillion)/1e6,
  web:a.serviceSeconds*(0.000024+0.5*0.0000025)+a.serviceRequests*0.4/1e6,
  hourlyJobs:a.hourlyJobExecutions*a.hourlyJobBilledSeconds*(0.000018+0.5*0.000002),
  smartJob:a.smartJobExecutions*a.smartJobSeconds*(0.000018+0.5*0.000002),
  traffic:a.egressGiB*0.12+a.lbProcessedGiB*0.008,
  registry:a.artifactGiB*0.10,
  scheduler:a.schedulerJobs*0.10,
  secrets:a.secretVersions*0.06,
  build:a.buildMinutes*0.006,
 };
 const technicalUsd=Object.values(rows).reduce((s,x)=>s+x,0);
 const budgetUsd=Math.ceil(technicalUsd/10)*10;
 return {rows,callCostUsd:callCost,aiPerProjectUah:callCost*a.callsPerActiveUser*a.usdUah,
 technicalUsd,budgetUsd,budgetUah:budgetUsd*a.usdUah,
 withSupportUsd:[budgetUsd+a.supportHoursLow*a.internalHourlyUsd,budgetUsd+a.supportHoursHigh*a.internalHourlyUsd],
 breakEvenAtFixed100Active:a.commercialPriceScenariosUah.map(price=>({priceUah:price,technicalPayments:Math.ceil(budgetUsd*a.usdUah/price),withSupportPayments:[Math.ceil((budgetUsd+a.supportHoursLow*a.internalHourlyUsd)*a.usdUah/price),Math.ceil((budgetUsd+a.supportHoursHigh*a.internalHourlyUsd)*a.usdUah/price)]}))};
}
if(process.argv[1]?.endsWith('cost-model.mjs'))console.log(JSON.stringify(calculate(),null,2));
