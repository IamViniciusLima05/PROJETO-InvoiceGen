/* InvoiceGen — orçamentos, faturas e recibos com prévia A4 e PDF pela impressão do navegador */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapar = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const banco = {
  ler(k, padrao) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? padrao; } catch { return padrao; } },
  salvar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem storage */ } }
};
const iso = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const maisDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const brl = (v) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (s) => (s ? new Date(s + 'T12:00').toLocaleDateString('pt-BR') : '—');
/* Aceita "1.234,56", "1234,5" e "1234.50" */
function numero(t) {
  let s = String(t ?? '').replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const fmtNum = (n) => (n ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '');

const TIPOS = {
  orcamento: { nome: 'Orçamento', sigla: 'ORC', validade: 'Válido até' },
  fatura: { nome: 'Fatura', sigla: 'FAT', validade: 'Vencimento' },
  recibo: { nome: 'Recibo', sigla: 'REC', validade: 'Pago em' }
};
const CORES = ['#2b59c3', '#16181d', '#0f766e', '#7c3aed', '#c2410c', '#be123c'];

const EMITENTE_EXEMPLO = { nome: 'Estúdio Pixel Web', doc: '12.345.678/0001-90', tel: '(51) 99999-0000', email: 'contato@estudiopixel.com.br', site: 'estudiopixel.com.br', end: 'Porto Alegre, RS' };
let emitente = banco.ler('ig_emitente', EMITENTE_EXEMPLO);
let salvos = banco.ler('ig_salvos', []);
let contadores = banco.ler('ig_contadores', {});

function proximoNumero(tipo) {
  const n = (contadores[tipo] || 0) + 1;
  return `${TIPOS[tipo].sigla}-${new Date().getFullYear()}-${String(n).padStart(3, '0')}`;
}
function docVazio(tipo = 'orcamento', exemplo = false) {
  return {
    id: null, tipo, numero: proximoNumero(tipo), emissao: iso(), validade: maisDias(tipo === 'recibo' ? 0 : 15), cor: CORES[0],
    cliente: exemplo ? { nome: 'Barbearia Alves', doc: '98.765.432/0001-10', contato: 'fernando@barbeariaalves.com', end: 'Rua dos Andradas, 1000 · Porto Alegre, RS' } : { nome: '', doc: '', contato: '', end: '' },
    itens: exemplo
      ? [{ d: 'Site institucional com agendamento online', q: 1, v: 1800 }, { d: 'Criação de logotipo', q: 1, v: 450 }, { d: 'Hospedagem e domínio (mensal)', q: 12, v: 25 }]
      : [{ d: '', q: 1, v: 0 }],
    desconto: exemplo ? 10 : 0, descTipo: 'pct', taxa: 0,
    pagamento: exemplo ? 'Pix ou transferência. 50% na aprovação e 50% na entrega.' : '',
    obs: exemplo ? 'Prazo de entrega: 20 dias úteis após a aprovação do layout.\nInclui 2 rodadas de ajustes.' : ''
  };
}
let doc = banco.ler('ig_rascunho', null) ?? docVazio('orcamento', true);

/* ---------- Cálculo ---------- */
function totais(d) {
  const sub = d.itens.reduce((s, i) => s + (i.q || 0) * (i.v || 0), 0);
  const desc = d.descTipo === 'pct' ? sub * Math.min(100, Math.max(0, d.desconto)) / 100 : Math.min(sub, Math.max(0, d.desconto));
  const taxa = Math.max(0, d.taxa || 0);
  return { sub, desc, taxa, total: Math.max(0, sub - desc + taxa) };
}

/* ---------- Editor → estado ---------- */
function preencherEditor() {
  document.querySelector(`[name=tipo][value=${doc.tipo}]`).checked = true;
  $('#numero').value = doc.numero; $('#emissao').value = doc.emissao; $('#validade').value = doc.validade;
  $('#rot-validade').firstChild.textContent = TIPOS[doc.tipo].validade;
  ['nome', 'doc', 'tel', 'email', 'site', 'end'].forEach((k) => { $(`#em-${k}`).value = emitente[k] || ''; });
  ['nome', 'doc', 'contato', 'end'].forEach((k) => { $(`#cl-${k}`).value = doc.cliente[k] || ''; });
  $('#desconto').value = doc.desconto ? String(doc.desconto).replace('.', ',') : ''; $('#desc-tipo').value = doc.descTipo; $('#taxa').value = fmtNum(doc.taxa);
  $('#pagamento').value = doc.pagamento; $('#obs').value = doc.obs;
  $('#cores').innerHTML = CORES.map((c) => `<button type="button" data-cor="${c}" style="--c:${c}" aria-pressed="${doc.cor === c}" aria-label="Cor ${c}"></button>`).join('');
  desenharItens();
  $('#bloco-emitente').open = !emitente.nome;
  $('#clientes-salvos').innerHTML = [...new Set(salvos.map((s) => s.cliente.nome).filter(Boolean))].map((n) => `<option value="${escapar(n)}">`).join('');
}
function desenharItens() {
  $('#itens').innerHTML = doc.itens.map((it, i) => `<li class="item" data-i="${i}">
      <input class="desc" data-campo="d" value="${escapar(it.d)}" placeholder="Descrição do serviço ou produto" aria-label="Descrição do item ${i + 1}" maxlength="120">
      <input class="qtd" data-campo="q" value="${it.q || ''}" inputmode="decimal" aria-label="Quantidade do item ${i + 1}">
      <input class="valor" data-campo="v" value="${fmtNum(it.v)}" inputmode="decimal" placeholder="0,00" aria-label="Valor unitário do item ${i + 1}">
      <span class="total-item">${brl((it.q || 0) * (it.v || 0))}</span>
      <button type="button" class="x" data-tirar="${i}" aria-label="Remover item ${i + 1}" ${doc.itens.length === 1 ? 'disabled' : ''}>×</button>
    </li>`).join('');
}
function lerEditor() {
  doc.tipo = document.querySelector('[name=tipo]:checked').value;
  doc.numero = $('#numero').value.trim(); doc.emissao = $('#emissao').value; doc.validade = $('#validade').value;
  ['nome', 'doc', 'tel', 'email', 'site', 'end'].forEach((k) => { emitente[k] = $(`#em-${k}`).value.trim(); });
  ['nome', 'doc', 'contato', 'end'].forEach((k) => { doc.cliente[k] = $(`#cl-${k}`).value.trim(); });
  doc.desconto = numero($('#desconto').value); doc.descTipo = $('#desc-tipo').value; doc.taxa = numero($('#taxa').value);
  doc.pagamento = $('#pagamento').value.trim(); doc.obs = $('#obs').value.trim();
}

/* ---------- Prévia ---------- */
function desenharPrevia() {
  const t = totais(doc), T = TIPOS[doc.tipo];
  document.documentElement.style.setProperty('--cor-doc', doc.cor);
  const contatoEm = [emitente.doc && `CPF/CNPJ ${emitente.doc}`, emitente.tel, emitente.email, emitente.site, emitente.end].filter(Boolean);
  const itens = doc.itens.filter((i) => i.d || i.v);
  $('#doc').innerHTML = `
    <div class="doc__topo">
      <div class="doc__emitente"><b>${escapar(emitente.nome || 'Seu nome ou empresa')}</b>${contatoEm.map((c) => `<span>${escapar(c)}</span>`).join('')}</div>
      <div class="doc__tipo"><h1>${T.nome}</h1><p>Nº <strong>${escapar(doc.numero)}</strong></p><p>Emissão: ${dataBR(doc.emissao)}</p>${doc.validade ? `<p>${T.validade}: <strong>${dataBR(doc.validade)}</strong></p>` : ''}</div>
    </div>
    <div class="doc__partes">
      <div><div class="doc__rotulo">${doc.tipo === 'recibo' ? 'Recebido de' : 'Cliente'}</div>
        <p><strong>${escapar(doc.cliente.nome || 'Nome do cliente')}</strong></p>
        ${doc.cliente.doc ? `<p>CPF/CNPJ ${escapar(doc.cliente.doc)}</p>` : ''}${doc.cliente.contato ? `<p>${escapar(doc.cliente.contato)}</p>` : ''}${doc.cliente.end ? `<p>${escapar(doc.cliente.end)}</p>` : ''}
      </div>
      <div><div class="doc__rotulo">${doc.tipo === 'recibo' ? 'Valor recebido' : 'Valor total'}</div><p style="font-size:2em;font-weight:700;line-height:1.1">${brl(t.total)}</p></div>
    </div>
    <table>
      <thead><tr><th>Descrição</th><th class="n">Qtd.</th><th class="n">Valor unit.</th><th class="n">Total</th></tr></thead>
      <tbody>${itens.length ? itens.map((i) => `<tr><td>${escapar(i.d || '—')}</td><td class="n">${(i.q || 0).toLocaleString('pt-BR')}</td><td class="n">${brl(i.v || 0)}</td><td class="n">${brl((i.q || 0) * (i.v || 0))}</td></tr>`).join('') : '<tr class="vazio"><td colspan="4">Adicione os itens no editor</td></tr>'}</tbody>
    </table>
    <div class="doc__totais">
      <div><span>Subtotal</span><span>${brl(t.sub)}</span></div>
      ${t.desc ? `<div class="desc"><span>Desconto${doc.descTipo === 'pct' ? ` (${doc.desconto.toLocaleString('pt-BR')}%)` : ''}</span><span>− ${brl(t.desc)}</span></div>` : ''}
      ${t.taxa ? `<div><span>Frete / taxa</span><span>${brl(t.taxa)}</span></div>` : ''}
      <div class="final"><span>Total</span><span>${brl(t.total)}</span></div>
    </div>
    <div class="doc__condicoes">
      ${doc.pagamento ? `<div><div class="doc__rotulo">Forma de pagamento</div><p>${escapar(doc.pagamento)}</p></div>` : ''}
      ${doc.obs ? `<div><div class="doc__rotulo">Observações</div><p>${escapar(doc.obs)}</p></div>` : ''}
    </div>
    <div class="doc__rodape"><span>${escapar(emitente.nome || '')}${emitente.site ? ' · ' + escapar(emitente.site) : ''}</span><span class="assinatura">${doc.tipo === 'recibo' ? 'Assinatura do recebedor' : 'De acordo do cliente'}</span></div>`;
  $('#resumo-emitente').textContent = emitente.nome || 'preencha seus dados';
  $$('.item').forEach((li) => { const it = doc.itens[+li.dataset.i]; if (it) li.querySelector('.total-item').textContent = brl((it.q || 0) * (it.v || 0)); });
  banco.salvar('ig_rascunho', doc);
  banco.salvar('ig_emitente', emitente);
}

/* ---------- Eventos do editor ---------- */
$('#editor').addEventListener('input', (e) => {
  const li = e.target.closest('.item');
  if (li) {
    const it = doc.itens[+li.dataset.i], c = e.target.dataset.campo;
    it[c] = c === 'd' ? e.target.value : numero(e.target.value);
  } else lerEditor();
  desenharPrevia();
});
$('#editor').addEventListener('change', (e) => {
  if (e.target.name === 'tipo') {
    const antigo = doc.numero;
    lerEditor();
    // troca a sigla do número se ele ainda for o automático
    if (/^(ORC|FAT|REC)-\d{4}-\d{3}$/.test(antigo)) doc.numero = proximoNumero(doc.tipo);
    if (doc.tipo === 'recibo') doc.validade = iso();
    preencherEditor(); desenharPrevia();
  }
  // formata valores ao sair do campo
  if (e.target.matches('.valor, #taxa')) e.target.value = fmtNum(numero(e.target.value));
  // preenche cliente que já apareceu em outro documento
  if (e.target.id === 'cl-nome') {
    const ant = salvos.find((s) => s.cliente.nome.toLowerCase() === e.target.value.trim().toLowerCase());
    if (ant && !doc.cliente.doc && !doc.cliente.contato) { doc.cliente = { ...ant.cliente }; preencherEditor(); desenharPrevia(); toast('Dados do cliente preenchidos'); }
  }
});
$('#editor').addEventListener('submit', (e) => e.preventDefault());
$('#add-item').addEventListener('click', () => {
  doc.itens.push({ d: '', q: 1, v: 0 });
  desenharItens(); desenharPrevia();
  $$('.item .desc').at(-1).focus();
});
$('#itens').addEventListener('click', (e) => {
  const x = e.target.closest('[data-tirar]');
  if (x && doc.itens.length > 1) { doc.itens.splice(+x.dataset.tirar, 1); desenharItens(); desenharPrevia(); }
});
$('#itens').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.valor') && e.target.closest('.item') === $$('.item').at(-1)) { e.preventDefault(); $('#add-item').click(); }
});
$('#cores').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cor]');
  if (b) { doc.cor = b.dataset.cor; $$('#cores button').forEach((x) => x.setAttribute('aria-pressed', x === b)); desenharPrevia(); }
});

