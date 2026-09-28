// Capa de datos — Recorrido Nutricional Perioperatorio
//
// Si existe la variable de entorno DATABASE_URL, usa Postgres (Supabase).
// Si no, usa el archivo db.json local, para poder seguir probando en la
// computadora sin instalar nada.

const fs = require("fs");
const path = require("path");

const COLUMNAS = "id, nombre, to_char(fecha_cirugia, 'YYYY-MM-DD') AS fecha_cirugia, checklist, creado_en";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS pacientes (
  id                       text PRIMARY KEY,
  nombre                   text NOT NULL DEFAULT '',
  fecha_cirugia            date NOT NULL,
  checklist                jsonb NOT NULL DEFAULT '{}'::jsonb,
  telefono                 text,
  email                    text,
  notificaciones_activadas boolean NOT NULL DEFAULT false,
  push_subscription        jsonb,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  actualizado_en           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pacientes_fecha_cirugia_idx ON pacientes (fecha_cirugia);
-- Supabase expone las tablas del esquema public a través de su API REST.
-- Activando RLS sin políticas, esa API no puede leer ni escribir nada; el
-- servidor sigue accediendo porque se conecta como dueño de la tabla.
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;
`;

function crearPostgres(connectionString) {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString,
    // Supabase exige SSL.
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  pool.on("error", (e) => console.error("Error en la conexión a Postgres:", e.message));

  return {
    tipo: "postgres",

    async iniciar() {
      await pool.query(SCHEMA_SQL);
    },

    async crear({ id, nombre, fecha_cirugia }) {
      const { rows } = await pool.query(
        `INSERT INTO pacientes (id, nombre, fecha_cirugia) VALUES ($1, $2, $3) RETURNING ${COLUMNAS}`,
        [id, nombre, fecha_cirugia]
      );
      return rows[0];
    },

    async obtener(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM pacientes WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async actualizarDatos(id, { nombre, fecha_cirugia }) {
      const { rows } = await pool.query(
        `UPDATE pacientes SET nombre = $2, fecha_cirugia = $3, actualizado_en = now()
         WHERE id = $1 RETURNING ${COLUMNAS}`,
        [id, nombre, fecha_cirugia]
      );
      return rows[0] || null;
    },

    async actualizarChecklist(id, checklist) {
      const { rows } = await pool.query(
        `UPDATE pacientes SET checklist = $2, actualizado_en = now()
         WHERE id = $1 RETURNING ${COLUMNAS}`,
        [id, JSON.stringify(checklist)]
      );
      return rows[0] || null;
    },
  };
}

function crearArchivoJSON(archivo) {
  function leer() {
    if (!fs.existsSync(archivo)) return { pacientes: {} };
    try {
      return JSON.parse(fs.readFileSync(archivo, "utf8"));
    } catch (e) {
      console.error("No se pudo leer db.json, se arranca desde cero:", e.message);
      return { pacientes: {} };
    }
  }
  function escribir(db) {
    // Escribir a un temporal y renombrar evita dejar el archivo a medio escribir.
    const tmp = archivo + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, archivo);
  }
  function publico(p) {
    if (!p) return null;
    const { id, nombre, fecha_cirugia, checklist, creado_en } = p;
    return { id, nombre, fecha_cirugia, checklist, creado_en };
  }

  return {
    tipo: "archivo db.json",

    async iniciar() {},

    async crear({ id, nombre, fecha_cirugia }) {
      const db = leer();
      const ahora = new Date().toISOString();
      db.pacientes[id] = { id, nombre, fecha_cirugia, checklist: {}, creado_en: ahora, actualizado_en: ahora };
      escribir(db);
      return publico(db.pacientes[id]);
    },

    async obtener(id) {
      return publico(leer().pacientes[id]);
    },

    async actualizarDatos(id, { nombre, fecha_cirugia }) {
      const db = leer();
      const p = db.pacientes[id];
      if (!p) return null;
      Object.assign(p, { nombre, fecha_cirugia, actualizado_en: new Date().toISOString() });
      escribir(db);
      return publico(p);
    },

    async actualizarChecklist(id, checklist) {
      const db = leer();
      const p = db.pacientes[id];
      if (!p) return null;
      Object.assign(p, { checklist, actualizado_en: new Date().toISOString() });
      escribir(db);
      return publico(p);
    },
  };
}

function crearDB() {
  if (process.env.DATABASE_URL) return crearPostgres(process.env.DATABASE_URL);
  return crearArchivoJSON(path.join(__dirname, "db.json"));
}

module.exports = { crearDB };
