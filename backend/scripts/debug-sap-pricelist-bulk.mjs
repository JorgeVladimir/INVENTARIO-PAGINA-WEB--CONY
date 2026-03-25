process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = {
  CompanyDB: "SBO_GRUPO_LINA_PROD",
  UserName: "manager",
  Password: "3xx15",
};

const test = async (cookie, path) => {
  const r = await fetch(`${base}${path}`, { headers: { Cookie: cookie } });
  const t = await r.text();
  console.log(`\n${path} -> ${r.status}`);
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
    console.log("login_failed", login.status, loginRaw.slice(0, 500));
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) {
    throw new Error("No session cookie");
  }

  await test(cookie, "/PriceLists(1)");
  await test(cookie, "/PriceLists(1)/PriceListLines?$top=5");
  await test(cookie, "/PriceLists(1)?$select=PriceListNo,PriceListName&$expand=PriceListLines($select=ItemCode,Price;$top=5)");

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
