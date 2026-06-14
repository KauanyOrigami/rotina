# Rotina — Gestão inteligente de tempo

Sistema de planejamento de rotina com motor de agendamento baseado em carga cognitiva.

## Stack
- **Backend**: Python 3 + Flask + SQLite (nativo)
- **Frontend**: React 18 + React Router + date-fns

## Instalação

### Requisitos
- Python 3.8+
- Node.js 16+

### Backend
```bash
cd backend
pip install flask flask-cors
python3 server.py
# Rodando em http://localhost:3001
```

### Frontend
```bash
cd frontend
npm install
npm start
# Rodando em http://localhost:3000
```

Ou use o script de inicialização:
```bash
chmod +x start.sh
./start.sh
```

## Funcionalidades — Fase 1

### Configuração
- **Níveis de carga cognitiva**: defina etiquetas (Leve / Moderado / Pesado) com peso 1–5
- **Blocos fixos**: cadastre aulas e trabalho com dia/horário e nível de carga
- **Hábitos**: academia, leitura, estudo — com dias da semana e carga máxima tolerada

### Planejamento
- **Hoje**: janelas livres calculadas automaticamente com 2–3 sugestões por janela
- **Semana**: visão completa de blocos fixos + slots agendados
- **Tarefas**: cadastro com prazo, esforço, divisibilidade e permissão de fim de semana

### Lógica do alocador
1. Calcula peso do dia somando cargas dos blocos fixos
2. Mapeia janelas livres entre blocos
3. Filtra atividades compatíveis com a carga do dia
4. Gera 2–3 sugestões por janela, ordenadas por prioridade
5. Usuário confirma ou descarta

### Regras de priorização
- Hábitos com horário preferido são ancorados nesse horário
- Tarefas com prazo próximo têm prioridade maior
- Tarefas de esforço alto não aparecem em dias com carga ≥ 4
- Tarefas divisíveis podem ser alocadas em sessões menores
- Fim de semana requer configuração global + flag na tarefa

## Estrutura do projeto

```
rotina/
├── backend/
│   ├── server.py      # API Flask com todas as rotas
│   ├── database.py    # SQLite schema e inicialização
│   ├── scheduler.py   # Motor de agendamento
│   └── rotina.db      # Banco de dados (gerado automaticamente)
├── frontend/
│   └── src/
│       ├── App.jsx
│       ├── lib/api.js           # Cliente HTTP centralizado
│       ├── styles/global.css    # Design system completo
│       ├── components/Shared.jsx
│       └── pages/
│           ├── Today.jsx    # Plano do dia
│           ├── Week.jsx     # Visão semanal
│           ├── Tasks.jsx    # Gerenciamento de tarefas
│           ├── Setup.jsx    # Configuração base
│           └── Settings.jsx # Preferências
└── start.sh
```

## API endpoints

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /api/stress-levels | Lista níveis de carga |
| POST | /api/stress-levels | Cria nível |
| GET | /api/fixed-blocks | Lista blocos fixos |
| POST | /api/fixed-blocks | Cria bloco |
| GET | /api/habits | Lista hábitos |
| POST | /api/habits | Cria hábito |
| GET | /api/tasks | Lista tarefas |
| POST | /api/tasks | Cria tarefa |
| GET | /api/day-plan/:date | Gera/retorna plano do dia |
| GET | /api/week-plan?start= | Retorna plano semanal |
| PATCH | /api/slots/:id/status | Atualiza status do slot |
| GET/PATCH | /api/settings | Configurações globais |

## Fase 2 — Telegram (planejado)
- Bot que recebe tarefas em linguagem natural
- Alertas de hábitos via mensagem
- Confirmação do plano do dia pelo chat
- Sugestão automática de horários
