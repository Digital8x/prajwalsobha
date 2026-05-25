// ===== COUNTRY DATA =====
const countries = [
  {name:'India',code:'IN',dial:'+91',flag:'🇮🇳',len:10,pref:[6,7,8,9]},
  {name:'United Arab Emirates',code:'AE',dial:'+971',flag:'🇦🇪',len:9},
  {name:'Saudi Arabia',code:'SA',dial:'+966',flag:'🇸🇦',len:9},
  {name:'Qatar',code:'QA',dial:'+974',flag:'🇶🇦',len:8},
  {name:'Kuwait',code:'KW',dial:'+965',flag:'🇰🇼',len:8},
  {name:'Oman',code:'OM',dial:'+968',flag:'🇴🇲',len:8},
  {name:'Bahrain',code:'BH',dial:'+973',flag:'🇧🇭',len:8},
  {name:'United States',code:'US',dial:'+1',flag:'🇺🇸',len:10},
  {name:'United Kingdom',code:'GB',dial:'+44',flag:'🇬🇧',len:10},
  {name:'Singapore',code:'SG',dial:'+65',flag:'🇸🇬',len:8},
  {name:'Australia',code:'AU',dial:'+61',flag:'🇦🇺',len:9},
  {name:'Canada',code:'CA',dial:'+1',flag:'🇨🇦',len:10},
  {name:'Malaysia',code:'MY',dial:'+60',flag:'🇲🇾',len:[9,10]},
  {name:'Bangladesh',code:'BD',dial:'+880',flag:'🇧🇩',len:10},
  {name:'Sri Lanka',code:'LK',dial:'+94',flag:'🇱🇰',len:9},
  {name:'Nepal',code:'NP',dial:'+977',flag:'🇳🇵',len:10},
  {name:'Thailand',code:'TH',dial:'+66',flag:'🇹🇭',len:9},
  {name:'Indonesia',code:'ID',dial:'+62',flag:'🇮🇩',len:[9,10,11]},
  {name:'Afghanistan',code:'AF',dial:'+93',flag:'🇦🇫',len:9},
  {name:'France',code:'FR',dial:'+33',flag:'🇫🇷',len:9},
  {name:'Germany',code:'DE',dial:'+49',flag:'🇩🇪',len:10},
  {name:'Other',code:'XX',dial:'',flag:'🌐',len:[7,15]}
];

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  initCountrySelectors();
  autoDetectCountry();
  setFormLoadTimes();
  initScrollAnimations();
  initNavbar();
});

// ===== NAVBAR =====
function initNavbar() {
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 60);
  });
}
function toggleNav() {
  const links = document.getElementById('navLinks');
  const ham = document.getElementById('hamburger');
  links.classList.toggle('active');
  ham.classList.toggle('active');
}
// Close mobile nav on link click
document.querySelectorAll('.nav-links a:not(.nav-cta)').forEach(a => {
  a.addEventListener('click', () => {
    document.getElementById('navLinks').classList.remove('active');
    document.getElementById('hamburger').classList.remove('active');
  });
});

// ===== COUNTRY SELECTOR =====
function initCountrySelectors() {
  renderCountryList('cfCountryList', 'cfCountrySelect');
  renderCountryList('mCountryList', 'mCountrySelect');
}

function renderCountryList(listId, selectId, filter = '') {
  const list = document.getElementById(listId);
  if (!list) return;
  const filtered = filter ? countries.filter(c => c.name.toLowerCase().includes(filter.toLowerCase()) || c.dial.includes(filter)) : countries;
  list.innerHTML = filtered.map(c => `<div class="country-option" onclick="selectCountry('${selectId}','${c.flag}','${c.dial}')">`
    + `<span class="flag">${c.flag}</span><span>${c.name}</span><span class="code">${c.dial}</span></div>`).join('');
}

function toggleCountryDropdown(selectId) {
  const dd = document.querySelector(`#${selectId} .country-dropdown`);
  document.querySelectorAll('.country-dropdown.open').forEach(d => { if (d !== dd) d.classList.remove('open'); });
  dd.classList.toggle('open');
}

function selectCountry(selectId, flag, dial) {
  const el = document.getElementById(selectId);
  el.querySelector('.flag').textContent = flag;
  el.querySelector('.dial-code').textContent = dial;
  el.querySelector('.country-dropdown').classList.remove('open');
}

function filterCountries(input, dropdownId) {
  const listId = dropdownId.replace('Dropdown', 'CountryList');
  const selectId = dropdownId.replace('Dropdown', 'CountrySelect');
  renderCountryList(listId, selectId, input.value);
}

// Close dropdown on outside click
document.addEventListener('click', e => {
  if (!e.target.closest('.country-select')) {
    document.querySelectorAll('.country-dropdown.open').forEach(d => d.classList.remove('open'));
  }
});

