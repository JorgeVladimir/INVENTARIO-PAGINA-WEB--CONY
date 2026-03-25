process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = { CompanyDB: "SBO_GRUPO_LINA_PROD", UserName: "manager", Password: "3xx15" };

const tryPath = async (cookie, path, method = "GET", body = undefined) => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  console.log(`\n${method} ${path} -> ${response.status}`);
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
    console.log("login_failed", login.status, loginRaw.slice(0, 300));
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) throw new Error("No cookie");

  await tryPath(cookie, "/SQLQueries");
  await tryPath(cookie, "/QueryService_PostQuery", "POST", {
    QueryPath: "$crossjoin(Items,Items/ItemPrices)",
    QueryOption: "$expand=Items($select=ItemCode,ItemName),Items/ItemPrices($select=PriceList,Price)&$filter=Items/ItemCode eq Items/ItemPrices/ItemCode and Items/ItemPrices/PriceList eq 8",
  });

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
