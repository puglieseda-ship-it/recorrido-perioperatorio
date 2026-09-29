# Pendientes — Mi Cirugía

App publicada en https://recorrido-perioperatorio.onrender.com

## Hecho
- [x] Base de datos real (Supabase) en lugar de `db.json`
- [x] Seguridad mínima: validación de datos, límite de intentos, encabezados de seguridad
- [x] Publicada con HTTPS (Render)
- [x] Instalable como app (PWA) + botón "Instalar en mi celular"
- [x] Estética Serendipity (colores, tipografía, logos)
- [x] Nombre de la app: "Mi Cirugía"
- [x] Pantalla de inicio con logos, título y formulario

## Próximos
- [ ] **Pasar Render al plan pago (USD 7/mes)** antes de sumar más pacientes: evita que la app tarde ~1 minuto en abrir después de 15 minutos sin uso.
- [ ] **Código de recuperación**: que la paciente recupere su recorrido en otro celular o al instalar la app en iPhone, sin volver a cargar los datos.
- [ ] **Notificaciones push reales** (avisos al celular aunque la app esté cerrada). Definir con Valeria qué hitos notificar para no saturar.
- [ ] **Dominio propio** (por ejemplo `cirugia.seren.com.ar` o `cirugia.drdiegopugliese.com`). En pausa hasta rediseñar la web de Dr. Diego Pugliese.
- [ ] Borrar la paciente de prueba "PRUEBA Claude" en Supabase (Table Editor → pacientes).

## Para más adelante
- [ ] Panel para Diego y la secretaria: ver pacientes cargadas y sus fechas de cirugía.
- [ ] Editar contenidos (textos, recetas) sin tocar código.
- [ ] Respaldos automáticos de la base de datos (plan pago de Supabase, USD 25/mes) cuando haya muchas pacientes.
