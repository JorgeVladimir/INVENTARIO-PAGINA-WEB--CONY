# Backend - Inventario CONY

Este proyecto contiene la API (Express) con:

- SQLite para módulos internos de inventario/órdenes.
- SQL Server para ecommerce, incluyendo la tabla `Productos` en la base `E-COMERCE`.

## Requisitos

- Node.js 20+

## Configuración

1. Instalar dependencias:
   `npm install`
2. Copiar `.env.example` a `.env` (opcional) y ajustar valores.

Variables SQL Server:

- `SQLSERVER_HOST` (ej: `localhost`)
- `SQLSERVER_INSTANCE` (ej: `SQLEXPRESS`, usado si `SQLSERVER_PORT` no está definido)
- `SQLSERVER_PORT` (opcional, si usas puerto fijo)
- `SQLSERVER_DATABASE` (ej: `E-COMERCE`)
- `SQLSERVER_USER` (ej: `jvtt`)
- `SQLSERVER_PASSWORD` (ej: `jvtt1995`)
- `ECOMMERCE_PRODUCTS_SCHEMA` (default `dbo`)
- `ECOMMERCE_PRODUCTS_TABLE` (default `ECPRDU`)

Variables PlaceToPay:

- `FRONTEND_URL` (ej: `http://localhost:7000`)
- `PLACETOPAY_LOGIN`
- `PLACETOPAY_TRANKEY`
- `PLACETOPAY_BASE_URL` (ej: `https://test.placetopay.com/redirection`)
- `PLACETOPAY_LOCALE` (ej: `es_EC`)

Variables integración SAP (productos):

- `SAP_SYNC_ENABLED` (`true` para habilitar sincronización automática)
- `SAP_SOURCE` (`generic_api` o `sap_b1_service_layer`)
- `SAP_PRODUCTS_URL` (endpoint API de productos SAP)
- `SAP_API_KEY` (opcional)
- `SAP_API_KEY_HEADER` (default `x-api-key`)
- `SAP_BEARER_TOKEN` (opcional)
- `SAP_SYNC_INTERVAL_MINUTES` (ej: `15`)
- `SAP_B1_SERVICE_LAYER_URL` (ej: `https://servidor:50000/b1s/v1`)
- `SAP_B1_COMPANY_DB`
- `SAP_B1_USERNAME`
- `SAP_B1_PASSWORD`
- `SAP_B1_WAREHOUSE_CODE` (opcional para stock por bodega)
- `SAP_B1_PRICE_LIST` (default `8` para `ECUASOL P. UNITARIO`)
- `SAP_B1_PRICE_STRICT` (default `true`; usa estrictamente la lista principal)
- `SAP_B1_FALLBACK_PRICE_LISTS` (opcional; listas alternativas cuando no se usa modo estricto)
- `SAP_B1_TRUNCATE_BEFORE_SYNC` (`true` para borrar la tabla objetivo antes de insertar sincronización completa)
- `SAP_B1_DEFAULT_CONTAINER` (default `2575`)
- `SAP_B1_DEFAULT_IMAGE` (default `https://picsum.photos/seed/1200/800/800`)
- `SAP_B1_PAGE_SIZE` (default `100`)
- `SAP_B1_PRICE_CONCURRENCY` (default `10`, consultas paralelas de precio por item)
- `SAP_B1_SYNC_BATCH_SIZE` (default `200`, tamaño de lote de inserción SQL)
- `SAP_B1_SQL_FILTER` (opcional; filtro SQL para la consulta SAP. Si está vacío no aplica WHERE y trae el universo completo de la consulta)
- `SAP_B1_SQL_TEXT` (opcional; SQL completo para `SQLQueries`. Si se define, reemplaza la consulta por defecto del backend)
- `SAP_B1_ITEMS_FILTER` (opcional, filtro OData para `/Items`, por ejemplo `Frozen eq 'tNO' and Valid eq 'tYES'`)
- `SAP_B1_TLS_INSECURE` (`true` solo para certificados internos/no confiables)

Variables Urbano:

