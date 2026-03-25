process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = { CompanyDB: "SBO_GRUPO_LINA_PROD", UserName: "manager", Password: "3xx15" };

const main = async () => {
  const login = await fetch(`${base}/Login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
  const loginRaw = await login.text();
  if (!login.ok) { console.log('login_failed', login.status, loginRaw.slice(0,300)); return; }
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const check = async (path) => {
    const r = await fetch(`${base}${path}`, { headers: { Cookie: cookie, "Content-Type": "application/json" } });
    const t = await r.text();
    console.log(`\n${path} -> ${r.status}`);
    console.log(t.slice(0,800));
  };
  await check("/Items('6036757')?$select=ItemCode,ItemName,Valid,Frozen,QuantityOnStock");
  await check("/Items('6036757')/ItemPrices");
  await check("/Items?$select=ItemCode,ItemName,Valid,Frozen&$filter=contains(ItemName,'PANTALON') and Frozen eq 'tNO' and Valid eq 'tYES'&$top=5");
  await fetch(`${base}/Logout`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
};

main().catch((e) => { console.error(e); process.exit(1); });
