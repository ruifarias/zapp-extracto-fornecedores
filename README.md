# Zapp - Extracto Fornecedor

Aplicação interactiva para consultar e visualizar extracto de conta corrente de fornecedores a partir da base de dados DBClassico.

## Funcionalidades

- **Filtro por Fornecedor**: Seleccione um fornecedor da lista
- **Período Personalizável**: Escolha data inicial e final (default: ano actual)
- **Saldo Inicial**: Visualize o saldo de abertura do fornecedor
- **Movimentos de Contabilidade**: Débitos (positivos) e Créditos (negativos)
- **Documentos Liquidados**: Pagamentos e documentos regularizados
- **Saldo Acumulado**: Acompanhe o saldo por cada movimento

## Tabelas Utilizadas

- `[DBClassico].[dbo].[TB0001CntAcumulPOC]` - Saldos iniciais por conta
- `[DBClassico].[dbo].[TB0001CntLancLin]` - Movimentos de contabilidade
- `[DBClassico].[dbo].[TB0001TesPagamento]` - Dados dos pagamentos
- `[DBClassico].[dbo].[TB0001TesDocRegAbatidos]` - Documentos regularizados

## Setup

### Backend (Python)

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend (Node.js)

```bash
cd frontend
npm install
```

## Execução

### Backend (em uma terminal)

```bash
python -m backend.main
```

Server estará disponível em `http://localhost:8002`

### Frontend (em outra terminal)

```bash
cd frontend
npm run dev
```

Aplicação estará disponível em `http://localhost:5173`

**Nota:** Porta 8002 é fixa e configurada permanentemente. Ver `PORTAS.md` na raiz dos projectos para registo centralizado de portas.

## Build para Produção

### Frontend

```bash
cd frontend
npm run build
```

Ficheiros compilados em `frontend/dist/`
