// test/meme.test.js: the pure parts of meme mode (public/meme.js exports CORE under Node)
const test = require('node:test'), assert = require('node:assert'), CORE = require('../public/meme.js');

test('words: capitals first, then the longest, no duplicates, capped, upper-cased', () => {
  assert.deepEqual(CORE.words('the tests pass and the build is GREEN, tests pass', 3), ['GREEN', 'TESTS', 'BUILD']);
  assert.deepEqual(CORE.words('ok', 3), []);
  assert.equal(CORE.words('').length, 0);
});
test('scale: 1 is rare and slow, 11 is certain and quick, junk means 11', () => {
  const lo = CORE.scale(1), hi = CORE.scale(11);
  assert.equal(lo.chance, 0.2); assert.equal(hi.chance, 1); assert.equal(lo.cooldown, 6000); assert.equal(hi.cooldown, 600);
  assert.equal(CORE.scale('junk').level, 11); assert.equal(CORE.scale(99).level, 11); assert.equal(CORE.scale(-3).level, 1);
});
test('FlashGuard: at most 3 flashes in any second', () => {
  let now = 0; const g = new CORE.FlashGuard(3, 1000, () => now);
  assert.deepEqual([g.ok(), g.ok(), g.ok(), g.ok()], [true, true, true, false]); now = 1500; assert.equal(g.ok(), true);
});
test('hash and pick are deterministic', () => { assert.equal(CORE.hash('a'), CORE.hash('a')); assert.equal(CORE.pick(['x', 'y', 'z'], 4), 'y'); });
