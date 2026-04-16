/**
 * ============================================================
 * SAP B1 Service Layer — Consultas SQL de Sincronización
 * ============================================================
 *
 * Centraliza las consultas SQL enviadas al endpoint /SQLQueries
 * de SAP Business One para sincronizar productos hacia la tabla
 * [dbo].[ECPRDU] en SQL Server.
 *
 * ── Cómo elegir la versión activa ────────────────────────────
 *   Opción 1 (recomendada): variable de entorno en backend/.env
 *     SAP_ACTIVE_QUERY=v2     ← usa la consulta optimizada
 *     SAP_ACTIVE_QUERY=v1     ← usa la consulta original (fallback)
 *
 *   Opción 2: cambia ACTIVE_QUERY_DEFAULT en este archivo
 *
 * ── Campos de salida (contrato entre SAP → SQL Server) ───────
 *   Todas las versiones deben exponer exactamente estos alias:
 *     prdu_cod_bars   prdu_cod_prdu   prdu_nom_prdu   prdu_des_prdu
 *     prdu_stock      prdu_costo
 *     prdu_pre_untr   prdu_pre_myor   prdu_pre_trjc   prdu_pre_blto
 *     prdu_pre_difr   prdu_pre_ofrt   prdu_pre_espl   prdu_pre_euni
 *     prdu_pre_emyr   prdu_pre_eblt   prdu_pre_etrj   prdu_pre_edfr
 *     prdu_pre_eofr   prdu_pre_luni   prdu_pre_lmyr   prdu_pre_lblt
 *     prdu_pre_ltrj   prdu_pre_ldfr   prdu_pre_lofr   prdu_pre_chin
 *     prdu_tip_grup   prdu_fec_rgis
 * ─────────────────────────────────────────────────────────────
 */

// ═════════════════════════════════════════════════════════════
// V1 — Consulta original (20 LEFT JOINs a ITM1)
// ─────────────────────────────────────────────────────────────
// · No requiere acceso a OITB.
// · prdu_tip_grup devuelve el código numérico (ej. "123").
// · prdu_pre_untr = costo + 15%.
// · Referencia: query original configurada vía SAP_B1_SQL_TEXT.
// ═════════════════════════════════════════════════════════════
export const SAP_QUERY_V1 = `
SELECT
  T0."CodeBars"         AS "prdu_cod_bars",
  T0."ItemCode"         AS "prdu_cod_prdu",
  T0."ItemName"         AS "prdu_nom_prdu",
  T0."ItemName"         AS "prdu_des_prdu",
  T0."OnHand"           AS "prdu_stock",
  T0."AvgPrice"         AS "prdu_costo",
  T0."AvgPrice" * 1.15  AS "prdu_pre_untr",
  IFNULL(P2."Price",  0) AS "prdu_pre_myor",
  IFNULL(P3."Price",  0) AS "prdu_pre_trjc",
  IFNULL(P4."Price",  0) AS "prdu_pre_blto",
  IFNULL(P5."Price",  0) AS "prdu_pre_difr",
  IFNULL(P6."Price",  0) AS "prdu_pre_ofrt",
  IFNULL(P7."Price",  0) AS "prdu_pre_espl",
  IFNULL(P8."Price",  0) AS "prdu_pre_euni",
  IFNULL(P9."Price",  0) AS "prdu_pre_emyr",
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
  T0."ItmsGrpCod"       AS "prdu_tip_grup",
  T0."CreateDate"       AS "prdu_fec_rgis"
FROM OITM T0
LEFT JOIN ITM1 P1  ON T0."ItemCode" = P1."ItemCode"  AND P1."PriceList"  = 1
LEFT JOIN ITM1 P2  ON T0."ItemCode" = P2."ItemCode"  AND P2."PriceList"  = 2
LEFT JOIN ITM1 P3  ON T0."ItemCode" = P3."ItemCode"  AND P3."PriceList"  = 3
LEFT JOIN ITM1 P4  ON T0."ItemCode" = P4."ItemCode"  AND P4."PriceList"  = 4
LEFT JOIN ITM1 P5  ON T0."ItemCode" = P5."ItemCode"  AND P5."PriceList"  = 5
LEFT JOIN ITM1 P6  ON T0."ItemCode" = P6."ItemCode"  AND P6."PriceList"  = 6
LEFT JOIN ITM1 P7  ON T0."ItemCode" = P7."ItemCode"  AND P7."PriceList"  = 7
LEFT JOIN ITM1 P8  ON T0."ItemCode" = P8."ItemCode"  AND P8."PriceList"  = 8
LEFT JOIN ITM1 P9  ON T0."ItemCode" = P9."ItemCode"  AND P9."PriceList"  = 9
LEFT JOIN ITM1 P10 ON T0."ItemCode" = P10."ItemCode" AND P10."PriceList" = 10
LEFT JOIN ITM1 P11 ON T0."ItemCode" = P11."ItemCode" AND P11."PriceList" = 11
LEFT JOIN ITM1 P12 ON T0."ItemCode" = P12."ItemCode" AND P12."PriceList" = 12
LEFT JOIN ITM1 P13 ON T0."ItemCode" = P13."ItemCode" AND P13."PriceList" = 13
LEFT JOIN ITM1 P14 ON T0."ItemCode" = P14."ItemCode" AND P14."PriceList" = 14
LEFT JOIN ITM1 P15 ON T0."ItemCode" = P15."ItemCode" AND P15."PriceList" = 15
LEFT JOIN ITM1 P16 ON T0."ItemCode" = P16."ItemCode" AND P16."PriceList" = 16
LEFT JOIN ITM1 P17 ON T0."ItemCode" = P17."ItemCode" AND P17."PriceList" = 17
LEFT JOIN ITM1 P18 ON T0."ItemCode" = P18."ItemCode" AND P18."PriceList" = 18
LEFT JOIN ITM1 P19 ON T0."ItemCode" = P19."ItemCode" AND P19."PriceList" = 19
LEFT JOIN ITM1 P20 ON T0."ItemCode" = P20."ItemCode" AND P20."PriceList" = 20
WHERE T0."SellItem" = 'Y' AND T0."validFor" = 'Y'
`;

