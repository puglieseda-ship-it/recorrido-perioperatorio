// Servidor — Recorrido Nutricional Perioperatorio
// Node puro: la única dependencia es `pg`, y solo se usa cuando hay
// DATABASE_URL (producción con Supabase). Sin DATABASE_URL guarda en db.json.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { crearDB } = require("./db");

const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = process.env.PORT || 3000;
const PRODUCCION = process.env.NODE_ENV === "production";
const MAX_BODY_BYTES = 10 * 1024;

const db = crearDB();

// ---------- Validación ----------

const ID_RE = /^[a-f0-9]{16,64}$/;
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHECKLIST_KEY_RE = /^(semana|vispera|dia)[0-9]$/;

function limpiarNombre(valor) {
  if (typeof valor !== "string") return "";
  // Sin caracteres de control, espacios colapsados, máximo 100 caracteres.
  return valor.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, 100);
}

function validarFecha(valor) {
  if (typeof valor !== "string" || !FECHA_RE.test(valor)) return null;
  const d = new Date(valor + "T00:00:00Z");
  if (isNaN(d) || d.toISOString().slice(0, 10) !== valor) return null;
  // Rango razonable: hasta 1 año atrás y 2 años adelante.
  const hoy = Date.now();
  const dia = 86400000;
  if (d.getTime() < hoy - 365 * dia || d.getTime() > hoy + 730 * dia) return null;
  return valor;
}

function validarChecklist(valor) {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const limpio = {};
  for (const [k, v] of Object.entries(valor)) {
    if (!CHECKLIST_KEY_RE.test(k)) return null;
    if (v) limpio[k] = true;
  }
  return limpio;
}

function validarDatosPaciente(body) {
  const fecha = validarFecha(body.fecha_cirugia);
  if (!fecha) return { error: "fecha_cirugia inválida (formato AAAA-MM-DD, dentro de un rango razonable)" };
  return { datos: { nombre: limpiarNombre(body.nombre), fecha_cirugia: fecha } };
}

// ---------- Límite de intentos (en memoria, por IP) ----------

const LIMITES = {
  crear: { max: 10, ventanaMs: 60 * 60 * 1000 }, // 10 pacientes nuevos por hora
  api: { max: 120, ventanaMs: 60 * 1000 }, // 120 pedidos por minuto
};
const contadores = new Map();

function ipDe(req) {
  // Render (y la mayoría de los hostings) pone la IP real en X-Forwarded-For.
  const fwd = req.headers["x-forwarded-for"];
  if (fwd) return String(fwd).split(",")[0].trim();
  return req.socket.remoteAddress || "desconocida";
}

function excedeLimite(req, tipo) {
  const { max, ventanaMs } = LIMITES[tipo];
  const clave = tipo + ":" + ipDe(req);
  const ahora = Date.now();
  let c = contadores.get(clave);
  if (!c || ahora > c.reinicio) {
    c = { cuenta: 0, reinicio: ahora + ventanaMs };
    contadores.set(clave, c);
  }
  c.cuenta++;
  return c.cuenta > max;
}

setInterval(() => {
  const ahora = Date.now();
  for (const [k, c] of contadores) if (ahora > c.reinicio) contadores.delete(k);
}, 10 * 60 * 1000).unref();

// ---------- Utilidades HTTP ----------

function headersSeguridad() {
  const h = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src https://fonts.gstatic.com",
      "img-src 'self' data:",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  };
  if (PRODUCCION) h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
  return h;
}

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    ...headersSeguridad(),
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

class ErrorHTTP extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const tipo = req.headers["content-type"] || "";
    if (!tipo.startsWith("application/json")) {
      req.resume();
      return reject(new ErrorHTTP(415, "Se espera Content-Type: application/json"));
    }
    let chunks = "";
    let bytes = 0;
    req.setEncoding("utf8");
    req.on("data", (c) => {
      bytes += Buffer.byteLength(c);
      if (bytes > MAX_BODY_BYTES) {
        // Se descarta el resto sin cortar la conexión, para poder responder el 413.
        req.removeAllListeners("data");
        req.removeAllListeners("end");
        req.resume();
        reject(new ErrorHTTP(413, "Pedido demasiado grande"));
        return;
      }
      chunks += c;
    });
    req.on("end", () => {
      try {
        const parsed = chunks ? JSON.parse(chunks) : {};
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        resolve(parsed);
      } catch (e) {
        reject(new ErrorHTTP(400, "JSON inválido"));
      }
    });
    req.on("error", reject);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

