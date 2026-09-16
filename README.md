# Práctica Man-in-the-Middle (MitM) — Demo Educativa Local

> ⚠️ Este proyecto es exclusivamente para uso educativo en entorno local. No debe ejecutarse en redes ajenas ni con fines maliciosos.

---

## ¿Qué es un ataque Man-in-the-Middle?

Un ataque Man-in-the-Middle (MitM) ocurre cuando un atacante se posiciona **entre el usuario y el servidor** de forma invisible. El usuario cree que se comunica directamente con el servidor legítimo, pero en realidad todas sus peticiones pasan primero por el atacante, quien puede:

- **Leer** credenciales y datos sensibles en texto plano
- **Modificar** el contenido de las peticiones antes de reenviarlas (ej. cambiar el monto o destino de una transferencia)
- **Suplantar** respuestas del servidor

La víctima no nota nada: recibe respuestas normales, su sesión funciona, pero sus datos ya fueron comprometidos.

---

## Estructura del proyecto

```
mitm-practica/
├── servidor-legitimo.js     # Simula el servidor del banco (HTTP :3000)
├── atacante-mitm.js         # Proxy interceptor + panel de control (:8080 / :8081)
├── servidor-seguro.js       # Servidor con HTTPS y defensas activas (:3001)
├── generar-cert.sh          # Genera el certificado TLS auto-firmado
├── certs/                   # Certificados generados (key.pem, cert.pem)
└── cliente/
    ├── usuario.html          # Página de la víctima — escenario vulnerable
    ├── usuario-seguro.html   # Página de la víctima — escenario seguro
    └── panel-atacante.html   # Panel del atacante con credenciales y transferencias
```

---

## Usuarios disponibles

Tanto el servidor legítimo como el seguro usan los mismos usuarios:

| Usuario | Contraseña | Saldo inicial |
|---|---|---|
| jperez | MiClave123 | $5.000.000 |
| mgarcia | Clave456 | $2.300.000 |
| csanchez | Pass789 | $8.750.000 |

---

## Cómo ejecutarlo

### Requisitos
- Node.js instalado
- Para el servidor seguro: OpenSSL disponible (para generar certificados)

### Escenario 1 — Ataque completo (vulnerable)

Abre **dos terminales**:

```bash
# Terminal 1
node servidor-legitimo.js

# Terminal 2
node atacante-mitm.js
```

| URL | Qué es |
|---|---|
| `http://localhost:3000` | Página de login de la víctima |
| `http://localhost:8081` | Panel del atacante |

### Escenario 2 — Defensa con HTTPS

Primero generar los certificados (solo una vez):

```bash
bash generar-cert.sh
```

Luego levantar el servidor seguro:

```bash
node servidor-seguro.js
```

Abrir `https://localhost:3001` en el navegador y aceptar la advertencia del certificado auto-firmado.

---

## Guía de exposición — paso a paso

### Parte 1: Presentar el escenario vulnerable

**Antes de empezar:** tener corriendo `servidor-legitimo.js` y `atacante-mitm.js`. Abrir dos ventanas del navegador: `localhost:3000` (víctima) y `localhost:8081` (atacante).

**Paso 1 — Mostrar la página de login**

Abrir `http://localhost:3000`. Señalar el selector de red en la esquina superior:
- 🟢 Red normal → la víctima se conecta directamente al banco (puerto 3000)
- 🔴 Red comprometida → la víctima se conecta al atacante (puerto 8080), que actúa de intermediario

Explicar que en la vida real el usuario no tiene ese selector visible: la red ya está comprometida sin que él lo sepa (por ARP Spoofing, DNS Spoofing, Wi-Fi falso, etc.).

**Paso 2 — Robo de credenciales**

Con 🔴 Red comprometida activa, ingresar las credenciales (`jperez / MiClave123`) y hacer clic en Iniciar sesión. La consola de red muestra que la petición pasó por el puerto 8080. Cambiar al panel del atacante (`localhost:8081`, pestaña Credenciales): las credenciales aparecen capturadas con usuario y contraseña en texto plano.

Punto clave para señalar: la víctima recibió "Login exitoso" y accedió al banco con normalidad. No hay ninguna señal de que algo salió mal.

**Paso 3 — Modificación de transferencia**

Desde el panel del banco (post-login), llenar el formulario de transferencia:
- Destino: `mgarcia`
- Monto: `$100.000`

Antes de hacer clic en Enviar, cambiar al panel del atacante (pestaña Transferencias). Enviar la transferencia desde la página de la víctima. En el panel del atacante aparece una tarjeta amarilla **⏳ PENDIENTE** con un contador de 30 segundos.

Modificar los valores:
- Nuevo destino: `csanchez`
- Nuevo monto: `$500.000`

Hacer clic en **💀 Modificar y enviar**. Volver a la página de la víctima: verá "Transferencia confirmada" pero la consola mostrará el aviso en rojo de que el atacante alteró el monto y el destino. El historial también muestra los valores originales con la nota de lo que el banco realmente cobró.