- `URBANO_USER`
- `URBANO_PASS`
- `URBANO_CONTRATO` (ej: `4661`)
- `URBANO_ID_ORDEN` (ej: `4661`)
- `URBANO_LINEA` (ej: `3`)
- `URBANO_ORIGEN_UBIGEO` (opcional para cotización)
- `URBANO_API_KEY`
- `URBANO_BASE_PREPROD` (ej: `https://devpyp.urbano.com.ec`)
- `URBANO_BASE_PROD` (ej: `https://app.urbano.com.ec`)
- `URBANO_PRINT_USE_PROD` (`true` para imprimir guía en producción)

## Ejecutar en desarrollo

`npm run dev`

API local: `http://localhost:7002`
Health check: `http://localhost:7002/api/health`

## Reinicio + Sync + Monitor (un solo paso)

Para reiniciar backend, lanzar sincronización SAP y monitorear progreso en vivo:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\restart-sync-monitor.ps1
```

Opciones útiles:

- Omitir compilación previa:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\restart-sync-monitor.ps1 -SkipBuild
```

- Cambiar tiempo máximo de monitoreo:

```powershell
powershell -ExecutionPolicy Bypass -File .\backend\scripts\restart-sync-monitor.ps1 -TimeoutMinutes 45
```

Cómo explicarlo de forma simple al equipo:

1. El script mata cualquier proceso viejo en puerto 7002.
2. Compila backend (si no usas `-SkipBuild`).
3. Levanta backend con `dist/server.js`.
4. Verifica `health`.
5. Dispara `POST /api/ecommerce/sap/sync` una sola vez.
6. Muestra en consola el avance real con `GET /api/ecommerce/sap/sync-monitor`.

Campos clave del monitor (para explicar estado):

- `status`: estado global (`running`, `success`, `error`).
- `phase`: etapa actual (`fetching_sap`, `writing_sql`, etc.).
- `phaseMessage`: explicación legible de la etapa actual.
- `progressPct`: porcentaje de avance.
- `currentBatch/totalBatches`: lote actual y total.
- `targetCount`: registros actuales en tabla destino.
- `elapsedSeconds`: segundos desde que inició la ejecución.
- `staleSeconds`: segundos sin actualización de estado.
- `isStalled`: `true` cuando parece estancada (útil para soporte).
- `lastError`: detalle del error si falla.

## Colección Postman lista para importar

Archivo:

- `backend/postman/CONY-SAP-Sync-Monitor.postman_collection.json`

Flujo recomendado en Postman Runner:

1. Importar la colección.
2. Verificar variable `baseUrl` = `http://127.0.0.1:7002`.
3. Ejecutar la colección completa (ordenada de 1 a 4).

Qué hace automáticamente:

1. `Health Check` valida backend activo.
2. `Iniciar Sync SAP` dispara sincronización (si ya está corriendo, acepta 409 y sigue).
3. `Monitor Sync` entra en loop hasta `success` o `error`.
4. `Conteo Productos` valida resultado final.

## Endpoints principales

- `POST /api/login`
- `GET /api/public/products`
- `GET /api/products`
- `GET /api/ecommerce/productos` (lee desde SQL Server `E-COMERCE.[schema].[tabla configurada]`)
- `POST /api/ecommerce/import-excel` (importa Excel hacia SQL Server tabla configurada)
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/checkout`
- `POST /api/payments/placetopay/session` (crea sesión de pago)
- `POST /api/payments/placetopay/status` (consulta estado de sesión)
- `GET /api/ecommerce/sap/sync-config` (estado configuración SAP)
- `GET /api/ecommerce/sap/sync-monitor` (monitor de integración en tiempo real: fase, progreso, lotes, errores y conteo destino)
- `POST /api/ecommerce/sap/sync` (sincronización manual SAP -> SQL Server)
- `POST /api/shipping/quote` (cotización con Urbano)
- `POST /api/shipping/tracking` (tracking con Urbano)
- `POST /api/shipping/print-guide` (imprimir guía Urbano)
- `POST /api/shipping/cancel-guide` (cancelar guía Urbano)