// ═════════════════════════════════════════════════════════════
// V2 — Consulta optimizada (subconsulta pivote + INNER JOIN OITB)
// ─────────────────────────────────────────────────────────────
// · Requiere acceso a OITB en SAP (nombres reales de grupo).
// · prdu_tip_grup devuelve el NOMBRE del grupo (ej. "BAZAR").
// · prdu_pre_untr = AvgPrice × 1.15 (margen 15% sobre costo).
// · Precios PL2-PL20 via LEFT JOINs individuales a ITM1
//   (subconsultas pivote rechazadas por SAP Service Layer).
//
// NOTA: Cambia a SAP_ACTIVE_QUERY=v1 si OITB no es accesible.
// ═════════════════════════════════════════════════════════════
export const SAP_QUERY_V2 = `
SELECT
  T0."CodeBars"                  AS "prdu_cod_bars",
  T0."ItemCode"                  AS "prdu_cod_prdu",
  T0."ItemName"                  AS "prdu_nom_prdu",
  T0."ItemName"                  AS "prdu_des_prdu",
  T0."OnHand"                    AS "prdu_stock",
  T0."AvgPrice"                  AS "prdu_costo",
  T0."AvgPrice" * 1.15            AS "prdu_pre_untr",
  IFNULL(P2."Price",  0)         AS "prdu_pre_myor",
  IFNULL(P3."Price",  0)         AS "prdu_pre_trjc",
  IFNULL(P4."Price",  0)         AS "prdu_pre_blto",
  IFNULL(P5."Price",  0)         AS "prdu_pre_difr",
  IFNULL(P6."Price",  0)         AS "prdu_pre_ofrt",
  IFNULL(P7."Price",  0)         AS "prdu_pre_espl",
  IFNULL(P8."Price",  0)         AS "prdu_pre_euni",
  IFNULL(P9."Price",  0)         AS "prdu_pre_emyr",
  IFNULL(P10."Price", 0)         AS "prdu_pre_eblt",
  IFNULL(P11."Price", 0)         AS "prdu_pre_etrj",
  IFNULL(P12."Price", 0)         AS "prdu_pre_edfr",
  IFNULL(P13."Price", 0)         AS "prdu_pre_eofr",
  IFNULL(P14."Price", 0)         AS "prdu_pre_luni",
  IFNULL(P15."Price", 0)         AS "prdu_pre_lmyr",
  IFNULL(P16."Price", 0)         AS "prdu_pre_lblt",
  IFNULL(P17."Price", 0)         AS "prdu_pre_ltrj",
  IFNULL(P18."Price", 0)         AS "prdu_pre_ldfr",
  IFNULL(P19."Price", 0)         AS "prdu_pre_lofr",
  IFNULL(P20."Price", 0)         AS "prdu_pre_chin",
  T1."ItmsGrpNam"                AS "prdu_tip_grup",
  T0."CreateDate"                AS "prdu_fec_rgis"
FROM OITM T0
INNER JOIN OITB T1  ON T0."ItmsGrpCod" = T1."ItmsGrpCod"
LEFT JOIN ITM1 P2   ON T0."ItemCode" = P2."ItemCode"  AND P2."PriceList"  = 2
LEFT JOIN ITM1 P3   ON T0."ItemCode" = P3."ItemCode"  AND P3."PriceList"  = 3
LEFT JOIN ITM1 P4   ON T0."ItemCode" = P4."ItemCode"  AND P4."PriceList"  = 4
LEFT JOIN ITM1 P5   ON T0."ItemCode" = P5."ItemCode"  AND P5."PriceList"  = 5
LEFT JOIN ITM1 P6   ON T0."ItemCode" = P6."ItemCode"  AND P6."PriceList"  = 6
LEFT JOIN ITM1 P7   ON T0."ItemCode" = P7."ItemCode"  AND P7."PriceList"  = 7
LEFT JOIN ITM1 P8   ON T0."ItemCode" = P8."ItemCode"  AND P8."PriceList"  = 8
LEFT JOIN ITM1 P9   ON T0."ItemCode" = P9."ItemCode"  AND P9."PriceList"  = 9
LEFT JOIN ITM1 P10  ON T0."ItemCode" = P10."ItemCode" AND P10."PriceList" = 10
LEFT JOIN ITM1 P11  ON T0."ItemCode" = P11."ItemCode" AND P11."PriceList" = 11
LEFT JOIN ITM1 P12  ON T0."ItemCode" = P12."ItemCode" AND P12."PriceList" = 12
LEFT JOIN ITM1 P13  ON T0."ItemCode" = P13."ItemCode" AND P13."PriceList" = 13
LEFT JOIN ITM1 P14  ON T0."ItemCode" = P14."ItemCode" AND P14."PriceList" = 14
LEFT JOIN ITM1 P15  ON T0."ItemCode" = P15."ItemCode" AND P15."PriceList" = 15
LEFT JOIN ITM1 P16  ON T0."ItemCode" = P16."ItemCode" AND P16."PriceList" = 16
LEFT JOIN ITM1 P17  ON T0."ItemCode" = P17."ItemCode" AND P17."PriceList" = 17
LEFT JOIN ITM1 P18  ON T0."ItemCode" = P18."ItemCode" AND P18."PriceList" = 18
LEFT JOIN ITM1 P19  ON T0."ItemCode" = P19."ItemCode" AND P19."PriceList" = 19
LEFT JOIN ITM1 P20  ON T0."ItemCode" = P20."ItemCode" AND P20."PriceList" = 20
WHERE T0."SellItem" = 'Y' AND T0."validFor" = 'Y'
`;

// ─────────────────────────────────────────────────────────────
// Versión por defecto cuando SAP_ACTIVE_QUERY no está definida
// Cambia a "v1" si OITB no es accesible en tu instancia SAP.
// ─────────────────────────────────────────────────────────────
const ACTIVE_QUERY_DEFAULT = "v2";

/**
 * Devuelve la consulta activa según SAP_ACTIVE_QUERY ("v1" | "v2").
 * Opcionalmente agrega un filtro WHERE extra al final.
 *
 * @param extraFilter  Fragmento SQL sin el "AND", ej. `T0."ItmsGrpCod" = 123`
 */
export const getActiveSapQuery = (extraFilter?: string): string => {
  const version = (process.env.SAP_ACTIVE_QUERY || ACTIVE_QUERY_DEFAULT).toLowerCase();
  const base = version === "v1" ? SAP_QUERY_V1 : SAP_QUERY_V2;
  const filter = (extraFilter || "").trim();
  if (!filter) return base.trimEnd();
  return `${base.trimEnd()}\n  AND (${filter})`;
};
