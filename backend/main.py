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

        # Adicionar movimentos com documentos de pagamentos
        for movimento in movimentos:
            extracto_completo.append(movimento)

            # Se for um pagamento (diário 05, código 5701), buscar documentos
            if str(movimento.get("codigo_diario")) == "05" and int(movimento.get("codigo_documento") or 0) == 5701:
                try:
                    # Buscar número de pagamento a partir do número de documento
                    numero_pagamento = movimento.get("numero_documento_interno", "")
                    codigo_serie = "PG"  # Série padrão para pagamentos

                    print(f"DEBUG: Buscando documentos para pagamento {numero_pagamento}, série {codigo_serie}")

                    if numero_pagamento:
                        documentos = db.get_documentos_pagamento(
                            request.ano,
                            codigo_serie,
                            numero_pagamento
                        )

                        print(f"DEBUG: Encontrados {len(documentos)} documentos")

                        # Adicionar documentos como linhas filhas
                        for doc in documentos:
                            extracto_completo.append({
                                "tipo": "documento_pagamento",
                                "data_hora": doc.get("data_documento", ""),
                                "descricao": f"  └─ {doc.get('descricao_doc_regul', '')}",
                                "numero_documento": doc.get("numero_documento", ""),
                                "valor": doc.get("valor_abatido", 0.0),
                                "tipo_movimento": "D",
                                "saldo_acumulado": 0.0,
                                "parent_idx": len(extracto_completo) - 1
                            })
                except Exception as e:
                    print(f"Erro ao buscar documentos de pagamento: {e}")

        # Converter todas as datas para string no formato ISO para ordenação consistente
        from datetime import datetime as dt
        for item in extracto_completo:
            if isinstance(item["data_hora"], dt):
                item["data_hora"] = item["data_hora"].isoformat()

        # Ordenar por data
        extracto_completo.sort(key=lambda x: x["data_hora"])

        # Calcular saldos acumulados para movimentos e documentos
        for item in extracto_completo:
            if item["tipo"] == "saldo_inicial":
                continue  # Saldo inicial já tem seu valor

            if item["tipo"] in ["movimento", "documento_pagamento"]:
                # D = débito (positivo), C = crédito (negativo)
                if item["tipo_movimento"] == "D":
                    saldo_acum += item["valor"]
                else:
                    saldo_acum -= item["valor"]

            item["saldo_acumulado"] = saldo_acum

        return {
            "saldo_inicial": saldo_inicial,
            "extracto_completo": extracto_completo
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
