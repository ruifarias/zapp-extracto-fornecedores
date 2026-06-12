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
    """Obter movimentos de contabilidade (débito/crédito) da conta"""
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

def get_contas_disponiveis():
    """Obter lista de contas com movimentos"""
    try:
        conn = get_connection()
        cursor = conn.cursor()

        query = """
        SELECT DISTINCT
            Codigo_Conta
        FROM [DBClassico].[dbo].[TB0001CntLancLin]
        WHERE Ano = YEAR(GETDATE())
        ORDER BY Codigo_Conta
        """

        cursor.execute(query)
        rows = cursor.fetchall()
        conn.close()

        contas = []
        for row in rows:
            if row[0]:
                contas.append({"codigo_conta": row[0]})

        return contas
    except Exception as e:
        print(f"Erro ao obter contas: {e}")
        return []
