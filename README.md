# Network types in a grid and a form

IPv4, IPv6, CIDR, MAC and VLAN columns in a grid, and the same types in a form
bound to the selected row. The grid and the form share one parser, so a value is
accepted or refused the same way in a cell as in a field.

**Live demo:** https://toclocoinc.github.io/lattice-grid-demo-network-types/

Built with [Lattice Grid](https://www.latticegrid.dev/). The column types are described on [the column types page](https://www.latticegrid.dev/docs/units/).

The whole idea is `src/wiring.js`: the grid, the form and the binding between
them.

```js
// src/wiring.js (excerpt)
{ field: 'ip4',    type: 'ipv4', edit: true },
{ field: 'subnet', type: 'cidr', typeOptions: { cidrNetwork: true }, edit: true },
{ field: 'mac',    type: 'mac',  typeOptions: { macFormat: 'colon' }, edit: true },
{ field: 'vlan',   type: 'vlan', typeOptions: { vlanSingle: true }, edit: true },

form = createForm(formEl, { bind: { grid, rowKey }, rows: [
  { type: 'mac', name: 'mac', label: 'MAC address' },
  { type: 'input', name: 'tag', label: 'Asset tag', mask: 'AA-9999' },
  // ...
] });
```

Read the full file for the grid options, the selection hook and the save.

## What to try

- Sort **IPv4**: `192.0.2.9` comes before `192.0.2.10`.
- Filter **MAC** by `1a2b`; it matches whichever spelling is shown. The MAC
  display switch changes the shown form only (`macFormat`); the stored value is
  always lower-case colons.
- Type `00-1A-2B-3C-4D-5E` or `001a.2b3c.4d5e` into the form's MAC field and
  save: the row holds `00:1a:2b:3c:4d:5e`.
- Type `10.1.2.3/24` into the subnet: it is stored as `10.1.2.0/24`
  (`cidrNetwork`).
- A bad IPv4, or VLAN `5000`, shows the form's own message and is not saved. A
  grid cell edit with bad input is refused the same way.
- "What the row holds" shows the selected row as JSON, so you can see the text
  that is stored.

All addresses are from documentation ranges (RFC 5737, RFC 3849) and every MAC
is locally administered (`02:…`).

## Run it

```sh
npm install
npm start
```

`npm start` prints a local address to open. Running locally needs no licence
key. `npm run verify` drives the page in headless Chrome (Node 22 and Chrome
installed) and is what the Pages workflow runs before it publishes.

## Layout

- `index.html`, `main.js`, `styles.css`: the page.
- `src/wiring.js`: grid, form and binding.
- `src/data.js`: forty synthetic switch ports.
- `src/licence.js`: the key for the published demo's own domain.
- `tools/serve.mjs`, `tools/verify.mjs`, `tools/cdp.mjs`: the static server and
  the browser check.
