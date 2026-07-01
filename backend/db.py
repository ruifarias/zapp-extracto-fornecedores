import pyodbc
from datetime import datetime

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
    """Obter saldo inicial (abertura) da conta"""
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
    """Obter movimentos de contabilidade (débito/crédito) da conta - Diários 01, 02, 04 e 05
    Usa DATA_DOCUMENTO de TB0001CntLancCab (data correta do documento) em vez de Data_Hora"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT
            lin.Ano,
            lin.Codigo_Diario,
            lin.Numero_Documento_Interno,
            lin.Numero_Linha,
            lin.Tipo_Movimento,
            lin.Codigo_Conta,
            lin.Valor,
            lin.Codigo_Documento,
            lin.Numero_Documento,
            cab.Data_Documento
        FROM [DBClassico].[dbo].[TB0001CntLancLin] lin
        LEFT JOIN [DBClassico].[dbo].[TB0001CntLancCab] cab
            ON lin.Codigo_Diario = cab.Codigo_Diario
            AND lin.Numero_Documento_Interno = cab.Numero_Documento_Interno
            AND lin.Ano = cab.Ano
        WHERE lin.Ano = ?
            AND lin.Codigo_Conta = ?
            AND lin.Codigo_Diario IN ('01', '02', '04', '05')
        ORDER BY cab.Data_Documento
        """

        cursor.execute(query, (ano, codigo_conta))
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

def get_documentos_pagamento(ano: int, numero_pagamento: str, codigo_entidade: str):
    """Obter documentos regularizados/abatidos de um pagamento específico"""
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
            td.Vossa_Data_Documento,
            td.Valor_Documento,
            td.Valor_Abatido,
            td.Liquidacao
        FROM [DBClassico].[dbo].[TB0001TesPagamento] tp
        INNER JOIN [DBClassico].[dbo].[TB0001TesDocRegAbatidos] td ON
            td.ano = tp.ano
            AND td.Codigo_Serie = tp.Codigo_Serie
            AND td.Numero_Pagamento = tp.Numero
        WHERE tp.ano = ?
            AND tp.Numero = ?
            AND tp.Codigo_Documento = 5701
            AND tp.Codigo_Entidade_Fornecedor = ?
        ORDER BY td.Vossa_Data_Documento
        """

        cursor.execute(query, (ano, numero_pagamento, codigo_entidade))
        rows = cursor.fetchall()
        conn.close()

        documentos = []
        for row in rows:
            documentos.append({
                "codigo_serie": row[0],
                "numero_pagamento": row[1],
                "tipo_pagamento": row[2],
                "tipo_entidade_fornecedor": row[3],
                "codigo_entidade_fornecedor": row[4],
                "numero_contribuinte": row[5],
                "data_pagamento": row[6],
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
                "liquidacao": row[19]
            })

        return documentos
    except Exception as e:
        print(f"Erro ao obter documentos de pagamento: {e}")
        return []

def get_documentos_por_regularizar(ano: int, codigo_conta: str):
    """Obter documentos por regularizar de uma conta"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        # Try with all available columns to debug
        query = """
        SELECT *
        FROM [DBClassico].[dbo].[TB0001CntDocReg]
        WHERE YEAR(Vossa_Data_Documento) = ?
            AND Codigo_Conta = ?
        ORDER BY Vossa_Data_Documento
        """

        cursor.execute(query, (ano, codigo_conta))
        rows = cursor.fetchall()

        # Get column names
        column_names = [desc[0] for desc in cursor.description]

        conn.close()

        documentos = []
        hoje = datetime.now().date()

        for row in rows:
            # Create dict with all columns
            row_dict = {column_names[i]: row[i] for i in range(len(column_names))}

            tipo_movimento = row_dict.get('Tipo_Movimento', '')
            valor_documento = float(row_dict.get('Valor_Documento', 0)) if row_dict.get('Valor_Documento') else 0.0
            valor_por_regularizar = float(row_dict.get('Valor_Por_Regularizar', 0)) if row_dict.get('Valor_Por_Regularizar') else 0.0

            # Credit documents (C) are debts to be paid, so they should be negative
            if tipo_movimento == 'C':
                valor_documento = -valor_documento
                valor_por_regularizar = -valor_por_regularizar

            # Check if document is overdue
            data_vencimento = row_dict.get('Data_Vencimento')
            vencido = False
            if data_vencimento:
                if isinstance(data_vencimento, datetime):
                    data_vencimento_dt = data_vencimento.date()
                else:
                    data_vencimento_dt = data_vencimento
                vencido = data_vencimento_dt < hoje

            documentos.append({
                "numero_documento": row_dict.get('Numero_Documento'),
                "tipo_movimento": tipo_movimento,
                "codigo_documento": row_dict.get('Codigo_Documento'),
                "descricao_doc_regul": row_dict.get('Descricao_Doc_Regul'),
                "data_documento": row_dict.get('Vossa_Data_Documento'),
                "data_recepcao": row_dict.get('Data_Recepcao'),
                "data_vencimento": data_vencimento,
                "valor_documento": valor_documento,
                "valor_por_regularizar": valor_por_regularizar,
                "vencido": vencido
            })

        return documentos
    except Exception as e:
        print(f"Erro ao obter documentos por regularizar: {e}")
        return []

