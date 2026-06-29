from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import db

app = FastAPI(title="Extracto Conta Corrente API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ExtractoRequest(BaseModel):
    ano: int
    codigo_conta: str
    data_inicio: date
    data_fim: date

class ExtractoResponse(BaseModel):
    saldo_inicial: Optional[dict]
    extracto_completo: List[dict]

@app.get("/api/health")
def health():
    return {"status": "ok"}

@app.get("/api/contas")
def get_contas(ano: Optional[int] = None):
    """Obter lista de contas disponíveis para um ano específico"""
    try:
        contas = db.get_contas_disponiveis(ano)
        return {"contas": contas}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/documentos-pagamento")
def get_documentos_pagamento(ano: int, codigo_serie: str, numero: str):
    """Obter documentos pagos de um pagamento específico"""
    try:
        documentos = db.get_documentos_pagamento(ano, codigo_serie, numero)
        return {"documentos": documentos}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/cheques-predatados")
def get_cheques_predatados(codigo_conta: str):
    """Obter cheques pré-datados não conciliados de um fornecedor"""
    try:
        # Extrair código de entidade (fornecedor) dos últimos 4 dígitos da conta
        codigo_entidade = codigo_conta.split(".")[-1] if "." in codigo_conta else codigo_conta[-4:]

        cheques = db.get_cheques_predatados(codigo_entidade)
        return {"cheques": cheques}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/nota-pagamento")
def get_nota_pagamento(ano: int, numero_pagamento: str, codigo_conta: str):
    """Obter dados completos para a Nota de Pagamento (e-mail ao fornecedor)"""
    try:
        # Extrair código de entidade (fornecedor) dos últimos 4 dígitos da conta
        codigo_entidade = codigo_conta.split(".")[-1] if "." in codigo_conta else codigo_conta[-4:]

        # Extrair parte numérica do número de pagamento (ex: 'PG4706' -> 4706)
        numero_num = int(''.join(filter(str.isdigit, numero_pagamento))) if numero_pagamento else 0

        documentos = db.get_documentos_pagamento(ano, numero_num, codigo_entidade)

        def iso(v):
            return v.isoformat() if hasattr(v, "isoformat") else v

        nome_fornecedor = ""
        numero_contribuinte = ""
        data_pagamento = None
        documentos_pagos = []
        total_pago = 0.0

        for doc in documentos:
            if not nome_fornecedor:
                nome_fornecedor = doc.get("nome") or ""
                numero_contribuinte = doc.get("numero_contribuinte") or ""
                data_pagamento = iso(doc.get("data_pagamento"))

            codigo_doc = str(doc.get("codigo_documento") or "").strip()
            valor_documento = doc.get("valor_documento", 0.0)
            valor_pago = doc.get("valor_abatido", 0.0)
            # Notas de crédito (3502) são apresentadas a negativo
            if codigo_doc == "3502":
                valor_documento = -valor_documento
                valor_pago = -valor_pago

            total_pago += valor_pago
            documentos_pagos.append({
                "data_vencimento": iso(doc.get("data_vencimento")),
                "data_recepcao": iso(doc.get("data_recepcao")),
                "data_documento": iso(doc.get("data_documento")),
                "codigo_documento": codigo_doc,
                "numero_documento": doc.get("numero_documento"),
                "valor_documento": valor_documento,
                "valor_pago": valor_pago,
                "liquidacao": doc.get("liquidacao"),
                "valor_pendente": valor_documento - valor_pago,
            })

        # Documentos por regularizar à data do e-mail
        documentos_por_regularizar = db.get_documentos_por_regularizar(ano, codigo_conta)
        for doc in documentos_por_regularizar:
            for k in ("data_vencimento", "data_recepcao", "data_documento"):
                doc[k] = iso(doc.get(k))

        return {
            "numero_pagamento": numero_pagamento,
            "nome_fornecedor": nome_fornecedor,
            "numero_contribuinte": numero_contribuinte,
            "data_pagamento": data_pagamento,
            "total_pago": total_pago,
            "documentos_pagos": documentos_pagos,
            "documentos_por_regularizar": documentos_por_regularizar,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/extracto")
def get_extracto(request: ExtractoRequest):
    """Gerar extracto de conta corrente com saldo inicial e movimentos"""
    try:
        # Obter saldo inicial
        saldo_inicial = db.get_saldo_inicial(
            request.ano,
            request.codigo_conta
        )

        # Converter data_hora do saldo_inicial para string
        if saldo_inicial and saldo_inicial.get('data_hora'):
            if hasattr(saldo_inicial['data_hora'], 'isoformat'):
                saldo_inicial['data_hora'] = saldo_inicial['data_hora'].isoformat()

        # Obter movimentos de contabilidade
        movimentos = db.get_movimentos_contabilidade(
            request.ano,
            request.codigo_conta,
            request.data_inicio,
            request.data_fim
        )

        # Filtrar movimentos por data
        from datetime import datetime as dt_parser
        data_inicio_dt = dt_parser.fromisoformat(str(request.data_inicio))
        data_fim_dt = dt_parser.fromisoformat(str(request.data_fim))

        movimentos_filtrados = []
        for movimento in movimentos:
            data_movimento = movimento.get("data_hora")
            if isinstance(data_movimento, str):
                data_movimento = dt_parser.fromisoformat(data_movimento[:10])
            if data_inicio_dt <= data_movimento <= data_fim_dt:
                movimentos_filtrados.append(movimento)

        movimentos = movimentos_filtrados

        # Inicializar saldo acumulado
        saldo_acum = saldo_inicial["abertura_debito"] - saldo_inicial["abertura_credito"] if saldo_inicial else 0.0

        # Criar linha de saldo inicial
        extracto_completo = []
        if saldo_inicial:
            # Sempre usar 01/01 do ano solicitado para o saldo de abertura
            data_saldo = f"{request.ano}-01-01"

            extracto_completo.append({
                "tipo": "saldo_inicial",
                "data_hora": data_saldo,
                "descricao": "Saldo Inicial",
                "abertura_debito": saldo_inicial["abertura_debito"],
                "abertura_credito": saldo_inicial["abertura_credito"],
                "saldo_acumulado": saldo_acum
            })

        # Extrair código de entidade (fornecedor) dos últimos 4 dígitos da conta
        codigo_entidade = request.codigo_conta.split(".")[-1] if "." in request.codigo_conta else request.codigo_conta[-4:]

        # Step 1: Build base list (saldo_inicial + movements only, no docs)
        extracto_base = []
        if saldo_inicial:
            data_saldo = f"{request.ano}-01-01"
            extracto_base.append({
                "tipo": "saldo_inicial",
                "data_hora": data_saldo,
                "descricao": "Saldo Inicial",
                "abertura_debito": saldo_inicial["abertura_debito"],
                "abertura_credito": saldo_inicial["abertura_credito"],
                "saldo_acumulado": saldo_acum
            })

        for movimento in movimentos:
            extracto_base.append(movimento)

        # Step 2: Convert datetime objects and sort
        from datetime import datetime as dt
        for item in extracto_base:
            if isinstance(item.get("data_hora"), dt):
                item["data_hora"] = item["data_hora"].isoformat()

        extracto_base.sort(key=lambda x: x["data_hora"])

        # Step 3: Final pass — calculate balance + insert docs after each payment
        extracto_completo = []
        for item in extracto_base:
            if item["tipo"] == "saldo_inicial":
                extracto_completo.append(item)
                continue

            # Update running balance (movements only)
            if item["tipo_movimento"] == "D":
                saldo_acum += item["valor"]
            else:
                saldo_acum -= item["valor"]
            item["saldo_acumulado"] = saldo_acum
            extracto_completo.append(item)

            # If payment (diário 05, código 5701), append sub-document lines
            if str(item.get("codigo_diario")) == "05" and int(item.get("codigo_documento") or 0) == 5701:
                numero_pagamento = item.get("numero_documento", "")
                if numero_pagamento:
                    try:
                        # Extract numeric part from payment number (e.g. 'PG4706' -> 4706)
                        numero_pagamento_num = int(''.join(filter(str.isdigit, numero_pagamento)))
                        documentos = db.get_documentos_pagamento(
                            request.ano,
                            numero_pagamento_num,
                            codigo_entidade
                        )
                        for doc in documentos:
                            numero_doc = doc.get("numero_documento", "")
                            descricao = doc.get('descricao_doc_regul', '')
                            codigo_doc = doc.get("codigo_documento", "")
                            valor = doc.get("valor_abatido", 0.0)
                            liquidacao = doc.get("liquidacao", "")
                            # Credit notes (3502) are shown as negative
                            if str(codigo_doc) == "3502":
                                valor = -valor
                            extracto_completo.append({
                                "tipo": "documento_pagamento",
                                "data_hora": item["data_hora"],
                                "descricao": f"  └─ {descricao} {numero_doc}" if numero_doc else f"  └─ {descricao}",
                                "numero_documento": numero_doc,
                                "valor": valor,
                                "tipo_movimento": "D",
                                "codigo_documento": codigo_doc,
                                "liquidacao": liquidacao,
                                "saldo_acumulado": 0.0
                            })
                    except Exception as e:
                        print(f"Erro ao buscar documentos de pagamento: {e}")


        # Add final balance line
        extracto_completo.append({
            "tipo": "saldo_final",
            "data_hora": "",
            "descricao": "Saldo Final",
            "saldo_acumulado": saldo_acum,
            "saldo_actual_db": saldo_inicial.get("saldo_actual", 0.0) if saldo_inicial else 0.0
        })

        # Get pending documents to be regularized
        documentos_por_regularizar = db.get_documentos_por_regularizar(
            request.ano,
            request.codigo_conta
        )

        # Marcar documentos por regularizar no extracto
        numeros_por_regularizar = set(str(doc.get("numero_documento", "")).strip() for doc in documentos_por_regularizar if doc.get("numero_documento"))

        for item in extracto_completo:
            if item.get("tipo") == "movimento":
                numero_doc = str(item.get("numero_documento", "")).strip() if item.get("numero_documento") else ""
                if numero_doc in numeros_por_regularizar:
                    item["por_regularizar"] = True

        return {
            "saldo_inicial": saldo_inicial,
            "extracto_completo": extracto_completo,
            "documentos_por_regularizar": documentos_por_regularizar
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve static files from frontend build
frontend_dir = os.path.join(os.path.dirname(__file__), '..', 'frontend', 'dist')
if os.path.exists(frontend_dir):
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dir, 'assets')), name="assets")

@app.get("/")
async def serve_root():
    """Serve index.html for SPA"""
    index_file = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"error": "Frontend not built"}

@app.get("/{path_name:path}")
async def serve_spa(path_name: str):
    """Serve index.html for all non-API routes (SPA routing)"""
    if path_name.startswith('api/'):
        return {"error": "Not found"}

    index_file = os.path.join(frontend_dir, 'index.html')
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"error": "Frontend not built"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
