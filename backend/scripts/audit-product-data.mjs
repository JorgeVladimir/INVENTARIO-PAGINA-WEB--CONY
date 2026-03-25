const key = (v) => String(v ?? '').trim().toUpperCase();

const main = async () => {
  try {
    const h = await fetch('http://localhost:7002/api/health');
    console.log('health', h.status, await h.text());
  } catch (e) {
    console.log('health_err', e.message);
    process.exit(1);
  }

  const limit = 1000;
  let offset = 0;
  let total = 0;
  const all = [];

  while (true) {
    const url = 'http://localhost:7002/api/ecommerce/productos?limit=' + limit + '&offset=' + offset;
    const r = await fetch(url);
    if (!r.ok) {
      console.log('page_err', offset, r.status);
      break;
    }

    const j = await r.json();
    const items = Array.isArray(j.items) ? j.items : [];

    if (offset === 0) {
      total = Number(j.total || 0);
      console.log('total_reported', total);
    }

    all.push(...items);
    offset += items.length;

    if (items.length === 0 || items.length < limit) break;
    if (offset % 10000 === 0) console.log('loaded', offset);
  }

  console.log('loaded_final', all.length);

  const dupByCode = new Map();
  for (const p of all) {
    const k = key(p.codigoproduc || p.codigo || p.codbarras);
    if (!k) continue;
    dupByCode.set(k, (dupByCode.get(k) || 0) + 1);
  }

  const repeated = [...dupByCode.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1]);

  const price0 = all.filter((p) => Number(p.precio_unidad ?? p.precio ?? 0) === 0);
  const nullPrice = all.filter((p) => p.precio_unidad === null || p.precio_unidad === undefined || p.precio_unidad === '');

  console.log('duplicates_by_code_count', repeated.length);
  console.log('rows_with_price0', price0.length);
  console.log('rows_with_null_price_field', nullPrice.length);
  console.log('top_duplicate_codes', JSON.stringify(repeated.slice(0, 20)));

  const sampleDup = [];
  for (const [code, count] of repeated.slice(0, 8)) {
    const rows = all
      .filter((p) => key(p.codigoproduc || p.codigo || p.codbarras) === code)
      .slice(0, 4)
      .map((p) => ({
        id: p.id,
        codigo: p.codigoproduc || p.codigo || p.codbarras,
        nombre: p.nombre,
        precio: p.precio_unidad,
        grupo: p.grupo,
      }));
    sampleDup.push({ code, count, rows });
  }
  console.log('sample_duplicate_rows', JSON.stringify(sampleDup, null, 2));

  const sampleZero = price0.slice(0, 20).map((p) => ({
    id: p.id,
    codigo: p.codigoproduc || p.codigo || p.codbarras,
    nombre: p.nombre,
    grupo: p.grupo,
    precio: p.precio_unidad,
  }));
  console.log('sample_price0_rows', JSON.stringify(sampleZero, null, 2));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
