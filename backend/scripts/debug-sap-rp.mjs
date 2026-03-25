process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const base = "https://192.168.1.202:50000/b1s/v1";
const credentials = {
  CompanyDB: "SBO_GRUPO_LINA_PROD",
  UserName: "manager",
  Password: "3xx15",
};

const req = async (cookie, path) => {
  const response = await fetch(`${base}${path}`, {
    method: "GET",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
  });
  const text = await response.text();
  console.log(`\nPATH ${path} STATUS ${response.status}`);
  console.log(text.slice(0, 1200));
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
    console.log("missing_cookie");
    process.exit(1);
  }

  await req(cookie, "/Items?$select=ItemCode,ItemName,Valid,Frozen&$filter=ItemCode eq 'RP0045'");
  await req(cookie, "/Items('RP0045')?$select=ItemCode,ItemName,Valid,Frozen,QuantityOnStock");
  await req(cookie, "/Items?$select=ItemCode,ItemName&$filter=contains(ItemName,'PANTALON')&$top=5");

  const logout = await fetch(`${base}/Logout`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: "{}",
  });
  console.log("logout", logout.status);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
