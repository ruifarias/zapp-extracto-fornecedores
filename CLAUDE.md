# Zapp - Extracto Fornecedor

## Visão Geral

Aplicação interactiva para consultar e visualizar extractos de conta corrente de fornecedores a partir da base de dados DBClassico. O projecto é completamente independente e reutiliza a mesma conexão e estrutura de dados.

## Stack Tecnológico

- **Backend**: Python + FastAPI
- **Frontend**: React 18 + TypeScript + Vite
- **Database**: SQL Server (ODBC)
- **Servidor**: Uvicorn (backend), Vite Dev Server (frontend)

## Estrutura do Projecto

```
zapp-extracto-fornecedor/
├── backend/
│   ├── __init__.py
│   ├── db.py           # Conexão e queries à BD
│   └── main.py         # APIs FastAPI
├── frontend/
│   ├── src/
│   │   ├── App.tsx     # Componente principal
│   │   ├── App.css     # Estilos
│   │   ├── index.css   # Estilos globais
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── requirements.txt
├── .gitignore
└── README.md
```

## Configuração da Base de Dados

A conexão usa Windows Authentication (GIWINDOWS):
- **Server**: TSERVER\SQLSERVER
- **Database**: DBClassico
- **Driver**: ODBC Driver 18 for SQL Server

As tabelas utilizadas:
- `TB0001CntAcumulPOC` - Saldos iniciais por conta
- `TB0001CntLancLin` - Movimentos de contabilidade
- `TB0001TesPagamento` - Dados dos pagamentos
- `TB0001TesDocRegAbatidos` - Documentos regularizados

## Funcionalidades Principais

### Filtros
- **Fornecedor**: Lista carregada dinamicamente da BD
- **Ano**: Seleccionar ano (default: ano actual)
- **Data Início/Fim**: Período personalizável
- **Código Conta**: Parametrizável (default: 22.1.1.2.0116)

### Extracto
- **Saldo Inicial**: Abertura Débito/Crédito e saldo
- **Movimentos**: Organizados por data com tipo e valor
- **Saldo Acumulado**: Coluna dinâmica que reflecte saldo por cada movimento
  - Débito (D): valor positivo
  - Crédito (C): valor negativo
  - Pagamentos: reduzem saldo do fornecedor

## APIs

### GET `/api/health`
Health check da aplicação.

### GET `/api/fornecedores`
Lista de fornecedores distintos com nome e número de contribuinte.

### POST `/api/extracto`
Gera extracto completo com saldo inicial, movimentos e pagamentos.

**Request**:
```json
{
  "ano": 2026,
  "codigo_fornecedor": "F001",
  "codigo_conta": "22.1.1.2.0116",
  "data_inicio": "2026-01-01",
  "data_fim": "2026-12-31"
}
```

**Response**:
```json
{
  "saldo_inicial": {...},
  "movimentos": [...],
  "pagamentos": [...],
  "extracto_completo": [...]  // Ordenado por data com saldo acumulado
}
```

## Desenvolvimento

### Setup
```bash
# Backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### Executar
```bash
# Terminal 1 - Backend
python -m backend.main  # Porta 8001

# Terminal 2 - Frontend
cd frontend && npm run dev  # Porta 5173
```

Acede em `http://localhost:5173`

**Portas:**
- Backend: 8001 (não conflita com zapp-reposicoes que usa 8000)
- Frontend: 5173

### Build Produção
```bash
cd frontend
npm run build
```

## Notas Importantes

- Frontend faz proxy de `/api` para `http://localhost:8000`
- Saldo acumulado é calculado em tempo real no backend
- Débitos são movimentos positivos, Créditos são negativos
- Pagamentos reduzem o saldo do fornecedor (débito)
- Todos os valores são formatados em EUR com 2 casas decimais
