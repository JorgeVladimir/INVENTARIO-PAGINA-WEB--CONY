process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = process.env.SAP_B1_SERVICE_LAYER_URL || "https://192.168.1.202:50000/b1s/v1";
const credentials = {
  CompanyDB: process.env.SAP_B1_COMPANY_DB || "SBO_GRUPO_LINA_PROD",
  UserName: process.env.SAP_B1_USERNAME || "manager",
  Password: process.env.SAP_B1_PASSWORD || "3xx15",
};

const sqlCode = `COPILOT_DIAG_${Date.now()}`;
const sqlText =
  process.env.SAP_B1_SQL_TEXT ||
  'SELECT T0."ItemCode" AS "CODIGOPRODUC", T0."CodeBars" AS "CODBARRAS", T1."Price" AS "PRECIO_UNIDAD", T0."ItemName" AS "NOMBRE", T0."ItmsGrpCod" AS "GRUPO", T0."DfltWH" AS "EMPRESA", T0."OnHand" AS "STOCK", T0."AvgPrice" AS "COSTO" FROM "OITM" T0 LEFT JOIN "ITM1" T1 ON T1."ItemCode" = T0."ItemCode" AND T1."PriceList" = 8 WHERE T0."SellItem" = \'Y\'';

const nowIso = () => new Date().toISOString();

const fetchWithTimeout = async (url, init, timeoutMs = 30000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await response.text();
    const elapsedMs = Date.now() - started;
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      elapsedMs,
      text,
      headers: {
        server: response.headers.get("server") || null,
        via: response.headers.get("via") || null,
        date: response.headers.get("date") || null,
        connection: response.headers.get("connection") || null,
        "content-type": response.headers.get("content-type") || null,
      },
      aborted: false,
    };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    const aborted = error?.name === "AbortError";
    return {
      ok: false,
      status: null,
      statusText: aborted ? "ABORTED" : "ERROR",
      elapsedMs,
      text: String(error?.message || error),
      headers: {},
      aborted,
    };
  } finally {
    clearTimeout(timer);
  }
};

const parseCookie = (response) => {
  const anyHeaders = response.headers;
  if (typeof anyHeaders?.getSetCookie === "function") {
    const values = anyHeaders.getSetCookie();
    if (Array.isArray(values) && values.length > 0) {
      return values.map((v) => v.split(";")[0]).join("; ");
    }
  }
  const one = response.headers.get("set-cookie") || "";
  return one.split(";")[0] || "";
};

const run = async () => {
  const report = {
    startedAt: nowIso(),
    base,
    sqlCode,
    tests: [],
  };

  const loginStarted = Date.now();
  const loginResp = await fetch(`${base}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const loginText = await loginResp.text();
  report.tests.push({
    step: "login",
    status: loginResp.status,
    ok: loginResp.ok,
    elapsedMs: Date.now() - loginStarted,
    snippet: loginText.slice(0, 240),
  });

  if (!loginResp.ok) {
    report.finishedAt = nowIso();
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const cookie = parseCookie(loginResp);
  if (!cookie) {
    report.tests.push({ step: "cookie", ok: false, message: "No set-cookie received" });
    report.finishedAt = nowIso();
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  await fetch(`${base}/SQLQueries('${encodeURIComponent(sqlCode)}')`, {
    method: "DELETE",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
  }).catch(() => {});

  const create = await fetchWithTimeout(
    `${base}/SQLQueries`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ SqlCode: sqlCode, SqlName: sqlCode, SqlText: sqlText }),
    },
    30000
  );

  report.tests.push({
    step: "create_sqlquery",
    status: create.status,
    ok: create.ok,
    elapsedMs: create.elapsedMs,
    headers: create.headers,
    snippet: create.text.slice(0, 240),
  });

  const probes = [
    { skip: 0, top: 20, timeoutMs: 30000 },
    { skip: 20, top: 20, timeoutMs: 30000 },
    { skip: 0, top: 100, timeoutMs: 45000 },
    { skip: 0, top: 200, timeoutMs: 45000 },
    { skip: 200, top: 200, timeoutMs: 45000 },
  ];

  for (const probe of probes) {
    const path = `/SQLQueries('${encodeURIComponent(sqlCode)}')/List?$skip=${probe.skip}&$top=${probe.top}`;
    const result = await fetchWithTimeout(
      `${base}${path}`,
      {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
      probe.timeoutMs
    );

    let rowCount = null;
    let nextLink = null;
    try {
      const parsed = JSON.parse(result.text);
      if (Array.isArray(parsed?.value)) rowCount = parsed.value.length;
      nextLink = parsed?.["odata.nextLink"] || null;
    } catch {
      // keep null
    }

    report.tests.push({
      step: "list_page",
      skip: probe.skip,
      top: probe.top,
      timeoutMs: probe.timeoutMs,
      status: result.status,
      ok: result.ok,
      aborted: result.aborted,
      elapsedMs: result.elapsedMs,
      rowCount,
      nextLink,
      headers: result.headers,
      snippet: result.text.slice(0, 300),
    });
  }

  await fetch(`${base}/Logout`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  }).catch(() => {});

  report.finishedAt = nowIso();
  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error("diagnose_failed", error?.message || error);
  process.exit(1);
});
