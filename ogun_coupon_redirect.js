/* OGUN 쿠폰 kakaosync 복귀 폴백 — 전페이지(display_location=ALL) 전용, 극단적 보수 no-op.
 *
 * 배경: kakaosyncLogin 은 returnUrl 인자가 없어 로그인 페이지 복구 JS(returnUrl/snsLogin 복원)로는
 *   쿠폰코드를 되살릴 수 없다. 카카오는 통상 Cafe24 return_url 쿠키로 coupon.html 로 복귀하므로
 *   ogun_coupon_prefill.js 의 스태시 폴백이 처리한다. 이 파일은 그 예외(카카오가 홈 등 다른
 *   페이지로 떨어지는 경우)만을 위한 안전망이다.
 *
 * 동작: (아래 4개 가드를 모두 통과할 때만, 생애 1회)
 *   ① 쿠폰 페이지·로그인 페이지가 아님 (목적지/출발지 제외)
 *   ② 로그인 상태 (ec_mem_level 쿠키 존재 — 비회원·게스트 완전 제외)
 *   ③ 유효한 스태시(ogun_pending_coupon, 30분 이내, 형식검증 통과)
 *   → 스태시를 '먼저 지운 뒤'(루프/재이동 방지) coupon.html?code=<code> 로 location.replace 1회.
 *
 * 안전: 스태시는 로그인 페이지 복구 JS 가 '쿠폰 QR→로그인' 플로우에서만 심는다. 그 플로우를 거치지
 *   않은 일반 고객은 스태시가 없어 즉시 return(장바구니·주문·상품 영향 0). 스태시는 prefill/본 파일이
 *   소비 즉시 삭제하므로 결제 중 재이동 위험 없음. 모든 분기 try/catch.
 */
(function () {
  try {
    var p = location.pathname || '';
    if (p.indexOf('/myshop/coupon/coupon.html') !== -1) return;   // 목적지(프리필이 처리)
    if (p.indexOf('/member/login.html') !== -1) return;           // 출발지(복구 JS가 처리)

    // 로그인 상태 게이트: ec_mem_level 쿠키는 ID/PW·SNS·kakao 로그인 모두에서 설정됨(게스트엔 없음, 실측)
    if (!/(?:^|;\s*)ec_mem_level=/.test(document.cookie || '')) return;

    var code = null;
    try {
      var raw = localStorage.getItem('ogun_pending_coupon');
      if (!raw) return;
      var o = JSON.parse(raw);
      if (!o || !o.code || !o.ts) return;
      if (Date.now() - o.ts > 1800000) { localStorage.removeItem('ogun_pending_coupon'); return; } // 30분 TTL
      if (!/^[0-9A-Za-z._-]{4,64}$/.test(o.code)) return;         // 오염 방어
      code = o.code;
    } catch (e) { return; }

    localStorage.removeItem('ogun_pending_coupon');               // 1회성: 이동 전 먼저 삭제(루프 방지)
    location.replace('/myshop/coupon/coupon.html?code=' + encodeURIComponent(code));
  } catch (e) {}
})();
