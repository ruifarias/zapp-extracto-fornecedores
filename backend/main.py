from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, date
from pydantic import BaseModel
from typing import Optional, List
import backend.db as db

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

@app.post("/api/extracto")
def get_extracto(request: ExtractoRequest):
    """Gerar extracto de conta corrente com saldo inicial e movimentos"""
    try:
        # Obter saldo inicial
        saldo_inicial = db.get_saldo_inicial(
            request.ano,
            request.codigo_conta
        )

        # Obter movimentos de contabilidade
        movimentos = db.get_movimentos_contabilidade(
            request.ano,
            request.codigo_conta,
            request.data_inicio,
            request.data_fim
        )

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

            # If payment, append sub-document lines (informational, no balance impact)
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
                            extracto_completo.append({
                                "tipo": "documento_pagamento",
                                "data_hora": item["data_hora"],
                                "descricao": f"  └─ {descricao} {numero_doc}" if numero_doc else f"  └─ {descricao}",
                                "numero_documento": numero_doc,
                                "valor": doc.get("valor_abatido", 0.0),
                                "tipo_movimento": "D",
                                "codigo_documento": doc.get("codigo_documento", ""),
                                "saldo_acumulado": saldo_acum
                            })
                    except Exception as e:
                        print(f"Erro ao buscar documentos de pagamento: {e}")

        return {
            "saldo_inicial": saldo_inicial,
            "extracto_completo": extracto_completo
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
