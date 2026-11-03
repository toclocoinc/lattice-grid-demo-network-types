/**
 * Forty synthetic switch ports. Every address comes from a documentation
 * range (RFC 5737 for IPv4, RFC 3849 for IPv6) and every MAC is locally
 * administered (it starts 02), so nothing here belongs to a real network.
 */

const SITES = [
  { site: 'London', v4: '192.0.2', v6: '2001:db8:1', cidr: '192.0.2.0/24' },
  { site: 'Leeds', v4: '198.51.100', v6: '2001:db8:2', cidr: '198.51.100.0/24' },
  { site: 'Cardiff', v4: '203.0.113', v6: '2001:db8:3', cidr: '203.0.113.0/24' },
];

const ROLES = ['core', 'dist', 'access', 'edge', 'wifi'];
const TRUNKS = ['10,20,100-110', '10,30', '20,40-45', '10,20,30,200-210', '99', '15,25,35', '100-120', '10,300-310,400'];
const ACCESS = [10, 20, 30, 40, 99, 100, 150, 200];

const hex = (n) => n.toString(16).padStart(2, '0');

export function buildRows(count = 40) {
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const place = SITES[i % SITES.length];
    // Hosts 1 to 14 so that .9 and .10 both appear and sort order is visible.
    const host = (i % 14) + 1;
    rows.push({
      id: `port-${i + 1}`,
      name: `${place.site.slice(0, 3).toLowerCase()}-${ROLES[i % ROLES.length]}-${String(i + 1).padStart(2, '0')}`,
      site: place.site,
      ip4: `${place.v4}.${host}`,
      ip6: `${place.v6}::${(i + 1).toString(16)}`,
      subnet: place.cidr,
      mac: `02:${hex(0x1a + i)}:2b:${hex(0x3c + i * 3)}:4d:${hex(0x5e - i)}`,
      vlan: ACCESS[i % ACCESS.length],
      trunk: TRUNKS[i % TRUNKS.length],
      tag: `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 7) % 26))}-${String(1000 + i * 37).slice(-4)}`,
    });
  }
  return rows;
}
