#!/bin/bash
# start.sh — inicia backend e frontend juntos

echo "🚀 Iniciando Rotina..."

# Backend
cd backend
python3 server.py &
BACKEND_PID=$!
echo "✓ Backend rodando na porta 3001 (PID: $BACKEND_PID)"

# Aguarda backend inicializar
sleep 1

# Frontend
cd ../frontend
echo "✓ Frontend disponível em http://localhost:3000"
REACT_APP_API_URL=http://localhost:3001 npm start

# Cleanup ao sair
trap "kill $BACKEND_PID" EXIT
