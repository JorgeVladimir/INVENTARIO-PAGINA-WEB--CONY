import express from "express";
import Database from "better-sqlite3";
import multer from "multer";
import * as XLSX from "xlsx";
import sql from "mssql";

const db = new Database("sinostock.db");
const sqlServerConfig: sql.config = {
  user: process.env.SQLSERVER_USER || "jvtt",
  password: process.env.SQLSERVER_PASSWORD || "jvtt1995",
  server: process.env.SQLSERVER_HOST || "localhost",
  database: process.env.SQLSERVER_DATABASE || "E-COMERCE",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const ensureSqlServerSchema = async (pool: sql.ConnectionPool) => {
  await pool.request().query(`
    IF OBJECT_ID(N'dbo.Productos', N'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Productos (
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
    WHERE c.object_id = OBJECT_ID(N'dbo.Productos')
      AND LOWER(c.name) IN ('codbarras', 'codigo', 'codigoproducto', 'sku');

    IF @IndexColumn IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM sys.indexes
        WHERE name = 'UX_Productos_ImportKey'
          AND object_id = OBJECT_ID(N'dbo.Productos')
      )
    BEGIN
      DECLARE @sql NVARCHAR(MAX) =
        N'CREATE UNIQUE INDEX UX_Productos_ImportKey ON dbo.Productos(' + QUOTENAME(@IndexColumn) + N') WHERE ' + QUOTENAME(@IndexColumn) + N' IS NOT NULL';
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
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Productos'
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
    WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'Productos'
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
      COLUMNPROPERTY(OBJECT_ID('dbo.Productos'), c.COLUMN_NAME, 'IsIdentity') AS IS_IDENTITY
    FROM INFORMATION_SCHEMA.COLUMNS c
    WHERE c.TABLE_SCHEMA = 'dbo' AND c.TABLE_NAME = 'Productos'
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
    table: "dbo.Productos",
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
    table: "dbo.Productos",
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
  const activoColumn = findColumnByCandidates(["activo"]);
  const fechaRegistroColumn = findColumnByCandidates(["fecharegistro", "fecha_registro", "fecha"]);
  const importKeyColumn = findColumnByCandidates(["codbarras", "codigo", "codigoproducto", "codigoproduc", "sku"]);
  const codigoProductoColumn = findColumnByCandidates(["codigoproduc", "codigoproducto", "codigo"]);
  const codigoBarrasColumn = findColumnByCandidates(["codbarras", "codigobarras", "codbarra"]);
  const nombreColumn = findColumnByCandidates(["nombre", "nombrecorto", "nombre_corto"]);
  const descripcionColumn = findColumnByCandidates(["descripcion", "detalle", "descripcion_larga", "descripcionlarga"]);
  const imagenColumn = findColumnByCandidates(["imagen", "foto", "image_url", "imageurl"]);
  const precioUnidadColumn = findColumnByCandidates(["precio_unidad", "preciounidad", "unidad", "precio"]);
  const stockColumn = findColumnByCandidates(["stock", "cantidadstock", "totalcantidad", "total_cantidad"]);
  const grupoColumn = findColumnByCandidates(["grupo", "categoria", "categorianombre"]);

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

        return res.json(
          sqliteProducts.map((product) => ({
            Id: product.id,
            Imagen: product.image_url,
            Codigo: product.internal_code,
            Unidad: product.name,
            TotalCantidad: product.stock,
            Costo: product.cost,
            Mayorista: product.price,
            PrecioUnidad: product.price,
            Activo: 1,
          }))
        );
      }

      const activeFilter = activoColumn ? `WHERE [${activoColumn.name}] = 1` : "";
      const orderBy = idColumn ? `ORDER BY [${idColumn.name}] DESC` : "";
      const result = await sqlPool.request().query(`SELECT * FROM dbo.Productos ${activeFilter} ${orderBy}`);

      res.json(result.recordset);
    } catch (e: any) {
      res.status(500).json({ error: e.message || "No se pudo consultar Productos en SQL Server." });
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
                  IF EXISTS (SELECT 1 FROM dbo.Productos WHERE [${importKeyColumn.name}] = @importKey)
                  BEGIN
                    UPDATE dbo.Productos
                    SET
                      ${updateSetClause}
                    WHERE [${importKeyColumn.name}] = @importKey;
                  END
                  ELSE
                  BEGIN
                    INSERT INTO dbo.Productos (${insertColumnsClause})
                    VALUES (${insertValuesClause});
                  END
                `);
              } else {
                await request.query(`
                  IF NOT EXISTS (SELECT 1 FROM dbo.Productos WHERE [${importKeyColumn.name}] = @importKey)
                  BEGIN
                    INSERT INTO dbo.Productos (${insertColumnsClause})
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
            INSERT INTO dbo.Productos (${insertColumnsClause})
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
      const result = await sqlPool.request().query(`SELECT * FROM dbo.Productos ${activeFilter}`);

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

  // Mock Urbano Credentials (In a real app, these would be in .env)
  const URBANO_CONFIG = {
    user: process.env.URBANO_USER || "1010-WebService",
    pass: process.env.URBANO_PASS || "1qasw27ygfsdernh",
    id_contrato: process.env.URBANO_CONTRATO || "1010"
  };

  // Cotizar Envío (Urbano)
  app.post("/api/shipping/quote", async (req, res) => {
    const { destination_ubigeo, weight, pieces } = req.body;
    
    // According to manual section 1.5
    // In a real scenario, we would call: https://app.urbano.com.ec/ws/ue/cotizarenvio
    // For this demo, we simulate a response based on the manual's structure
    
    const mockQuote = [
      {
        "error_sql": "0",
        "error_info": "",
        "id_servicio": "1",
        "servicio": "Distribucion",
        "valor_ennvio": "3.50",
        "time_envio": "1 00:00"
      },
      {
        "error_sql": "0",
        "error_info": "",
        "id_servicio": "3",
        "servicio": "Seguro",
        "valor_ennvio": "0.50"
      }
    ];

    res.json(mockQuote);
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

      // 3. Generate Urbano Guide (Section 1.1 of manual)
      // We simulate the call to https://app.urbano.com.ec/ws/ue/ge
      const urbanoPayload = {
        "json": JSON.stringify({
          "linea": "3",
          "id_contrato": URBANO_CONFIG.id_contrato,
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
      const wsLogInsert = db
        .prepare(
          `INSERT INTO ws_logs
           (order_id, order_number, service, endpoint, request_payload, status_code, success, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(resolvedOrderId, resolvedOrderNumber, "urbano", "/ws/ue/ge", urbanoRequestPayload, 0, 0, new Date().toISOString());

      // Mocking Urbano Response
      const mockUrbanoResponse = {
        "error": 1,
        "mensaje": "OK",
        "guía": `URB${Math.floor(10000000 + Math.random() * 90000000)}`
      };

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
          mockUrbanoResponse.guía,
          "guia_generada",
          shipping_data?.ubigeo || "",
          shipping_data?.address || "",
          shipping_data?.name || "",
          shipping_data?.phone || "",
          0,
          JSON.stringify(mockUrbanoResponse),
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
          `Guia ${mockUrbanoResponse.guía} generada correctamente`,
          "backend",
          JSON.stringify(mockUrbanoResponse),
          new Date().toISOString()
        );
      }

      db.prepare("UPDATE ws_logs SET response_payload = ?, status_code = ?, success = ?, created_at = created_at WHERE id = ?").run(
        JSON.stringify(mockUrbanoResponse),
        200,
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
          sqlShipmentRequest.input("tracking_code", sql.NVarChar(120), mockUrbanoResponse.guía);
          sqlShipmentRequest.input("shipment_status", sql.NVarChar(30), "guia_generada");
          sqlShipmentRequest.input("destination_ubigeo", sql.NVarChar(20), shipping_data?.ubigeo || "");
          sqlShipmentRequest.input("destination_address", sql.NVarChar(250), shipping_data?.address || "");
          sqlShipmentRequest.input("receiver_name", sql.NVarChar(120), shipping_data?.name || "");
          sqlShipmentRequest.input("receiver_phone", sql.NVarChar(30), shipping_data?.phone || "");
          sqlShipmentRequest.input("quote_total", sql.Decimal(18, 2), 0);
          sqlShipmentRequest.input("provider_payload", sql.NVarChar(sql.MAX), JSON.stringify(mockUrbanoResponse));
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
              .input("description", sql.NVarChar(250), `Guia ${mockUrbanoResponse.guía} generada correctamente`)
              .input("source", sql.NVarChar(30), "backend")
              .input("payload", sql.NVarChar(sql.MAX), JSON.stringify(mockUrbanoResponse))
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
            .input("endpoint", sql.NVarChar(150), "/ws/ue/ge")
            .input("request_payload", sql.NVarChar(sql.MAX), urbanoRequestPayload)
            .input("response_payload", sql.NVarChar(sql.MAX), JSON.stringify(mockUrbanoResponse))
            .input("status_code", sql.Int, 200)
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
        shipping_guide: mockUrbanoResponse.guía,
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
