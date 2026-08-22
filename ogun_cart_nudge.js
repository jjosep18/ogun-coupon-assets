/* OGUN 장바구니 무료배송 문턱 안내 — Shadow DOM 격리 / PC·모바일 겸용
 * 장바구니(/order/basket.html)·주문서(/order/orderform.html)에서 "총 상품금액"을 읽어
 * 50,000원까지 남은 금액을 안내한다. 상품금액 ≥ 50,000이면 미표시(무료배송 달성).
 *
 * 실측 근거(2026-08-22, ogun.co.kr·m.ogun.co.kr 게스트 카트):
 *   총 상품금액(배송비 제외) = span.total_product_price_display_front  (PC·MO 동일)
 *   무료배송 문턱 = 상품금액 기준 50,000원 (배송비는 미달 시 조건부 부과)
 * 배포: Cafe24 ScriptTags(src=jsDelivr). display_location=ORDER_BASKET / ORDER_ORDERFORM.
 * 격리: Shadow DOM(closed) — 스킨 CSS 상호오염 없음. 자체 태그 외 DOM 변형 없음.
 */
(function () {
  try {
    var PATHS = ['/order/basket.html', '/order/orderform.html'];
    var onTarget = false;
    for (var i = 0; i < PATHS.length; i++) {
      if (location.pathname.indexOf(PATHS[i]) !== -1) { onTarget = true; break; }
    }
    if (!onTarget) return;

    var THRESHOLD = 50000;         // 무료배송 문턱(상품금액 기준)
    var HOST_ID = 'ogun-freeship-nudge';

    function parseAmount(text) {
      if (!text) return null;
      var digits = String(text).replace(/[^0-9]/g, '');
      if (!digits) return null;
      var n = parseInt(digits, 10);
      return isNaN(n) ? null : n;
    }

    // 총 상품금액(배송비 제외) 읽기. 실측 클래스 우선 → 라벨 기반 폴백.
    function readSubtotal() {
      if (typeof document === 'undefined' || !document || !document.querySelector) return null;
      var el = document.querySelector('.total_product_price_display_front');
      if (el) {
        var v = parseAmount(el.textContent);
        if (v !== null) return v;
      }
      // 폴백: '총 상품금액' 라벨을 가진 노드의 형제/부모 영역에서 마지막 금액.
      var labels = document.querySelectorAll('*');
      for (var i = 0; i < labels.length; i++) {
        var node = labels[i];
        if (node.children.length === 0) {
          var t = (node.textContent || '').trim();
          if (t === '총 상품금액' || t === '상품금액' || t === '총상품금액') {
            var box = node.closest ? (node.closest('li,tr,dl,div') || node.parentElement) : node.parentElement;
            if (box) {
              var m = (box.innerText || box.textContent || '').match(/[\d,]+\s*원/g);
              if (m && m.length) return parseAmount(m[m.length - 1]);
            }
          }
        }
      }
      return null;
    }

    function fmt(n) { return n.toLocaleString('ko-KR'); }

    function ensureHost() {
      var host = document.getElementById(HOST_ID);
      if (host) return host;
      host = document.createElement('div');
      host.id = HOST_ID;
      host.setAttribute('data-ogun-freeship', '1');
      // 결제예정금액(정산) 박스 바로 위에 삽입 → 고객이 총액 볼 때 함께 노출.
      var anchor = document.querySelector('.xans-order-totalorder');
      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(host, anchor);
      } else {
        document.body.appendChild(host);
      }
      host.attachShadow({ mode: 'open' }).innerHTML =
        '<style>' +
        ':host{all:initial}' +
        '.wrap{font-family:"Apple SD Gothic Neo","Malgun Gothic",sans-serif;' +
        'margin:12px 0;padding:13px 16px;border-radius:10px;' +
        'background:linear-gradient(135deg,#fff6ee,#ffe9d6);border:1px solid #f0c9a0;' +
        'color:#8a4b17;font-size:14px;line-height:1.5;text-align:center;box-sizing:border-box}' +
        '.wrap b{color:#e5751a;font-weight:700}' +
        '.bar{margin-top:9px;height:7px;border-radius:99px;background:#f3ddc7;overflow:hidden}' +
        '.fill{height:100%;border-radius:99px;background:linear-gradient(90deg,#ffab52,#e5751a);transition:width .35s}' +
        '</style>' +
        '<div class="wrap" role="status" aria-live="polite"><span class="msg"></span>' +
        '<div class="bar"><div class="fill"></div></div></div>';
      return host;
    }

    function render() {
      var subtotal = readSubtotal();
      var host = document.getElementById(HOST_ID);
      if (subtotal === null) { if (host) host.style.display = 'none'; return; }
      host = ensureHost();
      host.style.display = '';
      var root = host.shadowRoot;
      if (!root) return;
      var wrap = root.querySelector('.wrap');
      var msg = root.querySelector('.msg');
      var fill = root.querySelector('.fill');
      if (subtotal >= THRESHOLD) {
        // 스펙: 문턱(5만) 이상이면 미표시.
        host.style.display = 'none';
        return;
      } else {
        var remain = THRESHOLD - subtotal;
        wrap.className = 'wrap';
        msg.innerHTML = '<b>' + fmt(remain) + '원</b>만 더 담으면 <b>무료배송</b> 🚚 (' +
          fmt(THRESHOLD) + '원 이상)';
        if (fill) fill.style.width = Math.max(4, Math.round(subtotal / THRESHOLD * 100)) + '%';
      }
    }

    var lastVal = null;
    function tick() {
      var v = readSubtotal();
      if (v !== lastVal) { lastVal = v; render(); }
    }

    function start() {
      render();
      // 수량 변경/삭제 시 총 상품금액이 JS로 갱신됨 → 폴링 + MutationObserver 이중 감시.
      var iv = setInterval(tick, 800);
      try {
        if (typeof MutationObserver === 'function') {
          var target = document.querySelector('.total_product_price_display_front') || document.body;
          var obs = new MutationObserver(tick);
          obs.observe(document.body, { childList: true, subtree: true, characterData: true });
        }
      } catch (e) {}
      // 초기 렌더가 늦는 스킨 대비 재시도(0~6s)
      var tries = 0;
      var rv = setInterval(function () { tries++; render(); if (tries > 20) clearInterval(rv); }, 300);
      window.addEventListener('beforeunload', function () { clearInterval(iv); });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  } catch (e) { /* 안전: 스킨 오류로 전파 금지 */ }
})();