// ===== AUTO-DETECT COUNTRY =====
async function autoDetectCountry() {
  try {
    const res = await fetch('/api/geo-detect');
    const data = await res.json();
    if (data.countryCode) {
      const country = countries.find(c => c.code === data.countryCode);
      if (country) {
        ['cfCountrySelect', 'mCountrySelect'].forEach(id => {
          const el = document.getElementById(id);
          if (el) {
            el.querySelector('.flag').textContent = country.flag;
            el.querySelector('.dial-code').textContent = country.dial;
          }
        });
      }
    }
    // Warn if VPN detected
    if (data.isVPN) {
      console.warn('VPN/Proxy detected. Form submissions may be blocked.');
    }
  } catch (e) { /* silent */ }
}

// ===== FORM LOAD TIMES =====
function setFormLoadTimes() {
  const now = Date.now().toString();
  const cflt = document.getElementById('cfLoadTime');
  const mlt = document.getElementById('mLoadTime');
  if (cflt) cflt.value = now;
  if (mlt) mlt.value = now;
}

// ===== FORM SUBMISSION =====
async function submitForm(e, formId) {
  e.preventDefault();
  const form = document.getElementById(formId);
  const msgEl = document.getElementById(formId === 'modalForm' ? 'mMessage' : 'cfMessage');
  const btnEl = document.getElementById(formId === 'modalForm' ? 'mSubmitBtn' : 'cfSubmitBtn');
  const selectId = formId === 'modalForm' ? 'mCountrySelect' : 'cfCountrySelect';

  const name = form.querySelector('[name="name"]').value.trim();
  const phone = form.querySelector('[name="phone"]').value.trim();
  const email = form.querySelector('[name="email"]').value.trim();
  const honeypot = form.querySelector('[name="honeypot"]').value;
  const formLoadTime = form.querySelector('[name="formLoadTime"]').value;
  const countryCode = document.querySelector(`#${selectId} .dial-code`).textContent;
  const country = countries.find(c => c.dial === countryCode) || countries.find(c => c.code === 'XX');

  // Strict Phone Validation
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  if (country) {
    if (Array.isArray(country.len)) {
      if (cleanPhone.length < country.len[0] || cleanPhone.length > country.len[country.len.length - 1]) {
        return showMsg(msgEl, `Please enter a valid phone number for ${country.name} (${country.len[0]}-${country.len[country.len.length - 1]} digits).`, 'error');
      }
    } else if (cleanPhone.length !== country.len) {
      return showMsg(msgEl, `Please enter a valid ${country.len}-digit phone number for ${country.name}.`, 'error');
    }
    
    // Prefix check for India
    if (country.code === 'IN' && country.pref && !country.pref.includes(parseInt(cleanPhone[0]))) {
      return showMsg(msgEl, 'Indian mobile numbers must start with 6, 7, 8, or 9.', 'error');
    }
  }

  // Client-side validation
  if (!name || name.length < 2) return showMsg(msgEl, 'Please enter your full name.', 'error');
  if (!phone || phone.replace(/[^0-9]/g, '').length < 7) return showMsg(msgEl, 'Please enter a valid phone number.', 'error');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showMsg(msgEl, 'Please enter a valid email.', 'error');

  btnEl.disabled = true;
  btnEl.textContent = 'Submitting...';

  try {
    const urlParams = new URLSearchParams(window.location.search);
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name, phone, email, countryCode, honeypot, formLoadTime,
        referrer: document.referrer || window.location.href,
        utmSource: urlParams.get('utm_source') || '',
        utmMedium: urlParams.get('utm_medium') || '',
        utmCampaign: urlParams.get('utm_campaign') || ''
      })
    });
    const data = await res.json();
    if (data.success) {
      showMsg(msgEl, data.message || 'Thank you! We will contact you shortly.', 'success');
      form.reset();
      setFormLoadTimes();
      setTimeout(() => { window.location.href = 'thankyou.html'; }, 1500);
    } else {
      showMsg(msgEl, data.message || 'Something went wrong.', 'error');
    }
  } catch (err) {
    showMsg(msgEl, 'Network error. Please try again.', 'error');
  }
  btnEl.disabled = false;
  btnEl.textContent = 'Submit Enquiry';
  return false;
}

function showMsg(el, msg, type) {
  el.textContent = msg;
  el.className = 'form-message ' + type;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 5000);
}

// ===== MODAL =====
function openModal() {
  document.getElementById('modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  document.getElementById('mLoadTime').value = Date.now().toString();
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
}

// ===== LIGHTBOX =====
function openLightbox(src) {
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightbox').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('active');
  document.body.style.overflow = '';
}

// ===== SCROLL ANIMATIONS =====
function initScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('visible'); } });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));
}
