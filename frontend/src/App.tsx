import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

interface Conta {
  codigo_conta: string
  descricao_conta?: string
}

interface ExtractoItem {
  data_hora?: string
  data?: string
  tipo: string
  tipo_movimento?: string
  valor?: number
  numero_documento?: string
  descricao?: string
  saldo_acumulado: number
  abertura_debito?: number
  abertura_credito?: number
}

function App() {
  const [contas, setContas] = useState<Conta[]>([])
  const [codigoConta, setCodigoConta] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [dataInicio, setDataInicio] = useState(`${ano}-01-01`)
  const [dataFim, setDataFim] = useState(`${ano}-12-31`)
  const [extracto, setExtracto] = useState<ExtractoItem[]>([])
  const [saldoInicial, setSaldoInicial] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchContas()
  }, [])

  const fetchContas = async () => {
    try {
      const response = await axios.get('/api/contas')
      setContas(response.data.contas)
    } catch (err) {
      setError('Erro ao carregar contas')
    }
  }

  const handleGerarExtracto = async () => {
    if (!codigoConta) {
      setError('Por favor, selecione uma conta')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await axios.post('/api/extracto', {
        ano,
        codigo_conta: codigoConta,
        data_inicio: dataInicio,
        data_fim: dataFim,
      })

      setSaldoInicial(response.data.saldo_inicial)
      setExtracto(response.data.extracto_completo || [])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar extracto')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (date: string | Date) => {
    if (!date) return '-'
    const d = new Date(date)
    return d.toLocaleDateString('pt-PT')
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-PT', {
      style: 'currency',
      currency: 'EUR'
    }).format(value)
  }

  const getTipoDocumento = (codigoDocumento: number | string | undefined) => {
    if (!codigoDocumento) return '-'
    const codigo = String(codigoDocumento).trim()
    switch (codigo) {
      case '3302':
        return 'V/Factura'
      case '3502':
        return 'V/Nota Crédito'
      case '5701':
        return 'Pagamento'
      default:
        return codigo
    }
  }

  return (
    <div className="container">
      <h1>Extracto de Conta Corrente</h1>

      <div className="filters">
        <div className="form-group">
          <label>Código Conta:</label>
          <select
            value={codigoConta}
            onChange={(e) => setCodigoConta(e.target.value)}
          >
            <option value="">-- Seleccione uma conta --</option>
            {contas.map((c) => (
              <option key={c.codigo_conta} value={c.codigo_conta}>
                {c.codigo_conta} - {c.descricao_conta}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Ano:</label>
          <input
            type="number"
            value={ano}
            onChange={(e) => {
              setAno(Number(e.target.value))
              setDataInicio(`${e.target.value}-01-01`)
              setDataFim(`${e.target.value}-12-31`)
            }}
          />
        </div>

        <div className="form-group">
          <label>Data Início:</label>
          <input
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label>Data Fim:</label>
          <input
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>

        <button onClick={handleGerarExtracto} disabled={loading}>
          {loading ? 'Gerando...' : 'Gerar Extracto'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {extracto.length > 0 && (
        <div className="extracto-table">
          <h3>Extracto de Movimentos - {codigoConta}</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Diário</th>
                <th>Nº Doc Interno</th>
                <th>Tipo Documento</th>
                <th>Descrição</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {extracto.map((item, idx) => (
                <tr key={idx} className={item.tipo === 'saldo_inicial' ? 'saldo-inicial-row' : ''}>
                  <td>{formatDate(item.data_hora || item.data)}</td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? '-'
                      : item.codigo_diario || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? '-'
                      : item.numero_documento_interno || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? 'Saldo Inicial'
                      : getTipoDocumento(item.codigo_documento)
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? 'Saldo de Abertura'
                      : item.numero_documento || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_debito || 0)
                      : item.tipo_movimento === 'D'
                        ? formatCurrency(item.valor || 0)
                        : '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_credito || 0)
                      : item.tipo_movimento === 'C'
                        ? formatCurrency(item.valor || 0)
                        : '-'
                    }
                  </td>
                  <td className="saldo-acumulado">{formatCurrency(item.saldo_acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {extracto.length === 0 && !error && saldoInicial && (
        <div className="no-data">Sem movimentos para o período seleccionado</div>
      )}
    </div>
  )
}

export default App
