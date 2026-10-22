// Masaya landing: OS-aware download button, ES/EN toggle and the phone menu.
// The page is complete without it: Spanish is the HTML, every link and <details> works natively.
(function () {
  var root = document.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  // ---------- strings ----------
  // Spanish comes from the HTML itself; only the strings JavaScript swaps in need a Spanish entry.
  var ES = {
    'dl.mac': 'Descargar para macOS',
    'dl.win': 'Descargar para Windows',
    'dl.linux': 'Descargar para Linux',
  };
  var EN = {
    'meta.title': 'Masaya: see and control your Android from macOS, Windows and Linux',
    'nav.skip': 'Skip to content',
    'nav.label': 'Main',
    'nav.lang': 'Language',
    'nav.menu': 'Menu',
    'nav.features': 'Features',
    'nav.help': 'Help',
    'nav.download': 'Download',

    'hero.status': '<b>Galaxy S23 Ultra</b> connected over USB',
    'hero.title': 'Your Android, on the big screen.',
    'hero.lead': 'Control your phone with mouse and keyboard from macOS, Windows or Linux.',
    'dl.mac': 'Download for macOS',
    'dl.win': 'Download for Windows',
    'dl.linux': 'Download for Linux',
    'hero.downloads': 'See downloads',
    'hero.code': 'Code on GitHub',
    'hero.note': 'For Android. <span>iOS coming soon.</span>',
    'hero.winLabel': 'Masaya window mirroring a Galaxy S23 Ultra with the Despertá app open',
    'call.quality': 'Quality',
    'call.qualityV': '1920 px at 16 Mbps',
    'call.codec': 'Codec',
    'call.codecV': 'H.264 or H.265',
    'call.conn': 'Connection',
    'call.connV': 'USB, or Wi-Fi with a QR code',
    'call.shot': 'Screenshot',
    'call.rec': 'Record or stop',
    'call.back': '“Back” on the phone',
    'call.backV': 'right-click',
    'call.apk': 'Install an APK',
    'call.apkV': 'drop the .apk in',
    'chip.shot': '⌘⇧4 screenshot',
    'chip.rec': '⌘⇧5 record',

    'perk.accounts': 'No accounts',
    'perk.accountsV': 'No sign-up, no email',
    'perk.ads': 'No ads',
    'perk.adsV': 'No paid plans',
    'perk.local': 'No cloud',
    'perk.localV': 'No analytics, no telemetry',
    'perk.os': 'Cross-platform',
    'perk.osV': 'macOS, Windows and Linux',

    'feat.title': 'Built for testing apps on a real phone',
    'feat.sub':
      'See the screen, control it and keep a record of what happens. No app to install on the phone.',
    'feat.windows': 'One window per device',
    'feat.windowsV': 'Open several phones at once, each with its own toolbar and navigation.',
    'feat.qr': 'Wi-Fi with a QR code',
    'feat.qrV': 'No cable, no IP addresses: scan the code from Wireless debugging.',
    'ui.shot': 'screenshot',
    'ui.rec': 'record',
    'feat.capture': 'Screenshots and recording',
    'feat.captureV':
      'From the toolbar or with shortcuts. Record video or a GIF, and choose whether each screenshot is previewed, copied or saved.',
    'spec.control': 'Full control',
    'spec.controlV': 'Taps, multitouch, dragging, scroll wheel and a keyboard that types accents.',
    'spec.apk': 'Install APKs',
    'spec.apkV': 'Drag the file onto the window.',
    'spec.quality': 'Adjustable quality',
    'spec.qualityV': 'Presets, resolution, bit rate and codec.',
    'spec.theme': 'Light and dark',
    'spec.themeV': 'Follows your system theme. In Spanish and English.',
    'spec.private': 'Private',
    'spec.privateV': 'What you see and type stays between your computer and your phone.',

    'start.title': 'Up and running in three steps',
    'start.s1': 'Install',
    'start.s1V':
      'Download the installer for your system. It isn’t signed yet, so the first time macOS and Windows ask you to confirm.',
    'start.s2': 'Turn on USB debugging',
    'start.s2V':
      'On the phone: Developer options → USB debugging. If adb is missing, the app offers to download it.',
    'start.s3': 'Connect and open',
    'start.s3V':
      'With a cable, or over Wi-Fi by scanning a QR code. Double-click the device to open its window.',
    'term.title': 'terminal — example',
    'term.comment': '# Masaya sees them too:',
    'term.mirroring': 'mirroring',
    'req.phone': 'An Android phone',
    'req.phoneV': 'With Developer options and USB debugging turned on.',
    'req.adbV': 'If you don’t have it, the app offers to download it or lets you pick your own.',
    'req.os': 'macOS, Windows or Linux',
    'req.osV': 'Apple Silicon and Intel on Mac, x64 on Windows, x64 and arm64 on Linux.',
    'soon.tag': 'Coming soon',
    'soon.text':
      '<b>iPhone and iPad.</b> iOS support is on the way. For now, Masaya works with Android.',

    'inst.title': 'The first time you open it',
    'inst.sub': 'The installers aren’t signed yet, so your system asks you to confirm once.',
    'inst.mac1': 'Open the <b>.dmg</b> and drag Masaya to Applications.',
    'inst.mac2': 'The first time, <b>right-click → Open</b> on the app.',
    'inst.mac3': 'Confirm with <b>Open</b>. After that it opens without asking.',
    'inst.macDlg': 'Open “Masaya”?',
    'inst.macDlgV': 'macOS cannot verify the developer.',
    'inst.cancel': 'Cancel',
    'inst.open': 'Open',
    'inst.win1': 'Run the <b>.exe</b> installer.',
    'inst.win2': 'If “Windows protected your PC” appears, click <b>More info</b>.',
    'inst.win3': 'Click <b>Run anyway</b>.',
    'inst.winDlg': 'Windows protected your PC',
    'inst.winDlgV': 'Unknown publisher.',
    'inst.runAnyway': 'Run anyway',
    'inst.dontRun': 'Don’t run',

    'keys.title': 'Keep your hands on the keyboard',
    'keys.refresh': 'Refresh device list',
    'keys.shot': 'Screenshot',
    'keys.rec': 'Record or stop',
    'keys.wifi': 'Connect over Wi-Fi',
    'keys.settings': 'Settings',
    'keys.back': '“Back” on the phone',
    'keys.rightClick': 'Right-click',
    'keys.note': 'On Windows and Linux, ⌘ is Ctrl and ⇧ is Shift.',

    'vs.title': 'What Vysor charges for is included here',
    'vs.label': 'Comparison with Vysor',
    'vs.feature': 'Feature',
    'vs.free': 'Vysor free',
    'vs.wifiUs': 'Included',
    'vs.wifiThem': 'Pro only',
    'vs.quality': 'Quality',
    'vs.qualityUs': 'Adjustable, up to 2560 px',
    'vs.qualityThem': 'Limited; HD in Pro',
    'vs.ads': 'Ads',
    'vs.adsUs': 'None',
    'vs.adsThem': 'Yes; Pro removes them',
    'vs.plans': 'Plans',
    'vs.plansUs': 'No locked features',
    'vs.plansThem': 'Paid Pro plan',

    'faq.title': 'Frequently asked questions',
    'faq.q1': 'The app says “adb not found”',
    'faq.a1':
      'Click “Download platform-tools” and install it, or pick the adb you already have with “Choose adb…”. Then click “Try again”.',
    'faq.q2': 'My phone shows up as “Unauthorized”',
    'faq.a2':
      'Unlock the phone and accept the “Allow USB debugging?” prompt. Tick “Always allow from this computer” so it doesn’t ask again.',
    'faq.q3': 'Does it work with iPhone?',
    'faq.a3':
      'Not yet. Support for iPhone and iPad (iOS) is on the way. For now, Masaya works with Android phones and tablets.',
    'faq.q4': 'Do I need a cable?',
    'faq.a4':
      'No. You can pair over Wi-Fi by scanning a QR code. The phone and the computer must be on the same network.',
    'faq.q5': 'Does it send my data to the internet?',
    'faq.a5':
      'No. Your screen, your screenshots and what you type stay between your computer and your phone. The app only goes online to check GitHub for a new version, and that check carries none of your data.',

    'foot.label': 'Footer',
    'foot.guide': 'Guide',
    'foot.privacy': 'Privacy',
  };

  var textNodes = document.querySelectorAll('[data-i18n]');
  var labelNodes = document.querySelectorAll('[data-i18n-label]');
  // Snapshot the Spanish HTML once, so switching back needs no reload.
  textNodes.forEach(function (el) {
    var key = el.getAttribute('data-i18n');
    if (!(key in ES)) ES[key] = el.innerHTML;
  });
  labelNodes.forEach(function (el) {
    var key = el.getAttribute('data-i18n-label');
    if (!(key in ES)) ES[key] = el.getAttribute('aria-label');
  });

  var current = 'es';
  function apply(lang) {
    current = lang === 'en' ? 'en' : 'es';
    var dict = current === 'en' ? EN : ES;
    var pick = function (key) {
      return key in dict ? dict[key] : ES[key];
    };
    textNodes.forEach(function (el) {
      var html = pick(el.getAttribute('data-i18n'));
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    labelNodes.forEach(function (el) {
      el.setAttribute('aria-label', pick(el.getAttribute('data-i18n-label')));
    });
    root.lang = current;
    document.querySelectorAll('.d-lang button').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === current));
    });
  }

  function stored() {
    try {
      return localStorage.getItem('masaya-lang');
    } catch (e) {
      return null;
    }
  }
  function store(lang) {
    try {
      localStorage.setItem('masaya-lang', lang);
    } catch (e) {
      /* private mode or blocked storage: the choice just won't persist */
    }
  }

  // ---------- download button for the visitor's OS ----------
  // The HTML says macOS; Windows and Linux visitors get their own label.
  var ua = navigator.userAgent;
  var os = /Windows/.test(ua) ? 'win' : /Linux|CrOS/.test(ua) && !/Android/.test(ua) ? 'linux' : '';
  if (os) {
    document.querySelectorAll('[data-dl]').forEach(function (a) {
      a.querySelector('[data-i18n]').setAttribute('data-i18n', 'dl.' + os);
    });
    // The secondary buttons offer the other two systems.
    document.querySelectorAll('.d-dl [data-os]').forEach(function (a) {
      a.hidden = a.getAttribute('data-os') === os;
    });
  }

  var param = /[?&]lang=(en|es)\b/.exec(location.search);
  apply(param ? param[1] : stored() || 'es');

  document.querySelectorAll('.d-lang button').forEach(function (b) {
    b.addEventListener('click', function () {
      var lang = b.getAttribute('data-lang');
      apply(lang);
      store(lang);
    });
  });

  // ---------- phone menu (<details>): close it after picking a link, on Escape or outside ----------
  var menu = document.querySelector('.d-menu');
  if (menu) {
    var close = function () {
      menu.open = false;
    };
    menu.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', close);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && menu.open) {
        close();
        menu.querySelector('summary').focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (menu.open && !menu.contains(e.target)) close();
    });
  }
})();
