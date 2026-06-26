/* OGUN 시리얼쿠폰 원클릭 (프리필 / 자동제출 듀얼모드)
 * 쿠폰 인증번호 등록 페이지(/myshop/coupon/coupon.html) 전용.
 * URL의 ?code= 값을 #coupon_code 입력칸에 자동 입력한다.
 *  - 기본: 프리필만(고객이 "쿠폰번호인증" 클릭)
 *  - ?code=...&auto=1: 입력 + 자동 제출(coupon_code_submit)
 * 배포: Cafe24 ScriptTags(src=jsDelivr). 2026-06-26.
 */
(function () {
  try {
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
    var submitted = false;
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      var f = document.getElementById('coupon_code');
      if (f) {
        if (!f.value) { f.value = code; f.focus(); }
        clearInterval(iv);
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
      } else if (tries > 20) { clearInterval(iv); }
    }, 300);
  } catch (e) {}
})();
