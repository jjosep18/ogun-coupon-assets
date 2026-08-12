/* OGUN 시리얼쿠폰 원클릭 (프리필 / 자동제출 듀얼모드) — PC·모바일 겸용
 * 쿠폰 인증번호 등록 페이지(/myshop/coupon/coupon.html) 전용.
 * URL의 ?code= 값을 쿠폰 입력칸(#coupon_code 등)에 자동 입력한다.
 *  - 기본: 프리필만(고객이 "쿠폰번호인증" 클릭)
 *  - ?code=...&auto=1: 입력 + 자동 제출(coupon_code_submit)
 * 배포: Cafe24 ScriptTags(src=jsDelivr).
 * 2026-08-12 개정: 모바일(m.ogun.co.kr)에서도 동작하도록 다중 셀렉터 +
 *   MutationObserver(동적 렌더 대비) + 재시도. PC 동작·sessionStorage 가드 보존.
 * 2026-08-12 매핑 치환: 구코드→신코드 암호화 매핑(coupon_map.json, 동일 커밋)을
 *   WebCrypto로 복호해 신코드를 채운다. 평문 매핑은 배포물에 없음(구코드 없으면 추출 불가).
 *   URL ?code=구코드 및 수동 입력 모두 인증 전 치환. 매핑 미스/오류 시 기존 동작(그대로).
 * 2026-08-12 이중쿠폰(v2): coupon_map.json 항목이 {m:{iv,ct}, w:{iv,ct}} 2벌.
 *   기기 판별 = 페이지 호스트: m.ogun.co.kr → M쿠폰(모바일 사용가능),
 *   ogun.co.kr/www → W쿠폰(PC 사용가능). 같은 실물 QR/구코드가 기기 불문 동작.
 *   v1(단일 {iv,ct}) 문서도 하위호환 처리.
 * 2026-08-12 겸용 파일럿(v3, 하이브리드): 3만원 구코드 10개는 Founder가 UI로 만든
 *   겸용(available_site="W,M") 단일쿠폰으로 매핑 → coupon_map.json 항목이 단일슬롯 {iv,ct}
 *   (기기 불문 동일 신코드). 나머지 코드는 아직 이중슬롯 {m,w}. 프리필 규칙은 그대로:
 *   pickSlot 이 최상위 iv/ct 있으면 단일(하이브리드), 없으면 호스트 기반 M/W 분기.
 *   로직 변경 없음(v2 pickSlot 이 v1/v3 단일 슬롯을 이미 처리). 문서용 마커.
 */
