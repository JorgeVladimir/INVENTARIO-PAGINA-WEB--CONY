import "dotenv/config";
import express from "express";
import Database from "better-sqlite3";
import multer from "multer";
import * as XLSX from "xlsx";
import sql from "mssql";
import { createHash, randomBytes } from "crypto";

const sanitizeSqlIdentifier = (value: string, fallback: string) => {
  const clean = String(value || "").trim();
  if (!clean) return fallback;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(clean) ? clean : fallback;
};

const ECOMMERCE_PRODUCTS_SCHEMA = sanitizeSqlIdentifier(process.env.ECOMMERCE_PRODUCTS_SCHEMA || "dbo", "dbo");
const ECOMMERCE_PRODUCTS_TABLE = sanitizeSqlIdentifier(process.env.ECOMMERCE_PRODUCTS_TABLE || "ECPRDU", "ECPRDU");
const ECOMMERCE_PRODUCTS_OBJECT = `${ECOMMERCE_PRODUCTS_SCHEMA}.${ECOMMERCE_PRODUCTS_TABLE}`;
const ECOMMERCE_PRODUCTS_SQL = `[${ECOMMERCE_PRODUCTS_SCHEMA}].[${ECOMMERCE_PRODUCTS_TABLE}]`;
const SAP_B1_SQL_FILTER = String(process.env.SAP_B1_SQL_FILTER || "").trim();
const SAP_B1_SQL_TEXT = String(process.env.SAP_B1_SQL_TEXT || "").trim();

const db = new Database("sinostock.db");
const sqlServerPort = Number(process.env.SQLSERVER_PORT || 0);
const sqlServerInstance = process.env.SQLSERVER_INSTANCE || "SQLEXPRESS";
const sqlServerConfig: sql.config = {
  user: process.env.SQLSERVER_USER || "jvtt",
  password: process.env.SQLSERVER_PASSWORD || "jvtt1995",
  server: process.env.SQLSERVER_HOST || "localhost",
  ...(Number.isFinite(sqlServerPort) && sqlServerPort > 0 ? { port: sqlServerPort } : {}),
  database: process.env.SQLSERVER_DATABASE || "E-COMERCE",
  requestTimeout: Number(process.env.SQLSERVER_REQUEST_TIMEOUT_MS || "120000"),
  connectionTimeout: Number(process.env.SQLSERVER_CONNECTION_TIMEOUT_MS || "30000"),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    ...(Number.isFinite(sqlServerPort) && sqlServerPort > 0 ? {} : { instanceName: sqlServerInstance }),
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const ensureSqlServerSchema = async (pool: sql.ConnectionPool) => {
  if (ECOMMERCE_PRODUCTS_TABLE.toLowerCase() !== "productos") {
    return;
  }

  await pool.request().query(`
    IF OBJECT_ID(N'${ECOMMERCE_PRODUCTS_OBJECT}', N'U') IS NULL
    BEGIN
      CREATE TABLE ${ECOMMERCE_PRODUCTS_SQL} (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        Imagen NVARCHAR(500) NULL,
        Codigo NVARCHAR(120) NOT NULL,
        CajaCantidad INT NULL,
        Cajas INT NULL,
        Unidad NVARCHAR(200) NULL,
        TotalCantidad INT NULL,
        Costo DECIMAL(18,2) NOT NULL CONSTRAINT DF_Productos_Costo DEFAULT(0),
        Bulto NVARCHAR(120) NULL,
        Mayorista DECIMAL(18,2) NOT NULL CONSTRAINT DF_Productos_Mayorista DEFAULT(0),
        PrecioUnidad DECIMAL(18,2) NOT NULL CONSTRAINT DF_Productos_PrecioUnidad DEFAULT(0),
        Activo BIT NOT NULL CONSTRAINT DF_Productos_Activo DEFAULT(1),
        FechaRegistro DATETIME2 NOT NULL CONSTRAINT DF_Productos_FechaRegistro DEFAULT(SYSDATETIME())
      );
    END;

    DECLARE @IndexColumn sysname = NULL;

    SELECT TOP 1 @IndexColumn = c.name
    FROM sys.columns c
    WHERE c.object_id = OBJECT_ID(N'${ECOMMERCE_PRODUCTS_OBJECT}')
      AND LOWER(c.name) IN ('codbarras', 'codigo', 'codigoproducto', 'sku');

    IF @IndexColumn IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_Productos_ImportKey'
          AND object_id = OBJECT_ID(N'${ECOMMERCE_PRODUCTS_OBJECT}')
      )
    BEGIN
      DECLARE @sql NVARCHAR(MAX) =
        N'CREATE UNIQUE INDEX UX_Productos_ImportKey ON ${ECOMMERCE_PRODUCTS_SQL}(' + QUOTENAME(@IndexColumn) + N') WHERE ' + QUOTENAME(@IndexColumn) + N' IS NOT NULL';
      EXEC sp_executesql @sql;
    END;
  `);
};

type ProductosColumnMap = {
  id: string;
  imagen: string;
  codigo: string;
  cajaCantidad: string;
  cajas: string;
  unidad: string;
  totalCantidad: string;
  costo: string;
  bulto: string;
  mayorista: string;
  precioUnidad: string;
  activo: string;
  fechaRegistro: string;
};

type ProductosColumnLengths = {
  imagen: number | null;
  codigo: number | null;
  unidad: number | null;
  bulto: number | null;
};

const pickColumn = (columns: Set<string>, options: string[]) => {
  for (const option of options) {
    if (columns.has(option.toLowerCase())) return option;
  }
  return null;
};

const getProductosColumnMap = async (pool: sql.ConnectionPool): Promise<ProductosColumnMap> => {
  const result = await pool.request().query(`
    SELECT COLUMN_NAME
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${ECOMMERCE_PRODUCTS_SCHEMA}' AND TABLE_NAME = '${ECOMMERCE_PRODUCTS_TABLE}'
  `);

  const columns = new Set<string>(result.recordset.map((row: any) => String(row.COLUMN_NAME).toLowerCase()));

  const map: ProductosColumnMap = {
    id: pickColumn(columns, ["Id", "id"]) || "Id",
    imagen: pickColumn(columns, ["Imagen", "imagen"]) || "Imagen",
    codigo: pickColumn(columns, ["Codigo", "codigo"]) || "Codigo",
    cajaCantidad: pickColumn(columns, ["CajaCantidad", "caja_cantidad"]) || "CajaCantidad",
    cajas: pickColumn(columns, ["Cajas", "cajas"]) || "Cajas",
    unidad: pickColumn(columns, ["Unidad", "unidad"]) || "Unidad",
    totalCantidad: pickColumn(columns, ["TotalCantidad", "total_cantidad"]) || "TotalCantidad",
    costo: pickColumn(columns, ["Costo", "costo"]) || "Costo",
    bulto: pickColumn(columns, ["Bulto", "bulto"]) || "Bulto",
    mayorista: pickColumn(columns, ["Mayorista", "mayorista"]) || "Mayorista",
    precioUnidad: pickColumn(columns, ["PrecioUnidad", "precio_unidad"]) || "PrecioUnidad",
    activo: pickColumn(columns, ["Activo", "activo"]) || "Activo",
    fechaRegistro: pickColumn(columns, ["FechaRegistro", "fecha_registro", "fecha_creacion"]) || "FechaRegistro",
  };

  return map;
};

const getProductosColumnLengths = async (pool: sql.ConnectionPool, map: ProductosColumnMap): Promise<ProductosColumnLengths> => {
  const result = await pool.request().query(`
    SELECT COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = '${ECOMMERCE_PRODUCTS_SCHEMA}' AND TABLE_NAME = '${ECOMMERCE_PRODUCTS_TABLE}'
  `);

  const lengths = new Map<string, number | null>();
  for (const row of result.recordset as Array<{ COLUMN_NAME: string; CHARACTER_MAXIMUM_LENGTH: number | null }>) {
    lengths.set(String(row.COLUMN_NAME).toLowerCase(), row.CHARACTER_MAXIMUM_LENGTH);
  }

  return {
    imagen: lengths.get(map.imagen.toLowerCase()) ?? null,
    codigo: lengths.get(map.codigo.toLowerCase()) ?? null,
    unidad: lengths.get(map.unidad.toLowerCase()) ?? null,
    bulto: lengths.get(map.bulto.toLowerCase()) ?? null,
  };
};

const toNumber = (value: any, fallback = 0): number => {
  if (value === null || value === undefined || value === "") return fallback;
  const normalized = String(value).replace(",", ".").trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toText = (value: any): string => (value === null || value === undefined ? "" : String(value).trim());

const readValueFromRow = (row: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const found = Object.keys(row).find((current) => current.toLowerCase() === key.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null) return row[found];
  }
  return null;
};

const normalizeHeader = (value: any): string =>
  toText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s_/]+/g, "")
    .toLowerCase();

