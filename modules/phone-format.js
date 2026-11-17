const DEFAULT_COUNTRY_CODE = '92';

export function toInternationalDigits(raw, countryCode = DEFAULT_COUNTRY_CODE) {
  let d = String(raw == null ? '' : raw).replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  else if (d.length === 10 && d.startsWith('3')) d = countryCode + d;
  return d.length >= 8 && d.length <= 15 ? d : '';
}
