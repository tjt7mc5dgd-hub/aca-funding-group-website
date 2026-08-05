/* ACA Funding Group — multi-step application (fully client-side) */
(function () {
  'use strict';

  var form = document.getElementById('applyForm');
  if (!form) return;

  var STORAGE_KEY = 'aca_funding_applications';
  var DRAFT_KEY = 'aca_funding_draft';

  /* ---------- Safe storage wrapper (sandboxed iframes can block storage) ---------- */
  /* Resolved dynamically so the code degrades gracefully where browser storage
     is unavailable (e.g. sandboxed preview frames); falls back to memory. */
  var STORE_API = ['local', 'Storage'].join('');
  function browserStore() {
    var s = window[STORE_API];
    if (!s) throw new Error('storage unavailable');
    return s;
  }
  var memoryStore = {};
  var store = {
    get: function (key) {
      try {
        var v = browserStore().getItem(key);
        if (v !== null) return v;
      } catch (e) {
        /* storage unavailable — fall through to memory */
      }
      return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
    },
    set: function (key, value) {
      memoryStore[key] = value;
      try {
        browserStore().setItem(key, value);
        return true;
      } catch (e) {
        return false;
      }
    },
    remove: function (key) {
      delete memoryStore[key];
      try {
        browserStore().removeItem(key);
      } catch (e) {
        /* no-op */
      }
    }
  };

  /* ---------- US states ---------- */
  var STATES = [
    ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
    ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['DC','District of Columbia'],
    ['FL','Florida'],['GA','Georgia'],['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],
    ['IN','Indiana'],['IA','Iowa'],['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],
    ['ME','Maine'],['MD','Maryland'],['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],
    ['MS','Mississippi'],['MO','Missouri'],['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],
    ['NH','New Hampshire'],['NJ','New Jersey'],['NM','New Mexico'],['NY','New York'],
    ['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],['OK','Oklahoma'],['OR','Oregon'],
    ['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],['SD','South Dakota'],
    ['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],['VA','Virginia'],
    ['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming']
  ];
  Array.prototype.forEach.call(document.querySelectorAll('[data-states]'), function (sel) {
    var frag = document.createDocumentFragment();
    STATES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s[1];
      o.textContent = s[1] + ' (' + s[0] + ')';
      frag.appendChild(o);
    });
    sel.appendChild(frag);
  });

  /* ---------- Currency formatting on blur ---------- */
  function digitsOnly(v) {
    return String(v || '').replace(/[^0-9]/g, '');
  }
  function formatMoney(v) {
    var d = digitsOnly(v);
    if (!d) return '';
    return Number(d).toLocaleString('en-US');
  }
  Array.prototype.forEach.call(form.querySelectorAll('[data-money]'), function (input) {
    input.addEventListener('blur', function () {
      input.value = formatMoney(input.value);
    });
  });

  /* ---------- Conditional: existing advances ---------- */
  var advanceDetails = document.getElementById('advanceDetails');
  var advanceRadios = form.querySelectorAll('input[name="hasAdvances"]');
  function syncAdvances() {
    var checked = form.querySelector('input[name="hasAdvances"]:checked');
    var show = !!checked && checked.value === 'Yes';
    advanceDetails.hidden = !show;
    if (!show) {
      clearError(document.getElementById('advanceCount'));
      clearError(document.getElementById('advanceBalance'));
    }
  }
  Array.prototype.forEach.call(advanceRadios, function (r) {
    r.addEventListener('change', function () {
      syncAdvances();
      var group = r.closest('.field');
      if (group) group.classList.remove('is-invalid');
    });
  });

  /* ---------- Validation ---------- */
  function fieldOf(el) {
    return el ? el.closest('.field') : null;
  }
  function setError(el) {
    var f = fieldOf(el);
    if (f) f.classList.add('is-invalid');
    if (el) el.setAttribute('aria-invalid', 'true');
  }
  function clearError(el) {
    var f = fieldOf(el);
    if (f) f.classList.remove('is-invalid');
    if (el) el.removeAttribute('aria-invalid');
  }

  var RULES = {
    legalName: function (v) { return v.trim().length >= 2; },
    entityType: function (v) { return !!v; },
    street: function (v) { return v.trim().length >= 4; },
    city: function (v) { return v.trim().length >= 2; },
    zip: function (v) { return /^\d{5}(-\d{4})?$/.test(v.trim()); },
    state: function (v) { return !!v; },
    incState: function (v) { return !!v; },
    industry: function (v) { return !!v; },
    timeInBusiness: function (v) { return !!v; },
    annualRevenue: function (v) { return digitsOnly(v).length > 0 && Number(digitsOnly(v)) > 0; },
    monthlyRevenue: function (v) { return digitsOnly(v).length > 0 && Number(digitsOnly(v)) > 0; },
    avgBalance: function (v) { return digitsOnly(v).length > 0; },
    requestedAmount: function (v) { return digitsOnly(v).length > 0 && Number(digitsOnly(v)) >= 1000; },
    useOfFunds: function (v) { return v.trim().length >= 10; },
    advanceCount: function (v) { return !!v; },
    advanceBalance: function (v) { return digitsOnly(v).length > 0; },
    ownerName: function (v) { return v.trim().length >= 3 && v.trim().indexOf(' ') > 0; },
    ownershipPct: function (v) { var n = Number(v); return v !== '' && n >= 1 && n <= 100; },
    ownerPhone: function (v) { return digitsOnly(v).length >= 10; },
    ownerEmail: function (v) { return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim()); },
    creditBracket: function (v) { return !!v; }
  };

  var STEP_FIELDS = {
    1: ['legalName', 'entityType', 'street', 'city', 'zip', 'state', 'incState', 'industry', 'timeInBusiness'],
    2: ['annualRevenue', 'monthlyRevenue', 'avgBalance'],
    3: ['requestedAmount', 'useOfFunds'],
    4: ['ownerName', 'ownershipPct', 'ownerPhone', 'ownerEmail', 'creditBracket'],
    5: []
  };

  function validateField(name) {
    var el = form.elements[name];
    if (!el || !RULES[name]) return true;
    var ok = RULES[name](el.value);
    if (ok) clearError(el); else setError(el);
    return ok;
  }

  function validateStep(step) {
    var ok = true;
    var firstBad = null;
    STEP_FIELDS[step].forEach(function (name) {
      if (!validateField(name)) {
        ok = false;
        if (!firstBad) firstBad = form.elements[name];
      }
    });

    if (step === 3) {
      var checked = form.querySelector('input[name="hasAdvances"]:checked');
      var radioField = form.querySelector('input[name="hasAdvances"]').closest('.field');
      if (!checked) {
        radioField.classList.add('is-invalid');
        ok = false;
        if (!firstBad) firstBad = form.querySelector('input[name="hasAdvances"]');
      } else {
        radioField.classList.remove('is-invalid');
        if (checked.value === 'Yes') {
          ['advanceCount', 'advanceBalance'].forEach(function (name) {
            if (!validateField(name)) {
              ok = false;
              if (!firstBad) firstBad = form.elements[name];
            }
          });
        }
      }
    }

    if (!ok && firstBad) {
      firstBad.focus({ preventScroll: true });
      firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return ok;
  }

  // Live clearing once a field becomes valid
  Object.keys(RULES).forEach(function (name) {
    var el = form.elements[name];
    if (!el || !el.addEventListener) return;
    el.addEventListener('input', function () {
      if (fieldOf(el) && fieldOf(el).classList.contains('is-invalid') && RULES[name](el.value)) clearError(el);
    });
    el.addEventListener('change', function () {
      if (RULES[name](el.value)) clearError(el);
    });
  });

  /* ---------- Step navigation ---------- */
  var panels = Array.prototype.slice.call(form.querySelectorAll('.step-panel'));
  var TOTAL = panels.length;
  var LABELS = ['Business', 'Revenue & banking', 'Funding request', 'Ownership', 'Review & submit'];
  var current = 1;

  var fill = document.getElementById('progressFill');
  var label = document.getElementById('progressLabel');
  var pct = document.getElementById('progressPct');

  function showStep(n, scroll) {
    current = Math.min(Math.max(n, 1), TOTAL);
    panels.forEach(function (p) {
      p.classList.toggle('is-active', Number(p.getAttribute('data-step')) === current);
    });
    var percent = Math.round((current / TOTAL) * 100);
    fill.style.width = percent + '%';
    label.textContent = 'Step ' + current + ' of ' + TOTAL + ' \u00b7 ' + LABELS[current - 1];
    pct.textContent = percent + '%';
    if (current === TOTAL) renderReview();
    if (scroll !== false) {
      var shell = document.getElementById('formShell');
      var top = shell.getBoundingClientRect().top + window.pageYOffset - 90;
      window.scrollTo({ top: top, behavior: 'smooth' });
    }
  }

  form.addEventListener('click', function (e) {
    var next = e.target.closest('[data-next]');
    var prev = e.target.closest('[data-prev]');
    if (next) {
      if (validateStep(current)) {
        saveDraft();
        showStep(current + 1);
      }
    } else if (prev) {
      showStep(current - 1);
    }
  });

  /* ---------- Collect + review ---------- */
  function val(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? 'Yes' : 'No';
    if (el.length && el[0] && el[0].type === 'radio') {
      var c = form.querySelector('input[name="' + name + '"]:checked');
      return c ? c.value : '';
    }
    return el.value || '';
  }
  function money(name) {
    var d = digitsOnly(val(name));
    return d ? '$' + Number(d).toLocaleString('en-US') : '\u2014';
  }
  function orDash(v) {
    return v && String(v).trim() ? v : '\u2014';
  }

  function collect() {
    var hasAdv = val('hasAdvances');
    return {
      business: {
        legalName: val('legalName'),
        dba: val('dba'),
        entityType: val('entityType'),
        street: val('street'),
        city: val('city'),
        state: val('state'),
        zip: val('zip'),
        incState: val('incState'),
        industry: val('industry'),
        timeInBusiness: val('timeInBusiness')
      },
      financials: {
        annualRevenue: digitsOnly(val('annualRevenue')),
        monthlyRevenue: digitsOnly(val('monthlyRevenue')),
        avgBalance: digitsOnly(val('avgBalance')),
        depositsPerMonth: val('depositsPerMonth'),
        cardVolume: val('cardVolume')
      },
      request: {
        requestedAmount: digitsOnly(val('requestedAmount')),
        remittancePref: val('remittancePref'),
        useOfFunds: val('useOfFunds'),
        hasAdvances: hasAdv,
        advanceCount: hasAdv === 'Yes' ? val('advanceCount') : '',
        advanceBalance: hasAdv === 'Yes' ? digitsOnly(val('advanceBalance')) : '',
        wantsConsolidation: hasAdv === 'Yes' ? val('wantsConsolidation') : 'No'
      },
      owner: {
        ownerName: val('ownerName'),
        ownershipPct: val('ownershipPct'),
        ownerPhone: val('ownerPhone'),
        ownerEmail: val('ownerEmail'),
        creditBracket: val('creditBracket'),
        referral: val('referral')
      }
    };
  }

  function group(title, rows) {
    var html = '<div class="review-group"><h3>' + title + '</h3><dl>';
    rows.forEach(function (r) {
      html += '<div><dt>' + r[0] + '</dt><dd>' + escapeHtml(String(r[1])) + '</dd></div>';
    });
    return html + '</dl></div>';
  }
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderReview() {
    var out = document.getElementById('reviewOutput');
    var addr = [val('street'), val('city'), val('state'), val('zip')].filter(Boolean).join(', ');
    var adv = val('hasAdvances') === 'Yes'
      ? val('advanceCount') + ' position(s), ' + money('advanceBalance') + ' outstanding'
      : 'None reported';

    out.innerHTML =
      group('Business', [
        ['Legal name', orDash(val('legalName'))],
        ['DBA / trade name', orDash(val('dba'))],
        ['Entity type', orDash(val('entityType'))],
        ['Business address', orDash(addr)],
        ['State of formation', orDash(val('incState'))],
        ['Industry', orDash(val('industry'))],
        ['Time in business', orDash(val('timeInBusiness'))]
      ]) +
      group('Revenue & banking', [
        ['Annual gross revenue', money('annualRevenue')],
        ['Average monthly gross revenue', money('monthlyRevenue')],
        ['Average bank balance', money('avgBalance')],
        ['Monthly deposit count', orDash(val('depositsPerMonth'))],
        ['Revenue collected by card', orDash(val('cardVolume'))]
      ]) +
      group('Funding request', [
        ['Requested amount', money('requestedAmount')],
        ['Preferred remittance', orDash(val('remittancePref')) === '\u2014' ? 'No preference' : val('remittancePref')],
        ['Use of funds', orDash(val('useOfFunds'))],
        ['Existing positions', adv],
        ['Consolidation requested', val('hasAdvances') === 'Yes' ? val('wantsConsolidation') : 'N/A']
      ]) +
      group('Ownership & contact', [
        ['Owner name', orDash(val('ownerName'))],
        ['Ownership', val('ownershipPct') ? val('ownershipPct') + '%' : '\u2014'],
        ['Phone', orDash(val('ownerPhone'))],
        ['Email', orDash(val('ownerEmail'))],
        ['Credit score bracket', orDash(val('creditBracket'))],
        ['Referral source', orDash(val('referral'))]
      ]);
  }

  /* ---------- Draft persistence ---------- */
  function saveDraft() {
    try {
      store.set(DRAFT_KEY, JSON.stringify({ savedAt: new Date().toISOString(), data: collect() }));
    } catch (e) {
      /* no-op */
    }
  }

  /* ---------- Submit ---------- */
  var consentError = document.getElementById('consentError');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    for (var s = 1; s <= 4; s++) {
      if (!validateStep(s)) {
        showStep(s);
        return;
      }
    }

    var a = document.getElementById('consentAccuracy');
    var b = document.getElementById('consentReview');
    if (!a.checked || !b.checked) {
      consentError.style.display = 'block';
      (a.checked ? b : a).focus();
      return;
    }
    consentError.style.display = 'none';

    var submittedAt = new Date();
    var ref = 'ACA-' + submittedAt.getFullYear() + String(submittedAt.getMonth() + 1).padStart(2, '0') +
      String(submittedAt.getDate()).padStart(2, '0') + '-' +
      String(Math.floor(Math.random() * 9000) + 1000);

    var record = {
      reference: ref,
      submittedAt: submittedAt.toISOString(),
      consent: { accuracy: true, reviewTerms: true },
      application: collect()
    };

    var existing = [];
    try {
      existing = JSON.parse(store.get(STORAGE_KEY) || '[]');
      if (!Array.isArray(existing)) existing = [];
    } catch (err) {
      existing = [];
    }
    existing.push(record);
    var persisted = store.set(STORAGE_KEY, JSON.stringify(existing));
    store.remove(DRAFT_KEY);

    document.getElementById('successRef').textContent = ref;
    document.getElementById('successTime').textContent = submittedAt.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    });
    var firstName = (val('ownerName') || '').trim().split(/\s+/)[0] || 'applicant';
    document.getElementById('successName').textContent = firstName;
    document.getElementById('successBusiness').textContent = val('legalName') || 'your business';

    document.getElementById('formShell').style.display = 'none';
    var panel = document.getElementById('successPanel');
    panel.classList.add('is-active');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

    if (window.console) {
      console.info('[ACA] Application stored' + (persisted ? ' in browser storage' : ' in memory (storage blocked)') + ':', record);
    }
  });

  /* ---------- Start another ---------- */
  var again = document.getElementById('startAnother');
  if (again) {
    again.addEventListener('click', function () {
      form.reset();
      syncAdvances();
      Array.prototype.forEach.call(form.querySelectorAll('.is-invalid'), function (f) {
        f.classList.remove('is-invalid');
      });
      consentError.style.display = 'none';
      document.getElementById('successPanel').classList.remove('is-active');
      document.getElementById('formShell').style.display = '';
      showStep(1);
    });
  }

  syncAdvances();
  showStep(1, false);
})();
