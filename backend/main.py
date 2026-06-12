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
def get_contas():
    """Obter lista de contas disponíveis"""
    try:
        contas = db.get_contas_disponiveis()
        return {"contas": contas}
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
            # Se não tiver data, usar 01/01 do ano solicitado
            data_saldo = saldo_inicial["data_hora"]
            if not data_saldo:
                data_saldo = f"{request.ano}-01-01"

            extracto_completo.append({
                "tipo": "saldo_inicial",
                "data_hora": data_saldo,
                "descricao": "Saldo Inicial",
                "abertura_debito": saldo_inicial["abertura_debito"],
                "abertura_credito": saldo_inicial["abertura_credito"],
                "saldo_acumulado": saldo_acum
            })

        # Adicionar movimentos
        extracto_completo.extend(movimentos)

        # Ordenar por data
        extracto_completo.sort(key=lambda x: x["data_hora"])

        # Calcular saldos acumulados para movimentos
        for item in extracto_completo:
            if item["tipo"] == "saldo_inicial":
                continue  # Saldo inicial já tem seu valor

            if item["tipo"] == "movimento":
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
