/**
 * setup-ecprdu-table.mjs
 * ─────────────────────────────────────────────────────────────
 * Verifica que la tabla [dbo].[ECPRDU] exista en SQL Server
 * con todas las columnas que necesita el sync SAP → SQL Server.
 *
 * Si la tabla NO existe la crea.
 * Si la tabla YA existe muestra sus columnas y avisa de las
 * columnas faltantes (sin alterar la tabla existente).
 *
 * Uso:
 *   node backend/scripts/setup-ecprdu-table.mjs
 *
 * El script lee las credenciales desde backend/.env
 * ─────────────────────────────────────────────────────────────
 */

import { createRequire } from "module";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Cargar .env manualmente ───────────────────────────────────
const envPath = resolve(__dirname, "../.env");
const envLines = readFileSync(envPath, "utf-8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex < 0) continue;
  const key = trimmed.slice(0, eqIndex).trim();
  const val = trimmed.slice(eqIndex + 1).trim();
  if (key && !(key in process.env)) process.env[key] = val;
}

const sql = require("mssql");

const host = process.env.SQLSERVER_HOST || "localhost";
const user = process.env.SQLSERVER_USER || "sa";
const password = process.env.SQLSERVER_PASSWORD || "";
const database = process.env.SQLSERVER_DATABASE || "E-COMERCE";
const portRaw = Number(process.env.SQLSERVER_PORT || 0);
const instance = process.env.SQLSERVER_INSTANCE || "";
const encrypt = String(process.env.SQLSERVER_ENCRYPT || "false").toLowerCase() === "true";

const config = {
  user,
  password,
  server: host,
  database,
  requestTimeout: 30000,
  connectionTimeout: 15000,
  ...(Number.isFinite(portRaw) && portRaw > 0 ? { port: portRaw } : {}),
  options: {
    encrypt,
    trustServerCertificate: true,
    ...(Number.isFinite(portRaw) && portRaw > 0 ? {} : (instance ? { instanceName: instance } : {})),
  },
};

