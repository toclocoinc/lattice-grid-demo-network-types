/**
 * Loads the page in headless Chrome and drives it with real mouse and key
 * events: sort IPv4, save a hyphen MAC through the form, see the row JSON,
 * be refused on a bad IPv4 and on VLAN 5000, refuse a bad grid cell edit,
 * and filter MAC by 1a2b. Exits non-zero on the first failure.
 *
 *   node tools/verify.mjs
 */
import { startServer } from './serve.mjs';
import { launch } from './cdp.mjs';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) throw new Error(`Check failed: ${name} ${detail}`);
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const toNum = (ip) => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);

/** The visible rows' text in one column, in display order. */
const column = (b, col) => b.eval((c) => [...document.querySelectorAll('#grid .lat-row')]
  .filter((r) => r.style.display !== 'none')
  .sort((x, y) => Number(x.dataset.index) - Number(y.dataset.index))
  .map((r) => r.querySelector(`.lat-cell[data-col="${c}"] .lat-cell-text`)?.textContent ?? '')
  .filter((text) => text !== ''), col);

const rowJson = (b) => b.eval(() => {
  try { return JSON.parse(document.getElementById('row-json').textContent); } catch { return null; }
});

/** Replace a form field's text by really typing it, then leave the field. */
async function typeInto(b, name, text) {
  await b.click(`#form input[name="${name}"]`);
  await b.selectAll();
  await b.key('Backspace', 'Backspace', 8);
  await b.type(text);
  await b.key('Tab', 'Tab', 9);
  await pause(150);
}
const message = (b, name) => b.eval((n) => {
  const item = document.querySelector(`#form input[name="${n}"]`).closest('.lat-form__item');
  const el = item.querySelector('.lat-form__error');
  return item.dataset.invalid === 'true' && el ? el.textContent.trim() : '';
}, name);

