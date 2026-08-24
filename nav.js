"use strict";

// ヘッダーの☰メニュー（<details>）を、外側クリックで閉じる。
document.addEventListener("click", (e) => {
  document.querySelectorAll(".topbar-menu[open]").forEach((menu) => {
    if (!menu.contains(e.target)) menu.removeAttribute("open");
  });
});
