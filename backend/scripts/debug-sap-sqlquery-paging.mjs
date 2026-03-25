process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const base='https://192.168.1.202:50000/b1s/v1';
const credentials={CompanyDB:'SBO_GRUPO_LINA_PROD',UserName:'manager',Password:'3xx15'};
const main=async()=>{
 const login=await fetch(`${base}/Login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 if(!login.ok){console.log('login',login.status,await login.text());return;}
 const setCookie=login.headers.get('set-cookie')||''; const cookie=setCookie.split(';')[0];
 const headers={Cookie:cookie,'Content-Type':'application/json'};
 const code='COPILOT_PAGING_TEST';
 await fetch(`${base}/SQLQueries('${encodeURIComponent(code)}')`,{method:'DELETE',headers});
 const sql=`SELECT TOP 1000 T0."ItemCode" AS "CODIGOPRODUC" FROM "OITM" T0 WHERE T0."SellItem" = 'Y'`;
 const c=await fetch(`${base}/SQLQueries`,{method:'POST',headers,body:JSON.stringify({SqlCode:code,SqlName:code,SqlText:sql})});
 console.log('create',c.status);
 for (const [skip, top] of [[0,20],[20,20],[40,20],[0,200],[200,200]]) {
  const r=await fetch(`${base}/SQLQueries('${encodeURIComponent(code)}')/List?$skip=${skip}&$top=${top}`,{method:'POST',headers,body:'{}'});
  const j=await r.json();
  console.log('list',skip,top,'status',r.status,'count',Array.isArray(j.value)?j.value.length:-1,'next',j['odata.nextLink']||null);
 }
};
main().catch(e=>console.error(e));
