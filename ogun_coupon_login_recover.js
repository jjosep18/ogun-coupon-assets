/* OGUN 쿠폰 QR 로그인 복구 — /member/login.html 전용 (Cafe24 ScriptTag display_location=MEMBER_LOGIN)
 *
 * 배경(회귀): 실물 QR(ogun.co.kr/myshop/coupon/coupon.html?code=XXX)을 비로그인으로 열면
 *   Cafe24 '회원전용' 가드(문서 최상단 서버주입 inline <script> location.replace)가
 *   /member/login.html?returnUrl=... 로 보내면서 returnUrl 에서 ?code= 를 떼어버린다.
 *   (8/12 실측 땐 code 보존 → 11/18 실측 땐 소실. Cafe24측 네이티브 동작 변경.)
 *   그 결과 로그인 후 쿠폰 페이지로 돌아가도 ?code= 가 없어 프리필할 값이 사라진다.
 *
 * 핵심: 가드는 returnUrl 에선 code 를 떼지만 document.referrer 에는 원본 URL(?code= 포함)이 남는다.
 *   (location.replace 이동이라 same-origin referrer 에 path+query 가 보존됨 — 2026-11-19 실측.)
 *   → 로그인 페이지에서 referrer 의 code 를 되살려:
 *     (1) 일반(ID/PW) 로그인 returnUrl 히든필드를 /myshop/coupon/coupon.html?code=XXX 로 복원
 *     (2) SNS(naver/facebook/googleplus) 로그인 returnUrl 인자를 code 포함으로 복원
 *     (3) localStorage 에 스태시(시각 포함, 30분 유효) — kakaosync 보완 경로.
 *   로그인 후 쿠폰 페이지는 ?code= 를 다시 받으므로 기존 프리필 스크립트(원코드→신코드 매핑 포함)가
 *   그대로 동작한다. 이 파일은 쿠폰 프리필 파일을 전혀 건드리지 않는다.
 *
 * 안전: referrer 에 유효 형식 code 가 없으면 '완전 no-op'(일반 로그인/주문/회원가입 영향 0).
 * kakaosync: returnUrl 인자가 없어 (1)(2)로 복구 불가. 대신 (3) 스태시를 두 보완 스크립트가 소비한다 —
 *   ① ogun_coupon_prefill.js(쿠폰 페이지): ?code 없고 유효 스태시면 스태시로 프리필(카카오가 returnUrl
 *      쿠키로 coupon.html 로 복귀하는 통상 경로). ② ogun_coupon_redirect.js(ALL, 폴백): 로그인 상태
 *      (ec_mem_level 쿠키)+유효 스태시+쿠폰/로그인 페이지 아님이면 스태시 1회 소비 후 coupon.html?code 로
 *      이동(카카오가 홈으로 떨어지는 예외 경로). 스태시 포맷: {"code","ts"} (JSON, 30분 TTL).
 */
(function () {
  try {
    if (location.pathname.indexOf('/member/login.html') === -1) return;

    // 1) referrer 에서 code 추출 (가드가 returnUrl 에선 떼지만 referrer 엔 남김)
    var code = null;
    try {
      var mr = (document.referrer || '').match(/[?&]code=([^&#]+)/);
      if (mr) code = decodeURIComponent(mr[1]);
    } catch (e) {}
    // 2) 혹시 returnUrl 에 이미 code 가 있으면(정상 복귀) 그대로 사용 — 중복복구 방지
    if (!code) {
      try {
        var rp = new URLSearchParams(location.search).get('returnUrl') || '';
        var mp = rp.match(/code=([^&]+)/);
        if (mp) code = decodeURIComponent(mp[1]);
      } catch (e) {}
    }
    if (!code) return;                                   // ← no-op 가드

    // 안전: 예상 시리얼 형식만 복구(오염된 referrer 로 엉뚱한 리다이렉트 방지)
    if (!/^[0-9A-Za-z._-]{4,64}$/.test(code)) return;

    // (3) 스태시: 시각 포함 30분 유효. 두 보완 스크립트(prefill/redirect)가 kakaosync 복귀 시 소비.
    try { localStorage.setItem('ogun_pending_coupon', JSON.stringify({ code: code, ts: Date.now() })); } catch (e) {}

    var want = '/myshop/coupon/coupon.html?code=' + encodeURIComponent(code);
    var wantEnc = encodeURIComponent(want);              // snsLogin 인자는 encodeURIComponent 된 경로

    // (1) 일반 로그인: returnUrl 히든필드 복원 (code 없을 때만 덮어씀)
    function fixField() {
      var fs = document.querySelectorAll('input[name=returnUrl]');
      for (var i = 0; i < fs.length; i++) {
        if (String(fs[i].value || '').indexOf('code=') === -1) fs[i].value = want;
      }
    }

    // (2) SNS 로그인: MemberAction.snsLogin(provider, returnUrl) 의 returnUrl 인자 복원
    function wrapSns() {
      try {
        var MA = window.MemberAction;
        if (MA && typeof MA.snsLogin === 'function' && !MA.__ogunSnsWrap) {
          var orig = MA.snsLogin;
          MA.snsLogin = function (provider, ret) {
            try { if (!ret || String(ret).indexOf('code') === -1) ret = wantEnc; } catch (e) {}
            return orig.call(this, provider, ret);
          };
          MA.__ogunSnsWrap = true;
        }
      } catch (e) {}
    }

    fixField(); wrapSns();
    document.addEventListener('DOMContentLoaded', function () { fixField(); wrapSns(); });
    var n = 0;
    var iv = setInterval(function () { fixField(); wrapSns(); if (++n > 50) clearInterval(iv); }, 120);
  } catch (e) {}
})();