/* ---------- Salvar / abrir / novo ---------- */
function salvarDoc(silencioso = false) {
  lerEditor();
  if (!doc.id) {
    doc.id = Date.now();
    const m = doc.numero.match(/^(ORC|FAT|REC)-\d{4}-(\d{3})$/);
    if (m) contadores[doc.tipo] = Math.max(contadores[doc.tipo] || 0, +m[2]);
    banco.salvar('ig_contadores', contadores);
  }
  const copia = JSON.parse(JSON.stringify(doc));
  copia.salvoEm = Date.now();
  const i = salvos.findIndex((s) => s.id === doc.id);
  if (i >= 0) salvos[i] = copia; else salvos.unshift(copia);
  banco.salvar('ig_salvos', salvos);
  $('#n-salvos').textContent = salvos.length;
  if (!silencioso) toast(`${TIPOS[doc.tipo].nome} ${doc.numero} salvo`);
}
$('#salvar-doc').addEventListener('click', () => salvarDoc());
$('#novo-doc').addEventListener('click', () => { doc = docVazio(doc.tipo); preencherEditor(); desenharPrevia(); $('#cl-nome').focus(); toast('Novo documento'); });

function desenharSalvos() {
  $('#lista-salvos').innerHTML = salvos.length ? salvos.map((s) => `<li>
      <b>${TIPOS[s.tipo].nome} ${escapar(s.numero)}</b><small>${escapar(s.cliente.nome || 'Sem cliente')} · ${dataBR(s.emissao)}</small>
      <span class="valor">${brl(totais(s).total)}</span>
      <div class="botoes"><button data-abrir="${s.id}">Abrir</button><button data-duplicar="${s.id}">Duplicar</button><button data-virar="${s.id}" ${s.tipo === 'recibo' ? 'hidden' : ''}>Gerar ${s.tipo === 'orcamento' ? 'fatura' : 'recibo'}</button><button class="perigo" data-del="${s.id}">Excluir</button></div>
    </li>`).join('') : '<li class="vazio">Nenhum documento salvo ainda.</li>';
}
$('#abrir-salvos').addEventListener('click', () => { desenharSalvos(); $('#dlg-salvos').showModal(); });
$('#lista-salvos').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const id = +(b.dataset.abrir || b.dataset.duplicar || b.dataset.virar || b.dataset.del);
  const s = salvos.find((x) => x.id === id);
  if (!s) return;
  if (b.dataset.del) {
    if (!b.classList.contains('confirmar')) { b.classList.add('confirmar'); b.textContent = 'Confirmar exclusão'; return; }
    salvos = salvos.filter((x) => x !== s); banco.salvar('ig_salvos', salvos); $('#n-salvos').textContent = salvos.length;
    if (doc.id === s.id) doc.id = null;
    desenharSalvos(); return;
  }
  doc = JSON.parse(JSON.stringify(s));
  if (b.dataset.duplicar || b.dataset.virar) {
    doc.id = null; doc.emissao = iso();
    if (b.dataset.virar) doc.tipo = s.tipo === 'orcamento' ? 'fatura' : 'recibo';
    doc.numero = proximoNumero(doc.tipo);
    doc.validade = doc.tipo === 'recibo' ? iso() : maisDias(doc.tipo === 'fatura' ? 7 : 15);
  }
  preencherEditor(); desenharPrevia(); $('#dlg-salvos').close();
  toast(b.dataset.abrir ? 'Documento aberto' : b.dataset.virar ? `${TIPOS[doc.tipo].nome} criada a partir do documento` : 'Cópia criada');
});
$$('[data-fechar]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
$('#dlg-salvos').addEventListener('click', (e) => { if (e.target === $('#dlg-salvos')) $('#dlg-salvos').close(); });

/* ---------- PDF: usa a impressão do navegador ("Salvar como PDF") ---------- */
$('#pdf').addEventListener('click', () => {
  lerEditor(); desenharPrevia(); salvarDoc(true);
  const titulo = document.title;
  const limpo = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  document.title = limpo(`${TIPOS[doc.tipo].nome}-${doc.numero}-${doc.cliente.nome || 'cliente'}`);
  toast('Escolha “Salvar como PDF” na janela de impressão');
  setTimeout(() => { window.print(); document.title = titulo; }, 300);
});

let timerToast;
function toast(msg) { const t = $('#toast'); (document.querySelector('dialog[open]') || document.body).append(t); t.textContent = msg; t.hidden = false; clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 2600); }

$('#n-salvos').textContent = salvos.length;
preencherEditor();
desenharPrevia();
