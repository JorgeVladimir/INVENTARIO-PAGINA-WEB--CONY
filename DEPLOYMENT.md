# Publicación en grupolinaecommerce.com

## 1. Build de producción

Frontend:

```powershell
npm install
npm run build
```

Backend:

```powershell
cd backend
npm install
npm run build
```

El frontend genera la carpeta `dist` y el backend queda compilado en `backend/dist`.

## 2. Variables recomendadas

En producción, en `backend/.env`:

```env
PORT=7002
FRONTEND_URL=https://grupolinaecommerce.com
```

Si el frontend consumirá el backend detrás del mismo dominio, conviene exponer `/api` y `/uploads/products` vía proxy reverso hacia el puerto 7002.

## 3. Publicación bajo el dominio

Opción recomendada en Windows Server o VPS:

1. Servir el frontend estático desde `dist` con Nginx o IIS.
2. Ejecutar el backend Node en el puerto 7002 con PM2, NSSM o un servicio de Windows.
3. Configurar el dominio `grupolinaecommerce.com` para apuntar al servidor.
4. Terminar SSL con Let's Encrypt o el proveedor del hosting.
5. Crear un proxy para que estas rutas vayan al backend:
   - `/api/*`
   - `/uploads/products/*`

Ejemplo de flujo:

- `https://grupolinaecommerce.com/` -> frontend estático `dist`
- `https://grupolinaecommerce.com/api/...` -> `http://127.0.0.1:7002/api/...`
- `https://grupolinaecommerce.com/uploads/products/...` -> `http://127.0.0.1:7002/uploads/products/...`

## 4. Para que aparezca bien en Google

Ya quedaron agregados:

- título y descripción SEO
- `canonical`
- Open Graph / Twitter cards
- `robots.txt`
- `sitemap.xml`
- `site.webmanifest`
- datos estructurados `WebSite`

Falta después de publicar:

1. Dar de alta la propiedad en Google Search Console.
2. Enviar `https://grupolinaecommerce.com/sitemap.xml`.
3. Solicitar indexación de la home y de `/productos`.
4. Verificar que el dominio responda con HTTPS y sin bloqueos por `robots.txt`.

## 5. Si hoy solo quieres ejecutarlo localmente

Desde la raíz del proyecto:

```powershell
npm install
npm --prefix backend install
npm run dev:full
```

Puertos esperados:

- frontend: `http://localhost:7000`
- backend: `http://localhost:7002`