Punto clave: el servidor legítimo procesó `$500.000` a `csanchez`. La víctima creía haber enviado `$100.000` a `mgarcia`.

---

### Parte 2: Presentar la defensa con HTTPS

**Paso 4 — Mostrar el servidor seguro**

Abrir `https://localhost:3001`. El navegador muestra advertencia por el certificado auto-firmado (en producción sería un certificado válido de una CA). Aceptar y acceder. Señalar el banner de defensas activas antes de hacer login.

**Paso 5 — Login seguro**

Hacer login con las mismas credenciales. La consola de red muestra el handshake TLS y la verificación del certificado. Mostrar las cabeceras de seguridad recibidas: HSTS, CSP, X-Frame-Options.

Cambiar al panel del atacante (`localhost:8081`): **no aparece nada nuevo**. El proxy en el puerto 8080 nunca estuvo en el camino porque la página segura va directamente a `https://localhost:3001`.

**Paso 6 — Transferencia segura**

Hacer una transferencia desde el servidor seguro. La consola confirma que los datos viajan cifrados. El atacante no intercepta nada porque:
1. La página va directo a `:3001`, sin pasar por el proxy `:8080`
2. Incluso si el atacante estuviera en el camino, los datos viajan cifrados con TLS y no puede leerlos ni modificarlos sin invalidar el certificado

---

### Tabla comparativa para la exposición

| Aspecto | HTTP (vulnerable) | HTTPS (seguro) |
|---|---|---|
| Credenciales | Visibles en texto plano | Cifradas — ilegibles |
| Transferencia | El atacante puede modificar monto y destino | Íntegra — no puede ser alterada |
| Detección | La víctima no nota nada (sin defensa) | El navegador bloquea si el certificado es inválido |
| HSTS | No existe | El navegador fuerza HTTPS siempre |
| Panel del atacante | Captura todo | No captura nada |

---

## Cómo funciona el ataque — flujo técnico

```
[Víctima - navegador]
        │
        │  POST /login { usuario, contraseña }  ← texto plano, legible
        ▼
[Atacante - puerto 8080]
        │  1. Lee y guarda credenciales
        │  2. POST /transferir → retiene la petición
        │  3. Espera decisión del atacante en el panel
        │  4. Reenvía la versión (posiblemente modificada) al servidor
        ▼
[Servidor legítimo - puerto 3000]
        │  Procesa lo que recibió (puede ser datos alterados)
        │  Responde con "éxito"
        ▼
[Atacante - puerto 8080]
        │  Devuelve la respuesta a la víctima
        ▼
[Víctima - navegador]
        Recibe "Transferencia exitosa" — no sospecha nada
```

---

## Por qué HTTPS rompe el ataque

Con HTTP el body de la petición viaja así:

```
POST /transferir HTTP/1.1
{"destino":"mgarcia","monto":100000}   ← el atacante lo lee y modifica
```

Con HTTPS el mismo body viaja cifrado:

```
POST /transferir HTTP/1.1
[bytes cifrados con la clave privada del servidor — ilegibles sin ella]
```

Además, si el atacante intenta suplantar al servidor presentando su propio certificado, el navegador detecta que no fue firmado por una CA reconocida y bloquea la conexión antes de transmitir cualquier dato. La víctima ve un error de certificado en lugar de la página, lo que en la práctica detiene el ataque.

---

## Resumen de puertos

| Puerto | Proceso | Descripción |
|---|---|---|
| 3000 | `servidor-legitimo.js` | Servidor HTTP vulnerable |
| 3001 | `servidor-seguro.js` | Servidor HTTPS seguro |
| 3002 | `servidor-seguro.js` | Redirect HTTP → HTTPS |
| 8080 | `atacante-mitm.js` | Proxy interceptor |
| 8081 | `atacante-mitm.js` | Panel de control del atacante |

---

## Técnicas reales de posicionamiento MitM

En este demo el usuario elige manualmente conectarse al proxy (selector de red). En un ataque real el atacante usaría:

| Técnica | Cómo funciona |
|---|---|
| **ARP Spoofing** | Envía respuestas ARP falsas para asociar su MAC con la IP del router. Todo el tráfico de la red local pasa por él. |
| **DNS Spoofing** | Falsifica respuestas DNS para que `banco.com` apunte a la IP del atacante. |
| **Rogue Access Point** | Crea una red Wi-Fi con el mismo nombre que una legítima. Las víctimas se conectan pensando que es la original. |
| **SSL Stripping** | Degrada conexiones HTTPS a HTTP eliminando los redirects. HSTS lo previene. |

---

## Conclusión

Este proyecto demuestra que **HTTP nunca debe usarse para transmitir datos sensibles**. El ataque MitM sobre HTTP es trivial: credenciales robadas y transferencias alteradas sin que la víctima note nada.

La defensa mínima requerida es **HTTPS con certificado válido y HSTS activo**. Con eso, incluso si el atacante está físicamente en la red, los datos viajan cifrados e íntegros, y cualquier intento de suplantación es bloqueado por el navegador.
