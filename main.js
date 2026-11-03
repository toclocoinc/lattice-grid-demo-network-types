import { buildRows } from './src/data.js';
import { mountDemo } from './src/wiring.js';

const $ = (id) => document.getElementById(id);
const rows = buildRows(40);

function showRow(row) {
  $('row-json').textContent = row ? JSON.stringify(row, null, 2) : 'Select a row in the grid.';
}

const demo = mountDemo({
  gridEl: $('grid'),
  formEl: $('form'),
  rows,
  onChange: showRow,
});

function say(text, bad = false) {
  const el = $('status');
  el.textContent = text;
  el.dataset.bad = bad ? 'true' : 'false';
}

$('save').addEventListener('click', () => {
  if (!demo.selected) return say('Select a row first.', true);
  const saved = demo.save();
  say(saved ? 'Saved to the grid row.' : 'Not saved: fix the marked field.', !saved);
});
$('revert').addEventListener('click', () => { demo.revert(); say(''); });
$('mac-format').addEventListener('change', (e) => demo.setMacFormat(e.target.value));

$('theme').addEventListener('change', (e) => {
  document.documentElement.dataset.theme = e.target.value;
});


document.documentElement.dataset.theme = 'auto';
demo.select(rows[0].id);
