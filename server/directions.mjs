// Universal HTTPS links keep navigation usable with or without an installed app.
const clean = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
const url = (base, parameters) => {
  const result = new URL(base);
  for (const [key, value] of Object.entries(parameters)) result.searchParams.set(key, value);
  return result.href;
};

export function getDirections(content) {
  const p = content.practice || {};
  const addressLine = [clean(p.address), [clean(p.postalCode), clean(p.city)].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const country = clean(p.country) === 'FR' ? 'France' : clean(p.country);
  const destination = [addressLine, country].filter(Boolean).join(', ');
  const googleUrl = url('https://www.google.com/maps/dir/', { api: '1', destination });
  const mapUrl = url('https://www.google.com/maps/search/', { api: '1', query: destination });
  return {
    addressLine, destination, googleUrl, mapUrl,
    providers: [
      { id: 'google', name: 'Google Maps', url: googleUrl, hint: 'Voiture, transports ou à pied', mark: 'G' },
      { id: 'waze', name: 'Waze', url: url('https://waze.com/ul', { q: destination, navigate: 'yes' }), hint: 'Pour venir en voiture', mark: 'W' },
      { id: 'apple', name: 'Apple Plans', url: url('https://maps.apple.com/', { daddr: destination }), hint: 'Votre itinéraire avec Plans', mark: 'P' }
    ]
  };
}

const escapeCard = value => clean(value).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,');
const foldLine = line => {
  const lines = []; let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 75) { lines.push(current); current = ' '; }
    current += char;
  }
  return [...lines, current].join('\r\n');
};

export function contactCard(content) {
  const p = content.practice;
  return [
    'BEGIN:VCARD', 'VERSION:3.0',
    `N:${escapeCard(p.displayName || p.name)};;;;`,
    `FN:${escapeCard(p.displayName || p.name)}`,
    `ORG:${escapeCard(p.displayName || p.name)}`,
    `ADR;TYPE=WORK:;;${escapeCard(p.address)};${escapeCard(p.city)};;${escapeCard(p.postalCode)};${escapeCard(p.country === 'FR' ? 'France' : p.country)}`,
    `TEL;TYPE=WORK,VOICE:${clean(p.phone).replace(/[^+\d]/g, '').replace(/^0/, '+33')}`,
    `EMAIL;TYPE=WORK:${escapeCard(p.email)}`,
    `URL:${getDirections(content).mapUrl}`,
    'END:VCARD'
  ].map(foldLine).join('\r\n') + '\r\n';
}
