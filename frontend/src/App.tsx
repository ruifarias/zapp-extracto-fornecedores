import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

interface Fornecedor {
  codigo: string
  nome: string
  numero_contribuinte: string
}

interface ExtractoItem {
  data_hora?: string
  data?: string
  tipo: string
  tipo_movimento?: string
  valor?: number
  valor_pagamento_liquido?: number
  numero_documento?: string
  numero?: string
  nome?: string
  saldo_acumulado: number
  descricao_doc_regul?: string
}

function App() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [selectedFornecedor, setSelectedFornecedor] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [dataInicio, setDataInicio] = useState(`${ano}-01-01`)
  const [dataFim, setDataFim] = useState(`${ano}-12-31`)
  const [codigoConta, setCodigoConta] = useState('22.1.1.2.0116')
  const [extracto, setExtracto] = useState<ExtractoItem[]>([])
  const [saldoInicial, setSaldoInicial] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchFornecedores()
  }, [])

  const fetchFornecedores = async () => {
    try {
      const response = await axios.get('/api/fornecedores')
      setFornecedores(response.data.fornecedores)
    } catch (err) {
      setError('Erro ao carregar fornecedores')
    }
  }

  const handleGerarExtracto = async () => {
    if (!selectedFornecedor || !codigoConta) {
      setError('Por favor, selecione um fornecedor e conta')
      return
    }

    setLoading(true)
    setError('')
    try {
      const response = await axios.post('/api/extracto', {
        ano,
        codigo_fornecedor: selectedFornecedor,
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

  return (
    <div className="container">
      <h1>Extracto de Conta - Fornecedores</h1>

      <div className="filters">
        <div className="form-group">
          <label>Fornecedor:</label>
          <select value={selectedFornecedor} onChange={(e) => setSelectedFornecedor(e.target.value)}>
            <option value="">-- Seleccione --</option>
            {fornecedores.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.nome} ({f.numero_contribuinte})
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

        <div className="form-group">
          <label>Código Conta:</label>
          <input
            type="text"
            value={codigoConta}
            onChange={(e) => setCodigoConta(e.target.value)}
            placeholder="Ex: 22.1.1.2.0116"
          />
        </div>

        <button onClick={handleGerarExtracto} disabled={loading}>
          {loading ? 'Gerando...' : 'Gerar Extracto'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {extracto.length > 0 && (
        <div className="extracto-table">
          <h3>Extracto de Movimentos</h3>
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
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
                      ? 'Saldo Inicial'
                      : item.tipo === 'movimento'
                        ? 'Movto'
                        : 'Pagto'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? 'Saldo de Abertura'
                      : item.tipo === 'movimento'
                        ? item.numero_documento || '-'
                        : item.descricao_doc_regul || item.nome || '-'
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_debito || 0)
                      : item.tipo === 'movimento' && item.tipo_movimento === 'D'
                        ? formatCurrency(item.valor || 0)
                        : (item.tipo !== 'movimento' && item.tipo === 'pagamento' && item.tipo_movimento === 'D'
                          ? formatCurrency(item.valor_pagamento_liquido || 0)
                          : '-'
                        )
                    }
                  </td>
                  <td>
                    {item.tipo === 'saldo_inicial'
                      ? formatCurrency(item.abertura_credito || 0)
                      : item.tipo === 'movimento' && item.tipo_movimento === 'C'
                        ? formatCurrency(item.valor || 0)
                        : (item.tipo !== 'movimento' && item.tipo === 'pagamento' && item.tipo_movimento === 'C'
                          ? formatCurrency(item.valor_pagamento_liquido || 0)
                          : '-'
                        )
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
