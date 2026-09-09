(() => {
  'use strict';

  const schemaVersion = 3;
  const maxCustomRows = 30;
  const maxMoney = 100000000;
  const sdkVersion = '12.18.0';
  const localKey = 'meu-triplex:calculo-atual:v3';
  const legacyLocalKey = 'meu-triplex:calculo-atual:v2';
  const localMetaKey = 'meu-triplex:sincronizacao:v1';

  const initial = {
    schemaVersion,
    price: 735000,
    entry: 20,
    bank: 551500,
    own: 0,
    renovation: 0,
    registry: 0,
    family1: 0,
    family2: 0,
    saleEntry: 0,
    brokerage: 0,
    customRows: [],
  };

  const fixedFields = [
    { key: 'price', label: 'Valor do imóvel', type: 'debit', section: 'purchase', max: 1500000 },
    { key: 'registry', label: 'Custos de cartório', type: 'debit', section: 'purchase', max: 150000 },
    { key: 'renovation', label: 'Reforma', type: 'debit', section: 'renovation', max: 500000 },
    { key: 'bank', label: 'Financiamento do banco', type: 'credit', section: 'resource', max: 1500000 },
    { key: 'family1', label: 'Empréstimo de parentes 1', type: 'credit', section: 'resource', max: 500000 },
    { key: 'family2', label: 'Empréstimo de parentes 2', type: 'credit', section: 'resource', max: 500000 },
    { key: 'own', label: 'Recursos próprios disponíveis', type: 'credit', section: 'resource', max: 1000000 },
    { key: 'saleEntry', label: 'Entrada da venda do apartamento', type: 'credit', section: 'sale', max: 1000000 },
    { key: 'brokerage', label: 'Corretagem e despesas da venda', type: 'debit', section: 'sale', max: 250000 },
  ];

  const sectionTargets = {
    purchase: document.getElementById('purchase-fields'),
    renovation: document.getElementById('renovation-fields'),
    resource: document.getElementById('resource-fields'),
    sale: document.getElementById('sale-fields'),
  };

  const elements = {
    saveStatus: document.getElementById('save-status'),
    authButton: document.getElementById('auth'),
    resetButton: document.getElementById('reset'),
    authForm: document.getElementById('auth-form'),
    loginEmail: document.getElementById('login-email'),
    loginPassword: document.getElementById('login-password'),
    loginButton: document.getElementById('login'),
    authError: document.getElementById('auth-error'),
    cloudHelp: document.getElementById('cloud-help'),
    scenarioName: document.getElementById('scenario-name'),
    saveScenarioButton: document.getElementById('save-scenario'),
    scenarioList: document.getElementById('scenario-list'),
    customForm: document.getElementById('custom-form'),
    customFormTitle: document.getElementById('custom-form-title'),
    customType: document.getElementById('custom-type'),
    customName: document.getElementById('custom-name'),
    customAmount: document.getElementById('custom-amount'),
    customError: document.getElementById('custom-error'),
    customList: document.getElementById('custom-list'),
    shareReport: document.getElementById('share-report'),
    shareButton: document.getElementById('share-whatsapp'),
    downloadButton: document.getElementById('download-image'),
    shareFeedback: document.getElementById('share-feedback'),
    breakdown: document.getElementById('breakdown'),
    stack: document.getElementById('stack'),
    legend: document.getElementById('legend'),
  };

  const money = (number) =>
    roundMoney(Number(number) || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

  const signedMoney = (number) => {
    const rounded = roundMoney(number);
    if (rounded > 0) return `+ ${money(rounded)}`;
    if (rounded < 0) return `− ${money(Math.abs(rounded))}`;
    return money(0);
  };

  const formatMoneyInput = (number) =>
    roundMoney(Number(number) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  function parseMoneyInput(value) {
    const raw = String(value ?? '').trim().replace(/\s/g, '');
    if (!raw) return Number.NaN;
    if (/^\d{1,3}(\.\d{3})+(,\d{0,2})?$/.test(raw)) {
      return Number(raw.replace(/\./g, '').replace(',', '.'));
    }
    if (raw.includes(',')) return Number(raw.replace(/\./g, '').replace(',', '.'));
    return Number(raw);
  }

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function clampMoney(value) {
    return roundMoney(Math.max(0, Math.min(maxMoney, Number(value) || 0)));
  }

  function freshId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `linha-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function normalizeRows(source) {
    if (!Array.isArray(source)) return [];
    const ids = new Set();
    const rows = [];

    for (const item of source.slice(0, maxCustomRows)) {
      if (!item || typeof item !== 'object') continue;
      const label = String(item.label ?? item.name ?? '').trim().slice(0, 80);
      const rawType = item.type ?? item.direction;
      const type = rawType === 'credit' ? 'credit' : rawType === 'debit' ? 'debit' : null;
      const amount = clampMoney(item.amount);
      if (!label || !type) continue;

      let id = typeof item.id === 'string' && item.id.trim() ? item.id.trim().slice(0, 120) : freshId();
      while (ids.has(id)) id = freshId();
      ids.add(id);
      rows.push({ id, label, type, amount });
    }

    return rows;
  }

  function normalizeValues(source) {
    const result = { ...initial, customRows: [] };
    const scalarKeys = [
      'price',
      'entry',
      'bank',
      'own',
      'renovation',
      'registry',
      'family1',
      'family2',
      'saleEntry',
      'brokerage',
    ];

    for (const key of scalarKeys) {
      const number = Number(source?.[key]);
      if (!Number.isFinite(number)) continue;
      result[key] = key === 'entry' ? Math.max(0, Math.min(100, number)) : clampMoney(number);
    }

    result.schemaVersion = schemaVersion;
    result.customRows = normalizeRows(source?.customRows ?? source?.lines);
    return result;
  }

  function readLocal() {
    try {
      const current = localStorage.getItem(localKey);
      if (current) return normalizeValues(JSON.parse(current));

      const legacy = localStorage.getItem(legacyLocalKey);
      if (legacy) {
        const migrated = normalizeValues(JSON.parse(legacy));
        localStorage.setItem(localKey, JSON.stringify(migrated));
        return migrated;
      }
    } catch (error) {
      console.warn('Não foi possível ler os dados locais.', error);
    }
    return normalizeValues(initial);
  }

  function readLocalMeta() {
    try {
      const saved = JSON.parse(localStorage.getItem(localMetaKey));
      return {
        editedAt: Number(saved?.editedAt) || 0,
        pending: Boolean(saved?.pending),
      };
    } catch {
      return { editedAt: 0, pending: false };
    }
  }

  function calculate(values) {
    const purchaseMovement = roundMoney(-(values.price + values.registry));
    const afterPurchase = purchaseMovement;
    const renovationMovement = roundMoney(-values.renovation);
    const afterRenovation = roundMoney(afterPurchase + renovationMovement);
    const resourcesMovement = roundMoney(values.bank + values.family1 + values.family2 + values.own);
    const afterResources = roundMoney(afterRenovation + resourcesMovement);
    const saleMovement = roundMoney(values.saleEntry - values.brokerage);
    const afterSale = roundMoney(afterResources + saleMovement);
    const customMovement = roundMoney(
      values.customRows.reduce(
        (sum, row) => sum + (row.type === 'credit' ? row.amount : -row.amount),
        0,
      ),
    );
    const balance = roundMoney(afterSale + customMovement);
    const customDebits = roundMoney(
      values.customRows.filter((row) => row.type === 'debit').reduce((sum, row) => sum + row.amount, 0),
    );
    const customCredits = roundMoney(
      values.customRows.filter((row) => row.type === 'credit').reduce((sum, row) => sum + row.amount, 0),
    );
    const totalDebits = roundMoney(values.price + values.registry + values.renovation + values.brokerage + customDebits);
    const totalCredits = roundMoney(
      values.bank + values.family1 + values.family2 + values.own + values.saleEntry + customCredits,
    );

    return {
      purchaseMovement,
      afterPurchase,
      renovationMovement,
      afterRenovation,
      resourcesMovement,
      afterResources,
      saleMovement,
      afterSale,
      customMovement,
      balance,
      required: Math.max(0, roundMoney(-balance)),
      surplus: Math.max(0, balance),
      customDebits,
      customCredits,
      totalDebits,
      totalCredits,
    };
  }

  const localMeta = readLocalMeta();
  let state = readLocal();
  let localEditedAt = localMeta.editedAt;
  let localPending = localMeta.pending;
  let firebaseApi = null;
  let currentUser = null;
  let saveTimer = null;
  let firebaseStarting = false;
  let scenarioCache = new Map();
  let html2CanvasPromise = null;
  let editRevision = 0;
  let cloudSaveRunning = false;
  let exportRunning = false;

  function createFixedField(field) {
    const wrapper = document.createElement('div');
    wrapper.className = 'field';
    wrapper.dataset.kind = field.type;

    const top = document.createElement('div');
    top.className = 'field-top';

    const labelGroup = document.createElement('div');
    labelGroup.className = 'field-label';

    const label = document.createElement('label');
    label.htmlFor = field.key;
    label.textContent = field.label;

    const badge = document.createElement('span');
    badge.className = `kind-badge ${field.type}`;
    badge.textContent = field.type === 'credit' ? 'Crédito' : 'Débito';

    const numberField = document.createElement('div');
    numberField.className = 'number';
    const prefix = document.createElement('span');
    prefix.textContent = 'R$';
    const numberInput = document.createElement('input');
    numberInput.id = field.key;
    numberInput.type = 'text';
    numberInput.inputMode = 'decimal';

    numberField.append(prefix, numberInput);
    labelGroup.append(label, badge);
    top.append(labelGroup, numberField);

    const rangeWrap = document.createElement('details');
    rangeWrap.className = 'range-wrap';
    if (field.key === 'price') rangeWrap.open = true;
    const rangeSummary = document.createElement('summary');
    rangeSummary.textContent = 'Ajustar com a barra';
    const rangeInput = document.createElement('input');
    rangeInput.id = `${field.key}-range`;
    rangeInput.type = 'range';
    rangeInput.min = '0';
    rangeInput.max = String(field.max);
    rangeInput.step = '500';
    rangeInput.setAttribute('aria-label', `${field.label}: ajuste com a barra`);
    const rangeLabels = document.createElement('div');
    rangeLabels.className = 'range-label';
    const min = document.createElement('span');
    min.textContent = money(0);
    const max = document.createElement('span');
    max.id = `${field.key}-max`;
    rangeLabels.append(min, max);
    rangeWrap.append(rangeSummary, rangeInput, rangeLabels);
    wrapper.append(top, rangeWrap);

    numberInput.addEventListener('input', () => {
      if (numberInput.value === '') return;
      const number = parseMoneyInput(numberInput.value);
      if (!Number.isFinite(number)) return;
      state[field.key] = clampMoney(number);
      updateFixedFields(field.key);
      updateResults();
      scheduleCloudSave();
    });

    numberInput.addEventListener('blur', () => {
      numberInput.value = formatMoneyInput(state[field.key]);
    });

    numberInput.addEventListener('focus', () => {
      numberInput.value = String(state[field.key]);
      numberInput.select();
    });

    rangeInput.addEventListener('input', () => {
      state[field.key] = clampMoney(rangeInput.value);
      updateFixedFields(`${field.key}-range`);
      updateResults();
      scheduleCloudSave();
    });

    sectionTargets[field.section].appendChild(wrapper);
  }

  function buildFixedFields() {
    fixedFields.forEach(createFixedField);
  }

  function updateFixedFields(activeId = '') {
    for (const field of fixedFields) {
      const numberInput = document.getElementById(field.key);
      const rangeInput = document.getElementById(`${field.key}-range`);
      const rangeMax = Math.max(field.max, state[field.key]);
      rangeInput.max = String(rangeMax);
      if (activeId !== field.key) numberInput.value = formatMoneyInput(state[field.key]);
      if (activeId !== `${field.key}-range`) rangeInput.value = String(state[field.key]);
      document.getElementById(`${field.key}-max`).textContent = money(rangeMax);
    }
  }

  function setSignedOutput(id, value) {
    const output = document.getElementById(id);
    output.textContent = signedMoney(value);
    output.classList.toggle('positive', value > 0);
    output.classList.toggle('negative', value < 0);
  }

  function appendReportTitle(container, number, label) {
    const title = document.createElement('div');
    title.className = 'report-group-title';
    const step = document.createElement('span');
    step.textContent = number;
    const text = document.createElement('strong');
    text.textContent = label;
    title.append(step, text);
    container.appendChild(title);
  }

  function appendReportLine(container, label, signedValue, options = {}) {
    const row = document.createElement('div');
    row.className = 'line';
    if (options.total) row.classList.add('ledger-total');
    if (signedValue > 0) row.classList.add('credit');
    if (signedValue < 0) row.classList.add('debit');
    const name = document.createElement('span');
    name.textContent = label;
    const value = document.createElement('strong');
    value.textContent = signedMoney(signedValue);
    row.append(name, value);
    container.appendChild(row);
  }

  function renderBreakdown(calculation) {
    elements.breakdown.replaceChildren();

    appendReportTitle(elements.breakdown, '01', 'Compra do imóvel');
    appendReportLine(elements.breakdown, 'Valor do imóvel', -state.price);
    appendReportLine(elements.breakdown, 'Custos de cartório', -state.registry);
    appendReportLine(elements.breakdown, 'Saldo acumulado', calculation.afterPurchase, { total: true });

    appendReportTitle(elements.breakdown, '02', 'Reforma');
    appendReportLine(elements.breakdown, 'Reforma', -state.renovation);
    appendReportLine(elements.breakdown, 'Saldo acumulado', calculation.afterRenovation, { total: true });

    appendReportTitle(elements.breakdown, '03', 'Recursos disponíveis');
    appendReportLine(elements.breakdown, 'Financiamento do banco', state.bank);
    appendReportLine(elements.breakdown, 'Empréstimo de parentes 1', state.family1);
    appendReportLine(elements.breakdown, 'Empréstimo de parentes 2', state.family2);
    appendReportLine(elements.breakdown, 'Recursos próprios', state.own);
    appendReportLine(elements.breakdown, 'Saldo acumulado', calculation.afterResources, { total: true });

    appendReportTitle(elements.breakdown, '04', 'Entrada e corretagem');
    appendReportLine(elements.breakdown, 'Entrada da venda do apartamento', state.saleEntry);
    appendReportLine(elements.breakdown, 'Corretagem e despesas da venda', -state.brokerage);
    appendReportLine(elements.breakdown, 'Saldo acumulado', calculation.afterSale, { total: true });

    if (state.customRows.length) {
      appendReportTitle(elements.breakdown, '05', 'Outros lançamentos');
      for (const row of state.customRows) {
        appendReportLine(elements.breakdown, row.label, row.type === 'credit' ? row.amount : -row.amount);
      }
      appendReportLine(elements.breakdown, 'Saldo final', calculation.balance, { total: true });
    }
  }

  function renderComposition(calculation) {
    const relatives = roundMoney(state.family1 + state.family2);
    const otherCredits = calculation.customCredits;
    const parts = [
      { label: 'Banco', value: state.bank, color: '#2f6feb' },
      { label: 'Parentes', value: relatives, color: '#12a38b' },
      { label: 'Recursos próprios', value: state.own, color: '#80a8ff' },
      { label: 'Venda do apartamento', value: state.saleEntry, color: '#7767d8' },
      { label: 'Outros créditos', value: otherCredits, color: '#e4a53a' },
      { label: 'Valor a cobrir', value: calculation.required, color: '#d9e0ec' },
    ];

    elements.stack.replaceChildren();
    elements.legend.replaceChildren();
    const total = parts.reduce((sum, part) => sum + part.value, 0);

    for (const part of parts) {
      const bar = document.createElement('div');
      bar.style.flex = String(total > 0 ? part.value : 1);
      bar.style.background = part.color;
      bar.title = `${part.label}: ${money(part.value)}`;
      if (total > 0 && part.value > 0) elements.stack.appendChild(bar);

      const row = document.createElement('div');
      row.className = 'legend';
      const label = document.createElement('span');
      const dot = document.createElement('i');
      dot.style.background = part.color;
      const text = document.createTextNode(part.label);
      label.append(dot, text);
      const value = document.createElement('strong');
      value.textContent = money(part.value);
      row.append(label, value);
      elements.legend.appendChild(row);
    }
  }

  function updateResults() {
    const calculation = calculate(state);
    setSignedOutput('purchase-movement', calculation.purchaseMovement);
    setSignedOutput('purchase-balance', calculation.afterPurchase);
    setSignedOutput('renovation-movement', calculation.renovationMovement);
    setSignedOutput('renovation-balance', calculation.afterRenovation);
    setSignedOutput('resources-movement', calculation.resourcesMovement);
    setSignedOutput('resources-balance', calculation.afterResources);
    setSignedOutput('sale-movement', calculation.saleMovement);
    setSignedOutput('sale-balance', calculation.afterSale);
    setSignedOutput('custom-movement', calculation.customMovement);
    setSignedOutput('custom-balance', calculation.balance);

    const resultLabel = document.getElementById('result-label');
    const resultHelp = document.getElementById('result-help');
    const required = document.getElementById('required');
    const balanceLabel = document.getElementById('balance-label');
    const balance = document.getElementById('balance');
    const available = document.getElementById('available');
    const mobileLabel = document.getElementById('mobile-balance-label');
    const mobileBalance = document.getElementById('mobile-balance');
    const summary = elements.shareReport.querySelector('.summary');

    summary.dataset.result = calculation.balance < 0 ? 'negative' : calculation.balance > 0 ? 'positive' : 'balanced';

    if (calculation.balance < 0) {
      resultLabel.textContent = 'Valor que ainda falta';
      required.textContent = money(calculation.required);
      resultHelp.textContent = 'Este é o valor necessário para equilibrar todos os débitos e créditos informados.';
      balanceLabel.textContent = 'Saldo final negativo';
      balance.textContent = `− ${money(calculation.required)}`;
      mobileLabel.textContent = 'Ainda faltam';
      mobileBalance.textContent = money(calculation.required);
    } else if (calculation.balance > 0) {
      resultLabel.textContent = 'Sobra de recursos';
      required.textContent = money(calculation.surplus);
      resultHelp.textContent = 'Depois de pagar os custos informados, este valor permanece disponível.';
      balanceLabel.textContent = 'Saldo final positivo';
      balance.textContent = `+ ${money(calculation.surplus)}`;
      mobileLabel.textContent = 'Sobra de recursos';
      mobileBalance.textContent = money(calculation.surplus);
    } else {
      resultLabel.textContent = 'Cenário equilibrado';
      required.textContent = money(0);
      resultHelp.textContent = 'Os créditos informados cobrem exatamente todos os débitos deste cenário.';
      balanceLabel.textContent = 'Saldo final';
      balance.textContent = money(0);
      mobileLabel.textContent = 'Cenário equilibrado';
      mobileBalance.textContent = money(0);
    }

    available.textContent = `Débitos: ${money(calculation.totalDebits)} · Créditos: ${money(calculation.totalCredits)}`;
    renderBreakdown(calculation);
    renderComposition(calculation);
  }

  function syncCustomItemVisual(item, row) {
    item.dataset.kind = row.type;
    const badge = item.querySelector('.kind-badge');
    badge.className = `kind-badge ${row.type}`;
    badge.textContent = row.type === 'credit' ? 'Crédito' : 'Débito';
    const signed = item.querySelector('.custom-signed');
    signed.textContent = signedMoney(row.type === 'credit' ? row.amount : -row.amount);
    signed.className = `custom-signed ${row.type}`;
  }

  function createCustomItem(row, index) {
    const item = document.createElement('div');
    item.className = 'custom-item';
    item.dataset.id = row.id;

    const head = document.createElement('div');
    head.className = 'custom-item-head';
    const order = document.createElement('span');
    order.className = 'custom-order';
    order.textContent = `Lançamento ${index + 1}`;
    const badge = document.createElement('span');
    badge.className = 'kind-badge';
    const remove = document.createElement('button');
    remove.className = 'icon-button danger';
    remove.type = 'button';
    remove.textContent = 'Excluir';
    remove.setAttribute('aria-label', `Excluir ${row.label}`);
    head.append(order, badge, remove);

    const grid = document.createElement('div');
    grid.className = 'custom-item-grid';

    const typeLabel = document.createElement('label');
    typeLabel.className = 'form-field';
    const typeCaption = document.createElement('span');
    typeCaption.textContent = 'Tipo';
    const typeSelect = document.createElement('select');
    const debitOption = new Option('Débito — custo', 'debit');
    const creditOption = new Option('Crédito — recurso', 'credit');
    typeSelect.add(debitOption);
    typeSelect.add(creditOption);
    typeSelect.value = row.type;
    typeLabel.append(typeCaption, typeSelect);

    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-field custom-name-field';
    const nameCaption = document.createElement('span');
    nameCaption.textContent = 'Descrição';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 80;
    nameInput.value = row.label;
    nameInput.autocomplete = 'off';
    nameLabel.append(nameCaption, nameInput);

    const amountLabel = document.createElement('label');
    amountLabel.className = 'form-field';
    const amountCaption = document.createElement('span');
    amountCaption.textContent = 'Valor';
    const amountWrap = document.createElement('div');
    amountWrap.className = 'money-field';
    const prefix = document.createElement('span');
    prefix.textContent = 'R$';
    const amountInput = document.createElement('input');
    amountInput.type = 'text';
    amountInput.inputMode = 'decimal';
    amountInput.value = formatMoneyInput(row.amount);
    amountWrap.append(prefix, amountInput);
    amountLabel.append(amountCaption, amountWrap);

    grid.append(typeLabel, nameLabel, amountLabel);

    const footer = document.createElement('div');
    footer.className = 'custom-item-footer';
    const caption = document.createElement('span');
    caption.textContent = 'Efeito no saldo';
    const signed = document.createElement('strong');
    signed.className = 'custom-signed';
    footer.append(caption, signed);
    item.append(head, grid, footer);
    syncCustomItemVisual(item, row);

    typeSelect.addEventListener('change', () => {
      row.type = typeSelect.value === 'credit' ? 'credit' : 'debit';
      syncCustomItemVisual(item, row);
      updateResults();
      scheduleCloudSave();
    });

    nameInput.addEventListener('input', () => {
      row.label = nameInput.value.trim().slice(0, 80) || row.label;
      remove.setAttribute('aria-label', `Excluir ${row.label || 'lançamento'}`);
      updateResults();
      scheduleCloudSave();
    });

    nameInput.addEventListener('blur', () => {
      row.label = row.label.trim() || 'Lançamento sem nome';
      nameInput.value = row.label;
      updateResults();
      scheduleCloudSave();
    });

    amountInput.addEventListener('input', () => {
      if (amountInput.value === '') return;
      const parsed = parseMoneyInput(amountInput.value);
      if (!Number.isFinite(parsed)) return;
      row.amount = clampMoney(parsed);
      syncCustomItemVisual(item, row);
      updateResults();
      scheduleCloudSave();
    });

    amountInput.addEventListener('blur', () => {
      amountInput.value = formatMoneyInput(row.amount);
    });

    amountInput.addEventListener('focus', () => {
      amountInput.value = String(row.amount);
      amountInput.select();
    });

    remove.addEventListener('click', () => {
      if (!window.confirm(`Excluir o lançamento “${row.label}”?`)) return;
      state.customRows = state.customRows.filter((candidate) => candidate.id !== row.id);
      renderCustomRows();
      updateResults();
      scheduleCloudSave();
    });

    return item;
  }

  function renderCustomRows() {
    elements.customList.replaceChildren();
    if (!state.customRows.length) {
      const empty = document.createElement('p');
      empty.className = 'custom-empty';
      empty.textContent = 'Nenhum lançamento adicional.';
      elements.customList.appendChild(empty);
      return;
    }

    state.customRows.forEach((row, index) => elements.customList.appendChild(createCustomItem(row, index)));
  }

  function openCustomForm(type) {
    elements.customType.value = type;
    elements.customFormTitle.textContent = type === 'credit' ? 'Novo crédito' : 'Novo débito';
    elements.customError.hidden = true;
    elements.customForm.hidden = false;
    elements.customForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => elements.customName.focus(), 250);
  }

  function closeCustomForm() {
    elements.customForm.hidden = true;
    elements.customError.hidden = true;
    elements.customName.value = '';
    elements.customAmount.value = '';
  }

  function addCustomRow(event) {
    event.preventDefault();
    const label = elements.customName.value.trim();
    const amount = parseMoneyInput(elements.customAmount.value);

    if (state.customRows.length >= maxCustomRows) {
      elements.customError.textContent = `Você pode criar até ${maxCustomRows} lançamentos adicionais.`;
      elements.customError.hidden = false;
      return;
    }
    if (!label) {
      elements.customError.textContent = 'Dê um nome ao lançamento.';
      elements.customError.hidden = false;
      elements.customName.focus();
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > maxMoney) {
      elements.customError.textContent = 'Informe um valor maior que zero.';
      elements.customError.hidden = false;
      elements.customAmount.focus();
      return;
    }

    state.customRows.push({
      id: freshId(),
      label: label.slice(0, 80),
      type: elements.customType.value === 'credit' ? 'credit' : 'debit',
      amount: clampMoney(amount),
    });
    closeCustomForm();
    renderCustomRows();
    updateResults();
    scheduleCloudSave();
    elements.customList.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function setStatus(text, stateName = 'local') {
    elements.saveStatus.textContent = text;
    elements.saveStatus.dataset.state = stateName;
  }

  function saveLocal(markEdited = false) {
    if (markEdited) {
      editRevision += 1;
      localEditedAt = Date.now();
      localPending = true;
    }
    try {
      localStorage.setItem(localKey, JSON.stringify(state));
      localStorage.setItem(localMetaKey, JSON.stringify({ editedAt: localEditedAt, pending: localPending }));
    } catch (error) {
      console.warn('Não foi possível salvar neste navegador.', error);
    }
    if (!currentUser) setStatus('Salvo neste navegador', 'local');
  }

  function markCloudSynced(syncedAt = Date.now()) {
    localEditedAt = syncedAt || Date.now();
    localPending = false;
    saveLocal();
  }

  function scheduleCloudSave() {
    saveLocal(true);
    if (!firebaseApi || !currentUser) return;
    window.clearTimeout(saveTimer);
    setStatus('Salvando…', 'pending');
    saveTimer = window.setTimeout(saveCurrentToCloud, 700);
  }

  function applyValues(values, shouldPersist = true, syncedAt = 0) {
    state = normalizeValues(values);
    updateFixedFields();
    renderCustomRows();
    updateResults();
    if (shouldPersist) {
      scheduleCloudSave();
      return;
    }
    if (syncedAt) markCloudSynced(syncedAt);
    else saveLocal();
  }

  function cloudDocument(values, name = 'Cálculo atual', kind = 'current') {
    const normalized = normalizeValues(values);
    return {
      ...normalized,
      customRows: normalized.customRows.map((row) => ({ ...row })),
      name,
      kind,
      updatedAt: firebaseApi.serverTimestamp(),
    };
  }

  async function saveCurrentToCloud() {
    if (!firebaseApi || !currentUser || cloudSaveRunning) return;
    const uid = currentUser.uid;
    const savedRevision = editRevision;
    cloudSaveRunning = true;
    try {
      await firebaseApi.setDoc(
        firebaseApi.doc(firebaseApi.db, 'triplexUsers', uid, 'simulations', 'current'),
        cloudDocument(state),
      );
      if (currentUser?.uid === uid && savedRevision === editRevision) {
        markCloudSynced();
        setStatus('Salvo no Firebase', 'cloud');
      }
    } catch (error) {
      showFirebaseError(error);
    } finally {
      cloudSaveRunning = false;
      if (currentUser?.uid === uid && savedRevision !== editRevision) {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveCurrentToCloud, 100);
      }
    }
  }

  async function loadCurrentFromCloud() {
    if (!firebaseApi || !currentUser) return;
    const uid = currentUser.uid;
    const reference = firebaseApi.doc(firebaseApi.db, 'triplexUsers', uid, 'simulations', 'current');
    try {
      const snapshot = await firebaseApi.getDoc(reference);
      if (currentUser?.uid !== uid) return;
      if (snapshot.exists()) {
        const data = snapshot.data();
        const cloudUpdatedAt = typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : 0;
        if (localPending && localEditedAt > cloudUpdatedAt) {
          await saveCurrentToCloud();
        } else {
          applyValues(data, false, cloudUpdatedAt);
          setStatus('Sincronizado com o Firebase', 'cloud');
        }
      } else {
        await saveCurrentToCloud();
      }
    } catch (error) {
      showFirebaseError(error);
    }
  }

  function renderScenarios(items = []) {
    scenarioCache = new Map(items.map((item) => [item.id, item]));
    elements.scenarioList.replaceChildren();
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'scenario-empty';
      empty.textContent = currentUser ? 'Nenhum cenário salvo ainda.' : 'Entre com seu e-mail para ver seus cenários.';
      elements.scenarioList.appendChild(empty);
      return;
    }

    for (const item of items) {
      const card = document.createElement('div');
      card.className = 'scenario-item';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.className = 'scenario-name-text';
      name.textContent = item.name;
      const meta = document.createElement('span');
      meta.className = 'scenario-meta';
      meta.textContent = `${item.values.customRows.length} lançamento(s) adicional(is)`;
      info.append(name, meta);

      const actions = document.createElement('div');
      actions.className = 'scenario-actions';
      const loadButton = document.createElement('button');
      loadButton.className = 'button secondary';
      loadButton.type = 'button';
      loadButton.textContent = 'Carregar';
      loadButton.addEventListener('click', () => {
        const selected = scenarioCache.get(item.id);
        if (!selected) return;
        applyValues(selected.values);
        document.getElementById('top').scrollIntoView({ behavior: 'smooth' });
        setStatus('Cenário carregado', currentUser ? 'cloud' : 'local');
      });
      const deleteButton = document.createElement('button');
      deleteButton.className = 'button quiet danger';
      deleteButton.type = 'button';
      deleteButton.textContent = 'Excluir';
      deleteButton.addEventListener('click', () => deleteScenario(item.id, item.name));
      actions.append(loadButton, deleteButton);
      card.append(info, actions);
      elements.scenarioList.appendChild(card);
    }
  }

  async function refreshScenarios() {
    if (!firebaseApi || !currentUser) {
      renderScenarios();
      return;
    }
    const uid = currentUser.uid;
    try {
      const snapshot = await firebaseApi.getDocs(
        firebaseApi.collection(firebaseApi.db, 'triplexUsers', uid, 'simulations'),
      );
      if (currentUser?.uid !== uid) return;
      const items = [];
      snapshot.forEach((documentSnapshot) => {
        const data = documentSnapshot.data();
        if (documentSnapshot.id === 'current' || data.kind !== 'saved') return;
        const timestamp = typeof data.updatedAt?.toMillis === 'function' ? data.updatedAt.toMillis() : 0;
        items.push({
          id: documentSnapshot.id,
          name: String(data.name || 'Cenário sem nome'),
          values: normalizeValues(data),
          updatedAt: timestamp,
        });
      });
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      renderScenarios(items);
    } catch (error) {
      showFirebaseError(error);
    }
  }

  async function saveNamedScenario() {
    if (!firebaseApi || !currentUser) return;
    const name = elements.scenarioName.value.trim() || `Cenário de ${new Date().toLocaleString('pt-BR')}`;
    elements.saveScenarioButton.disabled = true;
    setStatus('Salvando cenário…', 'pending');
    try {
      const payload = {
        ...cloudDocument(state, name.slice(0, 80), 'saved'),
        createdAt: firebaseApi.serverTimestamp(),
      };
      await firebaseApi.addDoc(
        firebaseApi.collection(firebaseApi.db, 'triplexUsers', currentUser.uid, 'simulations'),
        payload,
      );
      elements.scenarioName.value = '';
      await refreshScenarios();
      setStatus('Cenário salvo', 'cloud');
    } catch (error) {
      showFirebaseError(error);
    } finally {
      elements.saveScenarioButton.disabled = !currentUser;
    }
  }

  async function deleteScenario(id, name) {
    if (!firebaseApi || !currentUser || !window.confirm(`Excluir o cenário “${name}”?`)) return;
    try {
      await firebaseApi.deleteDoc(
        firebaseApi.doc(firebaseApi.db, 'triplexUsers', currentUser.uid, 'simulations', id),
      );
      await refreshScenarios();
      setStatus('Cenário excluído', 'cloud');
    } catch (error) {
      showFirebaseError(error);
    }
  }

  function firebaseErrorMessage(error) {
    const code = String(error?.code || '');
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
      return 'E-mail ou senha incorretos.';
    }
    if (code.includes('invalid-email')) return 'Digite um endereço de e-mail válido.';
    if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    if (code.includes('operation-not-allowed')) return 'Ative o login por e-mail e senha no Firebase Authentication.';
    if (code.includes('permission-denied')) return 'As regras do Firebase precisam ser atualizadas para esta versão.';
    return 'Não foi possível conectar ao Firebase.';
  }

  function showFirebaseError(error) {
    const message = firebaseErrorMessage(error);
    setStatus('Erro de sincronização', 'error');
    elements.cloudHelp.textContent = message;
    elements.authError.textContent = message;
    elements.authError.hidden = false;
    console.error(error);
  }

  async function handleAuthState(user) {
    currentUser = user;
    window.clearTimeout(saveTimer);
    if (!user) {
      elements.authButton.textContent = '☁ Entrar';
      elements.authButton.dataset.signedIn = 'false';
      elements.authForm.hidden = false;
      elements.saveScenarioButton.disabled = true;
      elements.cloudHelp.textContent = 'Entre com sua conta para salvar cenários no Firebase e acessá-los em outros aparelhos.';
      renderScenarios();
      setStatus('Salvo neste navegador', 'local');
      return;
    }

    elements.authButton.textContent = 'Sair';
    elements.authButton.dataset.signedIn = 'true';
    elements.authForm.hidden = true;
    elements.authError.hidden = true;
    elements.loginPassword.value = '';
    elements.saveScenarioButton.disabled = false;
    elements.cloudHelp.textContent = `Conectado como ${user.email || 'usuário'}. Cada alteração é salva automaticamente.`;
    setStatus('Sincronizando…', 'pending');
    await loadCurrentFromCloud();
    await refreshScenarios();
  }

  function hasFirebaseConfig(config) {
    return Boolean(
      config &&
        ['apiKey', 'authDomain', 'projectId', 'appId'].every(
          (key) => typeof config[key] === 'string' && config[key].trim() && !config[key].includes('COLE_'),
        ),
    );
  }

  async function startFirebase() {
    if (firebaseStarting || firebaseApi) return;
    const config = window.FIREBASE_CONFIG;
    if (!hasFirebaseConfig(config)) {
      elements.authButton.disabled = true;
      elements.authButton.textContent = 'Firebase não configurado';
      elements.authForm.hidden = true;
      elements.cloudHelp.textContent = 'A configuração do aplicativo Firebase ainda precisa ser adicionada.';
      return;
    }

    firebaseStarting = true;
    elements.authButton.disabled = true;
    elements.loginButton.disabled = true;
    setStatus('Conectando ao Firebase…', 'pending');
    try {
      const base = `https://www.gstatic.com/firebasejs/${sdkVersion}/`;
      const [appModule, authModule, storeModule] = await Promise.all([
        import(`${base}firebase-app.js`),
        import(`${base}firebase-auth.js`),
        import(`${base}firebase-firestore.js`),
      ]);
      const app = appModule.initializeApp(config);
      const auth = authModule.getAuth(app);
      await authModule.setPersistence(auth, authModule.browserLocalPersistence);
      const db = storeModule.getFirestore(app);
      firebaseApi = {
        auth,
        db,
        signInWithEmailAndPassword: authModule.signInWithEmailAndPassword,
        signOut: authModule.signOut,
        onAuthStateChanged: authModule.onAuthStateChanged,
        doc: storeModule.doc,
        setDoc: storeModule.setDoc,
        getDoc: storeModule.getDoc,
        collection: storeModule.collection,
        addDoc: storeModule.addDoc,
        getDocs: storeModule.getDocs,
        deleteDoc: storeModule.deleteDoc,
        serverTimestamp: storeModule.serverTimestamp,
      };
      firebaseApi.onAuthStateChanged(auth, (user) => void handleAuthState(user), showFirebaseError);
      elements.authButton.disabled = false;
      elements.loginButton.disabled = false;
    } catch (error) {
      firebaseStarting = false;
      elements.authButton.disabled = false;
      elements.loginButton.disabled = false;
      showFirebaseError(error);
    }
  }

  async function signIn() {
    if (!firebaseApi) {
      await startFirebase();
      if (!firebaseApi) return;
    }
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    if (!email || !password) {
      elements.authError.textContent = 'Digite seu e-mail e sua senha.';
      elements.authError.hidden = false;
      return;
    }
    elements.loginButton.disabled = true;
    elements.authError.hidden = true;
    setStatus('Entrando…', 'pending');
    try {
      await firebaseApi.signInWithEmailAndPassword(firebaseApi.auth, email, password);
    } catch (error) {
      showFirebaseError(error);
    } finally {
      elements.loginButton.disabled = false;
    }
  }

  function loadHtml2Canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    if (html2CanvasPromise) return html2CanvasPromise;
    html2CanvasPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      script.crossOrigin = 'anonymous';
      script.onload = () =>
        window.html2canvas ? resolve(window.html2canvas) : reject(new Error('Biblioteca de imagem indisponível'));
      script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca de imagem'));
      document.head.appendChild(script);
    }).catch((error) => {
      html2CanvasPromise = null;
      throw error;
    });
    return html2CanvasPromise;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível criar a imagem'))),
        'image/png',
      ),
    );
  }

  async function createReportImage4k() {
    const html2canvas = await loadHtml2Canvas();
    const stage = document.createElement('div');
    const clone = elements.shareReport.cloneNode(true);
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
    stage.className = 'share-export-stage';
    stage.setAttribute('aria-hidden', 'true');
    Object.assign(stage.style, {
      position: 'fixed',
      left: '-10000px',
      top: '0',
      width: '540px',
      height: '960px',
      padding: '24px',
      background: '#f4f7fb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      overflow: 'hidden',
      zIndex: '-9999',
    });
    Object.assign(clone.style, { width: '492px', flex: 'none', margin: '0' });
    stage.appendChild(clone);
    document.body.appendChild(stage);

    try {
      if (document.fonts?.ready) await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const naturalHeight = clone.getBoundingClientRect().height;
      const availableHeight = 912;
      const fitScale = Math.min(1, availableHeight / Math.max(1, naturalHeight));
      clone.style.transform = `scale(${fitScale})`;
      clone.style.transformOrigin = 'center center';
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const canvas = await html2canvas(stage, {
        scale: 4,
        width: 540,
        height: 960,
        backgroundColor: '#f4f7fb',
        useCORS: true,
        logging: false,
      });
      return await canvasToBlob(canvas);
    } finally {
      stage.remove();
    }
  }

  function downloadReportImage(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function copyReportImage(blob) {
    if (!navigator.clipboard || !window.ClipboardItem) return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch {
      return false;
    }
  }

  async function withGeneratedImage(button, task) {
    if (exportRunning) return;
    exportRunning = true;
    elements.shareButton.disabled = true;
    elements.downloadButton.disabled = true;
    const originalLabel = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.textContent = 'Gerando imagem 4K…';
    elements.shareFeedback.textContent = 'Preparando o relatório em 2160 × 3840 pixels.';
    try {
      const blob = await createReportImage4k();
      await task(blob);
    } catch (error) {
      elements.shareFeedback.textContent = 'Não foi possível gerar a imagem. Verifique sua conexão e tente novamente.';
      console.error(error);
    } finally {
      exportRunning = false;
      elements.shareButton.disabled = false;
      elements.downloadButton.disabled = false;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.textContent = originalLabel;
    }
  }

  async function shareReportOnWhatsApp() {
    await withGeneratedImage(elements.shareButton, async (blob) => {
      const fileName = 'meu-triplex-cenario-4k.png';
      const file = new File([blob], fileName, { type: 'image/png' });
      const shareData = {
        title: 'Meu Triplex',
        text: 'Meu cenário financeiro do triplex.',
        files: [file],
      };
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share(shareData);
          elements.shareFeedback.textContent = 'Imagem 4K compartilhada.';
          return;
        } catch (error) {
          if (error?.name === 'AbortError') {
            elements.shareFeedback.textContent = '';
            return;
          }
        }
      }

      downloadReportImage(blob, fileName);
      const copied = await copyReportImage(blob);
      const message = copied
        ? 'Meu cenário do Triplex está pronto. A imagem foi copiada; cole-a nesta conversa.'
        : `Meu cenário do Triplex está pronto. Anexe o arquivo ${fileName} que foi baixado.`;
      elements.shareFeedback.textContent = copied
        ? 'Imagem 4K copiada e baixada. Cole-a na conversa do WhatsApp.'
        : 'Imagem 4K baixada. Anexe o arquivo na conversa do WhatsApp.';
      const opened = window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
      if (opened) opened.opener = null;
      else window.location.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
    });
  }

  async function downloadImage() {
    await withGeneratedImage(elements.downloadButton, async (blob) => {
      downloadReportImage(blob, 'meu-triplex-cenario-4k.png');
      elements.shareFeedback.textContent = 'Imagem 4K baixada.';
    });
  }

  function bindEvents() {
    document.getElementById('open-debit').addEventListener('click', () => openCustomForm('debit'));
    document.getElementById('open-credit').addEventListener('click', () => openCustomForm('credit'));
    document.getElementById('cancel-custom').addEventListener('click', closeCustomForm);
    elements.customForm.addEventListener('submit', addCustomRow);

    document.getElementById('mobile-report').addEventListener('click', () => {
      document.getElementById('report').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    elements.shareButton.addEventListener('click', shareReportOnWhatsApp);
    elements.downloadButton.addEventListener('click', downloadImage);

    elements.resetButton.addEventListener('click', () => {
      if (!window.confirm('Reiniciar todos os valores e apagar os lançamentos adicionais deste cálculo?')) return;
      applyValues(initial);
      setStatus('Cálculo reiniciado', currentUser ? 'pending' : 'local');
    });

    elements.authButton.addEventListener('click', async () => {
      if (currentUser && firebaseApi) {
        elements.authButton.disabled = true;
        try {
          await firebaseApi.signOut(firebaseApi.auth);
        } catch (error) {
          showFirebaseError(error);
        } finally {
          elements.authButton.disabled = false;
        }
        return;
      }
      elements.authForm.hidden = false;
      document.querySelector('.scenario-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.setTimeout(() => elements.loginEmail.focus(), 300);
    });

    elements.loginButton.addEventListener('click', signIn);
    elements.loginPassword.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') signIn();
    });
    elements.saveScenarioButton.addEventListener('click', saveNamedScenario);
    elements.scenarioName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !elements.saveScenarioButton.disabled) saveNamedScenario();
    });
    window.addEventListener('pagehide', () => saveLocal());
    window.addEventListener('online', () => {
      if (localPending && currentUser) void saveCurrentToCloud();
    });
  }

  function initialize() {
    buildFixedFields();
    bindEvents();
    updateFixedFields();
    renderCustomRows();
    updateResults();
    saveLocal();
    startFirebase();

    window.triplexSimulator = {
      calculate: (values) => calculate(normalizeValues(values)),
      getState: () => JSON.parse(JSON.stringify(state)),
      schemaVersion,
    };
  }

  initialize();
})();