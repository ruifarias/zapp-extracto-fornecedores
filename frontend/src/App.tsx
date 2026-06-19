import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
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
  por_regularizar?: boolean
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
  const [exportingPdf, setExportingPdf] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

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
      case '21':
        return 'V/Factura'
      case '27':
        return 'N/Pagamento'
      case '201':
        return 'V/Factura'
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

  const escapeHtml = (v: any) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const gerarNotaPagamento = async (item: ExtractoItem) => {
    try {
      const numeroPagamento = item.numero_documento || ''
      const response = await axios.get('/api/nota-pagamento', {
        params: {
          ano,
          numero_pagamento: numeroPagamento,
          codigo_conta: codigoConta,
        },
      })
      const dados = response.data
      const dataPag = formatDate(dados.data_pagamento)
      const assunto = `Envio de Nota de Pagamento Nº ${numeroPagamento} - Documentos Liquidados`

      const liquidacaoBadge = (liq: string | undefined) => {
        const s = String(liq || '').trim()
        if (s === 'T') return '<span class="badge badge-total">Pago Totalmente</span>'
        if (s === 'P') return '<span class="badge badge-parcial">Pago em Parte</span>'
        return getLiquidacao(liq)
      }

      const linhasPagos = (dados.documentos_pagos || []).map((d: any) => `
        <tr>
          <td class="txt-left">${escapeHtml(formatDate(d.data_vencimento))}</td>
          <td class="txt-left">${escapeHtml(formatDate(d.data_recepcao))}</td>
          <td class="txt-left">${escapeHtml(formatDate(d.data_documento))}</td>
          <td class="txt-left">${escapeHtml(getTipoDocumento(d.codigo_documento))}</td>
          <td class="txt-left">${escapeHtml(d.numero_documento || '-')}</td>
          <td>${escapeHtml(formatCurrency(d.valor_documento || 0))}</td>
          <td>${escapeHtml(formatCurrency(d.valor_pago || 0))}</td>
          <td class="txt-left">${liquidacaoBadge(d.liquidacao)}</td>
          <td>${escapeHtml(formatCurrency(d.valor_pendente || 0))}</td>
        </tr>`).join('')

      const hoje = new Date()
      const docsReg = (dados.documentos_por_regularizar || []).filter((d: any) => d.codigo_documento !== '3501')
      const totalPorRegularizar = docsReg.reduce((acc: number, d: any) => acc + (d.valor_por_regularizar || 0), 0)
      const linhasReg = docsReg.map((d: any) => {
        const venc = new Date(d.data_vencimento || '')
        const vencido = venc < hoje && (d.valor_por_regularizar || 0) > 0
        const valorPago = (d.valor_documento || 0) - (d.valor_por_regularizar || 0)
        return `
        <tr class="${vencido ? 'row-vencido' : ''}">
          <td class="txt-left">${escapeHtml(formatDate(d.data_vencimento))}</td>
          <td class="txt-left">${vencido ? '<span class="badge badge-vencido">VENCIDO</span>' : '&mdash;'}</td>
          <td class="txt-left">${escapeHtml(formatDate(d.data_documento))}</td>
          <td class="txt-left">${escapeHtml(getTipoDocumento(d.codigo_documento))}</td>
          <td class="txt-left">${escapeHtml(d.numero_documento || '-')}</td>
          <td>${escapeHtml(formatCurrency(d.valor_documento || 0))}</td>
          <td>${escapeHtml(formatCurrency(valorPago))}</td>
          <td>${escapeHtml(formatCurrency(d.valor_por_regularizar || 0))}</td>
        </tr>`
      }).join('')

      const seccaoReg = docsReg.length > 0 ? `
        <div class="section-title pendente">Documentos Por Regularizar em ${escapeHtml(formatDate(hoje.toISOString()))}</div>
        <table class="pendente-table total-pendente">
          <thead>
            <tr>
              <th class="txt-left">Data Venc.</th><th class="txt-left">Situação</th>
              <th class="txt-left">Data Doc.</th><th class="txt-left">Tipo</th>
              <th class="txt-left">Nº Documento</th><th>Valor</th>
              <th>Valor Pago</th><th>Saldo Pendente</th>
            </tr>
          </thead>
          <tbody>${linhasReg}</tbody>
          <tfoot>
            <tr><td class="label" colspan="7">Total Por Regularizar</td><td>${escapeHtml(formatCurrency(totalPorRegularizar))}</td></tr>
          </tfoot>
        </table>
        <p class="nota-pendente">* Saldo pendente apurado à data de emissão da presente nota.</p>` : ''

      const emailHtml = `
      <div class="email-wrapper" id="email-content">
        <div class="email-header">
          <h1>CLÁSSICO DESPORTIVO, LDA.</h1>
          <p class="subtitle">Nota de Pagamento Nº ${escapeHtml(numeroPagamento)} &mdash; Documentos Liquidados</p>
        </div>
        <div class="email-body">
          <p class="greeting">Exmos. Senhores,</p>
          <p class="fornecedor-nome">${escapeHtml(dados.nome_fornecedor || '')}</p>
          <p class="intro-text">Na data, <strong>${escapeHtml(dataPag)}</strong>, procedemos ao pagamento dos seguintes documentos, no valor total de: <span class="valor-destaque">${escapeHtml(formatCurrency(dados.total_pago || 0).padStart(12))}</span></p>
          <div class="section-title">Relação de Documentos Pagos</div>
          <table>
            <thead>
              <tr>
                <th class="txt-left">Data Venc.</th><th class="txt-left">Data Receção</th>
                <th class="txt-left">Data Doc.</th><th class="txt-left">Tipo</th>
                <th class="txt-left">Nº Documento</th><th>Valor</th>
                <th>Valor Pago</th><th class="txt-left">Liquidação</th><th>Valor Pendente</th>
              </tr>
            </thead>
            <tbody>${linhasPagos}</tbody>
            <tfoot>
              <tr><td class="label" colspan="6">Total Pago</td><td>${escapeHtml(formatCurrency(dados.total_pago || 0))}</td><td colspan="2"></td></tr>
            </tfoot>
          </table>
          ${seccaoReg}
          <p class="assinatura">Com os melhores cumprimentos,<br><strong>Departamento Financeiro</strong><br>Clássico Desportivo</p>
        </div>
        <div class="email-footer">
          <strong>CLÁSSICO DESPORTIVO, LDA.</strong><br>
          Este e-mail foi gerado automaticamente a partir do sistema de gestão de conta corrente de fornecedores.<br>
          Em caso de divergência, agradecemos o favor de nos contactar.
        </div>
      </div>`

      const estilos = `
        body{margin:0;padding:24px;background:#eef1f5;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#2c3e50}
        .toolbar{max-width:820px;margin:0 auto 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
        .toolbar button{background:#1a3a5c;color:#fff;border:0;padding:9px 16px;border-radius:6px;font-size:13px;cursor:pointer}
        .toolbar button:hover{background:#2c5f8a}
        .toolbar .assunto{flex:1;min-width:260px;font-size:12.5px;color:#566;background:#fff;border:1px solid #d4dae0;border-radius:6px;padding:9px 12px}
        .email-wrapper{max-width:820px;margin:0 auto;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 18px rgba(0,0,0,.08)}
        .email-header{background:linear-gradient(135deg,#1a3a5c,#2c5f8a);color:#fff;padding:28px 36px}
        .email-header h1{margin:0;font-size:22px;letter-spacing:.5px}
        .email-header .subtitle{margin:6px 0 0;font-size:14px;opacity:.85}
        .email-body{padding:32px 36px}
        .greeting{font-size:15px;margin-bottom:4px}
        .fornecedor-nome{font-size:17px;font-weight:600;color:#1a3a5c;margin-bottom:18px}
        .intro-text{font-size:14.5px;line-height:1.6;margin-bottom:8px}
        .valor-destaque{display:inline-block;background:#e8f4ec;color:#1e7e44;font-weight:700;font-size:15px;padding:3px 10px;border-radius:6px;font-family:'Consolas','Courier New',monospace;white-space:pre}
        .section-title{font-size:15px;font-weight:600;color:#1a3a5c;border-left:4px solid #2c5f8a;padding-left:10px;margin:28px 0 14px}
        .section-title.pendente{border-left-color:#c0392b;color:#922b21}
        table{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:10px}
        thead th{background:#1a3a5c;color:#fff;font-weight:600;text-align:right;padding:9px 8px;white-space:nowrap}
        thead th:first-child,thead th.txt-left{text-align:left}
        tbody td{padding:8px;border-bottom:1px solid #e4e8ed;text-align:right;white-space:nowrap}
        tbody td.txt-left{text-align:left}
        tbody tr:nth-child(even){background:#f7f9fb}
        .pendente-table thead th{background:#922b21}
        .row-vencido td{color:#c0392b;font-weight:600}
        .badge{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 7px;border-radius:10px}
        .badge-total{background:#d5f0df;color:#1e7e44}
        .badge-parcial{background:#fdeccd;color:#9a6700}
        .badge-vencido{background:#fadbd8;color:#c0392b}
        tfoot td{padding:11px 8px;font-weight:700;font-size:13.5px;text-align:right;border-top:2px solid #1a3a5c;color:#1a3a5c}
        .total-pendente tfoot td{border-top-color:#922b21;color:#922b21}
        .nota-pendente{font-size:12.5px;color:#7a7a7a;font-style:italic;margin-top:4px}
        .email-footer{background:#f4f6f8;padding:22px 36px;font-size:12.5px;color:#6b7785;line-height:1.6;border-top:1px solid #e4e8ed}
        .email-footer strong{color:#1a3a5c}
        .assinatura{margin-top:18px;font-size:14px;color:#2c3e50}
        @media print{.toolbar{display:none}body{padding:0;background:#fff}.email-wrapper{box-shadow:none;max-width:100%}}`

      const win = window.open('', '_blank')
      if (!win) {
        setError('Não foi possível abrir a janela. Verifique o bloqueador de pop-ups.')
        return
      }
      win.document.write(`<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8">
        <title>${escapeHtml(assunto)}</title><style>${estilos}</style></head>
        <body>
          <div class="toolbar">
            <button onclick="copiarEmail()">📋 Copiar e-mail</button>
            <button onclick="window.print()">🖨️ Imprimir / PDF</button>
            <input class="assunto" readonly value="${escapeHtml(assunto)}" onclick="this.select()" title="Assunto do e-mail (clique para selecionar)">
          </div>
          ${emailHtml}
          <script>
            function copiarEmail(){
              var el=document.getElementById('email-content');
              var r=document.createRange();r.selectNode(el);
              var s=window.getSelection();s.removeAllRanges();s.addRange(r);
              try{document.execCommand('copy');s.removeAllRanges();alert('E-mail copiado! Cole (Ctrl+V) no Outlook ou no seu cliente de e-mail.');}
              catch(e){alert('Não foi possível copiar automaticamente. Selecione manualmente o conteúdo.');}
            }
          <\/script>
        </body></html>`)
      win.document.close()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao gerar nota de pagamento')
    }
  }

  const exportToPdf = async () => {
    if (!exportRef.current) return

    setExportingPdf(true)
    try {
      // Clone the element and apply print styles
      const clonedElement = exportRef.current.cloneNode(true) as HTMLElement
      const tempContainer = document.createElement('div')
      tempContainer.style.position = 'absolute'
      tempContainer.style.left = '-9999px'
      tempContainer.style.width = exportRef.current.offsetWidth + 'px'
      tempContainer.appendChild(clonedElement)
      document.body.appendChild(tempContainer)

      // Remove buttons from the clone
      clonedElement.querySelectorAll('button').forEach(btn => {
        btn.remove()
      })

      // Apply print-friendly styles to all elements
      clonedElement.querySelectorAll('*').forEach((el) => {
        const htmlEl = el as HTMLElement

        // Estilos especiais para documentos por regularizar
        if (htmlEl.classList.contains('documento-por-regularizar')) {
          htmlEl.style.setProperty('background-color', 'white', 'important')
          htmlEl.querySelectorAll('td').forEach((td) => {
            const tdEl = td as HTMLElement
            tdEl.style.setProperty('background-color', 'white', 'important')
            tdEl.style.setProperty('color', '#000', 'important')
            tdEl.style.setProperty('font-weight', 'bold', 'important')
          })
        } else {
          // Estilos padrão para todos os outros elementos
          htmlEl.style.setProperty('background-color', 'white', 'important')
          htmlEl.style.setProperty('color', '#000', 'important')
        }
      })

      const canvas = await html2canvas(clonedElement, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      })

      document.body.removeChild(tempContainer)

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')

      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      // Margins in mm
      const marginLeft = 10
      const marginTop = 10
      const marginRight = 10
      const marginBottom = 25      // 2.5cm na primeira página
      const marginTopOther = 25    // 2.5cm na segunda página+
      const marginBottomOther = 10 // 1cm na segunda página+

      const imgWidth = pageWidth - marginLeft - marginRight
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      // Page 1: 1cm top, 2.5cm bottom
      const spaceFirstPage = pageHeight - marginTop - marginBottom

      // Other pages: 2.5cm top, 1cm bottom
      const spaceOtherPages = pageHeight - marginTopOther - marginBottomOther

      // Calculate total number of pages first
      let totalPages = 1
      if (imgHeight > spaceFirstPage) {
        let tempPixelY = 0
        const pixelsPerMM = canvas.height / imgHeight

        while (true) {
          const isFirstPage = tempPixelY === 0
          const availableHeight = isFirstPage ? spaceFirstPage : spaceOtherPages
          const sourceHeight = Math.min(
            availableHeight * pixelsPerMM,
            canvas.height - tempPixelY
          )

          tempPixelY += sourceHeight
          if (tempPixelY >= canvas.height) break
          totalPages++
        }
      }

      if (imgHeight <= spaceFirstPage) {
        // Image fits on one page
        pdf.addImage(imgData, 'PNG', marginLeft, marginTop, imgWidth, imgHeight)
        // Add page number
        pdf.setFontSize(10)
        pdf.text(`1/${totalPages}`, pageWidth - marginRight - 10, pageHeight - 5, { align: 'right' })
      } else {
        // Need multiple pages - split image properly without overlaps
        let currentPixelY = 0  // Current position in source canvas pixels
        const pixelsPerMM = canvas.height / imgHeight

        for (let pageIdx = 0; ; pageIdx++) {
          if (pageIdx > 0) {
            pdf.addPage()
          }

          const isFirstPage = pageIdx === 0
          const availableHeight = isFirstPage ? spaceFirstPage : spaceOtherPages
          const currentMarginTop = isFirstPage ? marginTop : marginTopOther

          // Calculate how many pixels to extract for this page
          const sourceHeight = Math.min(
            availableHeight * pixelsPerMM,
            canvas.height - currentPixelY
          )

          // Create a temporary canvas for this page
          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = sourceHeight

          const ctx = pageCanvas.getContext('2d')
          if (ctx) {
            // Extract the correct portion from source image
            ctx.drawImage(
              canvas,
              0, currentPixelY,
              canvas.width, sourceHeight,
              0, 0,
              canvas.width, sourceHeight
            )

            const pageImgData = pageCanvas.toDataURL('image/png')
            const pageImgHeight = (sourceHeight * imgWidth) / canvas.width

            pdf.addImage(pageImgData, 'PNG', marginLeft, currentMarginTop, imgWidth, pageImgHeight)
          }

          // Add page number to footer
          pdf.setFontSize(10)
          pdf.text(`${pageIdx + 1}/${totalPages}`, pageWidth - marginRight - 10, pageHeight - 5, { align: 'right' })

          currentPixelY += sourceHeight

          // Check if we've rendered all content
          if (currentPixelY >= canvas.height) {
            break
          }
        }
      }

      const fileName = `Extracto_${codigoConta}_${ano}.pdf`
      pdf.save(fileName)
    } catch (err) {
      console.error('Erro ao exportar PDF:', err)
      setError('Erro ao exportar para PDF')
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="container">
      <div ref={exportRef}>
        <h1>CLÁSSICO DESPORTIVO - Extracto de Conta Corrente de Fornecedores</h1>

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
                  className={`${item.tipo === 'saldo_inicial' ? 'saldo-inicial-row' : ''} ${item.tipo === 'documento_pagamento' ? 'documento-pagamento-row' : ''} ${item.tipo === 'saldo_final' ? 'saldo-final-row' : ''} ${item.por_regularizar ? 'documento-por-regularizar' : ''}`}
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
                          : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {getTipoDocumento(item.codigo_documento)}
                              {String(item.codigo_documento).trim() === '5701' && (
                                <button
                                  type="button"
                                  className="btn-email-nota"
                                  title="Gerar Nota de Pagamento (e-mail)"
                                  onClick={() => gerarNotaPagamento(item)}
                                >
                                  ✉
                                </button>
                              )}
                            </span>
                          )
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

      {(() => {
        const docsRegularizar = documentosPorRegularizar.filter(d => d.codigo_documento !== '3501')
        const notasDevolvidas = documentosPorRegularizar.filter(d => d.codigo_documento === '3501')

        return (
          <>
            {docsRegularizar.length > 0 && (
              <div className="documentos-regularizar-section">
                <h3>Documentos Por Regularizar em: {formatDate(new Date().toISOString())}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Data Vencimento</th>
                      <th>Vencido</th>
                      <th>Data Documento</th>
                      <th>Data Receção</th>
                      <th>Tipo</th>
                      <th>Nº Documento</th>
                      <th>Valor</th>
                      <th>Valor Pago</th>
                      <th>Saldo</th>
                      <th>Saldo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docsRegularizar.map((doc, idx) => {
                      const valor_pago = (doc.valor_documento || 0) - (doc.valor_por_regularizar || 0)
                      const saldo_acumulado = docsRegularizar
                        .slice(0, idx + 1)
                        .reduce((acc, d) => acc + (d.valor_por_regularizar || 0), 0)

                      const data_vencimento = new Date(doc.data_vencimento || '')
                      const hoje = new Date()
                      const vencido = data_vencimento < hoje && (doc.valor_por_regularizar || 0) > 0

                      return (
                        <tr key={idx} className={`documento-regularizar-row ${vencido ? 'documento-vencido' : ''}`}>
                          <td>{formatDate(doc.data_vencimento)}</td>
                          <td className="vencido-coluna">{vencido ? 'VENCIDO' : '-'}</td>
                          <td>{formatDate(doc.data_documento)}</td>
                          <td>{formatDate(doc.data_recepcao)}</td>
                          <td>{getTipoDocumento(doc.codigo_documento)}</td>
                          <td>{doc.numero_documento || '-'}</td>
                          <td className="valor-coluna">{formatCurrency(doc.valor_documento || 0)}</td>
                          <td className="valor-coluna">{formatCurrency(valor_pago)}</td>
                          <td className="saldo-pendente valor-coluna">{formatCurrency(doc.valor_por_regularizar || 0)}</td>
                          <td className="saldo-acumulado valor-coluna">{formatCurrency(saldo_acumulado)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {notasDevolvidas.length > 0 && (
              <div className="notas-devolvidas-section">
                <h3>Notas de Devolução não creditadas em: {formatDate(new Date().toISOString())}</h3>
                <table>
                  <thead>
                    <tr>
                      <th>Data Vencimento</th>
                      <th>Vencido</th>
                      <th>Data Documento</th>
                      <th>Data Receção</th>
                      <th>Tipo</th>
                      <th>Nº Documento</th>
                      <th>Valor</th>
                      <th>Valor Pago</th>
                      <th>Saldo</th>
                      <th>Saldo Acumulado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notasDevolvidas.map((doc, idx) => {
                      const valor_pago = (doc.valor_documento || 0) - (doc.valor_por_regularizar || 0)
                      const saldo_acumulado = notasDevolvidas
                        .slice(0, idx + 1)
                        .reduce((acc, d) => acc + (d.valor_por_regularizar || 0), 0)

                      const data_vencimento = new Date(doc.data_vencimento || '')
                      const hoje = new Date()
                      const vencido = data_vencimento < hoje && (doc.valor_por_regularizar || 0) > 0

                      return (
                        <tr key={idx} className={`documento-devolvido-row ${vencido ? 'documento-vencido' : ''}`}>
                          <td>{formatDate(doc.data_vencimento)}</td>
                          <td className="vencido-coluna">{vencido ? 'VENCIDO' : '-'}</td>
                          <td>{formatDate(doc.data_documento)}</td>
                          <td>{formatDate(doc.data_recepcao)}</td>
                          <td>{getTipoDocumento(doc.codigo_documento)}</td>
                          <td>{doc.numero_documento || '-'}</td>
                          <td className="valor-coluna">{formatCurrency(doc.valor_documento || 0)}</td>
                          <td className="valor-coluna">{formatCurrency(valor_pago)}</td>
                          <td className="saldo-pendente valor-coluna">{formatCurrency(doc.valor_por_regularizar || 0)}</td>
                          <td className="saldo-acumulado valor-coluna">{formatCurrency(saldo_acumulado)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )
      })()}
      </div>

      {extracto.length === 0 && !error && saldoInicial && (
        <div className="no-data">Sem movimentos para o período seleccionado</div>
      )}

      {extracto.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '30px', paddingBottom: '20px' }}>
          <button onClick={exportToPdf} disabled={exportingPdf}>
            {exportingPdf ? 'Exportando...' : 'Exportar PDF'}
          </button>
        </div>
      )}
    </div>
  )
}

export default App