const buildGenericImageUrl = (seedValue: any) => {
  const seed = toText(seedValue) || `producto-${Date.now()}`;
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/800`;
};

type ProductosSchemaColumn = {
  name: string;
  normalizedName: string;
  dataType: string;
  maxLength: number | null;
  isNullable: boolean;
  isIdentity: boolean;
  hasDefault: boolean;
};

const getProductosSchemaColumns = async (pool: sql.ConnectionPool): Promise<ProductosSchemaColumn[]> => {
  const result = await pool.request().query(`
    SELECT
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.CHARACTER_MAXIMUM_LENGTH,
      c.IS_NULLABLE,
      c.COLUMN_DEFAULT,
      COLUMNPROPERTY(OBJECT_ID('${ECOMMERCE_PRODUCTS_OBJECT}'), c.COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_SCHEMA = '${ECOMMERCE_PRODUCTS_SCHEMA}' AND c.TABLE_NAME = '${ECOMMERCE_PRODUCTS_TABLE}'
    ORDER BY c.ORDINAL_POSITION
  `);

  return (result.recordset as Array<any>).map((row) => ({
    name: String(row.COLUMN_NAME),
    normalizedName: normalizeHeader(row.COLUMN_NAME),
    dataType: String(row.DATA_TYPE || "").toLowerCase(),
    maxLength: row.CHARACTER_MAXIMUM_LENGTH === undefined ? null : row.CHARACTER_MAXIMUM_LENGTH,
    isNullable: String(row.IS_NULLABLE || "").toUpperCase() === "YES",
    isIdentity: Number(row.IS_IDENTITY || 0) === 1,
    hasDefault: row.COLUMN_DEFAULT !== null && row.COLUMN_DEFAULT !== undefined,
  }));
};

const HEADER_TO_DB_COLUMN_ALIASES: Record<string, string[]> = {
  codigodebarra: ["codbarras", "codigobarras", "codbarra", "codigo_barras", "codigo"],
  foto: ["imagen", "foto", "image", "urlimagen", "imageurl"],
  codigodeproducto: ["codigo", "codigoproducto", "codigoproduc", "codproducto", "sku"],
  nombre: ["nombre", "nombrecorto", "nombre_corto"],
  descripcion: ["descripcion", "detalle", "descripcionlarga", "descripcion_larga"],
  contenedor: ["contenedor", "bulto", "preciobulto", "precio_bulto"],
  cantidadstock: ["cantidadstock", "stock", "totalcantidad", "total_cantidad"],
  costo: ["costo", "cost"],
  bulto: ["bulto", "preciobulto", "precio_bulto"],
  preciobulto: ["preciobulto", "precio_bulto", "bulto"],
  mayor: ["mayor", "mayorista", "preciomayor", "precio_mayor", "preciomayorista", "precio_mayorista"],
  unidad: ["unidad", "preciounidad", "precio_unidad", "precio"],
  empresa: ["empresa", "marca"],
  grupo: ["grupo", "categoria", "categorianombre"],
};

const getRequiredFallbackValue = (column: ProductosSchemaColumn): any => {
  if (column.dataType === "bit") return 0;
  if (["datetime", "datetime2", "date", "smalldatetime", "datetimeoffset"].includes(column.dataType)) return new Date();
  if (["int", "bigint", "smallint", "tinyint", "decimal", "numeric", "money", "smallmoney", "float", "real"].includes(column.dataType)) return 0;
  if (["nvarchar", "varchar", "nchar", "char", "text", "ntext"].includes(column.dataType)) return "SIN-DATO";
  return null;
};

const fallbackProductosTemplateColumns: ProductosSchemaColumn[] = [
  { name: "Id", normalizedName: "id", dataType: "int", maxLength: null, isNullable: false, isIdentity: true, hasDefault: false },
  { name: "Imagen", normalizedName: "imagen", dataType: "nvarchar", maxLength: 500, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "Codigo", normalizedName: "codigo", dataType: "nvarchar", maxLength: 120, isNullable: false, isIdentity: false, hasDefault: false },
  { name: "CajaCantidad", normalizedName: "cajacantidad", dataType: "int", maxLength: null, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "Cajas", normalizedName: "cajas", dataType: "int", maxLength: null, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "Unidad", normalizedName: "unidad", dataType: "nvarchar", maxLength: 200, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "TotalCantidad", normalizedName: "totalcantidad", dataType: "int", maxLength: null, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "Costo", normalizedName: "costo", dataType: "decimal", maxLength: null, isNullable: false, isIdentity: false, hasDefault: true },
  { name: "Bulto", normalizedName: "bulto", dataType: "nvarchar", maxLength: 120, isNullable: true, isIdentity: false, hasDefault: false },
  { name: "Mayorista", normalizedName: "mayorista", dataType: "decimal", maxLength: null, isNullable: false, isIdentity: false, hasDefault: true },
  { name: "PrecioUnidad", normalizedName: "preciounidad", dataType: "decimal", maxLength: null, isNullable: false, isIdentity: false, hasDefault: true },
  { name: "Activo", normalizedName: "activo", dataType: "bit", maxLength: null, isNullable: false, isIdentity: false, hasDefault: true },
  { name: "FechaRegistro", normalizedName: "fecharegistro", dataType: "datetime2", maxLength: null, isNullable: false, isIdentity: false, hasDefault: true },
];

const PRODUCTOS_INSERT_TEMPLATE_COLUMNS = [
  { name: "codbarras", dataType: "varchar(50)", required: true, hasDefault: false, isIdentity: false, sample: "7701234567890" },
  { name: "imagen", dataType: "varchar(50)", required: false, hasDefault: false, isIdentity: false, sample: "img-prod-001.jpg" },
  { name: "codigoproduc", dataType: "varchar(50)", required: true, hasDefault: false, isIdentity: false, sample: "PROD-001" },
  { name: "contenedor", dataType: "varchar(50)", required: false, hasDefault: false, isIdentity: false, sample: "CONT-CHN-2026-001" },
  { name: "nombre", dataType: "varchar(100)", required: true, hasDefault: false, isIdentity: false, sample: "Producto de ejemplo" },
  { name: "descripcion", dataType: "varchar(50)", required: false, hasDefault: false, isIdentity: false, sample: "Descripcion corta" },
  { name: "stock", dataType: "int", required: true, hasDefault: false, isIdentity: false, sample: 100 },
  { name: "costo", dataType: "decimal(18,2)", required: true, hasDefault: false, isIdentity: false, sample: 10.5 },
  { name: "precio_bulto", dataType: "decimal(18,2)", required: true, hasDefault: false, isIdentity: false, sample: 12.5 },
  { name: "precio_mayorista", dataType: "decimal(18,2)", required: true, hasDefault: false, isIdentity: false, sample: 13.5 },
  { name: "precio_unidad", dataType: "decimal(18,2)", required: true, hasDefault: false, isIdentity: false, sample: 14.5 },
  { name: "empresa", dataType: "varchar(50)", required: false, hasDefault: false, isIdentity: false, sample: "CONY" },
  { name: "grupo", dataType: "varchar(50)", required: false, hasDefault: false, isIdentity: false, sample: "GENERAL" },
  { name: "activo", dataType: "bit", required: true, hasDefault: false, isIdentity: false, sample: 1 },
  { name: "fecha_registro", dataType: "datetime2(7)", required: true, hasDefault: false, isIdentity: false, sample: new Date().toISOString() },
] as const;

const getTemplateValueByType = (column: ProductosSchemaColumn, rowIndex: number): any => {
  const normalizedName = column.normalizedName;

  if (normalizedName === "codigo") return `PROD-${String(rowIndex + 1).padStart(3, "0")}`;
  if (normalizedName === "imagen") return "https://picsum.photos/seed/producto-ecommerce/800/800";
  if (normalizedName === "unidad") return "Producto de ejemplo";
  if (normalizedName === "bulto") return "BULTO-A";
  if (normalizedName === "activo") return 1;

  if (["datetime", "datetime2", "date", "smalldatetime", "datetimeoffset"].includes(column.dataType)) {
    return new Date().toISOString();
  }

  if (["int", "bigint", "smallint", "tinyint"].includes(column.dataType)) {
    return normalizedName === "totalcantidad" ? 100 : 0;
  }

  if (["decimal", "numeric", "money", "smallmoney", "float", "real"].includes(column.dataType)) {
    return normalizedName === "costo" ? 10.5 : 12.5;
  }

  if (["nvarchar", "varchar", "nchar", "char", "text", "ntext"].includes(column.dataType)) {
    return "";
  }

  return null;
};

const buildProductosTemplatePayload = (columns: ProductosSchemaColumn[]) => {
  const sampleRow: Record<string, any> = {};

  for (const column of columns) {
    // Se mantiene el mismo orden y mismos campos de la tabla para un INSERT directo.
    // En columnas identity/default se entrega valor de ejemplo o vacío para que el usuario ajuste según su estrategia.
    if (column.isIdentity) {
      sampleRow[column.name] = "";
      continue;
    }
    sampleRow[column.name] = getTemplateValueByType(column, 0);
  }

  return {
    table: ECOMMERCE_PRODUCTS_OBJECT,
    sheetName: "Plantilla_Productos",
    columns: columns.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      required: !column.isNullable && !column.hasDefault,
      isIdentity: column.isIdentity,
      hasDefault: column.hasDefault,
    })),
    sampleRows: [sampleRow],
  };
};

const buildProductosInsertTemplatePayload = () => {
  const sampleRow: Record<string, any> = {};

  for (const column of PRODUCTOS_INSERT_TEMPLATE_COLUMNS) {
    sampleRow[column.name] = column.sample;
  }

  return {
    table: ECOMMERCE_PRODUCTS_OBJECT,
    sheetName: "Plantilla_Productos",
    columns: PRODUCTOS_INSERT_TEMPLATE_COLUMNS.map((column) => ({
      name: column.name,
      dataType: column.dataType,
      required: column.required,
      isIdentity: column.isIdentity,
      hasDefault: column.hasDefault,
    })),
    sampleRows: [sampleRow],
  };
};

type UploadHeaderColumn = {
  index: number;
  raw: string;
  normalized: string;
};

type UploadSheetParsed = {
  rows: any[][];
  headerIndex: number;
  headerColumns: UploadHeaderColumn[];
};

const parseUploadSheet = (buffer: Buffer): UploadSheetParsed => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true });

  const headerIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const normalized = row.map(normalizeHeader).filter(Boolean);
    return (
      normalized.includes("codigodebarra") ||
      normalized.includes("codigodeproducto") ||
      (normalized.includes("foto") && normalized.includes("costo"))
    );
  });

  if (headerIndex < 0) {
    throw new Error("No se encontró una fila de cabeceras válida en el archivo.");
  }

  const headerRow = rows[headerIndex] as any[];
  const usedHeaders = new Set<string>();
  const headerColumns: UploadHeaderColumn[] = [];

  headerRow.forEach((cell, index) => {
    const normalized = normalizeHeader(cell);
    if (!normalized || usedHeaders.has(normalized)) return;
    usedHeaders.add(normalized);
    headerColumns.push({
      index,
      raw: toText(cell),
      normalized,
    });
  });

  return { rows, headerIndex, headerColumns };
};

const parseUploadRowsByHeaders = (buffer: Buffer): Array<Record<string, any>> => {
  const { rows, headerIndex, headerColumns } = parseUploadSheet(buffer);

  const data: Array<Record<string, any>> = [];

  for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    if (!Array.isArray(row)) continue;

    const record: Record<string, any> = {};
    for (const header of headerColumns) {
      record[header.normalized] = row[header.index];
    }

    const hasAnyValue = Object.values(record).some((value) => toText(value).length > 0);
    if (!hasAnyValue) continue;

    data.push(record);
  }

  return data;
};

const fitByLength = (value: any, maxLength: number | null): string | null => {
  const text = toText(value);
  if (!text) return null;
  if (maxLength === null || maxLength === -1) return text;
  if (maxLength <= 0) return text;
  return text.slice(0, maxLength);
};

const toSqlColumnValue = (value: any, column: ProductosSchemaColumn): any => {
  if (value === undefined) return undefined;
  if (value === null || toText(value) === "") return null;

  if (["nvarchar", "varchar", "nchar", "char", "text", "ntext"].includes(column.dataType)) {
    return fitByLength(value, column.maxLength);
  }

  if (["int", "bigint", "smallint", "tinyint"].includes(column.dataType)) {
    return Math.trunc(toNumber(value, 0));
  }

  if (["decimal", "numeric", "money", "smallmoney", "float", "real"].includes(column.dataType)) {
    return toNumber(value, 0);
  }

  if (column.dataType === "bit") {
    const normalized = toText(value).toLowerCase();
    if (["1", "true", "si", "sí", "yes", "y"].includes(normalized)) return 1;
    if (["0", "false", "no", "n"].includes(normalized)) return 0;
    return toNumber(value, 0) > 0 ? 1 : 0;
  }

  if (["datetime", "datetime2", "date", "smalldatetime", "datetimeoffset"].includes(column.dataType)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return value;
};

const resolveTargetColumn = (
  headerNormalized: string,
  columnsByNormalized: Map<string, ProductosSchemaColumn>
): ProductosSchemaColumn | null => {
  const direct = columnsByNormalized.get(headerNormalized);
  if (direct) return direct;

  const aliases = HEADER_TO_DB_COLUMN_ALIASES[headerNormalized] || [];
  for (const alias of aliases) {
    const match = columnsByNormalized.get(alias);
    if (match) return match;
  }

  return null;
};

const parseContainerExcel = (buffer: Buffer) => {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: null, raw: true });

  const headerByNameIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const headers = row.map(normalizeHeader);
    return headers.includes("codigo") && headers.includes("nombre") && (headers.includes("precio") || headers.includes("preciounidad"));
  });

  if (headerByNameIndex >= 0) {
    const headerRow = rows[headerByNameIndex] as any[];
    const headerMap = new Map<string, number>();
    headerRow.forEach((cell, index) => {
      const key = normalizeHeader(cell);
      if (key && !headerMap.has(key)) headerMap.set(key, index);
    });

    const idx = {
      codigo: headerMap.get("codigo") ?? 0,
      nombre: headerMap.get("nombre") ?? 2,
      unidad: headerMap.get("unidad") ?? 6,
      cantidad: headerMap.get("cantidad") ?? 14,
      costo: headerMap.get("costoloc") ?? headerMap.get("costo") ?? 15,
      bulto: headerMap.get("contenedor") ?? 18,
      precio: headerMap.get("precio") ?? headerMap.get("preciounidad") ?? 7,
      mayorista: headerMap.get("precio2") ?? headerMap.get("precio3") ?? headerMap.get("precio") ?? 7,
      imagen: headerMap.get("original") ?? 1,
      cajas: headerMap.get("cajas"),
      cajaCantidad: headerMap.get("cajacantidad"),
    };

    const parsedItems: Array<{
      codigo: string;
      nombre: string;
      imagen: string;
      caja_cantidad: number;
      cajas: number;
      unidad: string;
      total_cantidad: number;
      costo: number;
      bulto: string;
      mayorista: number;
      precio_unidad: number;
    }> = [];

    for (let rowIndex = headerByNameIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (!Array.isArray(row)) continue;

      const codigo = toText(row[idx.codigo]);
      const nombre = toText(row[idx.nombre]);
      if (!codigo && !nombre) continue;

      parsedItems.push({
        codigo: codigo || `AUTO-${rowIndex + 1}`,
        nombre: nombre || codigo || `Producto ${rowIndex + 1}`,
        imagen: toText(row[idx.imagen]),
        caja_cantidad: idx.cajaCantidad === undefined ? 0 : toNumber(row[idx.cajaCantidad], 0),
        cajas: idx.cajas === undefined ? 0 : toNumber(row[idx.cajas], 0),
        unidad: toText(row[idx.unidad]),
        total_cantidad: toNumber(row[idx.cantidad], 0),
        costo: toNumber(row[idx.costo], 0),
        bulto: toText(row[idx.bulto]),
        mayorista: toNumber(row[idx.mayorista], 0),
        precio_unidad: toNumber(row[idx.precio], 0),
      });
    }

    return parsedItems;
  }

  const ecommerceCsvHeaderIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const headers = row.map(normalizeHeader);
    return headers.includes("codigodeproducto") && headers.includes("costo") && headers.includes("bulto");
  });

  if (ecommerceCsvHeaderIndex >= 0) {
    const headerRow = rows[ecommerceCsvHeaderIndex] as any[];
    const headerMap = new Map<string, number>();
    headerRow.forEach((cell, index) => {
      const key = normalizeHeader(cell);
      if (key && !headerMap.has(key)) headerMap.set(key, index);
    });

    const idxCodigo = headerMap.get("codigodeproducto") ?? 2;
    const idxContenedor = headerMap.get("contenedor") ?? 3;
    const idxCantidadStock = headerMap.get("cantidadstock");
    const idxCantidad = headerMap.get("cantidad");
    const idxCosto = headerMap.get("costo");
    const idxBulto = headerMap.get("bulto");
    const idxMayor = headerMap.get("mayor");
    const idxUnidadPrecio = headerMap.get("unidad");
    const idxEmpresa = headerMap.get("empresa");
    const idxGrupo = headerMap.get("grupo");
    const idxFoto = headerMap.get("foto") ?? 1;

    const parsedItems: Array<{
      codigo: string;
      nombre: string;
      imagen: string;
      caja_cantidad: number;
      cajas: number;
      unidad: string;
      total_cantidad: number;
      costo: number;
      bulto: string;
      mayorista: number;
      precio_unidad: number;
    }> = [];

    for (let rowIndex = ecommerceCsvHeaderIndex + 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (!Array.isArray(row)) continue;

      const codigo = toText(row[idxCodigo]);
      if (!codigo) continue;

      const descParts = [toText(row[4]), toText(row[5]), toText(row[6]), toText(row[7]), toText(row[8])]
        .filter((part) => part.length > 0);
      const empresa = idxEmpresa === undefined ? "" : toText(row[idxEmpresa]);
      const grupo = idxGrupo === undefined ? "" : toText(row[idxGrupo]);
      const nombre =
        descParts.join(" ").trim() ||
        [empresa, grupo].filter((part) => part.length > 0).join(" - ") ||
        codigo;

      const unidadTexto = toText(row[12]) || "PCS";
      const cantidadStock = idxCantidadStock === undefined ? NaN : toNumber(row[idxCantidadStock], NaN);
      const cantidad = idxCantidad === undefined ? NaN : toNumber(row[idxCantidad], NaN);
      const totalCantidad = Number.isFinite(cantidadStock)
        ? cantidadStock
        : (Number.isFinite(cantidad) ? cantidad : toNumber(row[13], 0));

      const costo = idxCosto === undefined ? toNumber(row[14], 0) : toNumber(row[idxCosto], 0);
      const bulto = idxBulto === undefined ? toText(row[idxContenedor]) : toText(row[idxBulto]);
      const mayorista = idxMayor === undefined ? toNumber(row[headerRow.length - 3], 0) : toNumber(row[idxMayor], 0);
      const precioUnidad = idxUnidadPrecio === undefined ? toNumber(row[headerRow.length - 2], 0) : toNumber(row[idxUnidadPrecio], 0);

      parsedItems.push({
        codigo,
        nombre,
        imagen: toText(row[idxFoto]),
        caja_cantidad: toNumber(row[10], 0),
        cajas: toNumber(row[11], 0),
        unidad: unidadTexto,
        total_cantidad: totalCantidad,
        costo,
        bulto,
        mayorista,
        precio_unidad: precioUnidad,
      });
    }

    return parsedItems;
  }

  const findHeaderIndex = rows.findIndex((row) =>
    Array.isArray(row) && row.some((cell) => {
      const text = toText(cell).toUpperCase();
      return text.includes("COSTO") || text.includes("BULTO") || text.includes("MAYOR") || text.includes("UNIDAD");
    })
  );

  const startIndex = findHeaderIndex >= 0 ? findHeaderIndex + 1 : 0;
  const parsedItems: Array<{
    codigo: string;
    nombre: string;
    imagen: string;
    caja_cantidad: number;
    cajas: number;
    unidad: string;
    total_cantidad: number;
    costo: number;
    bulto: string;
    mayorista: number;
    precio_unidad: number;
  }> = [];

  for (let index = startIndex; index < rows.length; index++) {
    const row = rows[index];
    if (!Array.isArray(row)) continue;

    const codigo = toText(row[3]);
    const nombre = toText(row[4] ?? row[9]);
    const imagen = toText(row[1]);
    const cajaCantidad = toNumber(row[5], 0);
    const cajas = toNumber(row[6], 0);
    const unidad = toText(row[7]);
    const totalCantidad = toNumber(row[8], 0);
    const costo = toNumber(row[9], 0);
    const bulto = toText(row[10]);
    const mayorista = toNumber(row[11], 0);
    const precioUnidad = toNumber(row[12], 0);

    if (!codigo && !nombre) continue;

    parsedItems.push({
      codigo: codigo || `AUTO-${index + 1}`,
      nombre: nombre || codigo || `Producto ${index + 1}`,
      imagen,
      caja_cantidad: cajaCantidad,
      cajas,
      unidad,
      total_cantidad: totalCantidad,
      costo,
      bulto,
      mayorista,
      precio_unidad: precioUnidad,
    });
  }

  return parsedItems;
};

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT, -- 'admin', 'tienda', 'bodega'
    full_name TEXT
  );

  CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE,
    arrival_date TEXT,
    status TEXT -- 'en_camino', 'recibido'
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    internal_code TEXT UNIQUE,
    name TEXT,
    category_id INTEGER,
    price REAL,
    cost REAL,
    stock INTEGER,
    container_id INTEGER,
    warehouse_id INTEGER,
    image_url TEXT,
    FOREIGN KEY(category_id) REFERENCES categories(id),
    FOREIGN KEY(container_id) REFERENCES containers(id),
    FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number TEXT UNIQUE,
    user_id INTEGER,
    order_date TEXT,
    total REAL,
    status TEXT, -- 'pendiente', 'pagado', 'despachado'
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    product_id INTEGER,
    quantity INTEGER,
    unit_price REAL,
    subtotal REAL,
    FOREIGN KEY(order_id) REFERENCES orders(id),
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    table_name TEXT,
    timestamp TEXT,
    details TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS payment_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    order_number TEXT,
    idempotency_key TEXT UNIQUE,
    payment_method TEXT,
    provider TEXT,
    provider_transaction_id TEXT,
    amount REAL,
    status TEXT,
    request_payload TEXT,
    response_payload TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER UNIQUE,
    order_number TEXT,
    provider TEXT,
    service_id TEXT,
    service_name TEXT,
    tracking_code TEXT,
    status TEXT,
    destination_ubigeo TEXT,
    destination_address TEXT,
    receiver_name TEXT,
    receiver_phone TEXT,
    quote_total REAL,
    provider_payload TEXT,
    created_at TEXT,
    updated_at TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );

  CREATE TABLE IF NOT EXISTS shipment_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id INTEGER,
    status TEXT,
    description TEXT,
    source TEXT,
    payload TEXT,
    event_time TEXT,
    FOREIGN KEY(shipment_id) REFERENCES shipments(id)
  );

  CREATE TABLE IF NOT EXISTS ws_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER,
    order_number TEXT,
    service TEXT,
    endpoint TEXT,
    request_payload TEXT,
    response_payload TEXT,
    status_code INTEGER,
    success INTEGER,
    created_at TEXT,
    FOREIGN KEY(order_id) REFERENCES orders(id)
  );
`);

// SQLite migrations for existing local files.
try {
  db.exec("ALTER TABLE payment_transactions ADD COLUMN order_number TEXT");
} catch {}
try {
  db.exec("ALTER TABLE shipments ADD COLUMN order_number TEXT");
} catch {}
try {
  db.exec("ALTER TABLE ws_logs ADD COLUMN order_number TEXT");
} catch {}
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS UX_shipments_order_number ON shipments(order_number) WHERE order_number IS NOT NULL");
} catch {}

// Ensure roles exist
const roleCount = db.prepare("SELECT COUNT(*) as count FROM roles").get() as { count: number };
if (roleCount.count === 0) {
  db.prepare("INSERT INTO roles (name) VALUES (?)").run("ADMIN");
  db.prepare("INSERT INTO roles (name) VALUES (?)").run("TIENDA");
  db.prepare("INSERT INTO roles (name) VALUES (?)").run("BODEGA");
}

// Helper for audit
const logAudit = (userId: number | null, action: string, tableName: string, details: string) => {
  db.prepare("INSERT INTO audit (user_id, action, table_name, timestamp, details) VALUES (?, ?, ?, ?, ?)")
    .run(userId, action, tableName, new Date().toISOString(), details);
};

const ensureOrderDetailsTable = () => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS order_details (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER,
      product_id INTEGER,
      quantity INTEGER,
      unit_price REAL,
      subtotal REAL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    );
  `);
};

const ensureSqlServerOperationalSchema = async (pool: sql.ConnectionPool) => {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.payment_transactions', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.payment_transactions (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NOT NULL,
        order_number NVARCHAR(80) NULL,
        idempotency_key NVARCHAR(120) NOT NULL,
        payment_method NVARCHAR(30) NULL,
        provider NVARCHAR(60) NULL,
        provider_transaction_id NVARCHAR(120) NULL,
        amount DECIMAL(18,2) NOT NULL CONSTRAINT DF_payment_transactions_amount DEFAULT(0),
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_payment_transactions_status DEFAULT('processing'),
        request_payload NVARCHAR(MAX) NULL,
        response_payload NVARCHAR(MAX) NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_payment_transactions_created_at DEFAULT(SYSDATETIME()),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_payment_transactions_updated_at DEFAULT(SYSDATETIME())
      );
    END;

    IF COL_LENGTH('dbo.payment_transactions', 'order_number') IS NULL
      ALTER TABLE dbo.payment_transactions ADD order_number NVARCHAR(80) NULL;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_payment_transactions_idempotency_key'
        AND object_id = OBJECT_ID(N'dbo.payment_transactions')
    )
      CREATE UNIQUE INDEX UX_payment_transactions_idempotency_key ON dbo.payment_transactions(idempotency_key);

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_payment_transactions_order_number'
        AND object_id = OBJECT_ID(N'dbo.payment_transactions')
    )
      CREATE INDEX IX_payment_transactions_order_number ON dbo.payment_transactions(order_number);

    IF OBJECT_ID(N'dbo.shipments', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.shipments (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NULL,
        order_number NVARCHAR(80) NULL,
        provider NVARCHAR(60) NULL,
        service_id NVARCHAR(30) NULL,
        service_name NVARCHAR(120) NULL,
        tracking_code NVARCHAR(120) NULL,
        status NVARCHAR(30) NOT NULL CONSTRAINT DF_shipments_status DEFAULT('sin_guia'),
        destination_ubigeo NVARCHAR(20) NULL,
        destination_address NVARCHAR(250) NULL,
        receiver_name NVARCHAR(120) NULL,
        receiver_phone NVARCHAR(30) NULL,
        quote_total DECIMAL(18,2) NOT NULL CONSTRAINT DF_shipments_quote_total DEFAULT(0),
        provider_payload NVARCHAR(MAX) NULL,
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_shipments_created_at DEFAULT(SYSDATETIME()),
        updated_at DATETIME2(7) NOT NULL CONSTRAINT DF_shipments_updated_at DEFAULT(SYSDATETIME())
      );
    END;

    IF COL_LENGTH('dbo.shipments', 'order_number') IS NULL
      ALTER TABLE dbo.shipments ADD order_number NVARCHAR(80) NULL;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_shipments_order_id'
        AND object_id = OBJECT_ID(N'dbo.shipments')
    )
      CREATE UNIQUE INDEX UX_shipments_order_id ON dbo.shipments(order_id) WHERE order_id IS NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_shipments_order_number'
        AND object_id = OBJECT_ID(N'dbo.shipments')
    )
      CREATE UNIQUE INDEX UX_shipments_order_number ON dbo.shipments(order_number) WHERE order_number IS NOT NULL;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'UX_shipments_tracking_code'
        AND object_id = OBJECT_ID(N'dbo.shipments')
    )
      CREATE UNIQUE INDEX UX_shipments_tracking_code ON dbo.shipments(tracking_code) WHERE tracking_code IS NOT NULL;

    IF OBJECT_ID(N'dbo.shipment_events', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.shipment_events (
        id INT IDENTITY(1,1) PRIMARY KEY,
        shipment_id INT NOT NULL,
        status NVARCHAR(30) NOT NULL,
        description NVARCHAR(250) NULL,
        source NVARCHAR(30) NULL,
        payload NVARCHAR(MAX) NULL,
        event_time DATETIME2(7) NOT NULL CONSTRAINT DF_shipment_events_event_time DEFAULT(SYSDATETIME())
      );
    END;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_shipment_events_shipment_id'
        AND object_id = OBJECT_ID(N'dbo.shipment_events')
    )
      CREATE INDEX IX_shipment_events_shipment_id ON dbo.shipment_events(shipment_id);

    IF OBJECT_ID(N'dbo.ws_logs', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.ws_logs (
        id INT IDENTITY(1,1) PRIMARY KEY,
        order_id INT NULL,
        order_number NVARCHAR(80) NULL,
        service NVARCHAR(60) NOT NULL,
        endpoint NVARCHAR(150) NOT NULL,
        request_payload NVARCHAR(MAX) NULL,
        response_payload NVARCHAR(MAX) NULL,
        status_code INT NULL,
        success BIT NOT NULL CONSTRAINT DF_ws_logs_success DEFAULT(0),
        created_at DATETIME2(7) NOT NULL CONSTRAINT DF_ws_logs_created_at DEFAULT(SYSDATETIME())
      );
    END;

    IF COL_LENGTH('dbo.ws_logs', 'order_number') IS NULL
      ALTER TABLE dbo.ws_logs ADD order_number NVARCHAR(80) NULL;

    IF NOT EXISTS (
      SELECT 1 FROM sys.indexes
      WHERE name = 'IX_ws_logs_order_number'
        AND object_id = OBJECT_ID(N'dbo.ws_logs')
    )
      CREATE INDEX IX_ws_logs_order_number ON dbo.ws_logs(order_number);
  `);

  await pool.request().query(`
    CREATE OR ALTER VIEW dbo.vw_order_logistics_tracking
    AS
    SELECT
      s.order_id,
      s.order_number,
      s.tracking_code,
      s.status AS shipment_status,
      s.provider,
      s.service_name,
      s.destination_ubigeo,
      s.receiver_name,
      s.receiver_phone,
      s.created_at AS shipment_created_at,
      pt.status AS payment_status,
      pt.amount AS payment_amount,
      pt.payment_method,
      pt.provider_transaction_id,
      se.status AS last_event_status,
      se.description AS last_event_description,
      se.event_time AS last_event_time
    FROM dbo.shipments s
    OUTER APPLY (
      SELECT TOP 1 *
      FROM dbo.payment_transactions p
      WHERE (p.order_number IS NOT NULL AND p.order_number = s.order_number)
         OR (p.order_number IS NULL AND p.order_id = s.order_id)
      ORDER BY p.id DESC
    ) pt
    OUTER APPLY (
      SELECT TOP 1 *
      FROM dbo.shipment_events e
      WHERE e.shipment_id = s.id
      ORDER BY e.id DESC
    ) se;
  `);
};

