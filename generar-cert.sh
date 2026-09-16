#!/bin/bash
# Genera un certificado TLS auto-firmado para el demo local
mkdir -p certs
openssl req -x509 -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out    certs/cert.pem \
  -days   365 -nodes \
  -subj   "/C=CO/ST=Narino/L=Pasto/O=Demo/CN=localhost"

echo ""
echo "✅  Certificados generados en ./certs/"
echo "   key.pem  →  clave privada"
echo "   cert.pem →  certificado público"
