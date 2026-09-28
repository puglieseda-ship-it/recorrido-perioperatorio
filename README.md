# Recorrido Perioperatorio — MVP con persistencia real

Esta es la Fase 1 descripta en `Especificacion_Tecnica_App.md`: la misma app de siempre, pero ahora
con un backend real que guarda el nombre, la fecha de cirugía y el checklist de cada paciente,
para que no se pierdan si cierra el navegador.

**Sin dependencias externas.** Corre solo con Node.js — no hace falta `npm install` ni conexión a
internet para funcionar localmente.

## Cómo probarlo ahora mismo

1. Necesitás tener [Node.js](https://nodejs.org) instalado (versión 18 o superior).
2. Abrí una terminal en esta carpeta.
3. Ejecutá:
   ```
   node server.js
   ```
4. Abrí `http://localhost:3000` en el navegador.
5. Cargá un nombre y una fecha de cirugía, marcá algo del checklist, y cerrá la pestaña.
6. Volvé a abrir `http://localhost:3000` — vas a ver que todo sigue como lo dejaste.

Los datos quedan guardados en el archivo `db.json`, que se crea solo la primera vez que alguien
carga sus datos. Podés abrirlo con cualquier editor de texto para ver qué guardó.

## Novedades (versión 0.2)

- **Base de datos real:** si se define la variable `DATABASE_URL` (Postgres de Supabase), los datos
  se guardan ahí y la tabla `pacientes` se crea sola al arrancar. Sin `DATABASE_URL` sigue usando
  `db.json`, igual que antes (ver `db.js`).
- **Seguridad mínima:** validación de nombre, fecha y checklist; límite de tamaño de los pedidos;
  límite de intentos por IP; encabezados de seguridad (CSP, HSTS en producción); ids de 128 bits.
- **"Cambiar datos"** actualiza el mismo recorrido en lugar de crear uno nuevo.
- **PWA instalable:** `manifest.webmanifest`, `sw.js` e íconos en `public/icons/` (generados a
  partir del símbolo del logo de Serendipity).
- **`render.yaml`:** configuración lista para publicar en Render.

Los puntos de abajo sobre base de datos y seguridad ya quedaron resueltos; siguen pendientes el
dominio propio y las notificaciones push.

## Qué es y qué NO es esto todavía

**Es:** una prueba real y funcional de que el patrón "cargar datos → persistir → recuperar al
volver" funciona de punta a punta.

**No es:** una app en producción. Faltan, en orden de importancia:

- **Base de datos de verdad.** `db.json` es un archivo plano — sirve para probar, pero no
  soporta más de un puñado de pacientes escribiendo al mismo tiempo sin riesgo de corromperse.
  Para producción, reemplazar por Postgres, Supabase o Firebase (ver la especificación técnica).
- **HTTPS y dominio propio.** Hoy solo funciona en `localhost`, en tu computadora.
- **Notificaciones push reales.** Siguen siendo client-side únicamente (Fase 3 de la
  especificación).
- **Un mínimo de seguridad.** No hay límite de intentos, ni validación robusta de los datos que
  llegan al servidor — aceptable para una prueba local, no para exponerlo a internet tal cual está.

## Cómo llevar esto a producción

La forma más simple, sin reescribir nada: pasarle esta carpeta a Claude Code (o a un desarrollador) y pedirle que:

1. Reemplace `db.json` por una base de datos real (Supabase es la opción más rápida: resuelve
   base de datos y hosting de una vez).
2. Lo despliegue en un servicio como Railway, Render o Vercel — cualquiera de los tres funciona
   con este mismo código casi sin cambios.
3. Configure un dominio propio con HTTPS (necesario también para el siguiente paso).
4. Recién ahí, sume las notificaciones push reales.

## Estructura del proyecto

```
mvp-app/
├── server.js       → el backend (Node puro, sin dependencias)
├── package.json
├── db.json         → se crea solo al usar la app (no viene versionado)
├── public/
│   └── index.html  → el frontend completo (contenido, recetas, lógica de fases)
└── README.md       → este archivo
```
