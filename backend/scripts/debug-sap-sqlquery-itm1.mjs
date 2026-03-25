process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = { CompanyDB: "SBO_GRUPO_LINA_PROD", UserName: "manager", Password: "3xx15" };
const sqlCode = "COPILOT_TEST_ITM1";
const sqlText = `SELECT
  T0."ItemCode" AS "CODIGOPRODUC",
  T0."CodeBars" AS "CODBARRAS",
  T1."Price" AS "PRECIO_UNIDAD",
  T0."ItemName" AS "NOMBRE",
  T0."ItmsGrpCod" AS "GRUPO",
  T0."DfltWh" AS "EMPRESA",
  T0."OnHand" AS "STOCK",
  T0."AvgPrice" AS "COSTO"
FROM OITM T0
LEFT JOIN ITM1 T1 ON T1."ItemCode" = T0."ItemCode" AND T1."PriceList" = 8
WHERE T0."SellItem" = 'Y'`;

const req = async (cookie, path, method = "GET", body = undefined) => {
  const r = await fetch(`${base}${path}`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  console.log(`\n${method} ${path} -> ${r.status}`);
  console.log(t.slice(0, 1200));
};

const main = async () => {
  const login = await fetch(`${base}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const loginRaw = await login.text();
  if (!login.ok) {
    console.log("login_failed", login.status, loginRaw);
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];

  await req(cookie, `/SQLQueries('${sqlCode}')`, "DELETE");
  await req(cookie, "/SQLQueries", "POST", { SqlCode: sqlCode, SqlName: sqlCode, SqlText: sqlText });
  await req(cookie, `/SQLQueries('${sqlCode}')/List`, "POST", {});

  await fetch(`${base}/Logout`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
