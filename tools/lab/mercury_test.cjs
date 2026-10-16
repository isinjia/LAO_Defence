// Run with node tools/lab/mercury_test.cjs. Exercise the actual combat functions.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('js/game.js', 'utf8');
const context = {
  window: {}, G: { cells: [], dmgBy: {}, opt: {}, supportPierceT: 0 },
  BAL: { vuln: 1 }, FX: { ring() {} }, d: { color: 0 },
  refreshCells() {}, SFX: { play() {} }, UI: {}, bossMult: () => 1,
  kill() { throw Error('Unexpected kill'); }, hpTricks() {},
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/data.js', 'utf8'), context);
vm.runInContext(source.slice(source.indexOf('  function damage('), source.indexOf('  const HELL_KEYS')), context);
const branch = source.slice(source.indexOf("      case 'blades':"), source.indexOf("      case 'iceage':"));
vm.runInContext(`function cast() { switch ('blades') { ${branch} } }`, context);
context.rally = (k, t) => { context.G.rallyK = k; context.G.rallyT = t; };
const src = { id: 'test', type: 'single' };
function hit(pierce, shield = false, active = true, armor = 0.5) {
  context.G.supportPierceT = active ? 5 : 0;
  const e = { alive: true, hp: 10000, armor, shieldT: shield ? 5 : 0, shieldK: 0.2, kind: 'normal' };
  context.damage(e, 100, 0, false, src, pierce);
  return +(10000 - e.hp).toFixed(4);
}
context.G.cells = [{ silT: 9, units: [{ def: { id: 'brownie' } }] }];
context.cast();
assert.equal(context.G.cells[0].silT, 0);
assert.equal(context.G.cells[0].units[0].hasteT, 5);
assert.equal(context.G.supportPierceK, 0.19);
assert.equal(context.G.rallyK, 1.19);
assert.equal(hit(), 59.5);
assert.equal(hit(undefined, true), 11.9); // shields remain effective
assert.equal(hit(undefined, false, false), 50); // expires
assert.equal(hit(true), 100); // full penetration cannot be doubled
assert.equal(hit('fixed'), 100); // fixed damage cannot be buffed
assert.equal(hit(0.75), 87.5); // preserve stronger existing penetration
assert.equal(hit(undefined, false, true, 1), 100); // no bonus against zero armour
context.G.cells[0].units.push({ def: { id: 'tiamat' } });
context.cast();
assert.equal(context.G.supportPierceK, 0.28500000000000003);
assert.equal(context.G.cells[0].units[0].hasteT, 7.5);
assert.equal(hit(), 64.25);
assert.equal(context.window.DATA.unit.mercury.range, 6.2);
console.log('Mercury: support synergy, range, armour, shields, expiry, fixed damage and stronger penetration passed.');