// Seed initial data if empty
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get() as { count: number };
if (userCount.count === 0) {
  db.prepare("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)").run("admin", "admin123", "admin", "Administrador Principal");
  db.prepare("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)").run("tienda", "tienda123", "tienda", "Encargado Tienda");
  db.prepare("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)").run("bodega", "bodega123", "bodega", "Jefe de Bodega");

  db.prepare("INSERT INTO categories (name) VALUES (?)").run("Electrónica");
  db.prepare("INSERT INTO categories (name) VALUES (?)").run("Hogar");
  db.prepare("INSERT INTO categories (name) VALUES (?)").run("Juguetes");
  db.prepare("INSERT INTO categories (name) VALUES (?)").run("Moda");
  db.prepare("INSERT INTO categories (name) VALUES (?)").run("Herramientas");

  db.prepare("INSERT INTO warehouses (name) VALUES (?)").run("Bodega Central - GYE");
  db.prepare("INSERT INTO warehouses (name) VALUES (?)").run("Bodega Norte - UIO");

  db.prepare("INSERT INTO containers (code, arrival_date, status) VALUES (?, ?, ?)").run("CONT-CHN-2024-001", "2024-02-15", "recibido");
  
  db.prepare(`INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "PROD-001", "Smartphone Dragon X1", 1, 299.99, 150.00, 45, 1, 1, "https://picsum.photos/seed/phone/800/800"
  );
  db.prepare(`INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "PROD-002", "Set de Cocina Imperial", 2, 85.00, 35.00, 120, 1, 1, "https://picsum.photos/seed/kitchen/800/800"
  );
  db.prepare(`INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "PROD-003", "Drone Explorer Pro", 1, 450.00, 210.00, 15, 1, 2, "https://picsum.photos/seed/drone/800/800"
  );
  db.prepare(`INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url) 
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "PROD-004", "Lámpara Solar Jardín", 2, 12.50, 4.20, 300, 1, 1, "https://picsum.photos/seed/solar/800/800"
  );
}

