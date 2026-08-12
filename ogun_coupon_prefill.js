/* OGUN 시리얼쿠폰 원클릭 (프리필 / 자동제출 듀얼모드) — PC·모바일 겸용
 * 쿠폰 인증번호 등록 페이지(/myshop/coupon/coupon.html) 전용.
 * URL의 ?code= 값을 쿠폰 입력칸(#coupon_code 등)에 자동 입력한다.
 *  - 기본: 프리필만(고객이 "쿠폰번호인증" 클릭)
 *  - ?code=...&auto=1: 입력 + 자동 제출(coupon_code_submit)
 * 배포: Cafe24 ScriptTags(src=jsDelivr).
 * 2026-08-12 개정: 모바일(m.ogun.co.kr)에서도 동작하도록 다중 셀렉터 +
 *   MutationObserver(동적 렌더 대비) + 재시도. PC 동작·sessionStorage 가드 보존.
 */
(function () {
  try {
    // 경로 가드: PC(ogun.co.kr)·모바일(m.ogun.co.kr) 모두 pathname 은 동일하게
    // '/myshop/coupon/coupon.html'(실측 2026-08-12). 방어적으로 substring 매칭.
    if (location.pathname.indexOf('/myshop/coupon/coupon.html') === -1) return;
    var params = new URLSearchParams(location.search);
    var code = params.get('code');
    if (!code) return;
    var auto = params.get('auto') === '1';

    // 자동제출은 코드별 1회만. coupon_code_submit()이 새로고침을 일으켜도
    // sessionStorage 플래그로 재제출(=>"이미 사용한 쿠폰" 팝업 무한루프)을 막는다.
    var KEY = 'ogun_coupon_autosubmit_' + code;
    var alreadyAuto = false;
    try { alreadyAuto = !!sessionStorage.getItem(KEY); } catch (e) {}

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

    var done = false;      // 프리필 완료
    var submitted = false;

    function fill() {
      if (done) return true;
      var f = findField();
      if (!f) return false;
      if (!f.value) { f.value = code; try { f.focus(); } catch (e) {} }
      done = true;
      if (auto && !submitted && !alreadyAuto) {
        submitted = true;
        try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
        setTimeout(function () {
          if (typeof window.coupon_code_submit === 'function') { window.coupon_code_submit(); return; }
          var btns = document.querySelectorAll('a,button,input[type=button],input[type=submit]');
          for (var i = 0; i < btns.length; i++) {
            var t = (btns[i].innerText || btns[i].value || '').trim();
            if (t === '쿠폰번호인증') { btns[i].click(); return; }
          }
        }, 500);
      }
      return true;
    }

    function start() {
      if (fill()) return;
      // 1) 폴링 재시도(300ms x 20 ≈ 6s)
      var tries = 0;
      var iv = setInterval(function () {
        tries++;
        if (fill() || tries > 20) clearInterval(iv);
      }, 300);
      // 2) 동적 렌더 대비 MutationObserver(입력칸이 나중에 붙는 스킨 대응)
      try {
        if (typeof MutationObserver === 'function') {
          var obs = new MutationObserver(function () {
            if (fill()) { obs.disconnect(); clearInterval(iv); }
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
