/**
 * The whole idea in one file: a grid, a form bound to the selected row, and
 * the line between them. Both read the same column types, so one parser
 * decides what is accepted, in a cell or in a field.
 */
import { createGrid } from '@toclocoinc/lattice-grid';
import { createForm } from '@toclocoinc/lattice-grid/modules/form';
import { DEMO_LICENCE } from './licence.js';

const ASSET_MASK = 'AA-9999'; // two letters, a dash, four digits

/** One column per network type. The type name does the parsing. */
function columns(macFormat) {
  return [
    { field: 'name', title: 'Device', width: 130 },
    { field: 'site', title: 'Site', width: 90 },
    { field: 'ip4', title: 'IPv4', type: 'ipv4', width: 120, edit: true },
    { field: 'ip6', title: 'IPv6', type: 'ipv6', width: 150, edit: true },
    // cidrNetwork keeps the network address: 10.1.2.3/24 is stored as 10.1.2.0/24.
    { field: 'subnet', title: 'Subnet', type: 'cidr', typeOptions: { cidrNetwork: true }, width: 150, edit: true },
    { field: 'mac', title: 'MAC', type: 'mac', typeOptions: { macFormat }, width: 150, edit: true },
    { field: 'vlan', title: 'Access VLAN', type: 'vlan', typeOptions: { vlanSingle: true }, width: 110, edit: true },
    { field: 'trunk', title: 'Trunk VLANs', type: 'vlan', width: 150, edit: true },
    { field: 'tag', title: 'Asset tag', width: 100, edit: { enabled: true, props: { mask: ASSET_MASK } } },
  ];
}

/** The form fields, named after the columns they edit. */
const FORM_ROWS = [
  { type: 'input', name: 'name', label: 'Device', readOnly: true },
  { type: 'ipv4', name: 'ip4', label: 'IPv4 address' },
  { type: 'ipv6', name: 'ip6', label: 'IPv6 address' },
  { type: 'cidr', name: 'subnet', label: 'Subnet (CIDR)', cidrNetwork: true },
  { type: 'mac', name: 'mac', label: 'MAC address' },
  { type: 'vlan', name: 'vlan', label: 'Access VLAN', vlanSingle: true },
  { type: 'vlan', name: 'trunk', label: 'Trunk VLANs' },
  { type: 'input', name: 'tag', label: 'Asset tag', mask: ASSET_MASK },
];

export function mountDemo({ gridEl, formEl, rows, onChange = () => {} }) {
  let macFormat = 'colon';
  let grid = null;
  let form = null;
  let selectedKey = null;

  const rowOf = (key) => rows.find((r) => r.id === key) || null;

  function showForm() {
    form?.destroy();
    form = null;
    formEl.textContent = '';
    if (!selectedKey) return;
    form = createForm(formEl, {
      bind: { grid, rowKey: selectedKey },
      rows: FORM_ROWS.map((item) => (item.type === 'mac' ? { ...item, macFormat } : item)),
      labelPosition: 'top',
    });
  }

  function build() {
    const state = grid?.state.get();
    grid?.destroy();
    grid = createGrid(gridEl, {
      columns: columns(macFormat),
      rows,
      rowKey: 'id',
      licence: DEMO_LICENCE,
      selection: 'single',
      filterRow: true,
      edit: true,
    });
    if (state) grid.state.apply(state);
    grid.on('selection:changed', ({ keys }) => {
      selectedKey = keys[0] || null;
      showForm();
      onChange(rowOf(selectedKey));
    });
    grid.on('cell:changed', () => onChange(rowOf(selectedKey)));
    if (selectedKey) grid.selection.set([selectedKey]);
  }

  build();

  return {
    /** Save the form into the grid row; false when a field was refused. */
    save() {
      if (!form || !form.validate()) return false;
      const saved = form.save();
      onChange(rowOf(selectedKey));
      return saved;
    },
    revert() { form?.revert(); },
    setMacFormat(next) { macFormat = next; build(); showForm(); },
    select(key) { grid.selection.set([key]); },
    get selected() { return rowOf(selectedKey); },
  };
}
