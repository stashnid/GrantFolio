import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("bundled KVED-2010 snapshot contains all 615 unique classes and official sources", () => {
  const rows: { value: string; label: string; section: string; source: string }[] = JSON.parse(readFileSync(new URL("../../frontend/src/data/kved-2010.json", import.meta.url), "utf8"));
  assert.equal(rows.length, 615);
  assert.equal(new Set(rows.map(row => row.value)).size, rows.length);
  assert.deepEqual([...new Set(rows.map(row => row.section))].sort(), [..."ABCDEFGHIJKLMNOPQRSTU"]);
  for (const row of rows) {
    assert.match(row.value, /^\d{2}\.\d{2}$/);
    assert.ok(row.label.trim().length > 0 && !row.label.includes("�"));
    assert.equal(row.source, `https://kved.ukrstat.gov.ua/KVED2010/${row.value.slice(0, 2)}/KVED10_${row.value.slice(0, 2)}_${row.value.slice(3)}.html`);
  }
  for (const code of ["01.11", "23.41", "47.91", "56.10", "62.01", "96.02", "99.00"]) assert.ok(rows.some(row => row.value === code));
});
