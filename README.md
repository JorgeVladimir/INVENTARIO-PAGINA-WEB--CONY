<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Frontend - Inventario CONY

Este repositorio contiene solo el frontend (React + Vite).

## Requisitos

- Node.js 20+

## Configuración

1. Instalar dependencias:
   `npm install`
2. (Opcional) Crear `.env.local` con:
   `VITE_API_URL=http://localhost:7002`

## Ejecutar

`npm run dev`

Frontend local: `http://localhost:7000`

El frontend consume rutas `/api/*` y las envía al backend vía proxy de Vite.
Cuando tu backend esté en otro servidor/proyecto, ajusta `VITE_API_URL`.
