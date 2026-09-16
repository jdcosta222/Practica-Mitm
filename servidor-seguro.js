// ============================================================
//  SERVIDOR SEGURO  —  https://localhost:3001
//  Usa HTTPS + cabeceras de defensa (HSTS, CSP, etc.)
//  Mismo flujo que servidor-legitimo: login, perfil, transferir
//  Requiere ejecutar generar-cert.sh primero.
// ============================================================

const https = require('https');
const http  = require('http');
const fs    = require('fs');
const path  = require('path');

const PORT_HTTPS = 3001;
const PORT_HTTP  = 3002;

let tlsOptions;
try {
  tlsOptions = {
    key:  fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
  };
} catch {
  console.error('❌  No se encontraron los certificados.');
  console.error('   Ejecuta primero:  bash generar-cert.sh');
  process.exit(1);
}

// ─── Usuarios simulados ───────────────────────────────────────
const USUARIOS = {
  jperez:   { nombre: 'Juan Pérez',     saldo: 5000000, contrasena: 'MiClave123' },
  mgarcia:  { nombre: 'María García',   saldo: 2300000, contrasena: 'Clave456'   },
  csanchez: { nombre: 'Carlos Sánchez', saldo: 8750000, contrasena: 'Pass789'    },
};

// ─── Sesiones y historial en memoria ─────────────────────────
const sesiones  = {};
const historial = [];

// ─── Cabeceras de defensa ─────────────────────────────────────
const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Content-Security-Policy':   "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;",
  'X-Frame-Options':           'DENY',
  'X-Content-Type-Options':    'nosniff',
  'Referrer-Policy':           'no-referrer',
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getToken(req) {
  return (req.headers['authorization'] || '').replace('Bearer ', '').trim();
}

// ─── Handler principal ────────────────────────────────────────
function handler(req, res) {
  Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  // ── GET / → página segura ─────────────────────────────────
  if (req.method === 'GET' && req.url === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'cliente', 'usuario-seguro.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ── POST /login ───────────────────────────────────────────
  if (req.method === 'POST' && req.url === '/login') {
    let body = '';
    req.on('data', c => (body += c.toString()));
    req.on('end', () => {
      try {
        const { usuario, contrasena } = JSON.parse(body);
        const user = USUARIOS[usuario];

        console.log('\n🔒 [SERVIDOR SEGURO] Login recibido por HTTPS ✓');
        console.log(`   Usuario    : ${usuario}`);
        console.log(`   Contraseña : ${contrasena}`);

        if (!user || user.contrasena !== contrasena) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, mensaje: 'Credenciales incorrectas' }));
          return;
        }

        const token = 'sec_' + Math.random().toString(36).slice(2, 10);
        sesiones[token] = { usuario, nombre: user.nombre, saldo: user.saldo };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok:        true,
          mensaje:   'Login seguro exitoso 🔒',
          protocolo: 'HTTPS',
          hsts:      true,
          token,
          usuario,
          nombre:    user.nombre,
        }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, mensaje: 'Datos inválidos' }));
      }
    });
    return;
  }

  // ── GET /perfil ───────────────────────────────────────────
  if (req.method === 'GET' && req.url === '/perfil') {
    const sesion = sesiones[getToken(req)];
    if (!sesion) { res.writeHead(401); res.end(JSON.stringify({ ok: false })); return; }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok:       true,
      usuario:  sesion.usuario,
      nombre:   sesion.nombre,
      saldo:    sesion.saldo,
      historial: historial.filter(t => t.origen === sesion.usuario),
    }));
    return;
  }

  // ── POST /transferir ──────────────────────────────────────
  if (req.method === 'POST' && req.url === '/transferir') {
    const sesion = sesiones[getToken(req)];
    if (!sesion) { res.writeHead(401); res.end(JSON.stringify({ ok: false, mensaje: 'No autenticado' })); return; }

    let body = '';
    req.on('data', c => (body += c.toString()));
    req.on('end', () => {
      try {
        const { destino, monto, descripcion } = JSON.parse(body);
        const montoNum = parseFloat(monto);

        console.log('\n🔒 [SERVIDOR SEGURO] Transferencia recibida por HTTPS ✓');
        console.log(`   De      : ${sesion.usuario}`);
        console.log(`   Destino : ${destino}`);
        console.log(`   Monto   : $${montoNum.toLocaleString('es-CO')}`);

        if (isNaN(montoNum) || montoNum <= 0) {
          res.writeHead(400); res.end(JSON.stringify({ ok: false, mensaje: 'Monto inválido' })); return;
        }
        if (montoNum > sesion.saldo) {
          res.writeHead(400); res.end(JSON.stringify({ ok: false, mensaje: 'Saldo insuficiente' })); return;
        }

        sesion.saldo -= montoNum;
        const tx = {
          id:          'STX' + Date.now(),
          hora:        new Date().toLocaleTimeString('es-CO'),
          origen:      sesion.usuario,
          destino,
          monto:       montoNum,
          descripcion: descripcion || '',
          saldo_nuevo: sesion.saldo,
        };
        historial.push(tx);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok:          true,
          mensaje:     '¡Transferencia segura realizada! 🔒',
          id:          tx.id,
          destino,
          monto:       montoNum,
          saldo_nuevo: sesion.saldo,
          protocolo:   'HTTPS',
        }));
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, mensaje: 'Datos inválidos' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

// ─── Servidor HTTPS ───────────────────────────────────────────
https.createServer(tlsOptions, handler).listen(PORT_HTTPS, () => {
  console.log('─'.repeat(50));
  console.log(`🟢  SERVIDOR SEGURO (HTTPS) en https://localhost:${PORT_HTTPS}`);
  console.log('─'.repeat(50));
  console.log('   Usuarios:');
  console.log('   • jperez / MiClave123');
  console.log('   • mgarcia / Clave456');
  console.log('   • csanchez / Pass789');
  console.log('─'.repeat(50));
  console.log('   ⚠️  Acepta el certificado auto-firmado en el navegador\n');
});

// ─── HTTP → redirige a HTTPS ──────────────────────────────────
http.createServer((req, res) => {
  res.writeHead(301, { Location: `https://localhost:${PORT_HTTPS}${req.url}` });
  res.end();
}).listen(PORT_HTTP, () => {
  console.log(`↩️   HTTP redirect en http://localhost:${PORT_HTTP} → https://localhost:${PORT_HTTPS}`);
});