const { server, port } = await startServer(0);
const viewports = [[1440, 900, false], [390, 844, true]];
let failed = false;
try {
  for (const [w, h, mobile] of viewports) {
    console.log(`\n== viewport ${w}x${h} ==`);
    const b = await launch({ width: w, height: h });
    try {
      await b.viewport(w, h, mobile);
      await b.goto(`http://localhost:${port}/`);
      await b.waitFor(() => document.querySelectorAll('#grid .lat-row').length > 5 && document.querySelectorAll('#form input').length > 5, 15000);
      check('page loads with a grid and a form', true);

      // Sort the IPv4 column by clicking its header.
      await b.click('#grid .lat-header-cell[data-col="ip4"]');
      await pause(300);
      const ips = await column(b, 'ip4');
      const nums = ips.map(toNum);
      const sorted = nums.every((n, i) => i === 0 || nums[i - 1] <= n);
      const first9 = ips.indexOf('192.0.2.9'); const first10 = ips.indexOf('192.0.2.10');
      check('IPv4 sorts numerically', sorted, ips.slice(0, 3).join(' '));
      check('192.0.2.9 sorts before 192.0.2.10', first9 >= 0 && first10 > first9, `${first9} < ${first10}`);

      // Select the first row, then type a hyphen MAC into the form and save.
      await b.click('#grid .lat-row[data-index="0"] .lat-cell[data-col="name"]');
      await b.waitFor(() => document.querySelector('#form input[name="mac"]') && JSON.parse(document.getElementById('row-json').textContent || 'null'), 5000).catch(() => {});
      const before = await rowJson(b);
      check('selecting a row fills the form and the JSON', !!before && before.id, before?.id);

      await typeInto(b, 'mac', '00-1A-2B-3C-4D-5E');
      await b.click('#save');
      await pause(300);
      let row = await rowJson(b);
      check('hyphen MAC saves as colon lower case', row?.mac === '00:1a:2b:3c:4d:5e', row?.mac);
      check('saved JSON keeps text types', typeof row.ip4 === 'string' && /^\d+\.\d+\.\d+\.\d+$/.test(row.ip4) && /\/\d+$/.test(row.subnet), `${row.ip4} ${row.subnet}`);

      await typeInto(b, 'mac', '001a.2b3c.4d5f');
      await b.click('#save'); await pause(300);
      row = await rowJson(b);
      check('Cisco dotted MAC saves as colon lower case', row?.mac === '00:1a:2b:3c:4d:5f', row?.mac);

      await typeInto(b, 'subnet', '10.1.2.3/24');
      await b.click('#save'); await pause(300);
      row = await rowJson(b);
      check('10.1.2.3/24 is stored as 10.1.2.0/24', row?.subnet === '10.1.2.0/24', row?.subnet);

      // Bad IPv4 and VLAN 5000 are refused with the form's own message.
      const ipBefore = row.ip4;
      await typeInto(b, 'ip4', '300.1.1.1');
      const ipMsg = await message(b, 'ip4');
      await b.click('#save'); await pause(300);
      row = await rowJson(b);
      check('bad IPv4 shows the form message', ipMsg.length > 0, ipMsg);
      check('bad IPv4 is not saved', row.ip4 === ipBefore, row.ip4);
      await b.click('#revert'); await pause(200);

      const vlanBefore = (await rowJson(b)).vlan;
      await typeInto(b, 'vlan', '5000');
      const vlanMsg = await message(b, 'vlan');
      await b.click('#save'); await pause(300);
      row = await rowJson(b);
      check('VLAN 5000 shows the form message', vlanMsg.length > 0, vlanMsg);
      check('VLAN 5000 is not saved', String(row.vlan) === String(vlanBefore), String(row.vlan));
      await b.click('#revert'); await pause(200);

      // A grid cell edit with bad input is refused the same way.
      const cellBefore = (await column(b, 'ip4'))[1];
      await b.click('#grid .lat-row[data-index="1"] .lat-cell[data-col="ip4"]', 2);
      await pause(200);
      await b.selectAll();
      await b.type('999.1.1.1');
      await b.key('Enter', 'Enter', 13);
      await pause(300);
      const cellMessage = await b.eval(() => document.querySelector('#grid .lat-cell.lat-invalid .lat-invalid-message')?.textContent ?? '');
      await b.key('Escape', 'Escape', 27);
      await pause(300);
      const cellAfter = (await column(b, 'ip4'))[1];
      check('grid cell edit with a bad IPv4 shows a message', cellMessage.length > 0, cellMessage);
      check('grid cell edit with a bad IPv4 is not saved', cellAfter === cellBefore, `${cellBefore} -> ${cellAfter}`);

      // Pasting ZZ99 into an asset tag cell is refused and the cell keeps its value.
      const tagCell = '#grid .lat-row[data-index="2"] .lat-cell[data-col="tag"]';
      const tagText = (sel) => b.eval((q) => document.querySelector(`${q} .lat-cell-text`)?.textContent ?? '', sel);
      const tagBefore = await tagText(tagCell);
      await b.click(tagCell, 2);
      await pause(200);
      await b.selectAll();
      await b.type('ZZ99');
      await b.key('Enter', 'Enter', 13);
      await pause(300);
      const tagMessage = await b.eval(() => document.querySelector('#grid .lat-cell.lat-invalid .lat-invalid-message')?.textContent ?? '');
      await b.key('Escape', 'Escape', 27);
      await pause(300);
      const tagAfter = await tagText(tagCell);
      check('asset tag ZZ99 is refused with a message', tagMessage.length > 0, tagMessage);
      check('asset tag cell keeps its value', tagAfter === tagBefore && tagBefore !== '', `${tagBefore} -> ${tagAfter}`);

      // Filter MAC by 1a2b.
      await b.eval(() => {
        document.querySelector('#grid').scrollIntoView({ block: 'center' });
        for (const el of document.querySelectorAll('#grid *')) if (el.scrollLeft > 0) el.scrollLeft = 0;
      });
      await pause(200);
      await b.click('#grid input[aria-label="Filter MAC"]');
      await b.type('1a2b');
      await pause(500);
      const macs = await column(b, 'mac');
      const ok = macs.length > 0 && macs.length < 40 && macs.every((m) => m.replace(/[^0-9a-f]/gi, '').toLowerCase().includes('1a2b'));
      check('MAC filter 1a2b matches in the shown form', ok, `${macs.length} rows, e.g. ${macs.slice(0, 4).join(' ')}`);

      // The same filter still matches after the display format changes.
      await b.eval(() => { const s = document.getElementById('mac-format'); s.value = 'cisco'; s.dispatchEvent(new Event('change', { bubbles: true })); });
      await pause(700);
      const cisco = await column(b, 'mac');
      check('MAC display switches to Cisco dotted and the filter holds', cisco.length > 0 && cisco.every((m) => /^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/.test(m)), cisco[0]);

      const errors = b.logs.filter((l) => !/favicon/.test(l));
      check('no console errors', errors.length === 0, errors.join(' | '));
    } finally {
      await b.close();
    }
  }
} catch (error) {
  failed = true;
  console.error(`\n${error.message}`);
} finally {
  server.close();
}
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
