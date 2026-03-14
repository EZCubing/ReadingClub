(() => {
  // ===== QR Code =====
  const qrEl = document.getElementById('qrcode');
  if (qrEl && typeof QRCode !== 'undefined') {
    new QRCode(qrEl, {
      text: 'https://jointhereadingclub.com/register.html',
      width: 200,
      height: 200,
      colorDark: '#0e2f44',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // ===== Mobile nav toggle =====
  const toggle = document.getElementById('navToggle');
  const links = document.getElementById('navLinks');

  toggle.addEventListener('click', () => {
    links.classList.toggle('active');
  });

  // Close mobile menu on link click
  links.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      links.classList.remove('active');
    });
  });

  // ===== Clubs tab switching =====
  document.querySelectorAll('.clubs-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.clubs-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.clubs-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('panel-' + tab.dataset.tab).classList.add('active');
    });
  });

  // ===== Nav shadow on scroll =====
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => {
    nav.classList.toggle('nav--scrolled', window.scrollY > 20);
  });

  // ===== Scroll-triggered fade-in animations =====
  const observerOptions = { threshold: 0.15, rootMargin: '0px 0px -40px 0px' };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  const animateSelectors = [
    '.pillar', '.feature', '.brain-card', '.works-card',
    '.level', '.testimonial', '.register-card', '.stat',
    '.callout', '.founder', '.two-col__text', '.assessment-step',
    '.register-qr'
  ];

  animateSelectors.forEach(selector => {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(24px)';
      el.style.transition = `opacity 0.6s ease ${i * 0.08}s, transform 0.6s ease ${i * 0.08}s`;
      observer.observe(el);
    });
  });

  const style = document.createElement('style');
  style.textContent = `.visible { opacity: 1 !important; transform: translateY(0) !important; }`;
  document.head.appendChild(style);
})();