(function () {
  try {
    // 경로 가드: PC(ogun.co.kr)·모바일(m.ogun.co.kr) 모두 pathname 은 동일하게
    // '/myshop/coupon/coupon.html'(실측 2026-08-12). 방어적으로 substring 매칭.
    if (location.pathname.indexOf('/myshop/coupon/coupon.html') === -1) return;

    // 자신의 src 기준 base URL — coupon_map.json 을 동일 커밋에서 가져오기 위함.
    var MAP_URL = (function () {
      try {
        var s = document.currentScript && document.currentScript.src;
        if (!s) {
          var els = document.getElementsByTagName('script');
          for (var i = 0; i < els.length; i++) {
            if (els[i].src && els[i].src.indexOf('ogun-coupon-assets') !== -1 &&
                els[i].src.indexOf('ogun_coupon_prefill.js') !== -1) { s = els[i].src; break; }
          }
        }
        if (s) return s.replace(/ogun_coupon_prefill\.js(\?.*)?$/, 'coupon_map.json');
      } catch (e) {}
      return null;
    })();

    var params = new URLSearchParams(location.search);
    var code = params.get('code');
    var auto = params.get('auto') === '1';

    // ---- 암호화 매핑 (WebCrypto) : norm(old) → 신코드 ----
    var subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;
    var _mapPromise = null;
    function loadMap() {
      if (_mapPromise) return _mapPromise;
      _mapPromise = (MAP_URL && typeof fetch === 'function')
        ? fetch(MAP_URL, { cache: 'force-cache' }).then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; })
        : Promise.resolve(null);
      return _mapPromise;
    }
    function norm(c) { return (c || '').toUpperCase().replace(/[^0-9A-Z]/g, ''); }
    var _enc = new TextEncoder();
    function b64(s) {
      var bin = atob(s), a = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return a;
    }
    function toHex(buf) {
      var v = new Uint8Array(buf), h = '';
      for (var i = 0; i < v.length; i++) h += ('0' + v[i].toString(16)).slice(-2);
      return h;
    }
    function sha256(str) { return subtle.digest('SHA-256', _enc.encode(str)); }
    // 기기 판별: 모바일몰(m.ogun.co.kr) → 'm', 그 외(PC ogun.co.kr/www) → 'w'.
    function pickMode() {
      var h = (location.hostname || '').toLowerCase();
      return h.indexOf('m.') === 0 ? 'm' : 'w';
    }
    // 항목에서 현재 기기용 슬롯 선택. v2={m:{iv,ct},w:{iv,ct}} / v1={iv,ct}(하위호환).
    function pickSlot(e) {
      if (!e) return null;
      if (e.iv && e.ct) return e;               // v1 단일
      var slot = e[pickMode()];
      return (slot && slot.iv && slot.ct) ? slot : null;
    }
    // 구코드 → 신코드(매핑 히트 시) / null(미스·오류). 구코드를 알아야만 복호 가능.
    function resolve(raw) {
      var old = norm(raw);
      if (!old || !subtle) return Promise.resolve(null);
      return loadMap().then(function (doc) {
        if (!doc || !doc.map) return null;
        return sha256(doc.idx_prefix + old).then(function (h) {
          var slot = pickSlot(doc.map[toHex(h)]);
          if (!slot) return null;
          return sha256(doc.key_prefix + old).then(function (kb) {
            return subtle.importKey('raw', kb, { name: 'AES-GCM' }, false, ['decrypt'])
              .then(function (key) {
                return subtle.decrypt({ name: 'AES-GCM', iv: b64(slot.iv) }, key, b64(slot.ct));
              })
              .then(function (pt) { return new TextDecoder().decode(pt); })
              .catch(function () { return null; });
          });
        });
      }).catch(function () { return null; });
    }

    // 안내 문구 1줄 (치환되었을 때만, 1회)
    var noticeShown = false;
    function showNotice(field) {
      if (noticeShown) return;
      noticeShown = true;
      try {
        var n = document.createElement('div');
        n.setAttribute('data-ogun-coupon-notice', '1');
        n.textContent = '쿠폰이 새 번호로 자동 변환되었습니다';
        n.style.cssText = 'margin:6px 0;color:#c0392b;font-size:13px;line-height:1.4;';
        var host = field && field.parentNode ? field.parentNode : document.body;
        host.insertBefore(n, field && field.nextSibling ? field.nextSibling : null);
      } catch (e) {}
    }

    // 쿠폰 입력칸 후보 셀렉터(스킨 변형 대비). PC/모바일 실측은 #coupon_code.
    function findField() {
      var byId = document.getElementById('coupon_code');
      if (byId) return byId;
      var sels = ['input#coupon_code', 'input[name="coupon_code"]',
                  'input[name="coupon_no"]', 'input[name="serial_no"]'];
      for (var i = 0; i < sels.length; i++) {
        var el = document.querySelector(sels[i]);
        if (el) return el;
      }
      return null;
    }

    var done = false;      // URL ?code 프리필 완료
    var submitted = false;

    // URL ?code= 프리필: 매핑 히트면 신코드로 치환해 채운다.
    function fill() {
      if (done) return true;
      var f = findField();
      if (!f) return false;
      done = true;
      resolve(code).then(function (mapped) {
        var val = mapped || code;
        if (!f.value) { f.value = val; try { f.focus(); } catch (e) {} }
        if (mapped) { f.__ogunResolved = mapped; showNotice(f); }
        if (auto && !submitted && !alreadyAuto) {
          submitted = true;
          try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
          setTimeout(doSubmit, 500);
        }
      });
      return true;
    }

    function doSubmit() {
      if (typeof window.coupon_code_submit === 'function') { window.coupon_code_submit(); return; }
      var btns = document.querySelectorAll('a,button,input[type=button],input[type=submit]');
      for (var i = 0; i < btns.length; i++) {
        var t = (btns[i].innerText || btns[i].value || '').trim();
        if (t === '쿠폰번호인증') { btns[i].click(); return; }
      }
    }

    // 자동제출은 코드별 1회만 (재제출 무한루프 방지).
    var KEY = 'ogun_coupon_autosubmit_' + (code || '');
    var alreadyAuto = false;
    try { alreadyAuto = !!sessionStorage.getItem(KEY); } catch (e) {}

    // ---- 수동 입력 대응: 타이핑/붙여넣기된 구코드를 인증 클릭 전에 치환 ----
    function attachManual(f) {
      if (!f || f.__ogunManual) return;
      f.__ogunManual = true;
      var t = null;
      function tryConvert() {
        var v = f.value;
        if (!v || v === f.__ogunResolved) return;
        resolve(v).then(function (mapped) {
          if (mapped && f.value !== mapped) { f.value = mapped; f.__ogunResolved = mapped; showNotice(f); }
        });
      }
      f.addEventListener('input', function () { clearTimeout(t); t = setTimeout(tryConvert, 250); });
      f.addEventListener('blur', tryConvert);
    }

    // 인증 트리거 안전망: coupon_code_submit 호출 직전 미치환 구코드를 치환 후 제출.
    function patchSubmit() {
      if (window.__ogunPatchedSubmit) return;
      window.__ogunPatchedSubmit = true;
      var orig = window.coupon_code_submit;
      window.coupon_code_submit = function () {
        var f = findField();
        var args = arguments, self = this;
        if (f && f.value && f.value !== f.__ogunResolved) {
          resolve(f.value).then(function (mapped) {
            if (mapped) { f.value = mapped; f.__ogunResolved = mapped; showNotice(f); }
            if (typeof orig === 'function') orig.apply(self, args);
          });
          return; // 치환 완료 후 원함수 호출로 지연
        }
        if (typeof orig === 'function') return orig.apply(self, args);
      };
    }

    function start() {
      patchSubmit();
      var f0 = findField();
      if (f0) attachManual(f0);
      if (code && fill()) { /* URL 프리필 진행 */ }
      // 재시도(폴링) + 동적 렌더 대비(MutationObserver)
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        var f = findField();
        if (f) attachManual(f);
        if ((code ? fill() : !!f) || tries > 20) clearInterval(iv);
      }, 300);
      try {
        if (typeof MutationObserver === 'function') {
          var obs = new MutationObserver(function () {
            var f = findField();
            if (f) attachManual(f);
            if (!code || done) { /* keep observing manual field only briefly */ }
            if (code && fill()) { obs.disconnect(); clearInterval(iv); }
          });
          obs.observe(document.documentElement || document.body, { childList: true, subtree: true });
          setTimeout(function () { try { obs.disconnect(); } catch (e) {} }, 8000);
        }
      } catch (e) {}
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  } catch (e) {}
})();