function serveStatic(req, res, url) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(url === "/" ? "/index.html" : url);
  } catch (e) {
    res.writeHead(400, headersSeguridad());
    return res.end("Pedido inválido");
  }
  const filePath = path.join(PUBLIC_DIR, urlPath);
  // Evitar path traversal fuera de /public
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403, headersSeguridad());
    return res.end("Prohibido");
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { ...headersSeguridad(), "Content-Type": "text/plain; charset=utf-8" });
      return res.end("No encontrado");
    }
    const ext = path.extname(filePath);
    const nombre = path.basename(filePath);
    // El HTML y el service worker se revalidan siempre, para que las
    // actualizaciones lleguen enseguida; los íconos se pueden cachear.
    const cache =
      ext === ".html" || nombre === "sw.js" || ext === ".webmanifest"
        ? "no-cache"
        : "public, max-age=86400";
    res.writeHead(200, {
      ...headersSeguridad(),
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": cache,
    });
    res.end(data);
  });
}

// ---------- Rutas ----------

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  try {
    if (url === "/healthz") return sendJSON(res, 200, { ok: true });

    if (url.startsWith("/api/") && excedeLimite(req, "api")) {
      return sendJSON(res, 429, { error: "Demasiados pedidos, probá de nuevo en un minuto" });
    }

    // Crear paciente: POST /api/pacientes  { nombre, fecha_cirugia }
    if (req.method === "POST" && url === "/api/pacientes") {
      if (excedeLimite(req, "crear")) {
        return sendJSON(res, 429, { error: "Demasiados registros desde esta conexión, probá más tarde" });
      }
      const { datos, error } = validarDatosPaciente(await readBody(req));
      if (error) return sendJSON(res, 400, { error });
      // 128 bits aleatorios: el id funciona como llave de acceso de la paciente.
      const id = crypto.randomBytes(16).toString("hex");
      const paciente = await db.crear({ id, ...datos });
      return sendJSON(res, 201, paciente);
    }

    let m = url.match(/^\/api\/pacientes\/([^/]+)$/);
    if (m) {
      if (!ID_RE.test(m[1])) return sendJSON(res, 404, { error: "No encontrado" });

      // Obtener paciente: GET /api/pacientes/:id
      if (req.method === "GET") {
        const paciente = await db.obtener(m[1]);
        if (!paciente) return sendJSON(res, 404, { error: "No encontrado" });
        return sendJSON(res, 200, paciente);
      }

      // Cambiar nombre o fecha: PUT /api/pacientes/:id  { nombre, fecha_cirugia }
      if (req.method === "PUT") {
        const { datos, error } = validarDatosPaciente(await readBody(req));
        if (error) return sendJSON(res, 400, { error });
        const paciente = await db.actualizarDatos(m[1], datos);
        if (!paciente) return sendJSON(res, 404, { error: "No encontrado" });
        return sendJSON(res, 200, paciente);
      }
    }

    // Actualizar checklist: PUT /api/pacientes/:id/checklist  { checklist }
    m = url.match(/^\/api\/pacientes\/([^/]+)\/checklist$/);
    if (req.method === "PUT" && m) {
      if (!ID_RE.test(m[1])) return sendJSON(res, 404, { error: "No encontrado" });
      const body = await readBody(req);
      const checklist = validarChecklist(body.checklist);
      if (!checklist) return sendJSON(res, 400, { error: "checklist inválido" });
      const paciente = await db.actualizarChecklist(m[1], checklist);
      if (!paciente) return sendJSON(res, 404, { error: "No encontrado" });
      return sendJSON(res, 200, paciente);
    }

    if (url.startsWith("/api/")) return sendJSON(res, 404, { error: "Ruta no encontrada" });

    // Archivos estáticos (el frontend)
    if (req.method === "GET" || req.method === "HEAD") {
      return serveStatic(req, res, url);
    }

    sendJSON(res, 405, { error: "Método no permitido" });
  } catch (e) {
    if (e instanceof ErrorHTTP) return sendJSON(res, e.status, { error: e.message });
    console.error(e);
    sendJSON(res, 500, { error: "Error interno" });
  }
});

db.iniciar()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`Servidor corriendo en http://localhost:${PORT}`);
      console.log(`Datos guardados en: ${db.tipo}`);
    });
  })
  .catch((e) => {
    console.error("No se pudo conectar con la base de datos:", e.message);
    process.exit(1);
  });
