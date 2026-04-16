const GROUP_NAME_OVERRIDES: Record<string, string> = {
  '100': 'ACTIVOS FIJOS',
  '101': 'LLANTA-RIN13',
  '102': 'LLANTA-RIN14',
  '103': 'LLANTA-RIN15',
  '104': 'LLANTA-RIN16',
  '105': 'LLANTA-RIN17',
  '106': 'LLANTA-RIN17,5',
  '107': 'LLANTA-RIN18',
  '108': 'LLANTA-RIN19',
  '109': 'LLANTA-RIN20',
  '110': 'LLANTA-RIN22,5',
  '111': 'ACCESORIOS',
  '112': 'AROS-RIN15',
  '113': 'AROS-RIN16',
  '114': 'AROS-RIN17',
  '115': 'AROS-RIN18',
  '116': 'ROPA- CHOMPA',
  '117': 'ROPA- ABRIGO',
  '118': 'ROPA- SACO',
  '119': 'ROPA- PANTALON',
  '120': 'ROPA- VESTIDO',
  '121': 'ROPA- CAMISA',
  '122': 'ROPA- CHALECO',
  '123': 'BAZAR',
  '124': 'DEPORTIVO - PESAS',
  '125': 'DEPORTIVO - CAMINADORAS',
  '126': 'DEPORTIVO - SPINNING',
  '127': 'DEPORTIVO - BICICLETAS',
  '128': 'DEPORTIVO - BARRAS',
  '129': 'DEPORTIVO - BANCOS',
  '130': 'DEPORTIVO - EQUIPOS DE GYM',
  '131': 'DEPORTIVO - ELIPTICAS',
  '132': 'DEPORTIVO - TABLA INVERSION',
  '133': 'DEPORTIVO - FUTBOL',
  '134': 'HOSPITALARIO-SILLA DE RUEDAS',
  '135': 'HOSPITALARIO-MULETAS',
  '136': 'HOSPITALARIO-BARANDA',
  '137': 'HOSPITALARIO - BIOMBOS',
  '138': 'HOSPITALARIO - CAMA',
  '139': 'HOSPITALARIO - INSTRUMENTOS',
  '140': 'HOSPITALARIO - LAMPARAS',
  '141': 'HOSPITALARIO - PORTA SUEROS',
  '142': 'OFICINA - SILLAS',
  '143': 'SERVICIOS',
  '144': 'ROPA INTERIOR',
  '145': 'COCINA',
  '146': 'DEPORTIVO - CAMA ELASTICA',
  '147': 'DEPORTIVO - SACO DE BOX',
  '148': 'BANO',
  '149': 'CALZADO',
  '150': 'CARTERAS',
  '151': 'FIESTA',
  '152': 'JUGUETES',
  '153': 'ROPA-CAMISETAS',
  '154': 'MOCHILA',
  '155': 'ROPA-BIVIDIS',
  '156': 'NAVIDAD',
  '157': 'FLORES',
  '158': 'VEHICULOS',
  '159': 'ROPA-BLUSA',
  '160': 'GOLOSINAS',
  '161': 'MASCOTAS',
  '162': 'COBIJAS',
  '163': 'ROPA-SALIDA DE BANO',
  '166': 'ROPA-PIJAMA',
  '176': 'ROPA-CONJUNTOS',
  '177': 'SUPER MERCADOS',
  '178': 'MAQUILLAJE',
  '179': 'COMIDA ASIATICA',
  '180': 'BISUTERIA',
  '181': 'HOGAR',
};

const toText = (value: any) => (value === null || value === undefined ? '' : String(value).trim());

const normalizeGroupKey = (value: any) =>
  toText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

export const resolveBackendGroupName = (value: any) => {
  const text = toText(value);
  if (!text) return '';
  if (/^\d+(\.0+)?$/.test(text)) {
    return GROUP_NAME_OVERRIDES[String(Number(text))] || String(Number(text));
  }
  return text;
};

export const getBackendGroupFilterValues = (selectedGroup: any) => {
  const text = toText(selectedGroup);
  if (!text) return [] as string[];

  const values = new Set<string>([text]);
  const normalizedInput = normalizeGroupKey(text);

  for (const [code, name] of Object.entries(GROUP_NAME_OVERRIDES)) {
    if (normalizeGroupKey(code) === normalizedInput || normalizeGroupKey(name) === normalizedInput) {
      values.add(code);
      values.add(name);
    }
  }

  return Array.from(values).filter(Boolean);
};
