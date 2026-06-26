/* OGUN 시리얼쿠폰 원클릭 프리필
 * 쿠폰 인증번호 등록 페이지(/myshop/coupon/coupon.html)에서 URL의 ?code= 값을
 * #coupon_code 입력칸에 자동 입력한다. 자동제출은 하지 않는다(고객이 "쿠폰번호인증" 클릭).
 * 배포: Cafe24 ScriptTags(src) — 쿠폰 등록 페이지 한정. 2026-06-26.
 */
(function () {
  try {
    if (!/\/myshop\/coupon\/coupon\.html/.test(location.pathname)) return;
    var code = new URLSearchParams(location.search).get('code');
    if (!code) return;
    var fill = function () {
      var f = document.getElementById('coupon_code');
      if (f && !f.value) { f.value = code; f.focus(); }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fill);
    } else { fill(); }
    // 스킨 렌더 지연 대비 한 번 더
    setTimeout(fill, 600);
  } catch (e) {}
})();
