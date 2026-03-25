process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = { CompanyDB: "SBO_GRUPO_LINA_PROD", UserName: "manager", Password: "3xx15" };

const main = async () => {
  const login = await fetch(`${base}/Login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const grab = async (path) => {
    const r = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
    const j = await r.json();
    const arr = Array.isArray(j.value) ? j.value : [];
    console.log(path, 'status', r.status, 'len', arr.length, 'first', arr[0]?.ItemCode || null, 'last', arr[arr.length-1]?.ItemCode || null);
  };
  await grab("/Items?$select=ItemCode,ItemName&$top=5");
  await grab("/Items?$select=ItemCode,ItemName&$top=100");
  await grab("/Items?$select=ItemCode,ItemName&$top=100&$skip=100");
  await grab("/Items?$select=ItemCode,ItemName&$top=100&$skip=200");
  await fetch(`${base}/Logout`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
};

main().catch((e) => { console.error(e); process.exit(1); });
