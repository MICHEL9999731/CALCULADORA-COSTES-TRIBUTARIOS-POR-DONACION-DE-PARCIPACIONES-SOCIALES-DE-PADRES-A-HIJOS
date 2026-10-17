// Validación y decodificación local del CIF/NIF de personas jurídicas españolas.
// No requiere red: aporta datos fiables (forma jurídica, provincia de registro)
// antes de que empiece la investigación en internet.

export interface CifInfo {
  cif: string;
  valido: boolean;
  formaJuridica: string | null;
  provinciaInscripcion: string | null;
  motivo?: string;
}

const LETRAS_ENTIDAD: Record<string, string> = {
  A: 'Sociedad anónima (S.A.)',
  B: 'Sociedad de responsabilidad limitada (S.L.)',
  C: 'Sociedad colectiva',
  D: 'Sociedad comanditaria',
  E: 'Comunidad de bienes / herencia yacente',
  F: 'Sociedad cooperativa',
  G: 'Asociación o fundación',
  H: 'Comunidad de propietarios',
  J: 'Sociedad civil',
  N: 'Entidad extranjera',
  P: 'Corporación local',
  Q: 'Organismo público',
  R: 'Congregación o institución religiosa',
  S: 'Órgano de la Administración del Estado o CC.AA.',
  U: 'Unión temporal de empresas (UTE)',
  V: 'Otros tipos (AIE, fondos, etc.)',
  W: 'Establecimiento permanente de entidad no residente',
};

// Prefijos numéricos asignados a cada provincia (Orden EHA/451/2008).
const PROVINCIAS: Array<[string, string[]]> = [
  ['Álava', ['01']],
  ['Albacete', ['02']],
  ['Alicante', ['03', '53', '54']],
  ['Almería', ['04']],
  ['Ávila', ['05']],
  ['Badajoz', ['06']],
  ['Illes Balears', ['07', '57']],
  ['Barcelona', ['08', '58', '59', '60', '61', '62', '63', '64', '65', '66', '68']],
  ['Burgos', ['09']],
  ['Cáceres', ['10']],
  ['Cádiz', ['11', '72']],
  ['Castellón', ['12']],
  ['Ciudad Real', ['13']],
  ['Córdoba', ['14', '56']],
  ['A Coruña', ['15', '70']],
  ['Cuenca', ['16']],
  ['Girona', ['17', '55', '67']],
  ['Granada', ['18']],
  ['Guadalajara', ['19']],
  ['Gipuzkoa', ['20', '71']],
  ['Huelva', ['21']],
  ['Huesca', ['22']],
  ['Jaén', ['23']],
  ['León', ['24']],
  ['Lleida', ['25']],
  ['La Rioja', ['26']],
  ['Lugo', ['27']],
  ['Madrid', ['28', '78', '79', '80', '81', '82', '83', '84', '85', '86', '87', '88']],
  ['Málaga', ['29', '92', '93']],
  ['Murcia', ['30', '73']],
  ['Navarra', ['31']],
  ['Ourense', ['32']],
  ['Asturias', ['33', '74']],
  ['Palencia', ['34']],
  ['Las Palmas', ['35', '76']],
  ['Pontevedra', ['36', '94']],
  ['Salamanca', ['37']],
  ['Santa Cruz de Tenerife', ['38', '75']],
  ['Cantabria', ['39']],
  ['Segovia', ['40']],
  ['Sevilla', ['41', '90', '91']],
  ['Soria', ['42']],
  ['Tarragona', ['43', '77']],
  ['Teruel', ['44']],
  ['Toledo', ['45']],
  ['Valencia', ['46', '96', '97', '98']],
  ['Valladolid', ['47']],
  ['Bizkaia', ['48', '95']],
  ['Zamora', ['49']],
  ['Zaragoza', ['50', '99']],
  ['Ceuta', ['51']],
  ['Melilla', ['52']],
];

// Índice inverso prefijo → provincia.
const PREFIJO_A_PROVINCIA = new Map<string, string>();
for (const [provincia, prefijos] of PROVINCIAS) {
  for (const p of prefijos) {
    if (!PREFIJO_A_PROVINCIA.has(p)) PREFIJO_A_PROVINCIA.set(p, provincia);
  }
}

// Letras cuyo dígito de control debe ser una letra o un número.
const CONTROL_LETRA = new Set(['N', 'P', 'Q', 'R', 'S', 'W']);
const CONTROL_NUMERO = new Set(['A', 'B', 'E', 'H']);
const LETRAS_CONTROL = 'JABCDEFGHI';

export function normalizarCif(entrada: string): string {
  return entrada.toUpperCase().replace(/[\s.\-]/g, '').replace(/^ES/, '');
}

/** Devuelve true si el texto tiene forma de CIF (letra + 7 dígitos + control). */
export function pareceCif(entrada: string): boolean {
  return /^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(normalizarCif(entrada));
}

export function analizarCif(entrada: string): CifInfo {
  const cif = normalizarCif(entrada);
  if (!/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(cif)) {
    return { cif, valido: false, formaJuridica: null, provinciaInscripcion: null, motivo: 'Formato no válido' };
  }

  const letra = cif[0];
  const digitos = cif.slice(1, 8);
  const control = cif[8];

  let suma = 0;
  for (let i = 0; i < digitos.length; i++) {
    const n = Number(digitos[i]);
    if (i % 2 === 0) {
      const doble = n * 2;
      suma += Math.floor(doble / 10) + (doble % 10);
    } else {
      suma += n;
    }
  }
  const digitoControl = (10 - (suma % 10)) % 10;
  const letraControl = LETRAS_CONTROL[digitoControl];

  let valido: boolean;
  if (CONTROL_LETRA.has(letra)) valido = control === letraControl;
  else if (CONTROL_NUMERO.has(letra)) valido = control === String(digitoControl);
  else valido = control === letraControl || control === String(digitoControl);

  const prefijo = digitos.slice(0, 2);
  return {
    cif,
    valido,
    formaJuridica: LETRAS_ENTIDAD[letra] ?? null,
    provinciaInscripcion: PREFIJO_A_PROVINCIA.get(prefijo) ?? null,
    motivo: valido ? undefined : 'El dígito de control no coincide',
  };
}
