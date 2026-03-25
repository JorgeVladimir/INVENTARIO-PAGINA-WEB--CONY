process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = { CompanyDB: "SBO_GRUPO_LINA_PROD", UserName: "manager", Password: "3xx15" };

const main = async () => {
  const login = await fetch(`${base}/Login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(credentials) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const r = await fetch(`${base}/Items?$select=ItemCode,ItemName,Valid,Frozen&$top=100`, { headers: { Cookie: cookie } });
  const t = await r.text();
  console.log('status', r.status);
  const p = JSON.parse(t);
  console.log('keys', Object.keys(p));
  console.log('len', Array.isArray(p.value) ? p.value.length : -1);
  console.log('next', p['@odata.nextLink'] || p['odata.nextLink'] || p.nextLink || p.__next || null);
  const r2 = await fetch(`${base}/Items?$select=ItemCode,ItemName,Valid,Frozen&$filter=Frozen eq 'tNO' and Valid eq 'tYES'&$top=100`, { headers: { Cookie: cookie } });
  const t2 = await r2.text();
  const p2 = JSON.parse(t2);
  console.log('filtered_status', r2.status);
  console.log('filtered_len', Array.isArray(p2.value) ? p2.value.length : -1);
  console.log('filtered_next', p2['@odata.nextLink'] || p2['odata.nextLink'] || p2.nextLink || p2.__next || null);
  await fetch(`${base}/Logout`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: "{}" });
};
main().catch(e => { console.error(e); process.exit(1); });