async function startServer() {
  let sqlPool: sql.ConnectionPool | null = null;
  let productosSchemaColumns: ProductosSchemaColumn[] = [];
  let sapSyncInProgress = false;
  const createRunId = () => `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const calculateProgress = (processed: number, total: number) => {
    if (!Number.isFinite(total) || total <= 0) return 0;
    const pct = Math.round((Math.max(0, Math.min(processed, total)) / total) * 10000) / 100;
    return Math.max(0, Math.min(100, pct));
  };

  const sapSyncMonitor: {
    runId: string | null;
    status: "idle" | "running" | "success" | "error";
    phase: string;
    startedAt: string | null;
    endedAt: string | null;
    updatedAt: string | null;
    sourceMode: string | null;
    sourceUrl: string | null;
    targetTable: string;
    batchSize: number;
    totalFetched: number;
    processed: number;
    synced: number;
    currentBatch: number;
    totalBatches: number;
    progressPct: number;
    lockActive: boolean;
    lastError: string | null;
    lastResult: Record<string, any> | null;
  } = {
    runId: null,
    status: "idle",
    phase: "idle",
    startedAt: null,
    endedAt: null,
    updatedAt: new Date().toISOString(),
    sourceMode: null,
    sourceUrl: null,
    targetTable: ECOMMERCE_PRODUCTS_OBJECT,
    batchSize: 0,
    totalFetched: 0,
    processed: 0,
    synced: 0,
    currentBatch: 0,
    totalBatches: 0,
    progressPct: 0,
    lockActive: false,
    lastError: null,
    lastResult: null,
  };

  const updateSapSyncMonitor = (patch: Partial<typeof sapSyncMonitor>) => {
    Object.assign(sapSyncMonitor, patch, { updatedAt: new Date().toISOString() });
  };

  try {
    sqlPool = await new sql.ConnectionPool(sqlServerConfig).connect();
    await ensureSqlServerSchema(sqlPool);
    await ensureSqlServerOperationalSchema(sqlPool);
    productosSchemaColumns = await getProductosSchemaColumns(sqlPool);
  } catch (error) {
    console.warn("SQL Server no disponible. Se ejecuta modo parcial sin endpoints ecommerce SQL.");
    console.warn(error);
  }

  const columnsByNormalized = new Map<string, ProductosSchemaColumn>(
    productosSchemaColumns.map((column) => [column.normalizedName, column])
  );

  const findColumnByCandidates = (candidates: string[]): ProductosSchemaColumn | null => {
    for (const candidate of candidates) {
      const found = columnsByNormalized.get(candidate);
      if (found) return found;
    }
    return null;
  };

  const idColumn = findColumnByCandidates(["id"]);
  const activoColumn = findColumnByCandidates(["activo", "prducodestd"]);
  const fechaRegistroColumn = findColumnByCandidates(["fecharegistro", "fecha_registro", "fecha", "prdufecrgis", "fechadeproceso"]);
  const importKeyColumn = findColumnByCandidates(["codbarras", "codigo", "codigoproducto", "codigoproduc", "sku", "prducodbars", "prducodprdu"]);
  const codigoProductoColumn = findColumnByCandidates(["codigoproduc", "codigoproducto", "codigo", "prducodprdu"]);
  const codigoBarrasColumn = findColumnByCandidates(["codbarras", "codigobarras", "codbarra", "prducodbars"]);
  const nombreColumn = findColumnByCandidates(["nombre", "nombrecorto", "nombre_corto", "prdunomprdu"]);
  const descripcionColumn = findColumnByCandidates(["descripcion", "detalle", "descripcion_larga", "descripcionlarga", "prdudesprdu"]);
  const imagenColumn = findColumnByCandidates(["imagen", "foto", "image_url", "imageurl", "prdurulimag"]);
  const contenedorColumn = findColumnByCandidates(["contenedor", "container", "container_id", "prdunumctnd"]);
  const empresaColumn = findColumnByCandidates(["empresa", "warehouse", "sede", "almacen", "prdunomempr"]);
  const precioUnidadColumn = findColumnByCandidates(["precio_unidad", "preciounidad", "unidad", "precio", "preciounitario", "prdupreuntr", "ecuasolpunitario", "prdupreeuni"]);
  const precioMayoristaColumn = findColumnByCandidates(["precio_mayorista", "preciomayorista", "preciopormayor", "prdupremyor", "ecuasolpmayor", "prdupreemyr"]);
  const precioTarjetaColumn = findColumnByCandidates(["precio_tarjeta", "prdupretrjc", "ecuasolptarjeta", "prdupreetrj"]);
  const precioBultoColumn = findColumnByCandidates(["precio_bulto", "preciobulto", "prdupreblto", "ecuasolpbulto", "prdupreeblt"]);
  const precioDiferenciadoColumn = findColumnByCandidates(["precio_diferenciado", "prdupredifr", "ecuasolpdiferenciado", "prdupreedfr"]);
  const precioOfertaColumn = findColumnByCandidates(["precio_oferta", "prdupreofrt", "ecuasolpoferta", "prdupreeofr"]);
  const precioEspecialColumn = findColumnByCandidates(["precio_especial", "prdupreespl", "prduprelspl"]);
  const listaChinaColumn = findColumnByCandidates(["lista_china", "prdupreluni", "listachina"]);
  const stockColumn = findColumnByCandidates(["stock", "cantidadstock", "totalcantidad", "total_cantidad", "stocktotal", "prdustock"]);
  const grupoColumn = findColumnByCandidates(["grupo", "categoria", "categorianombre", "prdutipgrup"]);

  const app = express();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } });
  const getUploadedFile = (req: express.Request): Express.Multer.File | null => {
    const files = req.files as Express.Multer.File[] | undefined;
    if (files && files.length > 0) return files[0];
    if (req.file) return req.file;
    return null;
  };
  app.use(express.json());
  const PORT = Number(process.env.PORT) || 7002;
  const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:7000";
  const SAP_CONFIG = {
    enabled: process.env.SAP_SYNC_ENABLED === "true",
    source: process.env.SAP_SOURCE || "generic_api",
    productsUrl: process.env.SAP_PRODUCTS_URL || "",
    apiKey: process.env.SAP_API_KEY || "",
    apiKeyHeader: process.env.SAP_API_KEY_HEADER || "x-api-key",
    bearerToken: process.env.SAP_BEARER_TOKEN || "",
    pollMinutes: Number(process.env.SAP_SYNC_INTERVAL_MINUTES || "0"),
    b1ServiceLayerUrl: process.env.SAP_B1_SERVICE_LAYER_URL || "",
    b1CompanyDb: process.env.SAP_B1_COMPANY_DB || "",
    b1Username: process.env.SAP_B1_USERNAME || "",
    b1Password: process.env.SAP_B1_PASSWORD || "",
    b1WarehouseCode: process.env.SAP_B1_WAREHOUSE_CODE || "",
    b1PriceList: Number(process.env.SAP_B1_PRICE_LIST || "8"),
    b1PriceStrict: process.env.SAP_B1_PRICE_STRICT !== "false",
    b1FallbackPriceLists: ((process.env.SAP_B1_FALLBACK_PRICE_LISTS ?? "2,3").trim())
      .split(",")
      .map((value) => String(value).trim())
      .filter((value) => value.length > 0)
      .map((value) => Number(String(value).trim()))
      .filter((value) => Number.isFinite(value)),
    b1TruncateBeforeSync: process.env.SAP_B1_TRUNCATE_BEFORE_SYNC === "true",
    b1DefaultContainer: process.env.SAP_B1_DEFAULT_CONTAINER || "2575",
    b1DefaultImage: process.env.SAP_B1_DEFAULT_IMAGE || "https://picsum.photos/seed/1200/800/800",
    b1PageSize: Number(process.env.SAP_B1_PAGE_SIZE || "100"),
    b1PriceConcurrency: Number(process.env.SAP_B1_PRICE_CONCURRENCY || "10"),
    b1ItemsFilter: process.env.SAP_B1_ITEMS_FILTER || "",
    b1TlsInsecure: process.env.SAP_B1_TLS_INSECURE === "true",
    b1SyncBatchSize: Number(process.env.SAP_B1_SYNC_BATCH_SIZE || "200"),
  };

  if (SAP_CONFIG.b1TlsInsecure) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  }

  const parseSapProductsFromPayload = (payload: any): Array<Record<string, any>> => {
    if (Array.isArray(payload)) return payload as Array<Record<string, any>>;
    if (!payload || typeof payload !== "object") return [];

    const candidates = [payload.items, payload.data, payload.products, payload.result, payload.rows];
    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate as Array<Record<string, any>>;
    }

    return [];
  };

  const readSapValue = (row: Record<string, any>, keys: string[]) => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null) return row[key];
      const found = Object.keys(row).find((current) => current.toLowerCase() === key.toLowerCase());
      if (found && row[found] !== undefined && row[found] !== null) return row[found];
    }
    return null;
  };

  const normalizeSapProduct = (row: Record<string, any>, index: number) => {
    const code =
      toText(readSapValue(row, ["codigo", "code", "sku", "itemcode", "material", "codbarras", "codigoproducto"])) ||
      `SAP-AUTO-${Date.now()}-${index + 1}`;

    const name =
      toText(readSapValue(row, ["nombre", "name", "description", "descripcion", "itemname"])) ||
      code;

    return {
      code,
      barcode:
        toText(readSapValue(row, ["codbarras", "codebars", "barcode", "bar_code", "barCode"])) ||
        code,
      container: toText(readSapValue(row, ["contenedor", "container", "container_id"])) || "2575",
      company: toText(readSapValue(row, ["empresa", "warehouse", "sede", "almacen"])) || "",
      name,
      description:
        toText(readSapValue(row, ["descripcion", "description", "detalle", "nombre", "name"])) ||
        name,
      stock: toNumber(readSapValue(row, ["stock", "cantidad", "existencia", "quantity", "onhand"]), 0),
      cost: toNumber(readSapValue(row, ["costo", "cost", "costo_unitario", "movingaverageprice", "avgstdprice"]), 0),
      price: toNumber(readSapValue(row, ["precio", "price", "precio_unidad", "price_unit", "listprice", "pricevalue", "movingaverageprice"]), 0),
      priceMayorista: toNumber(readSapValue(row, ["precio_mayorista", "precio_por_mayor", "preciopormayor"]), 0),
      priceTarjeta: toNumber(readSapValue(row, ["precio_tarjeta"]), 0),
      priceBulto: toNumber(readSapValue(row, ["precio_bulto"]), 0),
      priceDiferenciado: toNumber(readSapValue(row, ["precio_diferenciado"]), 0),
      priceOferta: toNumber(readSapValue(row, ["precio_oferta"]), 0),
      priceEspecial: toNumber(readSapValue(row, ["precio_especial"]), 0),
      priceEcuasolUnitario: toNumber(readSapValue(row, ["ecuasol_p_unitario", "ecuasol_p_unit"]), 0),
      priceEcuasolMayor: toNumber(readSapValue(row, ["ecuasol_p_mayor"]), 0),
      priceEcuasolBulto: toNumber(readSapValue(row, ["ecuasol_p_bulto"]), 0),
      priceEcuasolTarjeta: toNumber(readSapValue(row, ["ecuasol_p_tarjeta"]), 0),
      priceEcuasolDiferenciado: toNumber(readSapValue(row, ["ecuasol_p_diferenciado"]), 0),
      priceEcuasolOferta: toNumber(readSapValue(row, ["ecuasol_p_oferta"]), 0),
      priceImpolinaUnitario: toNumber(readSapValue(row, ["impolina_p_unitario"]), 0),
      priceImpolinaMayor: toNumber(readSapValue(row, ["impolina_p_mayor"]), 0),
      priceImpolinaBulto: toNumber(readSapValue(row, ["impolina_p_bulto"]), 0),
      priceImpolinaTarjeta: toNumber(readSapValue(row, ["impolina_p_tarjeta"]), 0),
      priceImpolinaDiferenciado: toNumber(readSapValue(row, ["impolina_p_diferenciado"]), 0),
      priceImpolinaOferta: toNumber(readSapValue(row, ["impolina_p_oferta"]), 0),
      priceListaChina: toNumber(readSapValue(row, ["lista_china"]), 0),
      active: toNumber(readSapValue(row, ["activo", "prdu_cod_estd"]), 1),
      category:
        toText(readSapValue(row, ["grupo", "categoria", "category", "linea", "family", "itemsgroupcode", "groupname"])) ||
        "General",
      image:
        toText(readSapValue(row, ["imagen", "image", "image_url", "urlimagen"])) ||
        buildGenericImageUrl(code),
    };
  };

  const fetchSapB1ServiceLayerProducts = async () => {
    if (!SAP_CONFIG.b1ServiceLayerUrl || !SAP_CONFIG.b1CompanyDb || !SAP_CONFIG.b1Username || !SAP_CONFIG.b1Password) {
      throw new Error("Falta configurar SAP B1 Service Layer (URL, COMPANY_DB, USERNAME, PASSWORD).");
    }

    updateSapSyncMonitor({ phase: "fetching_sap" });

    const serviceBase = SAP_CONFIG.b1ServiceLayerUrl.replace(/\/+$/, "");
    const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...init, signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
    };

    const fetchWithRetry = async (
      url: string,
      init: RequestInit,
      timeoutMs: number,
      attempts: number,
      context: string
    ) => {
      let lastError: any = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          return await fetchWithTimeout(url, init, timeoutMs);
        } catch (error: any) {
          lastError = error;
          if (attempt < attempts) {
            await new Promise((resolve) => setTimeout(resolve, 1200));
          }
        }
      }

      throw new Error(
        `${context}. No se pudo conectar con SAP B1 tras ${attempts} intentos: ${lastError?.message || "sin detalle"}`
      );
    };

    updateSapSyncMonitor({ phase: "fetching_sap_login" });
    const loginResponse = await fetchWithRetry(`${serviceBase}/Login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        CompanyDB: SAP_CONFIG.b1CompanyDb,
        UserName: SAP_CONFIG.b1Username,
        Password: SAP_CONFIG.b1Password,
      }),
    }, 20000, 3, "Error de login en SAP B1 Service Layer");

    const loginRaw = await loginResponse.text();
    if (!loginResponse.ok) {
      throw new Error(`No se pudo autenticar en SAP B1 Service Layer (${loginResponse.status}): ${loginRaw.slice(0, 220)}`);
    }

    const headersAny = loginResponse.headers as any;
    const setCookies: string[] =
      typeof headersAny.getSetCookie === "function"
        ? headersAny.getSetCookie()
        : (() => {
            const one = loginResponse.headers.get("set-cookie");
            return one ? [one] : [];
          })();

    const cookieHeader = setCookies
      .map((entry) => entry.split(";")[0])
      .filter(Boolean)
      .join("; ");

    if (!cookieHeader) {
      throw new Error("No se recibió cookie de sesión desde SAP B1 Service Layer.");
    }

    const allRows: Array<Record<string, any>> = [];

    const itemGroupNameByCode = new Map<string, string>();
    const warehouseNameByCode = new Map<string, string>();

    const loadReferenceMap = async (
      path: string,
      getKey: (row: any) => string,
      getValue: (row: any) => string,
      target: Map<string, string>
    ) => {
      try {
        const response = await fetchWithRetry(`${serviceBase}${path}`, {
          method: "GET",
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/json",
          },
        }, 20000, 2, `Error consultando catálogo auxiliar SAP (${path})`);

        const raw = await response.text();
        if (!response.ok) return;

        const payload = JSON.parse(raw);
        const rows = Array.isArray(payload?.value) ? payload.value : [];

        for (const row of rows) {
          const key = toText(getKey(row));
          const value = toText(getValue(row));
          if (key && value) {
            target.set(key, value);
          }
        }
      } catch {
        // No bloquea la sincronización principal si no se puede resolver el nombre.
      }
    };

    await loadReferenceMap(
      "/ItemGroups?$select=Number,GroupName",
      (row) => row?.Number,
      (row) => row?.GroupName,
      itemGroupNameByCode
    );

    await loadReferenceMap(
      "/Warehouses?$select=WarehouseCode,WarehouseName",
      (row) => row?.WarehouseCode,
      (row) => row?.WarehouseName,
      warehouseNameByCode
    );

    const executeSqlQuery = async (sqlCode: string, sqlText: string): Promise<Array<Record<string, any>>> => {
      const escapedCode = encodeURIComponent(sqlCode);

      try {
        await fetchWithRetry(`${serviceBase}/SQLQueries('${escapedCode}')`, {
          method: "DELETE",
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/json",
          },
        }, 12000, 1, `No se pudo limpiar SQLQuery previa ${sqlCode}`);
      } catch {
        // Si no existe, se ignora.
      }

      const createSqlQuery = async () => {
        updateSapSyncMonitor({ phase: "fetching_sap_prepare_query" });
        const createResponse = await fetchWithRetry(`${serviceBase}/SQLQueries`, {
          method: "POST",
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            SqlCode: sqlCode,
            SqlName: sqlCode,
            SqlText: sqlText,
          }),
        }, 30000, 2, `Error creando SQLQuery ${sqlCode}`);

        const createRaw = await createResponse.text();
        if (!createResponse.ok) {
          throw new Error(`No se pudo crear SQLQuery ${sqlCode} (${createResponse.status}): ${createRaw.slice(0, 260)}`);
        }
      };

      await createSqlQuery();

      const resultRows: Array<Record<string, any>> = [];
      const pageSize = 500;
      let skip = 0;
      let guard = 0;
      let recoverableRetries = 0;

      while (guard < 10000) {
        updateSapSyncMonitor({
          phase: "fetching_sap_pages",
          totalFetched: resultRows.length,
        });

        const pagePath = `SQLQueries('${escapedCode}')/List?$skip=${skip}&$top=${pageSize}`;
        const pageResponse = await fetchWithRetry(`${serviceBase}/${pagePath}`, {
          method: "POST",
          headers: {
            Cookie: cookieHeader,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }, 300000, 4, `Error ejecutando SQLQuery ${sqlCode}`);

        const pageRaw = await pageResponse.text();
        if (!pageResponse.ok) {
          const lower = pageRaw.toLowerCase();
          const isRecoverable =
            lower.includes("connection down") ||
            lower.includes("connection reset by peer") ||
            lower.includes("system call 'recv' failed");

          if (isRecoverable && recoverableRetries < 3) {
            recoverableRetries += 1;
            updateSapSyncMonitor({
              phase: "fetching_sap_pages",
              totalFetched: resultRows.length,
            });
            await new Promise((resolve) => setTimeout(resolve, 1500 * recoverableRetries));
            continue;
          }

          if (isRecoverable && recoverableRetries >= 3) {
            recoverableRetries = 0;
            try {
              await fetchWithRetry(`${serviceBase}/SQLQueries('${escapedCode}')`, {
                method: "DELETE",
                headers: {
                  Cookie: cookieHeader,
                  "Content-Type": "application/json",
                },
              }, 12000, 1, `No se pudo reiniciar SQLQuery ${sqlCode}`);
            } catch {
              // Si no existe, se ignora.
            }
            await createSqlQuery();
            continue;
          }

          throw new Error(`No se pudo ejecutar SQLQuery ${sqlCode} (${pageResponse.status}): ${pageRaw.slice(0, 260)}`);
        }

        let pagePayload: any = null;
        try {
          pagePayload = JSON.parse(pageRaw);
        } catch {
          throw new Error(`Respuesta inválida ejecutando SQLQuery ${sqlCode}.`);
        }

        const rows = Array.isArray(pagePayload?.value) ? (pagePayload.value as Array<Record<string, any>>) : [];
        if (rows.length === 0) {
          break;
        }

        recoverableRetries = 0;
        resultRows.push(...rows);
        skip += rows.length;

        updateSapSyncMonitor({
          phase: "fetching_sap_pages",
          totalFetched: resultRows.length,
        });

        guard += 1;
      }

      return resultRows;
    };

    const sqlCode = `COPILOT_SYNC_${Date.now()}`;
    const defaultSqlText = `SELECT
  CASE WHEN IFNULL(T0."CodeBars", '') = '' THEN '9999999' ELSE T0."CodeBars" END AS "prdu_cod_bars",
  '${SAP_CONFIG.b1DefaultImage}' AS "prdu_rul_imag",
  T0."ItemCode" AS "prdu_cod_prdu",
  '${SAP_CONFIG.b1DefaultContainer}' AS "prdu_num_ctnd",
  T0."ItemName" AS "prdu_nom_prdu",
  T0."ItemName" AS "prdu_des_prdu",
  T0."OnHand" AS "prdu_stock",
  T0."AvgPrice" AS "prdu_costo",
  IFNULL(P1."Price", 0) AS "prdu_pre_untr",
  IFNULL(P2."Price", 0) AS "prdu_pre_myor",
  IFNULL(P3."Price", 0) AS "prdu_pre_trjc",
  IFNULL(P4."Price", 0) AS "prdu_pre_blto",
  IFNULL(P5."Price", 0) AS "prdu_pre_difr",
  IFNULL(P6."Price", 0) AS "prdu_pre_ofrt",
  IFNULL(P7."Price", 0) AS "prdu_pre_espl",
  IFNULL(P8."Price", 0) AS "prdu_pre_euni",
  IFNULL(P9."Price", 0) AS "prdu_pre_emyr",
  IFNULL(P10."Price", 0) AS "prdu_pre_eblt",
  IFNULL(P11."Price", 0) AS "prdu_pre_etrj",
  IFNULL(P12."Price", 0) AS "prdu_pre_edfr",
  IFNULL(P13."Price", 0) AS "prdu_pre_eofr",
  IFNULL(P14."Price", 0) AS "prdu_pre_luni",
  IFNULL(P15."Price", 0) AS "prdu_pre_lmyr",
  IFNULL(P16."Price", 0) AS "prdu_pre_lblt",
  IFNULL(P17."Price", 0) AS "prdu_pre_ltrj",
  IFNULL(P18."Price", 0) AS "prdu_pre_ldfr",
  IFNULL(P19."Price", 0) AS "prdu_pre_lofr",
  IFNULL(P20."Price", 0) AS "prdu_pre_chin",
  (SELECT TOP 1 "CompnyName" FROM "OADM") AS "prdu_nom_empr",
  T1."ItmsGrpNam" AS "prdu_tip_grup",
  CASE WHEN T0."OnHand" > 0 THEN 1 ELSE 2 END AS "prdu_cod_estd",
  T0."CreateDate" AS "prdu_fec_rgis"
FROM "OITM" T0
INNER JOIN "OITB" T1 ON T0."ItmsGrpCod" = T1."ItmsGrpCod"
LEFT JOIN "ITM1" P1 ON T0."ItemCode" = P1."ItemCode" AND P1."PriceList" = 1
LEFT JOIN "ITM1" P2 ON T0."ItemCode" = P2."ItemCode" AND P2."PriceList" = 2
LEFT JOIN "ITM1" P3 ON T0."ItemCode" = P3."ItemCode" AND P3."PriceList" = 3
LEFT JOIN "ITM1" P4 ON T0."ItemCode" = P4."ItemCode" AND P4."PriceList" = 4
LEFT JOIN "ITM1" P5 ON T0."ItemCode" = P5."ItemCode" AND P5."PriceList" = 5
LEFT JOIN "ITM1" P6 ON T0."ItemCode" = P6."ItemCode" AND P6."PriceList" = 6
LEFT JOIN "ITM1" P7 ON T0."ItemCode" = P7."ItemCode" AND P7."PriceList" = 7
LEFT JOIN "ITM1" P8 ON T0."ItemCode" = P8."ItemCode" AND P8."PriceList" = 8
LEFT JOIN "ITM1" P9 ON T0."ItemCode" = P9."ItemCode" AND P9."PriceList" = 9
LEFT JOIN "ITM1" P10 ON T0."ItemCode" = P10."ItemCode" AND P10."PriceList" = 10
LEFT JOIN "ITM1" P11 ON T0."ItemCode" = P11."ItemCode" AND P11."PriceList" = 11
LEFT JOIN "ITM1" P12 ON T0."ItemCode" = P12."ItemCode" AND P12."PriceList" = 12
LEFT JOIN "ITM1" P13 ON T0."ItemCode" = P13."ItemCode" AND P13."PriceList" = 13
LEFT JOIN "ITM1" P14 ON T0."ItemCode" = P14."ItemCode" AND P14."PriceList" = 14
LEFT JOIN "ITM1" P15 ON T0."ItemCode" = P15."ItemCode" AND P15."PriceList" = 15
LEFT JOIN "ITM1" P16 ON T0."ItemCode" = P16."ItemCode" AND P16."PriceList" = 16
LEFT JOIN "ITM1" P17 ON T0."ItemCode" = P17."ItemCode" AND P17."PriceList" = 17
LEFT JOIN "ITM1" P18 ON T0."ItemCode" = P18."ItemCode" AND P18."PriceList" = 18
LEFT JOIN "ITM1" P19 ON T0."ItemCode" = P19."ItemCode" AND P19."PriceList" = 19
LEFT JOIN "ITM1" P20 ON T0."ItemCode" = P20."ItemCode" AND P20."PriceList" = 20
WHERE T0."SellItem" = 'Y'
  AND T0."validFor" = 'Y'
${SAP_B1_SQL_FILTER ? `  AND (${SAP_B1_SQL_FILTER})` : ""}
ORDER BY T0."ItemCode"`;
  const sqlText = SAP_B1_SQL_TEXT || defaultSqlText;

    const queryRows = await executeSqlQuery(sqlCode, sqlText);
    updateSapSyncMonitor({ phase: "fetching_sap_mapping", totalFetched: queryRows.length });

    for (const row of queryRows) {
      const codeRaw = toText(
        readSapValue(row, [
          "prdu_cod_prdu",
          "CODIGOPRODUC",
          "codigoproduc",
          "ItemCode",
        ])
      );
      const code = toText(codeRaw).trim();
      if (!code) continue;

      const sapPrice = (keys: string[], fallback = 0) => {
        let firstNumeric: number | null = null;
        for (const key of keys) {
          const rawValue = readSapValue(row, [key]);
          if (rawValue === null || rawValue === undefined) continue;
          const textValue = toText(rawValue);
          if (!textValue) continue;
          const numericValue = Number(rawValue);
          if (!Number.isFinite(numericValue)) continue;
          if (firstNumeric === null) {
            firstNumeric = numericValue;
          }
          if (numericValue > 0) {
            return numericValue;
          }
        }

        return firstNumeric !== null ? firstNumeric : fallback;
      };

      const stock = toNumber(readSapValue(row, ["prdu_stock", "STOCK_TOTAL", "STOCK", "stock"]), 0);
      const groupCode = toText(readSapValue(row, ["GRUPO", "grupo", "prdu_tip_grup", "ItmsGrpCod", "ITMSGRPCOD"]));
      const warehouseCode = toText(readSapValue(row, ["EMPRESA", "empresa"]));
      const itemName = toText(readSapValue(row, ["prdu_nom_prdu", "NOMBRE", "nombre"])) || code;
      const description = toText(readSapValue(row, ["prdu_des_prdu", "DESCRIPCION", "descripcion"])) || itemName;
      const rawGroupName = toText(readSapValue(row, ["prdu_tip_grup", "ItmsGrpNam", "ITMSGRPNAM", "GRUPO", "grupo"]));
      const rawCompanyName = toText(readSapValue(row, ["prdu_nom_empr", "CompnyName", "COMPNYNAME", "EMPRESA", "empresa"]));
      const codBarras = toText(readSapValue(row, ["prdu_cod_bars", "CODBARRAS", "codbarras"])) || code;
      const imageUrl =
        toText(readSapValue(row, ["prdu_rul_imag", "IMAGEN", "imagen"])) || SAP_CONFIG.b1DefaultImage;
      const container =
        toText(readSapValue(row, ["prdu_num_ctnd", "CONTENEDOR", "contenedor"])) || SAP_CONFIG.b1DefaultContainer;
      const activoValue = toNumber(readSapValue(row, ["prdu_cod_estd", "ACTIVO", "activo"]), stock > 0 ? 1 : 0);
      const fechaProceso = readSapValue(row, ["prdu_fec_rgis", "FECHA_DE_PROCESO", "fecha_de_proceso"]);

      const mappedGroupName = itemGroupNameByCode.get(groupCode) || "";
      const groupLooksLikeCode = rawGroupName === groupCode || /^\d+$/.test(rawGroupName);
      const normalizedGroupName =
        mappedGroupName && groupLooksLikeCode
          ? mappedGroupName
          : rawGroupName || mappedGroupName || groupCode || "General";

      const mappedCompanyName = warehouseNameByCode.get(warehouseCode) || "";
      const companyLooksLikeCode = rawCompanyName === warehouseCode;
      const normalizedCompanyName =
        mappedCompanyName && companyLooksLikeCode
          ? mappedCompanyName
          : rawCompanyName || mappedCompanyName || warehouseCode || SAP_CONFIG.b1CompanyDb || "";

      allRows.push({
        codbarras: codBarras,
        codigoproduc: code,
        contenedor: container,
        nombre: itemName,
        descripcion: description,
        stock,
        costo: toNumber(readSapValue(row, ["prdu_costo", "COSTO", "costo"]), 0),
        precio_unidad: sapPrice([
          "prdu_pre_untr",
          "PRECIO_UNITARIO",
          "precio_unidad",
          "prdu_pre_euni",
          "ECUASOL_P_UNITARIO",
          "ECUASOL P. UNITARIO",
        ], 0),
        precio_mayorista: sapPrice([
          "prdu_pre_myor",
          "PRECIO_POR_MAYOR",
          "precio_mayorista",
          "prdu_pre_emyr",
          "ECUASOL_P_MAYOR",
          "ECUASOL P. MAYOR",
        ], 0),
        precio_tarjeta: sapPrice([
          "prdu_pre_trjc",
          "PRECIO_TARJETA",
          "precio_tarjeta",
          "prdu_pre_etrj",
          "ECUASOL_P_TARJETA",
          "ECUASOL P. TARJETA",
        ], 0),
        precio_bulto: sapPrice([
          "prdu_pre_blto",
          "PRECIO_BULTO",
          "precio_bulto",
          "prdu_pre_eblt",
          "ECUASOL_P_BULTO",
          "ECUASOL P. BULTO",
        ], 0),
        precio_diferenciado: sapPrice([
          "prdu_pre_edfr",
          "ECUASOL_P_DIFERENCIADO",
          "ECUASOL P. DIFERENCIADO",
          "prdu_pre_difr",
          "PRECIO_DIFERENCIADO",
          "precio_diferenciado",
        ], 0),
        precio_oferta: sapPrice([
          "prdu_pre_eofr",
          "ECUASOL_P_OFERTA",
          "ECUASOL P. OFERTA",
          "prdu_pre_ofrt",
          "PRECIO_OFERTA",
          "precio_oferta",
        ], 0),
        precio_especial: sapPrice(["prdu_pre_espl", "PRECIO_ESPECIAL", "precio_especial"], 0),
        ecuasol_p_unitario: sapPrice(["prdu_pre_euni", "ECUASOL_P_UNITARIO", "ECUASOL P. UNITARIO"], 0),
        ecuasol_p_mayor: sapPrice(["prdu_pre_emyr", "ECUASOL_P_MAYOR", "ECUASOL P. MAYOR"], 0),
        ecuasol_p_bulto: sapPrice(["prdu_pre_eblt", "ECUASOL_P_BULTO", "ECUASOL P. BULTO"], 0),
        ecuasol_p_tarjeta: sapPrice(["prdu_pre_etrj", "ECUASOL_P_TARJETA", "ECUASOL P. TARJETA"], 0),
        ecuasol_p_diferenciado: sapPrice([
          "prdu_pre_edfr",
          "ECUASOL_P_DIFERENCIADO",
          "ECUASOL P. DIFERENCIADO",
        ], 0),
        ecuasol_p_oferta: sapPrice(["prdu_pre_eofr", "ECUASOL_P_OFERTA", "ECUASOL P. OFERTA"], 0),
        impolina_p_unitario: sapPrice(["prdu_pre_luni", "IMPOLINA_P_UNITARIO", "IMPOLINA P. UNITARIO"], 0),
        impolina_p_mayor: sapPrice(["prdu_pre_lmyr", "IMPOLINA_P_MAYOR", "IMPOLINA P. MAYOR"], 0),
        impolina_p_bulto: sapPrice(["prdu_pre_lblt", "IMPOLINA_P_BULTO", "IMPOLINA P. BULTO"], 0),
        impolina_p_tarjeta: sapPrice(["prdu_pre_ltrj", "IMPOLINA_P_TARJETA", "IMPOLINA P. TARJETA"], 0),
        impolina_p_diferenciado: sapPrice([
          "prdu_pre_ldfr",
          "IMPOLINA_P_DIFERENCIADO",
          "IMPOLINA P. DIFERENCIADO",
        ], 0),
        impolina_p_oferta: sapPrice(["prdu_pre_lofr", "IMPOLINA_P_OFERTA", "IMPOLINA P. OFERTA"], 0),
        lista_china: sapPrice(["prdu_pre_chin", "LISTA_CHINA", "LISTA CHINA"], 0),
        grupo: normalizedGroupName,
        empresa: normalizedCompanyName,
        activo: activoValue,
        fecha_registro: fechaProceso,
        imagen: imageUrl,
      });
    }

    const mergeSapRowsByCode = (rows: Array<Record<string, any>>) => {
      const byCode = new Map<string, Record<string, any>>();
      const numericFields = [
        "stock",
        "costo",
        "precio_unidad",
        "precio_mayorista",
        "precio_tarjeta",
        "precio_bulto",
        "precio_diferenciado",
        "precio_oferta",
        "precio_especial",
        "ecuasol_p_unitario",
        "ecuasol_p_mayor",
        "ecuasol_p_bulto",
        "ecuasol_p_tarjeta",
        "ecuasol_p_diferenciado",
        "ecuasol_p_oferta",
        "impolina_p_unitario",
        "impolina_p_mayor",
        "impolina_p_bulto",
        "impolina_p_tarjeta",
        "impolina_p_diferenciado",
        "impolina_p_oferta",
        "lista_china",
      ];

      for (const row of rows) {
        const key = toText(row?.codigoproduc || row?.codigo || row?.codbarras).trim().toUpperCase();
        if (!key) continue;

        const current = byCode.get(key);
        if (!current) {
          byCode.set(key, { ...row });
          continue;
        }

        for (const field of numericFields) {
          const a = toNumber(current[field], 0);
          const b = toNumber(row[field], 0);
          if (b > a) {
            current[field] = b;
          }
        }

        const textFields = ["codbarras", "nombre", "descripcion", "contenedor", "empresa", "grupo", "imagen"];
        for (const field of textFields) {
          const a = toText(current[field]);
          const b = toText(row[field]);
          if (!a && b) {
            current[field] = b;
          }
        }

        if (!current.fecha_registro && row.fecha_registro) {
          current.fecha_registro = row.fecha_registro;
        }

        byCode.set(key, current);
      }

      return Array.from(byCode.values());
    };

    try {
      await fetchWithTimeout(`${serviceBase}/Logout`, {
        method: "POST",
        headers: {
          Cookie: cookieHeader,
          "Content-Type": "application/json",
        },
      }, 10000);
    } catch {
      // Si logout falla no bloquea la sincronización.
    }

    const mergedRows = mergeSapRowsByCode(allRows);

    return {
      sourceUrl: `${serviceBase}/Items`,
      sapRows: mergedRows,
      rawSapRowCount: allRows.length,
      uniqueSapRowCount: mergedRows.length,
    };
  };

  const syncProductsFromSap = async (sourceUrlOverride?: string, sourceModeOverride?: string) => {
    if (!sqlPool) {
      throw new Error("SQL Server no disponible para sincronización SAP.");
    }

    const mode = toText(sourceModeOverride || SAP_CONFIG.source || "generic_api").toLowerCase();
    updateSapSyncMonitor({
      sourceMode: mode,
      phase: "fetching_sap",
    });

    let sourceUrl = "";
    let sapRows: Array<Record<string, any>> = [];
    let rawFetched = 0;
    let uniqueFetched = 0;

    if (mode === "sap_b1_service_layer") {
      const b1Result = await fetchSapB1ServiceLayerProducts();
      sourceUrl = b1Result.sourceUrl;
      sapRows = b1Result.sapRows;
      rawFetched = Number(b1Result.rawSapRowCount || 0);
      uniqueFetched = Number(b1Result.uniqueSapRowCount || sapRows.length || 0);
      updateSapSyncMonitor({
        totalFetched: uniqueFetched,
      });

      sapRows = Array.isArray(sapRows) ? sapRows : [];
    } else {
      sourceUrl = sourceUrlOverride || SAP_CONFIG.productsUrl;
      if (!sourceUrl) {
        throw new Error("SAP_PRODUCTS_URL no está configurado.");
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (SAP_CONFIG.apiKey) {
        headers[SAP_CONFIG.apiKeyHeader] = SAP_CONFIG.apiKey;
      }

      if (SAP_CONFIG.bearerToken) {
        headers.Authorization = `Bearer ${SAP_CONFIG.bearerToken}`;
      }

      const response = await fetch(sourceUrl, {
        method: "GET",
        headers,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(`SAP API respondió ${response.status}: ${raw.slice(0, 300)}`);
      }

      let payload: any = null;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw new Error("La respuesta de SAP no es JSON válido.");
      }

      sapRows = parseSapProductsFromPayload(payload);
      rawFetched = sapRows.length;
      uniqueFetched = sapRows.length;
    }

    if (rawFetched <= 0) rawFetched = sapRows.length;
    if (uniqueFetched <= 0) uniqueFetched = sapRows.length;

    updateSapSyncMonitor({
      sourceUrl: sourceUrl || null,
    });

    if (sapRows.length === 0) {
      updateSapSyncMonitor({
        phase: "completed",
        totalFetched: 0,
        processed: 0,
        synced: 0,
        currentBatch: 0,
        totalBatches: 0,
        progressPct: 100,
      });
      return {
        sourceUrl,
        mode,
        fetched: 0,
        synced: 0,
      };
    }

    let synced = 0;
    const insertOnlyMode = mode === "sap_b1_service_layer" && SAP_CONFIG.b1TruncateBeforeSync;
    const batchSize = Math.max(100, Math.min(200, SAP_CONFIG.b1SyncBatchSize || 200));
    const tx = insertOnlyMode ? null : new sql.Transaction(sqlPool);
    const totalBatches = Math.ceil(sapRows.length / batchSize);

    updateSapSyncMonitor({
      phase: insertOnlyMode ? "truncate_target" : "upsert_target",
      batchSize,
      totalFetched: sapRows.length,
      processed: 0,
      synced: 0,
      currentBatch: 0,
      totalBatches,
      progressPct: 0,
    });

    if (tx) {
      await tx.begin();
    }

    try {
      if (insertOnlyMode) {
        await sqlPool.request().query(`DELETE FROM ${ECOMMERCE_PRODUCTS_SQL};`);
      }

      for (let batchStart = 0; batchStart < sapRows.length; batchStart += batchSize) {
        const batchRows = sapRows.slice(batchStart, batchStart + batchSize);
        const currentBatch = Math.floor(batchStart / batchSize) + 1;
        updateSapSyncMonitor({
          phase: "writing_sql",
          currentBatch,
          totalBatches,
        });
        if (batchStart === 0 || batchStart % (batchSize * 10) === 0) {
          console.log(`[SAP SYNC] Procesando lote ${Math.floor(batchStart / batchSize) + 1} (${batchStart}/${sapRows.length})`);
        }

        for (let batchIndex = 0; batchIndex < batchRows.length; batchIndex += 1) {
          const rowIndex = batchStart + batchIndex;
          const normalized = normalizeSapProduct(batchRows[batchIndex], rowIndex);

          const valuesByColumn = new Map<string, any>();

          const setColumnValue = (column: ProductosSchemaColumn | null, value: any) => {
            if (!column) return;
            valuesByColumn.set(column.name, toSqlColumnValue(value, column));
          };

          setColumnValue(importKeyColumn, normalized.code);
          setColumnValue(codigoProductoColumn, normalized.code);
          setColumnValue(codigoBarrasColumn, normalized.barcode || normalized.code);
          setColumnValue(contenedorColumn, normalized.container);
          setColumnValue(nombreColumn, normalized.name);
          setColumnValue(descripcionColumn, normalized.description);
          setColumnValue(imagenColumn, normalized.image);
          setColumnValue(precioUnidadColumn, normalized.price);
          setColumnValue(precioMayoristaColumn, normalized.priceMayorista);
          setColumnValue(precioTarjetaColumn, normalized.priceTarjeta);
          setColumnValue(precioBultoColumn, normalized.priceBulto);
          setColumnValue(precioDiferenciadoColumn, normalized.priceDiferenciado);
          setColumnValue(precioOfertaColumn, normalized.priceOferta);
          setColumnValue(precioEspecialColumn, normalized.priceEspecial);
          setColumnValue(listaChinaColumn, normalized.priceListaChina);
          setColumnValue(stockColumn, normalized.stock);
          setColumnValue(empresaColumn, normalized.company);
          setColumnValue(grupoColumn, normalized.category);
          setColumnValue(activoColumn, normalized.active > 0 ? 1 : 0);
          setColumnValue(fechaRegistroColumn, new Date());

          for (const schemaColumn of productosSchemaColumns) {
            if (schemaColumn.isIdentity) continue;
            if (schemaColumn.isNullable) continue;
            if (schemaColumn.hasDefault) continue;

            const currentValue = valuesByColumn.get(schemaColumn.name);
            const needsFallback =
              !valuesByColumn.has(schemaColumn.name) ||
              currentValue === null ||
              currentValue === undefined ||
              toText(currentValue) === "";

            if (!needsFallback) continue;

            const fallbackValue = getRequiredFallbackValue(schemaColumn);
            if (fallbackValue !== null && fallbackValue !== undefined) {
              valuesByColumn.set(schemaColumn.name, fallbackValue);
            }
          }

          const insertEntries = Array.from(valuesByColumn.entries()).filter(([columnName, value]) => {
            const column = productosSchemaColumns.find((col) => col.name === columnName);
            if (!column || column.isIdentity) return false;
            return value !== undefined;
          });

          if (insertEntries.length === 0) continue;

          const request = tx ? new sql.Request(tx) : sqlPool.request();
          insertEntries.forEach(([_, value], entryIndex) => {
            request.input(`p${entryIndex}`, value);
          });

          if (insertOnlyMode) {
            const insertColumnsClause = insertEntries.map(([columnName]) => `[${columnName}]`).join(", ");
            const insertValuesClause = insertEntries.map((_, entryIndex) => `@p${entryIndex}`).join(", ");
            await request.query(`
              INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
              VALUES (${insertValuesClause});
            `);
            synced += 1;
            continue;
          }

          const upsertKeyColumn = importKeyColumn || codigoProductoColumn || codigoBarrasColumn;
          if (upsertKeyColumn) {
            const keyEntry = insertEntries.find(([columnName]) => columnName === upsertKeyColumn.name);
            if (keyEntry && keyEntry[1] !== null && keyEntry[1] !== undefined && toText(keyEntry[1]) !== "") {
              request.input("upsertKey", keyEntry[1]);

              const updateEntries = insertEntries.filter(([columnName]) => columnName !== upsertKeyColumn.name);
              const updateSetClause = updateEntries
                .map(([columnName]) => {
                  const idx = insertEntries.findIndex(([entryName]) => entryName === columnName);
                  return `[${columnName}] = @p${idx}`;
                })
                .join(",\n                      ");

              const insertColumnsClause = insertEntries.map(([columnName]) => `[${columnName}]`).join(", ");
              const insertValuesClause = insertEntries.map((_, entryIndex) => `@p${entryIndex}`).join(", ");

              if (updateEntries.length > 0) {
                await request.query(`
                  IF EXISTS (SELECT 1 FROM ${ECOMMERCE_PRODUCTS_SQL} WHERE [${upsertKeyColumn.name}] = @upsertKey)
                  BEGIN
                    UPDATE ${ECOMMERCE_PRODUCTS_SQL}
                    SET ${updateSetClause}
                    WHERE [${upsertKeyColumn.name}] = @upsertKey;
                  END
                  ELSE
                  BEGIN
                    INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
                    VALUES (${insertValuesClause});
                  END
                `);
              } else {
                await request.query(`
                  IF NOT EXISTS (SELECT 1 FROM ${ECOMMERCE_PRODUCTS_SQL} WHERE [${upsertKeyColumn.name}] = @upsertKey)
                  BEGIN
                    INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
                    VALUES (${insertValuesClause});
                  END
                `);
              }

              synced += 1;
              continue;
            }
          }

          const insertColumnsClause = insertEntries.map(([columnName]) => `[${columnName}]`).join(", ");
          const insertValuesClause = insertEntries.map((_, entryIndex) => `@p${entryIndex}`).join(", ");
          await request.query(`
            INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
            VALUES (${insertValuesClause});
          `);
          synced += 1;
        }

        const processed = Math.min(batchStart + batchRows.length, sapRows.length);
        updateSapSyncMonitor({
          processed,
          synced,
          progressPct: calculateProgress(processed, sapRows.length),
        });
      }

      if (tx) {
        await tx.commit();
      }
    } catch (error) {
      if (tx) {
        await tx.rollback();
      }
      throw error;
    }

    return {
      sourceUrl,
      mode,
      fetched: sapRows.length,
      synced,
      batchSize,
      rawFetched,
      uniqueFetched,
    };
  };

  const PLACETOPAY_CONFIG = {
    login: process.env.PLACETOPAY_LOGIN || "",
    tranKey: process.env.PLACETOPAY_TRANKEY || "",
    baseUrl: process.env.PLACETOPAY_BASE_URL || "https://test.placetopay.com/redirection",
    locale: process.env.PLACETOPAY_LOCALE || "es_EC",
  };

  const buildPlaceToPayAuth = () => {
    const nonceRaw = randomBytes(16);
    const nonce = nonceRaw.toString("base64");
    const seed = new Date().toISOString();
    const tranKey = createHash("sha1")
      .update(Buffer.concat([nonceRaw, Buffer.from(seed + PLACETOPAY_CONFIG.tranKey)]))
      .digest("base64");

    return {
      login: PLACETOPAY_CONFIG.login,
      tranKey,
      nonce,
      seed,
    };
  };

  const parsePlaceToPayStatus = (payload: any): string => {
    const status = payload?.status?.status;
    if (status && typeof status === "string") return status.toUpperCase();
    return "UNKNOWN";
  };

  app.post("/api/payments/placetopay/session", async (req, res) => {
    if (!PLACETOPAY_CONFIG.login || !PLACETOPAY_CONFIG.tranKey) {
      return res.status(503).json({ error: "PlaceToPay no está configurado en el backend." });
    }

    const {
      order_id,
      order_number,
      amount,
      buyer,
      return_url,
    } = req.body || {};

    if (!order_id || !order_number || !amount) {
      return res.status(400).json({ error: "Faltan datos para iniciar el pago en PlaceToPay." });
    }

    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      return res.status(400).json({ error: "Monto inválido para PlaceToPay." });
    }

    try {
      const requestBody = {
        auth: buildPlaceToPayAuth(),
        locale: PLACETOPAY_CONFIG.locale,
        payment: {
          reference: String(order_number),
          description: `Compra Cony Importadora - ${String(order_number)}`,
          amount: {
            currency: "USD",
            total: Number(normalizedAmount.toFixed(2)),
          },
        },
        expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        returnUrl:
          return_url ||
          `${FRONTEND_URL}/carrito?ptp_return=1&order_id=${encodeURIComponent(String(order_id))}&order_number=${encodeURIComponent(
            String(order_number)
          )}`,
        ipAddress: req.ip || "127.0.0.1",
        userAgent: req.get("user-agent") || "CONY-Frontend",
        buyer: {
          name: buyer?.name || "Cliente",
          surname: buyer?.surname || "Cony",
          email: buyer?.email || "cliente@cony.local",
          mobile: buyer?.mobile || "0000000000",
          address: {
            street: buyer?.address || "Sin direccion",
            city: buyer?.city || "Quito",
            country: "EC",
          },
        },
      };

      const response = await fetch(`${PLACETOPAY_CONFIG.baseUrl}/api/session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const raw = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (!response.ok) {
        return res.status(response.status).json({
          error: "No se pudo crear sesión de pago en PlaceToPay.",
          placetopay_response: data,
        });
      }

      return res.json({
        requestId: data?.requestId,
        processUrl: data?.processUrl,
        status: data?.status || null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Error creando sesión PlaceToPay." });
    }
  });

  app.post("/api/payments/placetopay/status", async (req, res) => {
    if (!PLACETOPAY_CONFIG.login || !PLACETOPAY_CONFIG.tranKey) {
      return res.status(503).json({ error: "PlaceToPay no está configurado en el backend." });
    }

    const { requestId } = req.body || {};
    if (!requestId) {
      return res.status(400).json({ error: "requestId es requerido." });
    }

    try {
      const response = await fetch(`${PLACETOPAY_CONFIG.baseUrl}/api/session/${encodeURIComponent(String(requestId))}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ auth: buildPlaceToPayAuth() }),
      });

      const raw = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(raw);
      } catch {
        data = { raw };
      }

      if (!response.ok) {
        return res.status(response.status).json({
          error: "No se pudo consultar estado en PlaceToPay.",
          placetopay_response: data,
        });
      }

      return res.json({
        approved: parsePlaceToPayStatus(data) === "APPROVED",
        status: data?.status || null,
        request: data?.request || null,
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "Error consultando estado PlaceToPay." });
    }
  });

  app.get("/api/ecommerce/sap/sync-config", (req, res) => {
    res.json({
      enabled: SAP_CONFIG.enabled,
      source: SAP_CONFIG.source,
      productsUrlConfigured: Boolean(SAP_CONFIG.productsUrl),
      apiKeyConfigured: Boolean(SAP_CONFIG.apiKey),
      bearerTokenConfigured: Boolean(SAP_CONFIG.bearerToken),
      b1ServiceLayerConfigured: Boolean(SAP_CONFIG.b1ServiceLayerUrl),
      b1CompanyConfigured: Boolean(SAP_CONFIG.b1CompanyDb),
      b1UsernameConfigured: Boolean(SAP_CONFIG.b1Username),
      b1WarehouseCode: SAP_CONFIG.b1WarehouseCode || null,
      b1PriceList: SAP_CONFIG.b1PriceList,
      b1PriceStrict: SAP_CONFIG.b1PriceStrict,
      b1FallbackPriceLists: SAP_CONFIG.b1FallbackPriceLists,
      b1TruncateBeforeSync: SAP_CONFIG.b1TruncateBeforeSync,
      b1DefaultContainer: SAP_CONFIG.b1DefaultContainer,
      b1DefaultImage: SAP_CONFIG.b1DefaultImage,
      b1PriceConcurrency: SAP_CONFIG.b1PriceConcurrency,
      b1ItemsFilter: SAP_CONFIG.b1ItemsFilter || null,
      b1TlsInsecure: SAP_CONFIG.b1TlsInsecure,
      b1SyncBatchSize: SAP_CONFIG.b1SyncBatchSize,
      targetTable: ECOMMERCE_PRODUCTS_OBJECT,
      pollMinutes: SAP_CONFIG.pollMinutes,
    });
  });

  app.get("/api/ecommerce/sap/sync-monitor", async (req, res) => {
    try {
      let targetCount: number | null = null;
      if (sqlPool) {
        const countResult = await sqlPool.request().query(`SELECT COUNT(1) AS total FROM ${ECOMMERCE_PRODUCTS_SQL}`);
        targetCount = Number(countResult.recordset?.[0]?.total || 0);
      }

      const nowMs = Date.now();
      const startedMs = sapSyncMonitor.startedAt ? Date.parse(sapSyncMonitor.startedAt) : NaN;
      const updatedMs = sapSyncMonitor.updatedAt ? Date.parse(sapSyncMonitor.updatedAt) : NaN;
      const elapsedSeconds = Number.isFinite(startedMs) ? Math.max(0, Math.floor((nowMs - startedMs) / 1000)) : null;
      const staleSeconds = Number.isFinite(updatedMs) ? Math.max(0, Math.floor((nowMs - updatedMs) / 1000)) : null;
      const isStalled = Boolean(
        sapSyncInProgress &&
        sapSyncMonitor.status === "running" &&
        sapSyncMonitor.phase === "fetching_sap" &&
        staleSeconds !== null &&
        staleSeconds > 120
      );

      const phaseHints: Record<string, string> = {
        idle: "Sin ejecución activa.",
        starting: "Preparando sincronización.",
        fetching_sap: "Consultando SAP Service Layer (lectura de datos fuente).",
        fetching_sap_pages: "Leyendo paginas de SAP Service Layer.",
        fetching_sap_mapping: "Normalizando columnas recibidas desde SAP.",
        truncate_target: "Limpiando tabla destino antes de la carga.",
        writing_sql: "Insertando/actualizando lotes en SQL Server.",
        upsert_target: "Sincronizando con estrategia upsert en SQL Server.",
        completed: "Sincronización completada.",
        error: "La sincronización terminó con error.",
      };
      const phaseMessage = phaseHints[sapSyncMonitor.phase] || "Fase no mapeada.";

      return res.json({
        ...sapSyncMonitor,
        lockActive: sapSyncInProgress,
        targetCount,
        targetTable: ECOMMERCE_PRODUCTS_OBJECT,
        elapsedSeconds,
        staleSeconds,
        isStalled,
        phaseMessage,
      });
    } catch (e: any) {
      return res.status(500).json({
        error: e?.message || "No se pudo obtener el monitor de sincronización SAP.",
      });
    }
  });

  app.post("/api/ecommerce/sap/sync", async (req, res) => {
    if (!sqlPool) {
      return res.status(503).json({ error: "SQL Server no disponible para sincronizar SAP." });
    }

    if (sapSyncInProgress) {
      return res.status(409).json({ error: "Ya hay una sincronización SAP en ejecución. Espera a que termine." });
    }

    try {
      sapSyncInProgress = true;
      updateSapSyncMonitor({
        runId: createRunId(),
        status: "running",
        phase: "starting",
        startedAt: new Date().toISOString(),
        endedAt: null,
        sourceMode: toText(req.body?.source_mode || SAP_CONFIG.source || "").toLowerCase() || null,
        sourceUrl: toText(req.body?.source_url || SAP_CONFIG.productsUrl || SAP_CONFIG.b1ServiceLayerUrl || "") || null,
        targetTable: ECOMMERCE_PRODUCTS_OBJECT,
        batchSize: Math.max(100, Math.min(200, SAP_CONFIG.b1SyncBatchSize || 200)),
        totalFetched: 0,
        processed: 0,
        synced: 0,
        currentBatch: 0,
        totalBatches: 0,
        progressPct: 0,
        lockActive: true,
        lastError: null,
        lastResult: null,
      });
      const sourceUrl = toText(req.body?.source_url);
      const sourceMode = toText(req.body?.source_mode);
      const result = await syncProductsFromSap(sourceUrl || undefined, sourceMode || undefined);
      updateSapSyncMonitor({
        status: "success",
        phase: "completed",
        endedAt: new Date().toISOString(),
        processed: Number(result.fetched || 0),
        synced: Number(result.synced || 0),
        progressPct: 100,
        lockActive: false,
        lastResult: result,
      });
      return res.json({ success: true, ...result });
    } catch (e: any) {
      updateSapSyncMonitor({
        status: "error",
        phase: "error",
        endedAt: new Date().toISOString(),
        lockActive: false,
        lastError: e?.message || "No se pudo sincronizar SAP.",
        lastResult: null,
      });
      return res.status(500).json({
        error: e?.message || "No se pudo sincronizar SAP.",
      });
    } finally {
      sapSyncInProgress = false;
      updateSapSyncMonitor({ lockActive: false });
    }
  });

  if (SAP_CONFIG.enabled && Number.isFinite(SAP_CONFIG.pollMinutes) && SAP_CONFIG.pollMinutes > 0) {
    const intervalMs = Math.max(1, SAP_CONFIG.pollMinutes) * 60 * 1000;

    setTimeout(async () => {
      if (sapSyncInProgress) {
        console.log("[SAP SYNC] Primera sincronización omitida: ya hay una en ejecución.");
        return;
      }

      try {
        sapSyncInProgress = true;
        const result = await syncProductsFromSap();
        console.log("[SAP SYNC] Primera sincronización completada:", result);
      } catch (error) {
        console.error("[SAP SYNC] Error en primera sincronización:", error);
      } finally {
        sapSyncInProgress = false;
      }
    }, 15_000);

    setInterval(async () => {
      if (sapSyncInProgress) {
        console.log("[SAP SYNC] Sincronización omitida: aún hay una en ejecución.");
        return;
      }

      try {
        sapSyncInProgress = true;
        const result = await syncProductsFromSap();
        console.log("[SAP SYNC] Sincronización completada:", result);
      } catch (error) {
        console.error("[SAP SYNC] Error en sincronización:", error);
      } finally {
        sapSyncInProgress = false;
      }
    }, intervalMs);
  }

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "backend", port: PORT, sqlServerConnected: !!sqlPool });
  });

  app.get("/api/ecommerce/template", async (req, res) => {
    try {
      return res.json(buildProductosInsertTemplatePayload());
    } catch (e: any) {
      return res.status(500).json({ error: e.message || "No se pudo generar la plantilla de Productos." });
    }
  });

  app.get("/api/ecommerce/productos", async (req, res) => {
    try {
      const q = toText(req.query.q).trim();
      const requestedLimit = Number(toText(req.query.limit) || "0");
      const requestedOffset = Number(toText(req.query.offset) || "0");
      const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(1000, requestedLimit) : 0;
      const offset = Number.isFinite(requestedOffset) && requestedOffset > 0 ? requestedOffset : 0;

      if (!sqlPool) {
        const sqliteProducts = db
          .prepare(
            `SELECT id, internal_code, name, stock, cost, price, image_url FROM products ORDER BY id DESC`
          )
          .all() as Array<{
          id: number;
          internal_code: string;
          name: string;
          stock: number;
          cost: number;
          price: number;
          image_url: string;
        }>;

        const mappedRows = sqliteProducts.map((product) => ({
          Id: product.id,
          Imagen: product.image_url,
          Codigo: product.internal_code,
          Unidad: product.name,
          TotalCantidad: product.stock,
          Costo: product.cost,
          Mayorista: product.price,
          PrecioUnidad: product.price,
          Activo: 1,
        }));

        const filteredRows = q
          ? mappedRows.filter((row) =>
              [row.Codigo, row.Unidad].some((value) => toText(value).toLowerCase().includes(q.toLowerCase()))
            )
          : mappedRows;

        if (limit > 0) {
          const paged = filteredRows.slice(offset, offset + limit);
          return res.json({
            items: paged,
            total: filteredRows.length,
            limit,
            offset,
          });
        }

        return res.json(filteredRows);
      }

      const conditions: string[] = [];
      if (activoColumn) {
        conditions.push(`[${activoColumn.name}] = 1`);
      }

      const searchColumns = [codigoProductoColumn, codigoBarrasColumn, nombreColumn, descripcionColumn].filter(
        (column): column is ProductosSchemaColumn => Boolean(column)
      );

      if (q && searchColumns.length > 0) {
        conditions.push(`(${searchColumns.map((column) => `[${column.name}] LIKE @search`).join(" OR ")})`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const orderBy = idColumn ? `ORDER BY [${idColumn.name}] DESC` : "ORDER BY (SELECT NULL)";

      if (limit > 0) {
        const countRequest = sqlPool.request();
        const listRequest = sqlPool.request();

        if (q) {
          countRequest.input("search", `%${q}%`);
          listRequest.input("search", `%${q}%`);
        }

        listRequest.input("offset", offset);
        listRequest.input("limit", limit);

        const countResult = await countRequest.query(`SELECT COUNT(1) AS total FROM ${ECOMMERCE_PRODUCTS_SQL} ${whereClause}`);
        const total = Number(countResult.recordset?.[0]?.total || 0);

        const listResult = await listRequest.query(
          `SELECT * FROM ${ECOMMERCE_PRODUCTS_SQL} ${whereClause} ${orderBy} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`
        );

        return res.json({
          items: listResult.recordset,
          total,
          limit,
          offset,
        });
      }

      const request = sqlPool.request();
      if (q) {
        request.input("search", `%${q}%`);
      }

      const result = await request.query(`SELECT * FROM ${ECOMMERCE_PRODUCTS_SQL} ${whereClause} ${orderBy}`);
      res.json(result.recordset);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "No se pudo consultar Productos en SQL Server." });
    }
  });

  app.get("/api/ecommerce/grupos", async (req, res) => {
    try {
      if (!sqlPool || !grupoColumn) {
        return res.json({ items: [] });
      }

      const conditions: string[] = [];
      if (activoColumn) {
        conditions.push(`[${activoColumn.name}] = 1`);
      }

      conditions.push(`[${grupoColumn.name}] IS NOT NULL`);
      conditions.push(`LTRIM(RTRIM(CONVERT(NVARCHAR(255), [${grupoColumn.name}]))) <> ''`);

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const result = await sqlPool.request().query(`
        SELECT
          CONVERT(NVARCHAR(255), [${grupoColumn.name}]) AS grupo,
          COUNT(1) AS total
        FROM ${ECOMMERCE_PRODUCTS_SQL}
        ${whereClause}
        GROUP BY CONVERT(NVARCHAR(255), [${grupoColumn.name}])
        ORDER BY
          CASE WHEN TRY_CONVERT(INT, CONVERT(NVARCHAR(255), [${grupoColumn.name}])) IS NULL THEN 1 ELSE 0 END,
          TRY_CONVERT(INT, CONVERT(NVARCHAR(255), [${grupoColumn.name}])),
          CONVERT(NVARCHAR(255), [${grupoColumn.name}]);
      `);

      return res.json({
        items: (result.recordset || []).map((row: any) => ({
          grupo: toText(row?.grupo),
          total: toNumber(row?.total, 0),
        })),
      });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "No se pudo consultar grupos." });
    }
  });

  app.post("/api/ecommerce/import-verification", upload.any(), async (req, res) => {
    if (!sqlPool) {
      return res.status(503).json({ error: "SQL Server no disponible para verificación de importación." });
    }

    const uploadedFile = getUploadedFile(req);
    if (!uploadedFile) {
      return res.status(400).json({ error: "Debes adjuntar un archivo Excel/CSV en form-data (tipo File)." });
    }

    try {
      const { headerColumns } = parseUploadSheet(uploadedFile.buffer);
      const rowsByHeader = parseUploadRowsByHeaders(uploadedFile.buffer);

      const mappings = headerColumns.map((header) => {
        const target = resolveTargetColumn(header.normalized, columnsByNormalized);
        return {
          header: header.raw,
          header_normalized: header.normalized,
          mapped: Boolean(target),
          target_column: target?.name || null,
          target_data_type: target?.dataType || null,
        };
      });

      const mapped = mappings.filter((item) => item.mapped);
      const unmapped = mappings.filter((item) => !item.mapped);

      res.json({
        success: true,
        rows_detected: rowsByHeader.length,
        headers_detected: headerColumns.length,
        import_key_column: importKeyColumn?.name || null,
        rules: {
          id: idColumn?.name ? `${idColumn.name} autoincrementable (no se inserta manualmente)` : "No detectado",
          activo: activoColumn?.name ? `${activoColumn.name} = 1 en cada fila` : "No detectado",
          fecha_registro: fechaRegistroColumn?.name ? `${fechaRegistroColumn.name} = fecha/hora de carga` : "No detectado",
        },
        mapped_columns: mapped,
        unmapped_columns: unmapped,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message || "No se pudo verificar el archivo." });
    }
  });

  app.post("/api/ecommerce/import-excel", upload.any(), async (req, res) => {
    if (!sqlPool) {
      return res.status(503).json({ error: "SQL Server no disponible para importación." });
    }

    const uploadedFile = getUploadedFile(req);
    if (!uploadedFile) {
      return res.status(400).json({ error: "Debes adjuntar un archivo Excel/CSV en form-data (tipo File)." });
    }

    try {
      const rowsByHeader = parseUploadRowsByHeaders(uploadedFile.buffer);
      if (rowsByHeader.length === 0) {
        return res.status(400).json({ error: "No se encontraron filas válidas en el archivo." });
      }

      const sqlTransaction = new sql.Transaction(sqlPool);
      await sqlTransaction.begin();

      let importedCount = 0;

      try {
        for (let rowIndex = 0; rowIndex < rowsByHeader.length; rowIndex++) {
          const row = rowsByHeader[rowIndex];
          const valuesByColumn = new Map<string, any>();

          for (const [headerNormalized, rawValue] of Object.entries(row)) {
            const column = resolveTargetColumn(headerNormalized, columnsByNormalized);
            if (!column || column.isIdentity) continue;

            const parsedValue = toSqlColumnValue(rawValue, column);
            if (parsedValue !== undefined) {
              valuesByColumn.set(column.name, parsedValue);
            }
          }

          if (activoColumn) {
            valuesByColumn.set(activoColumn.name, 1);
          }

          if (fechaRegistroColumn) {
            valuesByColumn.set(fechaRegistroColumn.name, new Date());
          }

          if (importKeyColumn) {
            let keyValue = valuesByColumn.get(importKeyColumn.name);
            if (keyValue === null || keyValue === undefined || toText(keyValue) === "") {
              keyValue =
                toText(row["codigodebarra"]) ||
                toText(row["codigodeproducto"]) ||
                toText(row["codigo"]);

              if (keyValue) {
                valuesByColumn.set(importKeyColumn.name, keyValue);
              }
            }
          }

          if (codigoProductoColumn) {
            const currentCodigoProducto = valuesByColumn.get(codigoProductoColumn.name);
            if (currentCodigoProducto === null || currentCodigoProducto === undefined || toText(currentCodigoProducto) === "") {
              const fallbackCodigoProducto =
                toText(row["codigodeproducto"]) ||
                toText(row["codigodebarra"]) ||
                (codigoBarrasColumn ? toText(valuesByColumn.get(codigoBarrasColumn.name)) : "") ||
                (importKeyColumn ? toText(valuesByColumn.get(importKeyColumn.name)) : "");

              if (fallbackCodigoProducto) {
                valuesByColumn.set(codigoProductoColumn.name, fallbackCodigoProducto);
              }
            }

            const ensuredCodigoProducto = valuesByColumn.get(codigoProductoColumn.name);
            if (ensuredCodigoProducto === null || ensuredCodigoProducto === undefined || toText(ensuredCodigoProducto) === "") {
              valuesByColumn.set(codigoProductoColumn.name, `AUTO-PROD-${Date.now()}-${rowIndex + 1}`);
            }
          }

          if (nombreColumn) {
            const currentNombre = valuesByColumn.get(nombreColumn.name);
            if (currentNombre === null || currentNombre === undefined || toText(currentNombre) === "") {
              const fallbackNombre =
                toText(row["nombre"]) ||
                toText(row["codigodeproducto"]) ||
                (codigoProductoColumn ? toText(valuesByColumn.get(codigoProductoColumn.name)) : "") ||
                (codigoBarrasColumn ? toText(valuesByColumn.get(codigoBarrasColumn.name)) : "") ||
                `PRODUCTO-${rowIndex + 1}`;
              valuesByColumn.set(nombreColumn.name, fallbackNombre);
            }
          }

          if (descripcionColumn) {
            const currentDescripcion = valuesByColumn.get(descripcionColumn.name);
            if (currentDescripcion === null || currentDescripcion === undefined || toText(currentDescripcion) === "") {
              const fallbackDescripcion =
                toText(row["descripcion"]) ||
                toText(row["nombre"]) ||
                toText(row["codigodeproducto"]) ||
                [toText(row["empresa"]), toText(row["grupo"])].filter(Boolean).join(" - ") ||
                (codigoProductoColumn ? toText(valuesByColumn.get(codigoProductoColumn.name)) : "") ||
                `SIN DESCRIPCION ${rowIndex + 1}`;
              valuesByColumn.set(descripcionColumn.name, fallbackDescripcion);
            }
          }

          if (imagenColumn) {
            const currentImage = valuesByColumn.get(imagenColumn.name);
            if (currentImage === null || currentImage === undefined || toText(currentImage) === "") {
              const seedForImage =
                (nombreColumn ? toText(valuesByColumn.get(nombreColumn.name)) : "") ||
                (descripcionColumn ? toText(valuesByColumn.get(descripcionColumn.name)) : "") ||
                (codigoProductoColumn ? toText(valuesByColumn.get(codigoProductoColumn.name)) : "") ||
                (codigoBarrasColumn ? toText(valuesByColumn.get(codigoBarrasColumn.name)) : "") ||
                `producto-${rowIndex + 1}`;

              const generatedImage = buildGenericImageUrl(seedForImage);
              const safeGeneratedImage = toSqlColumnValue(generatedImage, imagenColumn);
              valuesByColumn.set(imagenColumn.name, safeGeneratedImage);
            }
          }

          if (importKeyColumn) {
            const ensuredImportKey = valuesByColumn.get(importKeyColumn.name);
            if (ensuredImportKey === null || ensuredImportKey === undefined || toText(ensuredImportKey) === "") {
              const fallbackImportKey =
                (codigoProductoColumn ? toText(valuesByColumn.get(codigoProductoColumn.name)) : "") ||
                toText(row["codigodebarra"]) ||
                `AUTO-KEY-${Date.now()}-${rowIndex + 1}`;
              valuesByColumn.set(importKeyColumn.name, fallbackImportKey);
            }
          }

          for (const schemaColumn of productosSchemaColumns) {
            if (schemaColumn.isIdentity) continue;
            if (schemaColumn.isNullable) continue;
            if (schemaColumn.hasDefault) continue;

            const currentValue = valuesByColumn.get(schemaColumn.name);
            const needsFallback =
              !valuesByColumn.has(schemaColumn.name) ||
              currentValue === null ||
              currentValue === undefined ||
              toText(currentValue) === "";

            if (!needsFallback) continue;

            const fallbackValue = getRequiredFallbackValue(schemaColumn);
            if (fallbackValue !== null && fallbackValue !== undefined) {
              valuesByColumn.set(schemaColumn.name, fallbackValue);
            }
          }

          const insertEntries = Array.from(valuesByColumn.entries()).filter(([columnName, value]) => {
            const column = productosSchemaColumns.find((col) => col.name === columnName);
            if (!column || column.isIdentity) return false;
            return value !== undefined;
          });

          if (insertEntries.length === 0) continue;

          const request = new sql.Request(sqlTransaction);

          insertEntries.forEach(([columnName, value], index) => {
            request.input(`p${index}`, value);
          });

          if (importKeyColumn) {
            const keyEntry = insertEntries.find(([columnName]) => columnName === importKeyColumn.name);
            const keyValue = keyEntry ? keyEntry[1] : null;

            if (keyValue !== null && keyValue !== undefined && toText(keyValue) !== "") {
              request.input("importKey", keyValue);

              const updateEntries = insertEntries.filter(([columnName]) => columnName !== importKeyColumn.name);
              const updateSetClause = updateEntries
                .map(([columnName], index) => `[${columnName}] = @p${insertEntries.findIndex(([insertName]) => insertName === columnName)}`)
                .join(",\n                ");

              const insertColumnsClause = insertEntries.map(([columnName]) => `[${columnName}]`).join(", ");
              const insertValuesClause = insertEntries.map((_, index) => `@p${index}`).join(", ");

              if (updateEntries.length > 0) {
                await request.query(`
                  IF EXISTS (SELECT 1 FROM ${ECOMMERCE_PRODUCTS_SQL} WHERE [${importKeyColumn.name}] = @importKey)
                  BEGIN
                    UPDATE ${ECOMMERCE_PRODUCTS_SQL}
                    SET
                      ${updateSetClause}
                    WHERE [${importKeyColumn.name}] = @importKey;
                  END
                  ELSE
                  BEGIN
                    INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
                    VALUES (${insertValuesClause});
                  END
                `);
              } else {
                await request.query(`
                  IF NOT EXISTS (SELECT 1 FROM ${ECOMMERCE_PRODUCTS_SQL} WHERE [${importKeyColumn.name}] = @importKey)
                  BEGIN
                    INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
                    VALUES (${insertValuesClause});
                  END
                `);
              }

              importedCount += 1;
              continue;
            }
          }

          const insertColumnsClause = insertEntries.map(([columnName]) => `[${columnName}]`).join(", ");
          const insertValuesClause = insertEntries.map((_, index) => `@p${index}`).join(", ");

          await request.query(`
            INSERT INTO ${ECOMMERCE_PRODUCTS_SQL} (${insertColumnsClause})
            VALUES (${insertValuesClause});
          `);
          importedCount += 1;
        }

        await sqlTransaction.commit();
      } catch (sqlError) {
        await sqlTransaction.rollback();
        throw sqlError;
      }

      const items = parseContainerExcel(uploadedFile.buffer);

      const insertLegacyProducts = db.prepare(`
        INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url)
        VALUES (?, ?, 1, ?, ?, ?, 1, 1, ?)
        ON CONFLICT(internal_code) DO UPDATE SET
          name = excluded.name,
          price = excluded.price,
          cost = excluded.cost,
          stock = excluded.stock,
          image_url = excluded.image_url
      `);

      const legacyTransaction = db.transaction((excelItems: typeof items) => {
        for (const item of excelItems) {
          const imageUrl = item.imagen || `https://picsum.photos/seed/${encodeURIComponent(item.codigo)}/400/400`;
          insertLegacyProducts.run(
            item.codigo,
            item.nombre,
            item.precio_unidad,
            item.costo,
            item.total_cantidad,
            imageUrl
          );
        }
      });

      legacyTransaction(items);

      res.json({ success: true, imported: importedCount, message: "Archivo importado correctamente" });
    } catch (e: any) {
      if (e?.name === "MulterError" && e?.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "El archivo excede el tamaño máximo permitido (300MB)." });
      }
      res.status(400).json({ error: e.message || "No se pudo procesar el archivo Excel." });
    }
  });

  // --- API Routes ---

  // Public Products (No Auth)
  app.get("/api/public/products", async (req, res) => {
    try {
      if (!sqlPool) {
        const products = db
          .prepare(
            `SELECT p.id, p.internal_code, p.name, p.price, p.cost, p.stock, p.image_url, c.name as category_name
             FROM products p
             LEFT JOIN categories c ON p.category_id = c.id
             ORDER BY p.id DESC`
          )
          .all();

        return res.json(products);
      }

      const activeFilter = activoColumn ? `WHERE [${activoColumn.name}] = 1` : "";
      const result = await sqlPool.request().query(`SELECT * FROM ${ECOMMERCE_PRODUCTS_SQL} ${activeFilter}`);

      const products = (result.recordset as Array<Record<string, any>>)
        .map((row, index) => {
          const codbarras =
            toText(readValueFromRow(row, ["codbarras", "codigo_barras", "codbarra"])) ||
            toText(readValueFromRow(row, ["codigoproduc", "codigoproducto", "codigo"])) ||
            `SIN-CODIGO-${index + 1}`;

          const nombre =
            toText(readValueFromRow(row, ["nombre", "nombre_corto", "nombrecorto"])) ||
            toText(readValueFromRow(row, ["descripcion", "detalle"])) ||
            codbarras;

          const descripcion =
            toText(readValueFromRow(row, ["descripcion", "detalle", "nombre"])) ||
            nombre;

          const imageValue = toText(readValueFromRow(row, ["imagen", "foto", "image_url", "imageurl"]));
          const stock = toNumber(readValueFromRow(row, ["stock", "cantidadstock", "totalcantidad", "total_cantidad"]), 0);
          const precioUnidad = toNumber(readValueFromRow(row, ["precio_unidad", "preciounidad", "unidad", "precio"]), 0);
          const precioMayorista = toNumber(
            readValueFromRow(row, ["precio_mayorista", "precio_mayor", "preciomayor", "mayorista", "mayor"]),
            0
          );
          const precioBulto = toNumber(readValueFromRow(row, ["precio_bulto", "preciobulto", "bulto"]), 0);
          const price = precioUnidad;
          const cost = toNumber(readValueFromRow(row, ["costo", "cost"]), 0);
          const grupo = toText(readValueFromRow(row, ["grupo", "categoria", "categorianombre"])) || "General";

          return {
            id: Number(readValueFromRow(row, ["id"])) || index + 1,
            internal_code: codbarras,
            name: nombre,
            category_id: 1,
            category_name: grupo,
            price,
            cost,
            stock,
            container_id: 1,
            warehouse_id: 1,
            image_url: imageValue || buildGenericImageUrl(nombre || codbarras),
            codbarras,
            nombre,
            descripcion,
            grupo,
            precio_bulto: precioBulto,
            precio_mayorista: precioMayorista,
            precio_unidad: precioUnidad,
          };
        })
        .filter((product) => product.stock > 0);

      res.json(products);
    } catch (error: any) {
      res.status(500).json({ error: error?.message || "No se pudo obtener productos públicos." });
    }
  });

  // Auth
  app.post("/api/login", (req, res) => {
    const { username, password } = req.body;
    const user = db.prepare("SELECT id, username, role, full_name FROM users WHERE username = ? AND password = ?").get(username, password);
    if (user) {
      logAudit(user.id as number, "LOGIN", "users", "Inicio de sesión exitoso");
      res.json(user);
    } else {
      res.status(401).json({ error: "Credenciales inválidas" });
    }
  });

  app.post("/api/public/register", (req, res) => {
    const { full_name, email, password } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({ error: "Datos de usuario incompletos" });
    }

    const existingUser = db.prepare("SELECT id FROM users WHERE username = ?").get(email);
    if (existingUser) {
      const user = db.prepare("SELECT id, username, role, full_name FROM users WHERE username = ?").get(email);
      return res.json(user);
    }

    try {
      const result = db
        .prepare("INSERT INTO users (username, password, role, full_name) VALUES (?, ?, ?, ?)")
        .run(email, password, "tienda", full_name);

      const user = db
        .prepare("SELECT id, username, role, full_name FROM users WHERE id = ?")
        .get(result.lastInsertRowid);

      logAudit(user?.id as number, "REGISTER", "users", `Registro público: ${email}`);
      res.json(user);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Dashboard Stats
  app.get("/api/stats", (req, res) => {
    const totalStock = db.prepare("SELECT SUM(stock) as total FROM products").get() as { total: number };
    const lowStock = db.prepare("SELECT COUNT(*) as count FROM products WHERE stock < 20").get() as { count: number };
    const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pendiente'").get() as { count: number };
    const paidOrders = db.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'pagado'").get() as { count: number };
    const recentProducts = db.prepare("SELECT * FROM products ORDER BY id DESC LIMIT 5").all();
    
    res.json({
      totalStock: totalStock.total || 0,
      lowStock: lowStock.count,
      pendingOrders: pendingOrders.count,
      paidOrders: paidOrders.count,
      recentProducts
    });
  });

  // Inventory
  app.get("/api/products", (req, res) => {
    const products = db.prepare(`
      SELECT p.*, c.name as category_name, cont.code as container_code, w.name as warehouse_name
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN containers cont ON p.container_id = cont.id
      LEFT JOIN warehouses w ON p.warehouse_id = w.id
    `).all();
    res.json(products);
  });

  app.post("/api/products", (req, res) => {
    const { internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url } = req.body;
    try {
      const result = db.prepare(`
        INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url);
      res.json({ id: result.lastInsertRowid });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Orders
  app.get("/api/orders", async (req, res) => {
    const orders = db.prepare(`
      SELECT o.*, u.full_name as user_name,
             s.tracking_code as shipping_guide,
             s.status as shipment_status
      FROM orders o
      JOIN users u ON o.user_id = u.id
      LEFT JOIN shipments s ON s.order_id = o.id
      ORDER BY o.id DESC
    `).all();

    if (!sqlPool) {
      return res.json(orders);
    }

    try {
      const sqlTrackingResult = await sqlPool.request().query(`
        SELECT order_id, order_number, tracking_code, shipment_status
        FROM dbo.vw_order_logistics_tracking
      `);

      const trackingMap = new Map<string, { tracking_code: string | null; shipment_status: string | null }>();
      for (const row of sqlTrackingResult.recordset as Array<any>) {
        const key = String(row.order_number || row.order_id || "");
        if (!key) continue;
        trackingMap.set(key, {
          tracking_code: row.tracking_code ?? null,
          shipment_status: row.shipment_status ?? null,
        });
      }

      const merged = (orders as Array<any>).map((order) => {
        const tracking = trackingMap.get(String(order.order_number || order.id));
        if (!tracking) return order;
        return {
          ...order,
          shipping_guide: tracking.tracking_code || order.shipping_guide || null,
          shipment_status: tracking.shipment_status || order.shipment_status || "sin_guia",
        };
      });

      return res.json(merged);
    } catch (sqlReadError) {
      console.error("No se pudo leer tracking desde SQL Server para /api/orders:", sqlReadError);
      return res.json(orders);
    }
  });

  app.get("/api/orders/:id", (req, res) => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(req.params.id);
    const shipment = db.prepare("SELECT * FROM shipments WHERE order_id = ?").get(req.params.id);
    const details = db.prepare(`
      SELECT od.*, p.name as product_name, p.internal_code
      FROM order_details od
      JOIN products p ON od.product_id = p.id
      WHERE od.order_id = ?
    `).all(req.params.id);
    const events = shipment
      ? db.prepare("SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY id ASC").all((shipment as any).id)
      : [];
    res.json({ ...order, details, shipment, shipment_events: events });
  });

  app.get("/api/orders/:id/logistics", async (req, res) => {
    const orderId = Number(req.params.id);
    const orderData = db.prepare("SELECT id, order_number FROM orders WHERE id = ?").get(orderId) as
      | { id: number; order_number: string }
      | undefined;
    const orderNumber = orderData?.order_number || null;
    const shipment = db.prepare("SELECT * FROM shipments WHERE order_id = ?").get(orderId);
    const payment = db
      .prepare("SELECT * FROM payment_transactions WHERE order_id = ? ORDER BY id DESC LIMIT 1")
      .get(orderId);
    const events = shipment
      ? db.prepare("SELECT * FROM shipment_events WHERE shipment_id = ? ORDER BY id ASC").all((shipment as any).id)
      : [];

    if (!sqlPool) {
      return res.json({ shipment, payment_transaction: payment, events });
    }

    try {
      const sqlTracking = await sqlPool
        .request()
        .input("order_id", sql.Int, orderId)
        .input("order_number", sql.NVarChar(80), orderNumber)
        .query(`
          SELECT TOP 1 *
          FROM dbo.vw_order_logistics_tracking
          WHERE (order_number IS NOT NULL AND order_number = @order_number)
             OR (order_number IS NULL AND order_id = @order_id)
          ORDER BY shipment_created_at DESC
        `);

      const sqlShipment = await sqlPool
        .request()
        .input("order_id", sql.Int, orderId)
        .input("order_number", sql.NVarChar(80), orderNumber)
        .query(`
          SELECT TOP 1 *
          FROM dbo.shipments
          WHERE (order_number IS NOT NULL AND order_number = @order_number)
             OR (order_number IS NULL AND order_id = @order_id)
          ORDER BY id DESC
        `);

      const sqlPayment = await sqlPool
        .request()
        .input("order_id", sql.Int, orderId)
        .input("order_number", sql.NVarChar(80), orderNumber)
        .query(`
          SELECT TOP 1 *
          FROM dbo.payment_transactions
          WHERE (order_number IS NOT NULL AND order_number = @order_number)
             OR (order_number IS NULL AND order_id = @order_id)
          ORDER BY id DESC
        `);

      const sqlShipmentId = sqlShipment.recordset?.[0]?.id;
      const sqlEvents = sqlShipmentId
        ? await sqlPool
            .request()
            .input("shipment_id", sql.Int, Number(sqlShipmentId))
            .query(`
              SELECT *
              FROM dbo.shipment_events
              WHERE shipment_id = @shipment_id
              ORDER BY id ASC
            `)
        : { recordset: [] as Array<any> };

      return res.json({
        shipment: sqlShipment.recordset?.[0] || shipment || null,
        payment_transaction: sqlPayment.recordset?.[0] || payment || null,
        events: sqlEvents.recordset || events,
        tracking_view: sqlTracking.recordset?.[0] || null,
      });
    } catch (sqlReadError) {
      console.error("No se pudo leer logistics desde SQL Server para /api/orders/:id/logistics:", sqlReadError);
      return res.json({ shipment, payment_transaction: payment, events });
    }
  });

  app.post("/api/orders", (req, res) => {
    const { user_id, items, total } = req.body;
    const orderNumber = `ORD-${Date.now()}`;
    const date = new Date().toISOString();

    ensureOrderDetailsTable();

    const transaction = db.transaction(() => {
      const orderResult = db.prepare(`
        INSERT INTO orders (order_number, user_id, order_date, total, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(orderNumber, user_id, date, total, 'pendiente');

      const orderId = orderResult.lastInsertRowid;

      for (const item of items) {
        db.prepare(`
          INSERT INTO order_details (order_id, product_id, quantity, unit_price, subtotal)
          VALUES (?, ?, ?, ?, ?)
        `).run(orderId, item.id, item.quantity, item.price, item.price * item.quantity);

        // Update Stock
        db.prepare("UPDATE products SET stock = stock - ? WHERE id = ?").run(item.quantity, item.id);
      }

      return orderId;
    });

    try {
      const orderId = transaction();
      res.json({ id: orderId, orderNumber });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch("/api/orders/:id/status", (req, res) => {
    const { status } = req.body;
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.id);
    res.json({ success: true });
  });

  // Containers & Categories
  app.get("/api/containers", (req, res) => res.json(db.prepare("SELECT * FROM containers").all()));
  app.get("/api/categories", (req, res) => res.json(db.prepare("SELECT * FROM categories").all()));
  app.get("/api/warehouses", (req, res) => res.json(db.prepare("SELECT * FROM warehouses").all()));

  app.post("/api/products/bulk", (req, res) => {
    const products = req.body;
    const insert = db.prepare(`
      INSERT INTO products (internal_code, name, category_id, price, cost, stock, container_id, warehouse_id, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = db.transaction((items) => {
      for (const item of items) {
        // Find or create category/container/warehouse if they were strings in excel
        // For simplicity in this demo, we assume IDs are provided or we map them
        // In a real app, we'd look up by name
        insert.run(
          item.internal_code,
          item.name,
          item.category_id || 1,
          item.price,
          item.cost,
          item.stock,
          item.container_id || 1,
          item.warehouse_id || 1,
          item.image_url || "https://picsum.photos/seed/new/400/400"
        );
      }
    });

    try {
      transaction(products);
      res.json({ success: true, count: products.length });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // --- Urbano & Payment Integration ---

  const URBANO_CONFIG = {
    user: process.env.URBANO_USER || "1010-WebService",
    pass: process.env.URBANO_PASS || "1qasw27ygfsdernh",
    id_contrato: process.env.URBANO_CONTRATO || "4661",
    id_orden: process.env.URBANO_ID_ORDEN || "4661",
    linea: process.env.URBANO_LINEA || "3",
    origen_ubigeo: process.env.URBANO_ORIGEN_UBIGEO || "",
    api_key: process.env.URBANO_API_KEY || "GYWym2dyaGQssZ5bxSAhExF1sMUb8aLluVrG2gufPF50tS64hBgkz0ofVtdcdLc8",
    base_preprod: process.env.URBANO_BASE_PREPROD || "https://devpyp.urbano.com.ec",
    base_prod: process.env.URBANO_BASE_PROD || "https://app.urbano.com.ec",
    print_use_prod: process.env.URBANO_PRINT_USE_PROD === "true",
  };

  type UrbanoService = "generateGuide" | "tracking" | "printGuide" | "quote" | "cancelGuide";

  const urbanoPathMap: Record<UrbanoService, string> = {
    generateGuide: "/ws/ue/ge/",
    tracking: "/ws/ue/tracking/",
    printGuide: "/ws/ue/imprimirge/",
    quote: "/ws/ue/cotizarenvio/",
    cancelGuide: "/ws/ue/cancela_ge/",
  };

  const getUrbanoBaseUrl = (service: UrbanoService) => {
    if (service === "printGuide" && URBANO_CONFIG.print_use_prod) {
      return URBANO_CONFIG.base_prod;
    }
    return URBANO_CONFIG.base_preprod;
  };

  const getUrbanoUrl = (service: UrbanoService) => `${getUrbanoBaseUrl(service)}${urbanoPathMap[service]}`;

  const toObjectPayload = (value: unknown) => {
    if (value && typeof value === "object") return value as Record<string, any>;
    return {};
  };

  const parseJsonSafe = (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const extractUrbanoGuide = (payload: any): string | null => {
    if (!payload) return null;

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = extractUrbanoGuide(item);
        if (found) return found;
      }
      return null;
    }

    if (typeof payload !== "object") return null;

    const candidates = [
      payload["guía"],
      payload["guia"],
      payload["tracking"],
      payload["tracking_code"],
      payload["cod_rastreo"],
      payload["codigo_rastreo"],
      payload["nro_guia"],
      payload["numero_guia"],
    ];

    const firstValid = candidates.find((item) => item !== null && item !== undefined && String(item).trim() !== "");
    return firstValid ? String(firstValid).trim() : null;
  };

  const isUrbanoPayloadError = (payload: any): boolean => {
    const current = Array.isArray(payload) ? payload[0] : payload;
    if (!current || typeof current !== "object") return false;

    const numericError = Number(current.error ?? current.error_sql);
    if (Number.isFinite(numericError) && numericError < 0) return true;

    const message = String(current.mensaje ?? current.error_info ?? "").toLowerCase();
    if (message.includes("json") && (message.includes("vacia") || message.includes("vac\u00eda"))) {
      return true;
    }

    return false;
  };

  const callUrbano = async (service: UrbanoService, payload: Record<string, any>) => {
    const url = getUrbanoUrl(service);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": URBANO_CONFIG.api_key,
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    const json = parseJsonSafe(raw);
    let data = json ?? raw;
    const rawLower = String(raw || "").toLowerCase();
    const hasEmptyJsonErrorText = rawLower.includes("json") && (rawLower.includes("vacia") || rawLower.includes("vacía"));
    let ok = response.ok && !isUrbanoPayloadError(data) && !hasEmptyJsonErrorText;
    let status = response.status;

    const requiresFormFallback =
      typeof payload.json === "string" && payload.json.trim() !== "" && (isUrbanoPayloadError(data) || hasEmptyJsonErrorText);

    if (requiresFormFallback) {
      const form = new URLSearchParams();
      form.set("json", String(payload.json));

      const fallbackResponse = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "x-api-key": URBANO_CONFIG.api_key,
        },
        body: form.toString(),
      });

      const fallbackRaw = await fallbackResponse.text();
      const fallbackJson = parseJsonSafe(fallbackRaw);
      data = fallbackJson ?? fallbackRaw;
      ok = fallbackResponse.ok && !isUrbanoPayloadError(data);
      status = fallbackResponse.status;
    }

    return {
      ok,
      status,
      url,
      raw,
      data,
    };
  };

  // Cotizar Envío (Urbano)
  app.post("/api/shipping/quote", async (req, res) => {
    try {
      const input = toObjectPayload(req.body);
      const hasRawJson = typeof input.json === "string" && input.json.trim() !== "";
      const payload = hasRawJson
        ? input
        : {
            json: JSON.stringify({
              user: URBANO_CONFIG.user,
              pass: URBANO_CONFIG.pass,
              linea: URBANO_CONFIG.linea,
              id_contrato: URBANO_CONFIG.id_contrato,
              id_orden: URBANO_CONFIG.id_orden,
              ubi_origen: URBANO_CONFIG.origen_ubigeo,
              ubi_direc: input.destination_ubigeo || input.ubigeo || "",
              peso_total: input.weight || 0,
              pieza_total: input.pieces || 1,
            }),
          };

      const urbanoResponse = await callUrbano("quote", payload);

      if (!urbanoResponse.ok) {
        const errorStatus = urbanoResponse.status >= 400 ? urbanoResponse.status : 502;
        return res.status(errorStatus).json({
          error: "Error al cotizar envío con Urbano.",
          urbano_status: urbanoResponse.status,
          urbano_response: urbanoResponse.data,
        });
      }

      return res.json(urbanoResponse.data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "No se pudo cotizar con Urbano." });
    }
  });

  app.post("/api/shipping/tracking", async (req, res) => {
    try {
      const input = toObjectPayload(req.body);
      const payload =
        typeof input.json === "string" && input.json.trim() !== ""
          ? input
          : {
              json: JSON.stringify({
                user: URBANO_CONFIG.user,
                pass: URBANO_CONFIG.pass,
                linea: URBANO_CONFIG.linea,
                id_contrato: URBANO_CONFIG.id_contrato,
                id_orden: URBANO_CONFIG.id_orden,
                ...input,
              }),
            };

      const urbanoResponse = await callUrbano("tracking", payload);
      if (!urbanoResponse.ok) {
        const errorStatus = urbanoResponse.status >= 400 ? urbanoResponse.status : 502;
        return res.status(errorStatus).json({
          error: "Error al consultar tracking con Urbano.",
          urbano_status: urbanoResponse.status,
          urbano_response: urbanoResponse.data,
        });
      }

      return res.json(urbanoResponse.data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "No se pudo consultar tracking en Urbano." });
    }
  });

  app.post("/api/shipping/print-guide", async (req, res) => {
    try {
      const input = toObjectPayload(req.body);
      const payload =
        typeof input.json === "string" && input.json.trim() !== ""
          ? input
          : {
              json: JSON.stringify({
                user: URBANO_CONFIG.user,
                pass: URBANO_CONFIG.pass,
                linea: URBANO_CONFIG.linea,
                id_contrato: URBANO_CONFIG.id_contrato,
                id_orden: URBANO_CONFIG.id_orden,
                ...input,
              }),
            };

      const urbanoResponse = await callUrbano("printGuide", payload);
      if (!urbanoResponse.ok) {
        const errorStatus = urbanoResponse.status >= 400 ? urbanoResponse.status : 502;
        return res.status(errorStatus).json({
          error: "Error al imprimir guía con Urbano.",
          urbano_status: urbanoResponse.status,
          urbano_response: urbanoResponse.data,
        });
      }

      return res.json(urbanoResponse.data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "No se pudo imprimir guía en Urbano." });
    }
  });

  app.post("/api/shipping/cancel-guide", async (req, res) => {
    try {
      const input = toObjectPayload(req.body);
      const payload =
        typeof input.json === "string" && input.json.trim() !== ""
          ? input
          : {
              json: JSON.stringify({
                user: URBANO_CONFIG.user,
                pass: URBANO_CONFIG.pass,
                linea: URBANO_CONFIG.linea,
                id_contrato: URBANO_CONFIG.id_contrato,
                id_orden: URBANO_CONFIG.id_orden,
                ...input,
              }),
            };

      const urbanoResponse = await callUrbano("cancelGuide", payload);
      if (!urbanoResponse.ok) {
        const errorStatus = urbanoResponse.status >= 400 ? urbanoResponse.status : 502;
        return res.status(errorStatus).json({
          error: "Error al cancelar guía con Urbano.",
          urbano_status: urbanoResponse.status,
          urbano_response: urbanoResponse.data,
        });
      }

      return res.json(urbanoResponse.data);
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || "No se pudo cancelar guía en Urbano." });
    }
  });

  // Confirm Payment & Generate Urbano Guide
  app.post("/api/checkout", async (req, res) => {
    const { order_id, order_number, shipping_data, payment_method, idempotency_key } = req.body;

    try {
      const order = (order_number
        ? db.prepare("SELECT id, order_number, total FROM orders WHERE order_number = ?").get(order_number)
        : db.prepare("SELECT id, order_number, total FROM orders WHERE id = ?").get(order_id)) as
        | { id: number; order_number: string; total: number }
        | undefined;

      if (!order) {
        return res.status(404).json({ error: "Orden no encontrada" });
      }

      const resolvedOrderId = Number(order.id);
      const resolvedOrderNumber = String(order.order_number);

      const normalizedIdempotencyKey =
        (typeof idempotency_key === "string" && idempotency_key.trim()) ||
        `checkout-${resolvedOrderNumber}-${String(Date.now())}`;

      const existingPayment = db
        .prepare(
          "SELECT * FROM payment_transactions WHERE order_number = ? AND idempotency_key = ? AND status = 'succeeded' LIMIT 1"
        )
        .get(resolvedOrderNumber, normalizedIdempotencyKey) as any;

      if (existingPayment) {
        const existingShipment = db.prepare("SELECT * FROM shipments WHERE order_number = ?").get(resolvedOrderNumber) as any;
        return res.json({
          success: true,
          idempotent: true,
          payment_status: existingPayment.status,
          payment_transaction_id: existingPayment.id,
          shipping_guide: existingShipment?.tracking_code || null,
          shipment_status: existingShipment?.status || "sin_guia",
          message: "Checkout ya procesado previamente para esta clave de idempotencia",
        });
      }

      const now = new Date().toISOString();
      const paymentRequestPayload = JSON.stringify({ order_id: resolvedOrderId, order_number: resolvedOrderNumber, payment_method, total: order.total });
      const paymentInsert = db
        .prepare(
          `INSERT INTO payment_transactions
           (order_id, order_number, idempotency_key, payment_method, provider, provider_transaction_id, amount, status, request_payload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resolvedOrderId,
          resolvedOrderNumber,
          normalizedIdempotencyKey,
          payment_method || "card",
          "mock-gateway",
          `pay_${Date.now()}`,
          order.total,
          "processing",
          paymentRequestPayload,
          now,
          now
        );

      const paymentTransactionId = Number(paymentInsert.lastInsertRowid);

      // 1. Simulate Payment Processing (replace with real gateway callback/webhook)
      db.prepare("UPDATE payment_transactions SET status = 'succeeded', response_payload = ?, updated_at = ? WHERE id = ?").run(
        JSON.stringify({ approved: true, provider: "mock-gateway" }),
        new Date().toISOString(),
        paymentTransactionId
      );

      // 2. Update Order Status to 'pagado'
      db.prepare("UPDATE orders SET status = 'pagado' WHERE id = ?").run(resolvedOrderId);

      // 3. Generar guía de Urbano (preproducción)
      const urbanoPayload = {
        "json": JSON.stringify({
          "user": URBANO_CONFIG.user,
          "pass": URBANO_CONFIG.pass,
          "linea": URBANO_CONFIG.linea,
          "id_contrato": URBANO_CONFIG.id_contrato,
          "id_orden": URBANO_CONFIG.id_orden,
          "cod_rastreo": `SINO-${resolvedOrderNumber}`,
          "nom_cliente": shipping_data.name,
          "dir_entrega": shipping_data.address,
          "ubi_direc": shipping_data.ubigeo, // 6 digit code
          "nro_telf": shipping_data.phone,
          "peso_total": shipping_data.weight,
          "pieza_total": shipping_data.pieces,
          "productos": shipping_data.items.map((item: any) => ({
            "cod_sku": item.internal_code,
            "descr_sku": item.name,
            "cantidad_sku": item.quantity
          }))
        })
      };

      const urbanoRequestPayload = JSON.stringify(urbanoPayload);
      const urbanoHttpResponse = await callUrbano("generateGuide", urbanoPayload);
      const urbanoResponsePayload = urbanoHttpResponse.data;

      if (!urbanoHttpResponse.ok) {
        db.prepare(
          `INSERT INTO ws_logs
           (order_id, order_number, service, endpoint, request_payload, response_payload, status_code, success, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          resolvedOrderId,
          resolvedOrderNumber,
          "urbano",
          urbanoPathMap.generateGuide,
          urbanoRequestPayload,
          JSON.stringify(urbanoResponsePayload),
          Number(urbanoHttpResponse.status || 0),
          0,
          new Date().toISOString()
        );

        return res.status(502).json({
          error: "Urbano no generó la guía.",
          urbano_status: urbanoHttpResponse.status,
          urbano_response: urbanoResponsePayload,
        });
      }

      const shippingGuide = extractUrbanoGuide(urbanoResponsePayload) || `SINO-${resolvedOrderNumber}`;

      const wsLogInsert = db
        .prepare(
          `INSERT INTO ws_logs
           (order_id, order_number, service, endpoint, request_payload, status_code, success, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          resolvedOrderId,
          resolvedOrderNumber,
          "urbano",
          urbanoPathMap.generateGuide,
          urbanoRequestPayload,
          Number(urbanoHttpResponse.status || 0),
          1,
          new Date().toISOString()
        );

      const shipmentInsert = db
        .prepare(
          `INSERT INTO shipments
           (order_id, order_number, provider, service_id, service_name, tracking_code, status, destination_ubigeo, destination_address, receiver_name, receiver_phone, quote_total, provider_payload, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(order_id) DO UPDATE SET
             order_id = excluded.order_id,
             order_number = excluded.order_number,
             provider = excluded.provider,
             service_id = excluded.service_id,
             service_name = excluded.service_name,
             tracking_code = excluded.tracking_code,
             status = excluded.status,
             destination_ubigeo = excluded.destination_ubigeo,
             destination_address = excluded.destination_address,
             receiver_name = excluded.receiver_name,
             receiver_phone = excluded.receiver_phone,
             quote_total = excluded.quote_total,
             provider_payload = excluded.provider_payload,
             updated_at = excluded.updated_at`
        )
        .run(
          resolvedOrderId,
          resolvedOrderNumber,
          "urbano",
          "1",
          "Distribucion",
          shippingGuide,
          "guia_generada",
          shipping_data?.ubigeo || "",
          shipping_data?.address || "",
          shipping_data?.name || "",
          shipping_data?.phone || "",
          0,
          JSON.stringify(urbanoResponsePayload),
          new Date().toISOString(),
          new Date().toISOString()
        );

      const shipment = db.prepare("SELECT * FROM shipments WHERE order_number = ?").get(resolvedOrderNumber) as any;

      if (shipment?.id) {
        db.prepare(
          `INSERT INTO shipment_events (shipment_id, status, description, source, payload, event_time)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          shipment.id,
          "guia_generada",
          `Guia ${shippingGuide} generada correctamente`,
          "backend",
          JSON.stringify(urbanoResponsePayload),
          new Date().toISOString()
        );
      }

      db.prepare("UPDATE ws_logs SET response_payload = ?, status_code = ?, success = ?, created_at = created_at WHERE id = ?").run(
        JSON.stringify(urbanoResponsePayload),
        Number(urbanoHttpResponse.status || 200),
        1,
        Number(wsLogInsert.lastInsertRowid)
      );

      // 4. Sync operational records to SQL Server E-COMERCE when available.
      if (sqlPool) {
        try {
          const sqlNow = new Date().toISOString();
          const sqlPaymentRequest = sqlPool.request();
          sqlPaymentRequest.input("order_id", sql.Int, Number(resolvedOrderId));
          sqlPaymentRequest.input("order_number", sql.NVarChar(80), resolvedOrderNumber);
          sqlPaymentRequest.input("idempotency_key", sql.NVarChar(120), normalizedIdempotencyKey);
          sqlPaymentRequest.input("payment_method", sql.NVarChar(30), payment_method || "card");
          sqlPaymentRequest.input("provider", sql.NVarChar(60), "mock-gateway");
          sqlPaymentRequest.input("provider_transaction_id", sql.NVarChar(120), `pay_${Date.now()}`);
          sqlPaymentRequest.input("amount", sql.Decimal(18, 2), Number(order.total || 0));
          sqlPaymentRequest.input("status", sql.NVarChar(30), "succeeded");
          sqlPaymentRequest.input("request_payload", sql.NVarChar(sql.MAX), paymentRequestPayload);
          sqlPaymentRequest.input(
            "response_payload",
            sql.NVarChar(sql.MAX),
            JSON.stringify({ approved: true, provider: "mock-gateway" })
          );
          sqlPaymentRequest.input("created_at", sql.DateTime2, new Date(sqlNow));
          sqlPaymentRequest.input("updated_at", sql.DateTime2, new Date(sqlNow));

          await sqlPaymentRequest.query(`
            IF EXISTS (SELECT 1 FROM dbo.payment_transactions WHERE idempotency_key = @idempotency_key)
            BEGIN
              UPDATE dbo.payment_transactions
              SET
                order_id = @order_id,
                order_number = @order_number,
                payment_method = @payment_method,
                provider = @provider,
                provider_transaction_id = @provider_transaction_id,
                amount = @amount,
                status = @status,
                request_payload = @request_payload,
                response_payload = @response_payload,
                updated_at = @updated_at
              WHERE idempotency_key = @idempotency_key;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.payment_transactions
                (order_id, order_number, idempotency_key, payment_method, provider, provider_transaction_id, amount, status, request_payload, response_payload, created_at, updated_at)
              VALUES
                (@order_id, @order_number, @idempotency_key, @payment_method, @provider, @provider_transaction_id, @amount, @status, @request_payload, @response_payload, @created_at, @updated_at);
            END
          `);

          const sqlShipmentRequest = sqlPool.request();
          sqlShipmentRequest.input("order_id", sql.Int, Number(resolvedOrderId));
          sqlShipmentRequest.input("order_number", sql.NVarChar(80), resolvedOrderNumber);
          sqlShipmentRequest.input("provider", sql.NVarChar(60), "urbano");
          sqlShipmentRequest.input("service_id", sql.NVarChar(30), "1");
          sqlShipmentRequest.input("service_name", sql.NVarChar(120), "Distribucion");
          sqlShipmentRequest.input("tracking_code", sql.NVarChar(120), shippingGuide);
          sqlShipmentRequest.input("shipment_status", sql.NVarChar(30), "guia_generada");
          sqlShipmentRequest.input("destination_ubigeo", sql.NVarChar(20), shipping_data?.ubigeo || "");
          sqlShipmentRequest.input("destination_address", sql.NVarChar(250), shipping_data?.address || "");
          sqlShipmentRequest.input("receiver_name", sql.NVarChar(120), shipping_data?.name || "");
          sqlShipmentRequest.input("receiver_phone", sql.NVarChar(30), shipping_data?.phone || "");
          sqlShipmentRequest.input("quote_total", sql.Decimal(18, 2), 0);
          sqlShipmentRequest.input("provider_payload", sql.NVarChar(sql.MAX), JSON.stringify(urbanoResponsePayload));
          sqlShipmentRequest.input("created_at", sql.DateTime2, new Date(sqlNow));
          sqlShipmentRequest.input("updated_at", sql.DateTime2, new Date(sqlNow));

          await sqlShipmentRequest.query(`
            IF EXISTS (SELECT 1 FROM dbo.shipments WHERE order_number = @order_number)
            BEGIN
              UPDATE dbo.shipments
              SET
                order_id = @order_id,
                provider = @provider,
                service_id = @service_id,
                service_name = @service_name,
                tracking_code = @tracking_code,
                status = @shipment_status,
                destination_ubigeo = @destination_ubigeo,
                destination_address = @destination_address,
                receiver_name = @receiver_name,
                receiver_phone = @receiver_phone,
                quote_total = @quote_total,
                provider_payload = @provider_payload,
                updated_at = @updated_at
              WHERE order_number = @order_number;
            END
            ELSE
            BEGIN
              INSERT INTO dbo.shipments
                (order_id, order_number, provider, service_id, service_name, tracking_code, status, destination_ubigeo, destination_address, receiver_name, receiver_phone, quote_total, provider_payload, created_at, updated_at)
              VALUES
                (@order_id, @order_number, @provider, @service_id, @service_name, @tracking_code, @shipment_status, @destination_ubigeo, @destination_address, @receiver_name, @receiver_phone, @quote_total, @provider_payload, @created_at, @updated_at);
            END
          `);

          const shipmentLookup = await sqlPool
            .request()
            .input("order_number", sql.NVarChar(80), resolvedOrderNumber)
            .query("SELECT TOP 1 id FROM dbo.shipments WHERE order_number = @order_number ORDER BY id DESC");

          const sqlShipmentId = shipmentLookup.recordset?.[0]?.id;

          if (sqlShipmentId) {
            await sqlPool
              .request()
              .input("shipment_id", sql.Int, Number(sqlShipmentId))
              .input("status", sql.NVarChar(30), "guia_generada")
              .input("description", sql.NVarChar(250), `Guia ${shippingGuide} generada correctamente`)
              .input("source", sql.NVarChar(30), "backend")
              .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(urbanoResponsePayload))
              .input("event_time", sql.DateTime2, new Date(sqlNow))
              .query(`
                INSERT INTO dbo.shipment_events (shipment_id, status, description, source, payload, event_time)
                VALUES (@shipment_id, @status, @description, @source, @payload, @event_time)
              `);
          }

          await sqlPool
            .request()
            .input("order_id", sql.Int, Number(resolvedOrderId))
            .input("order_number", sql.NVarChar(80), resolvedOrderNumber)
            .input("service", sql.NVarChar(60), "urbano")
            .input("endpoint", sql.NVarChar(150), urbanoPathMap.generateGuide)
            .input("request_payload", sql.NVarChar(sql.MAX), urbanoRequestPayload)
            .input("response_payload", sql.NVarChar(sql.MAX), JSON.stringify(urbanoResponsePayload))
            .input("status_code", sql.Int, Number(urbanoHttpResponse.status || 200))
            .input("success", sql.Bit, true)
            .input("created_at", sql.DateTime2, new Date(sqlNow))
            .query(`
              INSERT INTO dbo.ws_logs (order_id, order_number, service, endpoint, request_payload, response_payload, status_code, success, created_at)
              VALUES (@order_id, @order_number, @service, @endpoint, @request_payload, @response_payload, @status_code, @success, @created_at)
            `);
        } catch (sqlSyncError) {
          console.error("Error al sincronizar checkout con SQL Server:", sqlSyncError);
        }
      }

      res.json({
        success: true,
        payment_status: "succeeded",
        payment_transaction_id: paymentTransactionId,
        idempotency_key: normalizedIdempotencyKey,
        order_number: resolvedOrderNumber,
        shipping_guide: shippingGuide,
        shipment_status: "guia_generada",
        message: "Pago procesado y guía de Urbano generada correctamente"
      });

    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("No se pudo iniciar backend:", error);
  process.exit(1);
});
