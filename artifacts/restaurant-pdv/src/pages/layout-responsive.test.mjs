import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const layoutSource = readFileSync(
  new URL("../components/layout.tsx", import.meta.url),
  "utf8",
);

test("layout mantém navItems com RBAC e adiciona navegação mobile", () => {
  assert.match(layoutSource, /const navItems = \[/);
  assert.match(layoutSource, /navItems\.filter\(\(item\) => canAccessPath\(actor\.role, item\.href\)\)/);
  assert.match(layoutSource, /mobileMenuOpen/);
  assert.match(layoutSource, /aria-label=\{mobileMenuOpen \? "Fechar menu" : "Abrir menu"\}/);
  assert.match(layoutSource, /lg:hidden/);
  assert.match(layoutSource, /onClick=\{\(\) => setMobileMenuOpen\(false\)\}/);
});

test("navegações secundárias continuam exportadas e responsivas", () => {
  assert.match(layoutSource, /export function SettingsNavigation/);
  assert.match(layoutSource, /export function FiscalNavigation/);
  assert.match(layoutSource, /overflow-x-auto/);
  assert.match(layoutSource, /sm:flex-wrap/);
});

test("layout evita h-screen global no mobile e usa padding progressivo", () => {
  assert.doesNotMatch(layoutSource, /flex h-screen w-full overflow-hidden/);
  assert.match(layoutSource, /min-h-screen w-full/);
  assert.match(layoutSource, /px-4 py-5 sm:px-6 lg:p-10/);
  assert.match(layoutSource, /lg:h-screen/);
});