// ── Columnas requeridas por el sync ───────────────────────────
// Cada entrada: { name, type, nullable, comment }
const REQUIRED_COLUMNS = [
  { name: "prdu_cod_id",   type: "INT IDENTITY(1,1)", nullable: false, pk: true,  comment: "PK autoincremental" },
  { name: "prdu_cod_bars", type: "NVARCHAR(100)",      nullable: true,  pk: false, comment: "Código de barras (clave upsert)" },
  { name: "prdu_cod_prdu", type: "NVARCHAR(100)",      nullable: true,  pk: false, comment: "Código de producto SAP" },
  { name: "prdu_nom_prdu", type: "NVARCHAR(500)",      nullable: true,  pk: false, comment: "Nombre del producto" },
  { name: "prdu_des_prdu", type: "NVARCHAR(500)",      nullable: true,  pk: false, comment: "Descripción larga" },
  { name: "prdu_rul_imag", type: "NVARCHAR(1000)",     nullable: true,  pk: false, comment: "URL de imagen" },
  { name: "prdu_num_ctnd", type: "NVARCHAR(100)",      nullable: true,  pk: false, comment: "Contenedor / referencia" },
  { name: "prdu_nom_empr", type: "NVARCHAR(200)",      nullable: true,  pk: false, comment: "Nombre empresa / almacén" },
  { name: "prdu_stock",    type: "DECIMAL(18,2)",      nullable: true,  pk: false, comment: "Stock disponible" },
  { name: "prdu_costo",    type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "Costo promedio SAP" },
  { name: "prdu_pre_untr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL1 — Precio unitario (costo×1.15)" },
  { name: "prdu_pre_myor", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL2 — Precio mayorista" },
  { name: "prdu_pre_trjc", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL3 — Precio tarjeta" },
  { name: "prdu_pre_blto", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL4 — Precio bulto" },
  { name: "prdu_pre_difr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL5 — Precio diferenciado" },
  { name: "prdu_pre_ofrt", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL6 — Precio oferta" },
  { name: "prdu_pre_espl", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL7 — Precio especial" },
  { name: "prdu_pre_euni", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL8 — Ecuasol unitario" },
  { name: "prdu_pre_emyr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL9 — Ecuasol mayor" },
  { name: "prdu_pre_eblt", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL10 — Ecuasol bulto" },
  { name: "prdu_pre_etrj", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL11 — Ecuasol tarjeta" },
  { name: "prdu_pre_edfr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL12 — Ecuasol diferenciado" },
  { name: "prdu_pre_eofr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL13 — Ecuasol oferta" },
  { name: "prdu_pre_luni", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL14 — Impolina unitario" },
  { name: "prdu_pre_lmyr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL15 — Impolina mayor" },
  { name: "prdu_pre_lblt", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL16 — Impolina bulto" },
  { name: "prdu_pre_ltrj", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL17 — Impolina tarjeta" },
  { name: "prdu_pre_ldfr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL18 — Impolina diferenciado" },
  { name: "prdu_pre_lofr", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL19 — Impolina oferta" },
  { name: "prdu_pre_chin", type: "DECIMAL(18,4)",      nullable: true,  pk: false, comment: "PL20 — Lista China" },
  { name: "prdu_tip_grup", type: "NVARCHAR(200)",      nullable: true,  pk: false, comment: "Grupo / categoría" },
  { name: "prdu_cod_estd", type: "INT",                nullable: true,  pk: false, comment: "Estado (1=activo)" },
  { name: "prdu_fec_rgis", type: "DATETIME2",          nullable: true,  pk: false, comment: "Fecha de registro SAP" },
  { name: "prdu_fec_sync", type: "DATETIME2",          nullable: true,  pk: false, comment: "Fecha última sincronización" },
];

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  SETUP — [dbo].[ECPRDU] en SQL Server");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  Servidor : ${host}`);
  console.log(`  Base     : ${database}`);
  console.log(`  Usuario  : ${user}`);
  console.log(`  Encrypt  : ${encrypt}`);
  console.log("───────────────────────────────────────────────────\n");

  let pool;
  try {
    pool = await sql.connect(config);
    console.log("✅  Conexión a SQL Server exitosa.\n");
  } catch (err) {
    console.error("❌  Error al conectar a SQL Server:");
    console.error(`    ${err.message}`);
    console.error("\n💡  Verifica host, usuario, contraseña y que el servidor sea accesible.");
    process.exit(1);
  }

  // ── ¿Existe la tabla? ────────────────────────────────────────
  const tableCheck = await pool.request().query(`
    SELECT COUNT(*) AS cnt
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ECPRDU'
  `);
  const tableExists = tableCheck.recordset[0].cnt > 0;

  if (!tableExists) {
    console.log("⚠️   La tabla [dbo].[ECPRDU] NO existe. Creando...\n");

    const pkCol = REQUIRED_COLUMNS.find(c => c.pk);
    const dataCols = REQUIRED_COLUMNS.filter(c => !c.pk);

    const colDefs = [
      `  [${pkCol.name}] ${pkCol.type} PRIMARY KEY`,
      ...dataCols.map(c => `  [${c.name}] ${c.type} ${c.nullable ? "NULL" : "NOT NULL"}`),
    ].join(",\n");

    const createSql = `
CREATE TABLE [dbo].[ECPRDU] (
${colDefs}
);

-- Índice único en código de barras (clave de upsert del sync)
CREATE UNIQUE INDEX [UX_ECPRDU_codbarras]
  ON [dbo].[ECPRDU] ([prdu_cod_bars])
  WHERE [prdu_cod_bars] IS NOT NULL;

-- Índice para búsquedas por código de producto
CREATE INDEX [IX_ECPRDU_codprdu] ON [dbo].[ECPRDU] ([prdu_cod_prdu]);

-- Índice para filtrar por grupo
CREATE INDEX [IX_ECPRDU_tipgrup] ON [dbo].[ECPRDU] ([prdu_tip_grup]);
`;

    try {
      // Ejecutar en partes (CREATE TABLE + cada índice)
      const parts = createSql.split(";").map(s => s.trim()).filter(Boolean);
      for (const part of parts) {
        await pool.request().query(part);
      }
      console.log("✅  Tabla [dbo].[ECPRDU] creada con éxito.\n");
    } catch (err) {
      console.error("❌  Error al crear la tabla:");
      console.error(`    ${err.message}`);
      process.exit(1);
    }
  } else {
    console.log("✅  La tabla [dbo].[ECPRDU] ya existe.\n");

    // Mostrar columnas actuales
    const colsResult = await pool.request().query(`
      SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'ECPRDU'
      ORDER BY ORDINAL_POSITION
    `);

    console.log(`  Columnas actuales (${colsResult.recordset.length} total):`);
    for (const col of colsResult.recordset) {
      const len = col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : "";
      console.log(`    ${col.COLUMN_NAME.padEnd(22)} ${col.DATA_TYPE}${len} ${col.IS_NULLABLE === "YES" ? "NULL" : "NOT NULL"}`);
    }
    console.log();

    // Detectar columnas faltantes
    const existingCols = new Set(colsResult.recordset.map(r => r.COLUMN_NAME.toLowerCase()));
    const missing = REQUIRED_COLUMNS.filter(c => !existingCols.has(c.name.toLowerCase()) && !c.pk);

    if (missing.length === 0) {
      console.log("✅  Todas las columnas requeridas están presentes.\n");
    } else {
      console.log("⚠️   Columnas faltantes (se pueden agregar con ALTER TABLE):");
      for (const col of missing) {
        const nullable = col.nullable ? "NULL" : "NOT NULL";
        console.log(`    ALTER TABLE [dbo].[ECPRDU] ADD [${col.name}] ${col.type} ${nullable};  -- ${col.comment}`);
      }
      console.log();
    }
  }

  // ── Resumen final ────────────────────────────────────────────
  const countResult = await pool.request().query(`SELECT COUNT(*) AS total FROM [dbo].[ECPRDU]`);
  console.log(`  Registros actuales en ECPRDU: ${countResult.recordset[0].total}`);
  console.log("\n═══════════════════════════════════════════════════");
  console.log("  Siguiente paso: reiniciar el backend y ejecutar");
  console.log("  POST http://localhost:7002/api/ecommerce/sap/sync");
  console.log("═══════════════════════════════════════════════════\n");

  await pool.close();
}

main().catch(err => {
  console.error("Error fatal:", err.message);
  process.exit(1);
});
