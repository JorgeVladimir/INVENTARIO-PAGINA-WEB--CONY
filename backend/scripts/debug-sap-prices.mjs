process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = {
  CompanyDB: "SBO_GRUPO_LINA_PROD",
  UserName: "manager",
  Password: "3xx15",
};

const tryUrl = async (cookie, path) => {
  const response = await fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
  });
  const text = await response.text();
  console.log(`\n=== ${path} -> ${response.status} ===`);
  console.log(text.slice(0, 1000));
};

const main = async () => {
  const login = await fetch(`${base}/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(credentials),
  });

  const loginRaw = await login.text();
  if (!login.ok) {
    console.error("login_failed", login.status, loginRaw);
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) {
    console.error("missing_cookie");
    process.exit(1);
  }

  await tryUrl(cookie, "/Items?$top=1");
  await tryUrl(cookie, "/Items('6033492')/ItemPrices");
  await tryUrl(cookie, "/Items('6033492')?$select=ItemCode,ItemName");
  await tryUrl(cookie, "/Items('6033492')?$select=ItemCode,ItemName&$expand=ItemPrices");
  await tryUrl(cookie, "/PriceLists(1)");
  await tryUrl(cookie, "/PriceLists(1)/PriceListLines?$top=1");
  await tryUrl(cookie, "/$metadata");

  await fetch(`${base}/Logout`, {
    method: "POST",
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
