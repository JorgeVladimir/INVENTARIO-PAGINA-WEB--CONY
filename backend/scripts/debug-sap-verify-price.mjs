process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const code = "4013368";
const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = {
  CompanyDB: "SBO_GRUPO_LINA_PROD",
  UserName: "manager",
  Password: "3xx15",
};

const main = async () => {
  const login = await fetch(`${base}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });
  const loginRaw = await login.text();
  if (!login.ok) {
    console.log('login_failed', login.status, loginRaw.slice(0, 300));
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const r = await fetch(`${base}/Items('${code}')/ItemPrices`, { headers: { Cookie: cookie, "Content-Type": "application/json" } });
  const t = await r.text();
  console.log('status', r.status);
  if (r.ok) {
    const payload = JSON.parse(t);
    const list1 = (payload.ItemPrices || []).find(p => Number(p.PriceList) === 1);
    console.log('list1_price', list1 ? list1.Price : null);
  } else {
    console.log(t.slice(0, 1000));
  }

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
