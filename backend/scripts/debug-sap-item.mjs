process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

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
    console.error("login_failed", login.status, loginRaw);
    process.exit(1);
  }

  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  if (!cookie) {
    console.error("missing_cookie");
    process.exit(1);
  }

  const items = await fetch(`${base}/Items?$top=1`, {
    method: "GET",
    headers: { Cookie: cookie },
  });

  const itemsRaw = await items.text();
  if (!items.ok) {
    console.error("items_failed", items.status, itemsRaw.slice(0, 1000));
    process.exit(1);
  }

  const payload = JSON.parse(itemsRaw);
  const first = payload?.value?.[0];
  if (!first) {
    console.error("no_items");
    process.exit(1);
  }

  console.log("keys", Object.keys(first).join(","));
  console.log("sample", JSON.stringify(first, null, 2).slice(0, 2000));

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