def get_cheques_predatados(codigo_entidade: str):
    """Obter cheques pré-datados não conciliados de uma entidade (fornecedor)"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT
            Codigo_Entidade,
            Data_Emissao,
            Data_Documento AS Data_Vencimento,
            Data_Documento,
            Numero_Documento,
            Codigo_Movimento_Caixa,
            Numero_Movimento_Caixa,
            Valor,
            Entidade_Sacada,
            Local_Emissao,
            Conciliado,
            Data_Hora
        FROM [DBClassico].[dbo].[TB0001TesMovCaixa]
        WHERE Codigo_Movimento_Caixa = 'CHP'
            AND Conciliado = 'N'
            AND Codigo_Entidade = ?
        ORDER BY Data_Documento
        """

        cursor.execute(query, (codigo_entidade,))
        rows = cursor.fetchall()

        # Get column names
        column_names = [desc[0] for desc in cursor.description]
        conn.close()

        cheques = []
        for row in rows:
            row_dict = {column_names[i]: row[i] for i in range(len(column_names))}

            cheques.append({
                "codigo_entidade": row_dict.get('Codigo_Entidade'),
                "data_emissao": row_dict.get('Data_Emissao'),
                "data_vencimento": row_dict.get('Data_Vencimento'),
                "data_documento": row_dict.get('Data_Documento'),
                "numero_documento": row_dict.get('Numero_Documento'),
                "codigo_movimento_caixa": row_dict.get('Codigo_Movimento_Caixa'),
                "numero_movimento_caixa": row_dict.get('Numero_Movimento_Caixa'),
                "valor": float(row_dict.get('Valor', 0)) if row_dict.get('Valor') else 0.0,
                "entidade_sacada": row_dict.get('Entidade_Sacada'),
                "local_emissao": row_dict.get('Local_Emissao'),
                "conciliado": row_dict.get('Conciliado'),
                "data_hora": row_dict.get('Data_Hora')
            })

        return cheques
    except Exception as e:
        print(f"Erro ao obter cheques pré-datados: {e}")
        return []

def get_contas_disponiveis(ano: int = None):
    """Obter lista de contas 22.1.1.1.* e 22.1.1.2.* com movimentos e descrição"""
    try:
        if ano is None:
            ano = datetime.now().year

        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT DISTINCT
            tl.Codigo_Conta,
            ISNULL(tp.Descricao_Conta, '') AS Descricao_Conta
        FROM [DBClassico].[dbo].[TB0001CntLancLin] tl
        LEFT JOIN [DBClassico].[dbo].[TB0001CntPOC] tp
            ON tp.Codigo_Conta = tl.Codigo_Conta
            AND tp.Ano = tl.Ano
        WHERE tl.Ano = ?
            AND (tl.Codigo_Conta LIKE '22.1.1.1.%' OR tl.Codigo_Conta LIKE '22.1.1.2.%')
        ORDER BY tl.Codigo_Conta
        """

        cursor.execute(query, (ano,))
        rows = cursor.fetchall()
        conn.close()

        contas = []
        for row in rows:
            if row[0]:
                contas.append({
                    "codigo_conta": row[0],
                    "descricao_conta": row[1] if row[1] else ""
                })

        return contas
    except Exception as e:
        print(f"Erro ao obter contas: {e}")
        return []

