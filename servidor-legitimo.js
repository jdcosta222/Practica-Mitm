// ============================================================
//  SERVIDOR LEGÍTIMO  —  http://localhost:3000
//  Simula un servidor real de banco.
//  Maneja login, perfil y transferencias.
// ============================================================

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = 3000;

// ─── Usuarios simulados ───────────────────────────────────────
const USUARIOS = {
  jperez:   { nombre: 'Juan Pérez',   saldo: 5000000, contrasena: 'MiClave123' },
  mgarcia:  { nombre: 'María García', saldo: 2300000, contrasena: 'Clave456'   },
  csanchez: { nombre: 'Carlos Sánchez', saldo: 8750000, contrasena: 'Pass789'  },
};

// ─── Sesiones activas en memoria ─────────────────────────────
// token → { usuario, nombre, saldo }
const sesiones = {};

// ─── Historial de transferencias ─────────────────────────────
const historial = [];

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getToken(req) {
  const auth = req.headers['authorization'] || '';
  return auth.replace('Bearer ', '').trim();
}

const server = http.createServer((req, res) => {

  if (req.method === 'OPTIONS') {
    res.writeHead(200, CORS);
    res.end();
    return;
  }

  // ── GET / → sirve la página HTML del usuario ──────────────
  if (req.method === 'GET' && req.url === '/') {
    const html = fs.readFileSync(path.join(__dirname, 'cliente', 'usuario.html'));
    res.writeHead(200, { ...CORS, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  // ── POST /login → autentica y devuelve token ──────────────
  if (req.method === 'POST' && req.url === '/login') {
    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        const { usuario, contrasena } = JSON.parse(body);
        const user = USUARIOS[usuario];

        console.log('\n📥 [SERVIDOR LEGÍTIMO] Petición de login recibida');
        console.log(`   Usuario    : ${usuario}`);
        console.log(`   Contraseña : ${contrasena}`);
        console.log(`   IP origen  : ${req.socket.remoteAddress}`);

        if (!user || user.contrasena !== contrasena) {
          res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, mensaje: 'Credenciales incorrectas' }));
          return;
        }

        const token = 'tok_' + Math.random().toString(36).slice(2, 10);
        sesiones[token] = { usuario, nombre: user.nombre, saldo: user.saldo };

        console.log(`   ✅ Login exitoso — token: ${token}`);

        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok:      true,
          mensaje: '¡Login exitoso!',
          token,
          usuario,
          nombre:  user.nombre,
        }));
      } catch {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ ok: false, mensaje: 'Datos inválidos' }));
      }
    });
    return;
  }

  // ── GET /perfil → devuelve datos del usuario autenticado ──
  if (req.method === 'GET' && req.url === '/perfil') {
    const token = getToken(req);
    const sesion = sesiones[token];

    if (!sesion) {
      res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: 'No autenticado' }));
      return;
    }

    res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok:      true,
      usuario: sesion.usuario,
      nombre:  sesion.nombre,
      saldo:   sesion.saldo,
      historial: historial.filter(t => t.origen === sesion.usuario),
    }));
    return;
  }

  // ── POST /transferir → procesa una transferencia ──────────
  if (req.method === 'POST' && req.url === '/transferir') {
    const token = getToken(req);
    const sesion = sesiones[token];

    if (!sesion) {
      res.writeHead(401, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, mensaje: 'No autenticado' }));
      return;
    }

    let body = '';
    req.on('data', chunk => (body += chunk.toString()));
    req.on('end', () => {
      try {
        const { destino, monto, descripcion } = JSON.parse(body);
        const montoNum = parseFloat(monto);

        console.log('\n💸 [SERVIDOR LEGÍTIMO] Transferencia recibida');
        console.log(`   De         : ${sesion.usuario} (${sesion.nombre})`);
        console.log(`   Destino    : ${destino}`);
        console.log(`   Monto      : $${montoNum.toLocaleString('es-CO')}`);
        console.log(`   Descripción: ${descripcion || '—'}`);

        if (isNaN(montoNum) || montoNum <= 0) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, mensaje: 'Monto inválido' }));
          return;
        }

        if (montoNum > sesion.saldo) {
          res.writeHead(400, { ...CORS, 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, mensaje: 'Saldo insuficiente' }));
          return;
        }

        // Procesar transferencia
        sesion.saldo -= montoNum;
        const tx = {
          id:          'TX' + Date.now(),
          hora:        new Date().toLocaleTimeString('es-CO'),
          origen:      sesion.usuario,
          destino,
          monto:       montoNum,
          descripcion: descripcion || '',
          saldo_nuevo: sesion.saldo,
        };
        historial.push(tx);

        console.log(`   ✅ Transferencia procesada — nuevo saldo: $${sesion.saldo.toLocaleString('es-CO')}`);

        res.writeHead(200, { ...CORS, 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok:         true,
          mensaje:    '¡Transferencia realizada!',
          id:         tx.id,
          destino,
          monto:      montoNum,
          saldo_nuevo: sesion.saldo,
        }));
      } catch {
        res.writeHead(400, CORS);
        res.end(JSON.stringify({ ok: false, mensaje: 'Datos inválidos' }));
      }
    });
    return;
  }

  res.writeHead(404, CORS);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log('─'.repeat(50));
  console.log(`✅  SERVIDOR LEGÍTIMO corriendo en http://localhost:${PORT}`);
  console.log('─'.repeat(50));
  console.log('   Usuarios disponibles:');
  console.log('   • jperez   / MiClave123  — saldo: $5.000.000');
  console.log('   • mgarcia  / Clave456    — saldo: $2.300.000');
  console.log('   • csanchez / Pass789     — saldo: $8.750.000');
  console.log('─'.repeat(50));
  console.log('   Abre http://localhost:3000 en el navegador\n');
});
