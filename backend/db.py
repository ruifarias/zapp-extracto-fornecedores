import pyodbc

CONN_STR = (
    "DRIVER={ODBC Driver 18 for SQL Server};"
    "SERVER=TSERVER\\SQLSERVER;"
    "DATABASE=DBClassico;"
    "UID=GIWINDOWS;"
    "PWD=GIWINDOWS;"
    "TrustServerCertificate=yes;"
)

def get_connection():
    return pyodbc.connect(CONN_STR)

def get_saldo_inicial(ano: int, codigo_conta: str, codigo_moeda: str = "001"):
    """Obter saldo inicial (abertura) do fornecedor"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT
            Abertura_C,
            Abertura_D,
            Saldo_Actual,
            Data_Hora
        FROM [DBClassico].[dbo].[TB0001CntAcumulPOC]
        WHERE ano = ?
            AND Codigo_Conta = ?
            AND Codigo_Moeda = ?
            AND Tipo_Acumulado = 'B'
        """

        cursor.execute(query, (ano, codigo_conta, codigo_moeda))
        row = cursor.fetchone()
        conn.close()

        if row:
            return {
                "abertura_credito": float(row[0]) if row[0] else 0.0,
                "abertura_debito": float(row[1]) if row[1] else 0.0,
                "saldo_actual": float(row[2]) if row[2] else 0.0,
                "data_hora": row[3]
            }
        return None
    except Exception as e:
        print(f"Erro ao obter saldo inicial: {e}")
        return None

def get_movimentos_contabilidade(ano: int, codigo_conta: str, data_inicio, data_fim):
    """Obter movimentos de contabilidade (débito/crédito)"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT
            Ano,
            Codigo_Diario,
            Numero_Documento_Interno,
            Numero_Linha,
            Tipo_Movimento,
            Codigo_Conta,
            Valor,
            Codigo_Documento,
            Numero_Documento,
            Data_Hora
        FROM [DBClassico].[dbo].[TB0001CntLancLin]
        WHERE Ano = ?
            AND Codigo_Conta = ?
            AND Data_Hora >= ?
            AND Data_Hora <= ?
        ORDER BY Data_Hora
        """

        cursor.execute(query, (ano, codigo_conta, data_inicio, data_fim))
        rows = cursor.fetchall()
        conn.close()

        movimentos = []
        for row in rows:
            movimentos.append({
                "ano": row[0],
                "codigo_diario": row[1],
                "numero_documento_interno": row[2],
                "numero_linha": row[3],
                "tipo_movimento": row[4],  # D ou C
                "codigo_conta": row[5],
                "valor": float(row[6]) if row[6] else 0.0,
                "codigo_documento": row[7],
                "numero_documento": row[8],
                "data_hora": row[9],
                "tipo": "movimento"
            })

        return movimentos
    except Exception as e:
        print(f"Erro ao obter movimentos: {e}")
        return []

def get_pagamentos_e_documentos(ano: int, codigo_entidade_fornecedor: str, data_inicio, data_fim):
    """Obter pagamentos e documentos regularizados/abatidos"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT
            tp.Codigo_Serie,
            tp.Numero,
            tp.Tipo_Pagamento,
            tp.Tipo_Entidade_Fornecedor,
            tp.Codigo_Entidade_Fornecedor,
            tp.Numero_Contribuinte,
            tp.Data,
            tp.Nome,
            tp.Valor_Pagamento_Liquido,
            tp.Retencao_Fonte,
            td.Tipo_Movimento,
            td.Codigo_Documento,
            td.Descricao_Doc_Regul,
            td.Numero_Documento,
            td.Data_Recepcao,
            td.Data_Vencimento,
            td.Data_Documento,
            td.Valor_Documento,
            td.Valor_Abatido,
            td.Liquidacao
        FROM [DBClassico].[dbo].[TB0001TesPagamento] tp
        INNER JOIN [DBClassico].[dbo].[TB0001TesDocRegAbatidos] td ON
            td.ano = tp.ano
            AND td.Codigo_Serie = tp.Codigo_Serie
            AND td.Numero_Pagamento = tp.Numero
        WHERE tp.ano = ?
            AND tp.Codigo_Entidade_Fornecedor = ?
            AND tp.Data >= ?
            AND tp.Data <= ?
        ORDER BY tp.Data, tp.Numero
        """

        cursor.execute(query, (ano, codigo_entidade_fornecedor, data_inicio, data_fim))
        rows = cursor.fetchall()
        conn.close()

        pagamentos = []
        for row in rows:
            pagamentos.append({
                "codigo_serie": row[0],
                "numero": row[1],
                "tipo_pagamento": row[2],
                "tipo_entidade_fornecedor": row[3],
                "codigo_entidade_fornecedor": row[4],
                "numero_contribuinte": row[5],
                "data": row[6],
                "nome": row[7],
                "valor_pagamento_liquido": float(row[8]) if row[8] else 0.0,
                "retencao_fonte": float(row[9]) if row[9] else 0.0,
                "tipo_movimento": row[10],
                "codigo_documento": row[11],
                "descricao_doc_regul": row[12],
                "numero_documento": row[13],
                "data_recepcao": row[14],
                "data_vencimento": row[15],
                "data_documento": row[16],
                "valor_documento": float(row[17]) if row[17] else 0.0,
                "valor_abatido": float(row[18]) if row[18] else 0.0,
                "liquidacao": row[19],
                "tipo": "pagamento"
            })

        return pagamentos
    except Exception as e:
        print(f"Erro ao obter pagamentos: {e}")
        return []

def get_fornecedores():
    """Obter lista de fornecedores distintos"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT DISTINCT
            tp.Codigo_Entidade_Fornecedor,
            tp.Nome,
            tp.Numero_Contribuinte
        FROM [DBClassico].[dbo].[TB0001TesPagamento] tp
        WHERE tp.ano = YEAR(GETDATE())
        ORDER BY tp.Nome
        """

        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        fornecedores = []
        for row in rows:
            fornecedores.append({
                "codigo": row[0],
                "nome": row[1],
                "numero_contribuinte": row[2]
            })

        return fornecedores
    except Exception as e:
        print(f"Erro ao obter fornecedores: {e}")
        return []
