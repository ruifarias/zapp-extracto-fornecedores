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
  codigo_diario?: string
  numero_documento_interno?: string
  codigo_serie?: string
  numero_pagamento?: string
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
  const [descricaoContaSelecionada, setDescricaoContaSelecionada] = useState('')
  const [expandedRow, setExpandedRow] = useState<number | null>(null)
  const [documentosPagamento, setDocumentosPagamento] = useState<any[]>([])
  const [loadingDocumentos, setLoadingDocumentos] = useState(false)

  useEffect(() => {
    fetchContas()
  }, [ano])

  const fetchContas = async () => {
    try {
      const response = await axios.get('/api/contas', {
        params: { ano }
      })
      setContas(response.data.contas)
      setCodigoConta('')
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
    setExpandedRow(null)
    setDocumentosPagamento([])
    try {
      const response = await axios.post('/api/extracto', {
        ano,
        codigo_conta: codigoConta,
        data_inicio: dataInicio,
        data_fim: dataFim,
      })

      console.log('Extracto response:', response.data)
      setSaldoInicial(response.data.saldo_inicial)
      const extractoData = response.data.extracto_completo || []
      console.log('Extracto data:', extractoData)
      setExtracto(extractoData)
    } catch (err: any) {
      console.error('Erro:', err)
      setError(err.response?.data?.detail || err.message || 'Erro ao gerar extracto')
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

  const handleExpandPagamento = async (idx: number, item: ExtractoItem) => {
    if (expandedRow === idx) {
      setExpandedRow(null)
      setDocumentosPagamento([])
      return
    }

    if (item.codigo_diario !== '04') return

    setLoadingDocumentos(true)
    try {
      const response = await axios.get('/api/documentos-pagamento', {
        params: {
          ano,
          codigo_serie: item.codigo_serie || '',
          numero: item.numero_pagamento || ''
        }
      })
      setDocumentosPagamento(response.data.documentos)
      setExpandedRow(idx)
    } catch (err) {
      console.error('Erro ao carregar documentos:', err)
    } finally {
      setLoadingDocumentos(false)
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
            onChange={(e) => {
              setCodigoConta(e.target.value)
              const contaSelecionada = contas.find(c => c.codigo_conta === e.target.value)
              setDescricaoContaSelecionada(contaSelecionada?.descricao_conta || '')
            }}
          >
            <option value="">-- Seleccione uma conta --</option>
            {[...contas].sort((a, b) => (a.descricao_conta || '').localeCompare(b.descricao_conta || '')).map((c) => (
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
          <h3>Extracto de Movimentos - {codigoConta} {descricaoContaSelecionada && `- ${descricaoContaSelecionada}`}</h3>
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
                <React.Fragment key={idx}>
                  <tr
                    className={`${item.tipo === 'saldo_inicial' ? 'saldo-inicial-row' : ''} ${item.codigo_documento === '5701' ? 'pagamento-row' : ''}`}
                    onClick={() => item.codigo_documento === '5701' && handleExpandPagamento(idx, item)}
                    style={{ cursor: item.codigo_documento === '5701' ? 'pointer' : 'default' }}
                  >
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
                  {expandedRow === idx && item.codigo_documento === '5701' && (
                    <tr className="documentos-row">
                      <td colSpan={8}>
                        <div className="documentos-container">
                          <h4>Documentos Pagos</h4>
                          {loadingDocumentos ? (
                            <p>Carregando documentos...</p>
                          ) : documentosPagamento.length > 0 ? (
                            <table className="documentos-table">
                              <thead>
                                <tr>
                                  <th>Data Doc</th>
                                  <th>Nº Documento</th>
                                  <th>Descrição</th>
                                  <th>Valor Doc</th>
                                  <th>Valor Abatido</th>
                                  <th>Vencimento</th>
                                </tr>
                              </thead>
                              <tbody>
                                {documentosPagamento.map((doc, docIdx) => (
                                  <tr key={docIdx}>
                                    <td>{formatDate(doc.data_documento)}</td>
                                    <td>{doc.numero_documento || '-'}</td>
                                    <td>{doc.descricao_doc_regul || '-'}</td>
                                    <td>{formatCurrency(doc.valor_documento)}</td>
                                    <td>{formatCurrency(doc.valor_abatido)}</td>
                                    <td>{formatDate(doc.data_vencimento)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <p>Sem documentos</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
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
