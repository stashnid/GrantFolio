import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";

// Isolated local fixture: never restarts the application's auth service or accesses cloud identity.
const run = randomUUID();
const name = `grantfolio-auth-probe-${run}`;
const volume = `grantfolio-auth-probe-data-${run}`;
const image = "grantfolio-auth";
let containerCreated = false, volumeCreated = false;
function docker(...args) { return execFileSync("docker", args, { encoding: "utf8", timeout: 45000, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
async function ready(url) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { const r = await fetch(url, { signal: AbortSignal.timeout(1000) }); if (r.ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error("Isolated auth emulator did not become ready");
}
try {
  docker("volume", "create", "--label", `grantfolio.qa-run=${run}`, volume); volumeCreated = true;
  docker("run", "-d", "--pull=never", "--name", name, "--label", `grantfolio.qa-run=${run}`, "--init", "--stop-signal=SIGINT", "--stop-timeout=30", "--mount", `type=volume,src=${volume},dst=/var/lib/grantfolio-auth`, "--publish", "127.0.0.1::9099", image); containerCreated = true;
  const inspect = JSON.parse(docker("inspect", name))[0];
  const port = inspect.NetworkSettings.Ports["9099/tcp"][0].HostPort;
  let origin = `http://127.0.0.1:${port}`;
  await ready(origin);
  const credentials = { email: `persistence-${run}@example.test`, password: "synthetic-persistence-test", returnSecureToken: true };
  const call = (method) => fetch(`${origin}/identitytoolkit.googleapis.com/v1/accounts:${method}?key=demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials), signal: AbortSignal.timeout(5000) });
  const created = await call("signUp"); assert.equal(created.status, 200);
  const uid = (await created.json()).localId;
  docker("stop", name);
  docker("start", name);
  const restarted = JSON.parse(docker("inspect", name))[0];
  origin = `http://127.0.0.1:${restarted.NetworkSettings.Ports["9099/tcp"][0].HostPort}`;
  await ready(origin);
  const login = await call("signInWithPassword"); assert.equal(login.status, 200);
  assert.equal((await login.json()).localId, uid, "Restart must preserve ownership identity");
  console.log(JSON.stringify({ isolatedAuthRestart: true, sameIdentity: true, passwordLogin: true }));
} finally {
  if (containerCreated) docker("rm", "-f", name);
  if (volumeCreated) docker("volume", "rm", volume);
}
