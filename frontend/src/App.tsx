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
  codigo_documento?: string
  liquidacao?: string
  saldo_actual_db?: number
  parent_idx?: number
}

function App() {
  const [contas, setContas] = useState<Conta[]>([])
  const [codigoConta, setCodigoConta] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [dataInicio, setDataInicio] = useState(`${ano}-01-01`)
  const [dataFim, setDataFim] = useState(`${ano}-12-31`)
  const [extracto, setExtracto] = useState<ExtractoItem[]>([])
  const [saldoInicial, setSaldoInicial] = useState<any>(null)
  const [documentosPorRegularizar, setDocumentosPorRegularizar] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [descricaoContaSelecionada, setDescricaoContaSelecionada] = useState('')

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
    try {
      const response = await axios.post('/api/extracto', {
        ano,
        codigo_conta: codigoConta,
        data_inicio: dataInicio,
        data_fim: dataFim,
      })

      setSaldoInicial(response.data.saldo_inicial)
      setExtracto(response.data.extracto_completo || [])
      setDocumentosPorRegularizar(response.data.documentos_por_regularizar || [])
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

  const getLiquidacao = (liquidacao: string | undefined) => {
    if (!liquidacao) return '-'
    const status = String(liquidacao).trim()
    switch (status) {
      case 'T':
        return 'Pago Totalmente'
      case 'P':
        return 'Pago em Parte'
      default:
        return status
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
                <th>Liquidação</th>
                <th>Descrição</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {extracto.map((item, idx) => (
                <tr
                  key={idx}
                  className={`${item.tipo === 'saldo_inicial' ? 'saldo-inicial-row' : ''} ${item.tipo === 'documento_pagamento' ? 'documento-pagamento-row' : ''} ${item.tipo === 'saldo_final' ? 'saldo-final-row' : ''}`}
                >
                  <td>{item.tipo === 'saldo_final' ? '' : formatDate(item.data_hora || item.data)}</td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? '-'
                      : item.tipo === 'documento_pagamento' || item.tipo === 'saldo_final'
                        ? ''
                        : item.codigo_diario || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? '-'
                      : item.tipo === 'documento_pagamento' || item.tipo === 'saldo_final'
                        ? ''
                        : item.numero_documento_interno || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? 'Saldo Inicial'
                      : item.tipo === 'documento_pagamento'
                        ? 'Documento Pago'
                        : item.tipo === 'saldo_final'
                          ? 'Saldo Final'
                          : getTipoDocumento(item.codigo_documento)
                    }
                  </td>
                  <td>
                    {item.tipo === 'documento_pagamento'
                      ? getLiquidacao(item.liquidacao)
                      : '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? 'Saldo de Abertura'
                      : item.tipo === 'saldo_final'
                        ? `Saldo Apurado: ${formatCurrency(item.saldo_acumulado)} | BD: ${formatCurrency(item.saldo_actual_db || 0)}`
                        : item.descricao || item.numero_documento || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_debito || 0)
                      : item.tipo === 'documento_pagamento' || item.tipo === 'saldo_final'
                        ? (item.tipo === 'documento_pagamento' && item.valor && item.valor > 0 ? formatCurrency(item.valor) : '-')
                        : item.tipo_movimento === 'D'
                          ? formatCurrency(item.valor || 0)
                          : '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_credito || 0)
                      : item.tipo === 'documento_pagamento'
                        ? (item.valor && item.valor < 0 ? formatCurrency(item.valor) : '-')
                        : item.tipo === 'saldo_final'
                          ? '-'
                          : item.tipo_movimento === 'C'
                            ? formatCurrency(item.valor || 0)
                            : '-'
                    }
                  </td>
                  <td className="saldo-acumulado">{item.tipo === 'documento_pagamento' || item.tipo === 'saldo_final' ? (item.tipo === 'saldo_final' ? formatCurrency(item.saldo_acumulado) : '-') : formatCurrency(item.saldo_acumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {documentosPorRegularizar.length > 0 && (
        <div className="documentos-regularizar-section">
          <h3>Documentos Por Regularizar</h3>
          <table>
            <thead>
              <tr>
                <th>Data Vencimento</th>
                <th>Data Documento</th>
                <th>Tipo</th>
                <th>Nº Documento</th>
                <th>Valor</th>
                <th>Valor Pago</th>
                <th>Saldo</th>
                <th>Saldo Acumulado</th>
              </tr>
            </thead>
            <tbody>
              {documentosPorRegularizar.map((doc, idx) => {
                const valor_pago = (doc.valor_documento || 0) - (doc.valor_por_regularizar || 0)
                const saldo_acumulado = documentosPorRegularizar
                  .slice(0, idx + 1)
                  .reduce((acc, d) => acc + (d.valor_por_regularizar || 0), 0)
                return (
                  <tr key={idx} className="documento-regularizar-row">
                    <td>{formatDate(doc.data_vencimento)}</td>
                    <td>{formatDate(doc.data_documento)}</td>
                    <td>{getTipoDocumento(doc.codigo_documento)}</td>
                    <td>{doc.numero_documento || '-'}</td>
                    <td>{formatCurrency(doc.valor_documento || 0)}</td>
                    <td>{formatCurrency(valor_pago)}</td>
                    <td className="saldo-pendente">{formatCurrency(doc.valor_por_regularizar || 0)}</td>
                    <td className="saldo-acumulado">{formatCurrency(saldo_acumulado)}</td>
                  </tr>
                )
              })}
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
