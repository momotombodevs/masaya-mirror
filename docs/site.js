// Tabs, scroll-spy for the docs sidebar and copy buttons. The page works without it.
(function () {
  // Show the visitor's OS on the main download buttons; the ghost button of that OS becomes macOS.
  var ua = navigator.userAgent;
  var os = /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) && !/Android/.test(ua) ? 'Linux' : '';
  if (os) {
    var icon = os === 'Windows' ? '#i-win' : null;
    document.querySelectorAll('[data-dl]').forEach(function (a) {
      a.lastChild.textContent = 'Descargar para ' + os;
      var svg = a.querySelector('svg');
      if (icon) svg.firstElementChild.setAttribute('href', icon);
      else svg.style.display = 'none';
    });
    document.querySelectorAll('.cta .btn-ghost').forEach(function (a) {
      if (a.textContent.trim() !== os) return;
      a.lastChild.textContent = 'macOS';
      var svg = a.querySelector('svg');
      if (svg) svg.firstElementChild.setAttribute('href', '#i-apple');
    });
  }

  var tabs = document.querySelectorAll('.tab');
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () {
      select(tab);
    });
    tab.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (d) {
        e.preventDefault();
        select(tabs[(i + d + tabs.length) % tabs.length]);
      }
    });
  });

  var links = document.querySelectorAll('.side a[href^="#"]');
  var map = {};
  links.forEach(function (a) {
    map[a.getAttribute('href').slice(1)] = a;
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && map[en.target.id]) {
            links.forEach(function (a) {
              a.classList.remove('on');
            });
            map[en.target.id].classList.add('on');
          }
        });
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );
    document.querySelectorAll('section.doc').forEach(function (s) {
      io.observe(s);
    });
  }

  document.querySelectorAll('.copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.parentNode.querySelector('pre').innerText;
      var done = function () {
        btn.textContent = 'Copiado';
        setTimeout(function () {
          btn.textContent = 'Copiar';
        }, 1600);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () {});
    });
  });
})();
